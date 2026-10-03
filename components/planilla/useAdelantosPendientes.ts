"use client";

import { useCallback, useEffect, useState } from "react";
import { obtenerAdelantosPendientesPorTrabajador, type PendientesTrabajador } from "@/lib/adelantos";
import { createClient } from "@/lib/supabase/client";

/**
 * Adelantos con estado 'pendiente' agrupados por trabajador, siempre al día:
 * un adelanto registrado (o descontado al pagar la planilla) en otra PC se refleja al instante.
 */
export function useAdelantosPendientes() {
  const [grupos, setGrupos] = useState<Map<string, PendientesTrabajador>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    try {
      setGrupos(await obtenerAdelantosPendientesPorTrabajador());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer los adelantos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const sb = createClient();
    const canal = sb
      .channel(`adelantos-pendientes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "adelantos" }, () => void recargar())
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") void recargar();
      });
    void recargar();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [recargar]);

  return { grupos, error, cargando, recargar };
}
