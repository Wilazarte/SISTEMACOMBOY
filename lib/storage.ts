"use client";

// =====================================================================
// Capa de datos (Supabase + Realtime). Toda la lógica de negocio pasa por
// aquí; las páginas solo usan useStore / get* / las acciones exportadas.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSesion, rolNegocio } from "./auth";
import { createClient } from "./supabase/client";
import type {
  AliasHuellas,
  ArchivoGasto,
  ConcesionContratista,
  ComprobanteGasto,
  TipoGasto,
  ServicioContratista,
  CondicionPago,
  EstadoCivil,
  AsistenciaPeriodo,
  CuentaOrigenPago,
  Compra,
  Cotizacion,
  EventoHistorial,
  Factura,
  Guia,
  ItemCompra,
  OrdenCompra,
  Proveedor,
  Requerimiento,
  Rol,
  StockItem,
  TipoAfp,
  TipoSueldo,
  Trabajador,
  VistoBueno,
} from "./types";
import { generarCodigo } from "./utils/codigos";

export const KEYS = {
  REQS_PENDIENTES: "reqs_almacen_pendientes",
  REQS_PROCESADOS: "reqs_procesados_compras",
  COTIZACIONES: "cotizaciones",
  ORDENES: "ordenes_compra",
  FACTURAS: "facturas",
  GUIAS: "guias",
  CONTADORES: "erp_contadores",
  OBSERVACIONES: "observaciones_gerencia",
  TRABAJADORES: "CV_TRABAJADORES_V2",
  PROVEEDORES: "proveedores",
  COMPRAS: "compras_directas",
  STOCK: "almacen_stock",
  ASISTENCIA: "planilla_asistencia",
  CLIENTES: "ventas_clientes",
  COND_PAGO: "ventas_condiciones_pago",
  NOTAS_PEDIDO: "ventas_notas_pedido",
  COMPROBANTES: "ventas_comprobantes",
  COBROS: "ventas_cobros",
  ASIENTOS: "ventas_asientos",
  DESPACHOS: "almacen_despachos",
  // Planilla (nuevas)
  LIQUIDACIONES: "planilla_liquidaciones",
  CONTRATISTAS: "planilla_contratistas",
  HUELLAS_ALIAS: "planilla_huellas_alias",
  BOLETAS: "planilla_boletas",
  EQUIPOS: "almacen_equipos_terminados",
  PRODUCCION: "almacen_ordenes_produccion",
  MOVIMIENTOS: "almacen_movimientos",
  // Contable (tabla contable)
  CONTABLE_ASIENTOS: "contable_asientos",
  CONTABLE_PLAN: "contable_plan_cuentas",
  CONTABLE_CIERRES: "contable_cierres",
} as const;

export type StoreKey = (typeof KEYS)[keyof typeof KEYS];

const EVENTO = "erp:update";

export const IGV = 0.18;
/** Tope para compras con Declaración Jurada (sin comprobante). Ajustable. */
export const TOPE_DJ = 700;

// ---------------------------------------------------------------------
// Utilidades base
// ---------------------------------------------------------------------

export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const hoy = (): string => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

/**
 * Fecha (YYYY-MM-DD) + d días, sin romper nunca: acepta "YYYY-MM-DD", "DD/MM/YYYY", ISO con hora o Date.
 * Fecha vacía / inválida -> se usa hoy. Días no numéricos (undefined, NaN) -> 0.
 */
export function sumarDias(fecha: string | Date | null | undefined, d: number | null | undefined): string {
  const base = aFechaSegura(fecha);
  const dias = Number.isFinite(Number(d)) ? Math.trunc(Number(d)) : 0;
  const f = new Date(`${base}T12:00:00`);
  f.setDate(f.getDate() + dias);
  return isNaN(f.getTime()) ? hoy() : f.toISOString().slice(0, 10);
}

/** Normaliza a YYYY-MM-DD (vacío o inválido -> hoy). */
export function aFechaSegura(fecha: string | Date | null | undefined): string {
  if (fecha instanceof Date) return isNaN(fecha.getTime()) ? hoy() : fecha.toISOString().slice(0, 10);
  const t = String(fecha ?? "").trim();
  if (!t) return hoy();
  let y: number, m: number, dd: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  const pe = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (iso) [y, m, dd] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (pe) [y, m, dd] = [Number(pe[3]), Number(pe[2]), Number(pe[1])];
  else return hoy();
  const f = new Date(Date.UTC(y, m - 1, dd, 12));
  // 31/09 o 30/02 no existen: Date los "corre" de mes, se rechazan
  if (isNaN(f.getTime()) || f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== dd) return hoy();
  return f.toISOString().slice(0, 10);
}

export const soles = (n: number): string =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fechaPE = (iso: string): string => {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** "DD/MM/YYYY" -> "YYYY-MM-DD", o "" si la fecha no existe (ej. 31/02/2026). */
export const parseFechaPE = (txt: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt.trim());
  if (!m) return "";
  const [, d, mo, y] = m;
  const f = new Date(Number(y), Number(mo) - 1, Number(d));
  if (f.getFullYear() !== Number(y) || f.getMonth() !== Number(mo) - 1 || f.getDate() !== Number(d)) return "";
  return `${y}-${mo}-${d}`;
};

export class ErpError extends Error {}

// ---------------------------------------------------------------------
// Persistencia en Supabase + Realtime
//
// La lógica de negocio sigue siendo síncrona: lee de una caché en memoria
// (cargada al iniciar sesión) y, al escribir, se envían a Supabase solo las
// filas que cambiaron (upsert / delete). Realtime aplica en la caché lo que
// hacen las otras PCs y refresca la pantalla al instante.
// ---------------------------------------------------------------------

type TablaDoc = "compras" | "almacen" | "planilla" | "ventas" | "contable";
type Destino =
  | { tabla: TablaDoc; tipo: string; forma: "lista" | "objeto" }
  | { tabla: "observaciones"; forma: "observaciones" }
  | { tabla: "condiciones_pago"; forma: "condiciones" }; // tabla con columnas propias

const DESTINOS: Record<StoreKey, Destino> = {
  [KEYS.REQS_PENDIENTES]: { tabla: "compras", tipo: "req_pendiente", forma: "lista" },
  [KEYS.REQS_PROCESADOS]: { tabla: "compras", tipo: "req_procesado", forma: "lista" },
  [KEYS.COTIZACIONES]: { tabla: "compras", tipo: "cotizacion", forma: "lista" },
  [KEYS.ORDENES]: { tabla: "compras", tipo: "orden", forma: "lista" },
  [KEYS.FACTURAS]: { tabla: "compras", tipo: "factura", forma: "lista" },
  [KEYS.GUIAS]: { tabla: "compras", tipo: "guia", forma: "lista" },
  [KEYS.PROVEEDORES]: { tabla: "compras", tipo: "proveedor", forma: "lista" },
  [KEYS.COMPRAS]: { tabla: "compras", tipo: "compra_directa", forma: "lista" },
  [KEYS.CONTADORES]: { tabla: "compras", tipo: "contador", forma: "objeto" },
  [KEYS.STOCK]: { tabla: "almacen", tipo: "stock", forma: "lista" },
  [KEYS.TRABAJADORES]: { tabla: "planilla", tipo: "trabajador", forma: "lista" },
  [KEYS.ASISTENCIA]: { tabla: "planilla", tipo: "asistencia", forma: "lista" },
  [KEYS.CLIENTES]: { tabla: "ventas", tipo: "cliente", forma: "lista" },
  [KEYS.COND_PAGO]: { tabla: "condiciones_pago", forma: "condiciones" },
  [KEYS.NOTAS_PEDIDO]: { tabla: "ventas", tipo: "nota_pedido", forma: "lista" },
  [KEYS.COMPROBANTES]: { tabla: "ventas", tipo: "comprobante", forma: "lista" },
  [KEYS.COBROS]: { tabla: "ventas", tipo: "cobro", forma: "lista" },
  [KEYS.ASIENTOS]: { tabla: "ventas", tipo: "asiento", forma: "lista" },
  [KEYS.DESPACHOS]: { tabla: "almacen", tipo: "despacho", forma: "lista" },
  [KEYS.LIQUIDACIONES]: { tabla: "planilla", tipo: "liquidacion", forma: "lista" },
  [KEYS.CONTRATISTAS]: { tabla: "planilla", tipo: "contratista", forma: "lista" },
  [KEYS.HUELLAS_ALIAS]: { tabla: "planilla", tipo: "huella_alias", forma: "objeto" },
  [KEYS.BOLETAS]: { tabla: "planilla", tipo: "boleta", forma: "lista" },
  [KEYS.EQUIPOS]: { tabla: "almacen", tipo: "EQUIPO_TERMINADO", forma: "lista" },
  [KEYS.PRODUCCION]: { tabla: "almacen", tipo: "ORDEN_PRODUCCION", forma: "lista" },
  [KEYS.MOVIMIENTOS]: { tabla: "almacen", tipo: "MOVIMIENTO_ALMACEN", forma: "lista" },
  [KEYS.CONTABLE_ASIENTOS]: { tabla: "contable", tipo: "ASIENTO_DIARIO", forma: "lista" },
  [KEYS.CONTABLE_PLAN]: { tabla: "contable", tipo: "PLAN_CUENTAS", forma: "lista" },
  [KEYS.CONTABLE_CIERRES]: { tabla: "contable", tipo: "CIERRE_MENSUAL", forma: "lista" },
  [KEYS.OBSERVACIONES]: { tabla: "observaciones", forma: "observaciones" },
};
const TABLAS = ["compras", "almacen", "planilla", "ventas", "observaciones", "condiciones_pago", "contable"] as const;
/**
 * Fila única de las claves tipo "objeto" (contadores). Es un UUID fijo para que funcione
 * aunque la columna id de la tabla sea de tipo uuid (antes era "principal").
 */
const ID_OBJETO = "00000000-0000-0000-0000-000000000001";

type Fila = Record<string, unknown> & { id: string };
interface FilaObs {
  id: string;
  modulo: string;
  texto: string;
  usuario: string;
  fecha: string;
}

const cache = new Map<StoreKey, unknown>();
/** Última versión conocida en el servidor: clave -> (id -> JSON de la fila). */
const servidor = new Map<StoreKey, Map<string, string>>();
const pendientes = new Map<StoreKey, number>(); // escrituras en curso por clave
const sucias = new Set<StoreKey>(); // recibieron Realtime mientras se escribía: recargar al terminar
let cola: Promise<void> = Promise.resolve();
let canal: RealtimeChannel | null = null;
let carga: Promise<void> | null = null;

const clonar = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const avisar = (key: StoreKey) => window.dispatchEvent(new CustomEvent(EVENTO, { detail: key }));
const avisarError = (msg: string) => window.dispatchEvent(new CustomEvent("erp:toast", { detail: { msg, tipo: "error" } }));

/** Fila de public.condiciones_pago <-> CondicionPago. */
// Acepta tablas creadas a mano: nombre/descripcion, tipo en minúsculas, dias/dias_credito, activo/estado...
function condicionDeFila(f: Fila): CondicionPago {
  const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
  const nombre = texto(f.nombre ?? f.name ?? f.descripcion ?? f.condicion) || texto(f.codigo) || String(f.id);
  const dias = Math.max(0, Math.round(Number(f.dias ?? f.dias_credito ?? f.plazo ?? f.plazo_dias) || 0));
  const tipoTxt = texto(f.tipo).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tipo: CondicionPago["tipo"] =
    tipoTxt.startsWith("CRED") || (!tipoTxt && /cr[eé]dito/i.test(nombre)) || (!tipoTxt && dias > 0)
      ? "CREDITO"
      : tipoTxt.startsWith("PERSONAL") || (!tipoTxt && /personaliz/i.test(nombre))
        ? "PERSONALIZADO"
        : "CONTADO";
  const activo = f.activo === undefined || f.activo === null ? !/^(INACTIV|ANULAD|0|FALSE)/i.test(texto(f.estado)) : f.activo !== false && f.activo !== "false";
  return {
    id: String(f.id),
    codigo: texto(f.codigo) || nombre.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 20),
    nombre,
    tipo,
    ...(f.medio ? { medio: String(f.medio) } : {}),
    // Crédito sin días en la tabla: se toman del nombre ("Crédito 30 días")
    dias: tipo === "CREDITO" && dias === 0 ? Number(/(\d+)\s*d/i.exec(nombre)?.[1] ?? 0) : dias,
    porcentajeInicial: Number(f.porcentaje_inicial) || 0,
    contraentrega: f.contraentrega === true,
    activo,
    orden: Number(f.orden ?? 100),
  };
}

