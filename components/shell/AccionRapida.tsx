"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Kbd, cn } from "@/components/ui";
import type { AccionRapida as Accion } from "./nav";
import { useIr } from "./ir";

/** Botón flotante "+" con las acciones rápidas que el usuario puede usar. */
export function AccionRapida({ acciones }: { acciones: Accion[] }) {
  const ir = useIr();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  if (acciones.length === 0) return null;
  return (
    <div ref={caja} className="fixed bottom-24 right-4 z-[75] print:hidden lg:bottom-6 lg:right-6">
      {abierto && (
        <div role="menu" aria-label="Acciones rápidas" className="absolute bottom-[68px] right-0 w-[290px] animate-emerger rounded-2xl border border-plomo-200 bg-surface p-1.5 shadow-pop">
          <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-medium text-plomo-500">Acción rápida</p>
          {acciones.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                role="menuitem"
                onClick={() => {
                  setAbierto(false);
                  ir(a.href);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-plomo-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rojo-soft text-rojo">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-fg">{a.label}</span>
                  <span className="block truncate text-xs text-plomo-500">{a.detalle}</span>
                </span>
                <Kbd>{a.tecla}</Kbd>
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setAbierto(!abierto)}
        aria-label="Acción rápida"
        aria-expanded={abierto}
        className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-corp text-white shadow-fab transition duration-200 ease-suave hover:-translate-y-0.5 hover:bg-vino-900 active:scale-95"
      >
        <Plus size={24} strokeWidth={2.4} className={cn("transition-transform duration-300 ease-suave", abierto && "rotate-45")} />
      </button>
    </div>
  );
}
