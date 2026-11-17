"use client";

// =====================================================================
// PRODUCCIÓN › COSTO DE PRODUCCIÓN (pedido de Williams 2026-11-17)
// Hoja de costo AUDITADA por cada equipo fabricado. Tablas nuevas (supabase/migrations/20261204_costo_produccion.sql):
//   production_orders · production_costs · production_cost_items · production_cost_versions
//   production_cost_audit_log · production_cost_approvals · production_material_prices · production_cost_config
// La pantalla NO escribe en las tablas: todo pasa por las funciones pc_* de la base, que calculan, versionan
// y dejan la bitácora con hash SHA-256. Aquí solo se lee y se repite el cálculo para ver los totales en vivo
// mientras se escribe (el valor que vale es siempre el que devuelve la base).
// Solo LEE de Almacén (stock, kardex), Planilla (costo hora), Activos (depreciación) y de las OP / lotes 26W.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { ErpError } from "./storage";
import { TIPOS_EQUIPO } from "./equipos";

// ---------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------

export type EstadoHoja = "BORRADOR" | "EN_REVISION" | "REVISADO" | "VALIDADO" | "APROBADO" | "CERRADO" | "RECHAZADO" | "ANULADO";
export type Seccion = "MATERIAL" | "MANO_OBRA" | "CIF" | "ADICIONAL";
export type SubtipoCif = "ENERGIA" | "DEPRECIACION" | "MANTENIMIENTO" | "OTROS";
export type SubtipoAdicional = "TRANSPORTE" | "TERCERIZACION";
export type OrigenCosto = "ALMACEN" | "PLANILLA" | "ACTIVO" | "CONFIG" | "MANUAL";

export interface ConfigCosto {
  margen_minimo: number;
  margen_deseado: number;
  merma_maxima: number;
  alza_material: number;
  horas_jornada: number;
  horas_maquina_mes: number;
  tarifa_kwh: number;
  cargas_sociales: number;
  updated_at?: string;
  updated_by?: string | null;
}

export const CONFIG_DEFECTO: ConfigCosto = {
  margen_minimo: 0.2,
  margen_deseado: 0.3,
  merma_maxima: 0.05,
  alza_material: 0.1,
  horas_jornada: 8,
  horas_maquina_mes: 208,
  tarifa_kwh: 0,
  cargas_sociales: 0,
};

export interface HojaCosto {
  id: string;
  codigo: string; // CP-2026-0001
  origen: "OP" | "LOTE";
  orden_produccion_id: string; // OP-2026-0087 / 26W-003
  equipo_id: string | null;
  requerimiento_ids: string[];
  tipo_equipo: string;
  modelo: string | null;
  cantidad: number;
  cliente_proyecto: string | null;
  responsable: string | null;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  estado: EstadoHoja;
  enviado_usuario: string | null;
  enviado_at: string | null;
  revisado_usuario: string | null;
  revisado_at: string | null;
  validado_usuario: string | null;
  validado_at: string | null;
  aprobado_usuario: string | null;
  aprobado_at: string | null;
  cerrado_usuario: string | null;
  cerrado_at: string | null;
  motivo_estado: string | null;
  created_usuario: string | null;
  created_at: string;
  updated_at: string;
}

export interface CostosHoja {
  orden_id: string;
  materiales: number;
  mano_obra: number;
  cif: number;
  transporte: number;
  tercerizacion: number;
  merma_pct: number;
  merma_monto: number;
  adicionales: number;
  costo_total: number;
  costo_unitario: number;
  margen_deseado: number;
  margen_minimo: number;
  merma_maxima: number;
  precio_venta: number;
  precio_sugerido: number;
  margen_real: number | null;
  alerta_margen: boolean;
  alerta_merma: boolean;
  justificacion_merma: string | null;
  plan_mejora: string | null;
  costo_estimado: number | null;
  costo_estimado_unitario: number | null;
  version_actual: string | null;
  hash: string | null;
  updated_at: string;
  updated_usuario: string | null;
}

export interface LineaCosto {
  id: string;
  orden_id: string;
  seccion: Seccion;
  subtipo: SubtipoCif | SubtipoAdicional | null;
  codigo: string | null;
  descripcion: string;
  unidad: string | null;
  stock_id: string | null;
  requerimiento_id: string | null;
  documento_origen: string | null;
  trabajador_id: string | null;
  activo_id: string | null;
  proveedor: string | null;
  cantidad: number;
  costo_unitario: number;
  potencia_kw: number | null;
  subtotal: number;
  costo_origen: number | null;
  origen_costo: OrigenCosto;
  manual: boolean;
  motivo_manual: string | null;
  justificacion: string | null;
  estado: "ACTIVO" | "ANULADO";
  motivo_anulacion: string | null;
  anulado_usuario: string | null;
  anulado_at: string | null;
  hash: string;
  orden: number;
  created_usuario: string | null;
  created_at: string;
  updated_usuario: string | null;
  updated_at: string;
}

