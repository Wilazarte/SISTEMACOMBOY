/**
 * Solo hay dos almacenes: Taller Principal Aqp y Sucursal Secocha. Nombres viejos que aún pueden estar
 * guardados en stock, equipos u OP -> su almacén real (ver scripts/unificar-inventario.mjs).
 */
export const SEDE_MAP: Record<string, string> = {
  "Almacen Aqp": "Taller Principal Aqp",
  "Adm Aqp": "Taller Principal Aqp",
  "Planta Arequipa": "Taller Principal Aqp",
  "Suc Secocha": "Sucursal Secocha",
};

export const sedeNormalizada = (sede: string): string => SEDE_MAP[sede.trim()] ?? sede.trim();

/** "  Bateria 500  u1r " -> "bateria 500 u1r" (para detectar el mismo producto escrito distinto). */
export const productoNormalizado = (nombre: string): string => nombre.trim().replace(/\s+/g, " ").toLowerCase();
