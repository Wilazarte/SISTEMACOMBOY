"use client";

import { useEffect, useMemo, useState } from "react";
import { listarCajas, type Caja } from "@/lib/cajas";
import type { EquipoTerminado } from "@/lib/equipos";
import { useExpedientes } from "@/lib/expedientes";
import { useLogistica } from "@/lib/logistica";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, hoy, r2, soles, useStore } from "@/lib/storage";
import type { ComprobanteVenta, Factura, Guia, NotaPedido, OrdenCompra, OrdenDespacho, StockItem } from "@/lib/types";
import { estadoOD, npPorCobrar, saldoNP, vencimientoNP } from "@/lib/ventas";
import { montoCorto } from "@/components/logistica/planta";
import type { ModuloInicio } from "@/lib/inicioModulos";

// 4 KPIs de cada INICIO, todos calculados de las tablas del ERP (sin cifras de ejemplo).

export interface KpiInicio {
  titulo: string;
  valor: string;
  detalle: string;
  /** Pantalla que abre la tarjeta (pestaña nueva). */
  href: string;
  alerta?: boolean;
}

/** Stock crítico: 5 unidades o menos (igual que el Dashboard). */
const STOCK_CRITICO = 5;

function useKpisLogistica(activo: boolean): KpiInicio[] {
  const d = useLogistica();
  if (!activo) return [];
  const oc = d.ocActivas[0];
  const enTransito = d.odsTransito.length + d.trasladosCamino.length;
  return [
    { titulo: "Compras activas", valor: montoCorto(d.totalOcActivas), detalle: oc ? `${d.ocActivas.length} OC · mayor ${oc.numero} ${soles(oc.total)}` : "Sin órdenes de compra en curso", href: "/dashboard/compras?tab=ordenes" },
    { titulo: "En tránsito", valor: `${enTransito} ${enTransito === 1 ? "envío" : "envíos"}`, detalle: `${d.odsTransito.length} OD en agencia · ${d.trasladosCamino.length} traslado(s)`, href: "/logistica/transferencias" },
    { titulo: "OT activas", valor: String(d.opsActivas.length), detalle: "Órdenes de producción en fabricación", href: "/dashboard/produccion" },
    { titulo: "PT disponible", valor: `${d.ptDisponible.length} ${d.ptDisponible.length === 1 ? "equipo" : "equipos"}`, detalle: d.ptPorTipo.map(([t, n]) => `${n} ${t}`).join(" · ") || "Sin equipos listos para despacho", href: "/dashboard/ventas?tab=despachos" },
  ];
}

function useKpisAlmacen(activo: boolean): KpiInicio[] {
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], activo);
  const guias = useStore<Guia[]>(KEYS.GUIAS, [], activo);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, [], activo);
  return useMemo(() => {
    if (!activo) return [];
    const valor = r2(stock.reduce((a, s) => a + s.cantidad * (s.costoUnit || 0), 0));
    const conStock = stock.filter((s) => s.cantidad > 0).length;
    const criticos = stock.filter((s) => s.cantidad <= STOCK_CRITICO);
    const porVB = guias.filter((g) => g.estado === "PENDIENTE_VB");
    const porDespachar = ods.filter((o) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(o)));
    return [
      { titulo: "Stock valorizado", valor: montoCorto(valor), detalle: `${conStock} producto(s) con stock`, href: "/dashboard/almacen?tab=stock" },
      { titulo: "Stock crítico", valor: String(criticos.length), detalle: `Productos con ${STOCK_CRITICO} unidades o menos`, href: "/dashboard/almacen?tab=stock", alerta: criticos.length > 0 },
      { titulo: "Guías por V°B°", valor: String(porVB.length), detalle: "Ingresos esperando visto bueno", href: "/dashboard/almacen?tab=ingresos", alerta: porVB.length > 0 },
      { titulo: "Por despachar", valor: String(porDespachar.length), detalle: "Órdenes de despacho pendientes o alistadas", href: "/dashboard/almacen?tab=despacho", alerta: porDespachar.length > 0 },
    ];
  }, [activo, stock, guias, ods]);
}

