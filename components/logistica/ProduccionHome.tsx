"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, ClipboardList, Clock, Cog, Factory, Flame, Gauge, MapPin, PackageMinus, Plus, Truck, Wrench } from "lucide-react";
import { useSesion } from "@/lib/auth";
import type { EquipoTerminado } from "@/lib/equipos";
import { consumosDeChasis } from "@/lib/inventario";
import { abrirPestana } from "@/lib/logistica";
import { useNotificaciones } from "@/lib/notificaciones";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, r2, soles, useStore } from "@/lib/storage";
import type { StockItem, ValeProduccion } from "@/lib/types";
import { BotonAccion, Etiqueta, Panel, SinRegistro } from "./piezas";
import { BarraAcciones, Filas, MarcoPlanta, PanelLateral, TiemposCosto, horaActual } from "./planta";

const ESTACIONES = [
  { nombre: "Plasma CNC", detalle: "Corte de planchas", icono: <Flame size={30} /> },
  { nombre: "Torno", detalle: "Mecanizado de ejes / bujes", icono: <Cog size={30} /> },
  { nombre: "Soldadura", detalle: "Unión de chasis", icono: <Wrench size={30} /> },
];

/** Tarjeta KPI del diseño de Producción: icono grande arriba, título y detalle. */
function KpiProduccion({ icono, titulo, valor, detalle, href }: { icono: ReactNode; titulo: string; valor?: string; detalle: string; href: string }) {
  return (
    <button type="button" onClick={() => abrirPestana(href)} className="flex flex-col items-center gap-1 rounded-xl border border-[#2a3445] border-b-[#2a7bff] bg-[#1a212e] px-3 py-4 text-center transition hover:border-[#2a7bff]">
      <span className="text-white">{icono}</span>
      <span className="text-[15px] font-bold text-white">{titulo}</span>
      {valor && <span className="text-2xl font-bold text-[#2a7bff]">{valor}</span>}
      <span className="text-[12px] text-[#a1a1aa]">{detalle}</span>
    </button>
  );
}

function Encargado({ numero, titulo, detalle }: { numero: number; titulo: string; detalle: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[17px] font-bold uppercase text-white">
        <span className="h-4 w-6 rounded-sm bg-[#2a7bff]" aria-hidden /> Encargado {numero} · {titulo}
      </h2>
      <p className="text-[13px] text-[#d4d4d8]">{detalle}</p>
    </div>
  );
}

