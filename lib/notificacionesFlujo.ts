"use client";

// =====================================================================
// Avisos del flujo v3.0 (OP → Expediente 26W) guardados en public.notificaciones.
// Los crea la base en cada paso (supabase/migrations/20261107_notificaciones_flujo.sql);
// aquí solo se leen (RLS: los asignados al usuario o a su módulo; SOPORTE ve todos) y se marcan leídos.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

export const MODULOS_NOTIF = ["LOGISTICA", "PRODUCCION", "ALMACEN", "FINANZAS"] as const;
export type ModuloNotif = (typeof MODULOS_NOTIF)[number];
export const NOMBRE_MODULO_NOTIF: Record<string, string> = { LOGISTICA: "Logística", PRODUCCION: "Producción", ALMACEN: "Almacén", FINANZAS: "Finanzas" };

export interface NotifFlujo {
  id: string;
  created_at: string;
  modulo: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  asignado_a: string | null;
  codigo_expediente: string | null;
  fase: number | null;
  href: string | null;
  leida: boolean;
}

interface Estado {
  items: NotifFlujo[];
  /** El SQL 20261107_notificaciones_flujo.sql ya se corrió (si no, la campana usa los avisos calculados). */
  disponible: boolean;
}

const LIMITE = 100;
let estado: Estado = { items: [], disponible: false };
const oyentes = new Set<(e: Estado) => void>();
let iniciado = false;

const avisar = () => oyentes.forEach((f) => f(estado));

async function recargar(): Promise<void> {
  const { data, error } = await createClient()
    .from("notificaciones")
    .select("id,created_at,modulo,tipo,titulo,mensaje,asignado_a,codigo_expediente,fase,href,leida")
    .not("tipo", "is", null)
    .order("created_at", { ascending: false })
    .limit(LIMITE);
  estado = error ? { items: [], disponible: false } : { items: (data ?? []) as NotifFlujo[], disponible: true };
  avisar();
}

function iniciar(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  void recargar();
  let t: ReturnType<typeof setTimeout> | undefined;
  createClient()
    .channel("erp-notificaciones")
    .on("postgres_changes", { event: "*", schema: "public", table: "notificaciones" }, () => {
      clearTimeout(t);
      t = setTimeout(() => void recargar(), 300);
    })
    .subscribe();
}

/** Avisos del flujo que RLS deja ver a este usuario, en vivo. `activo = false`: no descarga nada. */
export function useNotifFlujo(activo: boolean): Estado {
  const [e, setE] = useState<Estado>(estado);
  useEffect(() => {
    if (!activo) return;
    iniciar();
    setE(estado);
    oyentes.add(setE);
    return () => {
      oyentes.delete(setE);
    };
  }, [activo]);
  return e;
}

export async function marcarLeidas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Se marca en pantalla al instante; la base confirma y Realtime recarga
  const set = new Set(ids);
  estado = { ...estado, items: estado.items.map((n) => (set.has(n.id) ? { ...n, leida: true } : n)) };
  avisar();
  const { error } = await createClient().rpc("marcar_notificaciones_leidas", { p_ids: ids });
  if (error) void recargar();
}
