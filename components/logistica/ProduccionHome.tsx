"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ClipboardList, Cog, Container, Factory, Flame, PackageMinus, Wrench } from "lucide-react";
import { useSesion } from "@/lib/auth";
import type { EquipoTerminado } from "@/lib/equipos";
import { consumosDeChasis } from "@/lib/inventario";
import { useNotificaciones } from "@/lib/notificaciones";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, hoy, r2, soles, useStore } from "@/lib/storage";
import type { StockItem, ValeProduccion } from "@/lib/types";
import { BotonAccion, Etiqueta, Kpi, Panel, SinRegistro } from "./piezas";
import { EncabezadoPlanta, Filas, MarcoPlanta, PanelLateral, horaActual } from "./planta";
import { AccesosRapidos } from "./AccesosRapidos";

const ESTACIONES = [
  { nombre: "Plasma CNC", detalle: "Corte de planchas", icono: <Flame size={18} /> },
  { nombre: "Torno", detalle: "Mecanizado de ejes / bujes", icono: <Cog size={18} /> },
  { nombre: "Soldadura", detalle: "Unión de chasis", icono: <Wrench size={18} /> },
];

/** Home de Producción de la planta: órdenes de producción, QC, consumo de MP y costo de MP por chasis. Solo lectura. */
export function ProduccionHome() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const [sync, setSync] = useState("");

  const d = useMemo(() => {
    const mes = hoy().slice(0, 7);
    const costoDe = new Map(stock.map((s) => [s.id, s.costoUnit || 0]));
    const activas = ops
      .filter((o) => o.estado === "EN_FABRICACION")
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((o) => {
        const consumos = consumosDeChasis(o.codigo_chasis, o.id, vales);
        const costo = r2(consumos.reduce((a, v) => a + v.cantidad * (costoDe.get(v.stock_id) ?? 0), 0));
        return { o, consumos: consumos.length, costo };
      });
    const qcMes = ops.filter((o) => o.estado === "QC_APROBADO" && (o.qc?.fecha ?? "").startsWith(mes));
    const disponibles = equipos.filter((e) => e.estado === "DISPONIBLE");
    const valesMes = vales.filter((v) => v.fecha.startsWith(mes));
    const consumo = [...vales].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8);
    return { activas, qcMes, disponibles, valesMes, consumo };
  }, [ops, equipos, vales, stock]);

  useEffect(() => setSync(horaActual()), [d]);

  const recordatorios = d.activas.map(({ o }) => ({
    clave: `op:${o.id}`,
    titulo: `${o.id} · ${o.tipo_equipo} ${o.modelo}`,
    detalle: `En fabricación desde ${fechaPE(o.fecha)} · falta QC e ingreso a almacén`,
    href: "/dashboard/produccion",
  }));

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Producción" notifs={notifs} recordatorios={recordatorios} />}>
      <EncabezadoPlanta
        icono={<Factory size={30} />}
        titulo="Comboy Vid Producción Planta"
        subtitulo="Fabricación y Ensamblaje · Órdenes de producción · QC · Ingreso PT · Arequipa · Perú"
        accion={<span className="text-[12px] text-[#a1a1aa]">Actualizado: Hoy {sync}</span>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icono={<ClipboardList size={18} />} titulo="OP activas" valor={String(d.activas.length)} detalle="Órdenes de producción en fabricación" href="/dashboard/produccion" />
        <Kpi icono={<BadgeCheck size={18} />} titulo="QC del mes" valor={String(d.qcMes.length)} detalle="Equipos con QC aprobado este mes" href="/dashboard/produccion" />
        <Kpi icono={<Container size={18} />} titulo="PT disponible" valor={String(d.disponibles.length)} detalle="Equipos listos para venta / despacho" href="/dashboard/almacen?tab=stock" />
        <Kpi icono={<PackageMinus size={18} />} titulo="Vales de MP del mes" valor={String(d.valesMes.length)} detalle="Retiros de almacén para producción" href="/dashboard/almacen?tab=stock" />
      </div>

      <Panel titulo="Encargado 1 · Fabricación piezas metalúrgica" icono={<Flame size={17} />}>
        <div className="grid gap-2 sm:grid-cols-3">
          {ESTACIONES.map((e) => (
            <div key={e.nombre} className="rounded-lg border border-[#2a3445] bg-[#212a3a] p-3">
              <p className="flex items-center gap-2 text-[14px] font-bold text-white">
                <span className="text-[#f97316]">{e.icono}</span>
                {e.nombre}
              </p>
              <p className="text-[12px] text-[#a1a1aa]">{e.detalle}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <SinRegistro>El ERP aún no registra horas, tarifa, OEE ni mantenimiento de cada estación. Cuando se agregue, aparecerá aquí.</SinRegistro>
        </div>
      </Panel>

      <Panel
        titulo="Órdenes de producción en fabricación"
        icono={<ClipboardList size={17} />}
        accion={
          <BotonAccion href="/dashboard/produccion" lleno>
            Iniciar OP
          </BotonAccion>
        }
      >
        <Filas
          vacio="No hay órdenes de producción en fabricación."
          items={d.activas.map(({ o, consumos, costo }) => ({
            clave: o.id,
            titulo: `${o.id} · ${o.tipo_equipo} ${o.modelo}`,
            detalle: `Chasis ${o.codigo_chasis || "-"} · ${fechaPE(o.fecha)} · ${consumos} vale(s) de MP`,
            derecha: <Etiqueta>{`MP ${soles(costo)}`}</Etiqueta>,
            href: "/dashboard/produccion",
          }))}
        />
        <p className="mt-2 text-[12px] text-[#a1a1aa]">Costo de MP = vales de producción del chasis × último costo del producto en almacén.</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Consumo MP" icono={<PackageMinus size={17} />}>
          <Filas
            vacio="Sin vales de producción."
            items={d.consumo.map((v) => ({
              clave: v.id,
              titulo: `${v.producto}`,
              detalle: `${v.id} · ${fechaPE(v.fecha)} · ${v.chasis_ot ? `chasis/OT ${v.chasis_ot}` : "consumo de taller"} · ${v.sede}`,
              derecha: <Etiqueta>{`${v.cantidad} ${v.unidad}`}</Etiqueta>,
              href: "/dashboard/almacen?tab=stock",
            }))}
          />
        </Panel>
        <Panel titulo="Acciones" icono={<Factory size={17} />}>
          <div className="grid grid-cols-2 gap-2">
            <BotonAccion href="/dashboard/almacen?tab=nuevo">Solicitar MP a Almacén</BotonAccion>
            <BotonAccion href="/dashboard/almacen?tab=stock">Retiro para producción</BotonAccion>
            <BotonAccion href="/dashboard/produccion" lleno>
              Registrar QC / Entregar PT
            </BotonAccion>
            <BotonAccion href="/dashboard/almacen?tab=despacho">Órdenes de despacho</BotonAccion>
          </div>
        </Panel>
      </div>

      <AccesosRapidos sesion={sesion} actual="produccion" />
    </MarcoPlanta>
  );
}

export default ProduccionHome;
