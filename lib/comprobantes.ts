import type { ComprobanteGasto } from "./types";

/**
 * Tipos de comprobante de "Registrar gasto / compra": la misma lista para el gasto sin stock y la compra con
 * ingreso a stock (un solo lugar para agregar o renombrar).
 */
export const COMPROBANTES: Record<ComprobanteGasto, string> = {
  FACTURA: "Factura Electrónica",
  BOLETA: "Boleta de Venta Electrónica",
  RXH: "Recibo por Honorarios Electrónico (RHE) - 4ta cat.",
  SERVICIO_PUBLICO: "Recibo de Servicios Públicos (SEAL, SEDAPAR, etc.)",
  ARRENDAMIENTO: "Recibo por Arrendamiento (Formulario 1683)",
  LIQUIDACION_COMPRA: "Liquidación de Compra",
  TICKET: "Ticket / Ticket POS",
  NOTA_VENTA: "Nota de Venta / Recibo Interno",
  DJ: "Declaración Jurada (gastos sin comprobante - movilidad)",
  TRANSPORTE_GUIA: "Comprobante de Transporte / Guía",
  SIN_COMPROBANTE: "Sin Comprobante",
  RECIBO: "Recibo",
};

/** Tipos que ya no se ofrecen al registrar (siguen mostrándose en registros antiguos). */
const SOLO_HISTORICOS: ComprobanteGasto[] = ["RECIBO"];

export const OPCIONES_COMPROBANTE = (Object.keys(COMPROBANTES) as ComprobanteGasto[])
  .filter((c) => !SOLO_HISTORICOS.includes(c))
  .map((value) => ({ value, label: COMPROBANTES[value] }));

/** Formato del N°: solo factura y boleta tienen serie SUNAT. */
export const NUM_COMPROBANTE: Partial<Record<ComprobanteGasto, RegExp>> = {
  FACTURA: /^[EF][A-Z0-9]{3}-\d{1,8}$/,
  BOLETA: /^[BE][A-Z0-9]{3}-\d{1,8}$/,
  RXH: /^E[A-Z0-9]{3}-\d{1,8}$/,
};

/** Ejemplo del N° (también en el mensaje de error). */
export const EJEMPLO_NUMERO: Partial<Record<ComprobanteGasto, string>> = { FACTURA: "F001-00001234", BOLETA: "B001-00000456", RXH: "E001-00000123" };

/** Retención de 4ta categoría: 8 % del RHE cuando el importe supera S/ 1,500. */
export const TOPE_RETENCION_RHE = 1500;
export const PORC_RETENCION_RHE = 8;
export const retencionRHE = (importe: number, aplica: boolean): number =>
  aplica && importe > TOPE_RETENCION_RHE ? Math.round(importe * PORC_RETENCION_RHE) / 100 : 0;

/** Declaración jurada de movilidad: tope diario por trabajador (S/). */
export const TOPE_DJ_MOVILIDAD_DIA = 37.7;

/** El N° lo pone el sistema: DJ (correlativo del servidor) y sin comprobante (código interno). */
export const numeroAutomatico = (c: ComprobanteGasto) => c === "DJ" || c === "SIN_COMPROBANTE";

/** Código interno de un registro sin comprobante: S/C-<base36 de la hora>. */
export const numeroSinComprobante = () => `S/C-${Date.now().toString(36).toUpperCase()}`;

export const placeholderComprobante = (c: ComprobanteGasto): string =>
  EJEMPLO_NUMERO[c] ?? (c === "DJ" ? "Auto: DJ-XXXX" : c === "SIN_COMPROBANTE" ? "Auto: S/C-XXXX" : c === "SERVICIO_PUBLICO" ? "N° de recibo" : "N° del comprobante");