export interface VersionCosto {
  id: string;
  orden_id: string;
  version: string;
  mayor: number;
  menor: number;
  tipo: "BORRADOR" | "ESTIMADO" | "REAL_EN_PROCESO" | "FINAL_REAL";
  motivo: string | null;
  costo_total: number;
  costo_unitario: number;
  margen_real: number | null;
  hash_anterior: string | null;
  hash: string;
  usuario: string | null;
  created_at: string;
  snapshot?: { costos?: Partial<CostosHoja>; items?: LineaCosto[] };
}

export type AccionAudit =
  | "CREAR"
  | "EDITAR_COSTO"
  | "APROBAR"
  | "RECHAZAR"
  | "CAMBIAR_PROVEEDOR"
  | "CERRAR_ORDEN"
  | "ANULAR"
  | "ACTUALIZACION_AUTOMATICA"
  | "FIJAR_ESTIMADO"
  | "ENVIAR_APROBACION"
  | "EXPORTAR_PDF"
  | "CONFIGURAR";

export interface RegistroAudit {
  id: number;
  orden_produccion_id: string | null;
  codigo_op: string | null;
  codigo_hoja: string | null;
  item_id: string | null;
  usuario: string | null;
  accion: AccionAudit;
  fecha_hora: string;
  ip: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  motivo: string | null;
  hash_anterior: string;
  hash_registro: string;
}

export interface Aprobacion {
  id: string;
  orden_id: string;
  etapa: "JEFE_PRODUCCION" | "TESORERIA" | "GERENCIA";
  decision: "APROBADO" | "RECHAZADO";
  usuario: string | null;
  nombre: string | null;
  cargo: string | null;
  version: string | null;
  version_hash: string | null;
  motivo: string | null;
  firma: string | null;
  sello: string;
  created_at: string;
}

export interface PrecioMaterial {
  id: number;
  stock_id: string;
  producto: string | null;
  costo: number;
  documento: string | null;
  requerimiento_id: string | null;
  proveedor: string | null;
  orden_id: string | null;
  fecha: string;
}

/** OP existente a la que se le puede abrir hoja de costo (pc_ops_disponibles). */
export interface OpDisponible {
  origen: "OP" | "LOTE";
  codigo: string;
  equipo_id: string | null;
  tipo_equipo: string;
  modelo: string | null;
  cantidad: number;
  fecha: string | null;
  estado: string | null;
  cliente: string | null;
  detalle: string | null;
}

export interface StockCatalogo {
  id: string;
  nombre: string;
  unidad: string;
  sede: string;
  sku: string | null;
  cantidad: number;
  costo: number;
}
export interface TrabajadorCosto {
  id: string;
  nombre: string;
  cargo: string;
  costo_hora: number;
}
export interface MaquinaCosto {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  dep_mensual: number;
  dep_hora: number;
}

// ---------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------

/** Selector "Equipo a fabricar": los pedidos por Williams + los tipos de equipo que ya fabrica la planta. */
export const EQUIPOS_A_FABRICAR: string[] = Array.from(new Set(["MONTACARGA 5 TON", "APILADOR", "TRANSPALETA", ...TIPOS_EQUIPO.filter((t) => t !== "OTRO"), "OTRO"]));

export const ESTADOS_HOJA: { id: EstadoHoja; nombre: string; paso: string }[] = [
  { id: "BORRADOR", nombre: "Borrador", paso: "Operario registra" },
  { id: "EN_REVISION", nombre: "En revisión", paso: "Jefe de Producción revisa" },
  { id: "REVISADO", nombre: "Revisado", paso: "Tesorería valida" },
  { id: "VALIDADO", nombre: "Validado", paso: "Gerencia aprueba" },
  { id: "APROBADO", nombre: "Aprobado", paso: "Listo para cerrar OP" },
  { id: "CERRADO", nombre: "Cerrado", paso: "Costo final" },
  { id: "RECHAZADO", nombre: "Rechazado", paso: "Corregir y reenviar" },
  { id: "ANULADO", nombre: "Anulado", paso: "Sin efecto" },
];
export const nombreEstado = (e: EstadoHoja) => ESTADOS_HOJA.find((x) => x.id === e)?.nombre ?? e;