/**
 * Carga las condiciones de pago directo de Supabase (no espera al inicio de sesión) y las deja en la caché
 * que usan la nota de pedido, los comprobantes y los clientes.
 */
export async function cargarCondicionesPago(): Promise<{ total: number; error?: string }> {
  const { data, error } = await createClient().from("condiciones_pago").select("*").order("nombre");
  if (error) {
    const falta = error.code === "42P01" || error.code === "PGRST205";
    return { total: 0, error: falta ? "No existe la tabla condiciones_pago en Supabase: ejecute supabase/condiciones_pago.sql." : `condiciones_pago: ${error.message} (${error.code ?? "?"})` };
  }
  if (pendientes.get(KEYS.COND_PAGO)) return { total: (leer<CondicionPago[]>(KEYS.COND_PAGO, [])).length }; // no pisar un guardado en curso
  fijarDesdeServidor(KEYS.COND_PAGO, (data ?? []) as Fila[]);
  return { total: data?.length ?? 0 };
}
const filaDeCondicion = (c: CondicionPago): Fila => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  tipo: c.tipo,
  medio: c.medio ?? null,
  dias: c.dias,
  porcentaje_inicial: c.porcentajeInicial,
  contraentrega: c.contraentrega,
  activo: c.activo,
  orden: c.orden ?? 100,
});

/** Valor de la app -> filas de la tabla. */
function aFilas(key: StoreKey, valor: unknown): Fila[] {
  const d = DESTINOS[key];
  if (d.forma === "condiciones") return ((valor ?? []) as CondicionPago[]).map(filaDeCondicion);
  if (d.forma === "observaciones") {
    return Object.entries((valor ?? {}) as Record<string, Omit<FilaObs, "modulo">[]>).flatMap(([modulo, lista]) =>
      lista.map((o) => ({ id: o.id, modulo, texto: o.texto, usuario: o.usuario, fecha: o.fecha }))
    );
  }
  if (d.forma === "objeto") return [{ tipo: d.tipo, id: ID_OBJETO, data: valor ?? {} }];
  return ((valor ?? []) as { id: string }[]).map((item) => ({ tipo: d.tipo, id: String(item.id), data: item }));
}

/** Filas de la tabla (más nuevas primero) -> valor de la app. */
function deFilas(key: StoreKey, filas: Fila[]): unknown {
  const d = DESTINOS[key];
  if (d.forma === "condiciones")
    // Por nombre ("Crédito 7 días" antes que "Crédito 15 días")
    return filas.map(condicionDeFila).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true, sensitivity: "base" }));
  if (d.forma === "observaciones") {
    const r: Record<string, Omit<FilaObs, "modulo">[]> = {};
    [...(filas as unknown as FilaObs[])]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .forEach(({ modulo, ...o }) => (r[modulo] ??= []).push(o));
    return r;
  }
  if (d.forma === "objeto") {
    // Si quedara también la fila antigua ("principal"), se toma el número más alto de cada serie
    const r: Record<string, unknown> = {};
    filas.forEach((f) =>
      Object.entries((f.data ?? {}) as Record<string, unknown>).forEach(([k, v]) => {
        r[k] = typeof v === "number" && typeof r[k] === "number" ? Math.max(v, r[k] as number) : r[k] ?? v;
      })
    );
    return r;
  }
  // Filas creadas a mano en Supabase pueden no traer "id" dentro de data: se toma el de la columna id
  return filas.map((f) => {
    const dato = (f.data ?? {}) as Record<string, unknown>;
    return dato.id ? dato : { ...dato, id: String(f.id) };
  });
}

/** Claves ordenadas: jsonb no conserva el orden original y no debe contar como cambio. */
const ordenar = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordenar)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]))
      : v;
const firma = (f: Fila) => JSON.stringify(ordenar(f));

function claveDeFila(tabla: string, tipo: unknown): StoreKey | undefined {
  return (Object.keys(DESTINOS) as StoreKey[]).find((k) => {
    const d = DESTINOS[k];
    return d.tabla === tabla && (d.forma === "observaciones" || d.forma === "condiciones" || d.tipo === tipo);
  });
}

const COLUMNAS_SERVIDOR = ["created_at", "updated_at", "updated_by", "created_by"];

function fijarDesdeServidor(key: StoreKey, filas: Fila[]): void {
  const limpias = filas.map((f) => {
    const r = Object.fromEntries(Object.entries(f).filter(([k]) => !COLUMNAS_SERVIDOR.includes(k))) as Fila;
    // timestamptz vuelve como "+00:00": se deja en el mismo formato ISO que genera la app
    if (typeof r.fecha === "string" && DESTINOS[key].forma === "observaciones") r.fecha = new Date(r.fecha).toISOString();
    return r;
  });
  cache.set(key, deFilas(key, limpias));
  servidor.set(key, new Map(aFilas(key, cache.get(key)).map((f) => [f.id, firma(f)])));
  avisar(key);
}

/** Descarga todas las filas de una clave (paginado: PostgREST devuelve máx. 1000 por consulta). */
async function descargar(key: StoreKey): Promise<Fila[]> {
  const d = DESTINOS[key];
  const sb = createClient();
  const filas: Fila[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = sb.from(d.tabla).select("*");
    q =
      d.forma === "observaciones"
        ? q.order("fecha", { ascending: false })
        : d.forma === "condiciones"
          ? q.order("nombre")
          : q.eq("tipo", d.tipo).order("created_at", { ascending: false });
    const { data, error } = await q.range(desde, desde + 999);
    if (error) throw error;
    filas.push(...((data ?? []) as Fila[]));
    if (!data || data.length < 1000) return filas;
  }
}

async function recargar(key: StoreKey): Promise<void> {
  try {
    fijarDesdeServidor(key, await descargar(key));
  } catch (e) {
    avisarError(`No se pudo actualizar desde el servidor: ${(e as Error).message}`);
  }
}

/** Aplica un cambio de Realtime (de otra PC o el eco de uno propio). */
async function aplicarCambio(tabla: string, p: RealtimePostgresChangesPayload<Fila>): Promise<void> {
  const nuevo = p.new as Partial<Fila>;
  const viejo = p.old as Partial<Fila>;
  const key = claveDeFila(tabla, nuevo?.tipo ?? viejo?.tipo);
  if (!key) return;
  if ((pendientes.get(key) ?? 0) > 0) {
    sucias.add(key); // hay escrituras propias en curso: se recarga al terminar
    return;
  }
  // Se relee la clave completa: evita depender del tamaño del mensaje (guías con archivo)
  // y mantiene el orden correcto de la lista.
  await recargar(key);
}

/** Tablas de módulos nuevos: si aún no existen en Supabase, su módulo queda vacío en vez de bloquear todo. */
const TABLAS_OPCIONALES: string[] = ["ventas", "condiciones_pago", "contable"];

/** Tablas opcionales que no existen en Supabase (p. ej. contable antes de correr contable_tables.sql). */
const tablasFaltantes = new Set<string>();
export const tablaDisponible = (tabla: string): boolean => !tablasFaltantes.has(tabla);

const esTablaFaltante = (e: unknown): boolean => {
  const err = e as { code?: string; message?: string };
  return err?.code === "42P01" || err?.code === "PGRST205" || /does not exist|schema cache/i.test(err?.message ?? "");
};

/** Carga todos los datos permitidos para el usuario y se suscribe a Realtime. */
export function iniciarDatos(): Promise<void> {
  carga ??= (async () => {
    const claves = Object.keys(DESTINOS) as StoreKey[];
    // Una tabla opcional que aún no existe (ej. ventas antes de correr fix_ventas.sql) no bloquea el resto del ERP
    const faltantes = new Set<string>();
    const resultados = await Promise.all(
      claves.map((k) =>
        descargar(k)
          .catch((e) => {
            const tabla = DESTINOS[k].tabla;
            if (TABLAS_OPCIONALES.includes(tabla) && esTablaFaltante(e)) {
              faltantes.add(tabla);
              return [] as Fila[];
            }
            throw e;
          })
          .then((f) => [k, f] as const)
      )
    );
    resultados.forEach(([k, f]) => fijarDesdeServidor(k, f));
    tablasFaltantes.clear();
    faltantes.forEach((t) => tablasFaltantes.add(t));
    if (faltantes.has("contable") && getSesion()?.modulos.some((m) => m === "*" || m === "/dashboard/contable"))
      avisarError("Falta la tabla contable en Supabase: ejecute supabase/contable_tables.sql. El resto del ERP funciona normal.");
    if (faltantes.has("ventas")) avisarError("Falta la tabla de Ventas en Supabase: ejecute supabase/fix_ventas.sql. El resto del ERP funciona normal.");
    if (faltantes.has("condiciones_pago"))
      avisarError("Falta la tabla condiciones_pago en Supabase: ejecute supabase/condiciones_pago.sql. El resto del ERP funciona normal.");

    const sb = createClient();
    let primera = true;
    canal = TABLAS.filter((t) => !faltantes.has(t)).reduce(
      (c, tabla) => c.on("postgres_changes", { event: "*", schema: "public", table: tabla }, (p) => void aplicarCambio(tabla, p as RealtimePostgresChangesPayload<Fila>)),
      sb.channel("erp-cambios")
    ).subscribe((estado) => {
      if (estado !== "SUBSCRIBED") return;
      // Al reconectar se recarga todo por si se perdieron cambios sin conexión
      if (!primera) claves.forEach((k) => void recargar(k));
      primera = false;
    });
  })().catch((e) => {
    carga = null;
    const err = e as { code?: string; message?: string };
    if (esTablaFaltante(err)) throw new ErpError("Faltan las tablas en Supabase: ejecute supabase_tables.sql en el SQL Editor.");
    throw new ErpError(`No se pudo conectar con Supabase: ${err.message ?? e}`);
  });
  return carga;
}

/** Al cerrar sesión: corta Realtime y vacía la caché. */
export async function detenerDatos(): Promise<void> {
  if (canal) await createClient().removeChannel(canal);
  canal = null;
  carga = null;
  cache.clear();
  servidor.clear();
  sucias.clear();
}

/** Hook del layout: carga los datos cuando hay sesión. */
export function useDatos(activo: boolean): { listo: boolean; error: string } {
  const [estado, setEstado] = useState({ listo: false, error: "" });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setEstado({ listo: false, error: "" });
    iniciarDatos()
      .then(() => vivo && setEstado({ listo: true, error: "" }))
      .catch((e) => vivo && setEstado({ listo: false, error: (e as Error).message }));
    return () => {
      vivo = false;
    };
  }, [activo, intento]);
  useEffect(() => {
    const reintentar = () => setIntento((n) => n + 1);
    window.addEventListener("erp:reintentar", reintentar);
    return () => window.removeEventListener("erp:reintentar", reintentar);
  }, []);
  return estado;
}

export function leer<T>(key: StoreKey, fallback: T): T {
  if (typeof window === "undefined" || !cache.has(key)) return fallback;
  return clonar(cache.get(key) as T);
}

/**
 * Guarda en la caché (la pantalla se actualiza al instante) y envía a Supabase
 * solo las filas nuevas, modificadas o eliminadas.
 */
