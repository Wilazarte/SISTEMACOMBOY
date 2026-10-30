"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, X } from "lucide-react";

export interface MigaERP {
  label: string;
  /** Ruta al hacer clic (la última miga, la pantalla actual, no lleva). */
  href?: string;
}

/**
 * Barra de navegación de todas las pantallas del ERP (pedido de Williams, 2026-10-30): Atrás / Adelante del
 * navegador, ruta "INICIO > ALMACEN > Recepción MP" y X que vuelve al INICIO del módulo. Todo en la misma ventana.
 */
export function NavegacionERP({ migas, inicio }: { migas: MigaERP[]; inicio: string }) {
  const router = useRouter();
  return (
    <div
      className="sticky top-16 z-30 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-[#2a3445] bg-[#0e1219]/95 px-4 py-2.5 backdrop-blur print:hidden sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      data-sin-guardar
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 rounded-full border border-[#3a4558] bg-[#1a212e]">
          <button type="button" onClick={() => router.back()} className="rounded-l-full p-2 text-white transition hover:bg-[#2a3445]" title="Atrás" aria-label="Atrás">
            <ArrowLeft size={18} />
          </button>
          <button type="button" onClick={() => router.forward()} className="rounded-r-full border-l border-[#3a4558] p-2 text-white transition hover:bg-[#2a3445]" title="Adelante" aria-label="Adelante">
            <ArrowRight size={18} />
          </button>
        </div>
        <nav aria-label="Ruta" className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-[#a1a1aa]">
          {migas.map((m, i) => {
            const ultima = i === migas.length - 1;
            return (
              <Fragment key={`${m.label}-${i}`}>
                {ultima || !m.href ? (
                  <span className={ultima ? "truncate font-bold text-white" : ""} aria-current={ultima ? "page" : undefined}>
                    {m.label}
                  </span>
                ) : (
                  <button type="button" onClick={() => router.push(m.href!)} className="transition hover:text-white">
                    {m.label}
                  </button>
                )}
                {!ultima && <ChevronRight size={14} className="shrink-0" />}
              </Fragment>
            );
          })}
        </nav>
      </div>
      <button
        type="button"
        onClick={() => router.push(inicio)}
        className="shrink-0 rounded-lg border border-[#2a7bff] p-2 text-white transition hover:bg-[#2a7bff]/20"
        title="Cerrar y volver al INICIO"
        aria-label="Cerrar y volver al INICIO"
      >
        <X size={18} />
      </button>
    </div>
  );
}
