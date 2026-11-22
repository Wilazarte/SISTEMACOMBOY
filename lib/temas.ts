"use client";

// =====================================================================
// Sistema de temas de color (Williams 2026-11-22).
// Solo cambian los colores: la estructura, los textos y las posiciones no se tocan.
//
// Hay 6 opciones: COMBOY VID (el tema de siempre, predeterminado) + los 5 temas pedidos
// (Oscuro, Claro, Rosas, Cielo, Verde menta / tierra). Los valores de cada tema están en
// app/themes.css como variables CSS (--bg, --sidebar-bg, --card-bg, --text, --text-muted,
// --accent, --accent-2, --border, --icon-bg, --button-bg…), activadas con data-tema en ErpLayout.
//
// Prioridad: tema del MÓDULO > tema del USUARIO > tema GLOBAL > COMBOY VID.
// La elección se guarda en localStorage (se ve al instante y sin internet) y, si existe,
// en la tabla public.preferencias_tema de Supabase (SQL 20261226_preferencias_tema.sql),
// para que siga al usuario en cualquier PC.
// =====================================================================

import { createClient } from "./supabase/client";

export type TemaId = "comboy" | "oscuro" | "claro" | "rosas" | "cielo" | "menta";

export interface DefTema {
  id: TemaId;
  nombre: string;
  estilo: string;
  /** Muestras para el selector (mismos valores que app/themes.css). */
  colores: { bg: string; sidebar: string; card: string; text: string; muted: string; accent: string; accent2: string; border: string };
}

export const TEMA_PREDETERMINADO: TemaId = "comboy";

export const TEMAS: DefTema[] = [
  {
    id: "comboy",
    nombre: "COMBOY VID",
    estilo: "Predeterminado",
    colores: { bg: "#CCD0CF", sidebar: "#11212D", card: "#FFFFFF", text: "#11212D", muted: "#4F6B7B", accent: "#800021", accent2: "#294D61", border: "#CCD0CF" },
  },
  {
    id: "oscuro",
    nombre: "Oscuro",
    estilo: "Premium",
    colores: { bg: "#1A1D29", sidebar: "#12141F", card: "#232736", text: "#FFFFFF", muted: "#A0A3B1", accent: "#C9A227", accent2: "#6E8FC9", border: "#2E3242" },
  },
  {
    id: "claro",
    nombre: "Claro",
    estilo: "Limpio formal",
    colores: { bg: "#F2F4F7", sidebar: "#FFFFFF", card: "#FFFFFF", text: "#1A1D29", muted: "#6B7280", accent: "#1E3A5F", accent2: "#2F5D8A", border: "#E5E7EB" },
  },
  {
    id: "rosas",
    nombre: "Rosas",
    estilo: "Elegante femenino",
    colores: { bg: "#FDF2F4", sidebar: "#FCE7EB", card: "#FFFFFF", text: "#3D1F2B", muted: "#9A6B7A", accent: "#E75480", accent2: "#F8A5C2", border: "#FADCE3" },
  },
  {
    id: "cielo",
    nombre: "Cielo",
    estilo: "Fresco formal",
    colores: { bg: "#EAF6FF", sidebar: "#D6EFFF", card: "#FFFFFF", text: "#0F2B46", muted: "#5A7A9A", accent: "#2D9CDB", accent2: "#7ED6FF", border: "#CDEBFF" },
  },
  {
    id: "menta",
    nombre: "Verde menta / Tierra",
    estilo: "Natural moderno",
    colores: { bg: "#EFF7F2", sidebar: "#DFF0E4", card: "#FFFFFF", text: "#1C2E26", muted: "#5E7A6B", accent: "#2E9E6B", accent2: "#C9B99A", border: "#D8E8DD" },
  },
];

export const esTema = (v: unknown): v is TemaId => typeof v === "string" && TEMAS.some((t) => t.id === v);
export const defTema = (id: TemaId): DefTema => TEMAS.find((t) => t.id === id) ?? TEMAS[0];

