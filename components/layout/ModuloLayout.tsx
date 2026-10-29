"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ID_BARRA_PESTANAS } from "@/components/ui";
import { Header } from "@/components/Header";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { esSoporte, type Sesion } from "@/lib/auth";
import { SEDE_PLANTA_PRINCIPAL } from "@/lib/plantillasDocumentos";

/** Sede del ERP (Arequipa): referencia del diseño de todos los módulos. */
export { SEDE_PLANTA_PRINCIPAL };

/**
 * Marco único de los módulos (diseño de Arequipa): tema azul oscuro sobre el mapa, header "MODULO X",
 * contenido de 1600 px y footer. El ERP (Arequipa) y Secocha usan este mismo layout: solo cambia la sede.
 */
export function ModuloLayout({
  moduleName,
  sede,
  inicio,
  sesion,
  onSalir,
  extra,
  mainClassName = "",
  overlays,
  children,
}: {
  moduleName: string;
  /** Sede que se muestra en el footer (la franja de contexto la recibe ModuloContenido). */
  sede: string;
  inicio?: string;
  sesion: Sesion;
  onSalir: () => void;
  /** Botones del header antes de la cápsula del usuario (buscador, campana…). */
  extra?: ReactNode;
  mainClassName?: string;
  /** Barras, dock, modales y avisos fijos (fuera del contenido). */
  overlays?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Tema azul oscuro COMBOY VID: siempre oscuro (.dark + .tema-azul, app/globals.css) sobre el mapa azul
    <div className="dark tema-azul relative isolate flex min-h-screen flex-col pb-32 text-fg">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1] bg-[#070b14]">
        <Image src="/blue-globe.jpg" alt="" fill priority quality={90} sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-[#172554]/15" />
        <div className="absolute inset-0 bg-black/85" />
      </div>

      {/* Encabezado: logo · MODULO X centrado · buscador, campana y usuario */}
      <ModuleHeader
        moduleName={moduleName}
        inicio={inicio}
        // El creador se muestra como SOPORTE (Dueño)
        usuario={esSoporte(sesion) ? "SOPORTE" : sesion.usuario}
        nombre={esSoporte(sesion) ? "SOPORTE (Dueño) · acceso a todos los módulos" : sesion.nombre}
        badge={esSoporte(sesion) ? "Soporte Dueño" : undefined}
        onSalir={onSalir}
        extra={extra}
      />

      <main className={`w-full flex-1 transition-[padding] duration-300 ${mainClassName}`}>
        <div className="mx-auto w-full max-w-[1600px] px-4 pt-24 sm:px-6 lg:px-8">{children}</div>
      </main>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-4 text-xs text-plomo-500 sm:px-6 lg:px-8">
        <span>
          <span className="font-semibold text-fg">COMBOY</span> <span className="font-semibold text-rojo">VID</span> © 2025 · ERP COMBOYVID · Sede {sede} · Área Informática
        </span>
        <span>v3.2.1</span>
      </footer>
      {overlays}
    </div>
  );
}

/** Contenido del módulo: franja de contexto (usuario · cargo · empresa, Sede: X), isla de pestañas y la página. */
export function ModuloContenido({
  sesion,
  sede,
  flujo,
  avisos,
  children,
}: {
  sesion: Sesion;
  sede: string;
  flujo?: string;
  /** Avisos bajo la isla (solo lectura, observaciones de Gerencia…). */
  avisos?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="animate-velo space-y-5" /* solo opacidad: un transform rompería los modales fijos */>
      <Header sesion={sesion} sede={sede} flujo={flujo} />
      {/* Menú isla del módulo (components/ui Tabs dibuja aquí su IslandMenu): fijo al hacer scroll, sin barra de fondo */}
      <div id={ID_BARRA_PESTANAS} className="sticky top-16 z-10 empty:hidden" />
      {avisos}
      {children}
    </div>
  );
}