export const NOMBRE_SECCION: Record<Seccion, string> = {
  MATERIAL: "A) Materia prima y repuestos",
  MANO_OBRA: "B) Mano de obra directa",
  CIF: "C) Costos indirectos de fabricación (CIF)",
  ADICIONAL: "D) Costos adicionales",
};
export const NOMBRE_SUBTIPO: Record<string, string> = {
  ENERGIA: "Energía eléctrica",
  DEPRECIACION: "Depreciación de máquina",
  MANTENIMIENTO: "Mantenimiento",
  OTROS: "Otros indirectos",
  TRANSPORTE: "Transporte / Flete",
  TERCERIZACION: "Tercerización / Servicios externos",
};
export const NOMBRE_ACCION: Record<AccionAudit, string> = {
  CREAR: "Crear",
  EDITAR_COSTO: "Editar costo",
  APROBAR: "Aprobar",
  RECHAZAR: "Rechazar",
  CAMBIAR_PROVEEDOR: "Cambiar proveedor",
  CERRAR_ORDEN: "Cerrar orden",
  ANULAR: "Anular",
  ACTUALIZACION_AUTOMATICA: "Actualización automática",
  FIJAR_ESTIMADO: "Fijar estimado v1.0",
  ENVIAR_APROBACION: "Enviar a aprobación",
  EXPORTAR_PDF: "Exportar PDF",
  CONFIGURAR: "Parámetros",
};
export const NOMBRE_TIPO_VERSION: Record<VersionCosto["tipo"], string> = {
  BORRADOR: "Borrador",
  ESTIMADO: "Estimado",
  REAL_EN_PROCESO: "Real en proceso",
  FINAL_REAL: "Costo Final Real",
};
export const NOMBRE_ETAPA: Record<Aprobacion["etapa"], string> = { JEFE_PRODUCCION: "Jefe de Producción", TESORERIA: "Tesorería", GERENCIA: "Gerencia" };

export const EDITABLE: EstadoHoja[] = ["BORRADOR", "RECHAZADO"];
export const PENDIENTES: EstadoHoja[] = ["BORRADOR", "EN_REVISION", "REVISADO", "VALIDADO", "RECHAZADO"];

export const S = (n: number | null | undefined): string =>
  `S/ ${(Number(n) || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (n: number | null | undefined, dec = 1): string => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(dec)} %`);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

// ---------------------------------------------------------------------
// Cálculo en vivo (misma fórmula que public.pc_recalcular; la base es la que guarda)
// ---------------------------------------------------------------------

export interface LineaBorrador {
  /** id de la línea en la base; vacío = línea nueva. */
  id?: string;
  key: string;
  seccion: Seccion;
  subtipo?: SubtipoCif | SubtipoAdicional | null;
  codigo?: string | null;
  descripcion: string;
  unidad?: string | null;
  stock_id?: string | null;
  requerimiento_id?: string | null;
  trabajador_id?: string | null;
  activo_id?: string | null;
  proveedor?: string | null;
  cantidad: number;
  costo_unitario: number;
  potencia_kw?: number | null;
  /** Lo que dice Almacén / Planilla / Activos (no editable). */
  costo_origen?: number | null;
  origen_costo: OrigenCosto;
  manual?: boolean;
  motivo_manual?: string | null;
  justificacion?: string | null;
  estado?: "ACTIVO" | "ANULADO";
  documento_origen?: string | null;
}

export const subtotalLinea = (l: Pick<LineaBorrador, "cantidad" | "costo_unitario" | "potencia_kw">): number =>
  r2((Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0) * (l.potencia_kw ? Number(l.potencia_kw) : 1));

export interface Totales {
  materiales: number;
  mano_obra: number;
  cif: number;
  transporte: number;
  tercerizacion: number;
  merma_monto: number;
  adicionales: number;
  costo_total: number;
  costo_unitario: number;
  precio_sugerido: number;
  margen_real: number | null;
  alerta_margen: boolean;
  alerta_merma: boolean;
}

export function calcular(lineas: LineaBorrador[], d: { cantidad: number; merma_pct: number; margen_deseado: number; precio_venta: number; margen_minimo: number; merma_maxima: number }): Totales {
  const activas = lineas.filter((l) => l.estado !== "ANULADO");
  const suma = (f: (l: LineaBorrador) => boolean) => r2(activas.filter(f).reduce((a, l) => a + subtotalLinea(l), 0));
  const materiales = suma((l) => l.seccion === "MATERIAL");
  const mano_obra = suma((l) => l.seccion === "MANO_OBRA");
  const cif = suma((l) => l.seccion === "CIF");
  const transporte = suma((l) => l.seccion === "ADICIONAL" && l.subtipo === "TRANSPORTE");
  const tercerizacion = suma((l) => l.seccion === "ADICIONAL" && l.subtipo !== "TRANSPORTE");
  const merma_monto = r2(materiales * (Number(d.merma_pct) || 0));
  const adicionales = r2(transporte + tercerizacion + merma_monto);
  const costo_total = r2(materiales + mano_obra + cif + adicionales);
  const cant = Number(d.cantidad) > 0 ? Number(d.cantidad) : 1;
  const costo_unitario = r2(costo_total / cant);
  const precio_sugerido = d.margen_deseado < 1 ? r2(costo_unitario / (1 - d.margen_deseado)) : 0;
  const margen_real = d.precio_venta > 0 ? r4((d.precio_venta - costo_unitario) / d.precio_venta) : null;
  return {
    materiales,
    mano_obra,
    cif,
    transporte,
    tercerizacion,
    merma_monto,
    adicionales,
    costo_total,
    costo_unitario,
    precio_sugerido,
    margen_real,
    alerta_margen: margen_real !== null && margen_real < d.margen_minimo,
    alerta_merma: d.merma_pct > d.merma_maxima,
  };
}

