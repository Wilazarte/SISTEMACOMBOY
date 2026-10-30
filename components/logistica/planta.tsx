"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Bell, CircleDollarSign, Clock, Cog, Lock, MessageSquare, Package, Plus, Send, Timer, Truck, Users, Video } from "lucide-react";
import { useChat } from "@/lib/chat";
import { consumosDeChasis } from "@/lib/inventario";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, r2, soles, useStore } from "@/lib/storage";
import type { StockItem, ValeProduccion } from "@/lib/types";
import { cn } from "@/components/ui";
import { puedeVer, type Sesion } from "@/lib/auth";
import { permisosPlanta } from "@/lib/permisosPlanta";
import { abrirPestana } from "@/lib/logistica";
import type { Notificacion } from "@/lib/notificaciones";
import { urlSala, usePresencia } from "@/lib/presencia";
import { ErpAlertList } from "@/components/erp/ErpAlertList";
import { Panel } from "./piezas";

// Piezas comunes de las 4 homes de la planta (Logística, Almacén, Finanzas, Producción).
// Mismo diseño que Logística: fondo #0a0a0a, tarjetas #141414, naranja #d50000.

export type ModuloPlanta = "logistica" | "almacen" | "finanzas" | "produccion";

/** `home`: página de inicio del módulo. `trabajo`: el módulo de siempre (se abre desde la tarjeta del módulo actual). */
export const MODULOS_PLANTA: { id: ModuloPlanta; titulo: string; home: string; trabajo: string; icono: (grande: boolean) => ReactNode }[] = [
  { id: "logistica", titulo: "Logística", home: "/logistica", trabajo: "/logistica/detalle", icono: (g) => <Truck size={g ? 40 : 56} strokeWidth={1.8} /> },
  { id: "almacen", titulo: "Almacén", home: "/almacen", trabajo: "/dashboard/almacen", icono: (g) => <Package size={g ? 40 : 56} strokeWidth={1.6} /> },
  { id: "finanzas", titulo: "Finanzas", home: "/finanzas", trabajo: "/dashboard/compras", icono: (g) => <CircleDollarSign size={g ? 40 : 56} strokeWidth={1.6} /> },
  { id: "produccion", titulo: "Producción", home: "/produccion", trabajo: "/dashboard/produccion", icono: (g) => <Cog size={g ? 40 : 56} strokeWidth={1.6} /> },
];

