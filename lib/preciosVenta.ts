"use client";

// =====================================================================
// VENTAS › PRECIOS DE VENTA (pedido de Williams 2026-11-22)
// Base de precios de venta: un precio guardado por producto del catálogo o por modelo de equipo.
//   * Equipos: se jala de Costo de Producción cuando la ficha (hoja de costo) está COMPLETA (APROBADA o CERRADA):
//     precio sin IGV = costo unitario / (1 − margen), y se guarda con IGV incluido.
//   * Sin ficha completa (o productos): se escribe a mano.
// Tablas: precios_venta + precios_venta_historial (supabase/migrations/20261225_precios_venta.sql).
// El precio guardado se propone solo al elegir el producto / equipo en la Nota de pedido o el Comprobante.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { ErpError, r2 } from "./storage";
import { getSesion } from "./auth";
import { TIPOS_EQUIPO } from "./equipos";

export type TipoPrecio = "PRODUCTO" | "EQUIPO";
export type OrigenPrecio = "MANUAL" | "COSTO_PRODUCCION";

export interface PrecioVenta {
  id: string;
  tipo: TipoPrecio;
  clave: string;
  producto_id: string | null;
  sku: string | null;
  nombre: string;
  unidad: string;
  /** S/ por unidad, IGV incluido. */
  precio: number;
  precio_sin_igv: number;
  origen: OrigenPrecio;
  hoja_costo: string | null;
  costo_unitario: number | null;
  margen: number | null;
  observacion: string | null;
  activo: boolean;
  created_at: string;
  created_usuario: string | null;
  updated_at: string;
  updated_usuario: string | null;
}

export interface HistorialPrecio {
  id: number;
  precio_id: string;
  precio_anterior: number | null;
  precio_nuevo: number;
  origen: OrigenPrecio;
  hoja_costo: string | null;
  costo_unitario: number | null;
  margen: number | null;
  observacion: string | null;
  usuario: string | null;
  created_at: string;
}

/** Última hoja de costo de un modelo de equipo (solo lectura de Costo de Producción). */
export interface CostoModelo {
  modelo: string;
  hoja: string;
  origen: string;
  estado: string;
  /** Ficha completa = hoja APROBADA o CERRADA. */
  completa: boolean;
  costo_unitario: number;
  margen: number;
  precio_sugerido: number;
  precio_venta: number;
  fecha: string;
}

export const IGV = 0.18;
export const conIgv = (sinIgv: number): number => r2(sinIgv * (1 + IGV));
export const sinIgv = (conIgvMonto: number): number => r2(conIgvMonto / (1 + IGV));
/** Precio con IGV a partir del costo unitario (sin IGV) y el margen sobre el precio. */
export const precioDesdeCosto = (costo: number, margen: number): number => (margen < 1 && costo > 0 ? conIgv(costo / (1 - margen)) : 0);

/** Modelos de equipo (los mismos de Costo de Producción por modelo). */
export const MODELOS_EQUIPO: string[] = TIPOS_EQUIPO.filter((t) => t !== "OTRO");

export const normalizarClave = (t: string): string => t.trim().replace(/\s+/g, " ").toUpperCase();

/** Igual que pc_modelo_familia() de la base: tipo + modelo de un equipo → modelo comercial. */
export function familiaEquipo(texto: string): string | null {
  const u = (texto ?? "").toUpperCase();
  if (u.includes("ELECTRIC")) return "REMOLCADOR ELECTRIC 4000";
  if (u.includes("COCHE")) return "COCHE MINERO";
  if (u.includes("3500") || /(^|[^A-Z])PRO([^A-Z]|$)/.test(u)) return "REMOLCADOR ECO-MINE 3500 PRO";
  if (u.includes("3000") || /ECO.*MINE/.test(u) || u.includes("CV-300") || u.includes("RONCO") || u.includes("ROMI")) return "REMOLCADOR ECO-MINE 3000";
  return null;
}

/** Quién puede guardar precios: Ventas, Finanzas/Tesorería y Soporte (la base aplica la misma regla). */
export function puedeEditarPrecios(): boolean {
  const s = getSesion();
  if (!s || s.soloLectura) return false;
  return ["creador", "soporte", "admin", "ventas", "tesoreria", "finanzas"].includes(s.rol as string);
}

// ---------------------------------------------------------------------
// Estado compartido (una carga + tiempo real)
// ---------------------------------------------------------------------

export interface EstadoPrecios {
  precios: PrecioVenta[];
  costos: CostoModelo[];
  listo: boolean;
  /** El SQL 20261225_precios_venta.sql aún no se corrió. */
  faltaTabla: boolean;
  error?: string;
}

let estado: EstadoPrecios = { precios: [], costos: [], listo: false, faltaTabla: false };
const oyentes = new Set<(e: EstadoPrecios) => void>();
let iniciado = false;
let carga: Promise<void> | null = null;
const avisar = () => oyentes.forEach((f) => f(estado));
const sinTabla = (e: { code?: string; message?: string }) => e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache/i.test(e.message ?? "");
const FALTA_SQL = "Falta correr en Supabase el SQL 20261225_precios_venta.sql (Precios de venta).";

const aPrecio = (r: Record<string, unknown>): PrecioVenta =>
  ({
    ...r,
    precio: Number(r.precio) || 0,
    precio_sin_igv: Number(r.precio_sin_igv) || 0,
    costo_unitario: r.costo_unitario === null || r.costo_unitario === undefined ? null : Number(r.costo_unitario),
    margen: r.margen === null || r.margen === undefined ? null : Number(r.margen),
  }) as PrecioVenta;

