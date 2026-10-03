// Historial de planilla: snapshots permanentes por periodo en Supabase
// (tablas planilla_historial / planilla_historial_detalle; ver supabase/historial_planilla.sql).
// Se lee directo de Supabase (no pasa por la caché de lib/storage.ts) y se escribe solo con la
// función cerrar_planilla(), que guarda cabecera + detalle en una sola transacción.

import { getSesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { ErpError, normalizarPeriodo, r2 } from "@/lib/storage";

export interface HistorialPlanilla {
  id: string;
  periodo: string;
  fecha_cierre: string;
  total_neto: number;
  total_adelantos: number;
  total_pagar: number;
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
  adelantos: number; // adelantos descontados
  total_pagar: number; // neto - adelantos
  origen: string | null;
}

/** Una fila de la planilla tal como se ve en pantalla al cerrar la semana. */
export type FilaCierre = Omit<HistorialDetalle, "id" | "historial_id" | "orden"> & {
  adelanto_ids: string[]; // adelantos PENDIENTES que pasan a DESCONTADO con este pago
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type ErrorSb = { code?: string; message?: string; details?: string | null; hint?: string | null };

/** Muestra el error real de Supabase (código + mensaje) para saber qué pasó. */
function errorHistorial(e: ErrorSb): ErpError {
  if (e.code === "23505") return new ErpError(/cerrado/i.test(e.message ?? "") ? e.message! : "Este periodo ya está guardado en el historial.");
  const extra = [e.details, e.hint].filter(Boolean).join(" · ");
  return new ErpError(`Historial: ${e.message || "error de conexión"}${e.code ? ` (${e.code})` : ""}${extra ? ` — ${extra}` : ""}`);
}

// La función cerrar_planilla() no existe (o PostgREST aún no la ve) -> se inserta directo en las tablas
const sinFuncion = (e: ErrorSb) => e.code === "PGRST202" || e.code === "42883" || /could not find the function|function .* does not exist/i.test(e.message ?? "");
// La tabla no tiene alguna columna extra (se creó solo con las columnas básicas)
const sinColumna = (e: ErrorSb) => e.code === "PGRST204" || e.code === "42703";

const aCabecera = (r: Record<string, unknown>): HistorialPlanilla => ({
  id: String(r.id),
  periodo: String(r.periodo ?? ""),
  fecha_cierre: String(r.fecha_cierre ?? ""),
  total_neto: num(r.total_neto),
  total_adelantos: num(r.total_adelantos),
  total_pagar: r.total_pagar == null ? num(r.total_neto) - num(r.total_adelantos) : num(r.total_pagar),
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
  adelantos: num(r.adelantos),
  total_pagar: r.total_pagar == null ? num(r.neto) - num(r.adelantos) : num(r.total_pagar),
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
    sb.from("planilla_historial_detalle").select("*").eq("historial_id", id), // se ordena abajo: "orden" puede no existir
  ]);
  if (cab.error) throw errorHistorial(cab.error);
  if (det.error) throw errorHistorial(det.error);
  if (!cab.data) return null;
  const detalle = (det.data ?? []).map(aDetalle).map((d) => ({
    ...d,
    valor_hora: d.valor_hora || (d.horas > 0 ? d.bruto / d.horas : 0), // tablas sin columna valor_hora
    descuento_afp: d.descuento_afp || r2(d.bruto - d.neto),
  }));
  detalle.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.trabajador_id.localeCompare(b.trabajador_id, undefined, { numeric: true }));
  const cabecera = aCabecera(cab.data);
  if (!cabecera.total_horas) cabecera.total_horas = r2(detalle.reduce((a, d) => a + d.horas, 0));
  if (!cabecera.total_descuento) cabecera.total_descuento = r2(cabecera.total_bruto - cabecera.total_neto);
  return { cabecera, detalle };
}

