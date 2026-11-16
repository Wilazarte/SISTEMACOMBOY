"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, Download, FileText, MessageSquare, Paperclip, Pin, PinOff, Send, Users, Video, X } from "lucide-react";
import type { Sesion } from "@/lib/auth";
import { MAX_ADJUNTO, esAudio, esImagen, esVideo, tamanoLegible, useChatGlobal, type MensajeChat } from "@/lib/chat";
import { usePresencia } from "@/lib/presencia";

/** Evento para abrir la barra del chat desde cualquier pantalla: window.dispatchEvent(new Event(EV_ABRIR_CHAT)). */
export const EV_ABRIR_CHAT = "erp:abrir-chat";
export const ANCHO_CHAT = "lg:pl-[360px]";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
const dia = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long" });
};
/** Color fijo por persona (como en los grupos de WhatsApp). */
const COLORES = ["#7dd3fc", "#fda4af", "#86efac", "#fcd34d", "#c4b5fd", "#67e8f9", "#fdba74", "#f9a8d4"];
const colorDe = (u: string) => COLORES[[...u].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];

/**
 * Chat grupal único de la empresa (pedido de Williams 2026-11-16): barra fija a la derecha en todos los módulos y
 * en Secocha, plegable. Texto, documentos y multimedia, mensajes fijados, videollamada (Jitsi Meet) y parpadeo
 * cuando hay mensajes sin leer. En celular es un botón flotante que abre el chat a pantalla completa.
 */