export function escribir<T>(key: StoreKey, value: T): void {
  if (typeof window === "undefined") return;
  // DÍAS / TARD.: nunca se escriben directo (la base también lo rechaza con RLS)
  if (key === KEYS.ASISTENCIA) throw new ErpError(MSG_ASISTENCIA_BLOQUEADA);
  const d = DESTINOS[key];
  const filas = aFilas(key, value);
  const antes = servidor.get(key) ?? new Map<string, string>();
  const cambios = filas.filter((f) => antes.get(f.id) !== firma(f));
  const ids = new Set(filas.map((f) => f.id));
  const borrados = Array.from(antes.keys()).filter((id) => !ids.has(id));

  cache.set(key, clonar(value));
  servidor.set(key, new Map(filas.map((f) => [f.id, firma(f)])));
  avisar(key);
  if (cambios.length === 0 && borrados.length === 0) return;

  pendientes.set(key, (pendientes.get(key) ?? 0) + 1);
  cola = cola.then(async () => {
    const sb = createClient();
    try {
      if (cambios.length) {
        const conflicto = d.forma === "observaciones" || d.forma === "condiciones" ? "id" : "tipo,id";
        const { error } = await sb.from(d.tabla).upsert(cambios, { onConflict: conflicto });
        // 42P10: la tabla no tiene el índice único (tipo, id) -> se guarda fila por fila sin ON CONFLICT
        if (error?.code === "42P10") await guardarSinIndice(d, cambios);
        else if (error) throw error;
      }
      if (borrados.length) {
        let q = sb.from(d.tabla).delete().in("id", borrados);
        if (d.forma !== "observaciones" && d.forma !== "condiciones") q = q.eq("tipo", d.tipo);
        const { error } = await q;
        if (error) throw error;
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      errorEscritura ??= err.message ?? String(e);
      avisarError(
        err.code === "42501" ? "Su usuario no tiene permiso para guardar este cambio." : `No se guardó en el servidor: ${err.message ?? e}`
      );
      sucias.add(key); // se vuelve a lo que realmente hay en el servidor
    } finally {
      const n = (pendientes.get(key) ?? 1) - 1;
      pendientes.set(key, n);
      if (n === 0 && sucias.delete(key)) await recargar(key);
    }
  });
}

/**
 * Guardado sin ON CONFLICT (tablas creadas a mano sin índice único en tipo + id):
 * se actualiza la fila por su clave y, si no existía, se inserta.
 */
async function guardarSinIndice(d: Destino, filas: Fila[]): Promise<void> {
  const sb = createClient();
  for (const f of filas) {
    let q = sb.from(d.tabla).update(f).eq("id", f.id);
    if (d.forma === "lista" || d.forma === "objeto") q = q.eq("tipo", d.tipo);
    const { data, error } = await q.select("id");
    if (error) throw error;
    if (data && data.length > 0) continue;
    const ins = await sb.from(d.tabla).insert(f);
    if (ins.error) throw ins.error;
  }
}

let errorEscritura: string | undefined;

/** Espera a que Supabase confirme las escrituras en curso. Devuelve el primer error desde la última llamada. */
export async function esperarGuardado(): Promise<string | undefined> {
  await cola;
  const e = errorEscritura;
  errorEscritura = undefined;
  return e;
}

/** Hook reactivo: se actualiza cuando se escribe la clave en esta PC o llega un cambio de otra. */
export function useStore<T>(key: StoreKey, fallback: T): T {
  const [value, setValue] = useState<T>(() => leer<T>(key, fallback));
  useEffect(() => {
    const cargar = () => setValue(leer<T>(key, fallback));
    cargar();
    const onCambio = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) cargar();
    };
    window.addEventListener(EVENTO, onCambio);
    return () => window.removeEventListener(EVENTO, onCambio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

function evento(usuario: Rol, accion: string, detalle?: string): EventoHistorial {
  return { fecha: new Date().toISOString(), usuario, accion, detalle };
}
export const nuevoEvento = evento;

/** Series con correlativo atómico en Supabase (siguiente_numero). */
export type Serie = "REQ" | "OC" | "DJ" | "NP" | "F001" | "B001" | "OD" | "BOL" | "GST" | "RCT" | "EQ" | "OP";

/** Actualiza la caché de contadores sin enviarla: el servidor ya tiene el valor. */
function fijarContador(serie: Serie, n: number): void {
  const c = leer<Record<string, number>>(KEYS.CONTADORES, {});
  if ((c[serie] ?? 0) >= n) return;
  const nuevo = { ...c, [serie]: n };
  cache.set(KEYS.CONTADORES, nuevo);
  servidor.set(KEYS.CONTADORES, new Map(aFilas(KEYS.CONTADORES, nuevo).map((f) => [f.id, firma(f)])));
  avisar(KEYS.CONTADORES);
}

/**
 * Siguiente correlativo, reservado en Supabase con siguiente_numero() (atómico):
 * dos PCs emitiendo a la vez nunca reciben el mismo número.
 */
async function siguiente(serie: Serie): Promise<number> {
  const { data, error } = await createClient().rpc("siguiente_numero", { serie });
  if (error) {
    if (error.code === "42501") throw new ErpError(error.message);
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
      throw new ErpError("Falta la función de numeración en Supabase: vuelva a ejecutar supabase_tables.sql.");
    throw new ErpError(`No se pudo obtener el número: ${error.message}`);
  }
  const n = Number(data);
  fijarContador(serie, n);
  return n;
}

/** Sube un contador a un mínimo (migración de datos antiguos). Nunca lo baja. */
export async function asegurarNumeroMinimo(serie: Serie, minimo: number): Promise<void> {
  const { data, error } = await createClient().rpc("asegurar_numero_minimo", { serie, minimo });
  if (error) throw new ErpError(`No se pudo ajustar la numeración ${serie}: ${error.message}`);
  fijarContador(serie, Number(data));
}

/** Número probable (referencial): el definitivo lo asigna Supabase al guardar. */
export function previewNumero(serie: Serie): string {
  const c = leer<Record<string, number>>(KEYS.CONTADORES, {});
  return formatear(serie, (c[serie] ?? 0) + 1);
}

function formatear(serie: Serie, n: number): string {
  if (serie === "REQ") return `REQ-ALM-${String(n).padStart(3, "0")}`;
  if (serie === "OC") return `OC-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  if (serie === "EQ" || serie === "OP") return `${serie}-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  if (serie === "DJ") return `DJ-${String(n).padStart(3, "0")}`;
  return `${serie}-${String(n).padStart(4, "0")}`; // NP-0001, F001-0001, B001-0001, OD-0001
}

/**
 * Código global BOL / GST / RCT (BOL-002-2026). Lo reserva Supabase (siguiente_numero): si falta la serie
 * en la función, avisa que se corra supabase/codigos_documentos.sql.
 */
async function reservarCodigo(tipo: "BOL" | "GST" | "RCT"): Promise<{ codigo: string; correlativo: number; anio: number }> {
  let n: number;
  try {
    n = await siguiente(tipo);
  } catch (e) {
    if (/serie inv/i.test((e as Error).message))
      throw new ErpError(`Falta habilitar la serie ${tipo} en Supabase: ejecute supabase/codigos_documentos.sql en el SQL Editor.`);
    throw e;
  }
  const anio = new Date().getFullYear();
  return { codigo: generarCodigo(tipo, n, anio), correlativo: n, anio };
}

/** Boleta de pago emitida: un código por trabajador y periodo (al volver a descargarla se reutiliza). */
export interface BoletaEmitida {
  id: string; // `${periodo}|${trabajadorId}`
  codigo: string;
  correlativo: number;
  anio: number;
  periodo: string;
  trabajadorId: string;
  nombre: string;
  totalPagar: number;
  fecha: string;
}

export const getBoletas = () => leer<BoletaEmitida[]>(KEYS.BOLETAS, []);

export async function codigoBoleta(periodo: string, trabajadorId: string, nombre: string, totalPagar: number): Promise<string> {
  const id = `${periodo}|${trabajadorId}`;
  const previa = getBoletas().find((b) => b.id === id);
  if (previa) {
    if (previa.totalPagar !== totalPagar) escribir(KEYS.BOLETAS, getBoletas().map((b) => (b.id === id ? { ...b, totalPagar, nombre } : b)));
    return previa.codigo;
  }
  const c = await reservarCodigo("BOL");
  escribir(KEYS.BOLETAS, [...getBoletas(), { id, ...c, periodo, trabajadorId, nombre, totalPagar, fecha: new Date().toISOString() }]);
  return c.codigo;
}

/** Código GST del gasto de Tesorería (se asigna una sola vez). */
export async function codigoGasto(facturaId: string): Promise<string> {
  const f = getFacturas().find((x) => x.id === facturaId);
  if (!f) throw new ErpError("Gasto no encontrado.");
  if (f.codigo) return f.codigo;
  const { codigo } = await reservarCodigo("GST");
  escribir(KEYS.FACTURAS, getFacturas().map((x) => (x.id === facturaId ? { ...x, codigo } : x)));
  return codigo;
}

/** Código RCT del contratista / concesión (se asigna una sola vez). */
export async function codigoContratista(id: string): Promise<string> {
  const lista = leer<ConcesionContratista[]>(KEYS.CONTRATISTAS, []);
  const c = lista.find((x) => x.id === id);
  if (!c) throw new ErpError("Contratista no encontrado.");
  if (c.codigo) return c.codigo;
  const { codigo } = await reservarCodigo("RCT");
  escribir(KEYS.CONTRATISTAS, leer<ConcesionContratista[]>(KEYS.CONTRATISTAS, []).map((x) => (x.id === id ? { ...x, codigo } : x)));
  return codigo;
}

/** Número formateado reservado en Supabase (para ventas y despachos). */
export async function siguienteNumero(serie: Serie): Promise<string> {
  return formatear(serie, await siguiente(serie));
}

// ---------------------------------------------------------------------
// Lectores
// ---------------------------------------------------------------------

export const getPendientes = () => leer<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
export const getProcesados = () => leer<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
export const getCotizaciones = () => leer<Cotizacion[]>(KEYS.COTIZACIONES, []);
export const getOrdenes = () => leer<OrdenCompra[]>(KEYS.ORDENES, []);
export const getFacturas = () => leer<Factura[]>(KEYS.FACTURAS, []);
export const getGuias = () => leer<Guia[]>(KEYS.GUIAS, []);

export function buscarReq(id: string): Requerimiento | undefined {
  return getPendientes().find((r) => r.id === id) ?? getProcesados().find((r) => r.id === id);
}

function actualizarProcesado(id: string, fn: (r: Requerimiento) => Requerimiento): void {
  const lista = getProcesados();
  const i = lista.findIndex((r) => r.id === id);
  if (i < 0) throw new ErpError("Requerimiento no encontrado en la lista de procesados.");
  lista[i] = fn(lista[i]);
  escribir(KEYS.REQS_PROCESADOS, lista);
}

function actualizarOC(id: string, fn: (o: OrdenCompra) => OrdenCompra): void {
  const lista = getOrdenes();
  const i = lista.findIndex((o) => o.id === id);
  if (i < 0) throw new ErpError("Orden de compra no encontrada.");
  lista[i] = fn(lista[i]);
  escribir(KEYS.ORDENES, lista);
}

// ---------------------------------------------------------------------
// 1. ALMACÉN: crea requerimiento
// ---------------------------------------------------------------------

export async function crearRequerimiento(
  data: Omit<Requerimiento, "id" | "numero" | "estado" | "historial">,
  rol: Rol
): Promise<Requerimiento> {
  if (!data.sede.trim()) throw new ErpError("Seleccione la sede.");
  if (!data.solicitante.trim()) throw new ErpError("Ingrese el solicitante.");
  if (!data.motivo.trim()) throw new ErpError("Ingrese el motivo del requerimiento.");
  const items = data.items.filter((i) => i.nombre.trim());
  if (items.length === 0) throw new ErpError("Agregue al menos un producto.");
  if (items.some((i) => !(i.cantidad > 0))) throw new ErpError("Todas las cantidades deben ser mayores a 0.");

  const req: Requerimiento = {
    ...data,
    items,
    id: uid(),
    numero: formatear("REQ", await siguiente("REQ")),
    estado: "PENDIENTE",
    historial: [evento(rol, "Requerimiento emitido", `${items.length} producto(s) · Sede ${data.sede}`)],
  };
  escribir(KEYS.REQS_PENDIENTES, [req, ...getPendientes()]);
  return req;
}

/** Almacén corrige un REQ observado y lo reenvía a Tesorería. */
export function reenviarRequerimiento(
  id: string,
  cambios: Pick<Requerimiento, "items" | "motivo" | "sede" | "solicitante">,
  rol: Rol
): void {
  const lista = getProcesados();
  const req = lista.find((r) => r.id === id);
  if (!req || req.estado !== "OBSERVADO") throw new ErpError("Solo se pueden reenviar requerimientos OBSERVADOS.");
  const items = cambios.items.filter((i) => i.nombre.trim());
  if (items.length === 0) throw new ErpError("Agregue al menos un producto.");
  const actualizado: Requerimiento = {
    ...req,
    ...cambios,
    items,
    estado: "PENDIENTE",
    historial: [...req.historial, evento(rol, "Corregido y reenviado a Tesorería")],
  };
  escribir(KEYS.REQS_PROCESADOS, lista.filter((r) => r.id !== id));
  escribir(KEYS.REQS_PENDIENTES, [actualizado, ...getPendientes()]);
}

// ---------------------------------------------------------------------
// 2. TESORERÍA: revisa notificaciones
//    ACEPTAR  -> sale de notificaciones, QUEDA en lista con ACEPTADO
//    RECHAZAR -> se borra de TODO el sistema
//    OBSERVAR -> sale de notificaciones, queda en lista OBSERVADO (Almacén corrige)
// ---------------------------------------------------------------------

function sacarDePendientes(id: string): Requerimiento {
  const pend = getPendientes();
  const req = pend.find((r) => r.id === id);
  if (!req) throw new ErpError("El requerimiento ya no está pendiente (quizá fue procesado en otra pestaña).");
  escribir(KEYS.REQS_PENDIENTES, pend.filter((r) => r.id !== id));
  return req;
}

export function aceptarRequerimiento(id: string, rol: Rol): void {
  const req = sacarDePendientes(id);
  const aceptado: Requerimiento = {
    ...req,
    estado: "ACEPTADO",
    observacion: undefined,
    historial: [...req.historial, evento(rol, "Aceptado por Tesorería")],
  };
  escribir(KEYS.REQS_PROCESADOS, [aceptado, ...getProcesados().filter((r) => r.id !== id)]);
}

export function rechazarRequerimiento(id: string): void {
  // Borrado total: notificaciones + lista de procesados
  escribir(KEYS.REQS_PENDIENTES, getPendientes().filter((r) => r.id !== id));
  escribir(KEYS.REQS_PROCESADOS, getProcesados().filter((r) => r.id !== id));
}

export function observarRequerimiento(id: string, motivo: string, rol: Rol): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la observación.");
  const req = sacarDePendientes(id);
  const obs: Requerimiento = {
    ...req,
    estado: "OBSERVADO",
    observacion: motivo.trim(),
    historial: [...req.historial, evento(rol, "Observado por Tesorería", motivo.trim())],
  };
  escribir(KEYS.REQS_PROCESADOS, [obs, ...getProcesados().filter((r) => r.id !== id)]);
}

// ---------------------------------------------------------------------
// 3. COTIZACIÓN (vinculada a REQ aceptado)
// ---------------------------------------------------------------------

export const rucValido = (ruc: string): boolean => {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = f.reduce((a, w, i) => a + w * Number(ruc[i]), 0);
  const d = 11 - (s % 11);
  const dv = d === 10 ? 0 : d === 11 ? 1 : d;
  return dv === Number(ruc[10]);
};

export function crearCotizacion(
  data: Pick<Cotizacion, "numero" | "fechaEmision" | "reqId" | "proveedor" | "ruc" | "items">,
  rol: Rol
): Cotizacion {
  const req = getProcesados().find((r) => r.id === data.reqId);
  if (!req) throw new ErpError("Seleccione un requerimiento válido.");
  if (req.estado !== "ACEPTADO" && req.estado !== "COTIZADO")
    throw new ErpError(`El ${req.numero} está ${req.estado}; solo se cotizan REQ aceptados.`);
  if (!data.proveedor.trim()) throw new ErpError("Ingrese el proveedor.");
  if (!rucValido(data.ruc)) throw new ErpError("RUC inválido (11 dígitos con dígito verificador correcto).");
  if (!data.numero.trim()) throw new ErpError("Ingrese el Nro de cotización.");
  if (getCotizaciones().some((c) => c.numero === data.numero.trim() && c.ruc === data.ruc))
    throw new ErpError("Esa cotización ya fue registrada para este proveedor.");
  if (data.items.some((i) => !(i.precioUnit > 0))) throw new ErpError("Ingrese precio unitario > 0 en todos los productos.");

  const items = data.items.map((i) => ({ ...i, subtotal: r2(i.cantidad * i.precioUnit) }));
  const subtotal = r2(items.reduce((a, i) => a + i.subtotal, 0));
  const igv = r2(subtotal * IGV);
  const coti: Cotizacion = {
    ...data,
    numero: data.numero.trim(),
    proveedor: data.proveedor.trim().toUpperCase(),
    items,
    id: uid(),
    reqNumero: req.numero,
    subtotal,
    igv,
    total: r2(subtotal + igv),
    estado: "REGISTRADA",
    historial: [evento(rol, "Cotización registrada", `${data.proveedor} · ${req.numero}`)],
  };
  escribir(KEYS.COTIZACIONES, [coti, ...getCotizaciones()]);
  if (req.estado === "ACEPTADO") {
    actualizarProcesado(req.id, (r) => ({
      ...r,
      estado: "COTIZADO",
      historial: [...r.historial, evento(rol, "Cotizado", `Cot. ${coti.numero} · ${coti.proveedor}`)],
    }));
  }
  return coti;
}

// ---------------------------------------------------------------------
// 4. ORDEN DE COMPRA (vinculada a COTIZACIÓN)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Comprobante de pago y origen de la OC (baucher en Supabase Storage)
// ---------------------------------------------------------------------

export const CUENTAS_ORIGEN_PAGO: Record<CuentaOrigenPago, string> = {
  caja_general: "CAJA GENERAL",
  caja_chica: "CAJA CHICA",
  fondo_reserva: "FONDO DE RESERVA",
};

/** Bucket privado de Storage y carpeta de los bauchers (equivale a /uploads/tesoreria/vouchers/). */
export const BUCKET_TESORERIA = "tesoreria";
export const MAX_VOUCHER = 5 * 1024 * 1024;
export const TIPOS_VOUCHER: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export function validarVoucher(file: File): void {
  if (!TIPOS_VOUCHER[file.type]) throw new ErpError("Formato no permitido: suba JPG, PNG o PDF.");
  if (file.size > MAX_VOUCHER) throw new ErpError(`El baucher pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 5 MB.`);
}

function validarPagoOC(data: Partial<Pick<OrdenCompra, "cuentaOrigenPago" | "voucherMonto">>): void {
  if (!data.cuentaOrigenPago || !(data.cuentaOrigenPago in CUENTAS_ORIGEN_PAGO)) throw new ErpError("Seleccione de qué cuenta se realiza el pago.");
  if (data.voucherMonto !== undefined && !(data.voucherMonto >= 0)) throw new ErpError("El monto del baucher no puede ser negativo.");
}

/** Sube el baucher a Storage (tesoreria/vouchers/<id>.<ext>) y devuelve su ruta. */
async function subirVoucher(file: File): Promise<string> {
  validarVoucher(file);
  const ruta = `vouchers/${uid()}.${TIPOS_VOUCHER[file.type]}`;
  const { error } = await createClient().storage.from(BUCKET_TESORERIA).upload(ruta, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new ErpError("Falta el almacenamiento de bauchers en Supabase: ejecute supabase/fix_vouchers.sql.");
    if (/row-level security|unauthorized|403/i.test(error.message)) throw new ErpError("Su usuario no puede subir bauchers.");
    throw new ErpError(`No se pudo subir el baucher: ${error.message}`);
  }
  return ruta;
}

/** URL temporal (5 min) para ver un baucher privado. */
export async function urlVoucher(ruta: string): Promise<string> {
  const { data, error } = await createClient().storage.from(BUCKET_TESORERIA).createSignedUrl(ruta, 300);
  if (error || !data) throw new ErpError(`No se pudo abrir el baucher: ${error?.message ?? "sin respuesta"}`);
  return data.signedUrl;
}

/**
 * Emitir OC con cuenta de origen y baucher opcional: valida, sube el archivo y crea la OC.
 * Si la OC falla, el archivo subido se elimina (no quedan bauchers huérfanos).
 */
export async function emitirOrdenCompra(
  data: Pick<OrdenCompra, "fecha" | "cotizacionId" | "formaPago" | "tiempoEntrega" | "lugarEntrega" | "cuentaOrigenPago" | "voucherMonto"> &
    Partial<Pick<OrdenCompra, "almacenIngreso">>,
  voucher: File | null,
  rol: Rol
): Promise<OrdenCompra> {
  validarOrdenCompra(data);
  validarPagoOC(data);
  if (!voucher) return crearOrdenCompra({ ...data, voucherMonto: undefined }, rol);
  const ruta = await subirVoucher(voucher);
  try {
    return await crearOrdenCompra({ ...data, voucherUrl: ruta, voucherNombre: voucher.name, voucherTipo: voucher.type }, rol);
  } catch (e) {
    await createClient().storage.from(BUCKET_TESORERIA).remove([ruta]);
    throw e;
  }
}

function validarOrdenCompra(data: Pick<OrdenCompra, "cotizacionId" | "tiempoEntrega">): Cotizacion {
  const coti = getCotizaciones().find((c) => c.id === data.cotizacionId);
  if (!coti) throw new ErpError("Seleccione una cotización.");
  if (coti.estado === "CON_OC") throw new ErpError("Esta cotización ya tiene Orden de Compra.");
  if (getOrdenes().some((o) => o.reqId === coti.reqId))
    throw new ErpError(`El ${coti.reqNumero} ya tiene una Orden de Compra emitida con otra cotización.`);
  if (!data.tiempoEntrega.trim()) throw new ErpError("Indique el tiempo de entrega.");
  return coti;
}

export async function crearOrdenCompra(
  data: Pick<OrdenCompra, "fecha" | "cotizacionId" | "formaPago" | "tiempoEntrega" | "lugarEntrega"> &
    Partial<Pick<OrdenCompra, "cuentaOrigenPago" | "voucherUrl" | "voucherNombre" | "voucherTipo" | "voucherMonto" | "almacenIngreso">>,
  rol: Rol
): Promise<OrdenCompra> {
  validarOrdenCompra(data);
  validarPagoOC(data);
  const numero = formatear("OC", await siguiente("OC"));
  // Se revalida con los datos al día: otra PC pudo emitir OC para el mismo REQ mientras tanto
  const coti = validarOrdenCompra(data);

  const oc: OrdenCompra = {
    ...data,
    id: uid(),
    numero,
    cotizacionNumero: coti.numero,
    reqId: coti.reqId,
    reqNumero: coti.reqNumero,
    proveedor: coti.proveedor,
    ruc: coti.ruc,
    items: coti.items,
    subtotal: coti.subtotal,
    igv: coti.igv,
    total: coti.total,
    estado: "EMITIDA",
    cuentaOrigenPago: data.cuentaOrigenPago ?? "caja_general",
    historial: [
      evento(
        rol,
        "Orden de compra emitida",
        `Desde Cot. ${coti.numero} · Pago desde ${CUENTAS_ORIGEN_PAGO[data.cuentaOrigenPago ?? "caja_general"]}${data.voucherUrl ? " · con baucher" : ""}`
      ),
    ],
  };
  escribir(KEYS.ORDENES, [oc, ...getOrdenes()]);
  escribir(
    KEYS.COTIZACIONES,
    getCotizaciones().map((c) =>
      c.id === coti.id
        ? { ...c, estado: "CON_OC" as const, historial: [...c.historial, evento(rol, "Adjudicada", oc.numero)] }
        : c
    )
  );
  actualizarProcesado(coti.reqId, (r) => ({
    ...r,
    estado: "COMPRADO",
    historial: [...r.historial, evento(rol, "Orden de compra emitida", `${oc.numero} · ${oc.proveedor}`)],
  }));
  return oc;
}

// ---------------------------------------------------------------------
// 5. FACTURA (vinculada a OC)  |  8. DECLARACIÓN JURADA (excepción)
// ---------------------------------------------------------------------

export function crearFactura(
  data: Pick<Factura, "numero" | "fecha" | "fechaVencimiento" | "ocId" | "subtotal">,
  rol: Rol
): Factura {
  const oc = getOrdenes().find((o) => o.id === data.ocId);
  if (!oc) throw new ErpError("Seleccione una Orden de Compra.");
  if (oc.estado !== "EMITIDA") throw new ErpError(`La ${oc.numero} ya tiene comprobante.`);
  const num = data.numero.trim().toUpperCase();
  if (!/^[EF][A-Z0-9]{3}-\d{1,8}$/.test(num)) throw new ErpError("Formato de factura inválido. Ej: F001-00001234 / E001-123");
  if (getFacturas().some((f) => f.numero === num && f.ruc === oc.ruc)) throw new ErpError("Factura duplicada para este proveedor.");
  if (!(data.subtotal > 0)) throw new ErpError("El subtotal debe ser mayor a 0.");
  const subtotal = r2(data.subtotal);
  const igv = r2(subtotal * IGV);
  const fac: Factura = {
    ...data,
    tipo: "FACTURA",
    numero: num,
    subtotal,
    igv,
    total: r2(subtotal + igv),
    ocNumero: oc.numero,
    reqId: oc.reqId,
    reqNumero: oc.reqNumero,
    proveedor: oc.proveedor,
    ruc: oc.ruc,
    estadoPago: "POR_PAGAR",
    id: uid(),
    historial: [evento(rol, "Factura registrada", `${num} · ${oc.numero}`)],
  };
  escribir(KEYS.FACTURAS, [fac, ...getFacturas()]);
  actualizarOC(oc.id, (o) => ({
    ...o,
    estado: "FACTURADA",
    historial: [...o.historial, evento(rol, "Facturada", num)],
  }));
  return fac;
}

export async function crearDeclaracionJurada(
  data: Pick<Factura, "fecha" | "ocId" | "motivoSinComprobante" | "aprobadoPor"> & { dniVendedor: string; nombreVendedor: string },
  rol: Rol
): Promise<Factura> {
  if (rol !== "GERENCIA") throw new ErpError("Solo GERENCIA puede aprobar una Declaración Jurada.");
  const oc = getOrdenes().find((o) => o.id === data.ocId);
  if (!oc) throw new ErpError("Seleccione una Orden de Compra.");
  if (oc.estado !== "EMITIDA") throw new ErpError(`La ${oc.numero} ya tiene comprobante.`);
  if (oc.subtotal > TOPE_DJ) throw new ErpError(`El monto (${soles(oc.subtotal)}) supera el tope de DJ (${soles(TOPE_DJ)}).`);
  if (!/^\d{8}$/.test(data.dniVendedor)) throw new ErpError("DNI del vendedor inválido (8 dígitos).");
  if (!data.nombreVendedor.trim()) throw new ErpError("Ingrese el nombre del vendedor.");
  if (!data.motivoSinComprobante?.trim()) throw new ErpError("Indique por qué no hay comprobante.");
  if (!data.aprobadoPor?.trim()) throw new ErpError("Indique quién aprueba.");

  const dj: Factura = {
    id: uid(),
    tipo: "DECLARACION_JURADA",
    numero: formatear("DJ", await siguiente("DJ")),
    fecha: data.fecha,
    fechaVencimiento: data.fecha,
    ocId: oc.id,
    ocNumero: oc.numero,
    reqId: oc.reqId,
    reqNumero: oc.reqNumero,
    proveedor: data.nombreVendedor.trim().toUpperCase(),
    ruc: data.dniVendedor,
    subtotal: oc.subtotal,
    igv: 0,
    total: oc.subtotal,
    estadoPago: "POR_PAGAR",
    motivoSinComprobante: data.motivoSinComprobante.trim(),
    aprobadoPor: data.aprobadoPor.trim(),
    historial: [evento(rol, "Declaración jurada aprobada", data.aprobadoPor)],
  };
  escribir(KEYS.FACTURAS, [dj, ...getFacturas()]);
  // La DJ no requiere guía: pasa directo a visto bueno de Almacén
  actualizarOC(oc.id, (o) => ({
    ...o,
    estado: "EN_GUIA",
    historial: [...o.historial, evento(rol, "Sustentada con Declaración Jurada", dj.numero)],
  }));
  return dj;
}

export function marcarPago(id: string, pagada: boolean, rol: Rol): void {
  escribir(
    KEYS.FACTURAS,
    getFacturas().map((f) =>
      f.id === id
        ? {
            ...f,
            estadoPago: pagada ? ("PAGADA" as const) : ("POR_PAGAR" as const),
            historial: [...f.historial, evento(rol, pagada ? "Marcada como PAGADA" : "Revertida a POR PAGAR")],
          }
        : f
    )
  );
}

// ---------------------------------------------------------------------
// 6. GUÍA DE REMISIÓN (archivo vinculado a FACTURA / OC)
// ---------------------------------------------------------------------

export const MAX_ARCHIVO = 1.5 * 1024 * 1024;

export function crearGuia(
  data: Pick<Guia, "numero" | "fecha" | "facturaId" | "archivoNombre" | "archivoTipo" | "archivoDataUrl">,
  rol: Rol
): Guia {
  const fac = getFacturas().find((f) => f.id === data.facturaId);
  if (!fac || fac.tipo !== "FACTURA") throw new ErpError("Seleccione una factura.");
  const previa = getGuias().find((g) => g.facturaId === fac.id);
  if (previa && previa.estado !== "OBSERVADA") throw new ErpError("Esta factura ya tiene guía.");
  if (!data.numero.trim()) throw new ErpError("Ingrese el Nro de guía de remisión.");
  if (!data.archivoDataUrl) throw new ErpError("Adjunte la guía escaneada (PDF o imagen).");
  const guia: Guia = {
    ...data,
    numero: data.numero.trim().toUpperCase(),
    id: uid(),
    facturaNumero: fac.numero,
    ocId: fac.ocId,
    ocNumero: fac.ocNumero,
    reqId: fac.reqId,
    estado: "PENDIENTE_VB",
    historial: [
      ...(previa ? previa.historial : []),
      evento(rol, previa ? "Guía reemplazada tras observación" : "Guía de remisión cargada", data.archivoNombre),
    ],
  };
  escribir(KEYS.GUIAS, [guia, ...getGuias().filter((g) => g.id !== previa?.id)]);
  actualizarOC(fac.ocId, (o) => ({
    ...o,
    estado: "EN_GUIA",
    historial: [...o.historial, evento(rol, "Guía de remisión cargada", guia.numero)],
  }));
  return guia;
}

// ---------------------------------------------------------------------
// 7. ALMACÉN: VISTO BUENO FINAL
// ---------------------------------------------------------------------

export function darVistoBueno(ocId: string, vb: Omit<VistoBueno, "fecha">, rol: Rol): void {
  if (rol !== "ALMACEN" && rol !== "GERENCIA") throw new ErpError("Solo ALMACÉN puede dar el visto bueno de ingreso.");
  if (!vb.recibidoPor.trim()) throw new ErpError("Indique quién recibió la mercadería.");
  const oc = getOrdenes().find((o) => o.id === ocId);
  if (!oc || oc.estado !== "EN_GUIA") throw new ErpError("La OC no está lista para visto bueno.");
  const ahora = new Date().toISOString();
  const sede = sedeIngresoOC(oc);
  actualizarOC(ocId, (o) => ({
    ...o,
    estado: "FINALIZADA",
    vistoBueno: { ...vb, fecha: ahora },
    historial: [...o.historial, evento(rol, "Visto bueno de ingreso a almacén", `${vb.recibidoPor} · stock de ${sede}`)],
  }));
  ingresarStock(sede, oc.items);
  escribir(
    KEYS.GUIAS,
    getGuias().map((g) =>
      g.ocId === ocId
        ? { ...g, estado: "CONFORME" as const, historial: [...g.historial, evento(rol, "Conforme en almacén")] }
        : g
    )
  );
  actualizarProcesado(oc.reqId, (r) => ({
    ...r,
    estado: "FINALIZADO",
    historial: [...r.historial, evento(rol, "FINALIZADO · Ingreso a almacén conforme", vb.observaciones || undefined)],
  }));
}

export function observarIngreso(ocId: string, motivo: string, rol: Rol): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la observación.");
  const oc = getOrdenes().find((o) => o.id === ocId);
  if (!oc) throw new ErpError("OC no encontrada.");
  actualizarOC(ocId, (o) => ({
    ...o,
    historial: [...o.historial, evento(rol, "Ingreso observado por Almacén", motivo)],
  }));
  escribir(
    KEYS.GUIAS,
    getGuias().map((g) =>
      g.ocId === ocId
        ? { ...g, estado: "OBSERVADA" as const, historial: [...g.historial, evento(rol, "Observada", motivo)] }
        : g
    )
  );
}

// ---------------------------------------------------------------------
// PLANILLA: maestro de trabajadores
// ---------------------------------------------------------------------

export const TIPOS_SUELDO: Record<TipoSueldo, { label: string; divisor: number }> = {
  DIARIO: { label: "Diario", divisor: 1 },
  SEMANAL: { label: "Semanal", divisor: 6 }, // 6 días laborables
  QUINCENAL: { label: "Quincenal", divisor: 13 }, // 13 días laborables
  MENSUAL: { label: "Mensual", divisor: 26 }, // 26 días laborables
  POR_HORA: { label: "Por hora", divisor: 1 / 8 }, // sueldo = S/ por hora; diario = hora × jornada (la planilla usa la jornada del periodo)
  POR_CONTRATO: { label: "Por contrato", divisor: 30 }, // contratistas: no entran a la planilla del periodo
};

export const AFP_OPTIONS: Record<TipoAfp, { label: string; porc: number }> = {
  AFP_INTEGRA: { label: "AFP Integra", porc: 10 },
  AFP_PRIMA: { label: "AFP Prima", porc: 10 },
  AFP_HABITAT: { label: "AFP Habitat", porc: 10 },
  AFP_PROFUTURO: { label: "AFP Profuturo", porc: 10 },
  ONP: { label: "ONP", porc: 10 },
  SIN: { label: "Sin descuento / Recibo por Honorarios", porc: 0 },
};

export const trabajadorVacio = (): Trabajador => ({
  id: "",
  nombre: "",
  dni: "",
  cargo: "Operario",
  fechaIngreso: hoy(),
  sueldo: 80,
  tipoSueldo: "DIARIO",
  afpTipo: "AFP_INTEGRA",
  afpPorcentaje: AFP_OPTIONS.AFP_INTEGRA.porc,
  activo: true,
});

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Completa registros antiguos (sin fechaIngreso / afpTipo / tipoSueldo) para que no rompan la UI. */
function normalizarTrabajador(t: Partial<Trabajador>): Trabajador {
  const base = trabajadorVacio();
  const tipoSueldo = t.tipoSueldo && t.tipoSueldo in TIPOS_SUELDO ? t.tipoSueldo : base.tipoSueldo;
  const afpTipo = t.afpTipo && t.afpTipo in AFP_OPTIONS ? t.afpTipo : base.afpTipo;
  const afpPorcentaje = Number(t.afpPorcentaje);
  const sueldo = Number(t.sueldo);
  return {
    id: String(t.id ?? "").trim(),
    nombre: String(t.nombre ?? "").trim(),
    dni: String(t.dni ?? "").trim(),
    cargo: String(t.cargo ?? "").trim() || base.cargo,
    fechaIngreso: typeof t.fechaIngreso === "string" && FECHA_RE.test(t.fechaIngreso) ? t.fechaIngreso : "",
    sueldo: Number.isFinite(sueldo) && sueldo >= 0 ? sueldo : base.sueldo,
    tipoSueldo,
    afpTipo,
    afpPorcentaje: Number.isFinite(afpPorcentaje) && afpPorcentaje >= 0 ? afpPorcentaje : AFP_OPTIONS[afpTipo].porc,
    activo: t.activo !== false,
    ...fichaOpcional(t),
  };
}

const CAMPOS_FICHA_TEXTO = [
  "sede",
  "nroAfiliacion",
  "direccion",
  "celular",
  "email",
  "emergenciaNombre",
  "emergenciaParentesco",
  "emergenciaCelular",
  "observacionesMedicas",
  "motivoBaja",
  "empresa",
  "formaPagoContrato",
] as const;
export const SERVICIOS_CONTRATISTA: Record<ServicioContratista, string> = {
  ASESORIA: "Asesoría",
  TRAMITE: "Trámite",
  CONSTRUCCION: "Construcción",
  IMPLEMENTACION: "Implementación",
  OTRO: "Otro",
};
export const FORMAS_PAGO_CONTRATISTA = ["AL CONTADO", "ADELANTO + SALDO", "POR AVANCE", "MENSUAL", "AL TÉRMINO"];
export const ESTADOS_CIVILES: EstadoCivil[] = ["SOLTERO", "CASADO", "CONVIVIENTE", "DIVORCIADO", "VIUDO"];

/** Campos opcionales de la ficha: se conservan solo si tienen valor (los registros antiguos no los tienen). */
function fichaOpcional(t: Partial<Trabajador>): Partial<Trabajador> {
  const r: Partial<Trabajador> = {};
  CAMPOS_FICHA_TEXTO.forEach((k) => {
    const v = typeof t[k] === "string" ? (t[k] as string).trim() : "";
    if (v) r[k] = v;
  });
  if (typeof t.fechaNacimiento === "string" && FECHA_RE.test(t.fechaNacimiento)) r.fechaNacimiento = t.fechaNacimiento;
  if (typeof t.fechaBaja === "string" && FECHA_RE.test(t.fechaBaja)) r.fechaBaja = t.fechaBaja;
  if (t.estadoCivil && ESTADOS_CIVILES.includes(t.estadoCivil)) r.estadoCivil = t.estadoCivil;
  if (t.esContratista === true) r.esContratista = true;
  if (typeof t.ruc === "string" && /^\d{11}$/.test(t.ruc.trim())) r.ruc = t.ruc.trim();
  if (t.tipoServicio && t.tipoServicio in SERVICIOS_CONTRATISTA) r.tipoServicio = t.tipoServicio;
  if (typeof t.fechaFinContrato === "string" && FECHA_RE.test(t.fechaFinContrato)) r.fechaFinContrato = t.fechaFinContrato;
  const hijos = Number(t.nroHijos);
  if (t.nroHijos !== undefined && t.nroHijos !== null && Number.isInteger(hijos) && hijos >= 0) r.nroHijos = hijos;
  return r;
}

/** Edad en años cumplidos a la fecha de hoy. */
export function edad(fechaNacimiento?: string): number | null {
  if (!fechaNacimiento || !FECHA_RE.test(fechaNacimiento)) return null;
  const [y, m, d] = fechaNacimiento.split("-").map(Number);
  const [hy, hm, hd] = hoy().split("-").map(Number);
  const e = hy - y - (hm < m || (hm === m && hd < d) ? 1 : 0);
  return e >= 0 ? e : null;
}

export const getTrabajadores = (): Trabajador[] =>
  leer<Partial<Trabajador>[]>(KEYS.TRABAJADORES, []).map(normalizarTrabajador).filter((t) => t.id);

/** Hook reactivo del maestro de trabajadores, siempre normalizado. */
export function useTrabajadores(): Trabajador[] {
  const raw = useStore<Partial<Trabajador>[]>(KEYS.TRABAJADORES, []);
  return useMemo(() => raw.map(normalizarTrabajador).filter((t) => t.id), [raw]);
}

function validarTrabajador(t: Trabajador): void {
  if (!t.id) throw new ErpError("Ingrese el N° de huella.");
  if (!t.nombre) throw new ErpError("Ingrese el nombre completo.");
  if (t.dni && !/^\d{8}$/.test(t.dni)) throw new ErpError("DNI inválido (8 dígitos).");
  if (!t.fechaIngreso || !FECHA_RE.test(t.fechaIngreso)) throw new ErpError("Ingrese la fecha de ingreso.");
  if (t.fechaIngreso > hoy() && !esContratista(t)) throw new ErpError("La fecha de ingreso no puede ser futura."); // un contrato puede empezar después
  if (!(t.tipoSueldo in TIPOS_SUELDO)) throw new ErpError("Seleccione el tipo de sueldo.");
  if (!(t.sueldo > 0)) throw new ErpError("El sueldo debe ser mayor a 0.");
  if (!(t.afpTipo in AFP_OPTIONS)) throw new ErpError("Seleccione el sistema de pensiones.");
  if (!(t.afpPorcentaje >= 0 && t.afpPorcentaje <= 100)) throw new ErpError("El % de descuento debe estar entre 0 y 100.");
  if (t.fechaNacimiento && t.fechaNacimiento >= hoy()) throw new ErpError("La fecha de nacimiento debe ser pasada.");
  const e = edad(t.fechaNacimiento);
  if (t.fechaNacimiento && (e === null || e < 14 || e > 100)) throw new ErpError("Revise la fecha de nacimiento (edad entre 14 y 100 años).");
  if (t.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) throw new ErpError("Correo electrónico inválido.");
  if (t.celular && !/^\+?\d[\d\s-]{6,14}$/.test(t.celular)) throw new ErpError("Celular inválido.");
  if (t.emergenciaCelular && !/^\+?\d[\d\s-]{6,14}$/.test(t.emergenciaCelular)) throw new ErpError("Celular de emergencia inválido.");
}

/**
 * Crea o actualiza un trabajador. `idOriginal` es el N° de huella antes de editar
 * (permite corregirlo sin duplicar el registro).
 */
export function guardarTrabajador(data: Trabajador, idOriginal?: string): Trabajador {
  const t = normalizarTrabajador({ ...data, nombre: data.nombre.toUpperCase() });
  if (t.afpTipo === "SIN") t.afpPorcentaje = 0;
  validarTrabajador(t);
  const lista = getTrabajadores();
  const otros = lista.filter((x) => x.id !== (idOriginal ?? t.id));
  if (otros.some((x) => x.id === t.id)) throw new ErpError(`El N° de huella ${t.id} ya está asignado a otro trabajador.`);
  if (t.dni && otros.some((x) => x.dni === t.dni)) throw new ErpError(`El DNI ${t.dni} ya está registrado.`);
  const i = lista.findIndex((x) => x.id === (idOriginal ?? t.id));
  if (i >= 0) lista[i] = t;
  else lista.push(t);
  escribir(KEYS.TRABAJADORES, lista);
  return t;
}

/**
 * Alta / baja sin revalidar el resto de datos (permite dar de baja a un trabajador incompleto).
 * Al dar de baja se guardan fecha y motivo; al reactivar se limpian.
 */
export function cambiarEstadoTrabajador(id: string, activo: boolean, baja?: { fecha: string; motivo: string }): void {
  const lista = getTrabajadores();
  if (!lista.some((t) => t.id === id)) throw new ErpError("Trabajador no encontrado.");
  if (!activo && baja) {
    if (!FECHA_RE.test(baja.fecha)) throw new ErpError("Indique la fecha de baja.");
    if (!baja.motivo.trim()) throw new ErpError("Indique el motivo de la baja.");
  }
  escribir(
    KEYS.TRABAJADORES,
    lista.map((t) => {
      if (t.id !== id) return t;
      if (activo) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { fechaBaja, motivoBaja, ...resto } = t;
        return { ...resto, activo: true };
      }
      return { ...t, activo: false, ...(baja ? { fechaBaja: baja.fecha, motivoBaja: baja.motivo.trim() } : {}) };
    })
  );
}

