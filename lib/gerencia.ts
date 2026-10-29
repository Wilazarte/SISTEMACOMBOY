"use client";

// Dashboard Gerencia (/gerencia): visor general en tiempo real, solo lectura (pedido de Williams, 2026-10-29).
// Todo sale de los datos reales del ERP (useStore se actualiza en vivo con Supabase Realtime); no se inventan cifras.

import { useEffect, useMemo, useState } from "react";
import { useLogistica } from "./logistica";
import type { OrdenProduccion } from "./produccion";
import { KEYS, hoy, r2, useStore } from "./storage";
import type { ComprobanteVenta, EventoHistorial, Factura, Guia, NotaPedido, OrdenCompra, OrdenDespacho, Requerimiento } from "./types";
import { estadoOD, npPorCobrar, saldoNP, vencimientoNP } from "./ventas";

export type Etapa = "req" | "cot" | "oc" | "agencia" | "almacen" | "produccion" | "despacho" | "factura";
export type ModuloGerencia = "Logística" | "Finanzas" | "Almacén" | "Producción";

/** Flujo principal: Requerimiento → Cotización → OC → Agencia → Almacén → Producción → Despacho → Factura. */
export const ETAPAS: { id: Etapa; label: string; modulo: ModuloGerencia }[] = [
  { id: "req", label: "Requerimiento", modulo: "Almacén" },
  { id: "cot", label: "Cotización", modulo: "Logística" },
  { id: "oc", label: "OC", modulo: "Finanzas" },
  { id: "agencia", label: "Agencia", modulo: "Logística" },
  { id: "almacen", label: "Almacén", modulo: "Almacén" },
  { id: "produccion", label: "Producción", modulo: "Producción" },
  { id: "despacho", label: "Despacho", modulo: "Almacén" },
  { id: "factura", label: "Factura", modulo: "Logística" },
];
export const MODULOS_GERENCIA: ModuloGerencia[] = ["Logística", "Finanzas", "Almacén", "Producción"];

/** Criticidad de una etapa: rojo si hay más de 5 pendientes, amarillo de 3 a 5, verde de 0 a 2. */
export const criticidad = (n: number): "rojo" | "amarillo" | "verde" => (n > 5 ? "rojo" : n >= 3 ? "amarillo" : "verde");

/** Más de 2 horas en la misma etapa: se marca en rojo. */
export const LIMITE_ETAPA_MS = 2 * 60 * 60 * 1000;

export interface FilaFlujo {
  clave: string;
  etapa: Etapa;
  modulo: ModuloGerencia;
  doc: string;
  estado: string;
  responsable: string;
  /** Desde cuándo está en la etapa (último movimiento): ISO o YYYY-MM-DD. */
  desde: string;
}

/** Milisegundos de una fecha ISO o YYYY-MM-DD (esta última, al inicio del día en Perú). */
export const msDe = (f: string): number => new Date(f.length <= 10 ? `${f}T00:00:00-05:00` : f).getTime();

const ultimo = (h: EventoHistorial[] | undefined): EventoHistorial | undefined => (h && h.length ? h[h.length - 1] : undefined);

/** Reloj de la pantalla: se refresca cada 30 s para el "tiempo en etapa". */
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

