"use client";

// =====================================================================
// useSync(): sincronización offline-first de las apps (Windows / Android).
//   - Cada 30 s, al volver la señal (evento "online") y al guardar algo en la cola, sube sync_queue a
//     Supabase (lib/offline/cola.ts: 3 reintentos, last-write-wins, conflictos a Administración).
//   - Luego relee del servidor lo que cambió y reserva números para emitir sin señal.
// En el navegador no hace nada (la web sigue igual que siempre).
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { getSesion } from "@/lib/auth";
import { EV_SYNC, estadoCola, procesarCola, reintentarErrores, type ResultadoSync } from "@/lib/offline/cola";
import { esAppNativa } from "@/lib/offline/plataforma";
import { enLinea } from "@/lib/offline/red";
import { trasSincronizar } from "@/lib/storage";

export const INTERVALO_SYNC_MS = 30_000;

export interface EstadoSync {
  activo: boolean;
  enLinea: boolean;
  sincronizando: boolean;
  pendientes: number;
  errores: number;
  ultimoError: string | null;
  ultimaSync: Date | null;
}

export function useSync(): EstadoSync & { sincronizar: () => Promise<void>; reintentar: () => Promise<void> } {
  const activo = typeof window !== "undefined" && esAppNativa();
  const [estado, setEstado] = useState<EstadoSync>({
    activo,
    enLinea: true,
    sincronizando: false,
    pendientes: 0,
    errores: 0,
    ultimoError: null,
    ultimaSync: null,
  });
  const ocupado = useRef(false);

  const refrescar = useCallback(async () => {
    if (!activo) return;
    const c = await estadoCola().catch(() => null);
    setEstado((e) => ({ ...e, enLinea: enLinea(), ...(c ?? {}) }));
  }, [activo]);

  const sincronizar = useCallback(async () => {
    if (!activo || ocupado.current || !getSesion()) return;
    if (!enLinea()) return void refrescar();
    ocupado.current = true;
    setEstado((e) => ({ ...e, sincronizando: true }));
    try {
      const r: ResultadoSync = await procesarCola(getSesion()?.usuario);
      if (!r.sinRed) await trasSincronizar(r.claves);
      setEstado((e) => ({ ...e, ultimaSync: r.sinRed ? e.ultimaSync : new Date() }));
    } catch (e) {
      console.warn("sync:", (e as Error).message);
    } finally {
      ocupado.current = false;
      setEstado((e) => ({ ...e, sincronizando: false }));
      await refrescar();
    }
  }, [activo, refrescar]);

  const reintentar = useCallback(async () => {
    await reintentarErrores();
    await sincronizar();
  }, [sincronizar]);

  useEffect(() => {
    if (!activo) return;
    void refrescar();
    const primera = setTimeout(() => void sincronizar(), 3000);
    const timer = setInterval(() => void sincronizar(), INTERVALO_SYNC_MS);
    const alVolver = () => void sincronizar();
    const alCaer = () => void refrescar();
    const alEncolar = () => void refrescar();
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaer);
    window.addEventListener("erp:cola", alEncolar);
    window.addEventListener(EV_SYNC, alEncolar);
    window.addEventListener("erp:sesion", alVolver);
    return () => {
      clearTimeout(primera);
      clearInterval(timer);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alCaer);
      window.removeEventListener("erp:cola", alEncolar);
      window.removeEventListener(EV_SYNC, alEncolar);
      window.removeEventListener("erp:sesion", alVolver);
    };
  }, [activo, refrescar, sincronizar]);

  return { ...estado, sincronizar, reintentar };
}
