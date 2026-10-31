"use client";

// =====================================================================
// EXPEDIENTE 26W-001 (Flujo v3.0: Orden de Producción → Expediente, pedido de Williams 2026-10-30).
// Tablas Supabase (supabase/migrations/20261105_expedientes_26w.sql):
//   expedientes      → un registro por OP; codigo_expediente lo pone la base (generate_codigo_expediente()).
//                      `datos` (jsonb) guarda solicitud de materiales, actas, transporte, horas e historial.
//   cotizaciones     → ORIGEN de los datos del proveedor (archivo en Storage + RUC validado con Decolecta).
//   ordenes_compra   → la OC copia el proveedor de la cotización en la base (no se digita).
// Se enlazan, sin duplicarlos, la OP (almacen · ORDEN_PRODUCCION), los vales de producción (stock / kardex)
// y el requerimiento (compras · req) que ya existen.
// =====================================================================

import { useEffect, useState } from "react";
import { getSesion, type Sesion } from "./auth";
import { getEquipos } from "./equipos";
import { consumosDeChasis, retiroProduccion, type MotivoRetiro } from "./inventario";
import { perfilPlanta, type PerfilPlanta } from "./permisosPlanta";
import { getOrdenesProduccion, type OrdenProduccion } from "./produccion";
import { ErpError, IGV, TOPE_BANCARIZACION, crearRequerimiento, getPendientes, getProcesados, getStock, getValesProduccion, hoy, r2, rucValido, siguienteNumero, uid } from "./storage";
import { exigirRucSunat, validarRuc } from "./ruc";
import { createClient } from "./supabase/client";
import type { Requerimiento, StockItem, ValeProduccion } from "./types";

// ---------------------------------------------------------------------
// Fases y responsables
// ---------------------------------------------------------------------

export type Fase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const FASES: Fase[] = [1, 2, 3, 4, 5, 6, 7, 8];
type PerfilFase = Exclude<PerfilPlanta, "soporte" | "gerencia">;

export const RESPONSABLE: Record<Fase, PerfilFase> = { 1: "logistica", 2: "produccion", 3: "almacen", 4: "logistica", 5: "finanzas", 6: "logistica", 7: "almacen", 8: "produccion" };

export const TITULO_FASE: Record<Fase, string> = {
  1: "Orden de Producción",
  2: "Producción acepta",
  3: "Almacén valida stock",
  4: "Cotización y OC",
  5: "Finanzas paga",
  6: "Transporte",
  7: "Almacén recepciona",
  8: "Producción cierra",
};

export const NOMBRE_PERFIL: Record<string, string> = { logistica: "Logística", produccion: "Producción", almacen: "Almacén", finanzas: "Finanzas", soporte: "Soporte" };

export const ZONAS_PT = ["A1", "B2", "C3"] as const;
/** Recursos para las horas; la tarifa se escribe en cada registro (no hay tarifas precargadas). */
export const RECURSOS_MAQUINA = ["Plasma CNC", "Torno", "Soldadura", "Otra máquina"] as const;
export const MARGEN_MINIMO = 0.22;
/** Medios de pago de la Ley 28194 (bancarización). */
export const MEDIOS_PAGO = ["TRANSFERENCIA DE FONDOS", "DEPÓSITO EN CUENTA", "CHEQUE", "TARJETA DE DÉBITO", "TARJETA DE CRÉDITO", "ORDEN DE PAGO", "EFECTIVO"] as const;
export const BANCOS_PE = ["BCP", "BBVA", "Interbank", "Scotiabank", "Banco de la Nación", "BanBif", "Pichincha", "Caja Arequipa", "Otro"];
export const CHECKLIST_QC = ["Dimensiones según plano", "Soldaduras sin fisuras", "Pintura y acabado", "Prueba de funcionamiento", "N° de serie grabado en chasis", "Manual y garantía entregados"];
export const TIPOS_COMPROBANTE_COMPRA = ["FACTURA", "BOLETA", "LIQUIDACIÓN DE COMPRA", "RECIBO POR HONORARIOS"];

// ---------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------

export interface EventoExp {
  fecha: string; // ISO
  usuario: string;
  perfil: string;
  fase?: Fase;
  accion: string;
  detalle?: string;
}

export interface DatosLegalesOP {
  cliente: string;
  contrato: string;
  garantiaMeses: number;
  penalidad: string;
  clausulas: string;
  responsableFirma: string;
}

export interface LineaMaterial {
  id: string;
  stockId?: string;
  sede?: string;
  nombre: string;
  unidad: string;
  cantidad: number;
}

export interface LineaEntrega {
  materialId: string;
  nombre: string;
  unidad: string;
  pedido: number;
  entregado: number;
  vpi?: string; // Vale de Producción Interno que descontó el stock
}

export interface ActaEntrega {
  numero: string;
  fecha: string;
  entrega: string;
  recibe: string;
  lineas: LineaEntrega[];
  observaciones: string;
}

export interface Transporte {
  id: string;
  sinFlete: boolean;
  empresa: string;
  ruc: string;
  guiaRemitente: string;
  guiaTransportista: string;
  ticket: string;
  placa: string;
  costoFlete: number; // sin IGV
  facturaFlete: string;
  fechaEntrega: string;
  registrado: string;
  usuario: string;
}

export interface Horas {
  id: string;
  fecha: string;
  tipo: "MAQUINA" | "MANO_OBRA";
  recurso: string;
  horas: number;
  tarifa: number;
  usuario: string;
}

export interface DatosExpediente {
  producto: string;
  modelo: string;
  prioridad: "NORMAL" | "ALTA" | "URGENTE";
  legal: DatosLegalesOP;
  solicitud?: { numero: string; fecha: string; usuario: string; materiales: LineaMaterial[]; ayudante: string; ayudanteValidado: boolean; observaciones: string };
  ruta?: 1 | 2;
  actaParcial?: ActaEntrega;
  reqIds: string[];
  comprobanteSolicitado?: { fecha: string; usuario: string; nota: string };
  transportes: Transporte[];
  actaCompleta?: ActaEntrega;
  cierre?: { numeroSerie: string; zona: (typeof ZONAS_PT)[number]; checklist: Record<string, boolean>; observaciones: string; acta: ActaEntrega; unidades?: UnidadPT[] };
  /** Lote mixto: "10 × CV-300 · 5 × T-200" (aviso de previsiones a Almacén). */
  resumenEquipos?: string;
  avances: { fecha: string; usuario: string; porcentaje: number; nota: string }[];
  horas: Horas[];
  anulacion?: string;
  historial: EventoExp[];
}

export interface Expediente {
  id: string;
  codigo_expediente: string; // 26W-001
  lote: string | null;
  op_id: string | null;
  plazo: string | null;
  estado: "ABIERTO" | "CERRADO" | "ANULADO";
  estado_avance: number;
  fase_actual: number | null;
  costo_estimado: number;
  costo_real: number;
  precio_venta: number;
  datos: DatosExpediente;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  /** Lote mixto (SQL 20261108): varios equipos por OP en orden_produccion_detalles; sin OP individual (op_id null). */
  es_lote_mixto?: boolean;
  almacen_destino?: string | null;
  total_unidades?: number;
}

/** Equipo del lote (orden_produccion_detalles). Chasis y serie se llenan en la Fase 8, una unidad por equipo. */
export interface DetalleOP {
  id: string;
  orden_id: string;
  tipo_equipo: string;
  marca_motor: string;
  modelo: string;
  cantidad: number;
  codigo_chasis: string | null;
  serie_motor: string | null;
  unidades: { chasis: string; serie: string }[];
  costo_bom: number;
  orden: number;
}

export interface UnidadPT {
  detalleId: string;
  modelo: string;
  chasis: string;
  serie: string;
}

/** Línea de la lista de materiales (BOM) de un modelo: cantidad por UNA unidad del equipo. */
export interface LineaBom {
  id?: string;
  modelo: string;
  material: string;
  unidad: string;
  cantidad: number;
  stock_id: string | null;
}

