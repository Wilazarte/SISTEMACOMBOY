"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";
import { abrirPestana } from "@/lib/logistica";
import { ErpStatsCard } from "@/components/erp/ErpStatsCard";

// Piezas de las homes de la planta: oscuro con acento rojo #2a7bff. Es el diseño de todos los módulos (components/erp).

export const NARANJA = "#2a7bff";

export function Panel({ titulo, icono, accion, children, className, id }: { titulo?: string; icono?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border border-[#2a3445] bg-[#1a212e] p-4 text-[#e5e7eb]", className)}>
      {titulo && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-wide text-[#60a5fa]">
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

/** Botón "↗ Ver …": abre el destino en la misma ventana. */
export function BotonVer({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      className="inline-flex items-center gap-1 rounded-md border border-[#2a7bff]/60 bg-[#2a7bff]/10 px-2.5 py-1 text-[12px] font-semibold text-[#93c5fd] transition hover:bg-[#2a7bff] hover:text-white"
    >
      {children} <ArrowUpRight size={13} />
    </button>
  );
}

/** Botón de acción (lleno o con borde) que abre en la misma ventana. */
export function BotonAccion({ href, children, icono, lleno }: { href: string; children: ReactNode; icono?: ReactNode; lleno?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition",
        lleno ? "bg-[#2a7bff] text-white hover:bg-[#1e64e6]" : "border border-[#3a4558] bg-[#212a3a] text-[#e5e7eb] hover:border-[#2a7bff] hover:text-white"
      )}
    >
      {icono}
      {children}
    </button>
  );
}

/** Métrica de las homes: ErpStatsCard del layout global, abre el destino en la misma ventana. */
export function Kpi({ icono, titulo, valor, detalle, href }: { icono: ReactNode; titulo: string; valor: string; detalle: string; href: string }) {
  return <ErpStatsCard icono={icono} titulo={titulo} valor={valor} detalle={detalle} onClick={() => abrirPestana(href)} />;
}

export function Acceso({ icono, titulo, texto, href }: { icono: ReactNode; titulo: string; texto: string; href: string }) {
  return (
    <button
      type="button"
      onClick={() => abrirPestana(href)}
      title="Abrir"
      className="group flex items-center gap-3 rounded-xl border border-[#2a3445] bg-[#1a212e] px-4 py-4 text-left transition hover:border-[#2a7bff]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2a7bff] text-white">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold uppercase text-white">{titulo}</span>
        <span className="block truncate text-[12px] text-[#a1a1aa]">{texto}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-[#2a7bff] transition group-hover:translate-x-0.5" />
    </button>
  );
}

export function Etiqueta({ children, tono = "naranja" }: { children: ReactNode; tono?: "naranja" | "verde" | "gris" | "azul" }) {
  const cls = {
    naranja: "bg-[#2a7bff]/15 text-[#93c5fd] ring-[#2a7bff]/40",
    verde: "bg-[#22c55e]/15 text-[#86efac] ring-[#22c55e]/40",
    gris: "bg-white/5 text-[#a1a1aa] ring-white/10",
    azul: "bg-[#3b82f6]/15 text-[#93c5fd] ring-[#3b82f6]/40",
  }[tono];
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", cls)}>{children}</span>;
}

export function Barra({ pct }: { pct: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full bg-[#2a7bff]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
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
