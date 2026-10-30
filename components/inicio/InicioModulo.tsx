"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BadgeCheck, Boxes, ChevronRight, ClipboardList, FilePlus, FileSearch, FolderOpen, Landmark, LayoutGrid, MessageSquare, PackageCheck, Send, Truck, Video, type LucideIcon } from "lucide-react";
import { useSesion, type Sesion } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import { recargarExpedientes, useExpedientes } from "@/lib/expedientes";
import { GRUPO_EXPEDIENTE, SALA_MODULO, TITULO_INICIO, accionesPermitidas, fasePrincipal, fasesFlujo, urlBoton, type AccionInicio, type ModuloInicio } from "@/lib/inicioModulos";
import { irA } from "@/lib/navegacion";
import { urlSala } from "@/lib/presencia";
import { recargarDatos, type StoreKey, KEYS } from "@/lib/storage";
import { AccesosModulos, type ModuloPlanta } from "@/components/logistica/planta";
import { isAdmin, permisosPlanta } from "@/lib/permisosPlanta";
import { HOOK_KPIS, type KpiInicio } from "./kpis";
import { NotificacionesEnVivo } from "./NotificacionesEnVivo";

// INICIO de cada módulo (ERP v3.0, rediseño de Williams 2026-10-30): encabezado INICIO [MÓDULO] + código 26W; a la
// izquierda (3/12) 4 KPIs reales, notificaciones en vivo y el chat del grupo; a la derecha (9/12) las acciones: el flujo
// 26W en orden (Fase 1 → 8, la fase propia en naranja #FF6D00) y debajo los demás grupos en columnas. Sin mapa de fondo.
// Todo abre en la misma ventana.

/** Abre una pantalla del ERP en la misma ventana (Atrás vuelve al INICIO). Nombre antiguo: antes abría pestaña nueva. */
export const abrirEnPestana = (href: string) => irA(href);

const CLAVE_DOC = "erp-inicio-doc";

/** Datos que se vuelven a pedir a Supabase cuando una pestaña guarda y avisa (postMessage reload). */
const RECARGAR: StoreKey[] = [KEYS.ORDENES, KEYS.FACTURAS, KEYS.COTIZACIONES, KEYS.STOCK, KEYS.PRODUCCION, KEYS.DESPACHOS, KEYS.NOTAS_PEDIDO, KEYS.COMPROBANTES];

