"use client";

// =====================================================================
// Campana de notificaciones: se calculan en vivo desde la caché
// sincronizada con Supabase (lib/storage.ts), según los módulos que ve
// cada usuario. Las "vistas" se guardan en sus preferencias (lib/preferencias.ts).
// =====================================================================

import { useMemo } from "react";
import { puedeVer, type Sesion } from "./auth";
import { getEquipos } from "./equipos";
import { KEYS, hoy, soles, useStore } from "./storage";
import type { Factura, OrdenDespacho, Requerimiento, StockItem } from "./types";
import { avisoOD, odsNuevas } from "./ventas";

export type TipoNotif = "despacho" | "requerimiento" | "factura" | "qc" | "stock";

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
  const reqs = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, [], ve("/dashboard/compras"));
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, [], ve("/dashboard/compras"));
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], veAlmacen);
  const equiposRaw = useStore<unknown[]>(KEYS.EQUIPOS, [], veAlmacen || ve("/dashboard/ventas"));

  return useMemo(() => {
    if (!sesion) return [];
    const out: Notificacion[] = [];
    const ve = (ruta: string) => puedeVer(sesion, ruta);
    const hoyStr = hoy();

    // Órdenes de despacho nuevas (Ventas → Almacén)
    if (ve("/dashboard/almacen") && ["creador", "almacen"].includes(sesion.rol))
      for (const o of odsNuevas(ods))
        out.push({ clave: `od:${o.id}`, tipo: "despacho", titulo: `Nueva orden de despacho ${o.numero}`, detalle: avisoOD(o), modulo: "Almacén", href: "/dashboard/almacen?tab=despacho", prioridad: 1 });

    if (ve("/dashboard/compras")) {
      // Requerimientos de Almacén por revisar
      for (const r of reqs)
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

    return out.sort((a, b) => a.prioridad - b.prioridad);
    // equiposRaw: getEquipos() lee la misma caché; se usa para recalcular cuando cambia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion, ods, reqs, facturas, stock, equiposRaw]);
}
