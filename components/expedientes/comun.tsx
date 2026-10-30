"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import type { EstadoFase } from "@/lib/expedientes";

// Piezas de las pantallas de expedientes 26W: oscuro #0e1219 con acento rojo #2a7bff (diseño de los módulos).

export const ROJO = "#2a7bff";

export function Seccion({ titulo, accion, children, className }: { titulo?: string; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-[#2a3445] bg-[#0e1219] p-4 text-[#e5e7eb]", className)}>
      {titulo && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold uppercase tracking-wide text-[#60a5fa]">{titulo}</h2>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Boton({ children, onClick, lleno, disabled, title, type = "button" }: { children: ReactNode; onClick?: () => void; lleno?: boolean; disabled?: boolean; title?: string; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        lleno ? "bg-[#2a7bff] text-white hover:bg-[#1e64e6]" : "border border-[#3a4558] bg-[#1a212e] text-[#e5e7eb] hover:border-[#2a7bff] hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

const TONO_FASE: Record<EstadoFase, string> = {
  HECHA: "bg-[#22c55e]/15 text-[#86efac] ring-[#22c55e]/40",
  PENDIENTE: "bg-[#2a7bff]/20 text-[#93c5fd] ring-[#2a7bff]/60",
  NO_APLICA: "bg-white/5 text-[#a1a1aa] ring-white/10",
  BLOQUEADA: "bg-white/5 text-[#71717a] ring-white/10",
};
const TEXTO_FASE: Record<EstadoFase, string> = { HECHA: "Hecha", PENDIENTE: "En curso", NO_APLICA: "No aplica", BLOQUEADA: "En espera" };

export function ChipFase({ estado }: { estado: EstadoFase }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", TONO_FASE[estado])}>{TEXTO_FASE[estado]}</span>;
}

export function ChipDoc({ estado }: { estado: "OK" | "FALTA" | "NO_APLICA" | "OBSERVADO" }) {
  const t = { OK: TONO_FASE.HECHA, FALTA: TONO_FASE.PENDIENTE, NO_APLICA: TONO_FASE.NO_APLICA, OBSERVADO: "bg-[#f59e0b]/15 text-[#fcd34d] ring-[#f59e0b]/40" }[estado];
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", t)}>{{ OK: "OK", FALTA: "Falta", NO_APLICA: "No aplica", OBSERVADO: "Observado" }[estado]}</span>;
}

export function Avance({ pct }: { pct: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="block h-2 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full bg-[#2a7bff]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
      <span className="w-10 text-right text-[12px] font-bold text-white">{pct}%</span>
    </span>
  );
}

export const pct = (n: number | null) => (n === null ? "sin dato" : `${(n * 100).toFixed(1)} %`);

export function AvisoSql() {
  return (
    <Seccion>
      <p className="text-[13px] text-[#fcd34d]">
        Falta correr en Supabase el SQL <b>20261105_expedientes_26w.sql</b> (carpeta sql del proyecto). Sin él no se pueden crear expedientes 26W.
      </p>
    </Seccion>
  );
}

/** Fila etiqueta / valor de las tarjetas de solo lectura. */
export function Dato({ k, v }: { k: string; v?: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-1 text-[13px]">
      <span className="text-[#a1a1aa]">{k}</span>
      <span className="text-right font-medium text-white">{v || "—"}</span>
    </div>
  );
}
