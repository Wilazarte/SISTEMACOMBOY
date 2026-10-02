"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listarHistorial, obtenerHistorial, type HistorialDetalle, type HistorialPlanilla } from "@/lib/historial";

/**
 * Escucha en tiempo real una tabla del historial y vuelve a leer al haber cambios
 * (un cierre hecho en otra PC aparece al instante en el celular).
 */
function useRealtime(tabla: string, alCambiar: () => void, filtro?: string) {
  useEffect(() => {
    const sb = createClient();
    const canal = sb
      .channel(`${tabla}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla, ...(filtro ? { filter: filtro } : {}) }, () => alCambiar())
      // Al reconectar (corte de red, celular que vuelve del segundo plano) se recarga por si hubo cierres entretanto
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") alCambiar();
      });
    return () => {
      void sb.removeChannel(canal);
    };
  }, [tabla, alCambiar, filtro]);
}

/** Lista de periodos cerrados (más reciente primero), siempre al día. */
export function useHistorialPlanilla() {
  const [lista, setLista] = useState<HistorialPlanilla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setLista(await listarHistorial());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el historial.");
    } finally {
      setCargando(false);
    }
  }, []);

  useRealtime("planilla_historial", recargar);
  return { lista, cargando, error, recargar };
}

/** Un periodo cerrado con su detalle (solo lectura). */
export function useHistorialDetalle(id: string) {
  const [datos, setDatos] = useState<{ cabecera: HistorialPlanilla; detalle: HistorialDetalle[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setDatos(await obtenerHistorial(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el periodo.");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useRealtime("planilla_historial", recargar, `id=eq.${id}`);
  return { datos, cargando, error, recargar };
}
