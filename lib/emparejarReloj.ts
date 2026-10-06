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

/**
 * Reglas forzadas (sin preguntar y por encima de cualquier vínculo guardado):
 * huella 28 o nombre del reloj "Manuel 28" -> trabajador 28 (DEYVI MANUEL CORNEJO APAZA).
 */
export const FORZADOS: { id: string; aplica: (huella: string, nombre: string) => boolean }[] = [
  { id: "28", aplica: (huella, nombre) => huella.trim() === "28" || /MANUEL\s*28/i.test(nombre) },
];

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

export type MotivoUnion = "FORZADO" | "VINCULO_GUARDADO" | "ALIAS_NOMBRE" | "HUELLA" | "POR_NOMBRE" | "NUEVO" | "SIN_VINCULAR";

export const MOTIVOS: Record<MotivoUnion, string> = {
  FORZADO: "Regla fija",
  VINCULO_GUARDADO: "Vínculo guardado",
  ALIAS_NOMBRE: "Alias por nombre",
  HUELLA: "Mismo N° de huella",
  POR_NOMBRE: "Por nombre",
  NUEVO: "Trabajador nuevo",
  SIN_VINCULAR: "No se pudo vincular",
};

/** Una fila del resultado de la importación (por huella del reloj). */
export interface DetalleHuella {
  huella: string;
  nombre: string;
  dias: number; // fechas con marcas
  marcas: number;
  desde: string;
  hasta: string;
  destino: string | null; // N° de trabajador (null = sin vincular)
  motivo: MotivoUnion;
  vinculoGuardado: boolean; // viene de un vínculo guardado (se puede quitar)
}

export interface Emparejamiento {
  /** huella -> N° de trabajador (para aplicarAlias) */
  alias: Record<string, string>;
  /** huellas unidas por nombre en esta importación: "CORNEJO DEYVI (huella 45) → DEYVI MANUEL CORNEJO APAZA" */
  porNombre: { huella: string; nombre: string; id: string; nombreMaestro: string }[];
  /** huellas con un posible trabajador pero sin certeza: se vinculan a mano (no se importan todavía) */
  noEncontrados: NoEncontrado[];
  /** Resultado por huella (para mostrar en pantalla qué pasó con cada una) */
  detalle: DetalleHuella[];
}

export function emparejar(m: Marcaciones, maestro: Trabajador[], aliasHuellas: Record<string, string>): Emparejamiento {
  const r: Emparejamiento = { alias: {}, porNombre: [], noEncontrados: [], detalle: [] };
  const existe = new Map(maestro.map((t) => [t.id, t]));
  const elegibles = maestro.filter((t) => t.activo !== false);

  m.asistencia.forEach((fechas, huella) => {
    const nombre = m.nombres.get(huella) ?? "";
    const n = normNombre(nombre);
    const ds = [...fechas.keys()].sort();
    const fila = { huella, nombre: nombre || `HUELLA ${huella}`, dias: ds.length, marcas: [...fechas.values()].reduce((a, x) => a + x.length, 0), desde: ds[0] ?? "", hasta: ds[ds.length - 1] ?? "" };
    const unir = (id: string, motivo: MotivoUnion, vinculoGuardado = false) => {
      if (id !== huella) r.alias[huella] = id;
      if (motivo === "POR_NOMBRE" || motivo === "ALIAS_NOMBRE" || motivo === "FORZADO") r.porNombre.push({ huella, nombre, id, nombreMaestro: existe.get(id)?.nombre ?? "" });
      r.detalle.push({ ...fila, destino: id, motivo, vinculoGuardado });
    };

    // 1) Regla forzada (huella 28 / "Manuel 28" -> 28), aunque haya un vínculo guardado distinto
    const forzado = FORZADOS.find((f) => f.aplica(huella, nombre) && existe.has(f.id));
    if (forzado) return unir(forzado.id, "FORZADO");
    // 2) Vínculo guardado (solo si el trabajador destino existe)
    const guardado = aliasHuellas[huella];
    if (guardado && existe.has(guardado)) return unir(guardado, "VINCULO_GUARDADO", true);
    // 3) Alias por nombre (fijo en código)
    const fijo = ALIAS_NOMBRES[n];
    if (fijo && existe.has(fijo)) return unir(fijo, "ALIAS_NOMBRE");
    // 4) Mismo N° de huella
    if (existe.has(huella)) return unir(huella, "HUELLA");
    // 5) Por nombre: al menos 2 palabras en común y un único mejor candidato
    const candidatos = elegibles
      .map((t) => ({ id: t.id, nombre: t.nombre, puntaje: puntaje(nombre, t.nombre) }))
      .filter((c) => c.puntaje >= 1)
      .sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre));
    const [mejor, segundo] = candidatos;
    if (mejor && mejor.puntaje >= 2 && (!segundo || segundo.puntaje < mejor.puntaje)) return unir(mejor.id, "POR_NOMBRE");
    // 6) Parecidos sin certeza: se pregunta (no se importa todavía). Sin ningún parecido: trabajador nuevo (como antes).
    if (candidatos.length) {
      r.noEncontrados.push({ huella, nombre: fila.nombre, candidatos: candidatos.slice(0, 5) });
      r.detalle.push({ ...fila, destino: null, motivo: "SIN_VINCULAR", vinculoGuardado: false });
      return;
    }
    r.detalle.push({ ...fila, destino: huella, motivo: "NUEVO", vinculoGuardado: false });
  });
  r.detalle.sort((a, b) => Number(a.destino !== null) - Number(b.destino !== null) || a.huella.localeCompare(b.huella, undefined, { numeric: true }));
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
