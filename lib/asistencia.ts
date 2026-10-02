// Lectura del Excel del reloj de asistencia y resumen por trabajador (DÍAS / HORAS / TARD.).
// Sin dependencias de React ni de Supabase: el importador de Planilla le pasa las filas del Excel.

/** Asistencia del Excel: N° huella -> fecha "YYYY-MM-DD" -> marcas "HH:mm" en el orden del archivo. */
export type AsistenciaMap = Map<string, Map<string, string[]>>;

/** 1 día de trabajo = 9 horas (valor hora = sueldo diario / 9). */
export const HORAS_DIA = 9;
/** Entrada después de esta hora = tardanza. */
export const HORA_TARDANZA = "08:20";

export interface Marcaciones {
  asistencia: AsistenciaMap;
  nombres: Map<string, string>;
  desde: string; // primera fecha del archivo (YYYY-MM-DD)
  hasta: string; // última fecha del archivo
  marcas: number;
}

/** Fecha y hora de una celda: número de serie de Excel, Date o texto "DD/MM/YYYY HH:mm:ss". */
interface Marca {
  fecha: string;
  hora: string;
}

const dos = (n: number) => String(n).padStart(2, "0");

function fechaValida(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return "";
  return `${y}-${dos(m)}-${dos(d)}`;
}

/** "14:00:18" / "8:05" / "2:00 p. m." -> "14:00" / "08:05" / "14:00" (sin segundos). */
export function limpiarHora(texto: string): string {
  const m = /(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([ap])?\.?\s*m?\.?/i.exec(texto);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return "";
  return `${dos(h)}:${dos(min)}`;
}

/** Número de serie de Excel (días desde 1899-12-30; la fracción es la hora). */
function desdeSerie(v: number): Marca {
  const totalMin = Math.floor(Math.round(v * 86400) / 60); // se trunca a minutos (descarta segundos)
  const dias = Math.floor(totalMin / 1440);
  const min = totalMin - dias * 1440;
  const f = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  return {
    fecha: v >= 1 ? `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}` : "",
    hora: `${dos(Math.floor(min / 60))}:${dos(min % 60)}`,
  };
}

/** Interpreta fecha y/o hora. Las fechas con "/" se leen siempre como DD/MM/YYYY (Perú). */
export function leerMarca(v: unknown): Marca {
  if (typeof v === "number" && isFinite(v)) return desdeSerie(v);
  if (v instanceof Date && !isNaN(v.getTime())) {
    return { fecha: `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`, hora: `${dos(v.getHours())}:${dos(v.getMinutes())}` };
  }
  const s = String(v ?? "").trim();
  if (!s) return { fecha: "", hora: "" };
  let fecha = "";
  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  const dmy = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (iso) fecha = fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  else if (dmy) fecha = fechaValida(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  else if (/^\d+(\.\d+)?$/.test(s)) return desdeSerie(Number(s)); // serie guardada como texto
  return { fecha, hora: limpiarHora(iso || dmy ? s.slice((iso ?? dmy)!.index + (iso ?? dmy)![0].length) : s) };
}

/** CSV del reloj: UTF-8 (con o sin BOM) o Windows-1252 (CSV guardado desde Excel en Windows). */
export function textoCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** "N°" -> "n", "Fecha/Hora" -> "fechahora", "Número" -> "numero" */
const clave = (k: string) =>
  k
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const COLUMNAS = {
  numero: ["n", "no", "nro", "num", "numero", "ndehuella", "nhuella", "huella", "id", "idusuario", "iddeusuario", "codigo", "acno", "noempleado"],
  nombre: ["nombre", "nombres", "name", "apellidosynombres", "nombreyapellido", "nombrecompleto", "empleado", "trabajador"],
  tiempo: ["tiempo", "fechahora", "fechayhora", "marcacion", "marca", "datetime", "checktime", "registro", "horario"],
  fecha: ["fecha", "date", "dia"],
  hora: ["hora", "time", "hour"],
};

function columna(cabeceras: string[], tipo: keyof typeof COLUMNAS): string | undefined {
  return cabeceras.find((c) => COLUMNAS[tipo].includes(clave(c)));
}

/**
 * Agrupa las filas del reloj por trabajador y por fecha. Lee TODO el archivo (no filtra por periodo).
 * Columnas: N° | Nombre | Tiempo ("DD/MM/YYYY HH:mm:ss"), o Fecha y Hora por separado.
 */
export function leerMarcaciones(filas: Record<string, unknown>[]): Marcaciones {
  const cabeceras = [...new Set(filas.flatMap((r) => Object.keys(r)))];
  const cNum = columna(cabeceras, "numero");
  const cNom = columna(cabeceras, "nombre");
  const cTiempo = columna(cabeceras, "tiempo");
  const cFecha = columna(cabeceras, "fecha");
  const cHora = columna(cabeceras, "hora");
  const asistencia: AsistenciaMap = new Map();
  const nombres = new Map<string, string>();
  let desde = "";
  let hasta = "";
  let marcas = 0;

  for (const r of filas) {
    const numero = String((cNum ? r[cNum] : "") ?? "").trim();
    if (!numero) continue;
    let m: Marca = { fecha: "", hora: "" };
    if (cTiempo) m = leerMarca(r[cTiempo]);
    if (!m.fecha && cFecha) m = { ...m, fecha: leerMarca(r[cFecha]).fecha };
    if (!m.hora && cHora) m = { ...m, hora: leerMarca(r[cHora]).hora };
    if (!m.fecha || !m.hora) continue;

    if (!nombres.has(numero)) nombres.set(numero, String((cNom ? r[cNom] : "") ?? "").trim());
    if (!asistencia.has(numero)) asistencia.set(numero, new Map());
    const dias = asistencia.get(numero)!;
    if (!dias.has(m.fecha)) dias.set(m.fecha, []);
    const horas = dias.get(m.fecha)!;
    if (!horas.includes(m.hora)) horas.push(m.hora); // misma marca repetida en el reloj
    marcas++;
    if (!desde || m.fecha < desde) desde = m.fecha;
    if (!hasta || m.fecha > hasta) hasta = m.fecha;
  }
  return { asistencia, nombres, desde, hasta, marcas };
}

const aMinutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * Por cada fecha: 2+ marcas -> horas = salida (última) - entrada (primera), +24 h si cruza la medianoche;
 * 1 sola marca -> 9 h. Tardanza si la entrada es después de las 08:20.
 */
export function resumirAsistencia(fechas: Map<string, string[]>): { dias: number; horas: number; tardanzas: number } {
  let dias = 0;
  let minutos = 0;
  let tardanzas = 0;
  fechas.forEach((marcas) => {
    const horas = marcas.map(limpiarHora).filter(Boolean).sort(); // algunos relojes exportan en orden inverso
    if (horas.length === 0) return;
    dias++;
    const entrada = horas[0];
    if (entrada > HORA_TARDANZA) tardanzas++;
    if (horas.length === 1) {
      minutos += HORAS_DIA * 60;
      return;
    }
    let diff = aMinutos(horas[horas.length - 1]) - aMinutos(entrada);
    if (diff < 0) diff += 24 * 60;
    minutos += diff;
  });
  return { dias, horas: Math.round((minutos / 60) * 100) / 100, tardanzas };
}