function useKpisFinanzas(activo: boolean): KpiInicio[] {
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, [], activo);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, [], activo);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, [], activo);
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  useEffect(() => {
    if (activo) void listarCajas().then(setCajas);
  }, [activo]);
  return useMemo(() => {
    if (!activo) return [];
    const hoyStr = hoy();
    const mes = hoyStr.slice(0, 7);
    const porPagar = facturas.filter((f) => f.estadoPago === "POR_PAGAR");
    const cxp = r2(porPagar.reduce((a, f) => a + (f.netoPagar ?? f.total), 0));
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    const cxc = r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0));
    const vencidas = porCobrar.filter((n) => vencimientoNP(n) < hoyStr).length;
    const igvVentas = comprobantes.filter((c) => c.estado === "EMITIDO" && c.fecha.startsWith(mes)).reduce((a, c) => a + (c.igv || 0), 0);
    const igvCompras = facturas.filter((f) => f.fecha.startsWith(mes)).reduce((a, f) => a + (f.igv || 0), 0);
    const igv = r2(igvVentas - igvCompras);
    const saldo = r2((cajas ?? []).reduce((a, c) => a + (c.saldo_actual || 0), 0));
    return [
      { titulo: "Cuentas por pagar", valor: montoCorto(cxp), detalle: `${porPagar.length} factura(s) por pagar`, href: "/dashboard/compras?tab=facturas", alerta: porPagar.length > 0 },
      { titulo: "Cuentas por cobrar", valor: montoCorto(cxc), detalle: vencidas ? `${vencidas} vencida(s)` : `${porCobrar.length} nota(s) de pedido`, href: "/dashboard/ventas?tab=cobrar", alerta: vencidas > 0 },
      { titulo: "Saldo en cajas", valor: cajas === null ? "…" : montoCorto(saldo), detalle: cajas?.length ? `${cajas.length} caja(s) Arequipa` : "Sin cajas registradas", href: "/dashboard/compras?tab=registrar" },
      { titulo: "IGV del mes", valor: montoCorto(igv), detalle: `Ventas ${montoCorto(r2(igvVentas))} − compras ${montoCorto(r2(igvCompras))}`, href: "/dashboard/contable?tab=diario", alerta: igv > 0 },
    ];
  }, [activo, facturas, notas, comprobantes, cajas]);
}

function useKpisProduccion(activo: boolean): KpiInicio[] {
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, [], activo);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, [], activo);
  const exp = useExpedientes(activo);
  return useMemo(() => {
    if (!activo) return [];
    const mes = hoy().slice(0, 7);
    const enFab = ops.filter((o) => o.estado === "EN_FABRICACION");
    const qcMes = ops.filter((o) => o.estado === "QC_APROBADO" && (o.qc?.fecha ?? "").startsWith(mes)).length;
    const disponibles = equipos.filter((e) => e.estado === "DISPONIBLE").length;
    const abiertos = exp.expedientes.filter((x) => x.estado === "ABIERTO");
    return [
      { titulo: "OT activas", valor: String(enFab.length), detalle: "Órdenes de producción en fabricación", href: "/dashboard/produccion" },
      { titulo: "QC aprobados (mes)", valor: String(qcMes), detalle: "Equipos con control de calidad firmado", href: "/dashboard/produccion" },
      { titulo: "PT disponible", valor: String(disponibles), detalle: "Equipos terminados en almacén", href: "/dashboard/almacen?tab=stock" },
      { titulo: "Expedientes 26W", valor: exp.faltaTabla ? "—" : String(abiertos.length), detalle: exp.faltaTabla ? "Falta correr el SQL de expedientes" : "Lotes abiertos en el flujo", href: "/erp/lotes" },
    ];
  }, [activo, ops, equipos, exp]);
}

function useKpisSoporte(activo: boolean): KpiInicio[] {
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, [], activo);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, [], activo);
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], activo);
  const exp = useExpedientes(activo);
  return useMemo(() => {
    if (!activo) return [];
    const mes = hoy().slice(0, 7);
    const ventas = r2(comprobantes.filter((c) => c.estado === "EMITIDO" && c.fecha.startsWith(mes)).reduce((a, c) => a + c.total, 0));
    const ocMes = ordenes.filter((o) => o.fecha.startsWith(mes));
    const compras = r2(ocMes.reduce((a, o) => a + o.total, 0));
    const criticos = stock.filter((s) => s.cantidad <= STOCK_CRITICO).length;
    const abiertos = exp.expedientes.filter((x) => x.estado === "ABIERTO").length;
    return [
      { titulo: "Ventas del mes", valor: montoCorto(ventas), detalle: "Comprobantes emitidos", href: "/dashboard/ventas?tab=comprobantes" },
      { titulo: "Compras del mes", valor: montoCorto(compras), detalle: `${ocMes.length} orden(es) de compra`, href: "/dashboard/compras?tab=ordenes" },
      { titulo: "Stock crítico", valor: String(criticos), detalle: `Productos con ${STOCK_CRITICO} unidades o menos`, href: "/dashboard/almacen?tab=stock", alerta: criticos > 0 },
      { titulo: "Expedientes 26W", valor: exp.faltaTabla ? "—" : String(abiertos), detalle: exp.faltaTabla ? "Falta correr el SQL de expedientes" : "Lotes abiertos en el flujo", href: "/erp/lotes" },
    ];
  }, [activo, comprobantes, ordenes, stock, exp]);
}

/** Hook de los 4 KPIs de cada módulo. Solo se usa el del módulo abierto (FilaKpis va con key = módulo). */
export const HOOK_KPIS: Record<ModuloInicio, (activo: boolean) => KpiInicio[]> = {
  logistica: useKpisLogistica,
  almacen: useKpisAlmacen,
  finanzas: useKpisFinanzas,
  produccion: useKpisProduccion,
  soporte: useKpisSoporte,
};