export function recargarPrecios(): Promise<void> {
  if (carga) return carga;
  carga = (async () => {
    const sb = createClient();
    const [p, c] = await Promise.all([sb.from("precios_venta").select("*").order("tipo").order("nombre"), sb.rpc("pv_costos_modelos")]);
    if (p.error) {
      estado = { ...estado, listo: true, faltaTabla: sinTabla(p.error), error: sinTabla(p.error) ? undefined : p.error.message };
    } else {
      const costos = c.error
        ? []
        : ((c.data ?? []) as Record<string, unknown>[]).map((x) => ({
            ...(x as unknown as CostoModelo),
            costo_unitario: Number(x.costo_unitario) || 0,
            margen: Number(x.margen) || 0,
            precio_sugerido: Number(x.precio_sugerido) || 0,
            precio_venta: Number(x.precio_venta) || 0,
            completa: x.completa === true,
          }));
      estado = { precios: (p.data ?? []).map((r) => aPrecio(r as Record<string, unknown>)), costos, listo: true, faltaTabla: false };
    }
    avisar();
  })()
    .catch((e) => {
      estado = { ...estado, listo: true, error: e instanceof Error ? e.message : String(e) };
      avisar();
    })
    .finally(() => {
      carga = null;
    });
  return carga;
}

function iniciar(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  void recargarPrecios();
  try {
    const sb = createClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    const programar = () => {
      clearTimeout(t);
      t = setTimeout(() => void recargarPrecios(), 350);
    };
    sb.channel("erp-precios-venta")
      .on("postgres_changes", { event: "*", schema: "public", table: "precios_venta" }, programar)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_orders" }, programar)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_costs" }, programar)
      .subscribe();
  } catch {
    /* sin Supabase configurado: solo la carga inicial */
  }
}

export function usePreciosVenta(): EstadoPrecios {
  const [e, setE] = useState<EstadoPrecios>(estado);
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
// Búsqueda (para Nota de pedido / Comprobante)
// ---------------------------------------------------------------------

export function precioGuardado(precios: PrecioVenta[], tipo: TipoPrecio, nombre: string): PrecioVenta | undefined {
  const clave = normalizarClave(nombre);
  return precios.find((p) => p.activo && p.tipo === tipo && p.clave === clave);
}

/** Precio guardado de un equipo por su tipo + modelo (ej. "REMOLCADOR ECO-MINE 3000"). */
export function precioEquipo(precios: PrecioVenta[], tipoEquipo: string, modelo = ""): PrecioVenta | undefined {
  const fam = familiaEquipo(`${tipoEquipo} ${modelo}`) ?? normalizarClave(tipoEquipo);
  return precioGuardado(precios, "EQUIPO", fam);
}

// ---------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------

export interface DatosPrecio {
  tipo: TipoPrecio;
  nombre: string;
  unidad?: string;
  producto_id?: string | null;
  sku?: string | null;
  precio: number;
  origen: OrigenPrecio;
  hoja_costo?: string | null;
  costo_unitario?: number | null;
  margen?: number | null;
  observacion?: string | null;
  activo?: boolean;
}

export async function guardarPrecio(d: DatosPrecio): Promise<void> {
  if (!puedeEditarPrecios()) throw new ErpError("Su perfil solo puede consultar los precios de venta.");
  if (!d.nombre.trim()) throw new ErpError("Indique el producto o modelo de equipo.");
  if (!(d.precio > 0)) throw new ErpError("El precio debe ser mayor a 0.");
  const fila = {
    tipo: d.tipo,
    clave: normalizarClave(d.nombre),
    nombre: d.nombre.trim(),
    unidad: d.unidad || "UND",
    producto_id: d.producto_id ?? null,
    sku: d.sku ?? null,
    precio: r2(d.precio),
    origen: d.origen,
    hoja_costo: d.origen === "COSTO_PRODUCCION" ? d.hoja_costo ?? null : null,
    costo_unitario: d.origen === "COSTO_PRODUCCION" ? d.costo_unitario ?? null : null,
    margen: d.origen === "COSTO_PRODUCCION" ? d.margen ?? null : null,
    observacion: d.observacion?.trim() || null,
    activo: d.activo ?? true,
  };
  const { error } = await createClient().from("precios_venta").upsert(fila, { onConflict: "tipo,clave" });
  if (error) {
    if (sinTabla(error)) throw new ErpError(FALTA_SQL);
    if (error.code === "42501" || /row-level security/i.test(error.message)) throw new ErpError("Su perfil no puede guardar precios de venta (solo Ventas, Finanzas y Soporte).");
    throw new ErpError(error.message);
  }
  await recargarPrecios();
}

export async function activarPrecio(id: string, activo: boolean): Promise<void> {
  if (!puedeEditarPrecios()) throw new ErpError("Su perfil solo puede consultar los precios de venta.");
  const { error } = await createClient().from("precios_venta").update({ activo }).eq("id", id);
  if (error) throw new ErpError(sinTabla(error) ? FALTA_SQL : error.message);
  await recargarPrecios();
}

export async function historialPrecio(id: string): Promise<HistorialPrecio[]> {
  const { data, error } = await createClient().from("precios_venta_historial").select("*").eq("precio_id", id).order("created_at", { ascending: false }).limit(100);
  if (error) throw new ErpError(sinTabla(error) ? FALTA_SQL : error.message);
  return (data ?? []).map((r) => ({
    ...(r as HistorialPrecio),
    precio_anterior: r.precio_anterior === null ? null : Number(r.precio_anterior),
    precio_nuevo: Number(r.precio_nuevo),
    costo_unitario: r.costo_unitario === null ? null : Number(r.costo_unitario),
    margen: r.margen === null ? null : Number(r.margen),
  }));
}
