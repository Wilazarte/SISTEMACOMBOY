"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, Check, Eye, MessageSquareWarning, X } from "lucide-react";
import { Badge, Button, cn, ejecutar } from "@/components/ui";
import { abrirDoc } from "@/components/doc-viewer";
import { useComprasActions } from "@/components/compras/useComprasActions";
import { KEYS, aceptarRequerimiento, fechaPE, puede, recargarDatos, useRol, useStore } from "@/lib/storage";
import type { Requerimiento } from "@/lib/types";

/** sessionStorage: el recordatorio de pendientes sale una sola vez por sesión (se borra al cerrar sesión). */
export const CLAVE_RECORDATORIO = "notif_login_shown";
const MAX_ITEMS = 15;
const REFRESCO_MS = 60_000;
const RUTA_TESORERIA = "/dashboard/compras";

const yaMostrado = (): boolean => {
  try {
    return window.sessionStorage.getItem(CLAVE_RECORDATORIO) === "1";
  } catch {
    return true; // almacenamiento bloqueado: mejor no insistir en cada carga
  }
};
const marcarMostrado = (): void => {
  try {
    window.sessionStorage.setItem(CLAVE_RECORDATORIO, "1");
  } catch {
    /* almacenamiento bloqueado */
  }
};

/** Una línea de detalle: el motivo o, si no hay, el primer producto. */
function detalleDe(r: Requerimiento): string {
  if (r.motivo?.trim()) return r.motivo.trim();
  const i = r.items[0];
  if (!i) return r.sede;
  return `${i.cantidad} ${i.unidad} — ${i.nombre}${r.items.length > 1 ? ` (+${r.items.length - 1})` : ""}`;
}

/**
 * Campana de Tesorería: requerimientos de Almacén por revisar (tabla compras, tipo req_pendiente).
 * Los datos vienen de la caché sincronizada con Supabase (Realtime); además se releen cada 60 s.
 */
export function NotificationBell() {
  const router = useRouter();
  const ruta = usePathname();
  const [rol] = useRol();
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const [abierto, setAbierto] = useState(false);
  const [recordatorio, setRecordatorio] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const total = pendientes.length;
  const lista = pendientes.slice(0, MAX_ITEMS);
  const habilitado = puede(rol, "req.revisar");
  const { observar, rechazar, modales } = useComprasActions(rol);

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  // Respaldo de Realtime: relee los pendientes cada 60 s (solo con la pestaña visible)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void recargarDatos(KEYS.REQS_PENDIENTES);
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  // Recordatorio al iniciar sesión: una vez por sesión, a los 1.5 s, si hay pendientes
  const totalRef = useRef(total);
  totalRef.current = total;
  useEffect(() => {
    if (yaMostrado()) return;
    const t = setTimeout(() => {
      if (totalRef.current > 0) {
        marcarMostrado();
        setRecordatorio(true);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const irATesoreria = () => {
    setAbierto(false);
    setRecordatorio(false);
    if (ruta !== RUTA_TESORERIA) router.push(RUTA_TESORERIA);
  };

  return (
    <>
      <div ref={caja} className="relative">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className={cn("relative rounded-full p-2 text-azul-900 hover:bg-plomo-100", abierto && "bg-plomo-100")}
          title="Requerimientos por revisar"
          aria-label={`Requerimientos por revisar: ${total}`}
          aria-haspopup="true"
          aria-expanded={abierto}
        >
          <Bell size={20} />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-corp px-1 text-[11px] font-bold text-white">{total}</span>
          )}
        </button>

        {abierto && (
          <div className="fixed inset-x-2 top-[76px] z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-plomo-200 bg-white shadow-[0_12px_32px_rgba(15,36,64,0.18)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[400px]">
            <div className="flex items-center gap-2 border-b-2 border-b-[#A00000] px-4 py-3">
              <Bell size={16} className="text-amber-600" />
              <h3 className="flex-1 text-sm font-semibold text-azul-900">Requerimientos por revisar</h3>
              <span className="rounded-full bg-[#A00000] px-2 text-xs font-bold text-white">{total}</span>
              <button type="button" onClick={() => setAbierto(false)} className="rounded p-1 text-plomo-500 hover:bg-plomo-100" aria-label="Cerrar">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-plomo-50 p-3">
              {lista.length === 0 ? (
                <p className="py-8 text-center text-sm text-plomo-500">No hay requerimientos pendientes.</p>
              ) : (
                lista.map((r) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={irATesoreria}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), irATesoreria())}
                    className="cursor-pointer rounded-lg border-2 border-amber-300 bg-amber-50 p-3 transition hover:border-amber-400 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-azul-900">{r.numero}</p>
                        <p className="truncate text-xs text-plomo-600">
                          {fechaPE(r.fecha)} · {r.solicitante}
                        </p>
                      </div>
                      <Badge estado="PENDIENTE" />
                    </div>
                    <p className="mt-1.5 truncate text-xs text-slate-700" title={detalleDe(r)}>
                      {detalleDe(r)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="secondary" onClick={() => abrirDoc({ tipo: "REQ", id: r.id })}>
                        <Eye size={14} /> Ver
                      </Button>
                      <Button size="sm" variant="success" disabled={!habilitado} onClick={() => ejecutar(() => aceptarRequerimiento(r.id, rol), `${r.numero} ACEPTADO`)}>
                        <Check size={14} /> Aceptar
                      </Button>
                      {/* Observar / Rechazar abren su modal: se cierra el desplegable (el clic en el modal contaría como "fuera") */}
                      <Button size="sm" variant="warning" disabled={!habilitado} onClick={() => { setAbierto(false); observar(r); }}>
                        <MessageSquareWarning size={14} /> Observar
                      </Button>
                      <Button size="sm" variant="danger" disabled={!habilitado} onClick={() => { setAbierto(false); rechazar(r); }}>
                        <X size={14} /> Rechazar
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {total > lista.length && <p className="pt-1 text-center text-xs text-plomo-500">Mostrando {lista.length} de {total}</p>}
            </div>

            <Link
              href={RUTA_TESORERIA}
              onClick={() => setAbierto(false)}
              className="flex items-center justify-center gap-1.5 border-t border-plomo-200 bg-white px-4 py-3 text-sm font-semibold text-[#A00000] hover:bg-plomo-50"
            >
              Ver todos en Tesorería <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>

      {modales}

      {recordatorio && (
        <div role="alert" className="fixed bottom-4 right-4 z-[70] w-[min(92vw,380px)] overflow-hidden rounded-xl bg-white shadow-[0_16px_40px_rgba(15,36,64,0.25)]">
          <div className="flex items-start gap-3 border-l-4 border-l-[#A00000] p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#A00000] text-white">
              <Bell size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-azul-900">
                🔔 Tienes {total} requerimiento{total === 1 ? "" : "s"} por revisar en Tesorería / Compras
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={irATesoreria} className="rounded-lg bg-[#A00000] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-vino-900">
                  Ir a revisar
                </button>
                <button type="button" onClick={() => setRecordatorio(false)} className="rounded-lg border border-plomo-200 px-4 py-2 text-xs font-medium text-azul-900 hover:bg-plomo-50">
                  Más tarde
                </button>
              </div>
            </div>
            <button type="button" onClick={() => setRecordatorio(false)} className="rounded p-1 text-plomo-500 hover:bg-plomo-100" aria-label="Cerrar recordatorio">
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