/**
 * "Cerrar semana": copia la planilla al historial. Devuelve el id del periodo guardado.
 * 1) Con la función cerrar_planilla() (una sola transacción).
 * 2) Si la función no existe, inserta directo: cabecera y luego detalle (si el detalle falla, se quita la cabecera).
 */
export async function cerrarPlanilla(periodo: string, filas: FilaCierre[], rango?: { desde: string; hasta: string }): Promise<string> {
  const sb = createClient();
  const { data, error } = await sb.rpc("cerrar_planilla", {
    p_periodo: periodo,
    p_filas: filas,
    p_desde: rango?.desde || null,
    p_hasta: rango?.hasta || null,
  });
  if (!error) return String(data);
  if (!sinFuncion(error)) throw errorHistorial(error);
  return insertarDirecto(periodo, filas, rango);
}

const suma = (filas: FilaCierre[], k: "bruto" | "neto" | "descuento_afp" | "horas" | "adelantos" | "total_pagar") => r2(filas.reduce((a, f) => a + (Number(f[k]) || 0), 0));

/** Inserta con todas las columnas; si la tabla solo tiene las básicas, reintenta con esas. */
async function insertar<T>(tabla: string, completo: object | object[], basico: object | object[], select?: string): Promise<T> {
  const sb = createClient();
  const intento = async (filas: object | object[]) => {
    const q = sb.from(tabla).insert(filas);
    return select ? q.select(select) : q;
  };
  let r = await intento(completo);
  if (r.error && sinColumna(r.error)) r = await intento(basico);
  if (r.error) throw errorHistorial(r.error);
  return r.data as T;
}

async function insertarDirecto(periodo: string, filas: FilaCierre[], rango?: { desde: string; hasta: string }): Promise<string> {
  const per = normalizarPeriodo(periodo);
  const sesion = getSesion();
  const basico = {
    periodo: per,
    total_neto: suma(filas, "neto"),
    total_bruto: suma(filas, "bruto"),
    cantidad_trabajadores: filas.length,
    creado_por: sesion?.nombre || sesion?.usuario || null,
  };
  const completo = {
    ...basico,
    total_descuento: suma(filas, "descuento_afp"),
    total_horas: suma(filas, "horas"),
    total_adelantos: suma(filas, "adelantos"),
    total_pagar: suma(filas, "total_pagar"),
    asistencia_desde: rango?.desde || null,
    asistencia_hasta: rango?.hasta || null,
  };
  const cab = await insertar<{ id: string }[]>("planilla_historial", completo, basico, "id");
  const id = cab?.[0]?.id;
  if (!id) throw new ErpError("Historial: Supabase no devolvió el id del periodo guardado (revise la política SELECT de planilla_historial).");

  const detBasico = filas.map((f) => ({
    historial_id: id,
    trabajador_id: f.trabajador_id,
    nombre: f.nombre,
    dias: f.dias,
    horas: f.horas,
    tardanzas: f.tardanzas,
    sueldo: f.sueldo,
    bruto: f.bruto,
    neto: f.neto,
  }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const detCompleto = filas.map(({ adelanto_ids, ...f }, i) => ({ ...detBasico[i], ...f, orden: i + 1 }));
  try {
    await insertar("planilla_historial_detalle", detCompleto, detBasico);
  } catch (e) {
    await createClient().from("planilla_historial").delete().eq("id", id); // no dejar una cabecera sin detalle
    throw e;
  }
  // Adelantos pagados: PENDIENTE -> DESCONTADO con planilla_id (sin la función no hay transacción)
  const ids = filas.flatMap((f) => f.adelanto_ids);
  if (ids.length) {
    const { error } = await createClient()
      .from("adelantos")
      .update({ estado: "DESCONTADO", planilla_id: id, descontado_en: new Date().toISOString() })
      .in("id", ids)
      .ilike("estado", "pendiente");
    if (error) throw new ErpError(`Planilla guardada, pero no se pudieron marcar los adelantos como descontados: ${error.message}. Márquelos en Adelantos.`);
  }
  return id;
}
