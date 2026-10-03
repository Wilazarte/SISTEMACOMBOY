// Planilla › Adelantos: CRUD directo sobre la tabla public.adelantos (ver supabase/adelantos.sql).
// El monto se descontará en la planilla más adelante; por ahora solo se registra.

import { ErpError } from "./storage";
import { createClient } from "./supabase/client";

export type EstadoAdelanto = "PENDIENTE" | "DESCONTADO" | "ANULADO";
export const ESTADOS_ADELANTO: EstadoAdelanto[] = ["PENDIENTE", "DESCONTADO", "ANULADO"];

export interface Adelanto {
  id: string;
  trabajador_nombre: string;
  dni: string | null;
  fecha: string; // YYYY-MM-DD
  monto: number;
  motivo: string | null;
  estado: EstadoAdelanto;
  created_at?: string;
  updated_at?: string;
}

export type DatosAdelanto = Pick<Adelanto, "trabajador_nombre" | "dni" | "fecha" | "monto" | "motivo" | "estado">;

const COLUMNAS = "id, trabajador_nombre, dni, fecha, monto, motivo, estado, created_at, updated_at";
const MSG_FALTA_TABLA = "Falta la tabla adelantos en Supabase: ejecute supabase/adelantos.sql en el SQL Editor.";

function errorAdelantos(e: { code?: string; message?: string }): ErpError {
  if (e.code === "42P01" || e.code === "PGRST205") return new ErpError(MSG_FALTA_TABLA);
  if (e.code === "42501") return new ErpError("Su usuario no puede modificar adelantos (solo Planilla y Creador).");
  if (e.code === "23514") return new ErpError("Datos inválidos: revise trabajador, DNI (8 dígitos) y monto (mayor a 0).");
  return new ErpError(`Adelantos: ${e.message || "error de conexión"}${e.code ? ` (${e.code})` : ""}`);
}

const aAdelanto = (r: Record<string, unknown>): Adelanto => ({
  id: String(r.id),
  trabajador_nombre: String(r.trabajador_nombre ?? ""),
  dni: (r.dni as string | null) || null,
  fecha: String(r.fecha ?? "").slice(0, 10),
  monto: Number(r.monto) || 0,
  motivo: (r.motivo as string | null) || null,
  estado: (ESTADOS_ADELANTO.includes(r.estado as EstadoAdelanto) ? r.estado : "PENDIENTE") as EstadoAdelanto,
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
  if (!ESTADOS_ADELANTO.includes(d.estado)) throw new ErpError("Estado inválido.");
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
  return (data ?? []).map(aAdelanto);
}

export async function crearAdelanto(datos: DatosAdelanto): Promise<Adelanto> {
  const { data, error } = await createClient().from("adelantos").insert(preparar(datos)).select(COLUMNAS).single();
  if (error) throw errorAdelantos(error);
  return aAdelanto(data);
}

export async function editarAdelanto(id: string, datos: DatosAdelanto): Promise<Adelanto> {
  const { data, error } = await createClient().from("adelantos").update(preparar(datos)).eq("id", id).select(COLUMNAS);
  if (error) throw errorAdelantos(error);
  // Sin filas: no existe o la RLS no deja editarlo
  if (!data?.length) throw new ErpError("No se pudo actualizar: el adelanto ya no existe o su usuario no tiene permiso.");
  return aAdelanto(data[0]);
}

export async function eliminarAdelanto(id: string): Promise<void> {
  const { data, error } = await createClient().from("adelantos").delete().eq("id", id).select("id");
  if (error) throw errorAdelantos(error);
  if (!data?.length) throw new ErpError("No se pudo eliminar: el adelanto ya no existe o su usuario no tiene permiso.");
}
