"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ID_BARRA_PESTANAS } from "@/components/ui";
import type { Sesion } from "@/lib/auth";
import { VERSION_LOGISTICA } from "@/lib/logistica";
import { ETIQUETA_PERFIL, inicialesDe, perfilPlanta } from "@/lib/permisosPlanta";
import { ErpHeader, NOMBRE_EMPRESA } from "./ErpHeader";

const horaActual = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Layout global de todos los módulos (diseño de Logística Planta): fondo #0e1219 con el mapa mundial tenue,
 * ErpHeader fijo, contenido a todo el ancho de la pantalla y pie con versión y última sincronización.
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
  const perfil = perfilPlanta(sesion);
  const etiqueta = perfil ? ETIQUETA_PERFIL[perfil] : undefined;
  // Usuario asignado: "JO - Jose Ortiz Arapa • ALMACEN" (perfiles.avatar_iniciales, nombre_completo, modulo_asignado)
  const nombreUsuario = sesion.nombreCompleto?.trim() || sesion.nombre || sesion.usuario;
  const iniciales = inicialesDe(nombreUsuario, sesion.iniciales);
  const moduloUsuario = etiqueta?.label ?? (sesion.moduloAsignado?.toUpperCase() || undefined);
  return (
    <div className={"dark tema-planta relative isolate flex min-h-screen flex-col pb-32 text-fg"} data-modulo={moduleName}>
      {/* Tema GLASS (2026-11-04): negro grafito con malla abstracta (luz azul eléctrico arriba, fuego abajo). En los
          módulos el mapa mundial queda apenas visible debajo; los INICIO, solo la malla. */}
      <div aria-hidden className="fondo-malla pointer-events-none fixed inset-0 z-[-1]">
        {!sinMapa && <Image src="/blue-globe.jpg" alt="" fill priority quality={80} sizes="100vw" className="object-cover object-center opacity-[0.07] mix-blend-screen grayscale" />}
      </div>

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

      <main className={`w-full flex-1 transition-[padding] duration-300 ${mainClassName}`}>
        {/* Ancho completo (2026-11-07, pedido de Williams): sin tope de 1600 px, el contenido llena la pantalla de cualquier PC */}
        <div className="w-full px-3 pt-20 sm:px-4 lg:px-5 2xl:px-6">{children}</div>
      </main>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 glass-blur border-t border-white/[0.08] px-4 py-4 text-xs text-[#a1a1aa] sm:px-4 lg:px-5 2xl:px-6">
        <span>
          <span className="font-semibold text-white">{NOMBRE_EMPRESA}</span> © 2025 · ERP COMBOY VID · Sede {sede} · Área Informática
        </span>
        <span>
          {VERSION_LOGISTICA} · Última sincronización: Hoy {sync}
        </span>
      </footer>
      {overlays}
    </div>
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
