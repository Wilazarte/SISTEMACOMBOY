"use client";

import { useMemo } from "react";
import { BarChart3, CheckCircle2, ChevronRight, Eye, ListTodo } from "lucide-react";
import type { EquipoTerminado } from "@/lib/equipos";
import { mantenimientosPendientes, normalizarActivo, type Activo } from "@/lib/activos";
import { useExpedientes } from "@/lib/expedientes";
import type { ModuloInicio } from "@/lib/inicioModulos";
import { useLogistica } from "@/lib/logistica";
import { irA } from "@/lib/navegacion";
import type { OrdenProduccion } from "@/lib/produccion";
import { estiloSeccion } from "@/lib/seccionColor";
import { iconoInicio } from "@/lib/iconosFunciones";
import { KEYS, TIPOS_GASTO, getPendientes, hoy, r2, useStore } from "@/lib/storage";
import type { ComprobanteVenta, Factura, Guia, NotaPedido, OrdenCompra, OrdenDespacho, StockItem } from "@/lib/types";
import { estadoOD, npPorCobrar, saldoNP, vencimientoNP } from "@/lib/ventas";
import { montoCorto } from "@/components/logistica/planta";

// Parte principal del INICIO (Williams 2026-11-16): con los accesos rápidos en la barra azul de la derecha, el INICIO
// muestra gráficos de barras y el resumen de tareas pendientes de su módulo. Todo sale de las tablas del ERP (sin
// cifras de ejemplo): compras en camino, ventas, gastos, IGV, stock escaso, tiempos de fabricación, etc.

interface Serie {
  nombre: string;
  valores: number[];
  /** Canales "r g b" (mismos colores de sección del tema GLASS). */
  color: string;
}

interface Grafico {
  titulo: string;
  detalle: string;
  etiquetas: string[];
  series: Serie[];
  /** Montos en soles (si no, cantidades / días). */
  moneda?: boolean;
  unidad?: string;
  /** Barras horizontales (rankings: stock escaso, tiempos por OP…). */
  horizontal?: boolean;
  href: string;
}

interface Pendiente {
  texto: string;
  cantidad: number;
  detalle?: string;
  href: string;
  /** Urgente (vencido, crítico): rojo. */
  urgente?: boolean;
}

interface Resumen {
  graficos: Grafico[];
  pendientes: Pendiente[];
}

// Paleta COMBOY (2026-11-17): acero, vino, acero claro y azul noche
const AZUL = "41 77 97";
const ROJO = "128 0 33";
const CIAN = "127 156 171";
const NARANJA = "128 0 33";

/** Stock escaso: 5 unidades o menos (igual que los KPIs). */
const STOCK_CRITICO = 5;
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

/** Últimos 6 meses (YYYY-MM) terminando en el mes actual. */
function ultimosMeses(n = 6): { claves: string[]; etiquetas: string[] } {
  const [a, m] = hoy().split("-").map(Number);
  const claves: string[] = [];
  const etiquetas: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    claves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    etiquetas.push(MESES_CORTOS[d.getMonth()]);
  }
  return { claves, etiquetas };
}

/** Suma por mes de los últimos 6 meses. */
function porMes<T>(items: T[], fecha: (x: T) => string, valor: (x: T) => number, claves: string[]): number[] {
  return claves.map((k) => r2(items.filter((x) => (fecha(x) ?? "").startsWith(k)).reduce((a, x) => a + (valor(x) || 0), 0)));
}

const DIA = 86_400_000;
const dias = (desde: string, hasta: string) => Math.max(0, Math.round((new Date(`${hasta.slice(0, 10)}T12:00:00`).getTime() - new Date(`${desde.slice(0, 10)}T12:00:00`).getTime()) / DIA));

/** Ranking: los N mayores, como etiquetas + una serie. */
function ranking(pares: [string, number][], n: number, nombre: string, color: string): Pick<Grafico, "etiquetas" | "series"> {
  const top = [...pares].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { etiquetas: top.map(([e]) => e), series: [{ nombre, valores: top.map(([, v]) => r2(v)), color }] };
}

