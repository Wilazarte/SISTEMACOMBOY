"use client";

// =====================================================================
// Login con Supabase Auth y permisos por módulo.
// Los usuarios se crean en Supabase (Authentication → Users) como
// <usuario>@comboyvid.local; su rol y módulos están en la tabla `perfiles`.
// Las políticas RLS de supabase_tables.sql aplican los mismos permisos
// en la base de datos, así que no dependen solo de la pantalla.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import type { Rol } from "./types";
import { HOME_PERFIL, RUTA_NO_AUTORIZADO, homePlantaDe, isAdmin, perfilPlanta, permisosPlanta } from "./permisosPlanta";

/** Roles con permisos definidos en el ERP. Cualquier otro rol de la tabla perfiles se trata como solo lectura. */
export type RolAuth = "creador" | "tesoreria" | "almacen" | "planilla" | "gerencia" | "sucursal";

/** Dominio de los correos de Supabase Auth: en el login basta con escribir "tesoreria". */
export const DOMINIO = "comboyvid.local";

export interface Sesion {
  usuario: string;
  rol: RolAuth;
  nombre: string;
  /** Rutas permitidas; "*" = todos los módulos. */
  modulos: string[];
  soloLectura: boolean;
  /** Cargo del usuario (columna opcional perfiles.cargo). */
  cargo?: string;
  /** Nombre completo real (columna opcional perfiles.nombre_completo). */
  nombreCompleto?: string;
}

/**
 * Rol de negocio (lib/storage.ts PERMISOS) que corresponde a cada usuario.
 * Gerencia y Planilla usan CONTADOR (sin permisos de escritura en Compras/Almacén).
 */
const ROL_NEGOCIO: Record<RolAuth, Rol> = {
  creador: "GERENCIA",
  tesoreria: "TESORERIA",
  almacen: "ALMACEN",
  planilla: "CONTADOR",
  gerencia: "CONTADOR",
  sucursal: "CONTADOR", // escribe solo en su módulo (lib/sucursal.ts) y sus REQ-SUC
};

const EVENTO = "erp:sesion";
let actual: Sesion | null = null;

/** Sesión ya cargada (síncrona: la usan las acciones de negocio y las páginas). */
export const getSesion = (): Sesion | null => actual;

function fijar(s: Sesion | null): void {
  actual = s;
  window.dispatchEvent(new Event(EVENTO));
}

/** Lee el usuario autenticado y su perfil. */
async function cargarSesion(): Promise<Sesion | null> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from("perfiles").select("usuario,rol,nombre,modulos,solo_lectura,cargo,nombre_completo").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { usuario: data.usuario, rol: data.rol as RolAuth, nombre: data.nombre, modulos: data.modulos ?? [], soloLectura: !!data.solo_lectura, cargo: data.cargo ?? undefined, nombreCompleto: data.nombre_completo ?? undefined };
}

export async function login(usuario: string, pass: string): Promise<{ sesion?: Sesion; error?: string }> {
  const u = usuario.trim().toLowerCase();
  const email = u.includes("@") ? u : `${u}@${DOMINIO}`;
  const sb = createClient();
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    return { error: /invalid login credentials/i.test(error.message) ? "Usuario o contraseña incorrectos." : `No se pudo iniciar sesión: ${error.message}` };
  }
  try {
    const sesion = await cargarSesion();
    if (!sesion) {
      await sb.auth.signOut();
      return { error: "El usuario no tiene perfil. Ejecute supabase_tables.sql en Supabase." };
    }
    fijar(sesion);
    return { sesion };
  } catch (e) {
    await sb.auth.signOut();
    return { error: `No se pudo leer el perfil: ${(e as Error).message}` };
  }
}

export async function logout(): Promise<void> {
  await createClient().auth.signOut();
  try {
    window.localStorage.removeItem("erp_modulo");
    window.localStorage.removeItem("erp_usuario");
  } catch {
    /* almacenamiento bloqueado */
  }
  fijar(null);
}

