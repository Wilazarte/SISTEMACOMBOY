"use client";

// Almacén › Stock: retiro para producción (Vale de Producción Interno VPI-000001) y consultas de kardex.
// El retiro lo hace Supabase en una sola transacción (función retiro_produccion, ver supabase/almacen_kardex.sql)
// a través de POST /api/almacen/retiro-produccion: valida stock (nunca negativo), descuenta, numera el VPI y
// anota el kardex SALIDA-PRODUCCION con el chasis / OT.

import { normalizarChasis } from "./utils/chasis";
import { ErpError, KEYS, getKardex, getValesProduccion, recargarDatos } from "./storage";
import type { MovimientoKardex, StockItem, ValeProduccion } from "./types";

export { ETIQUETA_MOTIVO, MOTIVOS_RETIRO, REQUIERE_CHASIS, errorChasis, requiereChasis, textoChasis, type MotivoRetiro } from "./motivosRetiro";
import { MOTIVOS_RETIRO, errorChasis, type MotivoRetiro } from "./motivosRetiro";
export const AUTORIZA_DEFECTO = "Jose Manuel";

export interface DatosRetiro {
  producto_id: string;
  cantidad_a_retirar: number;
  chasis_ot: string | null; // obligatorio solo para PRODUCCION - … / MANTENIMIENTO EQUIPO
  motivo: MotivoRetiro;
  solicitante: string;
  autoriza: string;
  op_id?: string | null;
  equipo_id?: string | null;
}

export async function retiroProduccion(d: DatosRetiro, disponible: number): Promise<{ vpi: string; saldo: number }> {
  if (!d.producto_id) throw new ErpError("Elija el producto.");
  if (!(d.cantidad_a_retirar > 0)) throw new ErpError("Indique la cantidad a retirar.");
  if (d.cantidad_a_retirar > disponible + 1e-9) throw new ErpError(`Stock insuficiente: hay ${disponible}, se pide ${d.cantidad_a_retirar}.`);
  if (!MOTIVOS_RETIRO.includes(d.motivo)) throw new ErpError("Elija el motivo.");
  const eChasis = errorChasis(d.motivo, d.chasis_ot);
  if (eChasis) throw new ErpError(eChasis);
  if (!d.solicitante.trim()) throw new ErpError("Indique el solicitante.");
  if (!d.autoriza.trim()) throw new ErpError("Indique quién autoriza.");
  const res = await fetch("/api/almacen/retiro-produccion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...d, chasis_ot: (d.chasis_ot ?? "").trim().toUpperCase() || null }),
  });
  const json = (await res.json().catch(() => ({}))) as { vpi?: string; saldo?: number; error?: string };
  if (!res.ok || !json.vpi) throw new ErpError(json.error ?? `No se pudo registrar el retiro (HTTP ${res.status}).`);
  await recargarDatos(KEYS.STOCK, KEYS.KARDEX, KEYS.VALES_PRODUCCION);
  return { vpi: json.vpi, saldo: Number(json.saldo) };
}

/** Movimientos de un producto (del más reciente al más antiguo). */
export function kardexDe(item: StockItem, kardex: MovimientoKardex[] = getKardex()): MovimientoKardex[] {
  const nombre = item.nombre.trim().toUpperCase();
  return kardex
    .filter((k) => k.stock_id === item.id || (k.sede === item.sede && k.producto.trim().toUpperCase() === nombre && k.unidad === item.unidad))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Consumo de repuestos de un chasis / OT (solo vales CON chasis: los de consumo general no van al equipo). */
export function consumosDeChasis(chasis: string, opId?: string, vales: ValeProduccion[] = getValesProduccion()): ValeProduccion[] {
  const c = normalizarChasis(chasis);
  return vales
    .filter((v) => !!normalizarChasis(v.chasis_ot))
    .filter((v) => (c && normalizarChasis(v.chasis_ot) === c) || (opId && (v.op_id === opId || normalizarChasis(v.chasis_ot) === normalizarChasis(opId))))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export const ETIQUETA_KARDEX: Record<MovimientoKardex["tipo_movimiento"], string> = {
  SALDO_INICIAL: "Saldo inicial",
  INGRESO: "INGRESO por V°B°",
  "SALIDA-VENTA": "SALIDA-VENTA",
  "SALIDA-PRODUCCION": "SALIDA-PRODUCCION",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
};
