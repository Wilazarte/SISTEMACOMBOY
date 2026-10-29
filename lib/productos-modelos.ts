// =====================================================================
// Catálogo maestro único de productos: modelos y normalización.
// Sin "use client": lo usan también las rutas /api/productos.
// La misma normalización está en Supabase: public.normalizar_producto()
// (supabase/migrations/20261022_unificar_productos.sql).
// =====================================================================

export interface ProductoMaestro {
  id: string;
  sku: string; // PROD-0001
  nombre_normalizado: string; // TEMPLE BLANCO PATO 25KG
  nombre_display: string; // Temple Blanco Pato 25KG
  descripcion?: string | null;
  marca?: string | null;
  unidad: string;
  categoria?: string | null;
  activo: boolean;
  created_at?: string;
}

export interface AliasProducto {
  alias_normalizado: string;
  producto_id: string;
}

export interface SolicitudProducto {
  id: string;
  nombre: string;
  unidad: string;
  marca?: string | null;
  categoria?: string | null;
  motivo?: string | null;
  modulo?: string | null;
  estado: "pendiente" | "aprobada" | "rechazada";
  producto_id?: string | null;
  respuesta?: string | null;
  solicitado_usuario?: string | null;
  created_at: string;
}

/** Error de catálogo (producto no catalogado, duplicado…): ejecutar() muestra su mensaje. */
export class ProductoError extends Error {}

/** MAYÚSCULAS, sin espacios al inicio/fin ni dobles, "A / B" -> "A/B". */
export function normalizarNombre(nombre: string): string {
  return (nombre ?? "").toUpperCase().trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
}

/** Trigramas como pg_trgm (palabras con "  x " de relleno): similitud 0..1 para "¿Quisiste decir…?". */
function trigramas(t: string): Set<string> {
  const out = new Set<string>();
  for (const p of normalizarNombre(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const w = `  ${p} `;
    for (let i = 0; i < w.length - 2; i++) out.add(w.slice(i, i + 3));
  }
  return out;
}

export function similitud(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (!ta.size || !tb.size) return 0;
  let comun = 0;
  ta.forEach((x) => tb.has(x) && comun++);
  return comun / (ta.size + tb.size - comun);
}

/** Umbral para avisar "¿Quisiste decir…?" al crear (pedido: > 80 %). */
export const UMBRAL_DUPLICADO = 0.8;
/** Umbral para sugerencias al escribir y en "Posibles duplicados". */
export const UMBRAL_SUGERENCIA = 0.45;