/** Sesión reactiva. `listo` es false hasta consultar Supabase (evita parpadeos y errores de hidratación). */
export function useSesion(): { sesion: Sesion | null; listo: boolean } {
  const [estado, setEstado] = useState<{ sesion: Sesion | null; listo: boolean }>({ sesion: actual, listo: actual !== null });
  useEffect(() => {
    let vivo = true;
    const sync = () => vivo && setEstado({ sesion: actual, listo: true });
    if (!actual) {
      cargarSesion()
        .then((s) => {
          actual = s;
          sync();
        })
        .catch(() => sync());
    }
    window.addEventListener(EVENTO, sync);
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") fijar(null);
    });
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, sync);
      subscription.unsubscribe();
    };
  }, []);
  return estado;
}

/**
 * Permiso "editar_asistencia_creador": edición manual de DÍAS / TARD. en el Módulo Creador.
 * Roles: creador y admin (ADMINISTRADORA). La base aplica la misma regla en editar_asistencia_creador().
 */
const ROLES_EDITAR_ASISTENCIA = ["creador", "admin"];
export const RUTA_CREADOR = "/dashboard/creador";

export function puedeEditarAsistencia(sesion: Sesion | null): boolean {
  return !!sesion && !sesion.soloLectura && ROLES_EDITAR_ASISTENCIA.includes(sesion.rol);
}

/** Dashboard (resumen): creador, gerencia, tesorería / ventas y almacén. */
export const ROLES_DASHBOARD: RolAuth[] = ["creador", "gerencia", "tesoreria", "almacen"];
export const veDashboard = (sesion: Sesion | null): boolean => !!sesion && ROLES_DASHBOARD.includes(sesion.rol);

export function puedeVer(sesion: Sesion | null, ruta: string): boolean {
  if (!sesion) return false;
  if (ruta === "/dashboard") return true; // solo redirige al primer módulo permitido
  // Módulo Creador: por rol, no por módulos (gerencia tiene "*" pero no debe entrar)
  if (ruta === RUTA_CREADOR || ruta.startsWith(`${RUTA_CREADOR}/`)) return puedeEditarAsistencia(sesion);
  // Producción: también Almacén (registra las órdenes de producción y el QC)
  if (ruta === RUTA_PRODUCCION || ruta.startsWith(`${RUTA_PRODUCCION}/`)) if (sesion.rol === "almacen") return true;
  if (ruta === RUTA_NO_AUTORIZADO) return true;
  // GERENCIA es visor (pedido de Williams, 2026-10-29): solo su Dashboard Gerencia, ningún módulo;
  // las reuniones y el chat grupal están dentro de /gerencia
  if (sesion.rol === "gerencia") return ruta === RUTA_GERENCIA || ruta.startsWith(`${RUTA_GERENCIA}/`);
  // Dashboard Gerencia: además de GERENCIA (arriba), solo SOPORTE
  if (ruta === RUTA_GERENCIA || ruta.startsWith(`${RUTA_GERENCIA}/`)) return isAdmin(sesion);
  // Homes de la planta: solo SOPORTE entra a las 4; los moduladores (Finanzas, Logística, Almacén, Producción) solo a la suya
  const homePlanta = homePlantaDe(ruta);
  const perfil = perfilPlanta(sesion);
  if (homePlanta && perfil && perfil !== "soporte") return permisosPlanta(sesion).canViewOtherModules || homePlanta === HOME_PERFIL[perfil];
  // Homes de la planta (/almacen, /finanzas, /produccion): quien puede abrir el módulo de trabajo
  const home = Object.keys(HOMES_PLANTA).find((h) => ruta === h || ruta.startsWith(`${h}/`));
  if (home) return HOMES_PLANTA[home].some((r) => puedeVer(sesion, r));
  // Logística Planta (/logistica): los roles con Dashboard, o quien lo tenga en perfiles.modulos
  if (ruta === RUTA_LOGISTICA || ruta.startsWith(`${RUTA_LOGISTICA}/`)) if (veDashboard(sesion)) return true;
  // Secocha (sistema aparte, /secocha): solo quien tiene /secocha en perfiles.modulos (o "*", o es creador)
  if (ruta === RUTA_SUCURSAL || ruta.startsWith(`${RUTA_SUCURSAL}/`)) return tieneSecocha(sesion);
  return sesion.modulos.some((m) => {
    const mod = m === RUTA_SUCURSAL_ANTIGUA ? RUTA_SUCURSAL : m; // perfiles con el módulo antiguo /sucursal
    return mod === "*" || ruta === mod || ruta.startsWith(`${mod}/`);
  });
}

