"use client";

// =====================================================================
// Avisos del flujo v3.0 (OP → Expediente 26W) guardados en public.notificaciones.
// Los crea la base en cada paso (supabase/migrations/20261107_notificaciones_flujo.sql);
// aquí solo se leen (RLS: los asignados al usuario o a su módulo; SOPORTE ve todos) y se marcan leídos.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { getVistaSede } from "./storage";

export const MODULOS_NOTIF = ["LOGISTICA", "PRODUCCION", "ALMACEN", "FINANZAS"] as const;
export type ModuloNotif = (typeof MODULOS_NOTIF)[number];
export const NOMBRE_MODULO_NOTIF: Record<string, string> = { LOGISTICA: "Logística", PRODUCCION: "Producción", ALMACEN: "Almacén", FINANZAS: "Finanzas", VENTAS: "Ventas" };

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
  /** REQ_ALMACEN: { req_id, numero, evento } (SQL 20261117). */
  datos?: Record<string, unknown> | null;
  /** Sede del aviso (SQL 20261201_secocha_fase2.sql); sin la columna, undefined. */
  sede_id?: string | null;
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

const COLUMNAS = "id,created_at,modulo,tipo,titulo,mensaje,asignado_a,codigo_expediente,fase,href,leida,datos";
let conSede = true;

async function recargar(): Promise<void> {
  const consulta = (cols: string) =>
    createClient().from("notificaciones").select(cols).not("tipo", "is", null).order("created_at", { ascending: false }).limit(LIMITE);
  let { data, error } = await consulta(conSede ? `${COLUMNAS},sede_id` : COLUMNAS);
  // Sin la columna sede_id (falta 20261201_secocha_fase2.sql): se lee como antes
  if (error && conSede && (error.code === "42703" || /sede_id/i.test(error.message))) {
    conSede = false;
    ({ data, error } = await consulta(COLUMNAS));
  }
  // REQ de Almacén: abren Tesorería > NUEVOS REQ (el SQL 20261117 guarda solo /dashboard/compras)
  const items = ((data ?? []) as unknown as NotifFlujo[]).map((n) => (n.tipo === "REQ_ALMACEN" ? { ...n, href: "/dashboard/compras?tab=nuevos" } : n));
  estado = error ? { items: [], disponible: false } : { items, disponible: true };
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

/** Avisos de la sede en pantalla: Arequipa no ve los de Secocha y Secocha solo los suyos (la base ya lo filtra). */
function deLaSede(e: Estado): Estado {
  const v = getVistaSede();
  if (!v) return e;
  const items = e.items.filter((n) => (v.modo === "sucursal" ? !n.sede_id || n.sede_id === v.propia : !n.sede_id || !v.ajenas.includes(n.sede_id)));
  return items.length === e.items.length ? e : { ...e, items };
}

/** Avisos del flujo que RLS deja ver a este usuario, en vivo. `activo = false`: no descarga nada. */
export function useNotifFlujo(activo: boolean): Estado {
  const [e, setE] = useState<Estado>(estado);
  const [, setVista] = useState(0);
  useEffect(() => {
    if (!activo) return;
    iniciar();
    setE(estado);
    oyentes.add(setE);
    const onVista = () => setVista((n) => n + 1);
    window.addEventListener("erp:vista-sede", onVista);
    return () => {
      oyentes.delete(setE);
      window.removeEventListener("erp:vista-sede", onVista);
    };
  }, [activo]);
  return deLaSede(e);
}

/** Ids de los REQ de Almacén que ya tienen aviso en la tabla (SQL 20261117): la campana no los repite. */
export const reqsConAviso = (items: NotifFlujo[]): Set<string> =>
  new Set(items.filter((n) => n.tipo === "REQ_ALMACEN").map((n) => String(n.datos?.req_id ?? "")));

export async function marcarLeidas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  // Se marca en pantalla al instante; la base confirma y Realtime recarga
  const set = new Set(ids);
  estado = { ...estado, items: estado.items.map((n) => (set.has(n.id) ? { ...n, leida: true } : n)) };
  avisar();
  const { error } = await createClient().rpc("marcar_notificaciones_leidas", { p_ids: ids });
  if (error) void recargar();
}