export function eliminarTrabajador(id: string): void {
  escribir(KEYS.TRABAJADORES, getTrabajadores().filter((t) => t.id !== id));
}

// ---------------------------------------------------------------------
// Contratistas en el maestro (no entran a la planilla diaria)
// ---------------------------------------------------------------------

/** Contratista: marcado como tal, con cargo "Contratista" o pago POR CONTRATO. */
export const esContratista = (t: Pick<Trabajador, "esContratista" | "cargo" | "tipoSueldo">): boolean =>
  t.esContratista === true || (t.cargo ?? "").trim().toUpperCase() === "CONTRATISTA" || t.tipoSueldo === "POR_CONTRATO";

/** Siguiente N° para un contratista nuevo: C1, C2... (no choca con las huellas del reloj). */
export function siguienteIdContratista(lista: Trabajador[] = getTrabajadores()): string {
  const max = lista.reduce((m, t) => Math.max(m, /^C(\d+)$/i.test(t.id) ? Number(t.id.slice(1)) : 0), 0);
  return `C${max + 1}`;
}

export interface DatosContratista {
  nombre: string;
  documento: string; // DNI (8) o RUC (11)
  tipoServicio: ServicioContratista;
  empresa: string;
  monto: number;
  sede: string;
  fechaInicio: string;
  fechaFin: string;
  formaPago: string;
}