export const RUTA_PRODUCCION = "/dashboard/produccion";
/** Dashboard Gerencia (War Room): GERENCIA y SOPORTE. */
export const RUTA_GERENCIA = "/gerencia";
/** Logística Planta: home de compras / ventas nacionales y agencias (solo lectura de los demás módulos). */
export const RUTA_LOGISTICA = "/logistica";
/** Homes de la planta -> módulos de trabajo que habilitan verlas. */
const HOMES_PLANTA: Record<string, string[]> = {
  "/almacen": ["/dashboard/almacen"],
  "/finanzas": ["/dashboard/compras", "/dashboard/planilla", "/dashboard/contable"],
  "/produccion": ["/dashboard/produccion"],
};
/** Módulo Secocha (sucursal): app aparte con su propio login (/secocha/login). Arequipa es la Planta Principal (el ERP). */
export const RUTA_SUCURSAL = "/secocha";
export const RUTA_LOGIN_SUCURSAL = "/secocha/login";
/** Dirección anterior: redirige a /secocha (next.config.mjs). */
export const RUTA_SUCURSAL_ANTIGUA = "/sucursal";

/** Tesorería / Compras: también entra quien solo tiene Planilla (ve solo esa pestaña). */
export const veTesoreria = (sesion: Sesion | null): boolean => puedeVer(sesion, "/dashboard/compras") || puedeVer(sesion, "/dashboard/planilla");

/** Primer módulo al que entra el usuario tras el login. */
/** Módulos del perfil con el antiguo /sucursal leído como /secocha. */
const modulosDe = (sesion: Sesion): string[] => sesion.modulos.map((m) => (m === RUTA_SUCURSAL_ANTIGUA ? RUTA_SUCURSAL : m));

/** Ve el módulo Secocha: tiene "/secocha" (o "*") en perfiles.modulos, o es creador. Sin eso no se muestra. */
export const tieneSecocha = (sesion: Sesion | null): boolean =>
  !!sesion && (sesion.rol === "creador" || modulosDe(sesion).some((m) => m === "*" || m === RUTA_SUCURSAL));

/** Usuario solo de Secocha (modulos = ["/secocha"], ej. sucsecocha): entra directo a /secocha, nunca al ERP. */
export const soloSecocha = (sesion: Sesion | null): boolean => {
  if (!sesion || sesion.rol === "creador") return false;
  const mods = modulosDe(sesion);
  return (mods.length > 0 && mods.every((m) => m === RUTA_SUCURSAL)) || (sesion.rol === "sucursal" && !mods.includes("*"));
};

export function inicioDe(sesion: Sesion): string {
  // El usuario solo de Secocha no entra al ERP: su sistema es /secocha
  if (soloSecocha(sesion)) return RUTA_SUCURSAL;
  // GERENCIA: su único inicio es el Dashboard Gerencia (visor general, solo lectura)
  if (sesion.rol === "gerencia") return RUTA_GERENCIA;
  if (sesion.modulos.includes("*") || veDashboard(sesion)) return "/dashboard";
  // Sin módulos asignados se queda en /dashboard (el layout muestra el aviso; evita el bucle con /login)
  return sesion.modulos.find((m) => m.startsWith("/dashboard/")) ?? "/dashboard";
}

/** Rol de negocio; un rol desconocido (ej. uno antiguo de la tabla) queda sin permisos de escritura. */
export const rolNegocio = (sesion: Sesion | null): Rol => (sesion ? ROL_NEGOCIO[sesion.rol as RolAuth] ?? "CONTADOR" : "CONTADOR");

// =====================================================================
// Módulos del login: el usuario elige su módulo ANTES de ingresar.
// =====================================================================

/**
 * ventas, contable, tesoreria, produccion y logistica: los 5 de /seleccionar-modulo.
 * almacen, planilla y gerencia: los anteriores, siguen válidos en /login?modulo= y en sesiones guardadas.
 */
export type ModuloLogin = "ventas" | "contable" | "tesoreria" | "produccion" | "logistica" | "sucursal" | "almacen" | "planilla" | "gerencia";

/**
 * `ruta`: a dónde entra. `rutas`: rutas del módulo (basta tener asignada una en perfiles.modulos).
 * `roles`: roles que también pertenecen al módulo (además del rol con el mismo nombre y creador).
 */
