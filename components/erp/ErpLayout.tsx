"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ID_BARRA_PESTANAS } from "@/components/ui";
import type { Sesion } from "@/lib/auth";
import { VERSION_LOGISTICA } from "@/lib/logistica";
import { ETIQUETA_PERFIL, esSoporteReal, inicialesDe, perfilPlanta } from "@/lib/permisosPlanta";
import { ChatGlobal, ANCHO_CHAT } from "@/components/chat/ChatGlobal";
import { ErpHeader, NOMBRE_EMPRESA } from "./ErpHeader";
import { TemaProvider } from "@/components/temas/TemaProvider";

const CLAVE_CHAT = "erp-chat-abierto";

const horaActual = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Layout global de todos los módulos (diseño de Logística Planta): fondo #0e1219 con el mapa mundial tenue,
 * ErpHeader fijo, contenido de 1600 px y pie con versión y última sincronización.
 * Tema: clases .dark .tema-planta (app/globals.css) — los colores de las páginas salen de ahí.
 */
export function ErpLayout({
  moduleName,
  sede,
  inicio,
  sesion,
  onSalir,
  extra,
  mainClassName = "",
  overlays,
  sinMapa = false,
  children,
}: {
  moduleName: string;
  /** Sede que se muestra en el pie (el sub-header la recibe ErpContenido). */
  sede: string;
  inicio?: string;
  sesion: Sesion;
  onSalir: () => void;
  /** Buscador, campana… (antes del usuario). */
  extra?: ReactNode;
  mainClassName?: string;
  /** Barras, dock, modales y avisos fijos (fuera del contenido). */
  overlays?: ReactNode;
  /** INICIO de los módulos (rediseño 2026-10-30): fondo liso #0F1115, sin el mapa mundial. */
  sinMapa?: boolean;
  children: ReactNode;
}) {
  const ruta = usePathname();
  const [sync, setSync] = useState("");
  useEffect(() => setSync(horaActual()), [ruta]);
  // Chat grupal único (barra derecha): abierto por defecto en PC, plegado en celular; se recuerda por navegador
  const [chatAbierto, setChatAbiertoState] = useState(false);
  useEffect(() => {
    let v: string | null = null;
    try {
      v = window.localStorage.getItem(CLAVE_CHAT);
    } catch {
      /* almacenamiento bloqueado */
    }
    setChatAbiertoState(v ? v === "1" : window.matchMedia("(min-width: 1024px)").matches);
  }, []);
  const setChatAbierto = useCallback((v: boolean) => {
    setChatAbiertoState(v);
    try {
      window.localStorage.setItem(CLAVE_CHAT, v ? "1" : "0");
    } catch {
      /* almacenamiento bloqueado */
    }
  }, []);
  const conChat = chatAbierto ? ANCHO_CHAT : "";
  const perfil = perfilPlanta(sesion);
  const etiqueta = perfil ? ETIQUETA_PERFIL[perfil] : undefined;
  // Usuario asignado: "JO - Jose Ortiz Arapa • ALMACEN" (perfiles.avatar_iniciales, nombre_completo, modulo_asignado)
  const nombreUsuario = sesion.nombreCompleto?.trim() || sesion.nombre || sesion.usuario;
  const iniciales = inicialesDe(nombreUsuario, sesion.iniciales);
  const moduloUsuario = etiqueta?.label ?? (sesion.moduloAsignado?.toUpperCase() || undefined);
  // Temas de color (2026-11-22): data-tema elige el juego de variables de app/themes.css (módulo > usuario > global)
  return (
    <TemaProvider moduleName={moduleName} usuario={sesion.usuario} puedeAdministrar={esSoporteReal(sesion)}>
    {(tema) => (
    <div className={"dark tema-planta tema-login relative isolate flex min-h-screen flex-col pb-32 text-fg"} data-modulo={moduleName} data-tema={tema}>
      {/* Tema GLASS (2026-11-04): negro grafito con malla abstracta (luz azul eléctrico arriba, fuego abajo). En los
          módulos el mapa mundial queda apenas visible debajo; los INICIO, solo la malla. */}
      <div aria-hidden className="fondo-login pointer-events-none fixed inset-0 z-[-1]">
        <OndasFondo />
      </div>
      {/* Marca de agua del logo COMBOY VID (Williams 2026-11-17): en todas las pantallas del ERP y Secocha; el inicio
          de sesión no usa este layout, así que no la lleva. */}
      <div aria-hidden className="marca-agua print:hidden" />

      <ErpHeader
        modulo={moduleName}
        inicio={inicio}
        iniciales={iniciales}
        usuario={`${iniciales} - ${nombreUsuario}${moduloUsuario ? ` • ${moduloUsuario}` : ""}`}
        nombre={etiqueta ? `${nombreUsuario} · ${etiqueta.titulo} (${sesion.usuario})` : nombreUsuario}
        badge={perfil ? "ASIGNADO" : undefined}
        onSalir={onSalir}
        extra={extra}
      />

      <main className={`w-full flex-1 transition-[padding] duration-300 ${conChat} ${mainClassName}`}>
        <div className="w-full px-4 pt-20 sm:px-6 lg:px-8" /* pantalla completa, sin ancho máximo (PR #73) */>{children}</div>
      </main>
      <footer className={`mt-8 flex flex-wrap items-center justify-between gap-2 glass-blur border-t border-white/[0.08] px-4 py-4 text-xs text-[#a1a1aa] sm:px-6 lg:px-8 ${chatAbierto ? "lg:pl-[376px]" : ""}`}>
        <span>
          <span className="font-semibold text-white">{NOMBRE_EMPRESA}</span> © 2025 · ERP COMBOY VID · Sede {sede} · Área Informática
        </span>
        <span>
          {VERSION_LOGISTICA} · Última sincronización: Hoy {sync}
        </span>
      </footer>
      <ChatGlobal sesion={sesion} modulo={moduleName} abierto={chatAbierto} setAbierto={setChatAbierto} />
      {overlays}
    </div>
    )}
    </TemaProvider>
  );
}

