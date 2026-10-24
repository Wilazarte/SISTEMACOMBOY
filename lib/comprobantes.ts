import type { ComprobanteGasto } from "./types";

/**
 * Tipos de comprobante de "Registrar gasto / compra": la misma lista para el gasto sin stock y la compra con
 * ingreso a stock (un solo lugar para agregar o renombrar).
 */
export const COMPROBANTES: Record<ComprobanteGasto, string> = {
  FACTURA: "Factura",
  BOLETA: "Boleta de venta",
  RXH: "Recibo por honorarios",
  SERVICIO_PUBLICO: "Recibo de servicios públicos (Luz, Agua)",
  DJ: "Declaración Jurada de Gasto",
  TICKET: "Ticket / Nota de venta",
  RECIBO: "Recibo",
  SIN_COMPROBANTE: "Sin comprobante",
};

export const OPCIONES_COMPROBANTE = (Object.keys(COMPROBANTES) as ComprobanteGasto[]).map((value) => ({ value, label: COMPROBANTES[value] }));

/** Formato del N°: solo factura y boleta tienen serie SUNAT. */
export const NUM_COMPROBANTE: Partial<Record<ComprobanteGasto, RegExp>> = {
  FACTURA: /^[EF][A-Z0-9]{3}-\d{1,8}$/,
  BOLETA: /^[BE][A-Z0-9]{3}-\d{1,8}$/,
};

/** El N° lo pone el sistema: DJ (correlativo del servidor) y sin comprobante (código interno). */
export const numeroAutomatico = (c: ComprobanteGasto) => c === "DJ" || c === "SIN_COMPROBANTE";

/** Código interno de un registro sin comprobante: S/C-<base36 de la hora>. */
export const numeroSinComprobante = () => `S/C-${Date.now().toString(36).toUpperCase()}`;

export const placeholderComprobante = (c: ComprobanteGasto): string =>
  c === "FACTURA" ? "F001-00001234" : c === "BOLETA" ? "B001-00000456" : c === "DJ" ? "Auto: DJ-XXXX" : c === "SIN_COMPROBANTE" ? "Auto: S/C-XXXX" : "N° del comprobante";
