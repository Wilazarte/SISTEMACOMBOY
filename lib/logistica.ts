"use client";

// =====================================================================
// Logística Planta (Arequipa): solo LEE datos que ya existen en el ERP
// (OC, órdenes de despacho, traslados a Secocha, órdenes de producción,
// equipos terminados, facturas, guías). No escribe nada en Supabase.
// Compras y Ventas Nacionales · Sin flota propia · Agencias de transporte.
// =====================================================================

import { useMemo } from "react";
import { KEYS, hoy, r2, useStore } from "./storage";
import type { EquipoTerminado } from "./equipos";
import type { OrdenProduccion } from "./produccion";
import type { Traslado } from "./sucursal-modelos";
import type { EventoHistorial, Factura, Guia, OrdenCompra, OrdenDespacho } from "./types";
import { estadoOD } from "./ventas";

export const VERSION_LOGISTICA = "v1.4.2";

/** Agencias con las que trabaja la planta (no hay flota propia). Las OD guardan el nombre como texto libre. */
export const AGENCIAS = [
  { id: "marvisur", nombre: "Marvisur", detalle: "Transporte nacional autorizado" },
  { id: "grael", nombre: "Grael", detalle: "Carga pesada" },
  { id: "shalom", nombre: "Shalom", detalle: "Courier nacional" },
] as const;

/** Agencia normalizada de una OD ("MARVISUR EXPRESS" → marvisur). Otras quedan con su propio nombre. */
export const agenciaDe = (nombre?: string): string => {
  const n = (nombre ?? "").trim().toLowerCase();
  return AGENCIAS.find((a) => n.includes(a.id))?.id ?? (n || "otra");
};

/** Avance de una OC según su estado en Tesorería / Almacén. */
export function avanceOC(o: OrdenCompra): number {
  if (o.ingresadaAlmacen || o.estado === "FINALIZADA") return 100;
  return { EMITIDA: 20, BANCARIZADA: 40, FACTURADA: 60, EN_GUIA: 80, APROBADA: 90, FINALIZADA: 100 }[o.estado] ?? 0;
}

/** OC aún en curso: no finalizada ni ingresada a almacén. */
export const ocActiva = (o: OrdenCompra): boolean => o.estado !== "FINALIZADA" && !o.ingresadaAlmacen;

const DIA = 86_400_000;
const diasDesde = (fecha: string, base = hoy()): number => Math.round((new Date(`${base}T12:00:00`).getTime() - new Date(`${fecha.slice(0, 10)}T12:00:00`).getTime()) / DIA);

/** OD dejada en agencia hace pocos días: se cuenta como envío en tránsito al cliente. */
export const DIAS_TRANSITO = 15;

export interface Pendiente {
  clave: string;
  titulo: string;
  detalle: string;
  etiqueta: string;
  href: string;
}

export interface EventoLogistica {
  fecha: string;
  doc: string;
  accion: string;
  detalle: string;
  href: string;
}

