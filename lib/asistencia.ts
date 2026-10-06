// Lectura del Excel del reloj de asistencia y resumen por trabajador (DÍAS / HORAS / TARD.).
// PAGO POR DÍA: Si asistió, se le paga el día completo. Las horas son solo referenciales.

/** Asistencia del Excel: N° huella -> fecha "YYYY-MM-DD" -> marcas "HH:mm" en el orden del archivo. */
export type AsistenciaMap = Map<string, Map<string, string[]>>;

/** PAGO POR DÍA ACTIVADO: El bruto = DÍAS * sueldo diario. 9h es solo referencia para el reporte. */
export const HORAS_DIA = 9;
export const PAGO_POR_DIA = true;
/** Entrada después de esta hora = tardanza. */
export const HORA_TARDANZA = "08:20";

export interface Marcaciones {
  asistencia: AsistenciaMap;
  nombres: Map<string, string>;
  desde: string;
  hasta: string;
  marcas: number;
}

interface Marca {
  fecha: string;
  hora: string;
}

const dos = (n: number) => String(n).padStart(2, "0");

function fechaValida(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear()!== y || f.getUTCMonth()!== m - 1 || f.getUTCDate()!== d) return "";
  return `${y}-${dos(m)}-${dos(d)}`;
}

/** "2:02:10 p. m." -> "14:02:10" (siempre HH:mm:ss; sin segundos -> :00). */
export function limpiarHora(texto: string): string {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([ap])?\.?\s*m?\.?/i.exec(texto);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2]);
  const seg = Number(m[3] ?? 0);
  const ampm = m[4]?.toLowerCase();
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  if (h > 23 || min > 59 || seg > 59) return "";
  return `${dos(h)}:${dos(min)}:${dos(seg)}`;
}

function desdeSerie(v: number): Marca {
  const totalSeg = Math.round(v * 86400);
  const dias = Math.floor(totalSeg / 86400);
  const seg = totalSeg - dias * 86400;
  const f = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  return {
    fecha: v >= 1? `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}` : "",
    hora: `${dos(Math.floor(seg / 3600))}:${dos(Math.floor((seg % 3600) / 60))}:${dos(seg % 60)}`,
  };
}