/** Producción Planta (diseño 5 de Williams): OT, estaciones, ensamblaje, QC, consumo de MP y costos. Datos reales; lo demás "sin registro". */
export function ProduccionHome() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const [ahora, setAhora] = useState("");

  const d = useMemo(() => {
    const costoDe = new Map(stock.map((s) => [s.id, s.costoUnit || 0]));
    const activas = ops
      .filter((o) => o.estado === "EN_FABRICACION")
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((o) => {
        const consumos = consumosDeChasis(o.codigo_chasis, o.id, vales);
        return { o, consumos: consumos.length, costo: r2(consumos.reduce((a, v) => a + v.cantidad * (costoDe.get(v.stock_id) ?? 0), 0)) };
      });
    const qc = ops.filter((o) => o.estado === "QC_APROBADO" && o.qc).sort((a, b) => (b.qc?.fecha ?? "").localeCompare(a.qc?.fecha ?? "")).slice(0, 4);
    const disponibles = equipos.filter((e) => e.estado === "DISPONIBLE");
    const enQc = equipos.filter((e) => e.estado === "EN_QC");
    const consumo = [...vales].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
    return { activas, qc, disponibles, enQc, consumo };
  }, [ops, equipos, vales, stock]);

  useEffect(() => {
    setAhora(`${new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })} ${horaActual()}`);
  }, [d]);

  const recordatorios = d.activas.map(({ o }) => ({
    clave: `op:${o.id}`,
    titulo: `${o.id} · ${o.tipo_equipo} ${o.modelo}`,
    detalle: `En fabricación desde ${fechaPE(o.fecha)} · falta QC e ingreso a almacén`,
    href: "/dashboard/produccion",
  }));

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Producción" notifs={notifs} recordatorios={recordatorios} />}>
      {/* Barra de contexto */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#2a3445] bg-[#1a212e] px-4 py-2 text-[13px] font-semibold text-white">
        <MapPin size={15} className="text-[#2a7bff]" /> Planta Arequipa - Perú <span className="text-[#3a4558]">|</span> Usuario: {sesion?.nombre ?? "-"}
        <span className="text-[#3a4558]">|</span> {ahora} <span className="text-[#3a4558]">|</span> <span className="text-[#4ade80]">Conectado</span>
      </p>

      <header>
        <h1 className="text-3xl font-bold uppercase leading-tight text-white lg:text-4xl">PRODUCCION</h1>
        <p className="text-[15px] font-medium text-[#d4d4d8]">Fabricación y Ensamblaje · Gestión de OT · Planta Arequipa</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiProduccion icono={<ClipboardList size={36} />} titulo="OT Activas" valor={String(d.activas.length)} detalle="En proceso" href="/dashboard/produccion" />
        <KpiProduccion icono={<Gauge size={36} />} titulo="OEE General" detalle="sin registro" href="/dashboard/produccion" />
        <KpiProduccion icono={<Truck size={36} />} titulo="Chasis en Fab" valor={String(d.activas.filter(({ o }) => o.codigo_chasis).length)} detalle="En fabricación" href="/dashboard/produccion" />
        <KpiProduccion icono={<Factory size={36} />} titulo="Avance Ensamblaje" valor={String(d.enQc.length)} detalle="Equipos en QC · % sin registro" href="/dashboard/produccion" />
        <KpiProduccion icono={<Clock size={36} />} titulo="Horas Hombre Hoy" detalle="sin registro · turno día" href="/dashboard/produccion" />
      </div>

      <section className="space-y-2">
        <Encargado numero={1} titulo="Fabricación piezas metalúrgica" detalle="Encargado: Fabricación Piezas (Plasma · Torno · Soldadura) · 3 estaciones" />
        <div className="grid gap-3 md:grid-cols-3">
          {ESTACIONES.map((e) => (
            <div key={e.nombre} className="flex gap-3 rounded-xl border border-[#2a3445] bg-[#1a212e] p-3">
              <span className="text-white">{e.icono}</span>
              <span>
                <span className="block text-[15px] font-bold text-white">{e.nombre}</span>
                <span className="block text-[13px] text-[#d4d4d8]">{e.detalle}</span>
                <span className="mt-1 block text-[12px] italic text-[#a1a1aa]">Horas, tarifa, OEE y mantenimiento: sin registro</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <Panel
        titulo="OT Fabricación — Lista de Órdenes de Trabajo"
        icono={<ClipboardList size={17} />}
        accion={
          <BotonAccion href="/dashboard/produccion" lleno icono={<Plus size={15} />}>
            Iniciar OT
          </BotonAccion>
        }
      >
        {d.activas.length === 0 ? (
          <SinRegistro>No hay órdenes de producción en fabricación.</SinRegistro>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.activas.slice(0, 6).map(({ o, consumos, costo }) => (
              <div key={o.id} className="rounded-lg border border-[#2a3445] bg-[#212a3a] p-3">
                <div className="flex items-start gap-2">
                  <Etiqueta tono="azul">EN PROCESO</Etiqueta>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-white">
                      {o.id} · {o.tipo_equipo} {o.modelo}
                    </span>
                    <span className="block text-[12px] text-[#d4d4d8]">
                      Chasis {o.codigo_chasis || "-"} · desde {fechaPE(o.fecha)} · {consumos} vale(s) de MP · MP {soles(costo)}
                    </span>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <BotonAccion href="/dashboard/almacen?tab=stock">Entrega a Almacén Intermedio</BotonAccion>
                  <BotonAccion href="/dashboard/produccion">Reportar avance a Almacenero</BotonAccion>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <section className="space-y-2">
        <Encargado numero={2} titulo="Ensamblaje" detalle="Encargado: Ensamblaje — Ensambla PT: remolcadores, tanques de agua y coches mineros" />
        <div className="rounded-xl border border-[#2a3445] bg-[#1a212e] p-3">
          <p className="text-[14px] font-semibold text-white">
            Equipos en QC: {d.enQc.length} · Listos (PT disponible): {d.disponibles.length}
          </p>
          <p className="text-[12px] italic text-[#a1a1aa]">% de avance de la línea de ensamblaje: sin registro.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <BotonAccion href="/dashboard/produccion">Reportar avance a Almacenero</BotonAccion>
            <BotonAccion href="/dashboard/produccion">Ver Detalle</BotonAccion>
            <BotonAccion href="/dashboard/produccion" lleno>
              Entregar PT a Almacén
            </BotonAccion>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Control calidad" icono={<BadgeCheck size={17} />}>
          <Filas
            max={4}
            vacio="Sin QC registrados."
            items={d.qc.map((o) => ({ clave: o.id, titulo: `${o.id} · ${o.tipo_equipo}`, detalle: `QC ${fechaPE(o.qc!.fecha)} · ${o.qc!.supervisor}`, derecha: <Etiqueta tono="verde">OK</Etiqueta>, href: "/dashboard/produccion" }))}
          />
        </Panel>
        <Panel titulo="Consumo MP" icono={<PackageMinus size={17} />}>
          <Filas
            max={5}
            vacio="Sin vales de producción."
            items={d.consumo.map((v) => ({ clave: v.id, titulo: v.producto, detalle: `${fechaPE(v.fecha)} · ${v.chasis_ot ? `chasis/OT ${v.chasis_ot}` : "consumo de taller"}`, derecha: <Etiqueta>{`${v.cantidad} ${v.unidad}`}</Etiqueta>, href: "/dashboard/almacen?tab=stock" }))}
          />
        </Panel>
        <Panel>
          <TiemposCosto />
        </Panel>
      </div>

      <BarraAcciones
        acciones={[
          { label: "Expedientes 26W", href: "/erp/lotes", tono: "lleno" },
          { label: "Reportar a Almacén", href: "/dashboard/produccion" },
          { label: "Entregar Semi a Almacén Intermedio", href: "/dashboard/almacen?tab=stock" },
          { label: "Entregar PT a Almacén", href: "/dashboard/produccion", tono: "lleno" },
          { label: "Solicitar MP a Almacén", href: "/dashboard/almacen?tab=nuevo" },
          { label: "Iniciar OT", href: "/dashboard/produccion", tono: "lleno" },
        ]}
      />

    </MarcoPlanta>
  );
}

export default ProduccionHome;
