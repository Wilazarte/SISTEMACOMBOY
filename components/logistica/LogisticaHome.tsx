"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Building2,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  LayoutGrid,
  ShoppingCart,
  Truck,
  Wrench,
  Container,
  CircleDollarSign,
  Cog,
  Package,
} from "lucide-react";
import { useSesion } from "@/lib/auth";
import { VERSION_LOGISTICA, abrirPestana, useLogistica } from "@/lib/logistica";
import { useNotificaciones } from "@/lib/notificaciones";
import { soles } from "@/lib/storage";
import { BotonVer, Etiqueta, Kpi, Panel, Vacio } from "./piezas";

/** Monto corto para los KPI: S/130k, S/1.2M. */
const corto = (n: number): string =>
  n >= 1_000_000 ? `S/${(n / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}M` : n >= 1000 ? `S/${Math.round(n / 1000)}k` : soles(n);

const hora = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Secciones de Logística: ya no se muestran como accesos rápidos (pedido de Williams, 2026-10-29),
 * pero siguen en /logistica/detalle, /logistica/<seccion> y el buscador Ctrl+K.
 */
export const SECCIONES_LOGISTICA = [
  { titulo: "Compras Nacionales Perú", texto: "Gestión de compras nacionales · OC y proveedores", href: "/logistica/compras", icono: <ShoppingCart size={20} /> },
  { titulo: "Ventas Nacionales PT", texto: "Remolcador · Chasis CV-300 · Tanque Agua · Coche Minero", href: "/logistica/ventas", icono: <Truck size={20} /> },
  { titulo: "Agencias", texto: "Marvisur · Grael · Shalom", href: "/logistica/agencias", icono: <Building2 size={20} /> },
  { titulo: "Proveedores Nacionales", texto: "Proveedores de las órdenes de compra", href: "/logistica/proveedores", icono: <Factory size={20} /> },
  { titulo: "Infraestructura Planta", texto: "Plasma · Torno · Soldadura", href: "/logistica/infraestructura", icono: <Wrench size={20} /> },
  { titulo: "Transferencias", texto: "Planta ↔ Sucursal · Seguimiento", href: "/logistica/transferencias", icono: <ArrowLeftRight size={20} /> },
  { titulo: "Guía SUNAT", texto: "Validar y emitir guía de remisión", href: "/logistica/guia-sunat", icono: <FileText size={20} /> },
  { titulo: "Cotizar Flete", texto: "Fletes por agencia y destino", href: "/logistica/cotizar-flete", icono: <Container size={20} /> },
  { titulo: "Historial General", texto: "Registro de movimientos y operaciones", href: "/logistica/historial", icono: <Clock size={20} /> },
];

/** Accesos rápidos visibles: los 4 módulos de la planta, cada uno en una pestaña nueva. Logística es el módulo actual. */
const MODULOS = [
  { titulo: "Logística", texto: "Compras y ventas nacionales · Agencias · Transferencias", href: "/logistica/detalle", icono: <Truck size={40} strokeWidth={1.8} />, actual: true },
  { titulo: "Almacén", texto: "Requerimientos · Ingresos · Stock · Despachos", href: "/logistica/almacen", icono: <Package size={56} strokeWidth={1.6} /> },
  { titulo: "Finanzas", texto: "Tesorería · Pagos · Planilla", href: "/logistica/finanzas", icono: <CircleDollarSign size={56} strokeWidth={1.6} /> },
  { titulo: "Producción", texto: "Órdenes de producción · QC · Ingreso PT", href: "/logistica/produccion", icono: <Cog size={56} strokeWidth={1.6} /> },
];

