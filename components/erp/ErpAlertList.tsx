"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { abrirPestana } from "@/lib/logistica";

export interface ErpAlerta {
  clave: string;
  titulo: string;
  detalle?: ReactNode;
  /** Etiqueta o monto a la derecha. */
  derecha?: ReactNode;
  /** Icono a la izquierda (ej. triángulo de alerta). */
  icono?: ReactNode;
  /** Punto naranja de "no visto". */
  nuevo?: boolean;
  /** Destino: se abre en la misma ventana (como los accesos de Logística). */
  href?: string;
  onClick?: () => void;
}

/**
 * Lista de PENDIENTES URGENTES, NOTIFICACIONES, ALERTAS y RECORDATORIOS: filas oscuras con borde que se
 * resaltan en naranja. `titulo` opcional en naranja; `max` corta la lista con "y N más".
 */
export function ErpAlertList({
  titulo,
  icono,
  items,
  vacio,
  max,
  critico,
  className,
}: {
  titulo?: string;
  icono?: ReactNode;
  items: ErpAlerta[];
  vacio: string;
  max?: number;
  /** Alertas críticas (stock, pendientes urgentes): barra lateral rojo fuego en vez de cian. */
  critico?: boolean;
  className?: string;
}) {
  const visibles = max ? items.slice(0, max) : items;
  return (
    <div className={className}>
      {titulo && (
        <p className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase text-[#60a5fa]">
          {icono} {titulo}
        </p>
      )}
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-center text-[12px] text-[#a1a1aa]">{vacio}</p>
      ) : (
        <ul className="space-y-1.5">
          {visibles.map((n) => {
            const accion = n.onClick ?? (n.href ? () => abrirPestana(n.href!) : undefined);
            return (
              <li key={n.clave}>
                <button
                  type="button"
                  onClick={accion}
                  disabled={!accion}
                  className={cn(
                    "aviso-glass flex w-full items-center gap-3 py-2 pl-4 pr-3 text-left",
                    critico && "aviso-critico",
                    accion && "hover-cian"
                  )}
                >
                  {n.nuevo !== undefined && <span className={cn("h-2 w-2 shrink-0 rounded-full", n.nuevo ? (critico ? "grad-fuego" : "grad-azul") : "bg-[#3a4558]")} />}
                  {n.icono && <span className={cn("shrink-0", critico ? "text-[#ff6a5f]" : "text-[#00f2fe]")}>{n.icono}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white">{n.titulo}</span>
                    {n.detalle && <span className="block truncate text-[12px] text-[#a1a1aa]">{n.detalle}</span>}
                  </span>
                  {n.derecha && <span className="shrink-0">{n.derecha}</span>}
                </button>
              </li>
            );
          })}
          {max && items.length > max && <li className="text-right text-[11px] text-[#71717a]">y {items.length - max} más</li>}
        </ul>
      )}
    </div>
  );
}

export default ErpAlertList;
