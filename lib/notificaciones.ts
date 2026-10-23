"use client";

// =====================================================================
// Campana de notificaciones: se calculan en vivo desde la caché
// sincronizada con Supabase (lib/storage.ts), según los módulos que ve
// cada usuario. Las "vistas" se guardan en sus preferencias (lib/preferencias.ts).
// =====================================================================

import { useMemo } from "react";
import { RUTA_SUCURSAL, puedeVer, type Sesion } from "./auth";
import { getEquipos } from "./equipos";
import { KEYS, fechaPE, hoy, soles, useStore } from "./storage";
import type { Factura, OrdenDespacho, Requerimiento, StockItem } from "./types";
import { esAdminProductos, useCatalogo } from "./productos";
import type { CierreCaja, Derivacion, ReqSucursal, StockLocal, Traslado, VentaSucursal } from "./sucursal-modelos";
import { avisoOD, odsNuevas } from "./ventas";

export type TipoNotif = "despacho" | "requerimiento" | "factura" | "qc" | "stock" | "sucursal" | "producto";

export interface Notificacion {
  /** Identifica el aviso para marcarlo como visto; cambia si cambia su contenido. */
  clave: string;
  tipo: TipoNotif;
  titulo: string;
  detalle: string;
  modulo: string;
  href: string;
  /** Para ordenar: más urgente primero. */
  prioridad: number;
}

/** Facturas por pagar que vencen dentro de estos días. */
export const DIAS_AVISO_FACTURA = 3;
/** Stock crítico: menos de estas unidades. */
export const STOCK_AVISO = 10;