function agrupar<T>(items: T[], clave: (x: T) => string, valor: (x: T) => number): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((x) => m.set(clave(x), (m.get(clave(x)) ?? 0) + (valor(x) || 0)));
  return [...m.entries()];
}

// ─────────────────────────────── Datos por módulo ───────────────────────────────

function useResumenFinanzas(activo: boolean): Resumen {
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, [], activo);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, [], activo);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, [], activo);
  const activos = useStore<Activo[]>(KEYS.ACTIVOS, [], activo);
  return useMemo(() => {
    const { claves, etiquetas } = ultimosMeses();
    const hoyStr = hoy();
    const mant = mantenimientosPendientes(activos.map(normalizarActivo));
    const emitidos = comprobantes.filter((c) => c.estado === "EMITIDO");
    const gastos = facturas.filter((f) => f.esGastoTesoreria);
    const compras = facturas.filter((f) => !f.esGastoTesoreria);
    const porPagar = facturas.filter((f) => f.estadoPago === "POR_PAGAR");
    const vencidasPagar = porPagar.filter((f) => f.fechaVencimiento && f.fechaVencimiento < hoyStr);
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    const vencidasCobrar = porCobrar.filter((n) => vencimientoNP(n) < hoyStr);
    const reqs = getPendientes();
    const mes = claves[claves.length - 1];
    return {
      graficos: [
        {
          titulo: "Cálculo de IGV",
          detalle: "IGV de ventas (débito) contra IGV de compras (crédito), últimos 6 meses",
          etiquetas,
          series: [
            { nombre: "IGV ventas", valores: porMes(emitidos, (c) => c.fecha, (c) => c.igv, claves), color: AZUL },
            { nombre: "IGV compras", valores: porMes(facturas, (f) => f.fecha, (f) => f.igv, claves), color: NARANJA },
          ],
          moneda: true,
          href: "/dashboard/contable?tab=diario",
        },
        {
          titulo: "Reporte de gastos",
          detalle: "Gastos de Tesorería y compras con factura por mes",
          etiquetas,
          series: [
            { nombre: "Gastos", valores: porMes(gastos, (f) => f.fecha, (f) => f.total, claves), color: ROJO },
            { nombre: "Compras", valores: porMes(compras, (f) => f.fecha, (f) => f.total, claves), color: CIAN },
          ],
          moneda: true,
          href: "/dashboard/compras?tab=facturas",
        },
        {
          titulo: "Gastos del mes por tipo",
          detalle: `${etiquetas[etiquetas.length - 1]}: en qué se gasta`,
          ...ranking(agrupar(gastos.filter((f) => f.fecha.startsWith(mes)), (f) => (f.tipoGasto ? TIPOS_GASTO[f.tipoGasto] : "Otros").split(" (")[0], (f) => f.total), 6, "Gasto", ROJO),
          moneda: true,
          horizontal: true,
          href: "/dashboard/compras?tab=registrar",
        },
        {
          titulo: "Reporte de ventas",
          detalle: "Comprobantes emitidos por mes",
          etiquetas,
          series: [{ nombre: "Ventas", valores: porMes(emitidos, (c) => c.fecha, (c) => c.total, claves), color: AZUL }],
          moneda: true,
          href: "/dashboard/ventas?tab=comprobantes",
        },
      ],
      pendientes: [
        { texto: "REQ de Almacén por revisar", cantidad: reqs.length, href: "/dashboard/compras?tab=nuevos" },
        { texto: "Facturas por pagar", cantidad: porPagar.length, detalle: montoCorto(r2(porPagar.reduce((a, f) => a + (f.netoPagar ?? f.total), 0))), href: "/dashboard/compras?tab=facturas" },
        { texto: "Facturas por pagar vencidas", cantidad: vencidasPagar.length, href: "/dashboard/compras?tab=facturas", urgente: true },
        { texto: "Notas de pedido por cobrar", cantidad: porCobrar.length, detalle: montoCorto(r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0))), href: "/dashboard/ventas?tab=cobrar" },
        { texto: "Cobranzas vencidas", cantidad: vencidasCobrar.length, href: "/dashboard/ventas?tab=cobrar", urgente: true },
        { texto: "Activos con mantenimiento vencido", cantidad: mant.filter((m) => m.estado === "VENCIDO").length, href: "/dashboard/contable?tab=activos", urgente: true },
        { texto: "Activos con mantenimiento próximo", cantidad: mant.filter((m) => m.estado === "PROXIMO").length, href: "/dashboard/contable?tab=activos" },
      ],
    };
  }, [facturas, notas, comprobantes, activos]);
}

