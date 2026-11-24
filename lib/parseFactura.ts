/**
 * Lectura del texto de una factura / boleta peruana (salida del OCR de Tesseract o del texto de un PDF).
 * Solo extrae lo que ya usa Registrar gasto (DatosGasto): RUC del emisor, fecha de emisión, serie-número,
 * tipo de comprobante y total con IGV incluido. El IGV se lee para comprobar que el total cuadra (no se guarda aparte).
 * Funciones puras, sin dependencias: se pueden probar con node.
 */

/** RUC de la empresa (INVERSIONES GLOBAL COMPANY ROUSVID S.A.C.): en las facturas de compra aparece como cliente. */
export const RUC_EMPRESA_OCR = "20613238566";
const TASA_IGV = 0.18;

/** Una línea de detalle del comprobante (artículo o servicio). */
export interface ItemLeido {
  cantidad: number;
  /** Unidad de la lista del ERP (UNIDADES de lib/empresa.ts): NIU → UND, KGM → KG… */
  unidad: string;
  descripcion: string;
  /** Precio / valor unitario tal como figura en el comprobante. */
  precioUnit: number;
  /** Importe de la línea tal como figura. */
  importe: number;
}

export interface FacturaLeida {
  /** RUC del emisor (11 dígitos, dígito verificador correcto, distinto del RUC de la empresa). */
  ruc?: string;
  /** Fecha de emisión en ISO (AAAA-MM-DD). */
  fecha?: string;
  /** Serie-número tal como lo pide el formulario: F001-1234. */
  numero?: string;
  /** FACTURA (serie F… / E…) o BOLETA (serie B…). */
  comprobante?: "FACTURA" | "BOLETA" | "RXH" | "LIQUIDACION_COMPRA";
  /** Comprobante electrónico reconocido; undefined: no es un comprobante electrónico (no se escanea). */
  tipoElectronico?: TipoElectronico;
  /** Nota de crédito / débito: comprobante que modifica (F001-1234). */
  referencia?: string;
  /** Importe total del comprobante (con IGV incluido). */
  total?: number;
  igv?: number;
  /** Base imponible (op. gravada / subtotal) si figura. */
  subtotal?: number;
  /** Moneda del comprobante: USD si dice DÓLAR / US$ / $ (el importe del gasto en el ERP es en soles). */
  moneda?: "PEN" | "USD";
  /** Detalle: cantidad, descripción, precio unitario e importe de cada artículo. */
  items?: ItemLeido[];
  /**
   * true: los importes de las líneas suman el total (precios con IGV incluido); false: suman la base (op. gravada),
   * hay que sumarles el IGV; undefined: no se pudo saber.
   */
  itemsConIgv?: boolean;
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
/** Todas las series-número del texto en orden (F001-1234, B002-5, E001-77, T001-9, EG01-3, V001-8…). */
function seriesDelTexto(texto: string): string[] {
  const re = /\b([FBETV][0-9OoIl|A-Z]{3})\s*(?:[-–—~_]|N[°ºo.]?)\s*([0-9OoIl|]{1,8})\b/g;
  const out: string[] = [];
  for (const m of texto.matchAll(re)) {
    // En la serie, después de la letra, el OCR suele leer 0 como O (FOO1)
    const serie = m[1][0] + m[1].slice(1).toUpperCase().replace(/O/g, "0").replace(/[IL|]/g, "1");
    if (!/^[FBETV][A-Z0-9]{3}$/.test(serie) || !/\d/.test(serie.slice(1))) continue;
    const correl = limpiarDigitos(m[2]);
    if (!/^\d{1,8}$/.test(correl) || !Number(correl)) continue;
    const n = `${serie}-${Number(correl)}`;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** Comprobantes electrónicos que se escanean (SUNAT). */
export type TipoElectronico = "FACTURA" | "BOLETA" | "RHE" | "LIQUIDACION" | "GUIA" | "NOTA_CREDITO" | "NOTA_DEBITO";

export const NOMBRE_ELECTRONICO: Record<TipoElectronico, string> = {
  FACTURA: "Factura electrónica",
  BOLETA: "Boleta de venta electrónica",
  RHE: "Recibo por honorarios electrónico",
  LIQUIDACION: "Liquidación de compra electrónica",
  GUIA: "Guía de remisión electrónica",
  NOTA_CREDITO: "Nota de crédito electrónica",
  NOTA_DEBITO: "Nota de débito electrónica",
};

/** Tipo de comprobante electrónico por su título (o, si no se lee, por la letra de la serie). */
function tipoElectronico(t: string, serie?: string): TipoElectronico | undefined {
  if (/NOTA\s+DE\s+CREDITO/.test(t)) return "NOTA_CREDITO";
  if (/NOTA\s+DE\s+DEBITO/.test(t)) return "NOTA_DEBITO";
  if (/GUIA\s+(DE\s+)?REMISION/.test(t)) return "GUIA";
  if (/RECIBO\s+POR\s+HONORARIOS|HONORARIOS\s+ELECTRONICO/.test(t)) return "RHE";
  if (/LIQUIDACION\s+DE\s+COMPRA/.test(t)) return "LIQUIDACION";
  if (/BOLETA\s+(DE\s+VENTA|ELECTRONICA)/.test(t)) return "BOLETA";
  if (/FACTURA/.test(t)) return "FACTURA";
  // Sin título legible: la serie electrónica lo dice (F… factura, B… boleta, T… / EG… / V… guía)
  const s = serie ?? "";
  if (/^F/.test(s)) return "FACTURA";
  if (/^B/.test(s)) return "BOLETA";
  if (/^(T|EG|V)/.test(s)) return "GUIA";
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
    // "I.G.V. 18%" (el OCR a veces lo lee "1.6.7. 18%": basta el 18 % con monto)
    if ((/(^|[^A-Z0-9])[I1L|]\.?\s*[G6]\.?\s*[VY]\b/.test(l) || /(^|\D)18\s*%/.test(l)) && !/(TOTAL\s+(A\s+PAGAR|VENTA)|IMPORTE\s+TOTAL)/.test(l)) {
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

/** Unidades del comprobante (catálogo SUNAT y abreviaturas) → lista del ERP. */
const UNIDAD_ERP: Record<string, string> = {
  UND: "UND", UNID: "UND", UNIDAD: "UND", UNIDADES: "UND", UN: "UND", U: "UND", NIU: "UND", ZZ: "UND", UNI: "UND",
  PZA: "PZA", PZ: "PZA", PIEZA: "PZA", KG: "KG", KGM: "KG", KGS: "KG", KILO: "KG", M: "M", MT: "M", MTR: "M", MTS: "M",
  M2: "M2", MTK: "M2", M3: "M3", MTQ: "M3", GLN: "GLN", GL: "GLN", GALON: "GLN", LT: "LT", LTR: "LT", L: "LT", LTS: "LT",
  CAJA: "CAJA", CJA: "CAJA", BX: "CAJA", PAR: "PAR", PR: "PAR", JGO: "JGO", JUEGO: "JGO", SET: "JGO", ROLLO: "ROLLO", RLL: "ROLLO",
  BOLSA: "BOLSA", BG: "BOLSA", BLS: "BOLSA",
};

/** Número de una celda (cantidad o monto): 1,234.56 · 1.234,56 · 12.5 · 3 */
function numeroCelda(tok: string): number | undefined {
  const t = limpiarDigitos(tok.replace(/^S\/\.?/i, ""));
  if (!/^\d[\d.,]*$/.test(t)) return undefined;
  const m = leerMonto(t);
  if (m !== undefined) return m;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

const cuadra = (a: number, b: number, c: number) => Math.abs(a * b - c) <= Math.max(0.05, c * 0.01);

/** Fin del detalle: subtotales, IGV, total, "SON: …". */
const FIN_DETALLE = /(SUB\s*-?\s*TOTAL|OP(\.|ERACION)?\s*GRAVADA|VALOR\s+(DE\s+)?VENTA|\bTOTAL\b|(^|[^A-Z0-9])[I1L|]\.?\s*[G6]\.?\s*[VY]\b|(^|\D)18\s*%|^SON\s*:|IMPORTE\s+EN\s+LETRAS)/;
/** Líneas de cabecera que no son artículos. */
const NO_ITEM = /(R\.?\s*U\.?\s*C|FECHA|SE[NÑ]OR|CLIENTE|DIRECCI|TELEF|CORREO|EMAIL|VENDEDOR|CAJERO|TICKET|FACTURA|BOLETA|MONEDA|GUIA|ORDEN|PEDIDO|CONDICI|RETENC|PERCEPC|DETRACC|REDONDEO|ANTICIPO|DESCUENTO|NETO\s+(RECIBIDO|A\s+PAGAR))/;

/** Una línea de detalle: [código] cantidad [unidad] descripción [cantidad] p.unit importe. */
/** Columnas numéricas de la tabla de detalle, a la derecha de la descripción (según la cabecera). */
type Columna = "UNIT" | "IMPORTE" | "OTRO";

function columnasDeCabecera(cabecera: string): Columna[] {
  const c = sinTildes(cabecera).toUpperCase();
  const desde = Math.max(0, c.search(/DESCRIPCI|DETALLE|CONCEPTO/));
  const marcas: { pos: number; col: Columna }[] = [];
  const buscar = (re: RegExp, col: Columna) => {
    for (const m of c.slice(desde).matchAll(re)) marcas.push({ pos: (m.index ?? 0) + desde, col });
  };
  buscar(/(V(ALOR)?\.?\s*UNIT|P(RECIO)?\.?\s*UNIT|P\.?\s*\/\s*U\b|\bPU\b|PUNIT|COSTO\s+UNIT)/g, "UNIT");
  buscar(/(IMPORTE|P(RECIO)?\.?\s*TOTAL|SUB\s*TOTAL|VALOR\s+(DE\s+)?VENTA|\bMONTO\b|\bTOTAL\b)/g, "IMPORTE");
  buscar(/(ICBPER|DSCTO|DESCUENTO|\bIGV\b|\bISC\b)/g, "OTRO");
  return marcas.sort((a, b) => a.pos - b.pos).map((m) => m.col);
}

/** Inicio de la línea: [código] cantidad [unidad] descripción. */
function inicioItem(tokens: string[]): { cantidad?: number; unidad: string; descripcion: string } | undefined {
  let cantidad: number | undefined;
  let unidad = "UND";
  const cab = [...tokens];
  for (let i = 0; i < Math.min(2, cab.length - 1); i++) {
    const n = numeroCelda(cab[i]);
    if (n !== undefined && n > 0 && n < 100000 && !/^0\d/.test(cab[i])) {
      cantidad = n;
      cab.splice(0, i + 1);
      break;
    }
  }
  const u = sinTildes(cab[0] ?? "").toUpperCase().replace(/\.$/, "");
  if (cab.length > 1 && UNIDAD_ERP[u]) {
    unidad = UNIDAD_ERP[u];
    cab.shift();
  }
  const descripcion = cab.join(" ").replace(/^[-–—:|]+\s*/, "").trim();
  if ((descripcion.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) ?? []).length < 3 || FIN_DETALLE.test(sinTildes(descripcion).toUpperCase())) return undefined;
  return { cantidad, unidad, descripcion: descripcion.toUpperCase() };
}

function leerItem(linea: string, columnas: Columna[] = []): ItemLeido | undefined {
  const tokens = linea.replace(/[^\wÁÉÍÓÚÑáéíóúñ.,/%()\-]+$/g, "").split(/\s+/).filter(Boolean);
  // Con la cabecera conocida (ej. "Valor Unitario | ICBPER"): cada número de la derecha va a su columna
  if (columnas.length && columnas.some((c) => c !== "OTRO")) {
    const crudos = tokens.slice(-columnas.length);
    const valores = crudos.map(numeroCelda);
    if (crudos.length === columnas.length && valores.every((v) => v !== undefined) && /[.,]\d{2}$/.test(crudos[crudos.length - 1])) {
      const ini = inicioItem(tokens.slice(0, -columnas.length));
      const unit = valores[columnas.indexOf("UNIT")];
      const imp = valores[columnas.indexOf("IMPORTE")];
      if (ini) {
        const cantidad = ini.cantidad ?? (unit && imp ? r2(imp / unit) : 1);
        const precioUnit = unit ?? r2((imp as number) / cantidad);
        const importe = imp ?? r2(cantidad * precioUnit);
        if (importe > 0) return { cantidad, unidad: ini.unidad, descripcion: ini.descripcion, precioUnit, importe };
      }
    }
  }
  // Montos al final de la línea (hasta 3: cantidad, p. unit, importe)
  const nums: number[] = [];
  const crudos: string[] = [];
  while (tokens.length && nums.length < 3) {
    const n = numeroCelda(tokens[tokens.length - 1]);
    if (n === undefined) break;
    nums.unshift(n);
    crudos.unshift(tokens.pop()!);
  }
  // Tres números que no son cantidad × precio = importe: el primero es parte de la descripción ("MIG 1.0 12.50 125.00")
  if (nums.length === 3 && !cuadra(nums[0], nums[1], nums[2])) {
    nums.shift();
    tokens.push(crudos.shift()!);
  }
  const ultimo = linea.trim().split(/\s+/).filter((t) => numeroCelda(t) !== undefined).pop() ?? "";
  if (!nums.length || !/[.,]\d{2}$/.test(ultimo)) return undefined; // el importe lleva 2 decimales
  // Cantidad y unidad al inicio (puede haber un código de producto antes)
  const ini = inicioItem(tokens);
  if (!ini) return undefined;
  let cantidad = ini.cantidad;
  const { unidad, descripcion } = ini;
  let precioUnit: number;
  let importe: number;
  if (nums.length === 3 && cuadra(nums[0], nums[1], nums[2])) {
    [cantidad, precioUnit, importe] = nums;
  } else if (nums.length >= 2) {
    [precioUnit, importe] = nums.slice(-2);
    if (cantidad === undefined || !cuadra(cantidad, precioUnit, importe)) {
      const c = precioUnit > 0 ? importe / precioUnit : 0;
      cantidad = c > 0 && Math.abs(c - Math.round(c * 100) / 100) < 0.01 ? r2(c) : cantidad ?? 1;
    }
  } else {
    importe = nums[0];
    cantidad ??= 1;
    precioUnit = r2(importe / cantidad);
  }
  if (!(importe > 0)) return undefined;
  return { cantidad: cantidad ?? 1, unidad, descripcion, precioUnit, importe };
}

/**
 * Detalle del comprobante: desde la cabecera "CANT / DESCRIPCIÓN" hasta el primer subtotal / total.
 * El texto puede traer dos lecturas del OCR seguidas: se prueba cada cabecera y vale la primera que dé artículos.
 */
function buscarItems(lineas: string[]): ItemLeido[] {
  const may = lineas.map((l) => sinTildes(l).toUpperCase());
  const cabeceras = may.flatMap((l, i) => (/DESCRIPCI|CANT\b|CANT\.|DETALLE|CONCEPTO/.test(l) && !FIN_DETALLE.test(l) ? [i] : []));
  for (const ini of cabeceras.length ? cabeceras : [-1]) {
    const items: ItemLeido[] = [];
    const columnas = ini >= 0 ? columnasDeCabecera(lineas[ini]) : [];
    let continuaciones = 0;
    for (let i = ini + 1; i < lineas.length; i++) {
      if (FIN_DETALLE.test(may[i])) {
        if (items.length || ini >= 0) break;
        continue;
      }
      if (NO_ITEM.test(may[i])) continue;
      const it = leerItem(lineas[i], columnas);
      if (it) {
        items.push(it);
        continuaciones = 0;
      } else if (items.length && continuaciones < 3 && !montosDeLinea(lineas[i]).length && /[A-Za-z]{2}/.test(lineas[i])) {
        // Descripción en dos o más renglones ("HOJA SIERRA CINTA … / 10/14 DPP RONTGEN")
        const ult = items[items.length - 1];
        ult.descripcion = `${ult.descripcion} ${lineas[i].trim().toUpperCase()}`.slice(0, 250);
        continuaciones++;
      }
    }
    if (items.length) return items;
  }
  return [];
}

/** Palabras del OCR con su recuadro → texto por renglones (une las celdas de una tabla con bordes en una línea). */
export function renglonesDePalabras(palabras: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[]): string {
  const ps = palabras.filter((w) => w.text.trim()).map((w) => ({ t: w.text.trim(), x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, h: Math.max(1, w.bbox.y1 - w.bbox.y0) }));
  ps.sort((a, b) => a.y - b.y);
  const filas: { y: number; h: number; ps: typeof ps }[] = [];
  for (const p of ps) {
    const f = filas[filas.length - 1];
    if (f && Math.abs(p.y - f.y) <= Math.max(f.h, p.h) * 0.6) {
      f.ps.push(p);
      f.y = (f.y * (f.ps.length - 1) + p.y) / f.ps.length;
    } else filas.push({ y: p.y, h: p.h, ps: [p] });
  }
  return filas.map((f) => f.ps.sort((a, b) => a.x - b.x).map((p) => p.t).join(" ")).join("\n");
}

/** Lee el texto de una factura / boleta. `hoyISO` (AAAA-MM-DD, hora de Lima) descarta fechas futuras. */
export function parseFactura(texto: string, hoyISO = new Date().toISOString().slice(0, 10)): FacturaLeida {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const r: FacturaLeida = {};
  r.ruc = buscarRuc(texto);
  r.fecha = buscarFecha(lineas, hoyISO);
  const t0 = sinTildes(texto).toUpperCase();
  const series = seriesDelTexto(texto);
  const tipo = tipoElectronico(t0, series[0]);
  // Electrónico: lo dice el título ("… ELECTRÓNICA", "representación impresa") o lleva serie electrónica
  const electronico = /ELECTRONIC|REPRESENTACION\s+IMPRESA|SUNAT/.test(t0) || series.length > 0;
  if (tipo && electronico) {
    r.tipoElectronico = tipo;
    // N° propio: la primera serie que corresponde al tipo (en una NC, la de la factura que modifica va después)
    const propia = series.find((n) => (tipo === "GUIA" ? /^(T|EG|V)/.test(n) : tipo === "BOLETA" ? /^B/.test(n) : tipo === "RHE" || tipo === "LIQUIDACION" ? /^E/.test(n) : /^[FBE]/.test(n))) ?? series[0];
    if (propia) r.numero = propia;
    if (tipo === "NOTA_CREDITO" || tipo === "NOTA_DEBITO") r.referencia = series.find((n) => n !== propia);
    const comp = { FACTURA: "FACTURA", BOLETA: "BOLETA", RHE: "RXH", LIQUIDACION: "LIQUIDACION_COMPRA" } as const;
    if (tipo in comp) r.comprobante = comp[tipo as keyof typeof comp];
  }
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
  const t = sinTildes(texto).toUpperCase();
  r.moneda = /DOLAR|US\s*\$|\bUSD\b/.test(t) || (/\$\s*\d/.test(t) && !/S\/\s*\d|\bSOLES\b/.test(t)) ? "USD" : "PEN";
  let items = buscarItems(lineas);
  // Recibo por honorarios: un solo servicio, "Por concepto de: …" por el total (no lleva IGV)
  if (r.tipoElectronico === "RHE" && r.total) {
    const concepto = /POR\s+CONCEPTO\s+DE\s*:?\s*(.+)/i.exec(sinTildes(texto))?.[1]?.trim();
    if (concepto) items = [{ cantidad: 1, unidad: "UND", descripcion: concepto.toUpperCase().slice(0, 250), precioUnit: r.total, importe: r.total }];
  }
  if (items.length) {
    r.items = items;
    const suma = r2(items.reduce((a, i) => a + i.importe, 0));
    const cerca = (x?: number) => x !== undefined && Math.abs(suma - x) <= Math.max(0.1, x * 0.005);
    r.itemsConIgv = cerca(r.total) ? true : cerca(r.subtotal) ? false : r.comprobante === "BOLETA" ? true : undefined;
    if (r.total === undefined && r.itemsConIgv !== false && r.comprobante === "BOLETA") r.total = suma;
  }
  // Una boleta no desglosa IGV: no se marca descuadre
  if (r.comprobante === "BOLETA" && r.igv === undefined) r.igvCuadra = undefined;
  return r;
}

/**
 * Lista de productos sin precios (pedido escrito, lista de materiales) para el REQ de Almacén:
 * cada renglón que empieza con una cantidad ("4 UND PERNOS 1/2 X 2", "2 GALONES DE PINTURA") es un artículo.
 * Solo se usa cuando parseFactura no encontró artículos con precio.
 */
export function itemsDeLista(texto: string): ItemLeido[] {
  const items: ItemLeido[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const tokens = linea.trim().replace(/^[-•*·]+\s*/, "").split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const it = inicioItem(tokens);
    if (!it?.cantidad) continue;
    items.push({ cantidad: it.cantidad, unidad: it.unidad, descripcion: it.descripcion.slice(0, 250), precioUnit: 0, importe: 0 });
  }
  return items;
}

/** N° de una cotización o proforma: "COTIZACIÓN N° 000123", "PROFORMA Nro: P-45". */
export function numeroCotizacion(texto: string): string | undefined {
  const m = sinTildes(texto).match(/(?:COTIZACION|PROFORMA|PRESUPUESTO)\s*(?:N\s*[°ºo.]?|NRO\.?|NUMERO|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,24})/i);
  const n = m?.[1]?.toUpperCase();
  return n && /\d/.test(n) ? n : undefined;
}

/** Parecido entre dos nombres de producto (0 a 1): palabras en común sobre las del nombre más corto. */
export function parecidoNombre(a: string, b: string): number {
  const pal = (s: string) => new Set(sinTildes(s).toUpperCase().split(/[^A-Z0-9/]+/).filter((w) => w.length > 1));
  const x = pal(a);
  const y = pal(b);
  if (!x.size || !y.size) return 0;
  let comun = 0;
  x.forEach((w) => y.has(w) && comun++);
  return comun / Math.min(x.size, y.size);
}
