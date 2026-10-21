"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/components/ui";
import { guardarPrefs, type EstiloMenu, type Tema } from "@/lib/preferencias";
import { Globo } from "./Sidebar";

const TEMAS: { id: Tema; label: string; icon: typeof Sun }[] = [
  { id: "claro", label: "Claro", icon: Sun },
  { id: "oscuro", label: "Oscuro", icon: Moon },
  { id: "sistema", label: "Sistema", icon: Monitor },
];
const MENUS: { id: EstiloMenu; label: string; muestra: string }[] = [
  { id: "grafito", label: "Grafito", muestra: "bg-[#111113]" },
  { id: "rojo", label: "Rojo sólido", muestra: "bg-[#CC0000]" },
];

/** Preferencias visuales (tema y estilo del menú), en el pie del menú lateral. */
export function Apariencia({ tema, menu, soloIcono }: { tema: Tema; menu: EstiloMenu; soloIcono: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  return (
    <div ref={caja} className="group relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex h-9 w-full items-center gap-3 rounded-lg px-[13px] text-[13px] font-medium text-sidebar-sub transition hover:bg-white/[0.07] hover:text-white"
        aria-expanded={abierto}
        aria-label="Apariencia"
      >
        <Palette size={18} className="shrink-0" />
        <span className={cn("flex-1 truncate text-left", soloIcono && "lg:opacity-0")}>Apariencia</span>
      </button>
      {soloIcono && !abierto && <Globo>Apariencia</Globo>}
      {abierto && (
        <div className="absolute bottom-11 left-0 z-50 w-[248px] animate-emerger rounded-xl border border-plomo-200 bg-surface p-3 text-fg shadow-pop">
          <p className="mb-2 text-[11px] font-medium text-plomo-500">Tema</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-plomo-50 p-1">
            {TEMAS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => guardarPrefs({ tema: t.id })}
                  className={cn("flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition", tema === t.id ? "bg-surface text-fg shadow-card ring-1 ring-plomo-200" : "text-plomo-500 hover:text-fg")}
                >
                  <Icon size={15} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mb-2 mt-3 text-[11px] font-medium text-plomo-500">Menú lateral</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MENUS.map((m) => (
              <button
                key={m.id}
                onClick={() => guardarPrefs({ menuEstilo: m.id })}
                className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition", menu === m.id ? "border-corp text-fg ring-2 ring-corp/15" : "border-plomo-200 text-plomo-600 hover:bg-plomo-50")}
              >
                <span className={cn("h-4 w-4 rounded", m.muestra)} />
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-plomo-500">Se guarda en tu usuario: te sigue en cualquier PC.</p>
        </div>
      )}
    </div>
  );
}
