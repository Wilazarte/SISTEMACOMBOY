// Planilla › Adelantos: CRUD directo sobre la tabla public.adelantos (ver supabase/adelantos.sql).
// El monto se descontará en la planilla más adelante; por ahora solo se registra.

import { ErpError } from "./storage";
import { createClient } from "./supabase/client";

export type EstadoAdelanto = "PENDIENTE" | "DESCONTADO" | "ANULADO";
export const ESTADOS_ADELANTO: EstadoAdelanto[] = ["PENDIENTE", "DESCONTADO", "ANULADO"];
/** DESCONTADO no se elige a mano: lo pone el pago de la planilla. */
export const ESTADOS_EDITABLES: EstadoAdelanto[] = ["PENDIENTE", "ANULADO"];

export interface Adelanto {
  id: string;
  trabajador_nombre: string;
  dni: string | null;
  fecha: string; // YYYY-MM-DD
  monto: number;
  motivo: string | null;
  estado: EstadoAdelanto;
  planilla_id: string | null; // planilla_historial.id donde se descontó
  planilla_periodo?: string | null; // "SEMANA 2 - OCTUBRE 2026"
  descontado_en: string | null;
  // Columnas opcionales (supabase/adelantos_semana.sql)
  trabajador_id?: string | null;
  semana?: string | null;
  sede?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type DatosAdelanto = Pick<Adelanto, "trabajador_nombre" | "dni" | "fecha" | "monto" | "motivo" | "estado">;
/** Datos extra que se guardan si la tabla ya tiene las columnas (supabase/adelantos_semana.sql). */
export type ExtrasAdelanto = { trabajador_id?: string; semana?: string; sede?: string };

// La tabla no tiene alguna columna extra (aún no se ejecutó adelantos_semana.sql)
const sinColumna = (e: { code?: string }) => e.code === "PGRST204" || e.code === "42703";
const extrasLimpios = (x?: ExtrasAdelanto) =>
  Object.fromEntries(Object.entries(x ?? {}).filter(([, v]) => typeof v === "string" && v.trim() !== "").map(([k, v]) => [k, String(v).trim()]));

const COLUMNAS = "*";
const MSG_FALTA_TABLA = "Falta la tabla adelantos en Supabase: ejecute supabase/adelantos.sql en el SQL Editor.";

function errorAdelantos(e: { code?: string; message?: string }): ErpError {
  if (e.code === "42P01" || e.code === "PGRST205") return new ErpError(MSG_FALTA_TABLA);
  if (e.code === "42501") return new ErpError("Su usuario no puede modificar adelantos (solo Planilla y Creador).");
  if (e.code === "23514") return new ErpError("Datos inválidos: revise trabajador, DNI (8 dígitos) y monto (mayor a 0).");
  if (e.code === "55000") return new ErpError(e.message ?? "El adelanto ya fue descontado en planilla.");
  return new ErpError(`Adelantos: ${e.message || "error de conexión"}${e.code ? ` (${e.code})` : ""}`);
}

/** 'pendiente' / 'PENDIENTE' -> PENDIENTE (la tabla puede tener el estado en minúsculas). */
const estadoDe = (v: unknown): EstadoAdelanto => {
  const e = String(v ?? "").trim().toUpperCase() as EstadoAdelanto;
  return ESTADOS_ADELANTO.includes(e) ? e : "PENDIENTE";
};

const aAdelanto = (r: Record<string, unknown>): Adelanto => ({
  id: String(r.id),
  trabajador_nombre: String(r.trabajador_nombre ?? ""),
  dni: (r.dni as string | null) || null,
  fecha: String(r.fecha ?? "").slice(0, 10),
  monto: Number(r.monto) || 0,
  motivo: (r.motivo as string | null) || null,
  estado: estadoDe(r.estado),
  planilla_id: (r.planilla_id as string | null) ?? null,
  descontado_en: (r.descontado_en as string | null) ?? null,
  trabajador_id: (r.trabajador_id as string | null) ?? null,
  semana: (r.semana as string | null) ?? null,
  sede: (r.sede as string | null) ?? null,
  created_at: r.created_at as string | undefined,
  updated_at: r.updated_at as string | undefined,
});

/** Valida y limpia antes de guardar (la base también lo valida). */
function preparar(d: DatosAdelanto): DatosAdelanto {
  const trabajador_nombre = d.trabajador_nombre.trim().toUpperCase();
  const dni = (d.dni ?? "").trim();
  const monto = Math.round(Number(d.monto) * 100) / 100;
  if (!trabajador_nombre) throw new ErpError("Indique el trabajador.");
  if (dni && !/^\d{8}$/.test(dni)) throw new ErpError("DNI inválido (8 dígitos).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErpError("Indique la fecha del adelanto.");
  if (!(monto > 0)) throw new ErpError("El monto debe ser mayor a 0.");
  if (!ESTADOS_EDITABLES.includes(d.estado)) throw new ErpError("El estado DESCONTADO lo pone el pago de la planilla.");
  return { trabajador_nombre, dni: dni || null, fecha: d.fecha, monto, motivo: d.motivo?.trim() || null, estado: d.estado };
}

/** Todos los adelantos, del más reciente al más antiguo. */
export async function listarAdelantos(): Promise<Adelanto[]> {
  const { data, error } = await createClient()
    .from("adelantos")
    .select(COLUMNAS)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw errorAdelantos(error);
  const lista = (data ?? []).map(aAdelanto);
  // Periodo de la planilla donde se descontó (si el historial no se puede leer, se omite)
  const ids = [...new Set(lista.map((a) => a.planilla_id).filter((x): x is string => !!x))];
  if (ids.length) {
    const { data: hs } = await createClient().from("planilla_historial").select("id, periodo").in("id", ids);
    const periodos = new Map((hs ?? []).map((h) => [String(h.id), String(h.periodo)]));
    lista.forEach((a) => (a.planilla_periodo = a.planilla_id ? periodos.get(a.planilla_id) ?? null : null));
  }
  return lista;
}

export async function crearAdelanto(datos: DatosAdelanto, extras?: ExtrasAdelanto): Promise<Adelanto> {
  const limpio = preparar(datos);
  const insertar = (fila: object) => createClient().from("adelantos").insert(fila).select(COLUMNAS).single();
  let { data, error } = await insertar({ ...limpio, ...extrasLimpios(extras) });
  if (error && sinColumna(error)) ({ data, error } = await insertar(limpio));
  if (error) throw errorAdelantos(error);
  return aAdelanto(data);
}

export async function editarAdelanto(id: string, datos: DatosAdelanto, extras?: ExtrasAdelanto): Promise<Adelanto> {
  const limpio = preparar(datos);
  // Solo si no está descontado (la base también lo bloquea con un trigger)
  const actualizar = (fila: object) => createClient().from("adelantos").update(fila).eq("id", id).not("estado", "ilike", "descontado").select(COLUMNAS);
  let { data, error } = await actualizar({ ...limpio, ...extrasLimpios(extras) });
  if (error && sinColumna(error)) ({ data, error } = await actualizar(limpio));
  if (error) throw errorAdelantos(error);
  // Sin filas: no existe o la RLS no deja editarlo
  if (!data?.length) throw new ErpError("No se pudo actualizar: el adelanto ya fue descontado, no existe o su usuario no tiene permiso.");
  return aAdelanto(data[0]);
}

export async function eliminarAdelanto(id: string): Promise<void> {
  const { data, error } = await createClient().from("adelantos").delete().eq("id", id).not("estado", "ilike", "descontado").select("id");
  if (error) throw errorAdelantos(error);
  if (!data?.length) throw new ErpError("No se pudo eliminar: el adelanto ya fue descontado, no existe o su usuario no tiene permiso.");
}

// ---------------------------------------------------------------------
// Descuento en planilla
// ---------------------------------------------------------------------

/** Adelantos pendientes de un trabajador (agrupados por trabajador_nombre). */
export interface PendientesTrabajador {
  trabajador_nombre: string;
  dni: string | null;
  total: number;
  adelantos: Adelanto[]; // del más antiguo al más reciente
}

/** "Saúl  Quispe" -> "SAUL QUISPE": para cruzar el adelanto con el maestro de trabajadores. */
export const normalizarNombre = (n: string): string =>
  n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

/**
 * Suma los adelantos con estado = 'pendiente' (sin importar mayúsculas) agrupados por trabajador_nombre.
 * Con `trabajador_nombre` devuelve solo ese trabajador.
 */
export async function obtenerAdelantosPendientesPorTrabajador(trabajador_nombre?: string): Promise<Map<string, PendientesTrabajador>> {
  let q = createClient().from("adelantos").select(COLUMNAS).ilike("estado", "pendiente").order("fecha", { ascending: true }).order("created_at", { ascending: true });
  if (trabajador_nombre?.trim()) q = q.ilike("trabajador_nombre", trabajador_nombre.trim());
  const { data, error } = await q;
  if (error) throw errorAdelantos(error);
  const grupos = new Map<string, PendientesTrabajador>();
  (data ?? []).map(aAdelanto).forEach((a) => {
    const clave = normalizarNombre(a.trabajador_nombre);
    const g = grupos.get(clave) ?? { trabajador_nombre: a.trabajador_nombre, dni: a.dni, total: 0, adelantos: [] };
    g.total = Math.round((g.total + a.monto) * 100) / 100;
    g.dni ??= a.dni;
    g.adelantos.push(a);
    grupos.set(clave, g);
  });
  return grupos;
}

/** Adelantos pendientes de un trabajador del maestro: por DNI si ambos lo tienen, si no por nombre. */
export function pendientesDe(t: { nombre: string; dni?: string }, grupos: Map<string, PendientesTrabajador>): Adelanto[] {
  const nombre = normalizarNombre(t.nombre);
  const lista: Adelanto[] = [];
  grupos.forEach((g, clave) =>
    g.adelantos.forEach((a) => {
      if (a.dni && t.dni ? a.dni === t.dni : clave === nombre) lista.push(a);
    })
  );
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Qué adelantos se descuentan en este pago: del más antiguo al más reciente mientras quepan en el neto.
 * Un adelanto no se parte: el que no alcanza queda PENDIENTE para la siguiente planilla.
 */
export function adelantosADescontar(pendientes: Adelanto[], neto: number): { descontar: Adelanto[]; total: number } {
  const descontar: Adelanto[] = [];
  let total = 0;
  for (const a of pendientes) {
    if (total + a.monto > neto + 0.005) continue;
    total = Math.round((total + a.monto) * 100) / 100;
    descontar.push(a);
  }
  return { descontar, total };
}
