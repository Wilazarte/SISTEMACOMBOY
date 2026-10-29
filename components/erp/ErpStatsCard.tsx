"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Métrica con icono (COMPRAS ACTIVAS, EN TRÁNSITO, OP ACTIVAS…): tarjeta oscura con borde, título gris en
 * mayúsculas, valor grande en blanco y detalle en naranja. Diseño único de todos los módulos (Logística Planta).
 * `href`: navega en la misma pestaña; `onClick`: acción propia (ej. abrir en pestaña nueva).
 */
export function ErpStatsCard({
  icono,
  titulo,
  valor,
  detalle,
  href,
  onClick,
  alerta,
  extra,
  className,
}: {
  icono: ReactNode;
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Valor en rojo (ej. stock crítico). */
  alerta?: boolean;
  /** Elemento junto al título (ej. asa para arrastrar). */
  extra?: ReactNode;
  className?: string;
}) {
  const cuerpo = (
    <>
      <span className="flex w-full items-center justify-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[#a1a1aa]">
        <span className="text-[#f97316]">{icono}</span>
        {titulo}
        {extra}
      </span>
      <span className={cn("text-3xl font-bold tabular lg:text-4xl", alerta ? "text-[#f87171]" : "text-white")}>{valor}</span>
      {detalle && <span className="text-[12px] font-medium text-[#fdba74]">{detalle}</span>}
    </>
  );
  const cls = cn(
    "flex flex-col items-center gap-1 rounded-xl border border-[#2a3445] bg-[#1a212e] px-4 py-5 text-center transition hover:border-[#f97316]",
    className
  );
  if (href && !onClick)
    return (
      <Link href={href} draggable={false} className={cls}>
        {cuerpo}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {cuerpo}
    </button>
  );
}

export default ErpStatsCard;
