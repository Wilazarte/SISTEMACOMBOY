/** "wh174mn-2  260380186" -> "WH174MN-2260380186" (para comparar chasis / OT sin espacios ni mayúsculas). */
export const normalizarChasis = (s?: string | null): string => (s ?? "").replace(/\s+/g, "").toUpperCase();
