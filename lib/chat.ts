"use client";

// Chat grupal de la planta (tabla chat_mensajes, supabase/migrations/20261104_chat_grupal.sql).

import { useCallback, useEffect, useState } from "react";
import type { Sesion } from "./auth";
import { createClient } from "./supabase/client";

export interface MensajeChat {
  id: string;
  creado: string;
  usuario: string;
  nombre: string | null;
  modulo: string | null;
  texto: string;
}

const ULTIMOS = 30;

export function useChat(sesion: Sesion | null, modulo: string) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [faltaTabla, setFaltaTabla] = useState(false);

  useEffect(() => {
    if (!sesion) return;
    const sb = createClient();
    let vivo = true;
    void sb
      .from("chat_mensajes")
      .select("id,creado,usuario,nombre,modulo,texto")
      .order("creado", { ascending: false })
      .limit(ULTIMOS)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          // 42P01 / PGRST205: aún no se corrió el SQL del chat
          if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message)) setFaltaTabla(true);
          return;
        }
        setMensajes(((data ?? []) as MensajeChat[]).reverse());
      });
    const canal = sb
      .channel("erp-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensajes" }, (p) => {
        const m = p.new as MensajeChat;
        setMensajes((l) => (l.some((x) => x.id === m.id) ? l : [...l, m].slice(-ULTIMOS)));
      })
      .subscribe();
    return () => {
      vivo = false;
      void sb.removeChannel(canal);
    };
  }, [sesion]);

  const enviar = useCallback(
    async (texto: string): Promise<string | null> => {
      const t = texto.trim();
      if (!sesion || !t) return null;
      const { data, error } = await createClient()
        .from("chat_mensajes")
        .insert({ usuario: sesion.usuario, nombre: sesion.nombre, modulo, texto: t.slice(0, 1000) })
        .select("id,creado,usuario,nombre,modulo,texto")
        .single();
      if (error) return error.message;
      const m = data as MensajeChat;
      setMensajes((l) => (l.some((x) => x.id === m.id) ? l : [...l, m].slice(-ULTIMOS)));
      return null;
    },
    [sesion, modulo]
  );

  return { mensajes, enviar, faltaTabla };
}