const DIA = 86_400_000;
const diasHasta = (fecha: string, desde: string) => Math.round((new Date(`${fecha}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / DIA);

export function useNotificaciones(sesion: Sesion | null): Notificacion[] {
  // Solo las claves de los avisos que este usuario ve (no se descargan las de otros módulos)
  const ve = (ruta: string) => !!sesion && puedeVer(sesion, ruta);
  const veAlmacen = ve("/dashboard/almacen");
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, [], veAlmacen && ["creador", "almacen"].includes(sesion?.rol ?? ""));
  const reqs = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, [], ve("/dashboard/compras") || ve("/dashboard/almacen"));
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, [], ve("/dashboard/compras"));
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], veAlmacen);
  const equiposRaw = useStore<unknown[]>(KEYS.EQUIPOS, [], veAlmacen || ve("/dashboard/ventas"));
  // Sucursal Beta: cada rol descarga solo lo que le avisa
  const rol = sesion?.rol ?? "";
  const veSuc = ve(RUTA_SUCURSAL);
  const opera = veSuc && ["creador", "sucursal"].includes(rol);
  // Despachos de Secocha (Almacén Arequipa) y REQ-SECOCHA (solo Producción Arequipa)
  const veDespSec = ve("/dashboard/almacen") && ["creador", "almacen"].includes(rol);
  const veReqSec = ve("/dashboard/produccion") && ["creador", "almacen"].includes(rol);
  const derivaciones = useStore<Derivacion[]>(KEYS.SUC_DERIVACIONES, [], veDespSec);
  const reqsSec = useStore<ReqSucursal[]>(KEYS.SUC_REQS, [], veReqSec);
  const traslados = useStore<Traslado[]>(KEYS.SUC_TRASLADOS, [], opera);
  const ventasSuc = useStore<VentaSucursal[]>(KEYS.SUC_VENTAS, [], opera);
  const stockSuc = useStore<StockLocal[]>(KEYS.SUC_STOCK, [], opera);
  const cierres = useStore<CierreCaja[]>(KEYS.SUC_CIERRES, [], veSuc && ["creador", "tesoreria"].includes(rol));
  const { solicitudes } = useCatalogo();

  return useMemo(() => {
    if (!sesion) return [];
    const out: Notificacion[] = [];
    const ve = (ruta: string) => puedeVer(sesion, ruta);
    const hoyStr = hoy();

    // Órdenes de despacho nuevas (Ventas → Almacén)
    if (ve("/dashboard/almacen") && ["creador", "almacen"].includes(sesion.rol))
      for (const o of odsNuevas(ods))
        out.push({ clave: `od:${o.id}`, tipo: "despacho", titulo: `Nueva orden de despacho ${o.numero}`, detalle: avisoOD(o), modulo: "Almacén", href: "/dashboard/almacen?tab=despacho", prioridad: 1 });

    // Ventas derivadas desde Secocha = Orden de Despacho en Arequipa (bandeja Despachos de Secocha)
    if (veDespSec)
      for (const d of derivaciones.filter((x) => x.estado === "pendiente" || x.estado === "en-preparacion"))
        out.push({
          clave: `der:${d.id}`,
          tipo: "despacho",
          titulo: `Orden de despacho ${d.numero ?? d.ventaNumero} de ${d.sucursal}`,
          detalle: `${d.cliente} · ${d.estado === "pendiente" ? "pendiente de despacho" : "en preparación"}`,
          modulo: "Almacén · Despachos de Secocha",
          href: "/dashboard/almacen?tab=despachos-secocha",
          prioridad: 1,
        });

    // REQ-SECOCHA: solo a Producción Arequipa (Almacén y Tesorería ya no los reciben)
    if (veReqSec)
      for (const r of reqsSec.filter((x) => x.estado === "enviado" || x.estado === "aprobado"))
        out.push({
          clave: `reqsec:${r.id}:${r.estado}`,
          tipo: "requerimiento",
          titulo: `${r.numero} ${r.estado === "aprobado" ? "aprobado: emitir Orden de Traslado" : "por aprobar"}`,
          detalle: `${r.items.length} producto(s) · ${r.solicitante || r.creadoPor}`,
          modulo: "Producción Arequipa",
          href: "/dashboard/produccion",
          prioridad: 2,
        });

    if (ve("/dashboard/compras")) {
      // Requerimientos de Almacén por revisar
      for (const r of reqs.filter((x) => x.origen !== "SUCURSAL"))
        out.push({ clave: `req:${r.id}`, tipo: "requerimiento", titulo: `${r.numero} espera revisión`, detalle: `${r.sede} · ${r.solicitante}`, modulo: "Tesorería / Compras", href: "/dashboard/compras?tab=cotizaciones", prioridad: 2 });
      // Facturas por pagar que vencen en los próximos días
      for (const f of facturas) {
        if (f.estadoPago !== "POR_PAGAR" || !f.fechaVencimiento) continue;
        const d = diasHasta(f.fechaVencimiento.slice(0, 10), hoyStr);
        if (d < 0 || d > DIAS_AVISO_FACTURA) continue;
        out.push({
          clave: `fac:${f.id}:${f.fechaVencimiento}`,
          tipo: "factura",
          titulo: `Factura ${f.numero} ${d === 0 ? "vence hoy" : d === 1 ? "vence mañana" : `vence en ${d} días`}`,
          detalle: `${f.proveedor} · ${soles(f.total)}`,
          modulo: "Tesorería / Compras",
          href: "/dashboard/compras?tab=facturas",
          prioridad: d === 0 ? 0 : 3,
        });
      }
    }

    // Equipos con QC aprobado en almacén, aún sin vender / facturar
    if (ve("/dashboard/ventas") || ve("/dashboard/almacen")) {
      const listos = getEquipos().filter((e) => e.qc_aprobado && e.estado === "DISPONIBLE");
      if (listos.length)
        out.push({
          clave: `qc:${listos.length}:${listos.map((e) => e.id).sort().pop()}`,
          tipo: "qc",
          titulo: `${listos.length} equipo(s) con QC aprobado pendientes de facturación`,
          detalle: listos.slice(0, 3).map((e) => `${e.tipo_equipo} ${e.codigo_chasis}`).join(" · ") + (listos.length > 3 ? " …" : ""),
          modulo: "Producción / Ventas",
          href: ve("/dashboard/ventas") ? "/dashboard/ventas?tab=notas" : "/dashboard/almacen?tab=stock",
          prioridad: 4,
        });
    }

    // Stock crítico
    if (ve("/dashboard/almacen")) {
      const criticos = stock.filter((s) => s.cantidad < STOCK_AVISO).sort((a, b) => a.cantidad - b.cantidad);
      if (criticos.length)
        out.push({
          clave: `stock:${criticos.length}:${criticos.reduce((a, s) => a + s.cantidad, 0)}`,
          tipo: "stock",
          titulo: `${criticos.length} ítem(s) con stock menor a ${STOCK_AVISO}`,
          detalle: criticos.slice(0, 3).map((s) => `${s.nombre} (${s.cantidad})`).join(" · ") + (criticos.length > 3 ? " …" : ""),
          modulo: "Almacén",
          href: "/dashboard/almacen?tab=stock",
          prioridad: 5,
        });
    }

    // Sucursal Beta (cada derivación / OT / venta / cierre una sola vez: la clave es su id)
    if (veSuc) {
      const S = RUTA_SUCURSAL; // sistema aparte: el aviso abre /sucursal
      if (["creador", "sucursal"].includes(sesion.rol)) {
        for (const t of traslados.filter((x) => x.estado === "en-camino"))
          out.push({ clave: `ot:${t.id}`, tipo: "sucursal", titulo: `${t.codigo} en camino`, detalle: `Guía ${t.guiaRemision} · ${t.productos.length} producto(s)`, modulo: "Secocha", href: `${S}?tab=traslados`, prioridad: 2 });
        for (const v of ventasSuc.filter((x) => x.estado === "registrada"))
          out.push({ clave: `vta:${v.id}`, tipo: "sucursal", titulo: `${v.numero} por entregar`, detalle: `${v.cliente} · ${soles(v.total)}`, modulo: "Secocha", href: `${S}?tab=entregar-producto`, prioridad: 3 });
        const bajos = stockSuc.filter((s) => s.stock < s.minimo);
        if (bajos.length)
          out.push({ clave: `stsuc:${bajos.map((s) => `${s.id}:${s.stock}`).join(",")}`, tipo: "sucursal", titulo: `${bajos.length} producto(s) bajo el mínimo`, detalle: bajos.slice(0, 3).map((s) => `${s.producto} (${s.stock})`).join(" · "), modulo: "Secocha", href: `${S}?tab=stock-local`, prioridad: 5 });
      }
      if (["creador", "tesoreria"].includes(sesion.rol))
        for (const c of cierres.filter((x) => x.estado === "enviado"))
          out.push({ clave: `cc:${c.id}`, tipo: "sucursal", titulo: `Cierre de caja ${c.numero} por recibir`, detalle: `Saldo ${soles(c.saldoFinal)} · ${fechaPE(c.fecha)}`, modulo: "Secocha → Tesorería", href: `${S}?tab=caja-chica`, prioridad: 3 });
    }

    // Catálogo maestro: solicitudes de producto nuevo (administrador) y respuesta a quien la pidió
    for (const s of solicitudes) {
      if (s.estado === "pendiente" && esAdminProductos(sesion.rol))
        out.push({ clave: `sol:${s.id}`, tipo: "producto", titulo: `Producto nuevo solicitado: ${s.nombre}`, detalle: `${s.unidad}${s.modulo ? ` · ${s.modulo}` : ""}${s.solicitado_usuario ? ` · ${s.solicitado_usuario}` : ""}`, modulo: "Catálogo de productos", href: "/dashboard/productos?tab=solicitudes", prioridad: 2 });
      else if (s.estado !== "pendiente" && !esAdminProductos(sesion.rol) && s.solicitado_usuario === sesion.usuario)
        out.push({ clave: `solr:${s.id}:${s.estado}`, tipo: "producto", titulo: `Solicitud ${s.estado}: ${s.nombre}`, detalle: s.respuesta ?? (s.estado === "aprobada" ? "Ya está en el catálogo" : "Revise con el administrador"), modulo: "Catálogo de productos", href: "/dashboard/productos?tab=solicitudes", prioridad: 6 });
    }

    return out.sort((a, b) => a.prioridad - b.prioridad);
    // equiposRaw: getEquipos() lee la misma caché; se usa para recalcular cuando cambia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion, ods, reqs, facturas, stock, equiposRaw, derivaciones, reqsSec, traslados, ventasSuc, stockSuc, cierres, solicitudes]);
}
