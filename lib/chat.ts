"use client";

// Chat grupal ÚNICO de la empresa: barra derecha fija en todos los módulos y en Secocha (components/chat/ChatGlobal.tsx).
// Tablas chat_mensajes y chat_leidos, función chat_fijar y bucket privado chat-adjuntos:
// supabase/migrations/20261128_chat_global.sql (antes 20261104_chat_grupal.sql, un grupo por módulo).

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sesion } from "./auth";
import { urlSala } from "./presencia";
import { createClient } from "./supabase/client";

export type TipoMensaje = "texto" | "archivo" | "llamada";

export interface MensajeChat {
  id: string;
  creado: string;
  usuario: string;
  nombre: string | null;
  modulo: string | null;
  texto: string;
  tipo?: TipoMensaje | null;
  adjunto_path?: string | null;
  adjunto_nombre?: string | null;
  adjunto_mime?: string | null;
  adjunto_bytes?: number | null;
  fijado?: boolean | null;
  fijado_por?: string | null;
  fijado_en?: string | null;
}

export const BUCKET_CHAT = "chat-adjuntos";
export const MAX_ADJUNTO = 50 * 1024 * 1024; // igual que file_size_limit del bucket
const ULTIMOS = 150;
const CAMPOS = "id,creado,usuario,nombre,modulo,texto,tipo,adjunto_path,adjunto_nombre,adjunto_mime,adjunto_bytes,fijado,fijado_por,fijado_en";
const CLAVE_LEIDO_LOCAL = "erp-chat-global-leido";

const faltaSql = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204" || /does not exist|schema cache|column/i.test(e.message ?? ""));

const nombreSeguro = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-80) || "archivo";

export const esImagen = (m: MensajeChat) => !!m.adjunto_mime?.startsWith("image/");
export const esVideo = (m: MensajeChat) => !!m.adjunto_mime?.startsWith("video/");
export const esAudio = (m: MensajeChat) => !!m.adjunto_mime?.startsWith("audio/");