export const MODULOS_LOGIN: Record<ModuloLogin, { nombre: string; ruta: string; rutas: string[]; roles?: RolAuth[] }> = {
  ventas: { nombre: "Ventas", ruta: "/dashboard/ventas", rutas: ["/dashboard/ventas"] },
  contable: { nombre: "Área Contable", ruta: "/dashboard/contable", rutas: ["/dashboard/contable"] },
  tesoreria: { nombre: "Tesorería (Planilla - Compras)", ruta: "/dashboard/compras", rutas: ["/dashboard/compras", "/dashboard/planilla"], roles: ["planilla"] },
  produccion: { nombre: "Producción (Almacén)", ruta: "/dashboard/produccion", rutas: ["/dashboard/produccion", "/dashboard/almacen"], roles: ["almacen"] },
  logistica: { nombre: "Logística", ruta: "/dashboard/almacen?tab=despacho", rutas: ["/dashboard/almacen"], roles: ["almacen"] },
  sucursal: { nombre: "Secocha", ruta: RUTA_SUCURSAL, rutas: [RUTA_SUCURSAL, RUTA_SUCURSAL_ANTIGUA] },
  almacen: { nombre: "Almacén", ruta: "/dashboard/almacen", rutas: ["/dashboard/almacen"] },
  planilla: { nombre: "Planilla", ruta: "/dashboard/planilla", rutas: ["/dashboard/planilla"] },
  gerencia: { nombre: "Gerencia", ruta: "/dashboard", rutas: [] },
};

export const CLAVE_MODULO = "erp_modulo";
export const CLAVE_USUARIO = "erp_usuario";

/** El usuario pertenece al módulo: es creador, su rol es ese módulo (o uno de sus roles), o tiene una de sus rutas en perfiles.modulos. */
export function perteneceAModulo(sesion: Sesion, modulo: ModuloLogin): boolean {
  // Secocha se decide solo por perfiles.modulos
  if (modulo === "sucursal") return tieneSecocha(sesion);
  if (sesion.rol === "creador" || sesion.rol === modulo) return true;
  const { rutas, roles } = MODULOS_LOGIN[modulo];
  if (roles?.includes(sesion.rol)) return true;
  return rutas.some((ruta) => sesion.modulos.some((m) => ruta === m || ruta.startsWith(`${m}/`)));
}

/** Ruta de entrada al módulo: la principal, o la primera del módulo que el usuario puede ver (ej. Planilla en Tesorería). */
export function rutaDeModulo(sesion: Sesion, modulo: ModuloLogin): string {
  const { ruta, rutas } = MODULOS_LOGIN[modulo];
  if (puedeVer(sesion, ruta.split("?")[0])) return ruta;
  return rutas.find((r) => puedeVer(sesion, r)) ?? ruta;
}

export function moduloGuardado(): ModuloLogin | null {
  try {
    const m = window.localStorage.getItem(CLAVE_MODULO);
    return m && m in MODULOS_LOGIN ? (m as ModuloLogin) : null;
  } catch {
    return null;
  }
}

const CARGOS: Record<RolAuth, string> = {
  creador: "Soporte Unificado Dueño del sistema",
  tesoreria: "Tesorera - Módulo de Compras",
  almacen: "Jefe de Almacén",
  planilla: "Jefe de RRHH",
  gerencia: "Gerente General",
  sucursal: "Jefe de Sucursal - COMBOY VID SUCURSAL",
};
export const cargoDe = (s: Sesion): string => (s.rol === "creador" ? CARGOS.creador : s.cargo?.trim() || CARGOS[s.rol] || s.rol);

/** Responsables reales por rol, si perfiles.nombre_completo aún no está cargado. */
const NOMBRES: Partial<Record<RolAuth, string>> = {
  tesoreria: "LIZBETH CAHUANA APFATA",
  almacen: "JOSE MANUEL ORTIZ ARAPA",
};
export const nombreDe = (s: Sesion): string => (esSoporte(s) ? ETIQUETA_SOPORTE : s.nombreCompleto?.trim() || NOMBRES[s.rol] || s.nombre);

/** El rol creador se muestra como SOPORTE (Dueño): solo cambia lo que se ve, el rol en la base sigue siendo "creador". */
export const esSoporte = (s: Sesion | null): boolean => isAdmin(s);
export const ETIQUETA_SOPORTE = "SOPORTE (Dueño)";
