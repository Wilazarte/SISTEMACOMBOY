/**
 * Sedes que son el mismo lugar físico con dos nombres en el stock (ver scripts/unificar-inventario.mjs).
 * Se usa para mostrar el stock agrupado; los datos guardados no cambian hasta correr el script.
 */
export const SEDE_MAP: Record<string, string> = {
  "Taller Principal Aqp": "AQP Principal",
  "Almacen Aqp": "AQP Principal",
};

export const sedeNormalizada = (sede: string): string => SEDE_MAP[sede.trim()] ?? sede.trim();

/** "  Bateria 500  u1r " -> "bateria 500 u1r" (para detectar el mismo producto escrito distinto). */
export const productoNormalizado = (nombre: string): string => nombre.trim().replace(/\s+/g, " ").toLowerCase();