export function ChatGlobal({ sesion, modulo, abierto, setAbierto }: { sesion: Sesion; modulo: string; abierto: boolean; setAbierto: (v: boolean) => void }) {
  const { mensajes, faltaTabla, urls, leidoHasta, sinLeer, enviar, llamar, fijar, marcarLeido } = useChatGlobal(sesion, modulo);
  const conectados = usePresencia(sesion, modulo, "erp-chat-presencia");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [verFijados, setVerFijados] = useState(false);
  const [abajo, setAbajo] = useState(true);
  const [visible, setVisible] = useState(true);
  const [movil, setMovil] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const corteSinLeer = useRef<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const f = () => setMovil(mq.matches);
    f();
    mq.addEventListener("change", f);
    const vis = () => setVisible(document.visibilityState === "visible");
    vis();
    document.addEventListener("visibilitychange", vis);
    const abrir = () => setAbierto(true);
    window.addEventListener(EV_ABRIR_CHAT, abrir);
    return () => {
      mq.removeEventListener("change", f);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener(EV_ABRIR_CHAT, abrir);
    };
  }, [setAbierto]);

  // Al abrir: recuerda dónde empezaban los no leídos (línea "N mensajes sin leer") y baja al final
  useEffect(() => {
    if (!abierto) {
      corteSinLeer.current = null;
      return;
    }
    requestAnimationFrame(() => lista.current?.scrollTo({ top: lista.current.scrollHeight }));
  }, [abierto]);
  // La línea "N mensajes sin leer" se fija con la lectura que había al abrir (no se mueve al marcar leído)
  useEffect(() => {
    if (abierto && corteSinLeer.current === null && leidoHasta) corteSinLeer.current = leidoHasta;
  }, [abierto, leidoHasta]);
  const bajarSiAbajo = () => {
    if (abajo) lista.current?.scrollTo({ top: lista.current.scrollHeight });
  };

  const ultimo = mensajes[mensajes.length - 1];
  // Mensaje nuevo: baja solo si ya estaba abajo (o si lo escribí yo)
  useEffect(() => {
    if (!abierto || !ultimo) return;
    if (abajo || ultimo.usuario === sesion.usuario) requestAnimationFrame(() => lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimo?.id, abierto]);

  // Leído: chat abierto, pestaña visible y lista abajo
  useEffect(() => {
    if (abierto && visible && abajo && ultimo && sinLeer > 0) void marcarLeido(ultimo.creado);
  }, [abierto, visible, abajo, ultimo, sinLeer, marcarLeido]);

  // Título de la pestaña del navegador parpadea con los no leídos (como WhatsApp Web)
  useEffect(() => {
    if (!sinLeer) return;
    const base = document.title.replace(/^\(\d+\) /, "");
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `(${sinLeer}) ${base}` : base;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = base;
    };
  }, [sinLeer]);

  const fijados = useMemo(() => mensajes.filter((m) => m.fijado).sort((a, b) => (b.fijado_en ?? "").localeCompare(a.fijado_en ?? "")), [mensajes]);

  const mandar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (enviando || (!texto.trim() && !archivo)) return;
    setEnviando(true);
    const err = await enviar(texto, archivo);
    setEnviando(false);
    setError(err ?? "");
    if (!err) {
      setTexto("");
      setArchivo(null);
    }
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void mandar();
    }
  };
  const elegir = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_ADJUNTO) return setError("El archivo pasa de 50 MB.");
    setError("");
    setArchivo(f);
  };
  const videollamada = async () => {
    // Se abre antes del await para que el navegador no bloquee la ventana emergente
    const w = window.open("about:blank", "_blank");
    if (w) w.opener = null;
    const { url, error: err } = await llamar();
    if (w) w.location.href = url;
    else window.open(url, "_blank", "noopener");
    if (err) setError(err);
  };
  const irA = (id: string) => {
    setVerFijados(false);
    const el = document.getElementById(`chat-msg-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("chat-resaltado");
    setTimeout(() => el?.classList.remove("chat-resaltado"), 1600);
  };
  const cambiarFijado = async (m: MensajeChat) => {
    const err = await fijar(m.id, !m.fijado);
    if (err) setError(err);
  };

  // ── Plegado: pestaña vertical (PC) o botón flotante (celular); parpadea con mensajes sin leer
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={sinLeer ? `Abrir chat grupal: ${sinLeer} mensajes sin leer` : "Abrir chat grupal"}
        title="Chat grupal COMBOY VID"
        className={`chat-barra fixed z-30 flex items-center justify-center gap-2 text-white shadow-2xl print:hidden ${
          movil ? "bottom-20 left-4 h-14 w-14 rounded-full" : "left-0 top-1/2 h-auto w-11 -translate-y-1/2 flex-col rounded-r-xl border border-l-0 px-1 py-4"
        } ${sinLeer ? "chat-parpadeo border-white/40 bg-[#e0001b]" : "border-white/[0.15] bg-[#9b0016] hover:bg-[#c4001c]"}`}
      >
        <MessageSquare size={movil ? 24 : 19} />
        {!movil && <span className="text-[11px] font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl] rotate-180">Chat grupal</span>}
        {sinLeer > 0 && (
          <span className={`${movil ? "absolute -right-1 -top-1" : ""} min-w-[22px] rounded-full bg-white px-1.5 text-center text-[11px] font-bold leading-[22px] text-[#ff2a5f]`}>{sinLeer > 99 ? "99+" : sinLeer}</span>
        )}
      </button>
    );
  }

  let diaPrevio = "";
  let lineaSinLeer = false;
  const corte = corteSinLeer.current ? Date.parse(corteSinLeer.current) : NaN;
  const nuevosAlAbrir = Number.isNaN(corte) ? 0 : mensajes.filter((m) => Date.parse(m.creado) > corte && m.usuario !== sesion.usuario).length;

  return (
    <aside
      aria-label="Chat grupal"
      data-sin-guardar
      className={`chat-barra chat-rojo fixed z-30 flex flex-col border-white/[0.12] print:hidden ${
        movil ? "inset-0 z-[75]" : "bottom-0 left-0 top-16 w-[360px] border-r"
      }`}
    >
      {/* Encabezado */}
      <header className="flex items-center gap-2 border-b border-white/[0.12] bg-black/25 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#c4001c]">
          <MessageSquare size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-white">Chat COMBOY VID</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-[#fecdd3]" title={conectados.map((c) => `${c.nombre || c.usuario} (${c.modulo})`).join(", ")}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden />
            <Users size={11} /> {conectados.length} en línea · toda la empresa
          </p>
        </div>
        <button type="button" onClick={videollamada} disabled={faltaTabla} title="Iniciar videollamada del grupo" aria-label="Iniciar videollamada" className="rounded-lg p-2 text-white hover:bg-white/[0.12] disabled:opacity-40">
          <Video size={19} />
        </button>
        <button type="button" onClick={() => setVerFijados((v) => !v)} title="Mensajes fijados" aria-label="Mensajes fijados" aria-pressed={verFijados} className={`relative rounded-lg p-2 hover:bg-white/[0.06] ${verFijados ? "text-[#00f2fe]" : "text-[#d4d4d8]"}`}>
          <Pin size={17} />
          {fijados.length > 0 && <span className="absolute right-0.5 top-0.5 rounded-full bg-[#0066ff] px-1 text-[9px] font-bold leading-[14px] text-white">{fijados.length}</span>}
        </button>
        <button type="button" onClick={() => setAbierto(false)} title="Ocultar chat" aria-label="Ocultar chat" className="rounded-lg p-2 text-[#d4d4d8] hover:bg-white/[0.06]">
          {movil ? <X size={19} /> : <ChevronLeft size={19} />}
        </button>
      </header>

      {/* Último fijado (como WhatsApp) */}
      {fijados.length > 0 && !verFijados && (
        <button type="button" onClick={() => irA(fijados[0].id)} className="flex items-center gap-2 border-b border-white/[0.12] bg-black/20 px-3 py-2 text-left hover:bg-black/30">
          <Pin size={14} className="shrink-0 text-[#fde68a]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-[#fde68a]">Fijado{fijados.length > 1 ? ` · 1 de ${fijados.length}` : ""}</span>
            <span className="block truncate text-[12px] text-[#e4e4e7]">{resumen(fijados[0])}</span>
          </span>
        </button>
      )}

      {verFijados ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#a1a1aa]">Mensajes fijados ({fijados.length})</p>
          {fijados.length === 0 && <p className="text-[12px] text-[#fecdd3]">No hay mensajes fijados. Pase el mouse sobre un mensaje y toque el pin.</p>}
          {fijados.map((m) => (
            <div key={m.id} className="rounded-lg border border-white/[0.12] bg-black/30 p-2.5">
              <button type="button" onClick={() => irA(m.id)} className="block w-full text-left">
                <span className="block text-[11px] font-semibold" style={{ color: colorDe(m.usuario) }}>
                  {m.nombre || m.usuario} · {dia(m.creado)} {hora(m.creado)}
                </span>
                <span className="mt-0.5 block break-words text-[13px] text-white">{resumen(m)}</span>
              </button>
              <span className="mt-1 flex items-center justify-between text-[10px] text-[#71717a]">
                <span>Fijado por {m.fijado_por || "—"}</span>
                <button type="button" onClick={() => cambiarFijado(m)} className="inline-flex items-center gap-1 text-[#fca5a5] hover:underline">
                  <PinOff size={11} /> Desfijar
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={lista}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAbajo(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
          }}
          className="chat-fondo relative min-h-0 flex-1 overflow-y-auto px-3 py-2"
        >
          {faltaTabla && (
            <p className="my-2 rounded-lg bg-white/[0.05] px-3 py-2 text-[12px] italic text-[#a1a1aa]">Falta activar el chat: ejecute supabase/migrations/20261128_chat_global.sql en Supabase.</p>
          )}
          {!faltaTabla && mensajes.length === 0 && <p className="my-6 text-center text-[12px] text-[#a1a1aa]">Sin mensajes todavía. Escriba el primero.</p>}
          {mensajes.map((m) => {
            const d = dia(m.creado);
            const sepDia = d !== diaPrevio;
            diaPrevio = d;
            const mio = m.usuario === sesion.usuario;
            const sepNuevo = !lineaSinLeer && nuevosAlAbrir > 0 && !mio && Date.parse(m.creado) > corte;
            if (sepNuevo) lineaSinLeer = true;
            return (
              <div key={m.id}>
                {sepDia && (
                  <p className="my-2 text-center">
                    <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a1a1aa]">{d}</span>
                  </p>
                )}
                {sepNuevo && (
                  <p className="my-2 text-center">
                    <span className="rounded-full bg-white px-3 py-0.5 text-[11px] font-bold text-[#c4001c]">
                      {nuevosAlAbrir} {nuevosAlAbrir === 1 ? "mensaje sin leer" : "mensajes sin leer"}
                    </span>
                  </p>
                )}
                <Burbuja m={m} mio={mio} url={m.adjunto_path ? urls[m.adjunto_path] : undefined} onFijar={() => cambiarFijado(m)} onCarga={bajarSiAbajo} />
              </div>
            );
          })}
        </div>
      )}

      {!abajo && !verFijados && (
        <button
          type="button"
          onClick={() => lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" })}
          className={`absolute bottom-24 right-4 flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg ${sinLeer ? "chat-parpadeo bg-white !text-[#c4001c]" : "bg-black/50"}`}
        >
          <ChevronDown size={14} /> {sinLeer ? `${sinLeer} nuevos` : "Bajar"}
        </button>
      )}

      {/* Redactar */}
      <form onSubmit={mandar} className="border-t border-white/[0.12] bg-black/25 p-2.5">
        {archivo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white">
            <FileText size={15} className="shrink-0 text-[#7dd3fc]" />
            <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
            <span className="text-[#a1a1aa]">{tamanoLegible(archivo.size)}</span>
            <button type="button" onClick={() => setArchivo(null)} aria-label="Quitar archivo" className="text-[#a1a1aa] hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input ref={inputArchivo} type="file" hidden onChange={(e) => (elegir(e.target.files?.[0]), (e.target.value = ""))} />
          <button type="button" onClick={() => inputArchivo.current?.click()} disabled={faltaTabla} title="Adjuntar documento, foto, video o audio" aria-label="Adjuntar archivo" className="rounded-lg p-2 text-[#d4d4d8] hover:bg-white/[0.06] hover:text-white disabled:opacity-40">
            <Paperclip size={18} />
          </button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={tecla}
            onPaste={(e) => elegir(e.clipboardData.files?.[0])}
            rows={1}
            maxLength={2000}
            disabled={faltaTabla}
            placeholder={archivo ? "Agregar un comentario…" : "Escriba un mensaje"}
            aria-label="Mensaje para el chat grupal"
            className="max-h-32 min-h-[38px] min-w-0 flex-1 resize-none rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-[13px] text-white placeholder:text-[#fca5a5]/70 focus:border-white focus:outline-none"
          />
          <button type="submit" disabled={enviando || (!texto.trim() && !archivo)} aria-label="Enviar" className="rounded-full bg-white p-2.5 text-[#c4001c] disabled:opacity-50">
            <Send size={16} />
          </button>
        </div>
        {error && <p className="mt-1 text-[11px] text-[#fca5a5]">{error}</p>}
      </form>
    </aside>
  );
}

function resumen(m: MensajeChat): string {
  if (m.tipo === "llamada") return "📹 Videollamada";
  if (m.adjunto_path) return `${esImagen(m) ? "📷" : esVideo(m) ? "🎬" : esAudio(m) ? "🎵" : "📄"} ${m.texto || m.adjunto_nombre || "Archivo"}`;
  return m.texto;
}

function Burbuja({ m, mio, url, onFijar, onCarga }: { m: MensajeChat; mio: boolean; url?: string; onFijar: () => void; onCarga: () => void }) {
  return (
    <div id={`chat-msg-${m.id}`} className={`group my-1 flex ${mio ? "justify-end" : "justify-start"} rounded-lg transition-colors`}>
      <div className={`relative max-w-[85%] rounded-xl px-2.5 py-1.5 shadow ${mio ? "rounded-tr-sm bg-[#0b4fb3]/80" : "rounded-tl-sm bg-black/40"} ${m.fijado ? "ring-1 ring-[#fde68a]/70" : ""}`}>
        {!mio && (
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[12px] font-semibold" style={{ color: colorDe(m.usuario) }}>
              {m.nombre || m.usuario}
            </span>
            {m.modulo && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[#71717a]">{m.modulo}</span>}
          </span>
        )}
        {m.tipo === "llamada" ? (
          <span className="my-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#22c55e]/20 text-[#4ade80]">
              <Video size={16} />
            </span>
            <span className="text-[13px] text-white">
              Videollamada del grupo
              <a href={m.texto} target="_blank" rel="noopener noreferrer" className="mt-0.5 block w-fit rounded-md bg-[#22c55e] px-2.5 py-0.5 text-[12px] font-bold text-white hover:bg-[#16a34a]">
                Unirse
              </a>
            </span>
          </span>
        ) : (
          <>
            {m.adjunto_path && <Adjunto m={m} url={url} onCarga={onCarga} />}
            {m.texto && <span className="block whitespace-pre-wrap break-words text-[13px] leading-snug text-white">{m.texto}</span>}
          </>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#a1a1aa]">
          {m.fijado && <Pin size={10} className="text-[#fde68a]" aria-label="Fijado" />}
          {hora(m.creado)}
        </span>
        <button
          type="button"
          onClick={onFijar}
          title={m.fijado ? "Desfijar" : "Fijar mensaje"}
          aria-label={m.fijado ? "Desfijar mensaje" : "Fijar mensaje"}
          className={`absolute top-1 ${mio ? "-left-7" : "-right-7"} rounded-md p-1 text-[#a1a1aa] opacity-60 hover:bg-white/[0.08] hover:text-[#00f2fe] focus:opacity-100 lg:opacity-0 lg:group-hover:opacity-100`}
        >
          {m.fijado ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
      </div>
    </div>
  );
}

function Adjunto({ m, url, onCarga }: { m: MensajeChat; url?: string; onCarga: () => void }) {
  if (!url) return <span className="my-1 block h-10 w-40 animate-pulse rounded-lg bg-white/[0.06]" aria-label="Cargando archivo" />;
  if (esImagen(m))
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="my-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={m.adjunto_nombre ?? "Imagen"} className="max-h-60 w-full rounded-lg object-cover" onLoad={onCarga} />
      </a>
    );
  if (esVideo(m)) return <video src={url} controls preload="metadata" onLoadedMetadata={onCarga} className="my-1 max-h-60 w-full rounded-lg" />;
  if (esAudio(m)) return <audio src={url} controls preload="metadata" className="my-1 w-56 max-w-full" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" download={m.adjunto_nombre ?? undefined} className="my-1 flex items-center gap-2 rounded-lg bg-black/25 px-2.5 py-2 hover:bg-black/40">
      <FileText size={22} className="shrink-0 text-[#7dd3fc]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-white">{m.adjunto_nombre}</span>
        <span className="block text-[10px] uppercase text-[#a1a1aa]">
          {(m.adjunto_nombre?.split(".").pop() ?? "").slice(0, 5)} · {tamanoLegible(m.adjunto_bytes)}
        </span>
      </span>
      <Download size={15} className="shrink-0 text-[#d4d4d8]" />
    </a>
  );
}