export function LogisticaHome() {
  const { sesion } = useSesion();
  const d = useLogistica();
  const notifs = useNotificaciones(sesion);
  const [sync, setSync] = useState("");
  useEffect(() => setSync(hora()), [d]);

  const oc = d.ocActivas[0];
  const enTransito = d.odsTransito.length + d.trasladosCamino.length;
  const primerTransito = d.trasladosCamino[0];
  const pt = d.ptPorTipo.map(([t, n]) => `${n} ${t}`).join(" · ");

  return (
    <div className="w-full space-y-5 rounded-2xl bg-[#0e1219] p-3 text-[#e5e7eb] sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2a3445] bg-[#1a212e] px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#f97316] text-[#f97316]">
            <Truck size={30} />
          </span>
          <div>
            <h1 className="text-2xl font-bold uppercase leading-tight text-white lg:text-3xl">Comboy Vid Logística Planta</h1>
            <p className="text-[13px] font-medium text-[#d4d4d8] lg:text-[15px]">Compras y Ventas Nacionales · Sin Flota · Marvisur · Grael · Shalom · Arequipa · Perú</p>
          </div>
        </div>
        <BotonVer href="/logistica/detalle">Ver Detalle</BotonVer>
      </header>

      {/* Resumen de operaciones */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icono={<ShoppingCart size={18} />}
          titulo="Compras activas"
          valor={corto(d.totalOcActivas)}
          detalle={oc ? `${d.ocActivas.length} OC · mayor ${oc.numero} ${oc.proveedor} ${soles(oc.total)}` : "Sin órdenes de compra en curso"}
          href="/logistica/compras"
        />
        <Kpi
          icono={<Truck size={18} />}
          titulo="En tránsito"
          valor={`${enTransito} ${enTransito === 1 ? "envío" : "envíos"}`}
          detalle={
            primerTransito
              ? `${primerTransito.codigo} → ${primerTransito.destino}${primerTransito.transportista ? ` · ${primerTransito.transportista}` : ""}`
              : d.odsTransito.length
                ? `${d.odsTransito.length} OD dejada(s) en agencia`
                : "Nada en ruta"
          }
          href="/logistica/transferencias"
        />
        <Kpi icono={<ClipboardList size={18} />} titulo="OP activas" valor={String(d.opsActivas.length)} detalle="Órdenes de producción en fabricación" href="/logistica/produccion" />
        <Kpi icono={<Container size={18} />} titulo="PT disponible" valor={`${d.ptDisponible.length} ${d.ptDisponible.length === 1 ? "equipo" : "equipos"}`} detalle={pt || "Sin equipos listos para despacho"} href="/logistica/ventas" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel titulo="Pendientes urgentes" icono={<AlertTriangle size={17} />}>
          {d.pendientes.length === 0 ? (
            <Vacio>No hay pendientes urgentes.</Vacio>
          ) : (
            <ul className="space-y-2">
              {d.pendientes.slice(0, 6).map((p) => (
                <li key={p.clave}>
                  <button
                    type="button"
                    onClick={() => abrirPestana(p.href)}
                    className="flex w-full items-center gap-3 rounded-lg border border-[#2a3445] bg-[#212a3a] px-3 py-2 text-left transition hover:border-[#f97316]"
                  >
                    <AlertTriangle size={16} className="shrink-0 text-[#f97316]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-white">{p.titulo}</span>
                      <span className="block truncate text-[12px] text-[#a1a1aa]">{p.detalle}</span>
                    </span>
                    <Etiqueta>{p.etiqueta}</Etiqueta>
                  </button>
                </li>
              ))}
              {d.pendientes.length > 6 && <li className="text-right text-[12px] text-[#a1a1aa]">y {d.pendientes.length - 6} más</li>}
            </ul>
          )}
        </Panel>

        <Panel titulo="Notificaciones" icono={<Bell size={17} />}>
          {notifs.length === 0 ? (
            <Vacio>Sin notificaciones nuevas.</Vacio>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {notifs.slice(0, 4).map((n) => (
                <li key={n.clave}>
                  <button
                    type="button"
                    onClick={() => abrirPestana(n.href)}
                    className="flex h-full w-full gap-2 rounded-lg border border-[#2a3445] bg-[#212a3a] px-3 py-2 text-left transition hover:border-[#f97316]"
                  >
                    <Bell size={15} className="mt-0.5 shrink-0 text-[#f97316]" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-white">{n.titulo}</span>
                      <span className="block text-[12px] text-[#a1a1aa]">{n.detalle}</span>
                      <span className="block text-[11px] text-[#71717a]">{n.modulo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold uppercase text-[#fb923c]">
          <LayoutGrid size={20} /> Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MODULOS.map((a) => (
            <ModuloCard key={a.href} {...a} />
          ))}
        </div>
      </section>

      <footer className="pt-1 text-[12px] text-[#a1a1aa]">
        COMBOY VID LOGÍSTICA PLANTA · {VERSION_LOGISTICA} · Última sincronización: Hoy {sync}
      </footer>
    </div>
  );
}

/** Tarjeta de módulo: ícono grande y nombre debajo (abre en pestaña nueva). */
function ModuloCard({ titulo, texto, href, icono, actual }: { titulo: string; texto: string; href: string; icono: React.ReactNode; actual?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      title={`${texto} (se abre en una pestaña nueva)`}
      className="group flex min-h-[170px] flex-col items-center justify-center gap-3 rounded-xl border border-[#2a3445] bg-[#1a212e] px-4 py-6 transition hover:border-[#f97316]"
    >
      <span
        className={
          actual
            ? "flex h-20 w-20 items-center justify-center rounded-full bg-[#f97316] text-white"
            : "flex h-20 w-20 items-center justify-center text-[#f97316] transition group-hover:scale-105"
        }
      >
        {icono}
      </span>
      <span className={actual ? "rounded-lg bg-[#2563eb]/25 px-3 py-0.5 text-2xl font-bold text-white" : "text-2xl font-bold text-white"}>{titulo}</span>
    </button>
  );
}

export default LogisticaHome;