export function useGerencia() {
  const log = useLogistica();
  const pendientesReq = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);

  return useMemo(() => {
    const hoyStr = hoy();
    const filas: FilaFlujo[] = [];
    const etapaDe = (id: Etapa) => ETAPAS.find((e) => e.id === id)!;
    const push = (id: Etapa, f: Omit<FilaFlujo, "etapa" | "modulo">) => filas.push({ ...f, etapa: id, modulo: etapaDe(id).modulo });

    // Requerimiento (por revisar) y Cotización (aceptado / cotizado, aún sin OC); sin duplicados entre listas
    const reqs = new Map<string, Requerimiento>();
    [...procesados, ...pendientesReq].forEach((r) => reqs.set(r.id, r));
    for (const r of Array.from(reqs.values())) {
      const u = ultimo(r.historial);
      const base = { clave: `req:${r.id}`, doc: r.numero, estado: r.estado, responsable: r.creadoPor || u?.usuario || r.solicitante, desde: u?.fecha || r.fecha };
      if (r.estado === "PENDIENTE" || r.estado === "OBSERVADO") push("req", base);
      else if (r.estado === "ACEPTADO" || r.estado === "COTIZADO") push("cot", { ...base, responsable: u?.usuario || base.responsable });
    }
    // OC en curso (emitida, aprobada, bancarizada, facturada); con guía pasa a Almacén
    for (const o of ordenes.filter((x) => x.estado !== "FINALIZADA" && x.estado !== "EN_GUIA" && !x.ingresadaAlmacen)) {
      const u = ultimo(o.historial);
      push("oc", { clave: `oc:${o.id}`, doc: `${o.numero} · ${o.proveedor}`, estado: o.estado, responsable: u?.usuario || "Tesorería", desde: u?.fecha || o.fecha });
    }
    // Agencia: despachos dejados en agencia y traslados en camino
    for (const o of log.odsTransito)
      push("agencia", { clave: `ag:${o.id}`, doc: `${o.numero} · ${o.agenciaNombre ?? "Agencia"}`, estado: "EN AGENCIA", responsable: ultimo(o.historial)?.usuario || "Almacén", desde: o.actualizado || o.fecha });
    for (const t of log.trasladosCamino)
      push("agencia", { clave: `tr:${t.id}`, doc: `${t.codigo} → ${t.destino}`, estado: "EN CAMINO", responsable: t.transportista || "Logística", desde: t.fechaEnvio });
    // Almacén: guías de compra esperando V°B°
    for (const g of guias.filter((x) => x.estado === "PENDIENTE_VB")) {
      const u = ultimo(g.historial);
      push("almacen", { clave: `gr:${g.id}`, doc: `Guía ${g.numero} · ${g.ocNumero}`, estado: "PENDIENTE V°B°", responsable: u?.usuario || "Almacén", desde: u?.fecha || g.fecha });
    }
    // Producción: OP en fabricación
    for (const o of ops.filter((x) => x.estado === "EN_FABRICACION"))
      push("produccion", { clave: `op:${o.id}`, doc: `${o.id} · ${o.tipo_equipo} ${o.modelo}`, estado: "EN FABRICACIÓN", responsable: o.creado_por || "Producción", desde: o.creado || o.fecha });
    // Despacho: órdenes de despacho por atender
    for (const o of ods.filter((x) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(x)))) {
      const u = ultimo(o.historial);
      push("despacho", { clave: `od:${o.id}`, doc: `${o.numero} · ${o.cliente}`, estado: estadoOD(o).replace(/_/g, " "), responsable: u?.usuario || o.creadoPor || "Ventas", desde: u?.fecha || o.fecha });
    }
    // Factura: notas de pedido aprobadas aún sin comprobante
    for (const n of notas.filter((x) => x.estado === "APROBADA" && !x.comprobanteId && !x.comprobanteExterno && x.origen !== "SECOCHA")) {
      const u = ultimo(n.historial);
      push("factura", { clave: `np:${n.id}`, doc: `${n.numero} · ${n.cliente}`, estado: "POR FACTURAR", responsable: n.vendedor || u?.usuario || "Ventas", desde: u?.fecha || n.fecha });
    }
    filas.sort((a, b) => msDe(b.desde) - msDe(a.desde));

    const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e.id, filas.filter((f) => f.etapa === e.id).length])) as Record<Etapa, number>;
    const porModulo = Object.fromEntries(MODULOS_GERENCIA.map((m) => [m, filas.filter((f) => f.modulo === m).length])) as Record<ModuloGerencia, number>;

    const facturacionHoy = r2(comprobantes.filter((c) => c.estado === "EMITIDO" && c.fecha.startsWith(hoyStr)).reduce((a, c) => a + (c.total || 0), 0));
    const cxcVencidas = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0 && vencimientoNP(n) < hoyStr);
    const cxpVencidas = facturas.filter((f) => f.estadoPago === "POR_PAGAR" && f.fechaVencimiento && f.fechaVencimiento.slice(0, 10) < hoyStr);

    return {
      filas,
      porEtapa,
      porModulo,
      ticker: {
        comprasActivas: log.totalOcActivas,
        enTransito: log.odsTransito.length + log.trasladosCamino.length,
        opActivas: log.opsActivas.length,
        ptDisponible: log.ptDisponible.length,
        facturacionHoy,
      },
      cxcVencidas,
      cxpVencidas,
      recordatorios: log.pendientes,
    };
  }, [log, pendientesReq, procesados, ordenes, guias, ops, ods, notas, comprobantes, facturas]);
}
