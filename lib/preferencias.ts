"use client";

// =====================================================================
// Preferencias de interfaz por usuario (tabla user_preferences, ver
// supabase/user_preferences.sql): tema, menú lateral, orden de tarjetas
// del Dashboard y notificaciones vistas. Siguen al usuario en cualquier PC.
// El tema también se copia en localStorage para pintarlo antes de cargar
// (evita el destello claro→oscuro); la fuente de verdad es Supabase.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

export type Tema = "claro" | "oscuro" | "sistema";
export type EstiloMenu = "grafito" | "rojo";

export interface Prefs {
  tema?: Tema;
  menuPlegado?: boolean;
  menuEstilo?: EstiloMenu;
  /** Ids de las tarjetas del Dashboard en el orden elegido. */
  ordenDashboard?: string[];
  /** Claves de notificaciones ya vistas (se guardan las últimas 300). */
  notifVistas?: string[];
}

const EVENTO = "erp:prefs";
export const CLAVE_TEMA = "erp_tema";
let prefs: Prefs = {};
let usuario: string | null = null;
let cargando: Promise<void> | null = null;
let pendiente: ReturnType<typeof setTimeout> | null = null;

const avisar = () => window.dispatchEvent(new Event(EVENTO));

/** Aplica el tema a <html> (clase .dark) con una transición corta de colores. */
export function aplicarTema(tema: Tema | undefined, animar = false): void {
  const oscuro = tema === "oscuro" || ((tema ?? "sistema") === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const html = document.documentElement;
  if (animar) {
    html.classList.add("cambiando-tema");
    setTimeout(() => html.classList.remove("cambiando-tema"), 250);
  }
  html.classList.toggle("dark", oscuro);
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema ?? "sistema");
  } catch {
    /* almacenamiento bloqueado */
  }
}

/** Lee las preferencias del usuario logueado (una vez por sesión). */
export function cargarPrefs(): Promise<void> {
  if (cargando) return cargando;
  cargando = (async () => {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    usuario = user.id;
    const { data, error } = await sb.from("user_preferences").select("prefs").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    prefs = (data?.prefs as Prefs) ?? {};
    aplicarTema(prefs.tema);
    avisar();
  })().catch((e) => {
    cargando = null; // se reintenta en el próximo uso
    console.warn("No se pudieron leer las preferencias:", (e as Error).message);
  });
  return cargando;
}

/** Olvida las preferencias al cerrar sesión (otro usuario puede entrar en la misma PC). */
export function limpiarPrefs(): void {
  prefs = {};
  usuario = null;
  cargando = null;
  avisar();
}

/** Cambia preferencias: se ven al instante y se guardan en Supabase (agrupadas cada 500 ms). */
export function guardarPrefs(cambios: Partial<Prefs>): void {
  prefs = { ...prefs, ...cambios };
  if (cambios.tema !== undefined) aplicarTema(cambios.tema, true);
  avisar();
  if (pendiente) clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    pendiente = null;
    if (!usuario) await cargarPrefs();
    if (!usuario) return;
    const { error } = await createClient().from("user_preferences").upsert({ user_id: usuario, prefs, updated_at: new Date().toISOString() });
    if (error) console.warn("No se pudieron guardar las preferencias:", error.message);
  }, 500);
}

/** Preferencias reactivas del usuario logueado. */
export function usePrefs(): Prefs {
  const [p, setP] = useState<Prefs>(prefs);
  useEffect(() => {
    const sync = () => setP(prefs);
    window.addEventListener(EVENTO, sync);
    void cargarPrefs().then(sync);
    return () => window.removeEventListener(EVENTO, sync);
  }, []);
  return p;
}