export function InicioModulo({ modulo }: { modulo: ModuloInicio }) {
  const { sesion } = useSesion();
  const acciones = useMemo(() => accionesPermitidas(sesion, modulo), [sesion, modulo]);
  const exp = useExpedientes(modulo !== "soporte" || acciones.some((a) => a.destino.startsWith("/erp")));
  const abiertos = exp.expedientes.filter((x) => x.estado === "ABIERTO").sort((a, b) => b.codigo_expediente.localeCompare(a.codigo_expediente));
  const [doc, setDoc] = useState("");

  // Código 26W elegido: se recuerda por navegador
  useEffect(() => {
    try {
      setDoc(window.localStorage.getItem(`${CLAVE_DOC}:${modulo}`) ?? "");
    } catch {
      /* almacenamiento bloqueado */
    }
  }, [modulo]);
  const elegirDoc = (v: string) => {
    setDoc(v);
    try {
      window.localStorage.setItem(`${CLAVE_DOC}:${modulo}`, v);
    } catch {
      /* almacenamiento bloqueado */
    }
  };
  const docValido = abiertos.some((x) => x.codigo_expediente === doc) ? doc : "";

  // Una pestaña guardó (Guardar y Cerrar): se recargan los datos del INICIO
  useEffect(() => {
    const oir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string } | null)?.type !== "reload") return;
      void recargarDatos(...RECARGAR);
      void recargarExpedientes();
    };
    window.addEventListener("message", oir);
    return () => window.removeEventListener("message", oir);
  }, []);

  // Flujo 26W en orden (Fase 1 → 8) y, debajo, los demás grupos en columnas (Compras nacionales, Ventas, Transporte…)
  const fases = useMemo(() => (acciones.some((a) => a.grupo === GRUPO_EXPEDIENTE) ? fasesFlujo(modulo) : []), [acciones, modulo]);
  const extrasFlujo = acciones.filter((a) => a.grupo === GRUPO_EXPEDIENTE && !a.fase);
  const principal = fasePrincipal(modulo);
  const grupos = useMemo(() => {
    const m = new Map<string, AccionInicio[]>();
    acciones.filter((a) => a.grupo !== GRUPO_EXPEDIENTE).forEach((a) => m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]));
    return [...m.entries()];
  }, [acciones]);
  const abrir = (a: AccionInicio) => abrirEnPestana(urlBoton(modulo, a, docValido || undefined));

  return (
    <div className="w-full space-y-4 text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2A2D3A] bg-[#1C1E26] px-5 py-4">
        <div>
          <h1 className="text-3xl font-bold uppercase leading-tight lg:text-4xl">
            INICIO {TITULO_INICIO[modulo]}
            {docValido && <span className="ml-3 align-middle text-2xl text-[#FF6D00] lg:text-3xl">{docValido}</span>}
          </h1>
          <p className="text-[13px] text-[#9CA3AF]">Cada botón abre su pantalla aquí mismo; con Atrás vuelve al INICIO.</p>
        </div>
        {!exp.faltaTabla && abiertos.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[#D1D5DB]">
            <FolderOpen size={16} className="text-[#FF6D00]" /> Expediente
            <select value={docValido} onChange={(e) => elegirDoc(e.target.value)} className="rounded-lg border border-[#2A2D3A] bg-[#23252F] px-3 py-1.5 text-[14px] text-white">
              <option value="">Sin expediente</option>
              {abiertos.map((x) => (
                <option key={x.id} value={x.codigo_expediente}>
                  {x.codigo_expediente}
                  {x.lote ? ` · ${x.lote}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {/* Acceso rápido a los 4 módulos (solo SOPORTE): estaba en los paneles, ahora va en el INICIO */}
      {permisosPlanta(sesion).canViewOtherModules && <AccesosModulos sesion={sesion} actual={modulo === "soporte" ? undefined : (modulo as ModuloPlanta)} />}

      {/* Rediseño 2026-10-30: izquierda (3/12) KPIs, notificaciones en vivo y mensajes; derecha (9/12) acciones por flujo */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <FilaKpis key={modulo} modulo={modulo} />
          <NotificacionesEnVivo sesion={sesion} modulo={modulo} />
          <ChatModulo sesion={sesion} modulo={modulo} todos={modulo === "soporte" && isAdmin(sesion)} />
        </div>

        <section className="space-y-5 rounded-xl border border-[#2A2D3A] bg-[#1C1E26] p-5 lg:col-span-9">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <LayoutGrid size={16} /> Acciones rápidas
          </h2>
          {acciones.length === 0 && <p className="text-[13px] text-[#9CA3AF]">Su usuario no tiene funciones habilitadas en este módulo.</p>}

          {fases.length > 0 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{GRUPO_EXPEDIENTE}</p>
                {extrasFlujo.map((a) => (
                  <button key={a.slug} type="button" onClick={() => abrir(a)} className="text-[12px] font-semibold text-[#D1D5DB] underline-offset-2 hover:text-white hover:underline">
                    {a.label} →
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {fases.map((a) => {
                  const Icono = ICONO_FASE[a.fase ?? 1];
                  const esPrincipal = a.fase === principal;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      onClick={() => abrir(a)}
                      className={`flex min-h-[64px] items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug transition ${
                        esPrincipal ? "bg-[#FF6D00] font-semibold text-white hover:bg-[#E56200]" : "border border-[#3A3D4A] bg-transparent text-[#D1D5DB] hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <Icono size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {grupos.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map(([grupo, lista]) => (
                <div key={grupo}>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{grupo}</p>
                  <div className="space-y-1.5">
                    {lista.map((a) => (
                      <button
                        key={a.slug}
                        type="button"
                        onClick={() => abrir(a)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg bg-[#23252F] px-3 py-2 text-left text-[13px] text-[#E5E7EB] transition hover:bg-[#2A2D3A] hover:text-white"
                      >
                        <span>{a.label}</span>
                        <ChevronRight size={14} className="shrink-0 text-[#6B7280]" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-[#2A2D3A] pt-4">
            <button
              type="button"
              onClick={() => window.open(urlSala(`Planta ${SALA_MODULO[modulo]}`), "_blank", "noopener")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#23252F] px-4 py-2 text-[13px] text-[#E5E7EB] transition hover:bg-[#2A2D3A] hover:text-white"
            >
              <Video size={16} /> Iniciar videollamada {SALA_MODULO[modulo]}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Íconos de línea de las 8 fases del flujo 26W. */
const ICONO_FASE: Record<number, LucideIcon> = { 1: FilePlus, 2: ClipboardList, 3: Boxes, 4: FileSearch, 5: Landmark, 6: Truck, 7: PackageCheck, 8: BadgeCheck };

function FilaKpis({ modulo }: { modulo: ModuloInicio }) {
  const useKpis = HOOK_KPIS[modulo];
  const kpis = useKpis(true);
  return (
    <div className="grid grid-cols-2 gap-2">
      {kpis.map((k) => (
        <TarjetaKpi key={k.titulo} k={k} />
      ))}
    </div>
  );
}

function TarjetaKpi({ k }: { k: KpiInicio }) {
  return (
    <button type="button" onClick={() => abrirEnPestana(k.href)} className="min-w-0 rounded-xl border border-[#2A2D3A] bg-[#1C1E26] px-3 py-3 text-left transition hover:border-white/20">
      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">{k.titulo}</span>
      <span className="mt-0.5 block truncate text-xl font-bold text-white">{k.valor}</span>
      <span className={`mt-0.5 block truncate text-[11px] ${k.alerta ? "text-[#FF6D00]" : "text-[#4ade80]"}`}>{k.detalle}</span>
    </button>
  );
}

const CLAVE_LEIDO = "erp-chat-leido";

/** Mensajes del grupo del módulo (tabla chat_mensajes, columna modulo). "Sin leer": lo nuevo desde la última vez que se abrió. */
/** Grupos que SOPORTE ve en pestañas (cada modulador ve solo el de su módulo; RLS chat_leer hace lo mismo en la base). */
const SALAS_SOPORTE = [SALA_MODULO.soporte, SALA_MODULO.logistica, SALA_MODULO.almacen, SALA_MODULO.finanzas, SALA_MODULO.produccion, "Gerencia"];

function ChatModulo({ sesion, modulo, todos }: { sesion: Sesion | null; modulo: ModuloInicio; todos?: boolean }) {
  const [sala, setSala] = useState(SALA_MODULO[modulo]);
  const { mensajes, enviar, faltaTabla } = useChat(sesion, sala, true);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [leido, setLeido] = useState<string | null>(null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);

  // Última lectura (por navegador): se marca leído al abrir el INICIO y al escribir
  useEffect(() => {
    try {
      setLeido(window.localStorage.getItem(`${CLAVE_LEIDO}:${sala}`) ?? "");
    } catch {
      setLeido("");
    }
  }, [sala]);
  const ultimo = mensajes[mensajes.length - 1]?.creado;
  useEffect(() => {
    if (!ultimo || leido === null) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(`${CLAVE_LEIDO}:${sala}`, ultimo);
      } catch {
        /* almacenamiento bloqueado */
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [ultimo, leido, sala]);
  const sinLeer = leido ? mensajes.filter((m) => m.creado > leido && m.usuario !== sesion?.usuario).length : 0;

  const mandar = async (e: FormEvent) => {
    e.preventDefault();
    const err = await enviar(texto);
    setError(err ?? "");
    if (!err) setTexto("");
  };

  return (
    <section className="flex min-h-[320px] flex-col rounded-xl border border-[#2A2D3A] bg-[#1C1E26] p-4" data-sin-guardar>
      <h2 className="mb-3 flex items-center justify-between gap-2 text-[15px] font-semibold text-white">
        <span className="flex items-center gap-2">
          <MessageSquare size={17} /> Mensajes del grupo {sala}
        </span>
        {sinLeer > 0 && <span className="rounded-full bg-[#FF6D00] px-2 py-0.5 text-[11px] font-bold text-white">{sinLeer} sin leer</span>}
      </h2>
      {todos && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Grupos de chat">
          {SALAS_SOPORTE.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === sala}
              onClick={() => setSala(s)}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${s === sala ? "border-[#FF6D00] bg-[#FF6D00] text-white" : "border-[#2A2D3A] bg-[#23252F] text-[#D1D5DB] hover:border-white/20 hover:text-white"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {faltaTabla ? (
        <p className="rounded-lg bg-[#23252F] px-3 py-2 text-[12px] italic text-[#a1a1aa]">Falta activar el chat: ejecute supabase/migrations/20261104_chat_grupal.sql en Supabase.</p>
      ) : (
        <>
          <ul ref={lista} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 lg:max-h-[520px]">
            {mensajes.length === 0 && <li className="text-[12px] text-[#a1a1aa]">Sin mensajes todavía.</li>}
            {mensajes.map((m) => (
              <li key={m.id} className={`rounded-lg px-3 py-1.5 ${leido && m.creado > leido && m.usuario !== sesion?.usuario ? "border border-[#FF6D00]/60 bg-[#23252F]" : "bg-[#23252F]"}`}>
                <span className="flex justify-between gap-2 text-[11px] text-[#a1a1aa]">
                  <span className="truncate font-semibold text-[#FDBA74]">{m.nombre || m.usuario}</span>
                  <span>{new Date(m.creado).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                </span>
                <span className="block break-words text-[13px] text-white">{m.texto}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={mandar} className="mt-3 flex gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={1000}
              placeholder="Nuevo mensaje para el grupo…"
              aria-label={`Mensaje para el grupo ${sala}`}
              className="min-w-0 flex-1 rounded-lg border border-[#2A2D3A] bg-[#23252F] px-3 py-2 text-[13px] text-white placeholder:text-[#71717a] focus:border-[#FF6D00] focus:outline-none"
            />
            <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="rounded-lg bg-[#FF6D00] px-3 text-white hover:bg-[#E56200] disabled:opacity-50">
              <Send size={15} />
            </button>
          </form>
          {error && <p className="mt-1 text-[11px] text-[#fca5a5]">{error}</p>}
        </>
      )}
    </section>
  );
}

export default InicioModulo;
