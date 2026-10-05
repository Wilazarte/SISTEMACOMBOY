// Códigos de documento: TIPO-correlativo-año (BOL-002-2026). El correlativo es GLOBAL por tipo
// (atómico en Supabase con siguiente_numero), no por trabajador ni por cliente.

export type TipoCodigo = "BOL" | "RCT" | "OC" | "GST" | "OD" | "NP";

export const generarCodigo = (tipo: TipoCodigo, corr: number, anio: number = new Date().getFullYear()): string =>
  `${tipo}-${String(corr).padStart(3, "0")}-${anio}`;

/**
 * Código a partir del número ya emitido (OC-2026-0003 → OC-003-2026, NP-0004 → NP-004-2026):
 * el correlativo es el último grupo de dígitos; el año, el del número o el de la fecha del documento.
 */
export function codigoDesdeNumero(tipo: TipoCodigo, numero: string, fecha?: string): string {
  const grupos = numero.match(/\d+/g) ?? [];
  const corr = Number(grupos[grupos.length - 1] ?? 0);
  const anioNum = grupos.slice(0, -1).find((g) => g.length === 4);
  const anio = Number(anioNum ?? (fecha ? fecha.slice(0, 4) : new Date().getFullYear()));
  return generarCodigo(tipo, corr, anio);
}

/** Estado del cuadro del PDF: EMITIDA / APROBADA / PENDIENTE (las anulaciones se muestran tal cual). */
export function estadoDocumento(estado?: string): string {
  const e = (estado ?? "").toUpperCase();
  if (/ANULAD/.test(e)) return e;
  if (/PAGAD|APROBAD|ACEPTAD|FINALIZAD|CONFORME|ENTREGAD|DESPACHADO_TOTAL|ACTIVO|COBRAD/.test(e)) return "APROBADA";
  if (/PEND|POR_PAGAR|BORRADOR|OBSERV|PREPARACION|PARCIAL|POR_COBRAR/.test(e)) return "PENDIENTE";
  return "EMITIDA";
}