/** Registra o edita un contratista en el mismo maestro de trabajadores (esContratista = true). */
export function guardarContratista(d: DatosContratista, idOriginal?: string): Trabajador {
  const doc = d.documento.trim();
  if (!d.nombre.trim()) throw new ErpError("Ingrese el nombre del contratista.");
  if (doc && !/^\d{8}$/.test(doc) && !/^\d{11}$/.test(doc)) throw new ErpError("DNI (8 dígitos) o RUC (11 dígitos) inválido.");
  if (doc.length === 11 && !rucValido(doc)) throw new ErpError("RUC inválido (dígito verificador).");
  if (!(d.tipoServicio in SERVICIOS_CONTRATISTA)) throw new ErpError("Seleccione el tipo de servicio.");
  if (!(Number(d.monto) > 0)) throw new ErpError("El monto contratado debe ser mayor a 0.");
  if (!FECHA_RE.test(d.fechaInicio)) throw new ErpError("Indique la fecha de inicio.");
  if (d.fechaFin && (!FECHA_RE.test(d.fechaFin) || d.fechaFin < d.fechaInicio)) throw new ErpError("La fecha de fin debe ser posterior al inicio.");
  const lista = getTrabajadores();
  const anterior = idOriginal ? lista.find((t) => t.id === idOriginal) : undefined;
  const base: Trabajador = anterior ?? { ...trabajadorVacio(), id: siguienteIdContratista(lista), afpTipo: "SIN", afpPorcentaje: 0 };
  return guardarTrabajador(
    {
      ...base,
      nombre: d.nombre,
      dni: doc.length === 8 ? doc : doc ? "" : base.dni,
      ruc: doc.length === 11 ? doc : undefined,
      cargo: "Contratista",
      esContratista: true,
      tipoServicio: d.tipoServicio,
      empresa: d.empresa.trim() || undefined,
      sueldo: Math.round(Number(d.monto) * 100) / 100,
      tipoSueldo: "POR_CONTRATO",
      sede: d.sede || undefined,
      fechaIngreso: d.fechaInicio,
      fechaFinContrato: d.fechaFin || undefined,
      formaPagoContrato: d.formaPago || undefined,
    },
    idOriginal
  );
}

