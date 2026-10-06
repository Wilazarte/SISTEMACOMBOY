// Planilla › Importar asistencia: une cada huella del reloj con su trabajador del maestro.
// 1) huella unida a mano (alias de huellas) · 2) alias por nombre (ALIAS_NOMBRES) · 3) mismo N° de huella
// 4) por nombre: el nombre del maestro contiene al menos 2 palabras del nombre del reloj
//    ("CORNEJO DEYVI" -> "DEYVI MANUEL CORNEJO APAZA"), si hay un único candidato.
// Lo que no se puede decidir queda como "no encontrado" para vincularlo a mano.

import type { Marcaciones } from "./asistencia";
import type { Trabajador } from "./types";

/** "Córnejo  Ñahui-2" -> "CORNEJO NAHUI" */
export function normNombre(s: string): string {
  return (s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombres del reloj que no coinciden con el maestro (nombre normalizado -> N° de trabajador). */
export const ALIAS_NOMBRES: Record<string, string> = {
  "CORNEJO DEYVI": "28",
  "DEYVI CORNEJO": "28",
  "CORNEJO APAZA DEYVI MANUEL": "28",
};

/** Palabras del nombre del reloj que están en el nombre del maestro (palabras completas, de 2+ letras). */
export function puntaje(nombreReloj: string, nombreMaestro: string): number {
  const maestro = new Set(normNombre(nombreMaestro).split(" "));
  return Array.from(new Set(normNombre(nombreReloj).split(" "))).filter((p) => p.length >= 2 && maestro.has(p)).length;
}

export interface Candidato {
  id: string;
  nombre: string;
  puntaje: number;
}

export interface NoEncontrado {
  huella: string;
  nombre: string; // como viene en el reloj
  candidatos: Candidato[]; // mejores primero
}

export interface Emparejamiento {
  /** huella -> N° de trabajador (para aplicarAlias) */
  alias: Record<string, string>;
  /** huellas unidas por nombre en esta importación: "CORNEJO DEYVI (huella 45) → DEYVI MANUEL CORNEJO APAZA" */
  porNombre: { huella: string; nombre: string; id: string; nombreMaestro: string }[];
  /** huellas con un posible trabajador pero sin certeza: se vinculan a mano (no se importan todavía) */
  noEncontrados: NoEncontrado[];
}

export function emparejar(m: Marcaciones, maestro: Trabajador[], aliasHuellas: Record<string, string>): Emparejamiento {
  const r: Emparejamiento = { alias: { ...aliasHuellas }, porNombre: [], noEncontrados: [] };
  const existe = new Map(maestro.map((t) => [t.id, t]));
  const elegibles = maestro.filter((t) => t.activo !== false);

  m.asistencia.forEach((_, huella) => {
    if (aliasHuellas[huella]) return; // unida a mano antes
    const nombre = m.nombres.get(huella) ?? "";
    const n = normNombre(nombre);

    // Alias por nombre (fijo en código)
    const fijo = ALIAS_NOMBRES[n];
    if (fijo && existe.has(fijo)) {
      if (fijo !== huella) {
        r.alias[huella] = fijo;
        r.porNombre.push({ huella, nombre, id: fijo, nombreMaestro: existe.get(fijo)!.nombre });
      }
      return;
    }

    // Mismo N° de huella: se respeta (es como funcionaba siempre)
    if (existe.has(huella)) return;

    // Por nombre: al menos 2 palabras en común y un único mejor candidato
    const candidatos = elegibles
      .map((t) => ({ id: t.id, nombre: t.nombre, puntaje: puntaje(nombre, t.nombre) }))
      .filter((c) => c.puntaje >= 1)
      .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre));
    const [mejor, segundo] = candidatos;
    if (mejor && mejor.puntaje >= 2 && (!segundo || segundo.puntaje < mejor.puntaje)) {
      r.alias[huella] = mejor.id;
      r.porNombre.push({ huella, nombre, id: mejor.id, nombreMaestro: mejor.nombre });
      return;
    }
    // Hay parecidos pero no es seguro: se pregunta. Sin ningún parecido: trabajador nuevo (como antes).
    if (candidatos.length) r.noEncontrados.push({ huella, nombre: nombre || `HUELLA ${huella}`, candidatos: candidatos.slice(0, 5) });
  });
  return r;
}

/** Quita del Excel las huellas que aún no se vinculan (no se importan hasta confirmar). */
export function sinHuellas(m: Marcaciones, huellas: string[]): Marcaciones {
  if (!huellas.length) return m;
  const fuera = new Set(huellas);
  const asistencia = new Map([...m.asistencia].filter(([h]) => !fuera.has(h)));
  const nombres = new Map([...m.nombres].filter(([h]) => !fuera.has(h)));
  return { ...m, asistencia, nombres };
}
