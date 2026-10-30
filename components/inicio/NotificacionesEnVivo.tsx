"use client";

import { Bell } from "lucide-react";
import type { Sesion } from "@/lib/auth";
import type { ModuloInicio } from "@/lib/inicioModulos";
import { irA } from "@/lib/navegacion";
import { useNotificaciones } from "@/lib/notificaciones";
import { NOMBRE_MODULO_NOTIF, marcarLeidas, useNotifFlujo } from "@/lib/notificacionesFlujo";

// Notificaciones en vivo del INICIO (rediseño de Williams, 2026-10-30): siempre visibles, no detrás de la campana.
// Fuente: tabla notificaciones (avisos del flujo 26W, en vivo por Realtime; RLS: su módulo o asignadas a él).
// Sin el SQL 20261107_notificaciones_flujo.sql, los avisos calculados del ERP (los mismos de la campana).

const MAX = 6;

interface Aviso {
  id: string;
  titulo: string;
  detalle: string;
  href: string;
  nueva: boolean;
}

const hace = (iso: string): string => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

export function NotificacionesEnVivo({ sesion, modulo }: { sesion: Sesion | null; modulo: ModuloInicio }) {
  const flujo = useNotifFlujo(!!sesion);
  const calculadas = useNotificaciones(sesion);
  const clave = modulo.toUpperCase();

  const avisos: Aviso[] = flujo.disponible
    ? flujo.items
        // SOPORTE ve todos; cada módulo, los suyos (RLS ya filtra; esto ordena lo que ve SOPORTE en otros INICIO)
        .filter((n) => modulo === "soporte" || n.modulo === clave)
        .sort((a, b) => Number(a.leida) - Number(b.leida) || b.created_at.localeCompare(a.created_at))
        .slice(0, MAX)
        .map((n) => ({
          id: n.id,
          titulo: n.titulo,
          detalle: [NOMBRE_MODULO_NOTIF[n.modulo] ?? n.modulo, n.codigo_expediente, hace(n.created_at)].filter(Boolean).join(" · "),
          href: n.href ?? "",
          nueva: !n.leida,
        }))
    : calculadas.slice(0, MAX).map((n) => ({ id: n.clave, titulo: n.titulo, detalle: `${n.modulo} · ${n.detalle}`, href: n.href, nueva: true }));
  const nuevas = avisos.filter((a) => a.nueva).length;

  const ir = (a: Aviso) => {
    if (flujo.disponible && a.nueva) void marcarLeidas([a.id]);
    if (a.href) irA(a.href);
  };

  return (
    <section className="rounded-xl border border-[#2A2D3A] bg-[#1C1E26] p-4" data-sin-guardar>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
          <Bell size={16} /> Notificaciones en vivo
          {nuevas > 0 && <span className="rounded-full bg-[#FF6D00] px-2 py-0.5 text-[11px] font-bold text-white">{nuevas}</span>}
        </h2>
        <span className="flex items-center gap-1.5 text-[12px] text-[#4ade80]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#4ade80]" /> en vivo
        </span>
      </div>
      {avisos.length === 0 ? (
        <p className="text-[13px] text-[#9CA3AF]">Sin avisos pendientes.</p>
      ) : (
        <ul className="space-y-2">
          {avisos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-transparent bg-[#23252F] p-3 transition hover:border-[#FF6D00]/50">
              <div className="min-w-0">
                <p className="flex gap-2 text-[13px] font-medium text-white">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.nueva ? "bg-[#FF6D00]" : "bg-[#4B5563]"}`} />
                  <span className="min-w-0 break-words">{a.titulo}</span>
                </p>
                <p className="truncate pl-4 text-[12px] text-[#9CA3AF]">{a.detalle}</p>
              </div>
              {a.href && (
                <button type="button" onClick={() => ir(a)} className="shrink-0 rounded-lg bg-[#2A2D3A] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3A3D4A]">
                  Ir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