function useResumenLogistica(activo: boolean): Resumen {
  const d = useLogistica();
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, [], activo);
  return useMemo(() => {
    const { claves, etiquetas } = ultimosMeses();
    const enCamino = d.ocActivas.filter((o) => ["BANCARIZADA", "FACTURADA", "EN_GUIA", "APROBADA"].includes(o.estado));
    const porEstado: [string, number][] = (["EMITIDA", "APROBADA", "BANCARIZADA", "FACTURADA", "EN_GUIA"] as const).map((e) => [e.replace("_", " "), d.ocActivas.filter((o) => o.estado === e).length]);
    return {
      graficos: [
        {
          titulo: "Compras por mes",
          detalle: "Órdenes de compra emitidas, últimos 6 meses",
          etiquetas,
          series: [{ nombre: "Compras", valores: porMes(ordenes, (o) => o.fecha, (o) => o.total, claves), color: AZUL }],
          moneda: true,
          href: "/dashboard/compras?tab=ordenes",
        },
        {
          titulo: "Compras en camino",
          detalle: "OC activas por etapa (de emitida a guía)",
          etiquetas: porEstado.map(([e]) => e),
          series: [{ nombre: "OC", valores: porEstado.map(([, n]) => n), color: NARANJA }],
          unidad: "OC",
          href: "/dashboard/compras?tab=ordenes",
        },
        {
          titulo: "Mayores compras en curso",
          detalle: "OC activas de mayor monto",
          ...ranking(d.ocActivas.map((o) => [`${o.numero} · ${o.proveedor}`, o.total]), 6, "Monto", CIAN),
          moneda: true,
          horizontal: true,
          href: "/dashboard/compras?tab=ordenes",
        },
      ],
      pendientes: [
        { texto: "OC por aprobar / bancarizar", cantidad: d.ocActivas.filter((o) => o.estado === "EMITIDA").length, href: "/dashboard/compras?tab=ordenes" },
        { texto: "Compras en camino", cantidad: enCamino.length, detalle: montoCorto(r2(enCamino.reduce((a, o) => a + o.total, 0))), href: "/dashboard/compras?tab=ordenes" },
        { texto: "Envíos en agencia (tránsito)", cantidad: d.odsTransito.length, href: "/logistica/agencias" },
        { texto: "Traslados Planta ↔ Sucursal en camino", cantidad: d.trasladosCamino.length, href: "/logistica/transferencias" },
        { texto: "OT en fabricación", cantidad: d.opsActivas.length, href: "/dashboard/produccion" },
      ],
    };
  }, [d, ordenes]);
}

