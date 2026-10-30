"use client";

import {
  AlertTriangle,
  Bell,
  LayoutGrid,
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
import { useLogistica } from "@/lib/logistica";
import { useNotificaciones } from "@/lib/notificaciones";
import { RUTA_MUNDO_VENTAS, permisosPlanta } from "@/lib/permisosPlanta";
import { soles } from "@/lib/storage";
import { ErpAlertList } from "@/components/erp/ErpAlertList";
import { Acceso, BotonVer, Etiqueta, Kpi, Panel } from "./piezas";
import { EncabezadoPlanta, MarcoPlanta } from "./planta";
import { AccesosRapidos } from "./AccesosRapidos";

/** Monto corto para los KPI: S/130k, S/1.2M. */
const corto = (n: number): string =>
  n >= 1_000_000 ? `S/${(n / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}M` : n >= 1000 ? `S/${Math.round(n / 1000)}k` : soles(n);


/**
 * Secciones de Logística: ya no se muestran como accesos rápidos (pedido de Williams, 2026-10-29),
 * pero siguen en /logistica/detalle, /logistica/<seccion> y el buscador Ctrl+K.
 */
export const SECCIONES_LOGISTICA = [
  { titulo: "Expedientes 26W", texto: "OP → expediente · 8 fases · cotización y OC", href: "/erp/lotes", icono: <ClipboardList size={20} /> },
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

  const oc = d.ocActivas[0];
  const enTransito = d.odsTransito.length + d.trasladosCamino.length;
  const primerTransito = d.trasladosCamino[0];
  const pt = d.ptPorTipo.map(([t, n]) => `${n} ${t}`).join(" · ");

  // Diseño 2: sin panel derecho; Notificaciones va junto a Pendientes urgentes (chat y reunión: Ver Detalle)
  return (
    <MarcoPlanta>
      <EncabezadoPlanta
        icono={<Truck size={30} />}
        titulo="LOGISTICA"
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
          icono={<ShoppingCart size={30} />}
          titulo="Compras activas"
          valor={corto(d.totalOcActivas)}
          detalle={oc ? `${d.ocActivas.length} OC · mayor ${oc.numero} ${oc.proveedor} ${soles(oc.total)}` : "Sin órdenes de compra en curso"}
          href="/logistica/compras"
        />
        <Kpi
          icono={<Truck size={30} />}
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
        <Kpi icono={<ClipboardList size={30} />} titulo="OT activas" valor={String(d.opsActivas.length)} detalle="Órdenes de trabajo abiertas (OP en fabricación)" href="/logistica/produccion" />
        <Kpi icono={<Container size={30} />} titulo="PT disponible" valor={`${d.ptDisponible.length} ${d.ptDisponible.length === 1 ? "equipo" : "equipos"}`} detalle={pt || "Sin equipos listos para despacho"} href="/logistica/ventas" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Pendientes urgentes" icono={<AlertTriangle size={17} />}>
          <ErpAlertList
            vacio="No hay pendientes urgentes."
            max={4}
            items={d.pendientes.map((p) => ({ clave: p.clave, titulo: p.titulo, detalle: p.detalle, href: p.href, icono: <AlertTriangle size={16} />, derecha: <Etiqueta>{p.etiqueta}</Etiqueta> }))}
          />
        </Panel>
        <Panel titulo="Notificaciones" icono={<Bell size={17} />}>
          {notifs.length === 0 ? (
            <ErpAlertList vacio="Sin notificaciones nuevas." items={[]} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {notifs.slice(0, 4).map((n) => (
                <ErpAlertList key={n.clave} vacio="" items={[{ clave: n.clave, titulo: n.titulo, detalle: n.detalle, href: n.href, icono: n.tipo === "stock" ? <AlertTriangle size={16} /> : <Bell size={16} /> }]} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Accesos rápidos del diseño: las secciones de Logística */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold uppercase text-[#60a5fa]">
          <LayoutGrid size={24} /> Accesos rápidos
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SECCIONES_LOGISTICA.map((a) => (
            <Acceso key={a.href} icono={a.icono} titulo={a.titulo} texto={a.texto} href={a.href} />
          ))}
        </div>
      </section>

      {/* Funciones de Logística (Crear OC, Emitir Factura, Mundo Ventas…) o, para SOPORTE, la barra de módulos */}
      <AccesosRapidos sesion={sesion} actual="logistica" />


    </MarcoPlanta>
  );
}

export default LogisticaHome;