/** Ondas al pie de la pantalla con la paleta COMBOY (azul acero, vino y azul noche). */
function OndasFondo() {
  return (
    <svg viewBox="0 0 400 140" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-24 w-full md:h-40">
      <path d="M0,70 C90,20 170,120 260,70 C320,38 360,50 400,30 L400,140 L0,140 Z" style={{ fill: "var(--onda-1)" }} opacity="0.16" />
      <path d="M0,95 C80,60 180,140 280,92 C330,70 370,78 400,62 L400,140 L0,140 Z" style={{ fill: "var(--onda-2)" }} opacity="0.12" />
      <path d="M0,120 C100,92 190,140 300,112 C350,100 380,104 400,96 L400,140 L0,140 Z" style={{ fill: "var(--onda-3)" }} opacity="0.6" />
    </svg>
  );
}

/** Contenido del módulo: isla de pestañas y la página (sin barra de contexto, pedido de Williams 2026-10-29). */
export function ErpContenido({
  avisos,
  encabezado,
  children,
}: {
  /** Avisos bajo la isla (solo lectura, observaciones de Gerencia…). */
  avisos?: ReactNode;
  /** Pestaña de una acción del INICIO: "Volver a INICIO [MÓDULO]". */
  encabezado?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="animate-velo space-y-5" /* solo opacidad: un transform rompería los modales fijos */>
      {encabezado}
      {/* Menú isla del módulo (components/ui Tabs dibuja aquí su IslandMenu): fijo al hacer scroll */}
      <div id={ID_BARRA_PESTANAS} className="sticky top-16 z-10 empty:hidden" />
      {avisos}
      {children}
    </div>
  );
}

export default ErpLayout;