/** Línea de la base → borrador del formulario. */
export const aBorrador = (l: LineaCosto): LineaBorrador => ({ ...l, key: l.id, cantidad: Number(l.cantidad), costo_unitario: Number(l.costo_unitario), costo_origen: l.costo_origen === null ? null : Number(l.costo_origen), potencia_kw: l.potencia_kw === null ? null : Number(l.potencia_kw) });

// ---------------------------------------------------------------------
// Datos en vivo (Supabase + Realtime)
// ---------------------------------------------------------------------

export interface EstadoCostos {
  hojas: HojaCosto[];
  costos: Map<string, CostosHoja>;
  items: LineaCosto[];
  versiones: VersionCosto[];
  aprobaciones: Aprobacion[];
  precios: PrecioMaterial[];
  config: ConfigCosto;
  listo: boolean;
  /** El SQL 20261204_costo_produccion.sql aún no se corrió. */
  faltaTabla: boolean;
  error?: string;
}

let estado: EstadoCostos = { hojas: [], costos: new Map(), items: [], versiones: [], aprobaciones: [], precios: [], config: CONFIG_DEFECTO, listo: false, faltaTabla: false };
const oyentes = new Set<(e: EstadoCostos) => void>();
let iniciado = false;
let carga: Promise<void> | null = null;
const avisar = () => oyentes.forEach((f) => f(estado));
const sinTabla = (e: { code?: string; message?: string }) => e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache/i.test(e.message ?? "");

const num = <T extends object>(r: T, campos: (keyof T)[]): T => {
  const o = { ...r } as Record<string, unknown>;
  for (const c of campos) if (o[c as string] !== null && o[c as string] !== undefined) o[c as string] = Number(o[c as string]);
  return o as T;
};
const CAMPOS_COSTO: (keyof CostosHoja)[] = [
  "materiales",
  "mano_obra",
  "cif",
  "transporte",
  "tercerizacion",
  "merma_pct",
  "merma_monto",
  "adicionales",
  "costo_total",
  "costo_unitario",
  "margen_deseado",
  "margen_minimo",
  "merma_maxima",
  "precio_venta",
  "precio_sugerido",
  "margen_real",
  "costo_estimado",
  "costo_estimado_unitario",
];

export function recargarCostos(): Promise<void> {
  if (carga) return carga;
  carga = (async () => {
    const sb = createClient();
    const [h, c, i, v, a, p, cfg] = await Promise.all([
      sb.from("production_orders").select("*").order("created_at", { ascending: false }),
      sb.from("production_costs").select("*"),
      sb.from("production_cost_items").select("*").order("orden"),
      sb.from("production_cost_versions").select("id,orden_id,version,mayor,menor,tipo,motivo,costo_total,costo_unitario,margen_real,hash_anterior,hash,usuario,created_at").order("mayor").order("menor"),
      sb.from("production_cost_approvals").select("*").order("created_at"),
      sb.from("production_material_prices").select("*").order("id", { ascending: false }).limit(3000),
      sb.from("production_cost_config").select("*").eq("id", 1).maybeSingle(),
    ]);
    const err = h.error ?? c.error ?? i.error ?? v.error;
    if (err) {
      estado = { ...estado, listo: true, faltaTabla: sinTabla(err), error: sinTabla(err) ? undefined : err.message };
    } else {
      estado = {
        hojas: (h.data ?? []).map((r) => num(r as HojaCosto, ["cantidad"])),
        costos: new Map((c.data ?? []).map((r) => [r.orden_id as string, num(r as CostosHoja, CAMPOS_COSTO)])),
        items: (i.data ?? []).map((r) => num(r as LineaCosto, ["cantidad", "costo_unitario", "potencia_kw", "subtotal", "costo_origen"])),
        versiones: (v.data ?? []).map((r) => num(r as VersionCosto, ["costo_total", "costo_unitario", "margen_real"])),
        aprobaciones: (a.data ?? []) as Aprobacion[],
        precios: (p.data ?? []).map((r) => num(r as PrecioMaterial, ["costo"])),
        config: cfg.data ? num(cfg.data as ConfigCosto, ["margen_minimo", "margen_deseado", "merma_maxima", "alza_material", "horas_jornada", "horas_maquina_mes", "tarifa_kwh", "cargas_sociales"]) : CONFIG_DEFECTO,
        listo: true,
        faltaTabla: false,
      };
    }
    avisar();
  })().finally(() => {
    carga = null;
  });
  return carga;
}

