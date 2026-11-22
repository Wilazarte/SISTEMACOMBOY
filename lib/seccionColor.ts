import type { CSSProperties } from "react";

/**
 * Colores de sección del tema GLASS (Williams, 2026-11-04): cada sección de un módulo lleva su propio color de la
 * marca para distinguirse rápido. Canales "r g b" que lee la clase .seccion de app/globals.css (variable --sec).
 * Paleta COMBOY (2026-11-17): azul acero #294D61, vino #800021, azul noche #11212D y sus tonos medios
 * (acero claro, vino claro, gris oscuro).
 */
// Temas de color (2026-11-22): cada tema redefine --sec-1…6 en app/themes.css; el respaldo es la paleta COMBOY
export const COLORES_SECCION = [
  "var(--sec-1, 41 77 97)",
  "var(--sec-2, 128 0 33)",
  "var(--sec-3, 17 33 45)",
  "var(--sec-4, 84 113 129)",
  "var(--sec-5, 160 51 77)",
  "var(--sec-6, 127 143 150)",
] as const;

/** Color por posición (secciones vecinas nunca repiten color). */
export const colorPorIndice = (i: number): string => COLORES_SECCION[((i % COLORES_SECCION.length) + COLORES_SECCION.length) % COLORES_SECCION.length];

/** Color fijo por nombre: la misma sección ("COMPRAS REGISTRADAS", "Stock"…) siempre sale del mismo color. */
export function colorPorNombre(nombre: string): string {
  let h = 0;
  for (const c of nombre.trim().toUpperCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colorPorIndice(h);
}

/** style={estiloSeccion(...)} junto a className="seccion". Número = posición; texto = nombre de la sección. */
export const estiloSeccion = (clave: number | string): CSSProperties => ({ ["--sec" as string]: typeof clave === "number" ? colorPorIndice(clave) : colorPorNombre(clave) });