/** Módulos que pueden tener tema propio (clave = nombre del módulo de la cabecera, normalizado). */
export const MODULOS_TEMA: { clave: string; label: string }[] = [
  { clave: "soporte", label: "Soporte" },
  { clave: "logistica", label: "Logística" },
  { clave: "almacen", label: "Almacén" },
  { clave: "finanzas", label: "Finanzas" },
  { clave: "tesoreria", label: "Tesorería" },
  { clave: "planilla", label: "Planilla" },
  { clave: "produccion", label: "Producción" },
  { clave: "ventas", label: "Ventas" },
  { clave: "inventario", label: "Inventario" },
  { clave: "reportes", label: "Reportes" },
  { clave: "gerencia", label: "Gerencia" },
  { clave: "expedientes", label: "Expedientes 26W" },
  { clave: "gestion-documentaria", label: "Gestión Documentaria" },
  { clave: "secocha", label: "Secocha (toda la sede)" },
  { clave: "configuracion", label: "Configuración" },
];

/**
 * Nombre de la cabecera → clave del módulo: "VENTAS" → ventas, "GESTION DOCUMENTARIA" → gestion-documentaria.
 * Todo lo de Secocha ("SECOCHA", "ADM SECOCHA", "VENTAS · SECOCHA") comparte la clave secocha.
 */
