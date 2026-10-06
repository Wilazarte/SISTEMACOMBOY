// Retiro de almacén (Vale de Producción Interno): motivos y regla del chasis.
// Sin dependencias: lo usan la pantalla de Stock (cliente) y POST /api/almacen/retiro-produccion (servidor).

/**
 * Motivos del retiro. Con chasis (va al costo del equipo): PRODUCCION - … y MANTENIMIENTO EQUIPO.
 * Sin chasis (gasto general de taller): consumo general, herramientas, insumos de soldadura, oficina / limpieza.
 */
export const MOTIVOS_RETIRO = [
  "PRODUCCION - PLUS 4000",
  "PRODUCCION - ECO MINE",
  "PRODUCCION - COCHE MINERO",
  "MANTENIMIENTO EQUIPO",
  "CONSUMO GENERAL TALLER",
  "HERRAMIENTAS",
  "INSUMOS SOLDADURA",
  "USO OFICINA / LIMPIEZA",
] as const;
export type MotivoRetiro = (typeof MOTIVOS_RETIRO)[number];

/** Motivos (por prefijo) que van al costo de un equipo: el chasis / OT es obligatorio. */
export const REQUIERE_CHASIS = ["PRODUCCION - PLUS 4000", "PRODUCCION - ECO MINE", "PRODUCCION - COCHE MINERO", "PRODUCCION", "MANTENIMIENTO EQUIPO"];
export const requiereChasis = (motivo: string) => REQUIERE_CHASIS.some((m) => (motivo ?? "").startsWith(m));

export const ETIQUETA_MOTIVO: Record<MotivoRetiro, string> = {
  "PRODUCCION - PLUS 4000": "PRODUCCION - PLUS 4000 (chasis obligatorio)",
  "PRODUCCION - ECO MINE": "PRODUCCION - ECO MINE (chasis obligatorio)",
  "PRODUCCION - COCHE MINERO": "PRODUCCION - COCHE MINERO (chasis obligatorio)",
  "MANTENIMIENTO EQUIPO": "MANTENIMIENTO EQUIPO (chasis obligatorio)",
  "CONSUMO GENERAL TALLER": "CONSUMO GENERAL TALLER",
  HERRAMIENTAS: "HERRAMIENTAS",
  "INSUMOS SOLDADURA": "INSUMOS SOLDADURA - Antirrespingo, Alambre, Boquilla, Disco",
  "USO OFICINA / LIMPIEZA": "USO OFICINA / LIMPIEZA",
};

/** Error si falta el chasis para el motivo (null = todo bien). CONSUMO GENERAL / HERRAMIENTAS / INSUMOS / OFICINA: chasis null. */
export const errorChasis = (motivo: string, chasis?: string | null): string | null =>
  requiereChasis(motivo) && !(chasis ?? "").trim() ? "Indique el chasis u OT" : null;

/** Texto de la columna Chasis del kardex: sin chasis = gasto general de taller. */
export const textoChasis = (chasis?: string | null) => ((chasis ?? "").trim() ? chasis!.trim() : "CONSUMO GENERAL");
