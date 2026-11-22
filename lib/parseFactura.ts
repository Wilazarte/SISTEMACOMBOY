/**
 * Lectura del texto de una factura / boleta peruana (salida del OCR de Tesseract o del texto de un PDF).
 * Solo extrae lo que ya usa Registrar gasto (DatosGasto): RUC del emisor, fecha de emisión, serie-número,
 * tipo de comprobante y total con IGV incluido. El IGV se lee para comprobar que el total cuadra (no se guarda aparte).
 * Funciones puras, sin dependencias: se pueden probar con node.
 */

/** RUC de la empresa (INVERSIONES GLOBAL COMPANY ROUSVID S.A.C.): en las facturas de compra aparece como cliente. */
export const RUC_EMPRESA_OCR = "20613238566";
const TASA_IGV = 0.18;

export interface FacturaLeida {
  /** RUC del emisor (11 dígitos, dígito verificador correcto, distinto del RUC de la empresa). */
  ruc?: string;
  /** Fecha de emisión en ISO (AAAA-MM-DD). */
  fecha?: string;
  /** Serie-número tal como lo pide el formulario: F001-1234. */
  numero?: string;
  /** FACTURA (serie F… / E…) o BOLETA (serie B…). */
  comprobante?: "FACTURA" | "BOLETA";
  /** Importe total del comprobante (con IGV incluido). */
  total?: number;
  igv?: number;
  /** Base imponible (op. gravada / subtotal) si figura. */
  subtotal?: number;
  /** true: el IGV leído es el 18 % del total (dentro de S/ 0.05); false: no cuadra; undefined: falta uno de los dos. */
  igvCuadra?: boolean;
}

/** Dígito verificador de SUNAT (mismo cálculo que rucValido en lib/storage.ts). */
export function rucConDigitoValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = f.reduce((a, w, i) => a + w * Number(ruc[i]), 0);
  const d = 11 - (s % 11);
  return (d === 10 ? 0 : d === 11 ? 1 : d) === Number(ruc[10]);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Confusiones típicas del OCR dentro de cifras: O→0, l/I/|→1, S→5, B→8. */
const limpiarDigitos = (s: string) => s.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/S/g, "5").replace(/B/g, "8");

/**
 * Monto escrito como 1,234.56 · 1.234,56 · 1234.56 · 1234,56 · 1 234.56 → número.
 * El último separador seguido de 2 dígitos es el decimal.
 */
