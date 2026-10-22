"use client";

// =====================================================================
// Catálogo maestro único (tablas productos_maestro / productos_alias / productos_solicitudes).
// Se carga una vez al iniciar sesión y se mantiene al día con Realtime.
// Todo producto que entra al stock, a un REQ, a una OC o a la sucursal pasa por canonizar():
// el mismo producto físico tiene un solo nombre (y SKU) en todos los almacenes.
// =====================================================================

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "./supabase/client";
import { ProductoError, UMBRAL_SUGERENCIA, normalizarNombre, similitud, type AliasProducto, type ProductoMaestro, type SolicitudProducto } from "./productos-modelos";

export * from "./productos-modelos";

interface Estado {
  productos: ProductoMaestro[];
  alias: AliasProducto[];
  solicitudes: SolicitudProducto[];
  /** Ya se consultó Supabase. */
  listo: boolean;
  /** Las tablas existen (se corrió la migración). Si no, nada se bloquea. */
  disponible: boolean;
}

const EVENTO = "erp:catalogo";
let estado: Estado = { productos: [], alias: [], solicitudes: [], listo: false, disponible: false };
let porNombre = new Map<string, ProductoMaestro>();
let canal: RealtimeChannel | null = null;
let carga: Promise<void> | null = null;
let espera: ReturnType<typeof setTimeout> | null = null;

const faltaTabla = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

async function todas<T>(tabla: string, orden: string): Promise<{ data: T[]; error: { code?: string; message?: string } | null }> {
  const sb = createClient();
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select("*").order(orden).range(desde, desde + 999);
    if (error) return { data: out, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}

function fijar(e: Estado): void {
  estado = e;
  porNombre = new Map(e.productos.map((p) => [p.nombre_normalizado, p]));
  const porId = new Map(e.productos.map((p) => [p.id, p]));
  for (const a of e.alias) {
    const p = porId.get(a.producto_id);
    if (p && !porNombre.has(a.alias_normalizado)) porNombre.set(a.alias_normalizado, p);
  }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * Fila de productos_solicitudes -> modelo de la app. En producción la tabla usa nombre_solicitado,
 * categoria_sugerida y estado en MAYÚSCULAS (PENDIENTE / APROBADA / RECHAZADA); filas antiguas usan nombre / categoria.
 */
function leerSolicitud(r: SolicitudProducto & { nombre_solicitado?: string | null; categoria_sugerida?: string | null }): SolicitudProducto {
  return {
    ...r,
    nombre: r.nombre_solicitado || r.nombre || "",
    categoria: r.categoria_sugerida ?? r.categoria ?? null,
    estado: (String(r.estado ?? "pendiente").toLowerCase() as SolicitudProducto["estado"]),
  };
}

async function leerCatalogo(): Promise<void> {
  const [p, a, s] = await Promise.all([
    todas<ProductoMaestro>("productos_maestro", "nombre_normalizado"),
    todas<AliasProducto>("productos_alias", "alias_normalizado"),
    todas<SolicitudProducto>("productos_solicitudes", "created_at"),
  ]);
  if (faltaTabla(p.error)) return fijar({ productos: [], alias: [], solicitudes: [], listo: true, disponible: false });
  if (p.error) {
    console.warn("Catálogo de productos:", p.error.message);
    return fijar({ ...estado, listo: true });
  }
  fijar({ productos: p.data, alias: a.data, solicitudes: [...s.data].reverse().map(leerSolicitud), listo: true, disponible: true });
}

/** Al iniciar sesión: descarga el catálogo y escucha los cambios de las otras PCs. */
export function iniciarCatalogo(): Promise<void> {
  carga ??= leerCatalogo().then(() => {
    if (!estado.disponible || canal) return;
    const recargar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void leerCatalogo(), 400);
    };
    canal = ["productos_maestro", "productos_alias", "productos_solicitudes"]
      .reduce((c, t) => c.on("postgres_changes", { event: "*", schema: "public", table: t }, recargar), createClient().channel("erp-productos"))
      .subscribe();
  });
  return carga;
}

export async function detenerCatalogo(): Promise<void> {
  if (canal) await createClient().removeChannel(canal);
  canal = null;
  carga = null;
  estado = { productos: [], alias: [], solicitudes: [], listo: false, disponible: false };
  porNombre = new Map();
}

