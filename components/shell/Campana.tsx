"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Boxes, ClipboardList, PackageCheck, Receipt, Store, Truck, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import type { Notificacion, TipoNotif } from "@/lib/notificaciones";
import { guardarPrefs } from "@/lib/preferencias";
import { useIr } from "./ir";

const ICONO: Record<TipoNotif, LucideIcon> = { despacho: Truck, requerimiento: ClipboardList, factura: Receipt, qc: PackageCheck, stock: Boxes, sucursal: Store };

/** Campana roja: avisos en vivo; "vistas" se guardan en las preferencias del usuario. */
export function Campana({ notifs, vistas }: { notifs: Notificacion[]; vistas: string[] }) {
  const ir = useIr();
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const visto = new Set(vistas);
  const nuevas = notifs.filter((n) => !visto.has(n.clave)).length;

  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierta(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierta]);

  const marcar = (claves: string[]) => {
    // Solo se guardan las claves que siguen activas (más las nuevas), hasta 300
    const activas = new Set(notifs.map((n) => n.clave));
    guardarPrefs({ notifVistas: Array.from(new Set([...vistas.filter((v) => activas.has(v)), ...claves])).slice(-300) });
  };

  return (
    <div ref={caja} className="relative">
      <button
        onClick={() => setAbierta(!abierta)}
        className={cn("tip relative flex h-9 w-9 items-center justify-center rounded-lg border border-plomo-200 bg-surface text-fg-2 transition hover:bg-plomo-50 hover:text-fg", abierta && "bg-plomo-50 text-fg")}
        data-tip="Notificaciones"
        aria-label={`Notificaciones${nuevas ? `: ${nuevas} nueva(s)` : ""}`}
        aria-expanded={abierta}
      >
        <Bell size={17} />
        {nuevas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-corp px-1 text-[11px] font-semibold text-white ring-2 ring-canvas">
            {nuevas > 99 ? "99+" : nuevas}
          </span>
        )}
      </button>
      {abierta && (
        <div className="absolute right-0 top-11 z-[70] w-[400px] max-w-[calc(100vw-32px)] animate-emerger overflow-hidden rounded-xl border border-plomo-200 bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-plomo-200 px-4 py-3">
            <p className="text-sm font-semibold text-fg">Notificaciones</p>
            {nuevas > 0 && (
              <button onClick={() => marcar(notifs.map((n) => n.clave))} className="rounded-md px-1.5 py-1 text-xs font-medium text-rojo hover:bg-rojo-soft">
                Marcar todo como leído
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-sm text-plomo-500">
                <BellOff size={22} /> Todo al día
              </div>
            ) : (
              notifs.map((n) => {
                const Icon = ICONO[n.tipo];
                const nueva = !visto.has(n.clave);
                return (
                  <button
                    key={n.clave}
                    onClick={() => {
                      marcar([n.clave]);
                      setAbierta(false);
                      ir(n.href);
                    }}
                    className="flex w-full gap-3 border-b border-plomo-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-plomo-50"
                  >
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", nueva ? "bg-rojo-soft text-rojo" : "bg-plomo-100 text-plomo-500")}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px] leading-snug", nueva ? "font-semibold text-fg" : "font-medium text-fg-2")}>{n.titulo}</span>
                      <span className="mt-0.5 block truncate text-xs text-plomo-500">{n.detalle}</span>
                      <span className="mt-0.5 block text-[11px] text-plomo-500">{n.modulo}</span>
                    </span>
                    {nueva && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-corp ring-[3px] ring-rojo-soft" aria-label="Nueva" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
