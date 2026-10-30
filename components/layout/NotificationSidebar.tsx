"use client";

import { useState } from "react";
import { AlertTriangle, Bell, BellOff, ChevronsRight } from "lucide-react";
import { ErpAlertList } from "@/components/erp/ErpAlertList";
import type { Notificacion } from "@/lib/notificaciones";
import { guardarPrefs } from "@/lib/preferencias";
import { useIr } from "@/components/shell/ir";

const TIMES = '"Times New Roman", Times, serif';
/** Aquí se dibujan secciones propias de un módulo (p. ej. "Requerimientos por revisar" de Tesorería). */
export const ID_NOTIF_EXTRA = "erp-notif-extra";
/** Avisos que se ven antes de "Ver todas las notificaciones". */
const VISIBLES = 5;

/**
 * Barra lateral derecha fija de notificaciones (todos los módulos), bajo el encabezado.
 * Se abre / cierra con "Notificaciones (n)"; los avisos son los de la campana (lib/notificaciones.ts).
 */
export function NotificationSidebar({
  notifs,
  vistas,
  abierta,
  onToggle,
  enSeccion = [],
}: {
  notifs: Notificacion[];
  vistas: string[];
  abierta: boolean;
  onToggle: () => void;
  /** Tipos que el módulo abierto ya muestra como tarjetas en su sección (Tesorería: requerimientos): no se repiten arriba. */
  enSeccion?: Notificacion["tipo"][];
}) {
  const ir = useIr();
  const [todas, setTodas] = useState(false);
  const visto = new Set(vistas);
  // Cada aviso una sola vez: sin claves repetidas y sin los que ya tienen su tarjeta abajo
  const vistos = new Set<string>();
  const unicas = notifs.filter((n) => {
    if (vistos.has(n.clave) || enSeccion.includes(n.tipo)) return false;
    vistos.add(n.clave);
    return true;
  });
  const lista = todas ? unicas : unicas.slice(0, VISIBLES);

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
          className="fixed right-2 top-[72px] z-40 flex items-center gap-1.5 rounded-lg border border-[#2a3445] bg-[#1a212e] px-2.5 py-1.5 text-[13px] font-bold text-white shadow-lg transition hover:border-[#2a7bff] print:hidden"
          style={{ fontFamily: TIMES }}
        >
          <Bell size={14} className="text-[#2a7bff]" /> Notificaciones ({notifs.length})
        </button>
      )}

      <aside
        // Sin transform: los modales de las secciones del módulo (position fixed) deben seguir centrados en pantalla
        className={`fixed top-16 z-30 h-[calc(100vh-64px)] w-[min(320px,85vw)] overflow-y-auto border-l border-[#2a3445] bg-[#1a212e]/95 p-5 backdrop-blur pb-28 transition-[right] duration-300 print:hidden ${abierta ? "right-0" : "pointer-events-none -right-[340px]"}`}
        style={{ fontFamily: TIMES }}
        aria-hidden={!abierta}
      >
        <button type="button" onClick={onToggle} aria-expanded={abierta} className="mb-6 flex w-full items-center gap-2 text-left" title="Ocultar notificaciones">
          <Bell className="h-5 w-5 text-[#2a7bff]" />
          <h3 className="flex-1 text-[17px] font-bold uppercase text-[#60a5fa]">Notificaciones ({notifs.length})</h3>
          <ChevronsRight className="h-5 w-5 text-[#a1a1aa]" />
        </button>

        {unicas.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] text-[#a1a1aa]">
            <BellOff size={16} /> {notifs.length ? "Los avisos de este módulo están abajo" : "Todo al día"}
          </p>
        ) : (
          // Mismo estilo de lista que Logística Planta: NOTIFICACIONES y ALERTAS (stock)
          <div className="space-y-5">
            {(
              [
                ["Notificaciones", <Bell key="b" size={15} />, lista.filter((n) => n.tipo !== "stock"), "Sin notificaciones nuevas."],
                ["Alertas", <AlertTriangle key="a" size={15} />, lista.filter((n) => n.tipo === "stock"), "Sin alertas."],
              ] as const
            ).map(([titulo, icono, items, vacio]) => (
              <ErpAlertList
                key={titulo}
                titulo={titulo}
                icono={icono}
                vacio={vacio}
                items={items.map((n) => ({
                  clave: n.clave,
                  titulo: n.titulo,
                  detalle: `${n.detalle} · ${n.modulo}`,
                  nuevo: !visto.has(n.clave),
                  onClick: () => {
                    marcar(n.clave);
                    ir(n.href);
                  },
                }))}
              />
            ))}
          </div>
        )}

        {unicas.length > VISIBLES && (
          <button type="button" onClick={() => setTodas(!todas)} className="mt-6 text-sm font-semibold text-[#60a5fa] hover:text-[#93c5fd]">
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