export interface CotizacionExp {
  id: string;
  expediente_id: string;
  archivo_url: string | null;
  archivo_nombre: string | null;
  ruc: string;
  razon_social: string;
  direccion: string | null;
  celular: string | null;
  asesor_ventas: string | null;
  nro_cotizacion: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  cci: string | null;
  condicion_pago: string | null;
  motivo_compra: string | null;
  fecha_cotizacion: string | null;
  validez_dias: number | null;
  moneda: string;
  subtotal: number;
  igv: number;
  total: number;
  ruc_validado: boolean;
  ruc_estado: string | null;
  condicion_habido: string | null;
  razon_social_sunat: string | null;
  direccion_fiscal: string | null;
  validado_at: string | null;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Bancarizacion {
  medio_pago: string;
  codigo_operacion: string;
  fecha: string;
  banco: string;
  monto: number;
  voucher_url?: string;
  usuario: string;
  registrado: string;
}

export interface OrdenCompraExp {
  id: string;
  expediente_id: string;
  cotizacion_id: string;
  codigo_oc: string;
  motivo_sustentado: string;
  fecha_oc: string;
  plazo_entrega: string | null;
  datos_proveedor: Record<string, string | null>;
  subtotal: number;
  igv: number;
  total: number;
  estado: "EMITIDA" | "PAGADA" | "FACTURADA" | "ANULADA";
  bancarizacion: Bancarizacion | null;
  comprobante: { tipo: string; numero: string; fecha: string; usuario: string } | null;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------
// Datos en vivo (una sola descarga por pestaña + Realtime)
// ---------------------------------------------------------------------

interface Estado {
  expedientes: Expediente[];
  cotizaciones: CotizacionExp[];
  ocs: OrdenCompraExp[];
  /** Equipos de las OP de lote mixto (vacío si falta el SQL 20261108). */
  detalles: DetalleOP[];
  bom: LineaBom[];
  listo: boolean;
  /** El SQL 20261105_expedientes_26w.sql aún no se corrió. */
  faltaTabla: boolean;
  error?: string;
}

let estado: Estado = { expedientes: [], cotizaciones: [], ocs: [], detalles: [], bom: [], listo: false, faltaTabla: false };
const oyentes = new Set<(e: Estado) => void>();
let iniciado = false;
let cargaEnCurso: Promise<void> | null = null;

const avisar = () => oyentes.forEach((f) => f(estado));
const sinTabla = (e: { code?: string; message?: string }) => e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");

export function recargarExpedientes(): Promise<void> {
  if (cargaEnCurso) return cargaEnCurso;
  cargaEnCurso = (async () => {
    const sb = createClient();
    const [e, c, o, det, bom] = await Promise.all([
      sb.from("expedientes").select("*").order("created_at", { ascending: false }),
      sb.from("cotizaciones").select("*").order("created_at", { ascending: false }),
      sb.from("ordenes_compra").select("*").order("created_at", { ascending: false }),
      // Lote mixto (SQL 20261108): si aún no se corrió, el resto sigue funcionando
      sb.from("orden_produccion_detalles").select("*").order("orden"),
      sb.from("bom_modelos").select("*").order("modelo").order("material"),
    ]);
    const err = e.error ?? c.error ?? o.error;
    if (err) estado = { ...estado, listo: true, faltaTabla: sinTabla(err), error: sinTabla(err) ? undefined : err.message };
    else
      estado = {
        expedientes: (e.data ?? []).map(normalizarExp),
        cotizaciones: (c.data ?? []) as CotizacionExp[],
        ocs: (o.data ?? []) as OrdenCompraExp[],
        detalles: det.error ? [] : (det.data ?? []).map((r) => ({ ...(r as DetalleOP), cantidad: Number(r.cantidad), costo_bom: Number(r.costo_bom ?? 0), unidades: (r.unidades ?? []) as DetalleOP["unidades"] })),
        bom: bom.error ? [] : (bom.data ?? []).map((r) => ({ ...(r as LineaBom), cantidad: Number(r.cantidad) })),
        listo: true,
        faltaTabla: false,
      };
    avisar();
  })().finally(() => {
    cargaEnCurso = null;
  });
  return cargaEnCurso;
}

function normalizarExp(r: Record<string, unknown>): Expediente {
  const x = r as unknown as Expediente;
  const d = (x.datos ?? {}) as Partial<DatosExpediente>;
  return {
    ...x,
    costo_estimado: Number(x.costo_estimado ?? 0),
    costo_real: Number(x.costo_real ?? 0),
    precio_venta: Number(x.precio_venta ?? 0),
    datos: {
      producto: d.producto ?? "",
      modelo: d.modelo ?? "",
      prioridad: d.prioridad ?? "NORMAL",
      legal: d.legal ?? { cliente: "", contrato: "", garantiaMeses: 12, penalidad: "", clausulas: "", responsableFirma: "" },
      reqIds: d.reqIds ?? [],
      transportes: d.transportes ?? [],
      avances: d.avances ?? [],
      horas: d.horas ?? [],
      historial: d.historial ?? [],
      ...d,
    } as DatosExpediente,
  };
}

function iniciar(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  void recargarExpedientes();
  const sb = createClient();
  let t: ReturnType<typeof setTimeout> | undefined;
  const programar = () => {
    clearTimeout(t);
    t = setTimeout(() => void recargarExpedientes(), 400);
  };
  sb.channel("erp-expedientes")
    .on("postgres_changes", { event: "*", schema: "public", table: "expedientes" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "cotizaciones" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_compra" }, programar)
    .on("postgres_changes", { event: "*", schema: "public", table: "orden_produccion_detalles" }, programar)
    .subscribe();
}

/** Expedientes, cotizaciones y OC en vivo. `activo = false`: no descarga nada (usuario sin planta). */
export function useExpedientes(activo = true): Estado {
  const [e, setE] = useState<Estado>(estado);
  useEffect(() => {
    if (!activo) return;
    iniciar();
    setE(estado);
    oyentes.add(setE);
    return () => {
      oyentes.delete(setE);
    };
  }, [activo]);
  return e;
}

export const getExpedientes = () => estado.expedientes;
export const buscarExpediente = (codigo: string): Expediente | undefined => {
  const c = decodeURIComponent(codigo).trim().toUpperCase();
  return estado.expedientes.find((x) => x.codigo_expediente === c || x.id === codigo);
};

// ---------------------------------------------------------------------
// Documentos enlazados
// ---------------------------------------------------------------------

export interface Docs {
  op?: OrdenProduccion;
  /** Lote mixto: equipos a fabricar. */
  detalles: DetalleOP[];
  reqs: Requerimiento[];
  cotizaciones: CotizacionExp[];
  ocs: OrdenCompraExp[]; // sin anuladas
}

export function docsDe(x: Expediente, s: Pick<Estado, "cotizaciones" | "ocs"> & Partial<Pick<Estado, "detalles">> = estado): Docs {
  const ids = new Set(x.datos.reqIds);
  return {
    op: getOrdenesProduccion().find((o) => o.id === x.op_id),
    detalles: (s.detalles ?? estado.detalles).filter((d) => d.orden_id === x.id),
    reqs: [...getPendientes(), ...getProcesados()].filter((r) => ids.has(r.id)),
    cotizaciones: s.cotizaciones.filter((c) => c.expediente_id === x.id),
    ocs: s.ocs.filter((o) => o.expediente_id === x.id && o.estado !== "ANULADA"),
  };
}

export function valesDe(x: Expediente, op?: OrdenProduccion, vales: ValeProduccion[] = getValesProduccion()): ValeProduccion[] {
  // Lote mixto: los vales de la Fase 3 llevan el código 26W como chasis / OT
  if (x.es_lote_mixto) return consumosDeChasis("", x.codigo_expediente, vales);
  return x.op_id ? consumosDeChasis(op?.codigo_chasis ?? "", x.op_id, vales) : [];
}

const ocPagada = (o: OrdenCompraExp) => !!o.bancarizacion || o.estado === "PAGADA" || o.estado === "FACTURADA";
/** RUC validado con Decolecta, ACTIVO y HABIDO: sin esto no se emite OC (también lo exige la base). */
export const cotizacionApta = (c: CotizacionExp) => c.ruc_validado && c.ruc_estado === "ACTIVO" && c.condicion_habido === "HABIDO";

// ---------------------------------------------------------------------
// Estado de las 8 fases, avance y costos
// ---------------------------------------------------------------------

export type EstadoFase = "HECHA" | "PENDIENTE" | "NO_APLICA" | "BLOQUEADA";

export interface Resumen {
  fases: Record<Fase, EstadoFase>;
  actual?: Fase;
  avance: number;
  vencido: boolean;
  diasPlazo: number | null;
}

export function resumen(x: Expediente, d: Docs = docsDe(x)): Resumen {
  const D = x.datos;
  const f = {} as Record<Fase, EstadoFase>;
  f[1] = "HECHA";
  f[2] = D.solicitud ? "HECHA" : "PENDIENTE";
  f[3] = D.ruta ? "HECHA" : "PENDIENTE";
  if (D.ruta === 1) f[4] = f[5] = f[6] = f[7] = "NO_APLICA";
  else {
    f[4] = d.ocs.length > 0 ? "HECHA" : "PENDIENTE";
    f[5] = f[4] === "HECHA" && d.ocs.every(ocPagada) ? "HECHA" : "PENDIENTE";
    f[6] = D.transportes.length > 0 ? "HECHA" : "PENDIENTE";
    f[7] = D.actaCompleta ? "HECHA" : "PENDIENTE";
  }
  // Lote mixto: el acta PT lleva chasis y serie de cada unidad y el QC completo (no hay OP individual)
  f[8] = D.cierre && (x.es_lote_mixto ? x.estado === "CERRADO" : d.op?.estado === "QC_APROBADO") ? "HECHA" : "PENDIENTE";
  let previa = true;
  for (const n of FASES) {
    if (f[n] === "PENDIENTE" && !previa) f[n] = "BLOQUEADA";
    if (f[n] === "PENDIENTE" || f[n] === "BLOQUEADA") previa = false;
  }
  const hechas = FASES.filter((n) => f[n] === "HECHA" || f[n] === "NO_APLICA").length;
  const dias = x.plazo ? Math.round((new Date(`${x.plazo}T12:00:00`).getTime() - new Date(`${hoy()}T12:00:00`).getTime()) / 86_400_000) : null;
  return {
    fases: f,
    actual: x.estado === "ABIERTO" ? FASES.find((n) => f[n] === "PENDIENTE") : undefined,
    avance: Math.round((hechas / 8) * 100),
    vencido: x.estado === "ABIERTO" && dias !== null && dias < 0,
    diasPlazo: dias,
  };
}

export interface Costos {
  materiales: number;
  comprasOC: number; // informativo: entra al costo cuando Almacén entrega el material
  flete: number;
  manoObra: number;
  maquina: number;
  real: number;
  presupuesto: number;
  variacion: number | null;
  margen: number | null;
  alertaMargen: boolean;
  porRecurso: { recurso: string; tipo: Horas["tipo"]; horas: number; costo: number }[];
}

export function costos(x: Expediente, d: Docs = docsDe(x), stock: StockItem[] = getStock(), vales?: ValeProduccion[]): Costos {
  const costoDe = new Map(stock.map((s) => [s.id, s.costoUnit || 0]));
  const materiales = r2(valesDe(x, d.op, vales).reduce((a, v) => a + v.cantidad * (costoDe.get(v.stock_id) ?? 0), 0));
  const comprasOC = r2(d.ocs.reduce((a, o) => a + Number(o.subtotal || 0), 0));
  const flete = r2(x.datos.transportes.reduce((a, t) => a + (t.costoFlete || 0), 0));
  const suma = (tipo: Horas["tipo"]) => r2(x.datos.horas.filter((h) => h.tipo === tipo).reduce((a, h) => a + h.horas * h.tarifa, 0));
  const manoObra = suma("MANO_OBRA");
  const maquina = suma("MAQUINA");
  const real = r2(materiales + flete + manoObra + maquina);
  const porRecurso = new Map<string, Costos["porRecurso"][number]>();
  for (const h of x.datos.horas) {
    const k = `${h.tipo}|${h.recurso}`;
    const v = porRecurso.get(k) ?? { recurso: h.recurso, tipo: h.tipo, horas: 0, costo: 0 };
    v.horas = r2(v.horas + h.horas);
    v.costo = r2(v.costo + h.horas * h.tarifa);
    porRecurso.set(k, v);
  }
  const variacion = x.costo_estimado > 0 ? (real - x.costo_estimado) / x.costo_estimado : null;
  const margen = x.precio_venta > 0 ? (x.precio_venta - real) / x.precio_venta : null;
  return { materiales, comprasOC, flete, manoObra, maquina, real, presupuesto: x.costo_estimado, variacion, margen, alertaMargen: margen !== null && margen < MARGEN_MINIMO, porRecurso: Array.from(porRecurso.values()) };
}

// ---------------------------------------------------------------------
// Expediente: documentos y validaciones
// ---------------------------------------------------------------------

export type TipoDocExp = "CODIGO" | "OP" | "SM" | "ACTA_PARCIAL" | "REQ" | "COTI" | "OC" | "BANCARIZACION" | "FACTURA" | "GUIA_REMISION" | "TICKET" | "GUIA_TRANSPORTISTA" | "FACTURA_TRANSPORTE" | "ACTA_COMPLETA" | "ACTA_PT";

export interface DocExp {
  n: number;
  tipo: TipoDocExp;
  titulo: string;
  numero: string;
  estado: "OK" | "FALTA" | "NO_APLICA" | "OBSERVADO";
  detalle: string;
  alertas: string[];
  fase: Fase;
  /** REQ de Compras: se abre en el visor del ERP. */
  reqId?: string;
  /** Archivo en Storage (bucket cotizaciones). */
  archivo?: string;
}

/** Bancarización (Ley 28194): desde S/ 2,000 o US$ 500, con medio de pago del sistema financiero y código de operación. */
export function alertasBancarizacion(o: OrdenCompraExp): string[] {
  const usd = (o.datos_proveedor?.moneda ?? "PEN") === "USD";
  const tope = usd ? 500 : TOPE_BANCARIZACION;
  if (Number(o.total) < tope) return [];
  const b = o.bancarizacion;
  const mon = usd ? "US$" : "S/";
  if (!b) return [`${o.codigo_oc}: ${mon} ${Number(o.total).toFixed(2)} requiere bancarización (desde ${mon} ${tope}).`];
  const out: string[] = [];
  if (b.medio_pago === "EFECTIVO") out.push(`${o.codigo_oc}: pagada en efectivo; desde ${mon} ${tope} debe usarse un medio de pago del sistema financiero.`);
  if (!b.codigo_operacion?.trim()) out.push(`${o.codigo_oc}: falta el código de operación.`);
  if (!b.banco?.trim()) out.push(`${o.codigo_oc}: falta el banco.`);
  if (!b.voucher_url) out.push(`${o.codigo_oc}: falta la constancia (voucher) del pago.`);
  return out;
}

export function documentos(x: Expediente, d: Docs = docsDe(x)): DocExp[] {
  const D = x.datos;
  const r = resumen(x, d);
  const ruta1 = D.ruta === 1;
  const na = (n: number, tipo: TipoDocExp, titulo: string, fase: Fase): DocExp => ({ n, tipo, titulo, numero: "—", estado: "NO_APLICA", detalle: "Ruta 1: stock suficiente, sin compra", alertas: [], fase });
  const falta = (n: number, tipo: TipoDocExp, titulo: string, fase: Fase, detalle: string, alertas: string[] = []): DocExp => ({ n, tipo, titulo, numero: "—", estado: "FALTA", detalle, alertas, fase });
  const ok = (doc: Omit<DocExp, "estado">): DocExp => ({ ...doc, estado: doc.alertas.length ? "OBSERVADO" : "OK" });
  const out: DocExp[] = [];

  out.push(ok({ n: 1, tipo: "CODIGO", titulo: "Código de seguimiento", numero: x.codigo_expediente, detalle: `${D.producto}${x.lote ? ` · lote ${x.lote}` : ""} · avance ${r.avance} %`, alertas: r.vencido ? [`Plazo vencido hace ${-(r.diasPlazo ?? 0)} día(s).`] : [], fase: 1 }));
  const alOP = [!D.legal.responsableFirma.trim() && "Falta el responsable de firma.", !D.legal.cliente.trim() && "Falta el cliente.", !D.legal.contrato.trim() && "Sin contrato u orden del cliente asociada."].filter(Boolean) as string[];
  if (x.es_lote_mixto)
    out.push(
      d.detalles.length
        ? ok({ n: 2, tipo: "OP", titulo: "Orden de Producción · lote mixto", numero: x.codigo_expediente, detalle: `${d.detalles.map((e) => `${e.cantidad} × ${e.tipo_equipo} ${e.marca_motor} ${e.modelo}`).join(" · ")} · destino ${x.almacen_destino ?? "—"}`, alertas: [], fase: 1 })
        : falta(2, "OP", "Orden de Producción · lote mixto", 1, "No se encuentran los equipos del lote.")
    );
  else out.push(d.op ? ok({ n: 2, tipo: "OP", titulo: "Orden de Producción", numero: d.op.id, detalle: `${d.op.tipo_equipo} ${d.op.modelo} · chasis ${d.op.codigo_chasis} · ${d.op.estado.replace(/_/g, " ")}`, alertas: alOP, fase: 1 }) : falta(2, "OP", "Orden de Producción", 1, "La OP enlazada no se encuentra."));
  out.push(D.solicitud ? ok({ n: 3, tipo: "SM", titulo: "Solicitud de Materiales", numero: D.solicitud.numero, detalle: `${D.solicitud.materiales.length} material(es) · ayudante ${D.solicitud.ayudante}`, alertas: [], fase: 2 }) : falta(3, "SM", "Solicitud de Materiales", 2, "Producción aún no acepta la OP."));
  out.push(D.actaParcial ? ok({ n: 4, tipo: "ACTA_PARCIAL", titulo: ruta1 ? "Acta de Entrega de Materiales" : "Acta de Entrega Parcial", numero: D.actaParcial.numero, detalle: `Recibe ${D.actaParcial.recibe} · ${D.actaParcial.lineas.filter((l) => l.entregado > 0).length} línea(s) entregadas`, alertas: [], fase: 3 }) : falta(4, "ACTA_PARCIAL", "Acta de Entrega de Materiales", 3, "Almacén aún no valida stock."));

  if (ruta1) out.push(na(5, "REQ", "Requerimiento", 3), na(6, "COTI", "Cotización", 4), na(7, "OC", "Orden de Compra", 4), na(8, "BANCARIZACION", "Bancarización", 5), na(9, "FACTURA", "Factura", 5));
  else {
    const req = d.reqs[0];
    out.push(req ? ok({ n: 5, tipo: "REQ", titulo: "Requerimiento", numero: d.reqs.map((q) => q.numero).join(", "), detalle: `${req.estado} · ${req.items.length} ítem(s)`, alertas: [], fase: 3, reqId: req.id }) : falta(5, "REQ", "Requerimiento", 3, "Se genera en la ruta 2 (sin stock)."));
    const c = d.cotizaciones.find((q) => d.ocs.some((o) => o.cotizacion_id === q.id)) ?? d.cotizaciones[0];
    out.push(
      c
        ? ok({
            n: 6,
            tipo: "COTI",
            titulo: "Cotización",
            numero: d.cotizaciones.map((q) => q.nro_cotizacion || "s/n").join(", "),
            detalle: `${c.razon_social_sunat ?? c.razon_social} · RUC ${c.ruc} · ${c.ruc_validado ? `${c.ruc_estado} / ${c.condicion_habido}` : "RUC sin validar"}`,
            alertas: [!c.archivo_url && "Falta el archivo de la cotización.", !c.ruc_validado && "RUC sin validar con Decolecta.", c.ruc_validado && !cotizacionApta(c) && `Proveedor ${c.ruc_estado} / ${c.condicion_habido}: no apto para OC.`].filter(Boolean) as string[],
            fase: 4,
            archivo: c.archivo_url ?? undefined,
          })
        : falta(6, "COTI", "Cotización", 4, "Logística sube la cotización del proveedor.")
    );
    const oc = d.ocs[0];
    if (oc) {
      out.push(ok({ n: 7, tipo: "OC", titulo: "Orden de Compra", numero: d.ocs.map((o) => o.codigo_oc).join(", "), detalle: `${oc.datos_proveedor.razon_social ?? ""} · S/ ${Number(oc.total).toFixed(2)} · ${oc.estado}`, alertas: d.ocs.filter((o) => (o.datos_proveedor.cci ?? "").replace(/\D/g, "").length !== 20).map((o) => `${o.codigo_oc}: el CCI del proveedor no tiene 20 dígitos.`), fase: 4 }));
      const alB = d.ocs.flatMap(alertasBancarizacion);
      const pagadas = d.ocs.filter((o) => o.bancarizacion);
      out.push(pagadas.length ? ok({ n: 8, tipo: "BANCARIZACION", titulo: "Bancarización", numero: pagadas.map((o) => o.bancarizacion!.codigo_operacion || o.bancarizacion!.medio_pago).join(", "), detalle: pagadas.map((o) => `${o.bancarizacion!.medio_pago} · ${o.bancarizacion!.banco} · ${o.bancarizacion!.fecha}`).join(" | "), alertas: alB, fase: 5, archivo: pagadas[0].bancarizacion!.voucher_url }) : falta(8, "BANCARIZACION", "Bancarización", 5, "Finanzas aún no registra el pago.", alB));
      const fac = d.ocs.filter((o) => o.comprobante);
      const serieMal = fac.filter((o) => o.comprobante!.tipo === "FACTURA" && !/^[FE]\w{3}-\d{1,8}$/i.test(o.comprobante!.numero)).map((o) => `${o.comprobante!.numero}: no tiene formato de serie SUNAT (F001-00000123).`);
      out.push(fac.length ? ok({ n: 9, tipo: "FACTURA", titulo: "Factura", numero: fac.map((o) => o.comprobante!.numero).join(", "), detalle: fac.map((o) => `${o.comprobante!.tipo} · ${o.comprobante!.fecha} · ${o.codigo_oc}`).join(" | "), alertas: serieMal, fase: 5 }) : falta(9, "FACTURA", "Factura", 5, D.comprobanteSolicitado ? "Finanzas pidió el comprobante a Logística." : "Pendiente del proveedor."));
    } else out.push(falta(7, "OC", "Orden de Compra", 4, "Se genera desde la cotización con RUC validado."), falta(8, "BANCARIZACION", "Bancarización", 5, "Sin OC."), falta(9, "FACTURA", "Factura", 5, "Sin OC."));
  }

  const tr = D.transportes.filter((t) => !t.sinFlete);
  const sinFlete = D.transportes.length > 0 && tr.length === 0;
  const docTr = (n: number, tipo: TipoDocExp, titulo: string, campo: (t: Transporte) => string): DocExp => {
    if (ruta1) return na(n, tipo, titulo, 6);
    if (sinFlete) return { n, tipo, titulo, numero: "—", estado: "NO_APLICA", detalle: "Entrega directa del proveedor (sin flete)", alertas: [], fase: 6 };
    const v = tr.map(campo).filter((s) => s.trim());
    return v.length ? ok({ n, tipo, titulo, numero: v.join(", "), detalle: tr.map((t) => `${t.empresa} · placa ${t.placa || "—"}`).join(" | "), alertas: [], fase: 6 }) : falta(n, tipo, titulo, 6, "Logística registra el transporte.");
  };
  out.push(docTr(10, "GUIA_REMISION", "Guía de Remisión (remitente)", (t) => t.guiaRemitente));
  out.push(docTr(11, "TICKET", "Ticket", (t) => t.ticket));
  const gt = docTr(12, "GUIA_TRANSPORTISTA", "Guía del Transportista", (t) => t.guiaTransportista);
  const rucMal = tr.filter((t) => !rucValido(t.ruc)).map((t) => `RUC del transportista ${t.ruc} no es válido.`);
  out.push(rucMal.length ? { ...gt, estado: "OBSERVADO", alertas: rucMal } : gt);
  out.push(docTr(13, "FACTURA_TRANSPORTE", "Factura del Transporte", (t) => t.facturaFlete));
  out.push(ruta1 ? na(14, "ACTA_COMPLETA", "Acta de Entrega Completa", 7) : D.actaCompleta ? ok({ n: 14, tipo: "ACTA_COMPLETA", titulo: "Acta de Entrega Completa de Materiales", numero: D.actaCompleta.numero, detalle: `Recibe ${D.actaCompleta.recibe}`, alertas: [], fase: 7 }) : falta(14, "ACTA_COMPLETA", "Acta de Entrega Completa de Materiales", 7, "Almacén recepciona y entrega a Producción."));
  if (D.cierre) {
    const noOk = Object.entries(D.cierre.checklist).filter(([, v]) => !v).map(([k]) => `Control de calidad sin conformidad: ${k}.`);
    if (!x.es_lote_mixto && d.op?.estado !== "QC_APROBADO") noOk.push("Falta el QC firmado del supervisor (Producción › QC).");
    const series = D.cierre.unidades?.length ? `${D.cierre.unidades.length} unidad(es) · series ${D.cierre.unidades.map((u) => u.serie).join(", ")}` : `N° serie ${D.cierre.numeroSerie}`;
    out.push(ok({ n: 15, tipo: "ACTA_PT", titulo: "Acta de Entrega PT a Almacén", numero: D.cierre.acta.numero, detalle: `${series} · zona ${D.cierre.zona}`, alertas: noOk, fase: 8 }));
  } else out.push(falta(15, "ACTA_PT", "Acta de Entrega PT a Almacén", 8, "Producción cierra con N° de serie y QC."));
  return out;
}

// ---------------------------------------------------------------------
// Permisos por fase
// ---------------------------------------------------------------------

/**
 * Hoy Logística, Almacén y Producción entran con el rol "almacen" (perfil almacen): ese perfil actúa en todas
 * las fases de planta. Con usuarios de rol logistica / produccion, cada uno queda solo en las suyas.
 * Finanzas solo la 5; SOPORTE todas.
 */
export function recibe(perfil: PerfilPlanta | null, destino: string): boolean {
  if (!perfil || perfil === "gerencia") return false;
  if (perfil === "soporte" || perfil === destino) return true;
  return perfil === "almacen" && (destino === "logistica" || destino === "produccion");
}

export const puedeActuar = (sesion: Sesion | null, fase: Fase): boolean => !!sesion && !sesion.soloLectura && recibe(perfilPlanta(sesion), RESPONSABLE[fase]);

function exigir(fase: Fase): { usuario: string; perfil: string } {
  const s = getSesion();
  if (!puedeActuar(s, fase)) throw new ErpError(`Solo ${NOMBRE_PERFIL[RESPONSABLE[fase]]} registra la fase ${fase} (${TITULO_FASE[fase]}).`);
  return { usuario: s!.usuario, perfil: perfilPlanta(s) ?? "" };
}

// ---------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------

const errorSb = (e: { message: string; code?: string }) => new ErpError(e.code === "42501" ? "Su usuario no tiene permiso para guardar este cambio." : sinTabla(e) ? "Falta correr el SQL 20261105_expedientes_26w.sql en Supabase." : e.message);

/** Guarda `datos` + columnas calculadas (avance, fase actual, costo real) con una entrada nueva del historial. */
async function guardar(x: Expediente, fase: Fase, accion: string, detalle: string | undefined, cambio: (D: DatosExpediente) => DatosExpediente, extra: Partial<Expediente> = {}): Promise<Expediente> {
  const { usuario, perfil } = exigir(fase);
  await recargarExpedientes(); // datos al día: otra PC pudo avanzar el expediente
  const actual = estado.expedientes.find((e) => e.id === x.id);
  if (!actual) throw new ErpError("Expediente no encontrado.");
  if (actual.estado !== "ABIERTO") throw new ErpError(`El expediente ${actual.codigo_expediente} está ${actual.estado}.`);
  const datos = cambio(actual.datos);
  datos.historial = [...actual.datos.historial, { fecha: new Date().toISOString(), usuario, perfil, fase, accion, detalle }];
  const nuevo: Expediente = { ...actual, ...extra, datos };
  const r = resumen(nuevo);
  const c = costos(nuevo);
  const fila = { datos, estado_avance: r.avance, fase_actual: r.actual ?? null, costo_real: c.real, ...extra };
  const { error } = await createClient().from("expedientes").update(fila).eq("id", x.id);
  if (error) throw errorSb(error);
  await recargarExpedientes();
  return estado.expedientes.find((e) => e.id === x.id) ?? nuevo;
}

export interface EquipoLote {
  tipo: string;
  marca: string;
  modelo: string;
  cantidad: number;
}

/** Semana ISO del lote automático: LOTE-2026-W44 (la base lo pone con la fecha de Lima; esto es la vista previa). */
export function loteDeHoy(fecha = new Date()): string {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7);
  return `LOTE-${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/**
 * FASE 1 · Logística crea la OP de LOTE MIXTO: destino, plazo, prioridad y equipos (tipo, marca de motor, modelo, cantidad).
 * La base asigna 26W-XXX y LOTE-AAAA-Wss y avisa a Producción (aprobar) y a Almacén (previsiones).
 * El costo estimado lo calcula Producción en la Fase 2 con el BOM; chasis y serie van en la Fase 8.
 */
export async function crearOpLote(d: { almacen: string; plazo: string; prioridad: DatosExpediente["prioridad"]; equipos: EquipoLote[] }): Promise<Expediente> {
  const { usuario, perfil } = exigir(1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.plazo)) throw new ErpError("Indique el plazo de finalización.");
  if (d.plazo < hoy()) throw new ErpError("El plazo no puede estar en el pasado.");
  const equipos = d.equipos.map((e) => ({ tipo_equipo: e.tipo.trim(), marca_motor: e.marca.trim(), modelo: e.modelo.trim().toUpperCase(), cantidad: Number(e.cantidad) }));
  if (!equipos.length) throw new ErpError("Agregue al menos un equipo al lote.");
  equipos.forEach((e, i) => {
    if (!e.tipo_equipo || !e.marca_motor || !e.modelo) throw new ErpError(`Fila ${i + 1}: complete tipo de equipo, marca de motor y modelo.`);
    if (!Number.isInteger(e.cantidad) || e.cantidad <= 0) throw new ErpError(`Fila ${i + 1}: la cantidad debe ser un número entero mayor a 0.`);
  });
  const total = equipos.reduce((a, e) => a + e.cantidad, 0);
  const modelos = [...new Set(equipos.map((e) => e.modelo))];
  const resumenEquipos = equipos.map((e) => `${e.cantidad} × ${e.tipo_equipo} ${e.modelo}`).join(" · ");
  const datos: Omit<DatosExpediente, "prioridad"> = {
    producto: `Lote mixto · ${total} unidad(es) · ${modelos.length} modelo(s)`,
    modelo: modelos.join(", "),
    resumenEquipos,
    legal: { cliente: "", contrato: "", garantiaMeses: 12, penalidad: "", clausulas: "", responsableFirma: "" },
    reqIds: [],
    transportes: [],
    avances: [],
    horas: [],
    historial: [{ fecha: new Date().toISOString(), usuario, perfil, fase: 1, accion: "OP de lote mixto generada · expediente abierto", detalle: `${resumenEquipos} · destino ${d.almacen} · plazo ${d.plazo}` }],
  };
  const { data, error } = await createClient().rpc("crear_op_lote", { p_plazo: d.plazo, p_prioridad: d.prioridad, p_almacen: d.almacen, p_detalles: equipos, p_datos: datos, p_usuario: usuario });
  if (error) throw error.code === "PGRST202" ? new ErpError("Falta correr el SQL 20261108_op_lote_mixto.sql en Supabase.") : errorSb(error);
  await recargarExpedientes();
  return normalizarExp(data as Record<string, unknown>);
}

/**
 * FASE 2 · Producción acepta: materiales, ayudante de ensamblaje validado, observaciones → Solicitud de Materiales.
 * Lote mixto: el costo estimado = Σ (BOM del modelo × cantidad) a costo de stock (ver costoBomLote); se guarda por equipo y en la OP.
 */
export async function aceptarProduccion(x: Expediente, d: { materiales: Omit<LineaMaterial, "id">[]; ayudante: string; ayudanteValidado: boolean; observaciones: string }): Promise<Expediente> {
  const materiales = d.materiales.filter((m) => m.nombre.trim()).map((m) => ({ ...m, id: uid(), nombre: m.nombre.trim(), cantidad: Number(m.cantidad) }));
  if (!materiales.length) throw new ErpError("Agregue al menos un material.");
  if (materiales.some((m) => !(m.cantidad > 0))) throw new ErpError("Las cantidades deben ser mayores a 0.");
  if (!d.ayudante.trim()) throw new ErpError("Indique el ayudante de ensamblaje.");
  if (!d.ayudanteValidado) throw new ErpError("Valide la mano de obra (ayudante de ensamblaje).");
  const lote = x.es_lote_mixto ? costoBomLote(docsDe(x).detalles) : undefined;
  const r = await guardar(
    x,
    2,
    "OP aceptada · solicitud de materiales a Almacén",
    `${materiales.length} material(es) · ayudante ${d.ayudante.trim()}${lote ? ` · costo estimado BOM S/ ${lote.total.toFixed(2)}` : ""}`,
    (D) => {
      if (D.solicitud) throw new ErpError("La OP ya fue aceptada.");
      return { ...D, solicitud: { numero: `SM-${x.codigo_expediente}`, fecha: new Date().toISOString(), usuario: getSesion()?.usuario ?? "", materiales, ayudante: d.ayudante.trim(), ayudanteValidado: true, observaciones: d.observaciones.trim() } };
    },
    lote ? { costo_estimado: lote.total } : {}
  );
  if (lote) {
    const sb = createClient();
    await Promise.all(lote.porDetalle.map((p) => sb.from("orden_produccion_detalles").update({ costo_bom: p.costo }).eq("id", p.detalleId)));
    await recargarExpedientes();
  }
  return r;
}

// ---- BOM (lista de materiales por modelo) -----------------------------------------------------

export const bomDe = (modelo: string, bom: LineaBom[] = estado.bom): LineaBom[] => bom.filter((b) => b.modelo === modelo.trim().toUpperCase());

/** Costo de stock (costoUnit) de una línea del BOM: por stock_id, o por nombre y unidad. */
function costoMaterial(b: Pick<LineaBom, "material" | "unidad" | "stock_id">, stock: StockItem[]): number {
  const it = (b.stock_id && stock.find((s) => s.id === b.stock_id)) || stock.find((s) => s.nombre.trim().toUpperCase() === b.material.trim().toUpperCase() && s.unidad === b.unidad);
  return Number(it?.costoUnit ?? 0);
}

export interface CostoLote {
  total: number;
  porDetalle: { detalleId: string; modelo: string; cantidad: number; costo: number; sinBom: boolean; sinCosto: string[] }[];
  /** Materiales del lote: BOM × cantidad, sumados por material (llenan la solicitud de la Fase 2). */
  materiales: Omit<LineaMaterial, "id">[];
}

/** Lote mixto: para cada equipo, BOM del modelo × cantidad, a costo de stock. */
export function costoBomLote(detalles: DetalleOP[], bom: LineaBom[] = estado.bom, stock: StockItem[] = getStock()): CostoLote {
  const mats = new Map<string, Omit<LineaMaterial, "id">>();
  const porDetalle = detalles.map((e) => {
    const lineas = bomDe(e.modelo, bom);
    let costo = 0;
    const sinCosto: string[] = [];
    for (const b of lineas) {
      const cant = b.cantidad * e.cantidad;
      const cu = costoMaterial(b, stock);
      if (!cu) sinCosto.push(b.material);
      costo += cant * cu;
      const k = `${b.stock_id ?? ""}|${b.material.toUpperCase()}|${b.unidad}`;
      const it = b.stock_id ? stock.find((s) => s.id === b.stock_id) : undefined;
      mats.set(k, { nombre: b.material, unidad: b.unidad, cantidad: r2((mats.get(k)?.cantidad ?? 0) + cant), stockId: b.stock_id ?? undefined, sede: it?.sede });
    }
    return { detalleId: e.id, modelo: e.modelo, cantidad: e.cantidad, costo: r2(costo), sinBom: !lineas.length, sinCosto };
  });
  return { total: r2(porDetalle.reduce((a, p) => a + p.costo, 0)), porDetalle, materiales: [...mats.values()] };
}

/** Guarda el BOM de un modelo (cantidades por UNA unidad). Producción / Almacén / SOPORTE. */
export async function guardarBom(modelo: string, lineas: Omit<LineaBom, "modelo">[]): Promise<void> {
  const s = getSesion();
  const p = perfilPlanta(s);
  if (!s || s.soloLectura || !(p === "soporte" || p === "produccion" || p === "almacen")) throw new ErpError("Solo Producción edita la lista de materiales (BOM).");
  const m = modelo.trim().toUpperCase();
  if (!m) throw new ErpError("Indique el modelo.");
  const limpias = lineas
    .filter((l) => l.material.trim())
    .map((l) => ({ modelo: m, material: l.material.trim().toUpperCase(), unidad: (l.unidad || "UND").trim().toUpperCase(), cantidad: Number(l.cantidad), stock_id: l.stock_id || null, updated_by: s.usuario, updated_at: new Date().toISOString() }));
  if (limpias.some((l) => !(l.cantidad > 0))) throw new ErpError("Las cantidades por unidad deben ser mayores a 0.");
  const claves = new Set(limpias.map((l) => `${l.material}|${l.unidad}`));
  if (claves.size !== limpias.length) throw new ErpError("Hay materiales repetidos en el BOM.");
  const sb = createClient();
  if (limpias.length) {
    const { error } = await sb.from("bom_modelos").upsert(limpias, { onConflict: "modelo,material,unidad" });
    if (error) throw errorSb(error);
  }
  // Las líneas quitadas dejan de contar (es la configuración del modelo, no un documento)
  const quitar = bomDe(m).filter((b) => b.id && !claves.has(`${b.material}|${b.unidad}`)).map((b) => b.id!);
  if (quitar.length) {
    const { error } = await sb.from("bom_modelos").delete().in("id", quitar);
    if (error) throw errorSb(error);
  }
  await recargarExpedientes();
}


export function disponibleDe(m: LineaMaterial, stock: StockItem[] = getStock()): { item?: StockItem; cantidad: number } {
  const item = (m.stockId && stock.find((s) => s.id === m.stockId)) || stock.find((s) => s.nombre.trim().toUpperCase() === m.nombre.trim().toUpperCase() && s.unidad === m.unidad && (!m.sede || s.sede === m.sede));
  return { item, cantidad: item?.cantidad ?? 0 };
}

/** Motivo del vale de la Fase 3: cualquiera que empiece con PRODUCCION (va al costo del equipo). */
export const motivoValeValido = (m: string) => (m ?? "").trim().toUpperCase().startsWith("PRODUCCION");

/** Ruta 2: la observación de la entrega parcial debe describir los faltantes (mínimo 15 caracteres y 3 palabras). */
export const MIN_OBS_PARCIAL = 15;
const OBS_VACIAS = ["POR COMPLETAR", "---", "--", "-", "N/A", "NA", "OK", "."];
export function observacionParcialValida(obs: string): boolean {
  const t = (obs ?? "").trim();
  return t.length >= MIN_OBS_PARCIAL && !OBS_VACIAS.includes(t.toUpperCase()) && t.split(/\s+/).length >= 3;
}
export const AVISO_OBS_PARCIAL = "La observación debe describir los faltantes reales (mínimo 15 caracteres). Ej.: Entrega parcial 10 materiales, faltan 14: generar REQ urgente.";

/**
 * FASE 3 · Almacén valida stock. Lo que hay se entrega con Vale de Producción (descuenta stock y anota el kardex).
 * Ruta 1: todo entregado. Ruta 2: entrega parcial con observación y REQ a Logística por lo que falta.
 */
export async function validarStock(x: Expediente, d: { entregas: Record<string, number>; motivo: MotivoRetiro; recibe: string; autoriza: string; observaciones: string; sedeReq: string }): Promise<Expediente> {
  const { usuario } = exigir(3);
  const sol = x.datos.solicitud;
  if (!sol) throw new ErpError("El expediente no tiene solicitud de materiales.");
  if (x.datos.ruta) throw new ErpError("Almacén ya validó el stock.");
  if (!d.recibe.trim()) throw new ErpError("Indique quién recibe en Producción.");
  const op = getOrdenesProduccion().find((o) => o.id === x.op_id);
  const stock = getStock();
  // Primero se valida todo; recién entonces se descuenta el stock (un vale por línea)
  const plan = sol.materiales.map((m) => {
    const pedida = Number(d.entregas[m.id] ?? 0);
    const { item, cantidad: hay } = disponibleDe(m, stock);
    if (!(pedida >= 0) || pedida > m.cantidad) throw new ErpError(`${m.nombre}: la entrega debe estar entre 0 y ${m.cantidad}.`);
    if (pedida > hay + 1e-9) throw new ErpError(`${m.nombre}: hay ${hay} en stock, no se pueden entregar ${pedida}.`);
    return { m, pedida, item, hay };
  });
  const faltantes = plan.filter((p) => p.pedida < p.m.cantidad).map((p) => ({ nombre: p.m.nombre, unidad: p.m.unidad, cantidad: r2(p.m.cantidad - p.pedida) }));
  if (!motivoValeValido(d.motivo)) throw new ErpError("Selecciona el motivo del vale (PRODUCCION …).");
  if (faltantes.length && !observacionParcialValida(d.observaciones)) throw new ErpError(AVISO_OBS_PARCIAL);
  const lineas: LineaEntrega[] = [];
  for (const { m, pedida, item, hay } of plan) {
    let vpi: string | undefined;
    if (pedida > 0 && item) vpi = (await retiroProduccion({ producto_id: item.id, cantidad_a_retirar: pedida, chasis_ot: op?.codigo_chasis || x.op_id || x.codigo_expediente, motivo: d.motivo, solicitante: d.recibe.trim(), autoriza: d.autoriza.trim() || usuario, op_id: x.op_id ?? x.codigo_expediente }, hay)).vpi;
    lineas.push({ materialId: m.id, nombre: m.nombre, unidad: m.unidad, pedido: m.cantidad, entregado: pedida, vpi });
  }
  const ruta: 1 | 2 = faltantes.length ? 2 : 1;
  let req: Requerimiento | undefined;
  if (ruta === 2)
    req = await crearRequerimiento(
      { fecha: hoy(), sede: d.sedeReq, solicitante: usuario, motivo: `${x.codigo_expediente} · ${x.op_id ?? x.lote ?? "lote mixto"} · faltante de materiales para producción`, items: faltantes.map((f) => ({ id: uid(), nombre: f.nombre, cantidad: f.cantidad, unidad: f.unidad, marca: "", caracteristica: x.codigo_expediente })), tipo: "BIEN" },
      "ALMACEN"
    );
  const acta: ActaEntrega = { numero: `AEM-${x.codigo_expediente}`, fecha: new Date().toISOString(), entrega: usuario, recibe: d.recibe.trim(), lineas, observaciones: d.observaciones.trim() };
  return guardar(x, 3, ruta === 1 ? "Ruta 1 · stock suficiente: entrega completa a Producción" : "Ruta 2 · sin stock: entrega parcial y requerimiento a Logística", req ? `${req.numero} · ${faltantes.length} faltante(s)` : `${lineas.length} línea(s)`, (D) => ({ ...D, ruta, actaParcial: acta, reqIds: req ? [...D.reqIds, req.id] : D.reqIds }));
}

export function reportarAvance(x: Expediente, porcentaje: number, nota: string): Promise<Expediente> {
  if (!(porcentaje >= 0 && porcentaje <= 100)) throw new ErpError("El avance va de 0 a 100 %.");
  if (!nota.trim()) throw new ErpError("Describa el avance.");
  if (!x.datos.ruta) throw new ErpError("La fabricación inicia cuando Almacén entrega materiales.");
  return guardar(x, 8, "Reporte de avance", `${porcentaje} % · ${nota.trim()}`, (D) => ({ ...D, avances: [...D.avances, { fecha: new Date().toISOString(), usuario: getSesion()?.usuario ?? "", porcentaje, nota: nota.trim() }] }));
}

export function registrarHoras(x: Expediente, h: Omit<Horas, "id" | "usuario">): Promise<Expediente> {
  if (!h.recurso.trim()) throw new ErpError("Indique la máquina o el trabajador.");
  if (!(h.horas > 0)) throw new ErpError("Indique las horas.");
  if (!(h.tarifa >= 0)) throw new ErpError("Indique la tarifa por hora.");
  return guardar(x, 8, h.tipo === "MAQUINA" ? "Horas máquina" : "Horas mano de obra", `${h.recurso} · ${h.horas} h × S/ ${h.tarifa}`, (D) => ({ ...D, horas: [...D.horas, { ...h, id: uid(), recurso: h.recurso.trim(), usuario: getSesion()?.usuario ?? "" }] }));
}

// ---- FASE 4 · Cotización (origen de la verdad) y OC -------------------------------------------

export const BUCKET_COTIZACIONES = "cotizaciones";
export const TIPOS_ARCHIVO_COTI: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
};
export const MAX_ARCHIVO_COTI = 10 * 1024 * 1024;

/** Sube un archivo del expediente al bucket privado: cotizaciones/26W-001/<nombre>-<hora>.<ext>. Devuelve la ruta. */
export async function subirArchivoExp(codigo: string, archivo: File, nombre: string): Promise<string> {
  const ext = TIPOS_ARCHIVO_COTI[archivo.type];
  if (!ext) throw new ErpError("Formato no admitido: PDF, imagen (JPG / PNG / WEBP) o Excel.");
  if (archivo.size > MAX_ARCHIVO_COTI) throw new ErpError("El archivo pasa de 10 MB.");
  const ruta = `${codigo}/${nombre}-${Date.now()}.${ext}`;
  const { error } = await createClient().storage.from(BUCKET_COTIZACIONES).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw new ErpError(`No se pudo subir el archivo: ${error.message}`);
  return ruta;
}

export async function abrirArchivoExp(ruta: string): Promise<void> {
  const w = window.open("", "_blank");
  const { data, error } = await createClient().storage.from(BUCKET_COTIZACIONES).createSignedUrl(ruta, 300);
  if (error || !data) {
    w?.close();
    throw new ErpError(`No se pudo abrir el archivo: ${error?.message ?? "sin respuesta"}`);
  }
  if (w) w.location.href = data.signedUrl;
}

export type DatosCotizacion = Pick<CotizacionExp, "ruc" | "razon_social" | "direccion" | "celular" | "asesor_ventas" | "nro_cotizacion" | "banco" | "cuenta_bancaria" | "cci" | "condicion_pago" | "motivo_compra" | "fecha_cotizacion" | "validez_dias" | "moneda" | "subtotal">;

export interface RespuestaRuc {
  ruc: string;
  razon_social: string;
  estado: string;
  condicion: string;
  direccion: string;
  validado: boolean;
}

/** Valida el RUC en SUNAT por Decolecta (Edge Function validar-ruc-decolecta). Con cotización, guarda el resultado en ella. */
export async function validarRucDecolecta(ruc: string, cotizacionId?: string): Promise<RespuestaRuc> {
  // Misma consulta que el resto del ERP (lib/ruc): el RUC queda en el padrón ruc_validados para todos los módulos.
  const r = await validarRuc(ruc, { cotizacionId, forzar: true });
  if (cotizacionId) await recargarExpedientes();
  return r;
}

/** Logística sube la cotización: archivo + datos del proveedor. Luego se valida el RUC (Decolecta) antes de la OC. */
export async function registrarCotizacion(x: Expediente, d: DatosCotizacion, archivo: File | null): Promise<{ cotizacion: CotizacionExp; aviso?: string }> {
  const { usuario } = exigir(4);
  if (x.datos.ruta !== 2) throw new ErpError("La cotización corresponde a la ruta 2 (sin stock).");
  if (!archivo) throw new ErpError("Adjunte la cotización del proveedor (PDF, imagen o Excel).");
  const ruc = d.ruc.replace(/\D/g, "");
  if (!rucValido(ruc)) throw new ErpError(`RUC ${ruc || "vacío"} no es válido (11 dígitos y dígito verificador).`);
  if (!d.razon_social.trim()) throw new ErpError("Indique la razón social.");
  if (!d.nro_cotizacion?.trim()) throw new ErpError("Indique el N° de cotización.");
  if (d.cci && d.cci.replace(/\D/g, "").length !== 20) throw new ErpError("El CCI debe tener 20 dígitos.");
  if (d.celular && !/^9\d{8}$/.test(d.celular.replace(/\D/g, ""))) throw new ErpError("El celular debe tener 9 dígitos y empezar con 9.");
  if (!(Number(d.subtotal) > 0)) throw new ErpError("Indique el subtotal (sin IGV) de la cotización.");
  const subtotal = r2(Number(d.subtotal));
  const igv = r2(subtotal * IGV);
  const ruta = await subirArchivoExp(x.codigo_expediente, archivo, "cotizacion");
  const { data, error } = await createClient()
    .from("cotizaciones")
    .insert({
      ...d,
      expediente_id: x.id,
      ruc,
      razon_social: d.razon_social.trim(),
      cci: d.cci?.replace(/\D/g, "") || null,
      celular: d.celular?.replace(/\D/g, "") || null,
      nro_cotizacion: d.nro_cotizacion.trim().toUpperCase(),
      subtotal,
      igv,
      total: r2(subtotal + igv),
      archivo_url: ruta,
      archivo_nombre: archivo.name,
      created_by: usuario,
    })
    .select("*")
    .single();
  if (error) {
    await createClient().storage.from(BUCKET_COTIZACIONES).remove([ruta]);
    throw errorSb(error);
  }
  const c = data as CotizacionExp;
  await guardar(x, 4, "Cotización registrada", `${c.nro_cotizacion} · ${c.razon_social} · RUC ${c.ruc}`, (D) => D);
  // Al guardar se valida el RUC (Decolecta). Si el servicio falla, la cotización queda guardada y se revalida desde el expediente.
  try {
    const r = await validarRucDecolecta(ruc, c.id);
    return { cotizacion: c, aviso: r.validado ? undefined : `Cotización guardada, pero el proveedor está ${r.estado} / ${r.condicion}: no se podrá emitir OC.` };
  } catch (e) {
    return { cotizacion: c, aviso: `Cotización guardada. RUC sin validar: ${(e as Error).message}` };
  }
}

/**
 * Genera la OC desde la cotización: los datos del proveedor los copia la base (no se digitan).
 * Solo con RUC validado, ACTIVO y HABIDO. La OC añade el motivo sustentado, la fecha y el plazo de entrega.
 */
export async function generarOC(x: Expediente, cotizacionId: string, d: { motivo: string; fecha: string; plazoEntrega: string }): Promise<OrdenCompraExp> {
  const { usuario } = exigir(4);
  const c = estado.cotizaciones.find((q) => q.id === cotizacionId && q.expediente_id === x.id);
  if (!c) throw new ErpError("Cotización no encontrada en este expediente.");
  if (!cotizacionApta(c)) throw new ErpError(c.ruc_validado ? `El proveedor está ${c.ruc_estado} / ${c.condicion_habido} en SUNAT: no se puede emitir OC.` : "Valide primero el RUC con Decolecta.");
  if (d.motivo.trim().length < 15) throw new ErpError("Sustente el motivo de la compra (mínimo 15 caracteres).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErpError("Indique la fecha de la OC.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.plazoEntrega) || d.plazoEntrega < d.fecha) throw new ErpError("El plazo de entrega debe ser igual o posterior a la fecha de la OC.");
  // Mismo correlativo OC-2026-0001 que Tesorería: no se repiten números
  const codigo = await siguienteNumero("OC");
  const { data, error } = await createClient()
    .from("ordenes_compra")
    .insert({ expediente_id: x.id, cotizacion_id: c.id, codigo_oc: codigo, motivo_sustentado: d.motivo.trim(), fecha_oc: d.fecha, plazo_entrega: d.plazoEntrega, created_by: usuario })
    .select("*")
    .single();
  if (error) throw errorSb(error);
  const oc = data as OrdenCompraExp;
  await guardar(x, 4, "OC generada desde la cotización", `${oc.codigo_oc} · ${oc.datos_proveedor.razon_social} · S/ ${Number(oc.total).toFixed(2)}`, (D) => D);
  return oc;
}

// ---- FASE 5 · Finanzas paga (bancarización) y pide el comprobante ----------------------------

export async function registrarPago(x: Expediente, ocId: string, b: Omit<Bancarizacion, "usuario" | "registrado" | "voucher_url">, voucher: File | null): Promise<Expediente> {
  const { usuario } = exigir(5);
  const oc = estado.ocs.find((o) => o.id === ocId && o.expediente_id === x.id);
  if (!oc) throw new ErpError("OC no encontrada en este expediente.");
  if (oc.bancarizacion) throw new ErpError(`La ${oc.codigo_oc} ya tiene pago registrado.`);
  if (!MEDIOS_PAGO.includes(b.medio_pago as (typeof MEDIOS_PAGO)[number])) throw new ErpError("Elija el medio de pago.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || b.fecha > hoy()) throw new ErpError("Fecha de pago inválida.");
  if (!(b.monto > 0)) throw new ErpError("Indique el monto pagado.");
  const usd = oc.datos_proveedor.moneda === "USD";
  const obligatoria = Number(oc.total) >= (usd ? 500 : TOPE_BANCARIZACION);
  if (obligatoria && b.medio_pago === "EFECTIVO") throw new ErpError(`Desde ${usd ? "US$ 500" : `S/ ${TOPE_BANCARIZACION}`} el pago debe hacerse por el sistema financiero (Ley 28194).`);
  if (b.medio_pago !== "EFECTIVO" && (!b.codigo_operacion.trim() || !b.banco.trim())) throw new ErpError("Indique banco y código de operación.");
  if (obligatoria && !voucher) throw new ErpError("Adjunte la constancia (voucher) de la bancarización.");
  const voucher_url = voucher ? await subirArchivoExp(x.codigo_expediente, voucher, `voucher-${oc.codigo_oc}`) : undefined;
  const banc: Bancarizacion = { ...b, codigo_operacion: b.codigo_operacion.trim().toUpperCase(), banco: b.banco.trim(), monto: r2(b.monto), voucher_url, usuario, registrado: new Date().toISOString() };
  const { error } = await createClient().from("ordenes_compra").update({ bancarizacion: banc, estado: "PAGADA" }).eq("id", oc.id);
  if (error) throw errorSb(error);
  await recargarExpedientes();
  return guardar(x, 5, "Pago registrado (bancarización)", `${oc.codigo_oc} · ${banc.medio_pago} · ${banc.banco} · op. ${banc.codigo_operacion || "—"}`, (D) => D);
}

export function solicitarComprobante(x: Expediente, nota: string): Promise<Expediente> {
  return guardar(x, 5, "Comprobante solicitado a Logística", nota.trim() || undefined, (D) => ({ ...D, comprobanteSolicitado: { fecha: new Date().toISOString(), usuario: getSesion()?.usuario ?? "", nota: nota.trim() } }));
}

/** Logística registra el comprobante del proveedor (factura) sobre la OC. */
export async function registrarComprobante(x: Expediente, ocId: string, c: { tipo: string; numero: string; fecha: string }): Promise<Expediente> {
  const { usuario } = exigir(6);
  const oc = estado.ocs.find((o) => o.id === ocId && o.expediente_id === x.id);
  if (!oc) throw new ErpError("OC no encontrada en este expediente.");
  const numero = c.numero.trim().toUpperCase();
  if (!numero) throw new ErpError("Indique el N° del comprobante.");
  if (c.tipo === "FACTURA" && !/^[FE]\w{3}-\d{1,8}$/.test(numero)) throw new ErpError("Factura: use el formato de serie SUNAT, por ejemplo F001-00000123.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha) || c.fecha > hoy()) throw new ErpError("Fecha del comprobante inválida.");
  const { error } = await createClient().from("ordenes_compra").update({ comprobante: { tipo: c.tipo, numero, fecha: c.fecha, usuario }, estado: oc.bancarizacion ? "FACTURADA" : oc.estado }).eq("id", oc.id);
  if (error) throw errorSb(error);
  await recargarExpedientes();
  return guardar(x, 6, "Comprobante del proveedor registrado", `${oc.codigo_oc} · ${c.tipo} ${numero}`, (D) => D);
}

// ---- FASE 6 a 8 ---------------------------------------------------------------------------------

export function registrarTransporte(x: Expediente, t: Omit<Transporte, "id" | "registrado" | "usuario">): Promise<Expediente> {
  if (!t.sinFlete) {
    if (!t.empresa.trim()) throw new ErpError("Indique la empresa de transportes.");
    if (!rucValido(t.ruc.trim())) throw new ErpError(`RUC del transportista ${t.ruc || "vacío"} no es válido.`);
    exigirRucSunat(t.ruc, "del transportista");
    if (!t.guiaRemitente.trim()) throw new ErpError("Indique el N° de guía de remisión remitente.");
    if (!t.guiaTransportista.trim()) throw new ErpError("Indique el N° de guía del transportista.");
    if (!(t.costoFlete >= 0)) throw new ErpError("Indique el costo del flete.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.fechaEntrega)) throw new ErpError("Indique la fecha de entrega del transportista.");
  }
  const up = (s: string) => s.trim().toUpperCase();
  return guardar(x, 6, t.sinFlete ? "Sin flete · entrega directa del proveedor" : "Transporte registrado", t.sinFlete ? undefined : `${t.empresa.trim()} · ${up(t.guiaTransportista)} · S/ ${t.costoFlete}`, (D) => ({
    ...D,
    transportes: [...D.transportes, { ...t, id: uid(), empresa: t.empresa.trim(), ruc: t.ruc.trim(), guiaRemitente: up(t.guiaRemitente), guiaTransportista: up(t.guiaTransportista), ticket: up(t.ticket), placa: up(t.placa), facturaFlete: up(t.facturaFlete), costoFlete: r2(t.costoFlete || 0), registrado: new Date().toISOString(), usuario: getSesion()?.usuario ?? "" }],
  }));
}

export function actaEntregaCompleta(x: Expediente, d: { recibe: string; observaciones: string }): Promise<Expediente> {
  if (!d.recibe.trim()) throw new ErpError("Indique quién recibe en Producción.");
  if (resumen(x).fases[7] !== "PENDIENTE") throw new ErpError("Aún no corresponde: faltan pago o transporte.");
  const usuario = getSesion()?.usuario ?? "";
  return guardar(x, 7, "Acta de Entrega Completa de Materiales", `Recibe ${d.recibe.trim()}`, (D) => ({
    ...D,
    actaCompleta: { numero: `AEC-${x.codigo_expediente}`, fecha: new Date().toISOString(), entrega: usuario, recibe: d.recibe.trim(), lineas: (D.actaParcial?.lineas ?? []).filter((l) => l.entregado < l.pedido).map((l) => ({ ...l, entregado: l.pedido })), observaciones: d.observaciones.trim() },
  }));
}

/**
 * FASE 8 · Producción cierra: N° de serie, checklist de calidad y Acta de Entrega PT a Almacén (zona A1/B2/C3).
 * El QC firmado se sigue haciendo en Producción (crea el equipo terminado); el expediente se cierra cuando están ambos.
 */
export async function cerrarExpediente(x: Expediente, d: { numeroSerie: string; zona: (typeof ZONAS_PT)[number]; checklist: Record<string, boolean>; recibe: string; observaciones: string; unidades?: UnidadPT[] }): Promise<Expediente> {
  if (x.es_lote_mixto) return cerrarLoteMixto(x, d);
  const serie = d.numeroSerie.trim().toUpperCase();
  if (!serie) throw new ErpError("Indique el N° de serie del equipo.");
  if (!ZONAS_PT.includes(d.zona)) throw new ErpError("Elija la zona A1, B2 o C3.");
  if (!d.recibe.trim()) throw new ErpError("Indique quién recibe en Almacén.");
  const otro = estado.expedientes.find((e) => e.id !== x.id && e.datos.cierre?.numeroSerie === serie);
  if (otro) throw new ErpError(`El N° de serie ${serie} ya está en ${otro.codigo_expediente}.`);
  const r = resumen(x);
  if (FASES.slice(0, 7).some((n) => r.fases[n] !== "HECHA" && r.fases[n] !== "NO_APLICA")) throw new ErpError("Faltan fases anteriores por cerrar.");
  if (x.datos.cierre) throw new ErpError("El expediente ya tiene acta de entrega PT.");
  const usuario = getSesion()?.usuario ?? "";
  const qc = getOrdenesProduccion().find((o) => o.id === x.op_id)?.estado === "QC_APROBADO";
  return guardar(
    x,
    8,
    "Acta de Entrega PT a Almacén",
    `Serie ${serie} · zona ${d.zona}`,
    (D) => ({ ...D, cierre: { numeroSerie: serie, zona: d.zona, checklist: d.checklist, observaciones: d.observaciones.trim(), acta: { numero: `APT-${x.codigo_expediente}`, fecha: new Date().toISOString(), entrega: usuario, recibe: d.recibe.trim(), lineas: [], observaciones: d.observaciones.trim() } } }),
    qc ? { estado: "CERRADO" } : {}
  );
}

/**
 * FASE 8 · lote mixto: chasis y N° de serie de CADA unidad (por equipo del lote), checklist de calidad completo y
 * Acta de Entrega PT a Almacén (zona A1/B2/C3). Las series quedan en el detalle y el expediente se cierra.
 */
async function cerrarLoteMixto(x: Expediente, d: { zona: (typeof ZONAS_PT)[number]; checklist: Record<string, boolean>; recibe: string; observaciones: string; unidades?: UnidadPT[] }): Promise<Expediente> {
  if (!ZONAS_PT.includes(d.zona)) throw new ErpError("Elija la zona A1, B2 o C3.");
  if (!d.recibe.trim()) throw new ErpError("Indique quién recibe en Almacén.");
  if (x.datos.cierre) throw new ErpError("El expediente ya tiene acta de entrega PT.");
  const r = resumen(x);
  if (FASES.slice(0, 7).some((n) => r.fases[n] !== "HECHA" && r.fases[n] !== "NO_APLICA")) throw new ErpError("Faltan fases anteriores por cerrar.");
  const pendientesQC = CHECKLIST_QC.filter((c) => !d.checklist[c]);
  if (pendientesQC.length) throw new ErpError(`Control de calidad pendiente: ${pendientesQC.join(", ")}.`);
  const detalles = docsDe(x).detalles;
  const unidades = (d.unidades ?? []).map((u) => ({ ...u, chasis: u.chasis.trim().toUpperCase(), serie: u.serie.trim().toUpperCase() }));
  const esperadas = detalles.reduce((a, e) => a + e.cantidad, 0);
  if (unidades.length !== esperadas || unidades.some((u) => !u.chasis || !u.serie)) throw new ErpError(`Indique chasis y N° de serie de las ${esperadas} unidad(es) del lote.`);
  const repetido = (k: "chasis" | "serie") => unidades.map((u) => u[k]).find((v, i, a) => a.indexOf(v) !== i);
  if (repetido("chasis")) throw new ErpError(`El chasis ${repetido("chasis")} está repetido.`);
  if (repetido("serie")) throw new ErpError(`La serie ${repetido("serie")} está repetida.`);
  const usadas = new Set(estado.expedientes.filter((e) => e.id !== x.id).flatMap((e) => [e.datos.cierre?.numeroSerie, ...(e.datos.cierre?.unidades ?? []).map((u) => u.serie)]));
  const otra = unidades.find((u) => usadas.has(u.serie));
  if (otra) throw new ErpError(`La serie ${otra.serie} ya está en otro expediente.`);
  const sb = createClient();
  for (const e of detalles) {
    const suyas = unidades.filter((u) => u.detalleId === e.id).map((u) => ({ chasis: u.chasis, serie: u.serie }));
    const { error } = await sb
      .from("orden_produccion_detalles")
      .update({ unidades: suyas, codigo_chasis: suyas.length === 1 ? suyas[0].chasis : null, serie_motor: suyas.length === 1 ? suyas[0].serie : null })
      .eq("id", e.id);
    if (error) throw errorSb(error);
  }
  const usuario = getSesion()?.usuario ?? "";
  return guardar(
    x,
    8,
    "Acta de Entrega PT a Almacén · lote mixto",
    `${unidades.length} unidad(es) · zona ${d.zona}`,
    (D) => ({
      ...D,
      cierre: {
        numeroSerie: unidades.map((u) => u.serie).join(", "),
        zona: d.zona,
        checklist: d.checklist,
        observaciones: d.observaciones.trim(),
        unidades,
        acta: { numero: `APT-${x.codigo_expediente}`, fecha: new Date().toISOString(), entrega: usuario, recibe: d.recibe.trim(), lineas: [], observaciones: d.observaciones.trim() },
      },
    }),
    { estado: "CERRADO" }
  );
}

/** Cierra el expediente cuando ya tiene acta PT y la OP recibió el QC firmado en Producción. */
export function sincronizarCierre(x: Expediente): Promise<Expediente> | undefined {
  if (x.estado !== "ABIERTO" || !x.datos.cierre || getOrdenesProduccion().find((o) => o.id === x.op_id)?.estado !== "QC_APROBADO") return;
  return guardar(x, 8, "Expediente cerrado · QC aprobado y PT en almacén", undefined, (D) => D, { estado: "CERRADO" });
}

// ---------------------------------------------------------------------
// Búsqueda: código 26W, lote, OP, chasis, N° de serie, RUC, OC, REQ, guía, factura
// ---------------------------------------------------------------------

export function textoBusqueda(x: Expediente, d: Docs = docsDe(x)): string {
  const eq = d.op?.equipo_id ? getEquipos().find((e) => e.id === d.op!.equipo_id) : undefined;
  const D = x.datos;
  return [
    x.codigo_expediente,
    x.lote,
    x.op_id,
    D.producto,
    D.legal.cliente,
    D.legal.contrato,
    d.op?.codigo_chasis,
    d.op?.serie_motor,
    eq?.id,
    D.cierre?.numeroSerie,
    ...d.detalles.flatMap((e) => [e.modelo, e.tipo_equipo, ...e.unidades.flatMap((u) => [u.chasis, u.serie])]),
    ...d.reqs.map((q) => q.numero),
    ...d.cotizaciones.flatMap((c) => [c.ruc, c.razon_social, c.nro_cotizacion]),
    ...d.ocs.flatMap((o) => [o.codigo_oc, o.comprobante?.numero, o.bancarizacion?.codigo_operacion]),
    ...D.transportes.flatMap((t) => [t.ruc, t.empresa, t.guiaRemitente, t.guiaTransportista, t.ticket, t.placa, t.facturaFlete]),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

// ---------------------------------------------------------------------
// Notificaciones por rol (una por expediente y paso; sin spam: solo quien debe actuar)
//   OP nueva → Producción · Solicitud de materiales → Almacén · Sin stock (REQ) → Logística
//   OC emitida → Finanzas · Pago registrado / comprobante pedido → Logística
//   Transporte registrado → Almacén y Producción · Acta completa → Producción
// ---------------------------------------------------------------------

export interface AvisoExp {
  clave: string;
  tipo: "expediente";
  titulo: string;
  detalle: string;
  modulo: string;
  href: string;
  prioridad: number;
}

export function avisosExpedientes(perfil: PerfilPlanta | null, s: Pick<Estado, "expedientes" | "cotizaciones" | "ocs">): AvisoExp[] {
  if (!perfil || perfil === "gerencia") return [];
  const out: AvisoExp[] = [];
  const para = (destinos: PerfilFase[], a: Omit<AvisoExp, "tipo" | "modulo">) => {
    const d = destinos.find((x) => recibe(perfil, x));
    if (d) out.push({ ...a, tipo: "expediente", modulo: `Expediente · para ${NOMBRE_PERFIL[d]}` });
  };
  for (const x of s.expedientes) {
    if (x.estado !== "ABIERTO") continue;
    const d = docsDe(x, s);
    const r = resumen(x, d);
    const href = `/erp/expediente/${x.codigo_expediente}`;
    const cod = x.codigo_expediente;
    const D = x.datos;
    if (r.actual === 2) para(["produccion"], { clave: `exp:${cod}:op`, titulo: `${cod} · nueva OP ${x.op_id ?? ""}`, detalle: `${D.producto} · plazo ${x.plazo ?? "—"} · aceptar y pedir materiales`, href, prioridad: 1 });
    if (r.actual === 3) para(["almacen"], { clave: `exp:${cod}:sm`, titulo: `${cod} · solicitud de materiales`, detalle: `${D.solicitud?.materiales.length ?? 0} material(es) · validar stock y entregar`, href, prioridad: 1 });
    if (r.actual === 4) para(["logistica"], { clave: `exp:${cod}:req`, titulo: `${cod} · sin stock: cotizar y generar OC`, detalle: d.cotizaciones.length ? `${d.cotizaciones.length} cotización(es) · validar RUC y emitir OC` : "Subir la cotización del proveedor", href, prioridad: 1 });
    if (r.actual === 5) {
      const porPagar = d.ocs.filter((o) => !o.bancarizacion);
      if (porPagar.length) para(["finanzas"], { clave: `exp:${cod}:pago:${porPagar.map((o) => o.codigo_oc).join(",")}`, titulo: `${cod} · OC por pagar`, detalle: porPagar.map((o) => `${o.codigo_oc} S/ ${Number(o.total).toFixed(2)}`).join(" · "), href, prioridad: 1 });
    }
    if (r.actual === 6) para(["logistica"], { clave: `exp:${cod}:pagado`, titulo: `${cod} · pago registrado`, detalle: D.comprobanteSolicitado ? `Finanzas pide el comprobante${D.comprobanteSolicitado.nota ? `: ${D.comprobanteSolicitado.nota}` : ""} · coordinar transporte` : "Coordinar transporte", href, prioridad: 2 });
    if (r.actual === 7) para(["almacen", "produccion"], { clave: `exp:${cod}:transporte:${D.transportes.length}`, titulo: `${cod} · material en camino`, detalle: D.transportes.map((t) => (t.sinFlete ? "Entrega directa del proveedor" : `${t.empresa} · guía ${t.guiaTransportista} · ${t.fechaEntrega}`)).join(" · "), href, prioridad: 2 });
    if (r.actual === 8 && D.actaCompleta) para(["produccion"], { clave: `exp:${cod}:completa`, titulo: `${cod} · materiales completos`, detalle: "Terminar fabricación, QC y acta PT", href, prioridad: 3 });
    if (r.vencido) para([RESPONSABLE[r.actual ?? 8]], { clave: `exp:${cod}:vencido:${hoy()}`, titulo: `${cod} · plazo vencido`, detalle: `Venció el ${x.plazo} · fase ${r.actual ?? 8} ${TITULO_FASE[r.actual ?? 8]}`, href, prioridad: 0 });
  }
  return out;
}
