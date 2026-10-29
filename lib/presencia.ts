"use client";

// Usuarios conectados al ERP en este momento (Supabase Realtime Presence: no usa tablas ni SQL).

import { useEffect, useState } from "react";
import type { Sesion } from "./auth";
import { createClient } from "./supabase/client";

export interface Conectado {
  usuario: string;
  nombre: string;
  modulo: string;
}

export function usePresencia(sesion: Sesion | null, modulo: string): Conectado[] {
  const [conectados, setConectados] = useState<Conectado[]>([]);
  useEffect(() => {
    if (!sesion) return;
    const sb = createClient();
    const canal = sb.channel("erp-presencia", { config: { presence: { key: sesion.usuario } } });
    canal
      .on("presence", { event: "sync" }, () => {
        const estado = canal.presenceState<Conectado>();
        // Una fila por usuario (puede tener varias pestañas abiertas)
        setConectados(Object.values(estado).map((lista) => lista[0]).filter(Boolean));
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") void canal.track({ usuario: sesion.usuario, nombre: sesion.nombre, modulo });
      });
    return () => {
      void sb.removeChannel(canal);
    };
  }, [sesion, modulo]);
  return conectados;
}

/** Sala de videollamada (Jitsi Meet, gratuita y sin cuentas): la misma sala para todos los del módulo. */
export const urlSala = (nombre: string): string =>
  `https://meet.jit.si/ComboyVid-${nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
