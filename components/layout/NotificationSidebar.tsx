"use client";

import { useState } from "react";
import { Bell, BellOff, ChevronsRight } from "lucide-react";
import type { Notificacion } from "@/lib/notificaciones";
import { guardarPrefs } from "@/lib/preferencias";
import { useIr } from "@/components/shell/ir";

const TIMES = '"Times New Roman", Times, serif';
/** Ancho de la barra: el layout deja este margen a la derecha (lg) mientras está abierta. */
export const ANCHO_NOTIF = 320;
/** Aquí se dibujan secciones propias de un módulo (p. ej. "Requerimientos por revisar" de Tesorería). */
export const ID_NOTIF_EXTRA = "erp-notif-extra";
/** Avisos que se ven antes de "Ver todas las notificaciones". */
const VISIBLES = 5;

/**
 * Barra lateral derecha fija de notificaciones (todos los módulos), bajo el encabezado.
 * Se abre / cierra con "Notificaciones (n)"; los avisos son los de la campana (lib/notificaciones.ts).
 */
export function NotificationSidebar({ notifs, vistas, abierta, onToggle }: { notifs: Notificacion[]; vistas: string[]; abierta: boolean; onToggle: () => void }) {
  const ir = useIr();
  const [todas, setTodas] = useState(false);
  const visto = new Set(vistas);
  const lista = todas ? notifs : notifs.slice(0, VISIBLES);

  const marcar = (clave: string) => {
    const activas = new Set(notifs.map((n) => n.clave));
    guardarPrefs({ notifVistas: Array.from(new Set([...vistas.filter((v) => activas.has(v)), clave])).slice(-300) });
  };

  return (
    <>
      {/* Pestaña para abrir cuando está cerrada */}
      {!abierta && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          className="fixed right-2 top-[72px] z-40 flex items-center gap-1.5 rounded-lg border border-[#1f2937] bg-[#111827] px-2.5 py-1.5 text-[13px] font-bold text-white shadow-lg transition hover:border-gray-600 print:hidden"
          style={{ fontFamily: TIMES }}
        >
          <Bell size={14} className="text-amber-400" /> Notificaciones ({notifs.length})
        </button>
      )}

      <aside
        // Sin transform: los modales de las secciones del módulo (position fixed) deben seguir centrados en pantalla
        className={`fixed top-16 z-30 h-[calc(100vh-64px)] w-[min(320px,85vw)] overflow-y-auto border-l border-[#1f2937] bg-[#111827] p-5 pb-28 transition-[right] duration-300 print:hidden ${abierta ? "right-0" : "pointer-events-none -right-[340px]"}`}
        style={{ fontFamily: TIMES }}
        aria-hidden={!abierta}
      >
        <button type="button" onClick={onToggle} aria-expanded={abierta} className="mb-6 flex w-full items-center gap-2 text-left" title="Ocultar notificaciones">
          <Bell className="h-5 w-5 text-amber-400" />
          <h3 className="flex-1 text-[18px] font-bold text-white">Notificaciones ({notifs.length})</h3>
          <ChevronsRight className="h-5 w-5 text-gray-400" />
        </button>

        {notifs.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] text-gray-400">
            <BellOff size={16} /> Todo al día
          </p>
        ) : (
          <div className="space-y-5">
            {lista.map((n) => (
              <button
                key={n.clave}
                type="button"
                onClick={() => {
                  marcar(n.clave);
                  ir(n.href);
                }}
                className="flex w-full gap-3 text-left"
              >
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${visto.has(n.clave) ? "bg-gray-600" : "bg-amber-400"}`} />
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold text-white">{n.titulo}</span>
                  <span className="block text-[14px] text-gray-400">
                    {n.detalle} · {n.modulo}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {notifs.length > VISIBLES && (
          <button type="button" onClick={() => setTodas(!todas)} className="mt-8 text-sm text-blue-400 hover:text-blue-300">
            {todas ? "Ver menos" : "Ver todas las notificaciones →"}
          </button>
        )}

        {/* Secciones del módulo abierto (Tesorería: requerimientos por revisar con sus botones) */}
        <div id={ID_NOTIF_EXTRA} className="mt-8 space-y-2 empty:hidden" />
      </aside>
    </>
  );
}

export default NotificationSidebar;
