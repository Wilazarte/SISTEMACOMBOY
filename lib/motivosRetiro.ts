// Retiro de almacén (Vale de Producción Interno): motivos y regla del chasis.
// Sin dependencias: lo usan la pantalla de Stock (cliente) y POST /api/almacen/retiro-produccion (servidor).

/**
 * Motivos del retiro. Con chasis (va al costo del equipo): PRODUCCION PLUS 4000 y MANTENIMIENTO EQUIPO.
 * Sin chasis (gasto general de taller): consumo general, herramientas, insumos de soldadura, oficina / limpieza.
 */
export const MOTIVOS_RETIRO = [
  "PRODUCCION PLUS 4000",
  "MANTENIMIENTO EQUIPO",
  "CONSUMO GENERAL TALLER",
  "HERRAMIENTAS",
  "INSUMOS SOLDADURA",
  "USO OFICINA / LIMPIEZA",
] as const;
export type MotivoRetiro = (typeof MOTIVOS_RETIRO)[number];

export const ETIQUETA_MOTIVO: Record<MotivoRetiro, string> = {
  "PRODUCCION PLUS 4000": "PRODUCCION PLUS 4000 (chasis obligatorio)",
  "MANTENIMIENTO EQUIPO": "MANTENIMIENTO EQUIPO (chasis obligatorio)",
  "CONSUMO GENERAL TALLER": "CONSUMO GENERAL TALLER",
  HERRAMIENTAS: "HERRAMIENTAS",
  "INSUMOS SOLDADURA": "INSUMOS SOLDADURA - Antirrespingo, Alambre, Boquilla, Disco",
  "USO OFICINA / LIMPIEZA": "USO OFICINA / LIMPIEZA",
};

/** Motivos que van al costo de un equipo: el chasis / OT es obligatorio. */
export const MOTIVOS_CON_CHASIS: readonly MotivoRetiro[] = ["PRODUCCION PLUS 4000", "MANTENIMIENTO EQUIPO"];
export const requiereChasis = (m: string) => (MOTIVOS_CON_CHASIS as readonly string[]).includes(m);
/** Error si falta el chasis para el motivo (null = todo bien). */
export const errorChasis = (motivo: string, chasis?: string | null): string | null =>
  requiereChasis(motivo) && !(chasis ?? "").trim() ? (motivo === "PRODUCCION PLUS 4000" ? "Indique chasis PLUS" : "Indique el chasis del equipo") : null;

/** Texto de la columna Chasis del kardex: sin chasis = gasto general de taller. */
export const textoChasis = (chasis?: string | null) => ((chasis ?? "").trim() ? chasis!.trim() : "CONSUMO GENERAL");
