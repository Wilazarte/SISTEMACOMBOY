"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";
import { abrirPestana } from "@/lib/logistica";

// Diseño propio de Logística Planta (solo se usa en /logistica): oscuro con acento naranja.
// No usa ni cambia los tokens de los demás módulos.

export const NARANJA = "#f97316";

export function Panel({ titulo, icono, accion, children, className }: { titulo?: string; icono?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-[#2a3445] bg-[#1a212e] p-4 text-[#e5e7eb]", className)}>
      {titulo && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-wide text-[#fb923c]">
            {icono}
            {titulo}
          </h2>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

/** Botón "↗ Ver …": abre el destino en una pestaña nueva. */
export function BotonVer({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      className="inline-flex items-center gap-1 rounded-md border border-[#f97316]/60 bg-[#f97316]/10 px-2.5 py-1 text-[12px] font-semibold text-[#fdba74] transition hover:bg-[#f97316] hover:text-white"
    >
      {children} <ArrowUpRight size={13} />
    </button>
  );
}

/** Botón de acción (lleno o con borde) que abre en una pestaña nueva. */
export function BotonAccion({ href, children, icono, lleno }: { href: string; children: ReactNode; icono?: ReactNode; lleno?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition",
        lleno ? "bg-[#f97316] text-white hover:bg-[#ea580c]" : "border border-[#3a4558] bg-[#212a3a] text-[#e5e7eb] hover:border-[#f97316] hover:text-white"
      )}
    >
      {icono}
      {children}
    </button>
  );
}

export function Kpi({ icono, titulo, valor, detalle, href }: { icono: ReactNode; titulo: string; valor: string; detalle: string; href: string }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      className="flex flex-col items-center gap-1 rounded-xl border border-[#2a3445] bg-[#1a212e] px-4 py-5 text-center transition hover:border-[#f97316]"
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[#a1a1aa]">
        <span className="text-[#f97316]">{icono}</span>
        {titulo}
      </span>
      <span className="text-3xl font-bold text-white lg:text-4xl">{valor}</span>
      <span className="text-[12px] font-medium text-[#fdba74]">{detalle}</span>
    </button>
  );
}

export function Acceso({ icono, titulo, texto, href }: { icono: ReactNode; titulo: string; texto: string; href: string }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      title="Se abre en una pestaña nueva"
      className="group flex items-center gap-3 rounded-xl border border-[#2a3445] bg-[#1a212e] px-4 py-4 text-left transition hover:border-[#f97316]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-white">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold uppercase text-white">{titulo}</span>
        <span className="block truncate text-[12px] text-[#a1a1aa]">{texto}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-[#f97316] transition group-hover:translate-x-0.5" />
    </button>
  );
}

export function Etiqueta({ children, tono = "naranja" }: { children: ReactNode; tono?: "naranja" | "verde" | "gris" | "azul" }) {
  const cls = {
    naranja: "bg-[#f97316]/15 text-[#fdba74] ring-[#f97316]/40",
    verde: "bg-[#22c55e]/15 text-[#86efac] ring-[#22c55e]/40",
    gris: "bg-white/5 text-[#a1a1aa] ring-white/10",
    azul: "bg-[#3b82f6]/15 text-[#93c5fd] ring-[#3b82f6]/40",
  }[tono];
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", cls)}>{children}</span>;
}

export function Barra({ pct }: { pct: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full bg-[#f97316]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[#2a3445] px-3 py-4 text-center text-[13px] text-[#a1a1aa]">{children}</p>;
}

/** Aviso de dato que el ERP todavía no registra (no se inventan cifras). */
export function SinRegistro({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-white/[0.03] px-3 py-2 text-[12px] italic text-[#a1a1aa]">{children}</p>;
}
