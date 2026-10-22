"use client";

import type { ReactNode } from "react";

// Local (components/ui importa este archivo: evita la importación circular)
const cn = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

/** Pestaña de la isla: la activa se pinta bg-[#1e40af]. */
export interface ItemIsla {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

/** Acción de la isla (Buscar, Nuevo, PDF…): botón que no cambia de pestaña. */
export interface AccionIsla {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

/**
 * Menú isla flotante: el único menú de cada módulo (acciones + pestañas en una sola cápsula).
 * Lo usa Tabs de components/ui, así que todos los módulos lo reciben igual.
 */
export function IslandMenu({
  items,
  activo,
  onElegir,
  acciones = [],
  className,
}: {
  items: ItemIsla[];
  activo: string;
  onElegir: (id: string) => void;
  acciones?: AccionIsla[];
  className?: string;
}) {
  return (
    <div className={cn("mx-4 mt-3 flex gap-1 overflow-x-auto rounded-full border border-slate-800 bg-[#0f172a]/90 px-2 py-1.5 backdrop-blur", className)}>
      {acciones.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-800 bg-[#1e293b] px-3 py-1.5 text-[13px] font-medium text-slate-200 transition hover:border-slate-600"
        >
          {a.icon}
          {a.label}
        </button>
      ))}
      {acciones.length > 0 && items.length > 0 && <span aria-hidden className="mx-1 my-1.5 w-px shrink-0 bg-slate-800" />}
      <div role="tablist" className="flex gap-1">
        {items.map((t) => {
          const on = activo === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onElegir(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition duration-150",
                on ? "bg-[#1e40af] text-white" : "text-slate-400 hover:bg-[#1e293b] hover:text-slate-200"
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", on ? "bg-white/20 text-white" : "bg-[#1e293b] text-slate-200")}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Acción "Buscar" de la isla: abre el panel de filtros (setShowFiltros(true)) de la primera lista
 * de la página y pone el cursor en su buscador.
 */
export function abrirBuscadorDePagina() {
  const toggle = document.querySelector<HTMLButtonElement>("main [data-toggle-filtros]");
  if (!toggle) return;
  const caja = toggle.closest<HTMLElement>("[id], section, .rounded-xl, .rounded-2xl") ?? toggle.parentElement;
  if (toggle.getAttribute("aria-expanded") === "false") toggle.click();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      caja?.scrollIntoView({ behavior: "smooth", block: "start" });
      const input =
        caja?.querySelector<HTMLInputElement>('input[aria-label="Buscar"]') ??
        caja?.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([type="date"]):not([type="hidden"])') ??
        caja?.querySelector<HTMLSelectElement>("select");
      input?.focus({ preventScroll: true });
    })
  );
}

export default IslandMenu;
