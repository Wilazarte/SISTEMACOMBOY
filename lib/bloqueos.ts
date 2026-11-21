"use client";

// =====================================================================
// Bloqueo por N° de serie / documento (Fase 3): antes de editar una OC o un
// registro de Kardex se pide el bloqueo en Supabase (tomar_bloqueo, SELECT FOR
// UPDATE). Si otro usuario lo tiene: "En edición por Logística desde 10:32".
// Se renueva cada 4 min mientras la pantalla está abierta y se suelta al cerrar.
// Sin señal (o sin el SQL 20261114) no bloquea: la cola offline y la tabla
// conflictos resuelven después (last-write-wins, nada se borra).
// =====================================================================

import { useEffect, useState } from "react";
import { getSesion } from "./auth";
import { ETIQUETA_PERFIL, perfilPlanta } from "./permisosPlanta";
import { createClient } from "./supabase/client";
import { idDispositivo } from "./offline/plataforma";
import { esErrorDeRed } from "./offline/red";

export interface EstadoBloqueo {
  /** true: este usuario puede editar. */
  libre: boolean;
  cargando: boolean;
  /** Texto para mostrar cuando otro lo está editando. */
  mensaje: string | null;
  /** No se pudo verificar (sin señal o sin la migración): se permite editar. */
  sinVerificar: boolean;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

const NOMBRE_ROL: Record<string, string> = { tesoreria: "Tesorería", almacen: "Almacén", creador: "SOPORTE", planilla: "Planilla", sucursal: "Secocha" };

function etiquetaMia(): string {
  const s = getSesion();
  if (!s) return "";
  const p = perfilPlanta(s);
  if (p && p !== "soporte") return ETIQUETA_PERFIL[p].label.charAt(0) + ETIQUETA_PERFIL[p].label.slice(1).toLowerCase();
  return NOMBRE_ROL[s.rol] ?? s.nombre ?? s.rol;
}

export async function tomarBloqueo(serie: string, tabla = "oc"): Promise<EstadoBloqueo> {
  const { data, error } = await createClient().rpc("tomar_bloqueo", { p_serie: serie, p_tabla: tabla, p_etiqueta: etiquetaMia(), p_dispositivo: idDispositivo() });
  if (error) {
    if (error.code === "42501") return { libre: false, cargando: false, mensaje: error.message, sinVerificar: false };
    // Sin la función (SQL pendiente) o sin señal: se edita igual
    if (esErrorDeRed(error) || error.code === "PGRST202" || /could not find the function/i.test(error.message))
      return { libre: true, cargando: false, mensaje: null, sinVerificar: true };
    throw error;
  }
  const r = data as { ok: boolean; locked_by?: string; etiqueta?: string; locked_at?: string };
  if (r.ok) return { libre: true, cargando: false, mensaje: null, sinVerificar: false };
  return {
    libre: false,
    cargando: false,
    mensaje: `En edición por ${r.etiqueta || r.locked_by} desde ${r.locked_at ? hora(r.locked_at) : "hace un momento"}${r.etiqueta && r.locked_by ? ` (${r.locked_by})` : ""}`,
    sinVerificar: false,
  };
}

export async function soltarBloqueo(serie: string): Promise<void> {
  try {
    await createClient().rpc("soltar_bloqueo", { p_serie: serie });
  } catch {
    /* caduca solo a los 10 min */
  }
}

/** Toma el bloqueo al abrir la pantalla, lo renueva y lo suelta al cerrar. Reintenta cuando el otro lo suelta. */
export function useBloqueoSerie(serie: string | null | undefined, tabla = "oc"): EstadoBloqueo {
  const [estado, setEstado] = useState<EstadoBloqueo>({ libre: false, cargando: true, mensaje: null, sinVerificar: false });
  useEffect(() => {
    if (!serie) return;
    let vivo = true;
    let mio = false;
    const pedir = () =>
      tomarBloqueo(serie, tabla)
        .then((e) => {
          mio = e.libre && !e.sinVerificar;
          if (vivo) setEstado(e);
        })
        .catch((e) => vivo && setEstado({ libre: true, cargando: false, mensaje: null, sinVerificar: true }) && console.warn("bloqueo:", (e as Error).message));
    void pedir();
    const renovar = setInterval(() => void pedir(), 4 * 60_000);
    // Cuando el que lo tenía lo suelta (Realtime de locks), se vuelve a pedir
    const sb = createClient();
    const canal = sb
      .channel(`lock-${serie}`)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "locks" }, () => {
        if (!mio) void pedir();
      })
      .subscribe();
    return () => {
      vivo = false;
      clearInterval(renovar);
      void sb.removeChannel(canal);
      if (mio) void soltarBloqueo(serie);
    };
  }, [serie, tabla]);
  return estado;
}