export function useLogistica() {
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const traslados = useStore<Traslado[]>(KEYS.SUC_TRASLADOS, []);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []);

  return useMemo(() => {
    const hoyStr = hoy();
    const ocActivas = ordenes.filter(ocActiva).sort((a, b) => b.total - a.total);
    const totalOcActivas = r2(ocActivas.reduce((a, o) => a + o.total, 0));

    const odsAgencia = ods.filter((o) => o.lugar === "ENVIO_AGENCIA" && estadoOD(o) !== "ANULADO");
    const trasladosCamino = traslados.filter((t) => t.estado === "en-camino");
    const odsTransito = odsAgencia.filter((o) => estadoOD(o) === "DEJADO_EN_AGENCIA" && diasDesde(o.actualizado || o.fecha, hoyStr) <= DIAS_TRANSITO);
    const odsPorDespachar = odsAgencia.filter((o) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(o)));

    const opsActivas = ops.filter((o) => o.estado === "EN_FABRICACION");
    const ptDisponible = equipos.filter((e) => e.estado === "DISPONIBLE");
    const ptPorTipo = Object.entries(
      ptDisponible.reduce<Record<string, number>>((acc, e) => {
        const t = e.tipo_equipo || "Equipo";
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]);

    // Pendientes urgentes: pagos de OC, guías por confirmar, facturas por vencer, traslados en camino
    const pendientes: Pendiente[] = [];
    for (const o of ocActivas.filter((x) => x.estado === "EMITIDA"))
      pendientes.push({ clave: `oc:${o.id}`, titulo: `Pagar ${o.proveedor} · ${o.numero}`, detalle: `OC emitida, falta bancarizar / pagar`, etiqueta: "Por pagar", href: "/dashboard/compras?tab=ordenes" });
    for (const g of guias.filter((x) => x.estado === "PENDIENTE_VB"))
      pendientes.push({ clave: `gr:${g.id}`, titulo: `Confirmar guía ${g.numero}`, detalle: `${g.ocNumero} · falta V°B° de Almacén`, etiqueta: "Guía", href: "/dashboard/almacen?tab=ingresos" });
    for (const f of facturas.filter((x) => x.estadoPago === "POR_PAGAR" && x.fechaVencimiento)) {
      const d = -diasDesde(f.fechaVencimiento, hoyStr);
      if (d > 3) continue;
      pendientes.push({ clave: `fac:${f.id}`, titulo: `Factura ${f.numero} · ${f.proveedor}`, detalle: d < 0 ? `Vencida hace ${-d} día(s)` : d === 0 ? "Vence hoy" : `Vence en ${d} día(s)`, etiqueta: d <= 0 ? "Hoy" : `${d} d`, href: "/dashboard/compras?tab=facturas" });
    }
    for (const t of trasladosCamino)
      pendientes.push({ clave: `tr:${t.id}`, titulo: `Transferencia ${t.codigo} · Planta → ${t.destino}`, detalle: [t.guiaRemision && `Guía ${t.guiaRemision}`, t.transportista].filter(Boolean).join(" · ") || "Sin transportista registrado", etiqueta: "En tránsito", href: "/logistica/transferencias" });

    // Proveedores nacionales: lo comprado por OC
    const proveedores = Object.values(
      ordenes.reduce<Record<string, { proveedor: string; ruc: string; ocs: number; total: number; activas: number; ultima: OrdenCompra }>>((acc, o) => {
        const k = o.ruc || o.proveedor;
        const p = (acc[k] ??= { proveedor: o.proveedor, ruc: o.ruc, ocs: 0, total: 0, activas: 0, ultima: o });
        p.ocs++;
        p.total = r2(p.total + o.total);
        if (ocActiva(o)) p.activas++;
        if (o.fecha > p.ultima.fecha) p.ultima = o;
        return acc;
      }, {})
    ).sort((a, b) => b.total - a.total);

    // Agencias: envíos por agencia y flete (costoEnvio) de las OD
    const agencias = [...AGENCIAS.map((a) => a.id as string), ...new Set(odsAgencia.map((o) => agenciaDe(o.agenciaNombre)))]
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .map((id) => {
        const del = odsAgencia.filter((o) => agenciaDe(o.agenciaNombre) === id);
        const fletes = del.map((o) => o.costoEnvio ?? 0).filter((n) => n > 0);
        const fija = AGENCIAS.find((a) => a.id === id);
        return {
          id,
          nombre: fija?.nombre ?? del[0]?.agenciaNombre ?? id,
          detalle: fija?.detalle ?? "",
          envios: del.length,
          enTransito: del.filter((o) => odsTransito.includes(o)).length,
          flete: r2(fletes.reduce((a, n) => a + n, 0)),
          fletePromedio: fletes.length ? r2(fletes.reduce((a, n) => a + n, 0) / fletes.length) : 0,
          ultimo: [...del].sort((a, b) => (b.actualizado || b.fecha).localeCompare(a.actualizado || a.fecha))[0],
        };
      });

    // Historial general: eventos de OC, OD, traslados y producción
    const historial: EventoLogistica[] = [];
    const deHist = (h: EventoHistorial[] | undefined, doc: string, href: string) =>
      (h ?? []).forEach((e) => historial.push({ fecha: e.fecha, doc, accion: e.accion, detalle: e.detalle ?? "", href }));
    ordenes.forEach((o) => deHist(o.historial, o.numero, "/dashboard/compras?tab=ordenes"));
    ods.forEach((o) => deHist(o.historial, o.numero, "/dashboard/almacen?tab=despacho"));
    traslados.forEach((t) => {
      historial.push({ fecha: t.fechaEnvio, doc: t.codigo, accion: "Traslado enviado", detalle: `Planta → ${t.destino}${t.guiaRemision ? ` · guía ${t.guiaRemision}` : ""}`, href: "/logistica/transferencias" });
      if (t.fechaRecepcion) historial.push({ fecha: t.fechaRecepcion, doc: t.codigo, accion: "Traslado recibido", detalle: t.recibidoPor ? `Recibió: ${t.recibidoPor}` : t.destino, href: "/logistica/transferencias" });
    });
    ops.forEach((o) => {
      historial.push({ fecha: o.creado || o.fecha, doc: o.id, accion: "Orden de producción", detalle: `${o.tipo_equipo} ${o.modelo} · ${o.codigo_chasis}`, href: "/dashboard/produccion" });
      if (o.qc) historial.push({ fecha: o.qc.aprobado || o.qc.fecha, doc: o.id, accion: "QC aprobado", detalle: `Supervisor: ${o.qc.supervisor}`, href: "/dashboard/produccion" });
    });
    historial.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

    // Guías de remisión: las de despacho por agencia (Ventas) y las de traslado a Secocha
    const guiasRemision = [
      ...ods.filter((o) => o.guiaNro).map((o) => ({ id: o.id, numero: o.guiaNro as string, origen: o.numero, destino: o.lugar === "ENVIO_AGENCIA" ? `${o.agenciaNombre ?? "Agencia"} · ${o.direccionDestino || o.cliente}` : o.cliente, fecha: o.actualizado || o.fecha, estado: estadoOD(o) as string })),
      ...traslados.filter((t) => t.guiaRemision).map((t) => ({ id: t.id, numero: t.guiaRemision, origen: t.codigo, destino: `Planta → ${t.destino}`, fecha: t.fechaEnvio, estado: t.estado.toUpperCase() })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));

    return {
      ordenes,
      ocActivas,
      totalOcActivas,
      odsAgencia,
      odsTransito,
      odsPorDespachar,
      traslados: [...traslados].sort((a, b) => b.fechaEnvio.localeCompare(a.fechaEnvio)),
      trasladosCamino,
      opsActivas,
      ptDisponible,
      ptPorTipo,
      pendientes,
      proveedores,
      agencias,
      historial,
      guiasRemision,
    };
  }, [ordenes, facturas, guias, ods, traslados, ops, equipos]);
}

export type DatosLogistica = ReturnType<typeof useLogistica>;

/** Abre un módulo en una pestaña nueva (igual que VENTAS). Las rutas del ERP conservan window.opener para avisar al guardar. */
export const abrirPestana = (href: string): void => {
  if (href.startsWith("/")) window.open(href, "_blank");
  else window.open(href, "_blank", "noopener");
};
