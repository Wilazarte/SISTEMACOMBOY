"use client";

import { Plus, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { useTogglePanel } from "@/hooks/useTogglePanel";

/** Botón "Buscar / Filtrar" que abre o cierra el panel de filtros de una lista (cerrado por defecto). */
export function BotonFiltros({ abierto, onClick, activos = 0 }: { abierto: boolean; onClick: () => void; activos?: number }) {
  return (
    <button
      type="button"
      data-toggle-filtros
      aria-expanded={abierto}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition",
        abierto ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700" : "border-plomo-200 bg-surface text-slate-700 hover:bg-plomo-50"
      )}
    >
      {abierto ? <X size={14} /> : <Search size={14} />} {abierto ? "Ocultar filtros" : "Buscar / Filtrar"}
      {!abierto && activos > 0 && <span className="rounded-full bg-corp px-1.5 text-[10px] font-bold text-white">{activos}</span>}
    </button>
  );
}

/** Botón "Nuevo" / "Cancelar" que muestra u oculta el formulario de registro del módulo (oculto por defecto). */
export function BotonNuevo({ abierto, onClick, label = "Nuevo" }: { abierto: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-expanded={abierto}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 text-xs font-medium text-white transition hover:border-slate-400 hover:bg-slate-700"
    >
      {abierto ? <X size={14} /> : <Plus size={14} />} {abierto ? "Cancelar" : label}
    </button>
  );
}

/** Filtros de cabecera plegables: solo el botón "Buscar / Filtrar" hasta que se abren. */
export function FiltrosPlegables({ activos = 0, children }: { activos?: number; children: ReactNode }) {
  const { showFiltros, setShowFiltros } = useTogglePanel();
  return (
    <>
      <BotonFiltros abierto={showFiltros} onClick={() => setShowFiltros(!showFiltros)} activos={activos} />
      {showFiltros && children}
    </>
  );
}
