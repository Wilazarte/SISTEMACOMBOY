"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  ShoppingCart,
  Truck,
  Wrench,
  Container,
} from "lucide-react";
import { useSesion } from "@/lib/auth";
import { VERSION_LOGISTICA, abrirPestana, useLogistica } from "@/lib/logistica";
import { useNotificaciones } from "@/lib/notificaciones";
import { RUTA_MUNDO_VENTAS, permisosPlanta } from "@/lib/permisosPlanta";
import { soles } from "@/lib/storage";
import { BotonVer, Etiqueta, Kpi, Panel, Vacio } from "./piezas";
import { EncabezadoPlanta, MarcoPlanta, PanelLateral } from "./planta";
import { AccesosRapidos } from "./AccesosRapidos";

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
    <MarcoPlanta
      lateral={
        <PanelLateral
          sesion={sesion}
          modulo="Logística"
          notifs={notifs}
          recordatorios={d.pendientes.map((p) => ({ clave: p.clave, titulo: p.titulo, detalle: p.detalle, href: p.href }))}
        />
      }
    >
      <EncabezadoPlanta
        icono={<Truck size={30} />}
        titulo="Comboy Vid Logística Planta"
        subtitulo="Compras y Ventas Nacionales · Sin Flota · Marvisur · Grael · Shalom · Arequipa · Perú"
        accion={
          <div className="flex flex-wrap gap-2">
            {permisosPlanta(sesion).canAccessMundoVentas && <BotonVer href={RUTA_MUNDO_VENTAS}>Mundo Ventas</BotonVer>}
            <BotonVer href="/logistica/detalle">Ver Detalle</BotonVer>
          </div>
        }
      />

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

      <AccesosRapidos sesion={sesion} actual="logistica" />

    </MarcoPlanta>
  );
}

export default LogisticaHome;
