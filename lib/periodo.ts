// Periodo de planilla a partir de las fechas del reloj (semana ISO, lunes a domingo).

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** Semana ISO de una fecha YYYY-MM-DD: 05/10/2026 -> 41 (la semana 1 es la del primer jueves del año). */
export function semanaISO(fecha: string): { semana: number; anio: number } {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dia = t.getUTCDay() || 7; // lunes = 1 … domingo = 7
  t.setUTCDate(t.getUTCDate() + 4 - dia); // jueves de esa semana
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { semana: Math.ceil(((t.getTime() - inicio.getTime()) / 86400000 + 1) / 7), anio: t.getUTCFullYear() };
}

/** Periodo desde la primera fecha del reloj: 05/10/2026 -> "SEMANA 41 - OCTUBRE 2026". */
export function periodoDeFecha(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "";
  const { semana } = semanaISO(fecha);
  const [y, m] = fecha.split("-").map(Number);
  return `SEMANA ${semana} - ${MESES[m - 1]} ${y}`;
}

// ---- Pago MENSUAL (ficha del trabajador: frecuencia de pago) ----

/** Periodo del mes de una fecha: 19/10/2026 -> "MENSUAL - OCTUBRE 2026". */
export function periodoMensualDeFecha(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "";
  const [y, m] = fecha.split("-").map(Number);
  return `MENSUAL - ${MESES[m - 1]} ${y}`;
}

/** "MENSUAL - OCTUBRE 2026" (planilla del mes) frente a "SEMANA 44 - OCTUBRE 2026". */
export const esPeriodoMensual = (periodo: string): boolean => /^\s*MENSUAL\b/i.test(periodo);

/** Primer y último día del mes de un periodo mensual ("MENSUAL - OCTUBRE 2026" -> 2026-10-01 … 2026-10-31). */
export function rangoPeriodoMensual(periodo: string): { desde: string; hasta: string } | null {
  const m = /^\s*MENSUAL\s*-\s*([A-ZÁÉÍÓÚ]+)\s+(\d{4})/i.exec(periodo);
  if (!m) return null;
  const mes = MESES.indexOf(m[1].toUpperCase().replace("SEPTIEMBRE", "SETIEMBRE")) + 1;
  if (mes < 1) return null;
  const y = Number(m[2]);
  const ultimo = new Date(Date.UTC(y, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
}