// ---------------------------------------------------------------------
// Duplicados del reloj (ej. "LIZBETH CAHUANA 1" creado con otra huella)
// ---------------------------------------------------------------------

export const getAliasHuellas = (): AliasHuellas => leer<AliasHuellas>(KEYS.HUELLAS_ALIAS, {});

const nombreBase = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+\d+$/, "")
    .replace(/\s+/g, " ")
    .trim();

export interface Duplicado {
  duplicado: Trabajador; // el que sobra
  original: Trabajador; // el que se conserva
  motivo: string;
}

/**
 * Posibles duplicados: mismo DNI, o mismo nombre sin el número final ("LIZBETH CAHUANA 1" = "LIZBETH CAHUANA").
 * Se propone conservar el registro completo (con fecha de ingreso) y quitar el incompleto.
 */
export function detectarDuplicados(lista: Trabajador[]): Duplicado[] {
  const r: Duplicado[] = [];
  const vistos = new Set<string>();
  const peso = (t: Trabajador) => (t.fechaIngreso ? 2 : 0) + (t.dni ? 1 : 0) + (/\s\d+$/.test(t.nombre) ? 0 : 1);
  lista.forEach((a, i) =>
    lista.slice(i + 1).forEach((b) => {
      const mismoDni = !!a.dni && a.dni === b.dni;
      const mismoNombre = nombreBase(a.nombre) === nombreBase(b.nombre) && nombreBase(a.nombre) !== "";
      if (!mismoDni && !mismoNombre) return;
      const [original, duplicado] = peso(a) >= peso(b) ? [a, b] : [b, a];
      if (vistos.has(duplicado.id)) return;
      vistos.add(duplicado.id);
      r.push({ duplicado, original, motivo: mismoDni ? `mismo DNI ${a.dni}` : "mismo nombre" });
    })
  );
  return r;
}