function useResumenAlmacen(activo: boolean): Resumen {
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], activo);
  const guias = useStore<Guia[]>(KEYS.GUIAS, [], activo);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, [], activo);
  return useMemo(() => {
    const { claves, etiquetas } = ultimosMeses();
    const escasos = stock.filter((s) => s.cantidad <= STOCK_CRITICO);
    const porVB = guias.filter((g) => g.estado === "PENDIENTE_VB");
    const porDespachar = ods.filter((o) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(o)));
    const valorSede = agrupar(stock, (s) => s.sede || "Sin sede", (s) => s.cantidad * (s.costoUnit || 0));
    return {
      graficos: [
        {
          titulo: "Stock en escasez",
          detalle: `Productos con ${STOCK_CRITICO} unidades o menos (los más bajos)`,
          etiquetas: [...escasos].sort((a, b) => a.cantidad - b.cantidad).slice(0, 8).map((s) => `${s.nombre} (${s.unidad})`),
          series: [{ nombre: "Cantidad", valores: [...escasos].sort((a, b) => a.cantidad - b.cantidad).slice(0, 8).map((s) => s.cantidad), color: ROJO }],
          unidad: "und",
          horizontal: true,
          href: "/dashboard/almacen?tab=stock",
        },
        {
          titulo: "Ingresos y despachos por mes",
          detalle: "Guías de ingreso y órdenes de despacho, últimos 6 meses",
          etiquetas,
          series: [
            { nombre: "Ingresos", valores: claves.map((k) => guias.filter((g) => (g.fecha ?? "").startsWith(k)).length), color: CIAN },
            { nombre: "Despachos", valores: claves.map((k) => ods.filter((o) => (o.fecha ?? "").startsWith(k)).length), color: NARANJA },
          ],
          unidad: "doc.",
          href: "/dashboard/almacen?tab=ingresos",
        },
        {
          titulo: "Stock valorizado por almacén",
          detalle: "Taller Principal y Sucursal Secocha",
          ...ranking(valorSede, 4, "Valor", AZUL),
          moneda: true,
          horizontal: true,
          href: "/dashboard/almacen?tab=stock",
        },
      ],
      pendientes: [
        { texto: "Guías esperando V°B°", cantidad: porVB.length, href: "/dashboard/almacen?tab=ingresos" },
        { texto: "Órdenes por despachar", cantidad: porDespachar.length, href: "/dashboard/almacen?tab=despacho" },
        { texto: "Productos en escasez", cantidad: escasos.length, href: "/dashboard/almacen?tab=stock", urgente: true },
        { texto: "Productos sin stock", cantidad: stock.filter((s) => s.cantidad <= 0).length, href: "/dashboard/almacen?tab=stock", urgente: true },
      ],
    };
  }, [stock, guias, ods]);
}

function useResumenProduccion(activo: boolean): Resumen {
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, [], activo);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, [], activo);
  const exp = useExpedientes(activo);
  return useMemo(() => {
    const { claves, etiquetas } = ultimosMeses();
    const hoyStr = hoy();
    const enFab = ops.filter((o) => o.estado === "EN_FABRICACION");
    const terminadas = ops.filter((o) => o.estado === "QC_APROBADO" && o.qc?.fecha);
    // Tiempo de fabricación: días desde la OP hasta el QC (terminadas) o hasta hoy (en fabricación)
    const tiempos: [string, number][] = [
      ...enFab.map((o): [string, number] => [`${o.id} · ${o.modelo} (en curso)`, dias(o.fecha, hoyStr)]),
      ...terminadas.map((o): [string, number] => [`${o.id} · ${o.modelo}`, dias(o.fecha, o.qc!.fecha)]),
    ];
    const prom = (xs: OrdenProduccion[]) => (xs.length ? Math.round(xs.reduce((a, o) => a + dias(o.fecha, o.qc!.fecha), 0) / xs.length) : 0);
    const promedio = prom(terminadas);
    const atrasadas = enFab.filter((o) => promedio > 0 && dias(o.fecha, hoyStr) > promedio);
    return {
      graficos: [
        {
          titulo: "Tiempos de fabricación",
          detalle: promedio ? `Días por OP · promedio ${promedio} días` : "Días por OP (de la OP al QC)",
          ...ranking(tiempos, 8, "Días", NARANJA),
          unidad: "días",
          horizontal: true,
          href: "/dashboard/produccion",
        },
        {
          titulo: "OP iniciadas y terminadas",
          detalle: "Por mes, últimos 6 meses",
          etiquetas,
          series: [
            { nombre: "Iniciadas", valores: claves.map((k) => ops.filter((o) => o.estado !== "ANULADA" && o.fecha.startsWith(k)).length), color: AZUL },
            { nombre: "QC aprobado", valores: claves.map((k) => terminadas.filter((o) => o.qc!.fecha.startsWith(k)).length), color: CIAN },
          ],
          unidad: "OP",
          href: "/dashboard/produccion",
        },
        {
          titulo: "Tiempo promedio por mes",
          detalle: "Días de fabricación de las OP terminadas en cada mes",
          etiquetas,
          series: [{ nombre: "Días", valores: claves.map((k) => prom(terminadas.filter((o) => o.qc!.fecha.startsWith(k)))), color: NARANJA }],
          unidad: "días",
          href: "/dashboard/produccion",
        },
      ],
      pendientes: [
        { texto: "OT en fabricación", cantidad: enFab.length, href: "/dashboard/produccion" },
        { texto: "OT más lentas que el promedio", cantidad: atrasadas.length, href: "/dashboard/produccion", urgente: true },
        { texto: "Equipos terminados por entregar", cantidad: equipos.filter((e) => e.estado === "DISPONIBLE").length, href: "/erp/lotes" },
        { texto: "Expedientes 26W abiertos", cantidad: exp.expedientes.filter((x) => x.estado === "ABIERTO").length, href: "/erp/lotes" },
      ],
    };
  }, [ops, equipos, exp]);
}

