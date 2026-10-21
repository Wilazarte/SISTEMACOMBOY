"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/components/ui";
import type { EstiloMenu } from "@/lib/preferencias";
import { hrefSub, moduloDe, type ItemNav } from "./nav";
import { useIr } from "./ir";

/** Menú lateral: grafito (o rojo sólido), plegable a solo iconos, con submenús por módulo. */
export function Sidebar({
  nav,
  ruta,
  tab,
  plegado,
  estilo,
  abierto,
  contadores,
  onPlegar,
  onCerrar,
  pie,
}: {
  nav: ItemNav[];
  ruta: string;
  /** Pestaña abierta en la página actual (para marcar el submenú). */
  tab: string | null;
  plegado: boolean;
  estilo: EstiloMenu;
  /** Menú abierto en el celular. */
  abierto: boolean;
  contadores: Record<string, number>;
  onPlegar: () => void;
  onCerrar: () => void;
  pie: ReactNode;
}) {
  const ir = useIr();
  const actual = moduloDe(ruta)?.href;
  const [desplegado, setDesplegado] = useState<string | undefined>(actual);
  useEffect(() => setDesplegado(actual), [actual]);
  // En el celular el menú siempre se ve completo
  const soloIconos = plegado && !abierto;

  return (
    <aside
      data-sidebar={estilo}
      aria-label="Menú principal"
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-sidebar-borde bg-sidebar text-sidebar-texto transition-[width,transform] duration-300 ease-suave lg:translate-x-0",
        abierto ? "translate-x-0" : "-translate-x-full",
        plegado ? "lg:w-[68px]" : "lg:w-[252px]"
      )}
    >
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 px-[18px]">
        <Link href="/dashboard" aria-label="COMBOY VID - inicio" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-corp text-[13px] font-bold tracking-tight text-white shadow-rojo [[data-sidebar=rojo]_&]:bg-white [[data-sidebar=rojo]_&]:text-corp">
          CV
        </Link>
        <div className={cn("min-w-0 flex-1 leading-tight transition-opacity duration-200", soloIconos && "lg:pointer-events-none lg:opacity-0")}>
          <p className="truncate text-sm font-semibold tracking-tight text-white">COMBOY VID</p>
          <p className="truncate text-[11px] text-sidebar-sub">ERP · Arequipa</p>
        </div>
        <button className="rounded-lg p-1.5 text-sidebar-sub hover:bg-white/10 hover:text-white lg:hidden" onClick={onCerrar} aria-label="Cerrar menú">
          <X size={18} />
        </button>
      </div>

      <div className="px-2.5">
        <button
          onClick={onPlegar}
          className="group relative hidden h-9 w-full items-center gap-3 rounded-lg px-[13px] text-[13px] font-medium text-sidebar-sub transition hover:bg-white/[0.07] hover:text-white lg:flex"
          aria-label={plegado ? "Expandir menú" : "Contraer menú"}
        >
          {plegado ? <PanelLeftOpen size={18} className="shrink-0" /> : <PanelLeftClose size={18} className="shrink-0" />}
          <span className={cn("flex-1 truncate text-left transition-opacity duration-200", soloIconos && "opacity-0")}>Contraer menú</span>
          {!soloIconos && <kbd className="rounded border border-white/15 px-1 font-mono text-[10px] text-sidebar-sub">[</kbd>}
          {soloIconos && <Globo>Expandir menú [</Globo>}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-0.5 px-2.5 pb-4 pt-1", soloIconos ? "overflow-visible" : "overflow-y-auto overflow-x-hidden")}>
        {nav.map((n) => {
          const activo = actual === n.href;
          const abiertoSub = !soloIconos && desplegado === n.href && n.subs.length > 0;
          const Icon = n.icon;
          const cuenta = contadores[n.href] ?? 0;
          return (
            <div key={n.href}>
              {n.seccion &&
                (soloIconos ? (
                  <div className="mx-3 my-2 border-t border-sidebar-borde" />
                ) : (
                  <p className="truncate px-3 pb-1 pt-4 text-[11px] font-medium text-sidebar-sub">{n.seccion}</p>
                ))}
              <div className="group relative flex items-center">
                <Link
                  href={n.href}
                  onClick={() => {
                    setDesplegado(n.href);
                    onCerrar();
                  }}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex h-9 flex-1 items-center gap-3 rounded-lg px-[13px] text-[13.5px] font-medium transition duration-150",
                    activo ? "bg-sidebar-activo text-sidebar-activo-texto shadow-sm" : "hover:bg-white/[0.07] hover:text-white",
                    n.subs.length > 0 && !soloIconos && "pr-8"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className={cn("flex-1 truncate transition-opacity duration-200", soloIconos && "lg:opacity-0")}>{n.label}</span>
                  {cuenta > 0 && (
                    <span
                      className={cn(
                        "flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                        activo ? "bg-white text-corp [[data-sidebar=rojo]_&]:bg-corp [[data-sidebar=rojo]_&]:text-white" : "bg-corp text-white [[data-sidebar=rojo]_&]:bg-white [[data-sidebar=rojo]_&]:text-corp",
                        soloIconos && "absolute right-1.5 top-0.5 h-4 min-w-[16px] px-1 text-[10px]"
                      )}
                    >
                      {cuenta}
                    </span>
                  )}
                </Link>
                {n.subs.length > 0 && !soloIconos && (
                  <button
                    onClick={() => setDesplegado(desplegado === n.href ? undefined : n.href)}
                    className={cn("absolute right-1 flex h-7 w-7 items-center justify-center rounded-md transition", activo ? "hover:bg-black/10" : "hover:bg-white/10")}
                    aria-label={`${abiertoSub ? "Ocultar" : "Ver"} secciones de ${n.label}`}
                    aria-expanded={abiertoSub}
                  >
                    <ChevronRight size={14} className={cn("opacity-70 transition-transform duration-200", abiertoSub && "rotate-90")} />
                  </button>
                )}
                {soloIconos && <Globo>{n.label}</Globo>}
              </div>
              {abiertoSub && (
                <div className="mb-1.5 ml-[22px] mt-0.5 flex animate-bajar flex-col gap-px border-l border-sidebar-borde pl-3">
                  {n.subs.map((s) => {
                    const href = hrefSub(n, s);
                    const on = s.href ? ruta === s.href : activo && ruta === n.href && tab === s.tab;
                    return (
                      <button
                        key={s.label}
                        onClick={() => {
                          ir(href);
                          onCerrar();
                        }}
                        className={cn(
                          "h-[30px] truncate rounded-md px-2.5 text-left text-[13px] transition duration-150 hover:bg-white/[0.07] hover:text-white",
                          on ? "font-medium text-white" : "text-sidebar-sub"
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-borde p-2.5">{pie}</div>
    </aside>
  );
}

/** Tooltip a la derecha del menú plegado. */
export function Globo({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0A0A0B] px-2 py-1 text-xs font-medium text-white opacity-0 shadow-pop transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 lg:block">
      {children}
    </span>
  );
}