/**
 * Quita el duplicado y recuerda que su huella es del trabajador original: las próximas importaciones
 * del reloj suman esa huella al original en vez de volver a crear el duplicado.
 */
export function unirDuplicado(duplicadoId: string, originalId: string): void {
  const lista = getTrabajadores();
  if (!lista.some((t) => t.id === duplicadoId) || !lista.some((t) => t.id === originalId)) throw new ErpError("Trabajador no encontrado.");
  if (duplicadoId === originalId) throw new ErpError("Elija dos trabajadores distintos.");
  const alias = getAliasHuellas();
  // Si otras huellas apuntaban al duplicado, ahora apuntan al original
  const nuevo: AliasHuellas = Object.fromEntries(Object.entries(alias).map(([h, t]) => [h, t === duplicadoId ? originalId : t]));
  nuevo[duplicadoId] = originalId;
  escribir(KEYS.HUELLAS_ALIAS, nuevo);
  escribir(KEYS.TRABAJADORES, lista.filter((t) => t.id !== duplicadoId));
}

/** Registra en bloque los N° de huella que llegan del reloj y aún no existen. Devuelve cuántos se crearon. */
export function registrarDesdeAsistencia(nuevos: { id: string; nombre: string }[]): number {
  const lista = getTrabajadores();
  const alias = getAliasHuellas();
  let n = 0;
  nuevos.forEach(({ id, nombre }) => {
    if (!id || alias[id] || lista.some((t) => t.id === id)) return; // huella unida a otro trabajador: no se recrea
    // fechaIngreso vacía: se completa al editar el trabajador
    lista.push({ ...trabajadorVacio(), id, nombre: nombre.toUpperCase() || `TRABAJADOR ${id}`, fechaIngreso: "" });
    n++;
  });
  if (n > 0) escribir(KEYS.TRABAJADORES, lista);
  return n;
}

// ---------------------------------------------------------------------
// PLANILLA: asistencia por periodo (DÍAS / TARD.)
// Solo se modifica con dos funciones de Supabase (security definer):
//   importar_asistencia()        -> origen_edicion = 'RELOJ'   (Importar asistencia)
//   editar_asistencia_creador()  -> origen_edicion = 'CREADOR' (Módulo Creador, rol creador/admin)
// Escribir la tabla directamente está bloqueado por RLS (error 42501).
// ---------------------------------------------------------------------

export const MSG_ASISTENCIA_BLOQUEADA = "Solo editable desde Módulo Creador / Importar Asistencia";

/** "  semana 14 -  abril 2026 " -> "SEMANA 14 - ABRIL 2026" (igual que en SQL). */
export const normalizarPeriodo = (p: string): string => p.trim().replace(/\s+/g, " ").toUpperCase();

export const idAsistencia = (periodo: string, trabajador: string): string => `${normalizarPeriodo(periodo)}|${trabajador.trim()}`;

export const getAsistencia = () => leer<AsistenciaPeriodo[]>(KEYS.ASISTENCIA, []);

function errorAsistencia(error: { code?: string; message: string }): ErpError {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
    return new ErpError("Falta la función de asistencia en Supabase: ejecute supabase/fix_asistencia.sql.");
  return new ErpError(error.message);
}

/** Importar asistencia (reloj): guarda DÍAS, HORAS y TARD. del periodo con origen RELOJ. */
export async function importarAsistenciaReloj(
  periodo: string,
  filas: { trabajador: string; dias: number; horas: number; tardanzas: number }[]
): Promise<number> {
  const p = normalizarPeriodo(periodo);
  if (!p) throw new ErpError("Indique el periodo antes de importar.");
  if (filas.length === 0) throw new ErpError("No hay asistencia para guardar.");
  const { data, error } = await createClient().rpc("importar_asistencia", { p_periodo: p, p_filas: filas });
  if (error) throw errorAsistencia(error);
  await recargar(KEYS.ASISTENCIA);
  return Number(data);
}

/** Módulo Creador: edición manual de DÍAS y TARD. (la base valida que el rol sea creador / admin). */
export async function editarAsistenciaCreador(periodo: string, trabajador: string, dias: number, tardanzas: number): Promise<void> {
  const p = normalizarPeriodo(periodo);
  if (!p) throw new ErpError("Indique el periodo.");
  if (!Number.isInteger(dias) || dias < 0 || dias > 31) throw new ErpError("Días debe ser un entero entre 0 y 31.");
  if (!Number.isInteger(tardanzas) || tardanzas < 0 || tardanzas > dias) throw new ErpError("Tardanzas debe ser un entero entre 0 y los días trabajados.");
  const { error } = await createClient().rpc("editar_asistencia_creador", {
    p_periodo: p,
    p_trabajador: trabajador,
    p_dias: dias,
    p_tardanzas: tardanzas,
  });
  if (error) throw errorAsistencia(error);
  await recargar(KEYS.ASISTENCIA);
}

// ---------------------------------------------------------------------
// COMPRAS DIRECTAS -> ingreso a STOCK de almacén
// ---------------------------------------------------------------------

export const getProveedores = () => leer<Proveedor[]>(KEYS.PROVEEDORES, []);
export const getCompras = () => leer<Compra[]>(KEYS.COMPRAS, []);
export const getStock = () => leer<StockItem[]>(KEYS.STOCK, []);

export function crearProveedor(data: Pick<Proveedor, "razonSocial" | "ruc">): Proveedor {
  const razonSocial = data.razonSocial.trim().toUpperCase();
  const ruc = data.ruc.trim();
  if (!razonSocial) throw new ErpError("Ingrese la razón social del proveedor.");
  if (!rucValido(ruc)) throw new ErpError("RUC inválido (11 dígitos con dígito verificador correcto).");
  const lista = getProveedores();
  if (lista.some((p) => p.ruc === ruc)) throw new ErpError(`El RUC ${ruc} ya está registrado.`);
  const prov: Proveedor = { id: uid(), razonSocial, ruc };
  escribir(KEYS.PROVEEDORES, [...lista, prov].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)));
  return prov;
}

/** Clave de producto en stock: misma sede + mismo nombre (sin mayúsculas/espacios extra) + misma unidad. */
const claveStock = (sede: string, nombre: string, unidad: string): string =>
  `${sede}|${nombre.trim().replace(/\s+/g, " ").toUpperCase()}|${unidad}`;

/** Suma cantidades al stock de la sede (mismo producto + unidad) y actualiza el último costo sin IGV. */
function ingresarStock(sede: string, items: { nombre: string; unidad: string; cantidad: number; precioUnit: number }[]): void {
  const ahora = new Date().toISOString();
  const stock = getStock();
  items.forEach((i) => {
    const nombre = i.nombre.trim().replace(/\s+/g, " ").toUpperCase();
    const k = claveStock(sede, nombre, i.unidad);
    const existente = stock.find((s) => claveStock(s.sede, s.nombre, s.unidad) === k);
    if (existente) {
      existente.cantidad = r2(existente.cantidad + i.cantidad);
      existente.costoUnit = i.precioUnit;
      existente.actualizado = ahora;
    } else {
      stock.push({ id: uid(), sede, nombre, unidad: i.unidad, cantidad: i.cantidad, costoUnit: i.precioUnit, actualizado: ahora });
    }
  });
  escribir(KEYS.STOCK, stock);
}

/** Cantidad disponible de un producto en una sede. */
export function stockDisponible(sede: string, nombre: string, unidad: string): number {
  const k = claveStock(sede, nombre, unidad);
  return getStock().find((s) => claveStock(s.sede, s.nombre, s.unidad) === k)?.cantidad ?? 0;
}

/** Salida de stock (despacho). Valida todo antes de escribir: si falta stock no descuenta nada. */
export function descontarStock(sede: string, items: { nombre: string; unidad: string; cantidad: number }[]): void {
  const stock = getStock();
  const ahora = new Date().toISOString();
  for (const i of items) {
    const k = claveStock(sede, i.nombre, i.unidad);
    const existente = stock.find((s) => claveStock(s.sede, s.nombre, s.unidad) === k);
    const disp = existente?.cantidad ?? 0;
    if (disp + 1e-9 < i.cantidad)
      throw new ErpError(`Stock insuficiente de ${i.nombre} (${i.unidad}) en ${sede}: hay ${disp}, se requiere ${i.cantidad}.`);
  }
  items.forEach((i) => {
    const k = claveStock(sede, i.nombre, i.unidad);
    const existente = stock.find((s) => claveStock(s.sede, s.nombre, s.unidad) === k)!;
    existente.cantidad = r2(existente.cantidad - i.cantidad);
    existente.actualizado = ahora;
  });
  escribir(KEYS.STOCK, stock);
}

/** Sede donde ingresa la mercadería de una OC: la del REQ; si no existe, el lugar de entrega. */
export const sedeIngresoOC = (oc: OrdenCompra): string => oc.almacenIngreso || buscarReq(oc.reqId)?.sede || oc.lugarEntrega;

/** Traslado de un repuesto entre sedes (botón "Transferir desde…" del despacho). */
export function transferirStock(nombre: string, unidad: string, cantidad: number, deSede: string, aSede: string): void {
  if (deSede === aSede) throw new ErpError("Elija una sede distinta.");
  if (!(cantidad > 0)) throw new ErpError("Cantidad inválida.");
  const costo = getStock().find((s) => claveStock(s.sede, s.nombre, s.unidad) === claveStock(deSede, nombre, unidad))?.costoUnit ?? 0;
  descontarStock(deSede, [{ nombre, unidad, cantidad }]);
  ingresarStock(aSede, [{ nombre, unidad, cantidad, precioUnit: costo }]);
}

/**
 * Totales de una compra. FACTURA: precios sin IGV (se suma 18 %).
 * BOLETA: precios con IGV incluido (el total es la suma de filas y se desglosa la base).
 */
// ---------------------------------------------------------------------
// GASTOS / SERVICIOS DE TESORERÍA (sin requerimiento, OC ni ingreso a stock)
// Se guardan como comprobante en "Facturas" (tabla compras, tipo factura) con esGastoTesoreria = true.
// ---------------------------------------------------------------------

export const TIPOS_GASTO: Record<TipoGasto, string> = {
  REPRESENTACION: "Almuerzo ejecutivo / Representación",
  SERVICIO_BASICO: "Servicio básico (Luz / Agua / Internet / Celular)",
  TRANSPORTE: "Transporte / Agencia / Flete",
  COMPRA_SIN_REQ: "Compra sin requerimiento",
  OTROS: "Otros",
  PLANILLA: "Planilla semanal (sueldos)",
};

export const COMPROBANTES_GASTO: Record<ComprobanteGasto, string> = {
  FACTURA: "Factura",
  BOLETA: "Boleta",
  DJ: "Declaración Jurada de Gasto",
  RECIBO: "Recibo",
};

/** % de detracción sugerido según el servicio (transporte de carga 4 %, servicios en general 12 %, otros 10 %). */
export const DETRACCION_SUGERIDA: Record<TipoGasto, number> = {
  REPRESENTACION: 10,
  SERVICIO_BASICO: 12,
  TRANSPORTE: 4,
  COMPRA_SIN_REQ: 10,
  OTROS: 12,
  PLANILLA: 0,
};
export const PORCENTAJES_DETRACCION = [4, 10, 12];