/** Recalcula con los costos actuales de Almacén / Planilla / Activos las hojas en borrador (deja auditoría). */
export async function sincronizarTodas(): Promise<number> {
  const { data, error } = await createClient().rpc("pc_sincronizar_todas");
  if (error) return 0;
  return Number(data) || 0;
}

function iniciar(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  // Primero trae los costos nuevos de Almacén (si subió un repuesto, la hoja se actualiza sola y queda registro)
  void sincronizarTodas().finally(() => void recargarCostos());
  const sb = createClient();
  let t: ReturnType<typeof setTimeout> | undefined;
  let s: ReturnType<typeof setTimeout> | undefined;
  const programar = () => {
    clearTimeout(t);
    t = setTimeout(() => void recargarCostos(), 350);
  };
  // Almacén cambió un costo (ingreso con OC, transferencia…) → sincronizar las hojas abiertas
  const almacenCambio = () => {
    clearTimeout(s);
    s = setTimeout(() => void sincronizarTodas().then((n) => (n > 0 ? recargarCostos() : undefined)), 1500);
  };
  sb.channel("erp-costo-produccion")
    .on("postgres_changes", { event: "*", schema: "public", table: "production_orders" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "production_costs" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "production_cost_items" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "production_cost_versions" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "production_cost_approvals" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "almacen" }, almacenCambio)
    .subscribe();
}

export function useCostoProduccion(): EstadoCostos {
  const [e, setE] = useState<EstadoCostos>(estado);
  useEffect(() => {
    iniciar();
    setE(estado);
    oyentes.add(setE);
    return () => {
      oyentes.delete(setE);
    };
  }, []);
  return e;
}

// ---------------------------------------------------------------------
// Llamadas a la base (cada una valida perfil, calcula y deja auditoría)
// ---------------------------------------------------------------------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) {
    if (sinTabla(error)) throw new ErpError("Falta correr en Supabase el SQL 20261204_costo_produccion.sql (Costo de Producción).");
    throw new ErpError(error.message.replace(/^COMBOY VID · /, ""));
  }
  return data as T;
}

const sinKey = (l: LineaBorrador) => {
  const { key: _k, costo_origen: _c, origen_costo: _o, manual: _m, estado: _e, documento_origen: _d, ...resto } = l;
  void _k, void _c, void _o, void _m, void _e, void _d;
  return resto;
};

export const crearHoja = (d: { orden_produccion_id: string; equipo_id?: string | null; tipo_equipo: string; modelo?: string | null; cantidad: number; cliente_proyecto?: string; responsable?: string; fecha_inicio?: string; fecha_fin_estimada?: string; margen_deseado?: number; precio_venta?: number }) =>
  rpc<{ id: string; codigo: string; materiales_bom: number }>("pc_crear_orden", { p: d }).then(async (r) => {
    await recargarCostos();
    return r;
  });

export interface CabeceraBorrador {
  cliente_proyecto: string;
  responsable: string;
  fecha_inicio: string;
  fecha_fin_estimada: string;
  cantidad: number;
  tipo_equipo: string;
  modelo: string;
  margen_deseado: number;
  precio_venta: number;
  merma_pct: number;
  justificacion_merma: string;
  plan_mejora: string;
}

export async function guardarBorrador(ordenId: string, cab: CabeceraBorrador, lineas: LineaBorrador[], motivo?: string): Promise<{ cambios: number; version: string | null }> {
  const r = await rpc<{ cambios: number; version: string | null }>("pc_guardar", {
    p_orden: ordenId,
    p_cabecera: { ...cab, cantidad: String(cab.cantidad), margen_deseado: String(cab.margen_deseado), precio_venta: String(cab.precio_venta), merma_pct: String(cab.merma_pct) },
    p_items: lineas.filter((l) => l.estado !== "ANULADO").map(sinKey),
    p_motivo: motivo ?? null,
  });
  await recargarCostos();
  return r;
}

export const anularLinea = (itemId: string, motivo: string) => rpc<{ version: string }>("pc_anular_item", { p_item: itemId, p_motivo: motivo }).finally(() => void recargarCostos());