function useResumenVentas(activo: boolean): Resumen {
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, [], activo);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, [], activo);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, [], activo);
  return useMemo(() => {
    const { claves, etiquetas } = ultimosMeses();
    const hoyStr = hoy();
    const emitidos = comprobantes.filter((c) => c.estado === "EMITIDO");
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    return {
      graficos: [
        {
          titulo: "Reporte de ventas",
          detalle: "Comprobantes emitidos por mes",
          etiquetas,
          series: [{ nombre: "Ventas", valores: porMes(emitidos, (c) => c.fecha, (c) => c.total, claves), color: AZUL }],
          moneda: true,
          href: "/dashboard/ventas?tab=comprobantes",
        },
        {
          titulo: "Mejores clientes",
          detalle: "Ventas de los últimos 6 meses por cliente",
          ...ranking(agrupar(emitidos.filter((c) => c.fecha >= claves[0]), (c) => c.cliente, (c) => c.total), 6, "Ventas", CIAN),
          moneda: true,
          horizontal: true,
          href: "/dashboard/ventas?tab=clientes",
        },
        {
          titulo: "Por cobrar por cliente",
          detalle: "Saldo pendiente de notas de pedido",
          ...ranking(agrupar(porCobrar, (n) => n.cliente, (n) => saldoNP(n)), 6, "Saldo", ROJO),
          moneda: true,
          horizontal: true,
          href: "/dashboard/ventas?tab=cobrar",
        },
      ],
      pendientes: [
        { texto: "Notas de pedido por atender", cantidad: notas.filter((n) => n.estado === "PENDIENTE" || n.estado === "PENDIENTE_COSTEO").length, href: "/dashboard/ventas?tab=notas" },
        { texto: "Cobranzas pendientes", cantidad: porCobrar.length, detalle: montoCorto(r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0))), href: "/dashboard/ventas?tab=cobrar" },
        { texto: "Cobranzas vencidas", cantidad: porCobrar.filter((n) => vencimientoNP(n) < hoyStr).length, href: "/dashboard/ventas?tab=cobrar", urgente: true },
        { texto: "Despachos por salir", cantidad: ods.filter((o) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(o))).length, href: "/dashboard/ventas?tab=despachos" },
      ],
    };
  }, [notas, comprobantes, ods]);
}

