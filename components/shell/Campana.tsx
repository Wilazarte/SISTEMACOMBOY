"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Boxes, ClipboardList, Factory, FolderOpen, PackageCheck, PackagePlus, Receipt, Store, Truck, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { useSesion } from "@/lib/auth";
import type { Notificacion, TipoNotif } from "@/lib/notificaciones";
import { MODULOS_NOTIF, NOMBRE_MODULO_NOTIF, marcarLeidas, useNotifFlujo, type NotifFlujo } from "@/lib/notificacionesFlujo";
import { perfilPlanta } from "@/lib/permisosPlanta";
import { guardarPrefs } from "@/lib/preferencias";
import { useIr } from "./ir";

const ICONO: Record<TipoNotif, LucideIcon> = { despacho: Truck, requerimiento: ClipboardList, factura: Receipt, qc: PackageCheck, stock: Boxes, sucursal: Store, producto: PackagePlus, expediente: FolderOpen };
const ICONO_MODULO: Record<string, LucideIcon> = { LOGISTICA: Truck, PRODUCCION: Factory, ALMACEN: Boxes, FINANZAS: Wallet };

type Pestana = "TODOS" | (typeof MODULOS_NOTIF)[number];

/**
 * Campana: avisos calculados en vivo ("vistas" en las preferencias) + avisos del flujo v3.0 guardados en la tabla
 * notificaciones (leída en la base). Cuenta lo no leído asignado al usuario o a su módulo; SOPORTE ve todo, por pestañas.
 */
export function Campana({ notifs, vistas }: { notifs: Notificacion[]; vistas: string[] }) {
  const ir = useIr();
  const { sesion } = useSesion();
  const perfil = perfilPlanta(sesion);
  const soporte = perfil === "soporte";
  const flujo = useNotifFlujo(!!perfil && perfil !== "gerencia");
  const [abierta, setAbierta] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("TODOS");
  const caja = useRef<HTMLDivElement>(null);
  const visto = new Set(vistas);
  const sinLeer = flujo.items.filter((n) => !n.leida);
  const nuevas = notifs.filter((n) => !visto.has(n.clave)).length + sinLeer.length;
  const delFlujo = pestana === "TODOS" ? flujo.items : flujo.items.filter((n) => n.modulo === pestana);
  const calculados = pestana === "TODOS" ? notifs : [];

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
              <button
                onClick={() => {
                  marcar(notifs.map((n) => n.clave));
                  void marcarLeidas(delFlujo.filter((n) => !n.leida).map((n) => n.id));
                }}
                className="rounded-md px-1.5 py-1 text-xs font-medium text-rojo hover:bg-rojo-soft"
              >
                Marcar todo como leído
              </button>
            )}
          </div>
          {soporte && flujo.disponible && (
            <div className="flex gap-1 overflow-x-auto border-b border-plomo-200 px-3 py-2" role="tablist" aria-label="Notificaciones por módulo">
              {(["TODOS", ...MODULOS_NOTIF] as Pestana[]).map((m) => {
                const n = m === "TODOS" ? sinLeer.length : sinLeer.filter((x) => x.modulo === m).length;
                return (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={pestana === m}
                    onClick={() => setPestana(m)}
                    className={cn("shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold transition", pestana === m ? "bg-corp text-white" : "text-fg-2 hover:bg-plomo-50")}
                  >
                    {m === "TODOS" ? "Todos" : NOMBRE_MODULO_NOTIF[m]}
                    {n > 0 && <span className="ml-1 opacity-80">({n})</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="max-h-[420px] overflow-y-auto">
            {delFlujo.map((n) => (
              <ItemFlujo
                key={n.id}
                n={n}
                onAbrir={() => {
                  if (!n.leida) void marcarLeidas([n.id]);
                  setAbierta(false);
                  if (n.href) ir(n.href);
                }}
              />
            ))}
            {delFlujo.length === 0 && calculados.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-sm text-plomo-500">
                <BellOff size={22} /> Todo al día
              </div>
            ) : (
              calculados.map((n) => {
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

/** Aviso del flujo v3.0 (tabla notificaciones): fase, módulo destino y fecha. */
function ItemFlujo({ n, onAbrir }: { n: NotifFlujo; onAbrir: () => void }) {
  const Icon = ICONO_MODULO[n.modulo] ?? FolderOpen;
  return (
    <button onClick={onAbrir} className="flex w-full gap-3 border-b border-plomo-100 px-4 py-3 text-left transition-colors hover:bg-plomo-50">
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", n.leida ? "bg-plomo-100 text-plomo-500" : "bg-rojo-soft text-rojo")}>
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] leading-snug", n.leida ? "font-medium text-fg-2" : "font-semibold text-fg")}>{n.titulo}</span>
        {n.mensaje && <span className="mt-0.5 block truncate text-xs text-plomo-500">{n.mensaje}</span>}
        <span className="mt-0.5 block text-[11px] text-plomo-500">
          Flujo v3.0{n.fase ? ` · fase ${n.fase}` : ""} · para {NOMBRE_MODULO_NOTIF[n.modulo] ?? n.modulo} · {new Date(n.created_at).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
        </span>
      </span>
      {!n.leida && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-corp ring-[3px] ring-rojo-soft" aria-label="Sin leer" />}
    </button>
  );
}
