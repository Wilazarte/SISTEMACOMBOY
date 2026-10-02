// Historial de planilla: snapshots permanentes por periodo en Supabase
// (tablas planilla_historial / planilla_historial_detalle; ver supabase/historial_planilla.sql).
// Se lee directo de Supabase (no pasa por la caché de lib/storage.ts) y se escribe solo con la
// función cerrar_planilla(), que guarda cabecera + detalle en una sola transacción.

import { createClient } from "@/lib/supabase/client";
import { ErpError } from "@/lib/storage";

export interface HistorialPlanilla {
  id: string;
  periodo: string;
  fecha_cierre: string;
  total_neto: number;
  total_bruto: number;
  total_descuento: number;
  total_horas: number;
  cantidad_trabajadores: number;
  creado_por: string | null;
  asistencia_desde: string | null;
  asistencia_hasta: string | null;
}

export interface HistorialDetalle {
  id: string;
  historial_id: string;
  orden: number | null;
  trabajador_id: string;
  nombre: string;
  dni: string | null;
  cargo: string | null;
  fecha_ingreso: string | null;
  tipo_sueldo: string | null;
  pension: string | null;
  afp_porcentaje: number;
  sueldo: number;
  dias: number;
  horas: number;
  tardanzas: number;
  valor_hora: number;
  bruto: number;
  descuento_afp: number;
  neto: number;
  origen: string | null;
}

/** Una fila de la planilla tal como se ve en pantalla al cerrar la semana. */
export type FilaCierre = Omit<HistorialDetalle, "id" | "historial_id" | "orden">;

const MSG_FALTA_SQL = "Falta crear el historial en Supabase: ejecute supabase/historial_planilla.sql en el SQL Editor.";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function errorHistorial(e: { code?: string; message?: string }): ErpError {
  const msg = e.message ?? "";
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache/i.test(msg)) return new ErpError(MSG_FALTA_SQL);
  if (e.code === "42501") return new ErpError(/cerrar/i.test(msg) ? msg : "Su usuario no tiene permiso para el historial de planilla.");
  if (e.code === "23505" || e.code === "22023") return new ErpError(msg);
  return new ErpError(`No se pudo acceder al historial: ${msg || "error de conexión"}`);
}

const aCabecera = (r: Record<string, unknown>): HistorialPlanilla => ({
  id: String(r.id),
  periodo: String(r.periodo ?? ""),
  fecha_cierre: String(r.fecha_cierre ?? ""),
  total_neto: num(r.total_neto),
  total_bruto: num(r.total_bruto),
  total_descuento: num(r.total_descuento),
  total_horas: num(r.total_horas),
  cantidad_trabajadores: num(r.cantidad_trabajadores),
  creado_por: (r.creado_por as string | null) ?? null,
  asistencia_desde: (r.asistencia_desde as string | null) ?? null,
  asistencia_hasta: (r.asistencia_hasta as string | null) ?? null,
});

const aDetalle = (r: Record<string, unknown>): HistorialDetalle => ({
  id: String(r.id),
  historial_id: String(r.historial_id),
  orden: r.orden == null ? null : num(r.orden),
  trabajador_id: String(r.trabajador_id ?? ""),
  nombre: String(r.nombre ?? ""),
  dni: (r.dni as string | null) ?? null,
  cargo: (r.cargo as string | null) ?? null,
  fecha_ingreso: (r.fecha_ingreso as string | null) ?? null,
  tipo_sueldo: (r.tipo_sueldo as string | null) ?? null,
  pension: (r.pension as string | null) ?? null,
  afp_porcentaje: num(r.afp_porcentaje),
  sueldo: num(r.sueldo),
  dias: num(r.dias),
  horas: num(r.horas),
  tardanzas: num(r.tardanzas),
  valor_hora: num(r.valor_hora),
  bruto: num(r.bruto),
  descuento_afp: num(r.descuento_afp),
  neto: num(r.neto),
  origen: (r.origen as string | null) ?? null,
});

/** Periodos cerrados, del más reciente al más antiguo. */
export async function listarHistorial(): Promise<HistorialPlanilla[]> {
  const { data, error } = await createClient().from("planilla_historial").select("*").order("fecha_cierre", { ascending: false });
  if (error) throw errorHistorial(error);
  return (data ?? []).map(aCabecera);
}

/** Un periodo cerrado con su detalle, en el orden en que se vio la planilla. */
export async function obtenerHistorial(id: string): Promise<{ cabecera: HistorialPlanilla; detalle: HistorialDetalle[] } | null> {
  const sb = createClient();
  const [cab, det] = await Promise.all([
    sb.from("planilla_historial").select("*").eq("id", id).maybeSingle(),
    sb.from("planilla_historial_detalle").select("*").eq("historial_id", id).order("orden", { ascending: true }),
  ]);
  if (cab.error) throw errorHistorial(cab.error);
  if (det.error) throw errorHistorial(det.error);
  if (!cab.data) return null;
  return { cabecera: aCabecera(cab.data), detalle: (det.data ?? []).map(aDetalle) };
}

/** "Cerrar semana": copia la planilla al historial (todo o nada). Devuelve el id del periodo guardado. */
export async function cerrarPlanilla(periodo: string, filas: FilaCierre[], rango?: { desde: string; hasta: string }): Promise<string> {
  if (!periodo.trim()) throw new ErpError("Indique el periodo antes de cerrar la semana.");
  if (filas.length === 0) throw new ErpError("No hay trabajadores en la planilla para guardar.");
  const { data, error } = await createClient().rpc("cerrar_planilla", {
    p_periodo: periodo,
    p_filas: filas,
    p_desde: rango?.desde || null,
    p_hasta: rango?.hasta || null,
  });
  if (error) throw errorHistorial(error);
  return String(data);
}