/** Grilla de la home: contenido a la izquierda y panel derecho fijo en escritorio (fondo y pie: ErpLayout). */
export function MarcoPlanta({ children, lateral }: { children: ReactNode; /** Sin panel derecho (Logística Dashboard): ancho completo. */ lateral?: ReactNode }) {
  return (
    <div className="w-full text-[#e5e7eb]">
      <div className={lateral ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-5"}>
        <div className="min-w-0 space-y-5">{children}</div>
        {lateral && <aside className="min-w-0">{lateral}</aside>}
      </div>
    </div>
  );
}

export function EncabezadoPlanta({ icono, titulo, subtitulo, accion }: { icono: ReactNode; titulo: string; subtitulo: string; accion?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2a2a2a] bg-[#141414] px-5 py-4">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#d50000] text-[#d50000]">{icono}</span>
        <div>
          {/* Solo el nombre del módulo: un h1 blanco grande (pedido de Williams, 2026-10-29) */}
          <h1 className="text-3xl font-bold uppercase leading-tight text-white lg:text-4xl">{titulo}</h1>
          <p className="text-[13px] font-medium text-[#d4d4d8] lg:text-[15px]">{subtitulo}</p>
        </div>
      </div>
      {accion}
    </header>
  );
}

/** Barra inferior de acciones del módulo (diseños): `tono` lleno (naranja), borde o verde. Abre en pestaña nueva. */
export function BarraAcciones({ acciones }: { acciones: { label: string; href: string; icono?: ReactNode; tono?: "lleno" | "borde" | "verde" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#2a2a2a] bg-[#141414] p-3 sm:grid-cols-4 xl:flex xl:flex-wrap">
      {acciones.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => abrirPestana(a.href)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[14px] font-bold transition",
            a.tono === "lleno"
              ? "bg-[#d50000] text-white hover:bg-[#b00000]"
              : a.tono === "verde"
                ? "border border-[#22c55e] text-[#4ade80] hover:bg-[#22c55e]/10"
                : "border border-[#d50000]/70 text-white hover:bg-[#d50000]/10"
          )}
        >
          {a.icono}
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Barra de los 4 módulos: solo para quien puede ver otros módulos (SOPORTE). */
export function BarraModulos({ sesion, actual }: { sesion: Sesion | null; actual: ModuloPlanta }) {
  return permisosPlanta(sesion).canViewOtherModules ? <AccesosModulos sesion={sesion} actual={actual} /> : null;
}

/**
 * Accesos rápidos: los 4 módulos en 4 columnas. El actual va resaltado y abre su módulo de trabajo;
 * los demás abren su home en una pestaña nueva. Sin permiso: candado y "No autorizado".
 */
export function AccesosModulos({ sesion, actual }: { sesion: Sesion | null; actual: ModuloPlanta }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold uppercase text-[#ff5252]">Accesos rápidos</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MODULOS_PLANTA.map((m) => {
          const esActual = m.id === actual;
          const permitido = !!sesion && puedeVer(sesion, m.home);
          return (
            <button
              key={m.id}
              type="button"
              disabled={!permitido}
              onClick={() => abrirPestana(esActual ? m.trabajo : m.home)}
              title={permitido ? "Se abre en una pestaña nueva" : "No autorizado - acceso denegado"}
              className={cn(
                "group relative flex min-h-[170px] flex-col items-center justify-center gap-3 rounded-xl border bg-[#141414] px-4 py-6 transition",
                permitido ? "border-[#2a2a2a] hover:border-[#d50000]" : "cursor-not-allowed border-[#2a2a2a] opacity-50"
              )}
            >
              <span
                className={
                  esActual
                    ? "flex h-20 w-20 items-center justify-center rounded-full bg-[#d50000] text-white"
                    : "flex h-20 w-20 items-center justify-center text-[#d50000] transition group-hover:scale-105"
                }
              >
                {permitido ? m.icono(esActual) : <Lock size={44} strokeWidth={1.6} />}
              </span>
              <span className={esActual ? "rounded-lg bg-[#2563eb]/25 px-3 py-0.5 text-2xl font-bold text-white" : "text-2xl font-bold text-white"}>{m.titulo}</span>
              {!permitido && <span className="text-[12px] font-semibold text-[#ff8a80]">No autorizado - acceso denegado</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export interface ItemLateral {
  clave: string;
  titulo: string;
  detalle: string;
  href: string;
}

function Bloque({ titulo, icono, items, vacio }: { titulo: string; icono: ReactNode; items: ItemLateral[]; vacio: string }) {
  return <ErpAlertList titulo={titulo} icono={icono} items={items} vacio={vacio} max={5} />;
}

const PESTANAS_PANEL = [
  { id: "notificaciones", label: "Notificaciones" },
  { id: "alertas", label: "Alertas" },
  { id: "recordatorios", label: "Recordatorios" },
  { id: "chat", label: "Chat" },
  { id: "reunion", label: "Reunión grupal" },
] as const;

/**
 * Panel derecho de las homes (diseños de Williams): pestañas Notificaciones · Alertas · Recordatorios · Chat ·
 * Reunión grupal; cada pestaña lleva a su sección. `notifs`: avisos de la campana; las de stock van a Alertas.
 */
export function PanelLateral({
  sesion,
  modulo,
  notifs,
  alertas = [],
  recordatorios,
}: {
  sesion: Sesion | null;
  modulo: string;
  notifs: Notificacion[];
  alertas?: ItemLateral[];
  recordatorios: ItemLateral[];
}) {
  const [activa, setActiva] = useState<string>("notificaciones");
  const ir = (id: string) => {
    setActiva(id);
    document.getElementById(`panel-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Panel className="space-y-5 xl:sticky xl:top-20">
      <nav aria-label="Secciones del panel" className="flex flex-wrap gap-1.5">
        {PESTANAS_PANEL.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => ir(p.id)}
            aria-current={activa === p.id ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-bold uppercase transition",
              activa === p.id ? "bg-[#d50000] text-white" : "bg-[#2a2a2a] text-[#d4d4d8] hover:bg-[#3a3a3a] hover:text-white"
            )}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div id="panel-notificaciones" className="scroll-mt-24">
        <Bloque titulo="Notificaciones" icono={<Bell size={15} />} items={notifs.filter((n) => n.tipo !== "stock")} vacio="Sin notificaciones nuevas." />
      </div>
      <div id="panel-alertas" className="scroll-mt-24">
        <Bloque titulo="Alertas" icono={<AlertTriangle size={15} />} items={[...notifs.filter((n) => n.tipo === "stock"), ...alertas]} vacio="Sin alertas." />
      </div>
      <div id="panel-recordatorios" className="scroll-mt-24">
        <Bloque titulo="Recordatorios" icono={<Clock size={15} />} items={recordatorios} vacio="Sin pendientes." />
      </div>
      <div id="panel-chat" className="scroll-mt-24" data-sin-guardar>
        <ChatGrupal sesion={sesion} modulo={modulo} />
      </div>
      <div id="panel-reunion" className="scroll-mt-24">
        <ReunionGrupal sesion={sesion} modulo={modulo} />
      </div>
    </Panel>
  );
}

/** Reunión grupal (Jitsi Meet): iniciar videollamada, crear sala y usuarios activos. También en el Dashboard Gerencia. */
export function ReunionGrupal({ sesion, modulo, otrasSalas = [] }: { sesion: Sesion | null; modulo: string; /** Salas de otros módulos a las que puede unirse (Gerencia). */ otrasSalas?: string[] }) {
  const conectados = usePresencia(sesion, modulo);
  const crearSala = () => {
    const nombre = window.prompt("Nombre de la sala (ej. Reunión Producción 15:00):", `${modulo} ${new Date().toLocaleDateString("es-PE")}`);
    if (nombre?.trim()) abrirPestana(urlSala(nombre));
  };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase text-[#ff5252]">
        <Video size={15} /> Reunión grupal
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => abrirPestana(urlSala(`Planta ${modulo}`))} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#d50000] px-2 py-2 text-[13px] font-semibold text-white hover:bg-[#b00000]">
          <Video size={15} /> Iniciar videollamada
        </button>
        <button type="button" onClick={crearSala} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] px-2 py-2 text-[13px] font-semibold text-white hover:border-[#d50000]">
          <Plus size={15} /> Crear sala
        </button>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#a1a1aa]">
        <span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden />
        <Users size={13} /> Usuarios activos: {conectados.length}
      </p>
      {conectados.length > 0 && <p className="mt-1 text-[11px] text-[#71717a]">{conectados.map((c) => c.usuario).join(" · ")}</p>}
      {otrasSalas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {otrasSalas.map((m) => (
            <button key={m} type="button" onClick={() => abrirPestana(urlSala(`Planta ${m}`))} className="inline-flex items-center gap-1.5 rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:border-[#d50000]">
              <Video size={13} /> Unirse a {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Fila {
  clave: string;
  titulo: string;
  detalle?: string;
  derecha?: ReactNode;
  href?: string;
}

/** Lista de filas clicables (abren en pestaña nueva): ErpAlertList del layout global. */
export function Filas({ items, vacio, max = 8 }: { items: Fila[]; vacio: string; max?: number }) {
  return <ErpAlertList items={items} vacio={vacio} max={max} />;
}

/** Monto corto para los KPI: S/130k, S/1.2M. */
export const montoCorto = (n: number): string =>
  Math.abs(n) >= 1_000_000
    ? `S/${(n / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}M`
    : Math.abs(n) >= 1000
      ? `S/${Math.round(n / 1000)}k`
      : `S/${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

export const horaActual = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Chat grupal en vivo (tabla chat_mensajes). Si aún no se corrió el SQL, lo indica. */
export function ChatGrupal({ sesion, modulo }: { sesion: Sesion | null; modulo: string }) {
  const { mensajes, enviar, faltaTabla } = useChat(sesion, modulo);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);
  const mandar = async (e: FormEvent) => {
    e.preventDefault();
    const err = await enviar(texto);
    setError(err ?? "");
    if (!err) setTexto("");
  };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase text-[#ff5252]">
        <MessageSquare size={15} /> Chat grupal
      </p>
      {faltaTabla ? (
        <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-[12px] italic text-[#a1a1aa]">Falta activar el chat: ejecute supabase/migrations/20261104_chat_grupal.sql en Supabase.</p>
      ) : (
        <>
          <ul ref={lista} className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {mensajes.length === 0 && <li className="text-[12px] text-[#71717a]">Sin mensajes todavía.</li>}
            {mensajes.map((m) => (
              <li key={m.id} className="rounded-lg bg-[#1c1c1c] px-3 py-1.5">
                <span className="flex justify-between gap-2 text-[11px] text-[#a1a1aa]">
                  <span className="truncate font-semibold text-[#ff8a80]">
                    {m.usuario}
                    {m.modulo ? ` · ${m.modulo}` : ""}
                  </span>
                  <span>{new Date(m.creado).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </span>
                <span className="block break-words text-[13px] text-white">{m.texto}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={mandar} className="mt-2 flex gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={1000}
              placeholder="Escribir mensaje…"
              aria-label="Mensaje para el chat grupal"
              className="min-w-0 flex-1 rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] px-3 py-1.5 text-[13px] text-white placeholder:text-[#71717a] focus:border-[#d50000] focus:outline-none"
            />
            <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="rounded-lg bg-[#d50000] px-3 text-white hover:bg-[#b00000] disabled:opacity-50">
              <Send size={15} />
            </button>
          </form>
          {error && <p className="mt-1 text-[11px] text-[#fca5a5]">{error}</p>}
        </>
      )}
    </div>
  );
}

/** Tiempos reales y costo: costo de MP de cada OP en fabricación (vales × último costo). Las horas por estación aún no se registran. */
export function TiemposCosto() {
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const filas = useMemo(() => {
    const costoDe = new Map(stock.map((s) => [s.id, s.costoUnit || 0]));
    return ops
      .filter((o) => o.estado === "EN_FABRICACION")
      .map((o) => ({ o, costo: r2(consumosDeChasis(o.codigo_chasis, o.id, vales).reduce((a, v) => a + v.cantidad * (costoDe.get(v.stock_id) ?? 0), 0)) }));
  }, [ops, vales, stock]);
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase text-[#ff5252]">
        <Timer size={15} /> Tiempos reales y costo
      </p>
      {filas.length === 0 ? (
        <p className="text-[12px] text-[#71717a]">Sin órdenes de producción en fabricación.</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.slice(0, 4).map(({ o, costo }) => (
            <li key={o.id} className="flex justify-between gap-2 rounded-lg bg-[#1c1c1c] px-3 py-2 text-[12px]">
              <span className="truncate text-white">
                {o.id} · {o.tipo_equipo}
              </span>
              <span className="whitespace-nowrap font-semibold text-[#ff8a80]">MP {soles(costo)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] italic text-[#71717a]">Horas de Plasma, Torno y Soldadura: sin registro en el ERP.</p>
    </div>
  );
}
