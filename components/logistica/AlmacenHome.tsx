"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, Camera, CheckSquare, Container, Factory, FileText, Package, PackageMinus, Plus, Warehouse } from "lucide-react";
import { useSesion } from "@/lib/auth";
import type { EquipoTerminado } from "@/lib/equipos";
import { useNotificaciones } from "@/lib/notificaciones";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, r2, soles, useStore } from "@/lib/storage";
import type { Guia, MovimientoKardex, OrdenDespacho, StockItem, ValeProduccion } from "@/lib/types";
import { estadoOD } from "@/lib/ventas";
import { abrirPestana } from "@/lib/logistica";
import { Etiqueta, Panel, SinRegistro } from "./piezas";
import { BarraAcciones, BarraModulos, EncabezadoPlanta, Filas, MarcoPlanta, PanelLateral, horaActual, montoCorto } from "./planta";

/** Stock crítico: 5 unidades o menos (igual que el Dashboard). */
const STOCK_CRITICO = 5;

/** Equipos de Ingreso PT (diseño): se cuentan los terminados disponibles cuyo tipo contiene la palabra. */
const TIPOS_PT = [
  { label: "Remolcador", busca: "REMOLCADOR" },
  { label: "Chasis", busca: "CHASIS" },
  { label: "Tanque", busca: "TANQUE" },
  { label: "Coche Minero", busca: "COCHE" },
];

const ESTACIONES = ["Plasma", "Torno", "Soldadura"];

const ETIQUETA_KARDEX: Record<string, string> = {
  SALDO_INICIAL: "Saldo inicial",
  INGRESO: "Ingreso",
  "SALIDA-VENTA": "Salida venta",
  "SALIDA-PRODUCCION": "Salida producción",
  TRANSFERENCIA: "Transferencia",
  AJUSTE: "Ajuste",
};