export function leerMonto(txt: string): number | undefined {
  const t = txt.replace(/\s/g, "");
  const m = /^(\d{1,3}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return undefined;
  const entero = m[1].replace(/[.,]/g, "");
  const n = Number(`${entero}.${m[2] ?? "0"}`);
  return Number.isFinite(n) ? r2(n) : undefined;
}

/** Montos de una línea con decimales (ignora porcentajes como "18%" y números sin decimales). */
function montosDeLinea(linea: string): number[] {
  const sinPorc = linea.replace(/\d{1,2}(?:[.,]\d+)?\s*%/g, " ");
  const re = /(\d{1,3}(?:[.,\s]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;
  const out: number[] = [];
  for (const m of sinPorc.matchAll(re)) {
    const n = leerMonto(m[1]);
    if (n !== undefined) out.push(n);
  }
  return out;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function buscarRuc(texto: string): string | undefined {
  const candidatos: { ruc: string; pos: number; etiquetado: boolean }[] = [];
  // 11 dígitos, admitiendo espacios / guiones que mete el OCR (20 123456789, 20-12345678-9)
  const re = /(?:R\.?\s*U\.?\s*C\.?\s*(?:N[°ºo.]*)?\s*[:.]?\s*)?((?:1|2)[0-9OoIl|S -]{10,14})/g;
  for (const m of texto.matchAll(re)) {
    const dig = limpiarDigitos(m[1]).replace(/[\s-]/g, "");
    for (let i = 0; i + 11 <= dig.length; i++) {
      const ruc = dig.slice(i, i + 11);
      if (/^\d{11}$/.test(ruc) && rucConDigitoValido(ruc) && ruc !== RUC_EMPRESA_OCR) {
        candidatos.push({ ruc, pos: m.index ?? 0, etiquetado: /R\.?\s*U\.?\s*C/i.test(m[0]) });
        break;
      }
    }
  }
  if (!candidatos.length) return undefined;
  // El RUC del emisor va en la cabecera: el primero etiquetado "RUC"; si no, el primero que aparezca
  return (candidatos.find((c) => c.etiquetado) ?? candidatos[0]).ruc;
}

function fechaValida(d: number, m: number, y: number): string | undefined {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100) return undefined;
  const f = new Date(y, m - 1, d);
  if (f.getFullYear() !== y || f.getMonth() !== m - 1 || f.getDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MESES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
};

function fechasDeLinea(linea: string): string[] {
  const out: string[] = [];
  for (const m of linea.matchAll(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/g)) {
    const f = fechaValida(+m[1], +m[2], +m[3]);
    if (f) out.push(f);
  }
  for (const m of linea.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const f = fechaValida(+m[3], +m[2], +m[1]);
    if (f) out.push(f);
  }
  // 05 de noviembre de 2026 / 05-NOV-2026
  for (const m of sinTildes(linea).toUpperCase().matchAll(/\b(\d{1,2})\s*(?:DE\s+|[-/ ])\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*\.?\s*(?:DE(?:L)?\s+|[-/ ])\s*(\d{4})\b/g)) {
    const f = fechaValida(+m[1], MESES[m[2]], +m[3]);
    if (f) out.push(f);
  }
  return out;
}

/** Fecha de emisión: la de la línea "Fecha de emisión"; si no, la primera fecha no futura (no la de vencimiento). */
function buscarFecha(lineas: string[], hoyISO: string): string | undefined {
  const ok = (f: string) => f <= hoyISO;
  for (let i = 0; i < lineas.length; i++) {
    if (/EMISI[OÓ0]N/i.test(lineas[i])) {
      const f = [...fechasDeLinea(lineas[i]), ...fechasDeLinea(lineas[i + 1] ?? "")].find(ok);
      if (f) return f;
    }
  }
  for (const l of lineas) {
    if (/VENC/i.test(l)) continue;
    const f = fechasDeLinea(l).find(ok);
    if (f) return f;
  }
  return undefined;
}

/** Serie-número: F001-00001234, FOO1 - 1234, E001 N° 56, B002-789 → "F001-1234". */
function buscarNumero(texto: string): { numero: string; comprobante: "FACTURA" | "BOLETA" } | undefined {
  const re = /\b([FBE][0-9OoIl|A-Z]{3})\s*(?:[-–—~_]|N[°ºo.]?)\s*([0-9OoIl|]{1,8})\b/g;
  for (const m of texto.matchAll(re)) {
    // En la serie, después de la letra, el OCR suele leer 0 como O (FOO1)
    const serie = m[1][0] + m[1].slice(1).toUpperCase().replace(/O/g, "0").replace(/[IL|]/g, "1");
    if (!/^[FBE][A-Z0-9]{3}$/.test(serie) || !/\d/.test(serie.slice(1))) continue;
    const correl = limpiarDigitos(m[2]);
    if (!/^\d{1,8}$/.test(correl) || !Number(correl)) continue;
    return { numero: `${serie}-${Number(correl)}`, comprobante: serie[0] === "B" ? "BOLETA" : "FACTURA" };
  }
  return undefined;
}

/** Total con IGV: "IMPORTE TOTAL" / "TOTAL A PAGAR" / "TOTAL" (no subtotal, ni total gravado / descuento). */
function buscarTotales(lineas: string[]): Pick<FacturaLeida, "total" | "igv" | "subtotal"> {
  let total: number | undefined;
  let totalFuerte: number | undefined;
  let igv: number | undefined;
  let subtotal: number | undefined;
  lineas.forEach((original, i) => {
    const l = sinTildes(original).toUpperCase();
    const montos = montosDeLinea(original);
    // Etiqueta en una línea y monto en la siguiente (pasa con tablas de 2 columnas)
    const monto = montos.length ? montos[montos.length - 1] : montosDeLinea(lineas[i + 1] ?? "").at(-1);
    if (monto === undefined) return;
    if (/(^|[^A-Z0-9])[I1L|]\.?\s*G\.?\s*V\b/.test(l) && !/TOTAL\s+(A\s+PAGAR|VENTA)/.test(l)) {
      igv ??= monto;
      return;
    }
    if (/(SUB\s*-?\s*TOTAL|OP(\.|ERACION)?\s*GRAVADA|VALOR\s+(DE\s+)?VENTA|BASE\s+IMPONIBLE)/.test(l)) {
      subtotal ??= monto;
      return;
    }
    if (/TOTAL/.test(l) && !/(DESCUENTO|ANTICIPO|GRATUITA|EXONERAD|INAFECT|ITEMS|CANTIDAD|PESO|DETRACC|RETENC|PERCEPC)/.test(l)) {
      if (/(IMPORTE\s+TOTAL|TOTAL\s+A\s+PAGAR|TOTAL\s+VENTA|PRECIO\s+TOTAL|TOTAL\s*(S\/|SOLES|PEN))/.test(l)) totalFuerte ??= monto;
      total = Math.max(total ?? 0, monto);
    }
  });
  return { total: totalFuerte ?? total, igv, subtotal };
}

/** Lee el texto de una factura / boleta. `hoyISO` (AAAA-MM-DD, hora de Lima) descarta fechas futuras. */
export function parseFactura(texto: string, hoyISO = new Date().toISOString().slice(0, 10)): FacturaLeida {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const r: FacturaLeida = {};
  r.ruc = buscarRuc(texto);
  r.fecha = buscarFecha(lineas, hoyISO);
  const num = buscarNumero(texto);
  if (num) Object.assign(r, num);
  const { total, igv, subtotal } = buscarTotales(lineas);
  r.igv = igv;
  r.subtotal = subtotal;
  r.total = total;
  // Sin línea TOTAL pero con base + IGV: total = base + IGV
  if (r.total === undefined && subtotal !== undefined && igv !== undefined) r.total = r2(subtotal + igv);
  if (r.total !== undefined && r.igv !== undefined) {
    const esperado = r2(r.total - r.total / (1 + TASA_IGV));
    r.igvCuadra = Math.abs(esperado - r.igv) <= 0.05;
  }
  // Una boleta no desglosa IGV: no se marca descuadre
  if (r.comprobante === "BOLETA" && r.igv === undefined) r.igvCuadra = undefined;
  return r;
}