export function leerMarca(v: unknown): Marca {
  if (typeof v === "number" && isFinite(v)) return desdeSerie(v);
  if (v instanceof Date &&!isNaN(v.getTime())) {
    return { fecha: `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`, hora: `${dos(v.getHours())}:${dos(v.getMinutes())}:${dos(v.getSeconds())}` };
  }
  const s = String(v?? "").trim();
  if (!s) return { fecha: "", hora: "" };
  let fecha = "";
  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  const dmy = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (iso) fecha = fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  else if (dmy) fecha = fechaValida(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  else if (/^\d+(\.\d+)?$/.test(s)) return desdeSerie(Number(s));
  return { fecha, hora: limpiarHora(iso || dmy? s.slice((iso?? dmy)!.index + (iso?? dmy)![0].length) : s) };
}

export function textoCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

const clave = (k: string) =>
  k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const COLUMNAS = {
  numero: ["n", "no", "nro", "num", "numero", "ndehuella", "nhuella", "huella", "id", "idusuario", "iddeusuario", "codigo", "acno", "noempleado"],
  nombre: ["nombre", "nombres", "name", "apellidosynombres", "nombreyapellido", "nombrecompleto", "empleado", "trabajador"],
  tiempo: ["tiempo", "fechahora", "fechayhora", "marcacion", "marca", "datetime", "checktime", "registro", "horario"],
  fecha: ["fecha", "date", "dia"],
  hora: ["hora", "time", "hour"],
  estado: ["estado", "tipo", "state", "evento", "tipomarcacion", "entradasalida", "marcaciontipo", "checktype"],
};

function columna(cabeceras: string[], tipo: keyof typeof COLUMNAS): string | undefined {
  return cabeceras.find((c) => COLUMNAS[tipo].includes(clave(c)));
}

export function leerMarcaciones(filas: Record<string, unknown>[]): Marcaciones {
  const cabeceras = [...new Set(filas.flatMap((r) => Object.keys(r)))];
  const cNum = columna(cabeceras, "numero");
  const cNom = columna(cabeceras, "nombre");
  const cTiempo = columna(cabeceras, "tiempo");
  const cFecha = columna(cabeceras, "fecha");
  const cHora = columna(cabeceras, "hora");
  const cEstado = columna(cabeceras, "estado");
  const asistencia: AsistenciaMap = new Map();
  const nombres = new Map<string, string>();
  let desde = "";
  let hasta = "";
  let marcas = 0;

  for (const r of filas) {
    const numero = String((cNum? r[cNum] : "")?? "").trim();
    if (!numero) continue;
    let m: Marca = { fecha: "", hora: "" };
    if (cTiempo) m = leerMarca(r[cTiempo]);
    if (!m.fecha && cFecha) m = {...m, fecha: leerMarca(r[cFecha]).fecha };
    if (!m.hora && cHora) m = {...m, hora: leerMarca(r[cHora]).hora };
    if (!m.fecha ||!m.hora) continue;
    if (!nombres.has(numero)) nombres.set(numero, String((cNom? r[cNom] : "")?? "").trim());
    if (!asistencia.has(numero)) asistencia.set(numero, new Map());
    const dias = asistencia.get(numero)!;
    if (!dias.has(m.fecha)) dias.set(m.fecha, []);
    const horas = dias.get(m.fecha)!;
    // Entrada / Salida del reloj (si viene): "08:14:41|E", "14:04:42|S"
    const est = clave(String((cEstado ? r[cEstado] : "") ?? ""));
    const tag = /^(ent|in|checkin|cin|e$)/.test(est) ? "|E" : /^(sal|out|checkout|cout|s$)/.test(est) ? "|S" : "";
    if (!horas.some((x) => x.slice(0, 8) === m.hora)) horas.push(m.hora + tag);
    marcas++;
    if (!desde || m.fecha < desde) desde = m.fecha;
    if (!hasta || m.fecha > hasta) hasta = m.fecha;
  }
  return { asistencia, nombres, desde, hasta, marcas };
}

const aSegundos = (h: string) => Number(h.slice(0, 2)) * 3600 + Number(h.slice(3, 5)) * 60 + Number(h.slice(6, 8) || 0);

/**
 * Horas REALES del reloj (personal por hora / medio tiempo), con segundos: por cada día, suma de los tramos
 * Entrada → Salida. Si el Excel trae la columna Estado (Entrada / Salida) se empareja por estado; si no, por
 * orden (1ª-2ª, 3ª-4ª…). Una marca sin pareja no suma. No usa la jornada ni las 9 h de referencia.
 * Ej.: 14:02:10 → 18:03:53 = 4.03 h. Se devuelve con 4 decimales (el pago usa el valor exacto).
 */
export function horasReales(fechas: Map<string, string[]>): number {
  let segundos = 0;
  fechas.forEach((marcas) => {
    const ms = marcas
      .map((x) => ({ h: limpiarHora(x), e: x.endsWith("|E") ? "E" : x.endsWith("|S") ? "S" : "" }))
      .filter((x) => x.h)
      .sort((a, b) => a.h.localeCompare(b.h));
    if (ms.length && ms.every((x) => x.e)) {
      let abierta: string | null = null;
      for (const x of ms) {
        if (x.e === "E") abierta ??= x.h;
        else if (abierta) {
          segundos += Math.max(0, aSegundos(x.h) - aSegundos(abierta));
          abierta = null;
        }
      }
    } else {
      for (let i = 0; i + 1 < ms.length; i += 2) segundos += Math.max(0, aSegundos(ms[i + 1].h) - aSegundos(ms[i].h));
    }
  });
  return Math.round((segundos / 3600) * 10000) / 10000;
}

/**
 * PAGO POR DÍA:
 * dias = cantidad de fechas con al menos 1 marca.
 * horas = dias * 9 (para reporte, no para pago). Ya no importa si hizo 8h o 9h.
 * tardanzas = si entrada > 08:20
 */
export function resumirAsistencia(fechas: Map<string, string[]>): { dias: number; horas: number; tardanzas: number } {
  let dias = 0;
  let tardanzas = 0;
  fechas.forEach((marcas) => {
    const horas = marcas.map(limpiarHora).filter(Boolean).sort();
    if (horas.length === 0) return;
    dias++;
    const entrada = horas[0].slice(0, 5); // HH:mm (08:20:59 no es tardanza)
    if (entrada > HORA_TARDANZA) tardanzas++;
  });
  return { dias, horas: dias * HORAS_DIA, tardanzas };
}

/**
 * Huellas unidas a otro trabajador (duplicados del reloj): sus marcas se suman al trabajador original.
 * `alias`: huella -> N° del trabajador que se conserva.
 */
export function aplicarAlias(m: Marcaciones, alias: Record<string, string>): Marcaciones {
  if (!Object.keys(alias).length) return m;
  const asistencia: AsistenciaMap = new Map();
  const nombres = new Map<string, string>();
  m.asistencia.forEach((fechas, huella) => {
    const id = alias[huella] ?? huella;
    const destino = asistencia.get(id) ?? new Map<string, string[]>();
    fechas.forEach((horas, fecha) => {
      const previas = destino.get(fecha) ?? [];
      destino.set(fecha, [...previas, ...horas.filter((h) => !previas.includes(h))]);
    });
    asistencia.set(id, destino);
    if (!nombres.has(id)) nombres.set(id, alias[huella] ? m.nombres.get(id) ?? "" : m.nombres.get(huella) ?? "");
  });
  return { ...m, asistencia, nombres };
}