export function claveModulo(nombre: string | undefined): string {
  const n = (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!n) return "";
  if (n.includes("secocha")) return "secocha";
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const etiquetaModulo = (clave: string): string => MODULOS_TEMA.find((m) => m.clave === clave)?.label ?? clave.toUpperCase();

/** Configuración completa: lo que se guarda en localStorage y en preferencias_tema. */
export interface ConfigTemas {
  global?: TemaId;
  modulos: Record<string, TemaId>;
  usuarios: Record<string, TemaId>;
}

export type OrigenTema = "modulo" | "usuario" | "global" | "predeterminado";

/** Prioridad: módulo > usuario > global > COMBOY VID. */
export function resolverTema(cfg: ConfigTemas, modulo: string, usuario: string): { tema: TemaId; origen: OrigenTema } {
  const m = modulo ? cfg.modulos[modulo] : undefined;
  if (m) return { tema: m, origen: "modulo" };
  const u = usuario ? cfg.usuarios[usuario] : undefined;
  if (u) return { tema: u, origen: "usuario" };
  if (cfg.global) return { tema: cfg.global, origen: "global" };
  return { tema: TEMA_PREDETERMINADO, origen: "predeterminado" };
}

export const claveUsuario = (usuario: string | undefined): string => (usuario ?? "").trim().toLowerCase();

// ---------------------------------------------------------------------
// Almacenamiento: localStorage (inmediato) + Supabase (si existe la tabla)
// ---------------------------------------------------------------------

export const CLAVE_LOCAL = "erp_temas_v1";
const TABLA = "preferencias_tema";
const EVENTO = "erp:temas";

const vacia = (): ConfigTemas => ({ modulos: {}, usuarios: {} });
let config: ConfigTemas = vacia();
let leidoLocal = false;
let cargaServidor: Promise<void> | null = null;
/** true = la tabla preferencias_tema existe y se pudo leer; false = solo este equipo. */
let enServidor = false;

function limpiar(c: Partial<ConfigTemas> | null | undefined): ConfigTemas {
  const out = vacia();
  if (!c) return out;
  if (esTema(c.global)) out.global = c.global;
  for (const [k, v] of Object.entries(c.modulos ?? {})) if (esTema(v)) out.modulos[k] = v;
  for (const [k, v] of Object.entries(c.usuarios ?? {})) if (esTema(v)) out.usuarios[k] = v;
  return out;
}

function leerLocal(): void {
  if (leidoLocal || typeof window === "undefined") return;
  leidoLocal = true;
  try {
    const raw = window.localStorage.getItem(CLAVE_LOCAL);
    if (raw) config = limpiar(JSON.parse(raw) as Partial<ConfigTemas>);
  } catch {
    /* almacenamiento bloqueado o JSON dañado: se usa el predeterminado */
  }
}

function guardarLocal(): void {
  try {
    window.localStorage.setItem(CLAVE_LOCAL, JSON.stringify(config));
  } catch {
    /* almacenamiento bloqueado */
  }
}

const avisar = () => window.dispatchEvent(new Event(EVENTO));

export function getConfigTemas(): ConfigTemas {
  leerLocal();
  return config;
}

export const temasEnServidor = (): boolean => enServidor;

/** Lee la tabla preferencias_tema (una vez por sesión). Si no existe, sigue con lo de localStorage. */
export function cargarTemasServidor(): Promise<void> {
  leerLocal();
  if (cargaServidor) return cargaServidor;
  cargaServidor = (async () => {
    const { data, error } = await createClient().from(TABLA).select("ambito, clave, tema");
    if (error) throw error;
    const c = vacia();
    for (const f of (data ?? []) as { ambito: string; clave: string; tema: string }[]) {
      if (!esTema(f.tema)) continue;
      if (f.ambito === "global") c.global = f.tema;
      else if (f.ambito === "modulo") c.modulos[f.clave] = f.tema;
      else if (f.ambito === "usuario") c.usuarios[f.clave] = f.tema;
    }
    config = c;
    enServidor = true;
    guardarLocal();
    avisar();
  })().catch((e) => {
    enServidor = false;
    console.warn("Temas: se guardan solo en este equipo (falta el SQL 20261226_preferencias_tema.sql):", (e as Error).message);
  });
  return cargaServidor;
}

/** Olvida la lectura del servidor (al cerrar sesión entra otro usuario). */
export function reiniciarTemas(): void {
  cargaServidor = null;
}

async function guardarServidor(ambito: "global" | "modulo" | "usuario", clave: string, tema: TemaId | null): Promise<string | null> {
  if (!enServidor) return null;
  const sb = createClient();
  const { error } = tema
    ? await sb.from(TABLA).upsert({ ambito, clave, tema, actualizado_en: new Date().toISOString() }, { onConflict: "ambito,clave" })
    : await sb.from(TABLA).delete().eq("ambito", ambito).eq("clave", clave);
  return error ? error.message : null;
}

function aplicarCambio(ambito: "global" | "modulo" | "usuario", clave: string, tema: TemaId | null): Promise<string | null> {
  leerLocal();
  const c: ConfigTemas = { global: config.global, modulos: { ...config.modulos }, usuarios: { ...config.usuarios } };
  if (ambito === "global") {
    if (tema) c.global = tema;
    else delete c.global;
  } else {
    const mapa = ambito === "modulo" ? c.modulos : c.usuarios;
    if (tema) mapa[clave] = tema;
    else delete mapa[clave];
  }
  config = c;
  guardarLocal();
  avisar();
  return guardarServidor(ambito, clave, tema);
}

/** Tema de todo el ERP (null = volver a COMBOY VID). */
export const setThemeGlobal = (tema: TemaId | null) => aplicarCambio("global", "", tema);
/** Tema de un módulo, para todos sus usuarios (null = sin tema propio). */
export const setThemePorModulo = (modulo: string, tema: TemaId | null) => aplicarCambio("modulo", claveModulo(modulo) || modulo, tema);
/** Tema de un usuario (null = sin tema propio). */
export const setThemePorUsuario = (usuario: string, tema: TemaId | null) => aplicarCambio("usuario", claveUsuario(usuario), tema);

/** Se suscribe a los cambios de la configuración (también de otras pestañas). */
export function escucharTemas(fn: () => void): () => void {
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_LOCAL) return;
    leidoLocal = false;
    leerLocal();
    fn();
  };
  window.addEventListener(EVENTO, fn);
  window.addEventListener("storage", deOtraPestana);
  return () => {
    window.removeEventListener(EVENTO, fn);
    window.removeEventListener("storage", deOtraPestana);
  };
}