/** Almacén Planta (diseño 1 de Williams): datos reales; lo que el ERP no registra dice "sin registro". */
export function AlmacenHome() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const kardex = useStore<MovimientoKardex[]>(KEYS.KARDEX, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const [sync, setSync] = useState("");

  const d = useMemo(() => {
    const valor = r2(stock.reduce((a, s) => a + s.cantidad * (s.costoUnit || 0), 0));
    const ubicaciones = Object.entries(
      stock.reduce<Record<string, { items: number; valor: number; cantidad: number }>>((acc, s) => {
        const u = (acc[s.sede || "Sin almacén"] ??= { items: 0, valor: 0, cantidad: 0 });
        if (s.cantidad > 0) u.items++;
        u.cantidad += Math.max(0, s.cantidad);
        u.valor += s.cantidad * (s.costoUnit || 0);
        return acc;
      }, {})
    )
      .sort((a, b) => b[1].valor - a[1].valor)
      .slice(0, 3);
    const criticos = stock.filter((s) => s.cantidad <= STOCK_CRITICO).sort((a, b) => a.cantidad - b.cantidad);
    const porVB = guias.filter((g) => g.estado === "PENDIENTE_VB");
    const negativos = stock.filter((s) => s.cantidad < 0);
    const porDespachar = ods.filter((o) => ["PENDIENTE", "PEDIDO_ALISTADO"].includes(estadoOD(o)));
    const movimientos = [...kardex].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
    const mes = new Date().toISOString().slice(0, 7);
    const valesMes = vales.filter((v) => v.fecha.startsWith(mes));
    const disponibles = equipos.filter((e) => e.estado === "DISPONIBLE");
    const pt = TIPOS_PT.map((t) => ({ ...t, n: disponibles.filter((e) => (e.tipo_equipo || "").toUpperCase().includes(t.busca)).length }));
    const enFabricacion = ops.filter((o) => o.estado === "EN_FABRICACION").length;
    return { valor, ubicaciones, criticos, porVB, negativos, porDespachar, movimientos, valesMes, disponibles, pt, enFabricacion };
  }, [stock, guias, ods, kardex, vales, equipos, ops]);

  useEffect(() => setSync(horaActual()), [d]);

  // Validación de stock: SÍ cuando no hay guías por V°B° ni productos con saldo negativo
  const validado = d.porVB.length === 0 && d.negativos.length === 0;

  const recordatorios = [
    ...d.porVB.map((g) => ({ clave: `vb:${g.id}`, titulo: `Dar V°B° a la guía ${g.numero}`, detalle: `${g.ocNumero} · ingreso a almacén`, href: "/dashboard/almacen?tab=ingresos" })),
    ...d.porDespachar.map((o) => ({ clave: `od:${o.id}`, titulo: `Despachar ${o.numero}`, detalle: `${o.cliente}`, href: "/dashboard/almacen?tab=despacho" })),
  ];
  const alertas = d.criticos.slice(0, 5).map((s) => ({ clave: `st:${s.id}`, titulo: `Stock bajo ${s.nombre}: ${s.cantidad} ${s.unidad}`, detalle: `${s.sede} · reposición requerida`, href: "/dashboard/almacen?tab=stock" }));

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Almacén" notifs={notifs} alertas={alertas} recordatorios={recordatorios} />}>
      <EncabezadoPlanta icono={<Package size={30} />} titulo="ALMACEN" subtitulo="Almacenero · Arequipa · Perú" />

      {/* Stock MP valorizado */}
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-[#2a2a2a] bg-[#141414] px-5 py-4">
        <span className="flex items-center gap-2 rounded-lg border border-[#d50000] px-3 py-1.5 text-[13px] font-bold uppercase leading-tight text-[#ff5252]">
          <Warehouse size={20} /> Almacén · Planta
          <br />
          Arequipa
        </span>
        <button type="button" onClick={() => abrirPestana("/dashboard/almacen?tab=stock")} className="text-3xl font-bold text-white hover:text-[#ff8a80] lg:text-4xl">
          Stock MP {montoCorto(d.valor)}
        </button>
        <Etiqueta tono="verde">{`${stock.filter((s) => s.cantidad > 0).length} productos con stock`}</Etiqueta>
        <span className="ml-auto text-[13px] text-[#d4d4d8]">Actualizado: Hoy · {sync} hrs</span>
      </section>

      {/* Ubicaciones + validación de stock */}
      <Panel titulo="Ubicaciones ›" icono={<Boxes size={17} />}>
        <div className="grid gap-3 lg:grid-cols-4">
          {d.ubicaciones.length === 0 && <SinRegistro>Sin stock registrado.</SinRegistro>}
          {d.ubicaciones.map(([sede, u], i) => (
            <button
              key={sede}
              type="button"
              onClick={() => abrirPestana("/dashboard/almacen?tab=stock")}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition hover:border-[#d50000] ${i === 0 ? "border-[#d50000] bg-[#d50000]/10" : "border-[#2a2a2a] bg-[#1c1c1c]"}`}
            >
              <Warehouse size={26} className="shrink-0 text-[#d50000]" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-white">{sede}</span>
                <span className="block text-[12px] text-[#d4d4d8]">
                  {u.items} producto(s) · {soles(r2(u.valor))}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => abrirPestana("/dashboard/almacen?tab=stock")}
            title={validado ? "Sin guías por V°B° ni saldos negativos" : `${d.porVB.length} guía(s) por V°B° · ${d.negativos.length} saldo(s) negativo(s)`}
            className="flex flex-col justify-center rounded-lg px-3 py-2 text-left"
          >
            <span className="text-[13px] font-semibold text-white">Validación Stock: SÍ / NO</span>
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className={`text-[16px] font-bold ${validado ? "text-[#4ade80]" : "text-[#f87171]"}`}>Validación Stock: {validado ? "SÍ" : "NO"}</span>
              <span role="switch" aria-checked={validado} className={`relative h-6 w-11 shrink-0 rounded-full ${validado ? "bg-[#22c55e]" : "bg-[#3a3a3a]"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${validado ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </span>
          </button>
        </div>
      </Panel>

      {/* Recepción MP */}
      <Panel titulo="Recepción MP" icono={<FileText size={17} />}>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { label: "Nota Ingreso", icono: <FileText size={16} />, href: "/dashboard/almacen?tab=ingresos" },
            { label: "Foto Guía", icono: <Camera size={16} />, href: "/dashboard/almacen?tab=ingresos" },
            { label: "Capturar Foto", icono: <Camera size={16} />, href: "/dashboard/almacen?tab=ingresos" },
          ].map((b) => (
            <button key={b.label} type="button" onClick={() => abrirPestana(b.href)} className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-lg border border-[#d50000]/70 px-4 py-2 text-[14px] font-bold text-white hover:bg-[#d50000]/10">
              <span className="text-[#d50000]">{b.icono}</span>
              {b.label}
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Entrega a producción */}
        <Panel titulo="Entrega a producción" icono={<Factory size={17} />}>
          <p className="text-[13px] text-[#d4d4d8]">{d.valesMes.length} vale(s) de MP entregados este mes</p>
          <p className="mt-2 text-[15px] font-bold text-[#ff5252]">Fabricación - Piezas Metalúrgica</p>
          <ul className="mt-1 space-y-1">
            {ESTACIONES.map((e) => (
              <li key={e} className="flex items-center justify-between text-[14px]">
                <span className="text-white">• {e}</span>
                <span className="flex items-center gap-1 text-[#a1a1aa]">
                  <ArrowRight size={13} className="text-[#d50000]" /> sin registro
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-4">
          <Panel titulo="Ensamblaje" icono={<Container size={17} />}>
            <p className="flex flex-wrap items-center gap-4 text-[14px] text-white">
              <span>• Ensamblaje: {d.enFabricacion} en fabricación</span>
              <span className="flex items-center gap-1">
                <ArrowRight size={14} className="text-[#22c55e]" /> Listo para despacho: {d.disponibles.length}
              </span>
            </p>
          </Panel>
          <Panel titulo="Ingreso PT" icono={<Container size={17} />}>
            <div className="flex flex-wrap gap-2">
              {d.pt.map((t) => (
                <button key={t.label} type="button" onClick={() => abrirPestana("/dashboard/produccion")} className="inline-flex items-center gap-2 rounded-lg border border-[#d50000]/60 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-[#d50000]/10">
                  {t.label} <Etiqueta tono={t.n ? "verde" : "gris"}>{String(t.n)}</Etiqueta>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="KPI Exactitud" icono={<CheckSquare size={17} />}>
          <SinRegistro>Inventario vs Sistema · Meta 98%: el ERP aún no registra conteos físicos de inventario. Cuando se registren, el % de exactitud aparecerá aquí.</SinRegistro>
        </Panel>
        <Panel titulo="Movimientos recientes" icono={<Boxes size={17} />}>
          <Filas
            max={4}
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
      </div>

      <BarraAcciones
        acciones={[
          { label: "Recepción MP", href: "/dashboard/almacen?tab=ingresos", icono: <Plus size={17} />, tono: "lleno" },
          { label: "Entrega Fabricación", href: "/dashboard/almacen?tab=stock", icono: <ArrowRight size={17} /> },
          { label: "Entrega Ensamblaje", href: "/dashboard/almacen?tab=stock", icono: <PackageMinus size={17} /> },
          { label: "Validar Stock", href: "/dashboard/almacen?tab=stock", icono: <CheckSquare size={17} />, tono: "verde" },
        ]}
      />

      <BarraModulos sesion={sesion} actual="almacen" />
    </MarcoPlanta>
  );
}

export default AlmacenHome;
