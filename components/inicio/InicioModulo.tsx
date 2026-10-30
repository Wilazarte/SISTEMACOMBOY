"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, FolderOpen, LayoutGrid, MessageSquare, Send, Video } from "lucide-react";
import { useSesion, type Sesion } from "@/lib/auth";
import { useChat } from "@/lib/chat";
import { recargarExpedientes, useExpedientes } from "@/lib/expedientes";
import { SALA_MODULO, TITULO_INICIO, accionesPermitidas, urlBoton, type AccionInicio, type ModuloInicio } from "@/lib/inicioModulos";
import { urlSala } from "@/lib/presencia";
import { recargarDatos, type StoreKey, KEYS } from "@/lib/storage";
import { AccesosModulos, type ModuloPlanta } from "@/components/logistica/planta";
import { isAdmin, permisosPlanta } from "@/lib/permisosPlanta";
import { HOOK_KPIS, type KpiInicio } from "./kpis";

// INICIO de cada módulo (ERP v3.0): encabezado INICIO [MÓDULO] + código 26W, 4 KPIs reales, a la izquierda (30 %)
// el chat del grupo del módulo y a la derecha (70 %) un botón por cada función. Sin menús: todo abre en pestaña nueva.
// Colores del pedido de Williams (2026-10-30): fondo #0e1219, tarjetas #2a3445, botones #2a7bff, texto blanco.

/** Abre una pantalla del ERP en una pestaña nueva (sin noopener: la pestaña avisa a INICIO al guardar). */
export const abrirEnPestana = (href: string) => {
  window.open(href, "_blank");
};

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

  const grupos = useMemo(() => {
    const m = new Map<string, AccionInicio[]>();
    acciones.forEach((a) => m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]));
    return [...m.entries()];
  }, [acciones]);

  return (
    <div className="w-full space-y-5 text-white">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2a3445] bg-[#1a212e] px-5 py-4">
        <div>
          <h1 className="text-3xl font-bold uppercase leading-tight lg:text-4xl">
            INICIO {TITULO_INICIO[modulo]}
            {docValido && <span className="ml-3 align-middle text-2xl text-[#60a5fa] lg:text-3xl">{docValido}</span>}
          </h1>
          <p className="text-[13px] text-[#d4d4d8]">Cada botón abre su pantalla en una pestaña nueva.</p>
        </div>
        {!exp.faltaTabla && abiertos.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[#d4d4d8]">
            <FolderOpen size={16} className="text-[#2a7bff]" /> Expediente
            <select value={docValido} onChange={(e) => elegirDoc(e.target.value)} className="rounded-lg border border-[#2a3445] bg-[#0e1219] px-3 py-1.5 text-[14px] text-white">
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

      <FilaKpis key={modulo} modulo={modulo} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <ChatModulo sesion={sesion} modulo={modulo} todos={modulo === "soporte" && isAdmin(sesion)} />

        <section className="space-y-4 rounded-xl border border-[#2a3445] bg-[#1a212e] p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-wide text-[#60a5fa]">
            <LayoutGrid size={17} /> Acciones rápidas
          </h2>
          {grupos.length === 0 && <p className="text-[13px] text-[#a1a1aa]">Su usuario no tiene funciones habilitadas en este módulo.</p>}
          {grupos.map(([grupo, lista]) => (
            <div key={grupo}>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#a1a1aa]">{grupo}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map((a) => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => abrirEnPestana(urlBoton(modulo, a, docValido || undefined))}
                    title="Se abre en una pestaña nueva"
                    className="group flex min-h-[56px] items-center justify-between gap-2 rounded-lg bg-[#2a7bff] px-3 py-2.5 text-left text-[14px] font-bold leading-snug text-white transition hover:bg-[#1e64e6]"
                  >
                    <span>{a.label}</span>
                    <ArrowUpRight size={16} className="shrink-0 opacity-70 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#a1a1aa]">Reunión grupal</p>
            <button
              type="button"
              onClick={() => window.open(urlSala(`Planta ${SALA_MODULO[modulo]}`), "_blank", "noopener")}
              className="inline-flex min-h-[56px] items-center gap-2 rounded-lg border border-[#2a7bff] px-4 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#2a7bff]/15"
            >
              <Video size={17} /> Iniciar videollamada {SALA_MODULO[modulo]}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function FilaKpis({ modulo }: { modulo: ModuloInicio }) {
  const useKpis = HOOK_KPIS[modulo];
  const kpis = useKpis(true);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <TarjetaKpi key={k.titulo} k={k} />
      ))}
    </div>
  );
}

function TarjetaKpi({ k }: { k: KpiInicio }) {
  return (
    <button type="button" onClick={() => abrirEnPestana(k.href)} className="rounded-xl border border-[#2a3445] bg-[#1a212e] px-4 py-4 text-left transition hover:border-[#2a7bff]">
      <span className="block text-[13px] font-semibold uppercase tracking-wide text-[#d4d4d8]">{k.titulo}</span>
      <span className="mt-1 block text-3xl font-bold text-white">{k.valor}</span>
      <span className={`mt-1 block truncate text-[12px] font-semibold ${k.alerta ? "text-[#60a5fa]" : "text-[#4ade80]"}`}>{k.detalle}</span>
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
    <section className="flex min-h-[420px] flex-col rounded-xl border border-[#2a3445] bg-[#1a212e] p-4" data-sin-guardar>
      <h2 className="mb-3 flex items-center justify-between gap-2 text-[15px] font-bold uppercase tracking-wide text-[#60a5fa]">
        <span className="flex items-center gap-2">
          <MessageSquare size={17} /> Mensajes del grupo {sala}
        </span>
        {sinLeer > 0 && <span className="rounded-full bg-[#2a7bff] px-2 py-0.5 text-[11px] text-white">{sinLeer} sin leer</span>}
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
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${s === sala ? "border-[#2a7bff] bg-[#2a7bff] text-white" : "border-[#2a3445] bg-[#0e1219] text-[#d4d4d8] hover:border-[#2a7bff] hover:text-white"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {faltaTabla ? (
        <p className="rounded-lg bg-[#0e1219] px-3 py-2 text-[12px] italic text-[#a1a1aa]">Falta activar el chat: ejecute supabase/migrations/20261104_chat_grupal.sql en Supabase.</p>
      ) : (
        <>
          <ul ref={lista} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 lg:max-h-[520px]">
            {mensajes.length === 0 && <li className="text-[12px] text-[#a1a1aa]">Sin mensajes todavía.</li>}
            {mensajes.map((m) => (
              <li key={m.id} className={`rounded-lg px-3 py-1.5 ${leido && m.creado > leido && m.usuario !== sesion?.usuario ? "border border-[#2a7bff]/60 bg-[#0e1219]" : "bg-[#0e1219]"}`}>
                <span className="flex justify-between gap-2 text-[11px] text-[#a1a1aa]">
                  <span className="truncate font-semibold text-[#93c5fd]">{m.nombre || m.usuario}</span>
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
              className="min-w-0 flex-1 rounded-lg border border-[#2a3445] bg-[#0e1219] px-3 py-2 text-[13px] text-white placeholder:text-[#71717a] focus:border-[#2a7bff] focus:outline-none"
            />
            <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="rounded-lg bg-[#2a7bff] px-3 text-white hover:bg-[#1e64e6] disabled:opacity-50">
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
