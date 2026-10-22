"use client";

import type { ReactNode } from "react";
import { Bell, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/components/ui";

export const ANCHO_DRAWER = 320;

/**
 * Barra izquierda desplegable de Tesorería / Compras: "Requerimientos por revisar".
 * Fija bajo el header; en escritorio empuja el contenido (la página agrega lg:ml-[320px]), en móvil se superpone.
 * Sin backdrop-filter: los modales (Rechazar, Observar, Editar) se dibujan fuera de la barra.
 */
export default function TesoreriaLeftDrawer({ open, onToggle, cantidad, acciones, children }: { open: boolean; onToggle: () => void; cantidad: number; acciones?: ReactNode; children: ReactNode }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "fixed top-[68px] z-40 flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0f172a] px-2 py-1.5 text-xs font-semibold text-white shadow-lg transition-all duration-300 hover:border-[#2a7bff]/60",
          open ? "left-[min(320px,85vw)] -translate-x-full -ml-2" : "left-2"
        )}
        aria-expanded={open}
        aria-label={open ? "Ocultar requerimientos por revisar" : "Mostrar requerimientos por revisar"}
      >
        {open ? (
          <ChevronsLeft size={16} />
        ) : (
          <>
            <Bell size={14} className="text-amber-400" /> Notificaciones ({cantidad}) <ChevronsRight size={16} />
          </>
        )}
      </button>

      <aside
        className={cn(
          "fixed left-0 top-16 z-30 flex h-[calc(100vh-64px)] flex-col border-r border-white/10 bg-[#0a101f] transition-all duration-300 print:hidden",
          open ? "w-[min(320px,85vw)]" : "w-0 overflow-hidden border-r-0"
        )}
        aria-hidden={!open}
      >
        <div className="border-b border-white/10 p-4 pr-12">
          <h3 className="flex items-center gap-2 font-bold text-white">
            <Bell size={16} className="text-amber-400" /> Requerimientos por revisar
            <span className="rounded-full bg-[#2a7bff] px-2 py-0.5 text-xs">{cantidad}</span>
          </h3>
          {acciones && <div className="mt-3 flex flex-wrap gap-2">{acciones}</div>}
        </div>
        {/* pb para que el menú inferior no tape la última tarjeta */}
        <div className="flex-1 space-y-2 overflow-y-auto p-2 pb-28">{children}</div>
      </aside>
    </>
  );
}
