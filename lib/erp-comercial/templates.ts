export type Vars = Record<string, string | number | null | undefined>;

/** Reemplaza {variable} en el texto. Variables desconocidas se dejan tal cual. */
export function renderPlantilla(texto: string, vars: Vars) {
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? m : String(v);
  });
}

export const VARIABLES_DISPONIBLES = ["nombre", "empresa", "equipo", "precio", "vendedor", "fecha", "region"];

/** Extrae las variables usadas, en orden, para mapear a parametros de plantillas Meta {{1}} {{2}}... */
export function variablesUsadas(texto: string) {
  return Array.from(texto.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
}
