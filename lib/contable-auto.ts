"use client";

// Botón "Generar asientos automáticos": registra los asientos que faltan de lo ya aprobado / emitido / pagado
// (NP aprobadas antes de activar Contable, OC emitidas, planillas cerradas). No duplica: ids fijos por origen.

import { asientoDe, asientoNotaPedido, asientoOrdenCompra, asientoPlanilla, getAsientosDiario } from "./contable";
import { listarHistorial } from "./historial";
import { ErpError, KEYS, getOrdenes, leer, tablaDisponible } from "./storage";
import { getComprobantes, getNotasPedido } from "./ventas";
import type { AsientoContable } from "./types";

export interface ResultadoGeneracion {
  np: number;
  oc: number;
  planilla: number;
  omitidas: string[];
}

export async function generarAsientosAutomaticos(usuario: string): Promise<ResultadoGeneracion> {
  if (!tablaDisponible("contable")) throw new ErpError("Falta la tabla contable en Supabase: ejecute supabase/contable_tables.sql.");
  const r: ResultadoGeneracion = { np: 0, oc: 0, planilla: 0, omitidas: [] };
  const existentes = getAsientosDiario();
  const ventas = leer<AsientoContable[]>(KEYS.ASIENTOS, []);

  // Ventas: NP aprobadas / facturadas (si su factura ya tiene asiento en Ventas, no se duplica)
  for (const n of getNotasPedido()) {
    if (n.estado !== "APROBADA" && n.estado !== "FACTURADA") continue;
    if (asientoDe("NP", n.id, existentes)) continue;
    const comp = n.comprobanteId ? getComprobantes().find((c) => c.id === n.comprobanteId) : undefined;
    if (comp && ventas.some((a) => a.comprobanteId === comp.id)) {
      r.omitidas.push(`${n.numero}: ya registrada con ${comp.numero}`);
      continue;
    }
    if (asientoNotaPedido(n, usuario, n.fecha)) r.np++;
  }

  // Compras: OC emitidas
  for (const o of getOrdenes()) {
    if (asientoDe("OC", o.id, existentes)) continue;
    if (asientoOrdenCompra(o, usuario, o.fecha)) r.oc++;
  }

  // Planilla: semanas cerradas (pagadas)
  try {
    for (const h of await listarHistorial()) {
      if (asientoDe("PLANILLA", h.id, existentes)) continue;
      const a = asientoPlanilla(
        { id: h.id, periodo: h.periodo, bruto: Number(h.total_bruto) || 0, descuento: Number(h.total_descuento) || 0, adelantos: Number(h.total_adelantos) || 0, pagado: Number(h.total_pagar) || 0 },
        usuario,
        String(h.fecha_cierre).slice(0, 10)
      );
      if (a) r.planilla++;
    }
  } catch (e) {
    r.omitidas.push(`Planilla: ${(e as Error).message}`);
  }
  return r;
}