export const recargarCatalogo = () => leerCatalogo();
export const getCatalogo = (): Estado => estado;

export function useCatalogo(): Estado {
  const [e, setE] = useState<Estado>(estado);
  useEffect(() => {
    const on = () => setE(estado);
    on();
    void iniciarCatalogo();
    window.addEventListener(EVENTO, on);
    return () => window.removeEventListener(EVENTO, on);
  }, []);
  return e;
}

/** Producto oficial de un nombre (exacto, normalizado o alias). */
export const buscarProducto = (nombre: string): ProductoMaestro | undefined => porNombre.get(normalizarNombre(nombre));
export const productoPorId = (id?: string): ProductoMaestro | undefined => (id ? estado.productos.find((p) => p.id === id) : undefined);

/** Productos parecidos (para "¿Quisiste decir…?"). */
export function sugerencias(nombre: string, n = 3, umbral = UMBRAL_SUGERENCIA): { p: ProductoMaestro; sim: number }[] {
  const t = normalizarNombre(nombre);
  if (t.length < 3) return [];
  return estado.productos
    .filter((p) => p.activo)
    .map((p) => ({ p, sim: Math.max(similitud(t, p.nombre_normalizado), p.nombre_normalizado.includes(t) ? 0.6 : 0) }))
    .filter((x) => x.sim >= umbral)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, n);
}

export interface Canonico {
  nombre: string;
  productoId?: string;
  sku?: string;
  unidad?: string;
}

/**
 * Nombre oficial del producto. Con el catálogo activo, un nombre que no está en el catálogo
 * se rechaza (con sugerencia): no se puede registrar el mismo producto con otro nombre.
 */
export function canonizar(nombre: string): Canonico {
  const norm = normalizarNombre(nombre);
  if (!estado.disponible) return { nombre: norm };
  const p = porNombre.get(norm);
  if (p) return { nombre: p.nombre_normalizado, productoId: p.id, sku: p.sku, unidad: p.unidad };
  const s = sugerencias(norm, 1)[0];
  throw new ProductoError(
    `"${nombre.trim()}" no está en el catálogo maestro.${s ? ` ¿Quisiste decir ${s.p.nombre_normalizado} (${s.p.sku})?` : ""} Elija un producto del catálogo o use "Solicitar nuevo producto".`
  );
}

/** Canoniza una lista de ítems con `nombre` (lanza con todos los que faltan). */
export function canonizarItems<T extends { nombre: string }>(items: T[]): (T & { productoId?: string; sku?: string })[] {
  if (!estado.disponible) return items.map((i) => ({ ...i, nombre: normalizarNombre(i.nombre) }));
  const faltan = items.filter((i) => i.nombre.trim() && !buscarProducto(i.nombre)).map((i) => i.nombre.trim());
  if (faltan.length === 1) canonizar(faltan[0]);
  if (faltan.length > 1) throw new ProductoError(`${faltan.length} productos no están en el catálogo maestro: ${faltan.slice(0, 5).join(", ")}${faltan.length > 5 ? "…" : ""}. Elíjalos del catálogo o solicítelos.`);
  return items.map((i) => {
    const c = canonizar(i.nombre);
    return { ...i, nombre: c.nombre, productoId: c.productoId, sku: c.sku };
  });
}

export const esAdminProductos = (rol?: string): boolean => rol === "creador" || rol === "admin";

// ---------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------

export interface DatosProducto {
  nombre: string;
  unidad: string;
  marca?: string;
  categoria?: string;
  descripcion?: string;
}

export type RespuestaCrear =
  | { ok: true; producto: ProductoMaestro }
  | { ok: false; error: string; mensaje: string; sugerencia?: Pick<ProductoMaestro, "id" | "sku" | "nombre_display" | "nombre_normalizado"> & { similitud?: number } };

/** Alta en el catálogo (solo administrador): POST /api/productos. `forzar` = crear aunque haya uno parecido. */
export async function crearProducto(d: DatosProducto, opc: { forzar?: boolean; solicitudId?: string } = {}): Promise<RespuestaCrear> {
  const r = await fetch("/api/productos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, ...opc }) });
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.producto) {
    await leerCatalogo();
    return { ok: true, producto: j.producto };
  }
  return { ok: false, error: j.error ?? "ERROR", mensaje: j.mensaje ?? `No se pudo crear (${r.status}).`, sugerencia: j.sugerencia };
}

