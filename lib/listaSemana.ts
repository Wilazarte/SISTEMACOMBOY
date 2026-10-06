"use client";

// Planilla › lista de quién se paga en la semana.
// Por defecto: los que tienen asistencia en el periodo (horas o días > 0 en el reloj).
// "Editar lista manual" guarda solo las excepciones: agregados sin asistencia (ej. no marcó pero se le paga)
// y quitados con asistencia (ej. vacaciones). Tabla planilla, tipo 'lista_semana', id planilla_semana_{N}_lista.

import { ErpError, KEYS, escribir, leer, normalizarPeriodo } from "./storage";

export interface ListaSemana {
  id: string; // planilla_semana_14_lista
  periodo: string; // "SEMANA 14 - ABRIL 2026"
  agregados: string[]; // N° de trabajador incluidos a mano (sin asistencia)
  quitados: string[]; // N° de trabajador con asistencia que no se pagan esta semana
  actualizado: string;
  actualizado_por: string;
}

/** "SEMANA 14 - ABRIL 2026" -> planilla_semana_14_lista (sin número: el periodo en minúsculas). */
export function idListaSemana(periodo: string): string {
  const n = normalizarPeriodo(periodo).match(/SEMANA\s+(\d+)/)?.[1];
  const clave = n ?? normalizarPeriodo(periodo).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `planilla_semana_${clave}_lista`;
}

export const getListasSemana = () => leer<ListaSemana[]>(KEYS.LISTAS_SEMANA, []);

/** Lista guardada del periodo (si es de otro año con el mismo N° de semana, no aplica). */
export function listaDe(listas: ListaSemana[], periodo: string): ListaSemana | undefined {
  const l = listas.find((x) => x.id === idListaSemana(periodo));
  return l && l.periodo === normalizarPeriodo(periodo) ? l : undefined;
}

/** En la lista de pago: con asistencia y no quitado, o agregado a mano. */
export function enLista(trabajadorId: string, tieneAsistencia: boolean, lista?: ListaSemana): boolean {
  if (!lista) return tieneAsistencia;
  if (lista.agregados.includes(trabajadorId)) return true;
  return tieneAsistencia && !lista.quitados.includes(trabajadorId);
}

/**
 * Guarda la lista marcada en el modal: compara con la asistencia y guarda solo las diferencias.
 * `marcados`: N° de los trabajadores que se pagan · `conAsistencia`: N° con asistencia en el periodo.
 */
export function guardarListaSemana(periodo: string, marcados: string[], conAsistencia: string[], usuario: string): ListaSemana {
  const per = normalizarPeriodo(periodo);
  if (!per) throw new ErpError("Indique el periodo.");
  const m = new Set(marcados);
  const a = new Set(conAsistencia);
  const lista: ListaSemana = {
    id: idListaSemana(per),
    periodo: per,
    agregados: [...m].filter((id) => !a.has(id)).sort(),
    quitados: [...a].filter((id) => !m.has(id)).sort(),
    actualizado: new Date().toISOString(),
    actualizado_por: usuario,
  };
  escribir(KEYS.LISTAS_SEMANA, [lista, ...getListasSemana().filter((x) => x.id !== lista.id)]);
  return lista;
}