export function tamanoLegible(b?: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toLocaleString("es-PE", { maximumFractionDigits: 1 })} MB`;
}

const agregar = (l: MensajeChat[], m: MensajeChat) => {
  const i = l.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const copia = l.slice();
    copia[i] = { ...copia[i], ...m };
    return copia;
  }
  return [...l, m].sort((a, b) => a.creado.localeCompare(b.creado)).slice(-ULTIMOS);
};

/**
 * Un solo chat para toda la empresa. `modulo`: etiqueta del módulo desde donde se escribe (LOGISTICA, SECOCHA…),
 * se muestra junto al nombre. `leidoHasta` sale de chat_leidos (mismo dato en PC y celular).
 */
export function useChatGlobal(sesion: Sesion | null, modulo: string) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [leidoHasta, setLeidoHasta] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pedidas = useRef(new Set<string>());
  const uid = useRef<string | null>(null);

  useEffect(() => {
    if (!sesion) return;
    const sb = createClient();
    let vivo = true;
    void sb.auth.getSession().then(({ data }) => {
      uid.current = data.session?.user.id ?? null;
    });
    void sb
      .from("chat_mensajes")
      .select(CAMPOS)
      .order("creado", { ascending: false })
      .limit(ULTIMOS)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          if (faltaSql(error)) setFaltaTabla(true);
          return;
        }
        setMensajes(((data ?? []) as MensajeChat[]).reverse());
      });
    void sb
      .from("chat_leidos")
      .select("leido_hasta")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        let local = "";
        try {
          local = window.localStorage.getItem(CLAVE_LEIDO_LOCAL) ?? "";
        } catch {
          /* almacenamiento bloqueado */
        }
        const remoto = !error ? ((data as { leido_hasta?: string } | null)?.leido_hasta ?? "") : "";
        // Primer uso: lo anterior cuenta como leído (no parpadea por el historial)
        setLeidoHasta((Date.parse(remoto) || 0) > (Date.parse(local) || 0) ? remoto : local || new Date().toISOString());
      });
    const canal = sb
      .channel("erp-chat-global")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensajes" }, (p) => setMensajes((l) => agregar(l, p.new as MensajeChat)))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_mensajes" }, (p) => setMensajes((l) => agregar(l, p.new as MensajeChat)))
      .subscribe();
    return () => {
      vivo = false;
      void sb.removeChannel(canal);
    };
  }, [sesion]);

  // Enlaces firmados (bucket privado) de los adjuntos que aún no tienen
  useEffect(() => {
    const faltan = mensajes.map((m) => m.adjunto_path).filter((p): p is string => !!p && !pedidas.current.has(p));
    if (!faltan.length) return;
    faltan.forEach((p) => pedidas.current.add(p));
    void createClient()
      .storage.from(BUCKET_CHAT)
      .createSignedUrls(faltan, 60 * 60 * 6)
      .then(({ data }) => {
        const nuevos: Record<string, string> = {};
        (data ?? []).forEach((d) => {
          if (d.path && d.signedUrl) nuevos[d.path] = d.signedUrl;
        });
        setUrls((u) => ({ ...u, ...nuevos }));
      });
  }, [mensajes]);

  const insertar = useCallback(
    async (fila: Partial<MensajeChat>): Promise<string | null> => {
      if (!sesion) return "Sin sesión";
      const { data, error } = await createClient()
        .from("chat_mensajes")
        .insert({ usuario: sesion.usuario, nombre: sesion.nombreCompleto?.trim() || sesion.nombre, modulo, texto: "", tipo: "texto", ...fila })
        .select(CAMPOS)
        .single();
      if (error) return faltaSql(error) ? "Falta correr supabase/migrations/20261128_chat_global.sql en Supabase." : error.message;
      setMensajes((l) => agregar(l, data as MensajeChat));
      return null;
    },
    [sesion, modulo]
  );

  const enviar = useCallback(
    async (texto: string, archivo?: File | null): Promise<string | null> => {
      const t = texto.trim().slice(0, 2000);
      if (!archivo) return t ? insertar({ texto: t }) : null;
      if (archivo.size > MAX_ADJUNTO) return "El archivo pasa de 50 MB.";
      const sb = createClient();
      const id = uid.current ?? (await sb.auth.getSession()).data.session?.user.id;
      if (!id) return "Sin sesión";
      const path = `${id}/${Date.now()}-${nombreSeguro(archivo.name)}`;
      const { error } = await sb.storage.from(BUCKET_CHAT).upload(path, archivo, { contentType: archivo.type || undefined, upsert: false });
      if (error) return /bucket not found/i.test(error.message) ? "Falta correr supabase/migrations/20261128_chat_global.sql en Supabase." : error.message;
      return insertar({ texto: t, tipo: "archivo", adjunto_path: path, adjunto_nombre: archivo.name, adjunto_mime: archivo.type || "application/octet-stream", adjunto_bytes: archivo.size });
    },
    [insertar]
  );

  /** Videollamada del grupo (Jitsi Meet): deja el aviso con el enlace en el chat y devuelve la URL para abrirla. */
  const llamar = useCallback(async (): Promise<{ url: string; error: string | null }> => {
    const url = urlSala(`Chat ${new Date().toISOString().slice(0, 16)}`);
    const error = await insertar({ tipo: "llamada", texto: url });
    return { url, error };
  }, [insertar]);

  const fijar = useCallback(async (id: string, valor: boolean): Promise<string | null> => {
    const { error } = await createClient().rpc("chat_fijar", { p_id: id, p_fijar: valor });
    if (error) return faltaSql(error) || /chat_fijar/.test(error.message) ? "Falta correr supabase/migrations/20261128_chat_global.sql en Supabase." : error.message;
    const ahora = new Date().toISOString();
    setMensajes((l) => l.map((m) => (m.id === id ? { ...m, fijado: valor, fijado_por: valor ? sesion?.nombre ?? null : null, fijado_en: valor ? ahora : null } : m)));
    return null;
  }, [sesion]);

  const marcarLeido = useCallback(async (hasta: string) => {
    setLeidoHasta((v) => (v && Date.parse(v) >= Date.parse(hasta) ? v : hasta));
    try {
      window.localStorage.setItem(CLAVE_LEIDO_LOCAL, hasta);
    } catch {
      /* almacenamiento bloqueado */
    }
    const id = uid.current;
    if (id) await createClient().from("chat_leidos").upsert({ user_id: id, leido_hasta: hasta });
  }, []);

  const corte = leidoHasta ? Date.parse(leidoHasta) : NaN;
  const sinLeer = Number.isNaN(corte) ? 0 : mensajes.filter((m) => Date.parse(m.creado) > corte && m.usuario !== sesion?.usuario).length;

  return { mensajes, faltaTabla, urls, leidoHasta, sinLeer, enviar, llamar, fijar, marcarLeido };
}
