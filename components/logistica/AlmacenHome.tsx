"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Boxes, ClipboardList, Container, Factory, FileText, MapPin, Package, PackageCheck, Truck } from "lucide-react";
import { useSesion } from "@/lib/auth";
import type { EquipoTerminado } from "@/lib/equipos";
import { useNotificaciones } from "@/lib/notificaciones";
import { KEYS, fechaPE, r2, soles, useStore } from "@/lib/storage";
import type { Guia, MovimientoKardex, OrdenDespacho, Requerimiento, StockItem, ValeProduccion } from "@/lib/types";
import { estadoOD } from "@/lib/ventas";
import { BotonAccion, Etiqueta, Kpi, Panel } from "./piezas";
import { AccesosModulos, EncabezadoPlanta, Filas, MarcoPlanta, PanelLateral, horaActual, montoCorto } from "./planta";

/** Stock crítico: 5 unidades o menos (igual que el Dashboard). */
const STOCK_CRITICO = 5;

const ETIQUETA_KARDEX: Record<string, string> = {
  SALDO_INICIAL: "Saldo inicial",
  INGRESO: "Ingreso",
  "SALIDA-VENTA": "Salida venta",
  "SALIDA-PRODUCCION": "Salida producción",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
};

/** Home del Almacén de la planta: solo lectura; las acciones abren el módulo Almacén de siempre en otra pestaña. */
export function AlmacenHome() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const reqs = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const kardex = useStore<MovimientoKardex[]>(KEYS.KARDEX, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []);
  const [sync, setSync] = useState("");

  const d = useMemo(() => {
    const valor = r2(stock.reduce((a, s) => a + s.cantidad * (s.costoUnit || 0), 0));
    const ubicaciones = Object.entries(
      stock.reduce<Record<string, { items: number; valor: number }>>((acc, s) => {
        const u = (acc[s.sede || "Sin almacén"] ??= { items: 0, valor: 0 });
        if (s.cantidad > 0) u.items++;
        u.valor += s.cantidad * (s.costoUnit || 0);
        return acc;
      }, {})
    ).sort((a, b) => b[1].valor - a[1].valor);
    const criticos = stock.filter((s) => s.cantidad <= STOCK_CRITICO).sort((a, b) => a.cantidad - b.cantidad);
    const reqsAlmacen = reqs.filter((r) => r.origen !== "SUCURSAL");
    const porVB = guias.filter((g) => g.estado === "PENDIENTE_VB");
    const porDespachar = ods.filter((o) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(o)));
    const movimientos = [...kardex].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8);
    const entregas = [...vales].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
    const pt = Object.entries(
      equipos
        .filter((e) => e.estado === "DISPONIBLE")
        .reduce<Record<string, number>>((acc, e) => {
          acc[e.tipo_equipo || "Equipo"] = (acc[e.tipo_equipo || "Equipo"] ?? 0) + 1;
          return acc;
        }, {})
    );
    return { valor, ubicaciones, criticos, reqsAlmacen, porVB, porDespachar, movimientos, entregas, pt };
  }, [stock, reqs, guias, ods, kardex, vales, equipos]);

  useEffect(() => setSync(horaActual()), [d]);

  const recordatorios = [
    ...d.porVB.map((g) => ({ clave: `vb:${g.id}`, titulo: `Dar V°B° a la guía ${g.numero}`, detalle: `${g.ocNumero} · ingreso a almacén`, href: "/dashboard/almacen?tab=ingresos" })),
    ...d.porDespachar.map((o) => ({ clave: `od:${o.id}`, titulo: `Despachar ${o.numero}`, detalle: `${o.cliente}`, href: "/dashboard/almacen?tab=despacho" })),
  ];

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Almacén" notifs={notifs} recordatorios={recordatorios} />}>
      <EncabezadoPlanta
        icono={<Package size={30} />}
        titulo="Comboy Vid Almacén Planta"
        subtitulo="Requerimientos · Ingresos · Stock · Entrega a Producción · Despachos · Arequipa · Perú"
        accion={<span className="text-[12px] text-[#a1a1aa]">Actualizado: Hoy {sync}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icono={<Boxes size={18} />} titulo="Stock valorizado" valor={montoCorto(d.valor)} detalle={`${stock.filter((s) => s.cantidad > 0).length} producto(s) con stock`} href="/dashboard/almacen?tab=stock" />
        <Kpi icono={<ClipboardList size={18} />} titulo="REQ en revisión" valor={String(d.reqsAlmacen.length)} detalle="Requerimientos esperando a Compras" href="/dashboard/almacen?tab=lista" />
        <Kpi icono={<PackageCheck size={18} />} titulo="Ingresos por V°B°" valor={String(d.porVB.length)} detalle="Guías de compra por confirmar" href="/dashboard/almacen?tab=ingresos" />
        <Kpi icono={<Truck size={18} />} titulo="Despachos pendientes" valor={String(d.porDespachar.length)} detalle="Órdenes de despacho por atender" href="/dashboard/almacen?tab=despacho" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Ubicaciones" icono={<MapPin size={17} />}>
          <Filas
            vacio="Sin stock registrado."
            items={d.ubicaciones.map(([sede, u]) => ({ clave: sede, titulo: sede, detalle: `${u.items} producto(s) con stock`, derecha: <span className="whitespace-nowrap font-semibold text-[#fdba74]">{soles(r2(u.valor))}</span>, href: "/dashboard/almacen?tab=stock" }))}
          />
        </Panel>
        <Panel titulo="Recepción MP" icono={<ArrowDownToLine size={17} />}>
          <div className="grid grid-cols-2 gap-2">
            <BotonAccion href="/dashboard/almacen?tab=ingresos" lleno icono={<FileText size={15} />}>
              Nota de ingreso
            </BotonAccion>
            <BotonAccion href="/dashboard/almacen?tab=nuevo" icono={<ClipboardList size={15} />}>
              Nuevo requerimiento
            </BotonAccion>
            <BotonAccion href="/dashboard/almacen?tab=stock" icono={<Boxes size={15} />}>
              Validar stock
            </BotonAccion>
            <BotonAccion href="/dashboard/almacen?tab=despacho" icono={<Truck size={15} />}>
              Órdenes de despacho
            </BotonAccion>
          </div>
          <p className="mt-3 text-[12px] text-[#a1a1aa]">La foto de la guía se adjunta al dar el V°B° del ingreso o al dejar un despacho en agencia.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Entrega a producción" icono={<Factory size={17} />}>
          <Filas
            vacio="Sin vales de producción."
            items={d.entregas.map((v) => ({
              clave: v.id,
              titulo: `${v.id} · ${v.producto}`,
              detalle: `${fechaPE(v.fecha)} · ${v.chasis_ot ? `chasis/OT ${v.chasis_ot}` : "consumo de taller"} · ${v.solicitante}`,
              derecha: <Etiqueta>{`${v.cantidad} ${v.unidad}`}</Etiqueta>,
              href: "/dashboard/almacen?tab=stock",
            }))}
          />
        </Panel>
        <Panel titulo="Ingreso PT" icono={<Container size={17} />}>
          <Filas
            vacio="Sin equipos terminados disponibles."
            items={d.pt.map(([tipo, n]) => ({ clave: tipo, titulo: tipo, derecha: <Etiqueta tono="verde">{`${n} disponible(s)`}</Etiqueta>, href: "/dashboard/produccion" }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Movimientos recientes" icono={<Boxes size={17} />}>
          <Filas
            vacio="Sin movimientos en el kardex."
            items={d.movimientos.map((m) => ({
              clave: m.id,
              titulo: `${ETIQUETA_KARDEX[m.tipo_movimiento] ?? m.tipo_movimiento} · ${m.producto}`,
              detalle: `${fechaPE(m.fecha)} · ${m.documento} · ${m.sede}`,
              derecha: <Etiqueta tono={m.cantidad >= 0 ? "verde" : "naranja"}>{`${m.cantidad > 0 ? "+" : ""}${m.cantidad} ${m.unidad}`}</Etiqueta>,
              href: "/dashboard/almacen?tab=stock",
            }))}
          />
        </Panel>
        <Panel titulo="Stock crítico" icono={<Package size={17} />}>
          <Filas
            vacio="Ningún producto en nivel crítico."
            items={d.criticos.map((s) => ({ clave: s.id, titulo: s.nombre, detalle: s.sede, derecha: <Etiqueta>{`${s.cantidad} ${s.unidad}`}</Etiqueta>, href: "/dashboard/almacen?tab=stock" }))}
          />
        </Panel>
      </div>

      <AccesosModulos sesion={sesion} actual="almacen" />
    </MarcoPlanta>
  );
}

export default AlmacenHome;