export async function solicitarProducto(d: DatosProducto & { motivo?: string; modulo?: string; usuario?: string }): Promise<void> {
  const norm = normalizarNombre(d.nombre);
  if (!norm) throw new ProductoError("Ingrese el nombre del producto.");
  const existe = buscarProducto(norm);
  if (existe) throw new ProductoError(`Ya existe como ${existe.nombre_normalizado} (${existe.sku}). Elíjalo del catálogo.`);
  if (estado.solicitudes.some((s) => s.estado === "pendiente" && normalizarNombre(s.nombre) === norm)) throw new ProductoError("Ese producto ya está solicitado y espera aprobación.");
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new ProductoError("Su sesión expiró. Vuelva a ingresar.");
  // Columnas reales de productos_solicitudes (nombre_solicitado y nombre_norm son NOT NULL en producción)
  const { error } = await sb.from("productos_solicitudes").insert({
    nombre_solicitado: d.nombre.trim().replace(/\s+/g, " ").toUpperCase(),
    nombre_norm: norm,
    marca: d.marca?.trim() || null,
    unidad: d.unidad || "UND",
    categoria_sugerida: d.categoria?.trim() || null,
    motivo: d.motivo?.trim() || null,
    estado: "PENDIENTE",
    solicitante_id: user.id,
    modulo: d.modulo ?? null,
    solicitado_usuario: d.usuario ?? null,
  });
  if (error) throw new ProductoError(faltaTabla(error) ? "Falta el catálogo en Supabase: ejecute supabase/migrations/20261022_unificar_productos.sql." : `No se pudo enviar la solicitud: ${error.message}`);
  await leerCatalogo();
}

/**
 * Aprueba una solicitud (solo creador / admin): el RPC aprobar_solicitud_producto crea el producto con su SKU
 * (o la enlaza al que ya existe) y la deja APROBADA. Se vuelve a leer el catálogo para que el producto salga
 * al instante en los selectores (Requerimiento de Compra, etc.); las otras PCs lo reciben por Realtime.
 */
export async function aprobarSolicitud(id: string): Promise<ProductoMaestro> {
  const { data, error } = await createClient().rpc("aprobar_solicitud_producto", { p_solicitud_id: id });
  if (error)
    throw new ProductoError(
      error.code === "PGRST202" || /could not find the function/i.test(error.message)
        ? "Falta la función en Supabase: ejecute supabase/migrations/20261026_aprobar_solicitud.sql."
        : error.code === "42501"
          ? "Solo el administrador (creador) aprueba productos nuevos."
          : error.message
    );
  await leerCatalogo();
  return data as ProductoMaestro;
}

export async function rechazarSolicitud(id: string, respuesta: string): Promise<void> {
  const { error } = await createClient().from("productos_solicitudes").update({ estado: "RECHAZADA", respuesta: respuesta.trim() || null, resuelto_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new ProductoError(error.message);
  await leerCatalogo();
}

/** Asigna una solicitud a un producto que ya existe (era un duplicado). */
export async function resolverSolicitudCon(id: string, producto: ProductoMaestro): Promise<void> {
  const { error } = await createClient()
    .from("productos_solicitudes")
    .update({ estado: "APROBADA", producto_id: producto.id, respuesta: `Ya existe como ${producto.nombre_normalizado} (${producto.sku})`, resuelto_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new ProductoError(error.message);
  await leerCatalogo();
}

export async function editarProducto(id: string, cambios: Partial<Pick<ProductoMaestro, "nombre_display" | "unidad" | "marca" | "categoria" | "descripcion" | "activo">>): Promise<void> {
  const { error } = await createClient().from("productos_maestro").update(cambios).eq("id", id);
  if (error) throw new ProductoError(error.code === "42501" ? "Solo el administrador edita el catálogo." : error.message);
  await leerCatalogo();
}

/** "origen" pasa a ser alias de "destino" y su stock se suma al producto oficial en cada almacén. */
export async function unificarProductos(origenId: string, destinoId: string): Promise<{ destino: string; origen: string; filas_stock: number }> {
  const { data, error } = await createClient().rpc("unificar_productos", { p_origen: origenId, p_destino: destinoId });
  if (error) throw new ProductoError(error.message);
  await leerCatalogo();
  return data as { destino: string; origen: string; filas_stock: number };
}