export interface DatosGasto {
  fecha: string;
  tipoGasto: TipoGasto;
  descripcion: string;
  importe: number; // total del comprobante (con IGV si es factura)
  comprobante: ComprobanteGasto;
  numero: string;
  proveedor: string;
  ruc: string;
  detraccion: boolean;
  detraccionPorc: number;
  archivos: ArchivoGasto[];
}

/** Detracción y neto a pagar: ej. agencia S/ 100 con 4 % -> detracción S/ 4, neto S/ 96. */
export function calcularDetraccion(importe: number, aplica: boolean, porc: number): { monto: number; neto: number } {
  const total = r2(Number(importe) || 0);
  const monto = aplica ? r2((total * (Number(porc) || 0)) / 100) : 0;
  return { monto, neto: r2(total - monto) };
}

const NUM_GASTO: Partial<Record<ComprobanteGasto, RegExp>> = {
  FACTURA: /^[EF][A-Z0-9]{3}-\d{1,8}$/,
  BOLETA: /^[BE][A-Z0-9]{3}-\d{1,8}$/,
};

/** Registra un gasto / servicio: NO ingresa a stock; queda en Facturas como POR PAGAR. */
export function registrarGastoTesoreria(d: DatosGasto, rol: Rol): Factura {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErpError("Fecha del gasto inválida. Use DD/MM/AAAA.");
  if (d.fecha > hoy()) throw new ErpError("La fecha del gasto no puede ser futura.");
  if (!(d.tipoGasto in TIPOS_GASTO)) throw new ErpError("Seleccione el tipo de gasto.");
  if (!d.descripcion.trim()) throw new ErpError("Describa el gasto.");
  const total = r2(Number(d.importe));
  if (!(total > 0)) throw new ErpError("El importe total debe ser mayor a 0.");
  if (!(d.comprobante in COMPROBANTES_GASTO)) throw new ErpError("Seleccione el tipo de comprobante.");
  const numero = d.numero.trim().toUpperCase();
  if (!numero) throw new ErpError(`Ingrese el N° de ${COMPROBANTES_GASTO[d.comprobante].toLowerCase()}.`);
  const re = NUM_GASTO[d.comprobante];
  if (re && !re.test(numero)) throw new ErpError(`N° de ${d.comprobante.toLowerCase()} inválido. Ej: ${d.comprobante === "FACTURA" ? "F001-00001234" : "B001-00000456"}`);
  const proveedor = d.proveedor.trim().toUpperCase();
  if (!proveedor) throw new ErpError("Indique el proveedor o agencia.");
  const ruc = d.ruc.trim();
  if (ruc && !/^\d{8}$/.test(ruc) && !/^\d{11}$/.test(ruc)) throw new ErpError("RUC (11 dígitos) o DNI (8 dígitos) inválido.");
  if (d.comprobante === "FACTURA" && ruc.length !== 11) throw new ErpError("La factura requiere el RUC del proveedor.");
  if (ruc.length === 11 && !rucValido(ruc)) throw new ErpError("RUC inválido (dígito verificador).");
  if (getFacturas().some((f) => f.numero === numero && (ruc ? f.ruc === ruc : f.proveedor === proveedor)) || (ruc && getCompras().some((c) => c.numero === numero && c.ruc === ruc)))
    throw new ErpError(`El comprobante ${numero} de ${proveedor} ya fue registrado.`);
  if (d.detraccion && !(d.detraccionPorc > 0 && d.detraccionPorc <= 100)) throw new ErpError("Indique el % de detracción.");
  if (d.archivos.some((a) => a.dataUrl.length > MAX_ARCHIVO * 1.4)) throw new ErpError("Cada archivo debe pesar como máximo 1.5 MB.");

  // Factura: el importe incluye IGV (crédito fiscal). Boleta / DJ / recibo: sin IGV separado.
  const subtotal = d.comprobante === "FACTURA" ? r2(total / (1 + IGV)) : total;
  const { monto, neto } = calcularDetraccion(total, d.detraccion, d.detraccionPorc);
  const f: Factura = {
    id: uid(),
    tipo: d.comprobante === "DJ" ? "DECLARACION_JURADA" : "FACTURA",
    numero,
    fecha: d.fecha,
    fechaVencimiento: d.fecha,
    ocId: "",
    ocNumero: "-",
    reqId: "",
    reqNumero: "-",
    proveedor,
    ruc,
    subtotal,
    igv: r2(total - subtotal),
    total,
    estadoPago: "POR_PAGAR",
    historial: [evento(rol, "Gasto de Tesorería registrado", `${TIPOS_GASTO[d.tipoGasto]} · ${COMPROBANTES_GASTO[d.comprobante]} ${numero}${monto ? ` · detracción ${d.detraccionPorc}% S/ ${monto.toFixed(2)}` : ""}`)],
    esGastoTesoreria: true,
    tipoGasto: d.tipoGasto,
    descripcion: d.descripcion.trim(),
    comprobanteGasto: d.comprobante,
    ...(d.detraccion ? { detraccionPorc: d.detraccionPorc, detraccionMonto: monto } : {}),
    netoPagar: neto,
    ...(d.archivos.length ? { archivos: d.archivos } : {}),
  };
  escribir(KEYS.FACTURAS, [f, ...getFacturas()]);
  return f;
}

/**
 * EGRESO de Tesorería por el pago de una planilla semanal (ej. solo trabajadores con sueldo diario).
 * Queda en Facturas como gasto de Tesorería tipo PLANILLA, ya PAGADA (no lleva comprobante de proveedor).
 */
export function registrarEgresoPlanilla(
  d: { periodo: string; grupo: string; desde: string; hasta: string; total: number; trabajadores: number; historialId: string },
  rol: Rol
): Factura {
  const total = r2(d.total);
  if (!(total > 0)) throw new ErpError("El total a pagar debe ser mayor a 0.");
  const numero = `PLLA ${d.periodo} ${d.grupo}`.toUpperCase();
  if (getFacturas().some((f) => f.tipoGasto === "PLANILLA" && f.numero === numero)) throw new ErpError(`El egreso ${numero} ya está registrado en Tesorería.`);
  const fecha = hoy();
  const rango = d.desde && d.hasta ? ` · del ${fechaPE(d.desde)} al ${fechaPE(d.hasta)}` : "";
  const f: Factura = {
    id: uid(),
    tipo: "FACTURA",
    numero,
    fecha,
    fechaVencimiento: fecha,
    ocId: "",
    ocNumero: "-",
    reqId: "",
    reqNumero: "-",
    proveedor: "PLANILLA DE TRABAJADORES",
    ruc: "",
    subtotal: total,
    igv: 0,
    total,
    estadoPago: "PAGADA",
    historial: [evento(rol, "Egreso por planilla semanal", `${d.periodo} · ${d.grupo} · ${d.trabajadores} trabajador(es)${rango} · historial ${d.historialId}`)],
    esGastoTesoreria: true,
    tipoGasto: "PLANILLA",
    descripcion: `Pago planilla ${d.periodo} - ${d.grupo} (${d.trabajadores} trabajadores)${rango}`,
    comprobanteGasto: "RECIBO",
    netoPagar: total,
  };
  escribir(KEYS.FACTURAS, [f, ...getFacturas()]);
  return f;
}

export function totalesCompra(tipo: Compra["tipoComprobante"], items: { cantidad: number; precioUnit: number }[]) {
  const suma = r2(items.reduce((a, i) => a + r2((i.cantidad || 0) * (i.precioUnit || 0)), 0));
  if (tipo === "BOLETA") {
    const subtotal = r2(suma / (1 + IGV));
    return { subtotal, igv: r2(suma - subtotal), total: suma };
  }
  const igv = r2(suma * IGV);
  return { subtotal: suma, igv, total: r2(suma + igv) };
}

const NUM_COMPROBANTE: Record<Compra["tipoComprobante"], RegExp> = {
  FACTURA: /^[EF][A-Z0-9]{3}-\d{1,8}$/,
  BOLETA: /^[BE][A-Z0-9]{3}-\d{1,8}$/,
};

/** Registra la compra y suma las cantidades al stock de la sede. Valida todo antes de escribir. */
export function registrarCompra(
  data: Pick<Compra, "fecha" | "proveedorId" | "tipoComprobante" | "numero" | "sede"> & { items: Omit<ItemCompra, "subtotal">[] },
  rol: Rol
): Compra {
  const prov = getProveedores().find((p) => p.id === data.proveedorId);
  if (!prov) throw new ErpError("Seleccione el proveedor.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) throw new ErpError("Fecha de compra inválida. Use DD/MM/AAAA.");
  if (data.fecha > hoy()) throw new ErpError("La fecha de compra no puede ser futura.");
  if (!data.sede.trim()) throw new ErpError("Seleccione la sede / almacén de ingreso.");
  const numero = data.numero.trim().toUpperCase();
  if (!NUM_COMPROBANTE[data.tipoComprobante].test(numero))
    throw new ErpError(`N° de ${data.tipoComprobante.toLowerCase()} inválido. Ej: ${data.tipoComprobante === "FACTURA" ? "F001-00001234" : "B001-00000456"}`);
  if (getCompras().some((c) => c.numero === numero && c.ruc === prov.ruc) || getFacturas().some((f) => f.numero === numero && f.ruc === prov.ruc))
    throw new ErpError(`El comprobante ${numero} de ${prov.razonSocial} ya fue registrado.`);

  const filas = data.items.filter((i) => i.nombre.trim());
  if (filas.length === 0) throw new ErpError("Agregue al menos un producto.");
  if (filas.some((i) => !(i.cantidad > 0))) throw new ErpError("Todas las cantidades deben ser mayores a 0.");
  if (filas.some((i) => !(i.precioUnit > 0))) throw new ErpError("Ingrese precio unitario > 0 en todos los productos.");

  const items: ItemCompra[] = filas.map((i) => ({
    ...i,
    nombre: i.nombre.trim().replace(/\s+/g, " ").toUpperCase(),
    subtotal: r2(i.cantidad * i.precioUnit),
  }));
  const { subtotal, igv, total } = totalesCompra(data.tipoComprobante, items);
  const compra: Compra = {
    id: uid(),
    fecha: data.fecha,
    proveedorId: prov.id,
    proveedor: prov.razonSocial,
    ruc: prov.ruc,
    tipoComprobante: data.tipoComprobante,
    numero,
    sede: data.sede,
    items,
    subtotal,
    igv,
    total,
    historial: [evento(rol, "Compra registrada", `${numero} · ${prov.razonSocial} · ingreso a ${data.sede}`)],
  };

  escribir(KEYS.COMPRAS, [compra, ...getCompras()]);
  ingresarStock(data.sede, items);
  return compra;
}

// ---------------------------------------------------------------------
// Rol activo (según el usuario logueado)
// ---------------------------------------------------------------------

export const PERMISOS: Record<Rol, { label: string; puede: string[] }> = {
  ALMACEN: { label: "Almacén", puede: ["req.crear", "req.reenviar", "vb.dar", "despacho.dar"] },
  TESORERIA: {
    label: "Tesorería / Compras",
    puede: ["compra.crear", "req.revisar", "coti.crear", "oc.crear", "fac.crear", "guia.crear", "fac.pagar", "venta.gestionar", "venta.cobrar"],
  },
  GERENCIA: {
    label: "Gerencia (admin)",
    puede: [
      "compra.crear", "req.crear", "req.reenviar", "req.revisar", "coti.crear", "oc.crear", "fac.crear", "guia.crear", "fac.pagar", "dj.aprobar", "vb.dar",
      "venta.gestionar", "venta.cobrar", "despacho.dar",
    ],
  },
  CONTADOR: { label: "Contador (lectura)", puede: [] },
};

export const puede = (rol: Rol, permiso: string): boolean => PERMISOS[rol].puede.includes(permiso);

/** Rol de negocio del usuario logueado (ver lib/auth.ts). */
export function useRol(): [Rol] {
  return [rolNegocio(getSesion())];
}