export type AccionFlujo = "FIJAR_ESTIMADO" | "ENVIAR" | "APROBAR" | "RECHAZAR" | "CERRAR" | "ANULAR";
export const flujo = (ordenId: string, accion: AccionFlujo, motivo?: string, firma?: string) =>
  rpc<{ estado: EstadoHoja; version?: string; sello?: string }>("pc_flujo", { p_orden: ordenId, p_accion: accion, p_motivo: motivo ?? null, p_firma: firma ?? null }).finally(() => void recargarCostos());

export const sincronizar = (ordenId: string) => rpc<number>("pc_sincronizar", { p_orden: ordenId });
export const guardarConfig = (c: Partial<ConfigCosto>, motivo: string) => rpc<ConfigCosto>("pc_guardar_config", { p: c, p_motivo: motivo }).finally(() => void recargarCostos());
export const verificar = (ordenId: string) => rpc<Verificacion>("pc_verificar", { p_orden: ordenId });
export const datosPDF = (ordenId: string) => rpc<DatosPDF>("pc_registrar_pdf", { p_orden: ordenId });
export const opsDisponibles = () => rpc<OpDisponible[]>("pc_ops_disponibles");
export const catalogoStock = (q = "") => rpc<StockCatalogo[]>("pc_catalogo_stock", { p_q: q });
export const catalogoTrabajadores = () => rpc<TrabajadorCosto[]>("pc_catalogo_trabajadores");
export const catalogoMaquinas = () => rpc<MaquinaCosto[]>("pc_catalogo_maquinas");
export const yo = () => rpc<{ id: string; usuario: string; nombre: string; cargo: string; perfil: string; solo_lectura: boolean }>("pc_yo");

export interface Verificacion {
  ok: boolean;
  registros: number;
  lineas: number;
  versiones: number;
  errores: { tipo: string; error: string; id?: string | number; descripcion?: string; version?: string }[];
  verificado: string;
}

export interface DatosPDF {
  version: string;
  tipo: VersionCosto["tipo"];
  hash: string;
  fecha: string;
  costo_hash: string;
  estimado: { version: string; hash: string; costo_total: number } | null;
  firmas: Aprobacion[];
  integridad: Verificacion;
}

/** Bitácora de una hoja (se pide al abrir el historial). */
export async function bitacora(ordenId: string): Promise<RegistroAudit[]> {
  const { data, error } = await createClient().from("production_cost_audit_log").select("*").eq("orden_produccion_id", ordenId).order("id", { ascending: false });
  if (error) throw new ErpError(error.message);
  return (data ?? []) as RegistroAudit[];
}

export async function versionCompleta(id: string): Promise<VersionCosto> {
  const { data, error } = await createClient().from("production_cost_versions").select("*").eq("id", id).single();
  if (error) throw new ErpError(error.message);
  return data as VersionCosto;
}

// ---------------------------------------------------------------------
// Inteligencia: alertas, ranking, sugerencias, comparador y dashboard
// ---------------------------------------------------------------------

export interface AlertaCosto {
  tipo: "ALZA_MATERIAL" | "MERMA" | "MARGEN" | "SIN_COSTO" | "MANUAL" | "SIN_PRECIO";
  texto: string;
  lineaKey?: string;
  stockId?: string;
}

/** Precio anterior distinto del actual (la "última compra" antes del costo vigente). */
export function precioAnterior(stockId: string, actual: number, precios: PrecioMaterial[]): PrecioMaterial | undefined {
  return precios.filter((p) => p.stock_id === stockId).find((p) => Math.abs(p.costo - actual) > 0.0001);
}

export function alertas(lineas: LineaBorrador[], t: Totales, d: { merma_pct: number; merma_maxima: number; margen_minimo: number; precio_venta: number }, precios: PrecioMaterial[], cfg: ConfigCosto): AlertaCosto[] {
  const out: AlertaCosto[] = [];
  for (const l of lineas.filter((x) => x.estado !== "ANULADO" && x.seccion === "MATERIAL")) {
    if (l.stock_id) {
      const ant = precioAnterior(l.stock_id, l.costo_unitario, precios);
      if (ant && ant.costo > 0 && l.costo_unitario > ant.costo * (1 + cfg.alza_material)) {
        const subio = (l.costo_unitario - ant.costo) / ant.costo;
        out.push({
          tipo: "ALZA_MATERIAL",
          lineaKey: l.key,
          stockId: l.stock_id,
          texto: `"${l.descripcion}" subió ${pct(subio, 0)} (de ${S(ant.costo)} a ${S(l.costo_unitario)}${ant.proveedor ? `, antes ${ant.proveedor}` : ""}). ¿Desea buscar proveedor alternativo?`,
        });
      }
    }
    if (l.costo_unitario <= 0) out.push({ tipo: "SIN_COSTO", lineaKey: l.key, texto: `"${l.descripcion}" no tiene costo (Almacén lo tiene sin valorizar).` });
  }
  if (t.alerta_merma) out.push({ tipo: "MERMA", texto: `MERMA ALTA: ${pct(d.merma_pct)} supera el máximo de ${pct(d.merma_maxima, 0)}. Exige justificación y bloquea el cierre hasta registrar el plan de mejora.` });
  if (d.precio_venta <= 0) out.push({ tipo: "SIN_PRECIO", texto: "Falta el precio de venta: sin él no se calcula el margen real ni se puede enviar a aprobación." });
  if (t.alerta_margen) out.push({ tipo: "MARGEN", texto: `COSTO ELEVADO - REQUIERE APROBACIÓN DE GERENCIA: margen real ${pct(t.margen_real)} < mínimo ${pct(d.margen_minimo, 0)}.` });
  return out;
}