function useResumenSoporte(activo: boolean): Resumen {
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, [], activo);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, [], activo);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, [], activo);
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], activo);
  const exp = useExpedientes(activo);
  return useMemo(() => {
    const { claves, etiquetas } = ultimosMeses();
    const emitidos = comprobantes.filter((c) => c.estado === "EMITIDO");
    return {
      graficos: [
        {
          titulo: "Ventas contra compras",
          detalle: "Toda la empresa, últimos 6 meses",
          etiquetas,
          series: [
            { nombre: "Ventas", valores: porMes(emitidos, (c) => c.fecha, (c) => c.total, claves), color: AZUL },
            { nombre: "Compras", valores: porMes(ordenes, (o) => o.fecha, (o) => o.total, claves), color: NARANJA },
          ],
          moneda: true,
          href: "/gerencia",
        },
        {
          titulo: "Reporte de gastos",
          detalle: "Gastos de Tesorería por mes",
          etiquetas,
          series: [{ nombre: "Gastos", valores: porMes(facturas.filter((f) => f.esGastoTesoreria), (f) => f.fecha, (f) => f.total, claves), color: ROJO }],
          moneda: true,
          href: "/dashboard/compras?tab=facturas",
        },
      ],
      pendientes: [
        { texto: "REQ de Almacén por revisar", cantidad: getPendientes().length, href: "/dashboard/compras?tab=nuevos" },
        { texto: "Facturas por pagar", cantidad: facturas.filter((f) => f.estadoPago === "POR_PAGAR").length, href: "/dashboard/compras?tab=facturas" },
        { texto: "Productos en escasez", cantidad: stock.filter((s) => s.cantidad <= STOCK_CRITICO).length, href: "/dashboard/almacen?tab=stock", urgente: true },
        { texto: "Expedientes 26W abiertos", cantidad: exp.expedientes.filter((x) => x.estado === "ABIERTO").length, href: "/erp/lotes" },
      ],
    };
  }, [comprobantes, ordenes, facturas, stock, exp]);
}

const HOOK_RESUMEN: Record<ModuloInicio, (activo: boolean) => Resumen> = {
  finanzas: useResumenFinanzas,
  logistica: useResumenLogistica,
  almacen: useResumenAlmacen,
  produccion: useResumenProduccion,
  ventas: useResumenVentas,
  soporte: useResumenSoporte,
};

// ─────────────────────────────── Vista ───────────────────────────────

/**
 * Gráficos y tareas pendientes del módulo. Montar con key = módulo (cada módulo usa su propio hook).
 * `soloLectura` (Dashboard Gerencia): se ve igual, pero las tarjetas no abren pantallas de los módulos.
 */