/** Los 5 materiales / procesos que más encarecen el equipo. */
export function ranking(lineas: LineaBorrador[], t: Totales): { descripcion: string; seccion: Seccion; subtotal: number; peso: number }[] {
  const base = t.costo_total || 1;
  const filas = lineas.filter((l) => l.estado !== "ANULADO").map((l) => ({ descripcion: l.descripcion, seccion: l.seccion, subtotal: subtotalLinea(l), peso: subtotalLinea(l) / base }));
  if (t.merma_monto > 0) filas.push({ descripcion: `Merma / desperdicio ${pct(t.merma_monto / (t.materiales || 1))}`, seccion: "ADICIONAL", subtotal: t.merma_monto, peso: t.merma_monto / base });
  return filas.sort((a, b) => b.subtotal - a.subtotal).slice(0, 5);
}

export interface Sugerencia {
  hoja: HojaCosto;
  ahorroTotal: number;
  linea?: { key: string; descripcion: string; costoActual: number; costoOtro: number; proveedor: string | null; ahorro: number };
  texto: string;
}

/**
 * "En la OP-0081 este mismo equipo costó S/ 2,300 menos porque usó proveedor X. ¿Desea aplicar?"
 * Compara con las hojas del mismo tipo de equipo (aprobadas o cerradas, si no hay, cualquiera con costo) y busca
 * el material con mayor ahorro por unidad en la de menor costo unitario.
 */
export function sugerencia(hoja: HojaCosto, lineas: LineaBorrador[], t: Totales, s: Pick<EstadoCostos, "hojas" | "costos" | "items">): Sugerencia | null {
  const mismas = s.hojas.filter((h) => h.id !== hoja.id && h.estado !== "ANULADO" && h.tipo_equipo === hoja.tipo_equipo && (s.costos.get(h.id)?.costo_unitario ?? 0) > 0);
  const preferidas = mismas.filter((h) => h.estado === "APROBADO" || h.estado === "CERRADO");
  const lista = preferidas.length ? preferidas : mismas;
  const otra = lista.sort((a, b) => (s.costos.get(a.id)!.costo_unitario ?? 0) - (s.costos.get(b.id)!.costo_unitario ?? 0))[0];
  if (!otra) return null;
  const co = s.costos.get(otra.id)!;
  const ahorroTotal = r2((t.costo_unitario - co.costo_unitario) * (Number(hoja.cantidad) || 1));
  if (ahorroTotal <= 0) return null;
  const otrasLineas = s.items.filter((i) => i.orden_id === otra.id && i.estado === "ACTIVO" && i.seccion === "MATERIAL");
  let mejor: Sugerencia["linea"];
  for (const l of lineas.filter((x) => x.estado !== "ANULADO" && x.seccion === "MATERIAL")) {
    const igual = otrasLineas.find((o) => (l.stock_id && o.stock_id === l.stock_id) || o.descripcion.trim().toUpperCase() === l.descripcion.trim().toUpperCase());
    if (!igual || igual.costo_unitario >= l.costo_unitario) continue;
    const ahorro = r2((l.costo_unitario - igual.costo_unitario) * l.cantidad);
    if (!mejor || ahorro > mejor.ahorro) mejor = { key: l.key, descripcion: l.descripcion, costoActual: l.costo_unitario, costoOtro: Number(igual.costo_unitario), proveedor: igual.proveedor, ahorro };
  }
  const texto = mejor
    ? `En la ${otra.orden_produccion_id} este mismo equipo costó ${S(ahorroTotal)} menos${mejor.proveedor ? ` porque usó proveedor ${mejor.proveedor}` : ""} para "${mejor.descripcion}" (${S(mejor.costoOtro)} vs ${S(mejor.costoActual)}). ¿Desea aplicar?`
    : `En la ${otra.orden_produccion_id} este mismo equipo costó ${S(ahorroTotal)} menos. Revise el comparador.`;
  return { hoja: otra, ahorroTotal, linea: mejor, texto };
}