export function PanelResumen({ modulo, soloLectura = false }: { modulo: ModuloInicio; soloLectura?: boolean }) {
  const ir = (href: string) => {
    if (!soloLectura) irA(href);
  };
  const { graficos, pendientes } = HOOK_RESUMEN[modulo](true);
  const abiertas = pendientes.filter((p) => p.cantidad > 0);
  return (
    <div className="space-y-4">
      <section className="seccion rounded-xl border glass-card glass-blur p-5" style={estiloSeccion(3)}>
        <h2 className="seccion-titulo con-icono mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide">
          <ListTodo size={16} aria-hidden /> Tareas pendientes
        </h2>
        {abiertas.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-[#4ade80]">
            <CheckCircle2 size={16} /> Todo al día: no hay tareas pendientes en este módulo.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {pendientes.map((p) => {
              // Ícono según el título de la tarea (Williams 2026-11-22)
              const I = iconoInicio(p.texto);
              return (
              <button
                key={p.texto}
                type="button"
                onClick={() => ir(p.href)}
                disabled={soloLectura}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${soloLectura ? "cursor-default" : "hover-cian"} ${
                  p.cantidad === 0 ? "border-white/[0.05] bg-white/[0.02] opacity-60" : p.urgente ? "border-[#ff2a5f]/40 bg-[#ff2a5f]/[0.08]" : "border-white/[0.08] bg-white/[0.04]"
                }`}
              >
                <span className={`min-w-[40px] text-center text-2xl font-bold ${p.cantidad === 0 ? "text-[#6b7280]" : p.urgente ? "text-[#ff6a7f]" : "text-white"}`}>{p.cantidad}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                    {/* Ícono según el título (rojo si es urgente) */}
                    <I size={15} aria-hidden className={`shrink-0 ${p.cantidad === 0 ? "text-[#6b7280]" : p.urgente ? "text-[#ff6a7f]" : "text-[#294D61]"}`} />
                    {p.texto}
                  </span>
                  {p.detalle && p.cantidad > 0 && <span className="block text-[12px] text-[#9CA3AF]">{p.detalle}</span>}
                </span>
                {!soloLectura && <ChevronRight size={16} className="shrink-0 text-[#6b7280]" />}
              </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {graficos.map((g, i) => (
          <TarjetaGrafico key={g.titulo} g={g} i={i} ir={soloLectura ? undefined : ir} />
        ))}
      </div>
    </div>
  );
}

const formato = (g: Grafico, v: number) => (g.moneda ? montoCorto(v) : `${v.toLocaleString("es-PE")}${g.unidad ? ` ${g.unidad}` : ""}`);

function TarjetaGrafico({ g, i, ir }: { g: Grafico; i: number; ir?: (href: string) => void }) {
  const I = iconoInicio(g.titulo);
  const max = Math.max(0, ...g.series.flatMap((s) => s.valores));
  const vacio = max === 0 || g.etiquetas.length === 0;
  return (
    <section className="seccion flex flex-col rounded-xl border glass-card glass-blur p-5" style={estiloSeccion(i)}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="seccion-titulo con-icono flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide">
          <I size={16} className="shrink-0" aria-hidden />
          {g.titulo}
        </h3>
        {ir && (
          <button type="button" onClick={() => ir(g.href)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold text-[#9CA3AF] transition hover:bg-white/10 hover:text-white">
            <Eye size={13} aria-hidden /> Ver detalle
          </button>
        )}
      </div>
      <p className="mb-3 text-[12px] text-[#9CA3AF]">{g.detalle}</p>
      {g.series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-[#D1D5DB]">
          {g.series.map((s) => (
            <span key={s.nombre} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(${s.color})` }} /> {s.nombre}
            </span>
          ))}
        </div>
      )}
      {vacio ? (
        <p className="flex flex-1 items-center justify-center gap-2 py-10 text-[13px] text-[#6b7280]">
          <BarChart3 size={16} /> Aún no hay datos para este gráfico.
        </p>
      ) : g.horizontal ? (
        <ul className="space-y-2">
          {g.etiquetas.map((e, k) => {
            const v = g.series[0].valores[k];
            return (
              <li key={e} className="grid grid-cols-[minmax(0,40%)_1fr] items-center gap-3 text-[12px]">
                <span className="truncate text-[#D1D5DB]" title={e}>
                  {e}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-4 rounded-r-md" style={{ width: `${Math.max(3, (v / max) * 100)}%`, background: `linear-gradient(90deg, rgb(${g.series[0].color} / 0.45), rgb(${g.series[0].color}))` }} />
                  <span className="shrink-0 font-semibold text-white">{formato(g, v)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex h-44 items-end gap-2 border-b border-white/[0.12] pt-5">
          {g.etiquetas.map((e, k) => (
            <div key={e} className="flex h-full flex-1 flex-col items-center justify-end">
              <div className="flex h-full w-full items-end justify-center gap-1">
                {g.series.map((s) => {
                  const v = s.valores[k];
                  return (
                    <div key={s.nombre} className="group relative flex h-full max-w-[34px] flex-1 items-end">
                      <div
                        className="w-full rounded-t-md transition group-hover:brightness-125"
                        style={{ height: `${v > 0 ? Math.max(2, (v / max) * 100) : 0}%`, background: `linear-gradient(180deg, rgb(${s.color}), rgb(${s.color} / 0.35))` }}
                      />
                      <span className="pointer-events-none absolute -top-6 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#141a33] px-1.5 py-0.5 text-[11px] font-semibold text-white group-hover:block">
                        {s.nombre}: {formato(g, v)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {!vacio && !g.horizontal && (
        <div className="mt-1.5 flex gap-2">
          {g.etiquetas.map((e) => (
            <span key={e} className="flex-1 text-center text-[11px] text-[#9CA3AF]">
              {e}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default PanelResumen;