export interface Comparacion {
  estimado: number | null;
  real: number;
  anterior: { hoja: HojaCosto; costo: number } | null;
  vsEstimado: { soles: number; pct: number } | null;
  vsAnterior: { soles: number; pct: number } | null;
}

/** Costo Estimado (v1.0) vs Costo Real vs Costo del equipo anterior del mismo tipo (por unidad). */
export function comparar(hoja: HojaCosto, real: number, s: Pick<EstadoCostos, "hojas" | "costos">): Comparacion {
  const c = s.costos.get(hoja.id);
  const estimado = c?.costo_estimado_unitario ?? null;
  const previo = s.hojas
    .filter((h) => h.id !== hoja.id && h.tipo_equipo === hoja.tipo_equipo && h.estado !== "ANULADO" && h.created_at < hoja.created_at && (s.costos.get(h.id)?.costo_unitario ?? 0) > 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const anterior = previo ? { hoja: previo, costo: s.costos.get(previo.id)!.costo_unitario } : null;
  const dif = (base: number | null) => (base && base > 0 ? { soles: r2(real - base), pct: (real - base) / base } : null);
  return { estimado, real, anterior, vsEstimado: dif(estimado), vsAnterior: dif(anterior?.costo ?? null) };
}

export interface FilaDashboard {
  tipo: string;
  hojas: number;
  promedio: number;
  minimo: number;
  maximo: number;
}

export function dashboard(s: Pick<EstadoCostos, "hojas" | "costos">) {
  const validas = s.hojas.filter((h) => h.estado !== "ANULADO" && (s.costos.get(h.id)?.costo_total ?? 0) > 0);
  const porTipo = new Map<string, number[]>();
  validas.forEach((h) => porTipo.set(h.tipo_equipo, [...(porTipo.get(h.tipo_equipo) ?? []), s.costos.get(h.id)!.costo_unitario]));
  const tipos: FilaDashboard[] = Array.from(porTipo, ([tipo, v]) => ({ tipo, hojas: v.length, promedio: r2(v.reduce((a, b) => a + b, 0) / v.length), minimo: Math.min(...v), maximo: Math.max(...v) })).sort((a, b) => b.promedio - a.promedio);
  // Tendencia mensual: costo total del mes (fecha de inicio o de apertura de la hoja)
  const meses = new Map<string, { mes: string; total: number; hojas: number; estimado: number }>();
  validas.forEach((h) => {
    const mes = (h.fecha_inicio ?? h.created_at).slice(0, 7);
    const c = s.costos.get(h.id)!;
    const m = meses.get(mes) ?? { mes, total: 0, hojas: 0, estimado: 0 };
    m.total = r2(m.total + c.costo_total);
    m.estimado = r2(m.estimado + (c.costo_estimado ?? 0));
    m.hojas += 1;
    meses.set(mes, m);
  });
  const tendencia = Array.from(meses.values()).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);
  // Mayor sobrecosto: real vs estimado
  const sobrecosto = validas
    .map((h) => {
      const c = s.costos.get(h.id)!;
      const est = c.costo_estimado ?? 0;
      return { hoja: h, real: c.costo_total, estimado: est, soles: est > 0 ? r2(c.costo_total - est) : 0, pct: est > 0 ? (c.costo_total - est) / est : 0, margen: c.margen_real };
    })
    .filter((x) => x.estimado > 0 && x.soles > 0)
    .sort((a, b) => b.soles - a.soles)
    .slice(0, 5);
  const totales = {
    hojas: validas.length,
    pendientes: validas.filter((h) => PENDIENTES.includes(h.estado)).length,
    porAprobar: validas.filter((h) => ["EN_REVISION", "REVISADO", "VALIDADO"].includes(h.estado)).length,
    alertas: validas.filter((h) => s.costos.get(h.id)?.alerta_margen || s.costos.get(h.id)?.alerta_merma).length,
    costoMes: tendencia.at(-1)?.total ?? 0,
  };
  return { tipos, tendencia, sobrecosto, totales };
}

/** Desviación Real vs Estimado de la hoja (para la tabla). */
export function desviacion(c?: CostosHoja): { soles: number; pct: number } | null {
  if (!c || !c.costo_estimado || c.costo_estimado <= 0) return null;
  return { soles: r2(c.costo_total - c.costo_estimado), pct: (c.costo_total - c.costo_estimado) / c.costo_estimado };
}
