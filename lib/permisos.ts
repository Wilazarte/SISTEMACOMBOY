// =====================================================================
// Permisos por módulo, sin React ni Supabase: los usa el navegador
// (lib/auth.ts) y el servidor (middleware.ts) con las mismas reglas.
// =====================================================================

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
  /** Iniciales del avatar (perfiles.avatar_iniciales: AD, LC, JO, WL, MC). */
  iniciales?: string;
  /** Módulo asignado (perfiles.modulo_asignado: TODOS, FINANZAS, ALMACEN, LOGISTICA, PRODUCCION). */
  moduloAsignado?: string;
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
  // Pestañas de los botones del INICIO SOPORTE (/soporte/{accion}): solo SOPORTE
  if (ruta === "/soporte" || ruta.startsWith("/soporte/")) return isAdmin(sesion);
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
  // Expedientes 26W (/erp/lotes, /erp/expediente/…): el flujo pasa por las 4 áreas de la planta; cada una actúa solo en sus fases
  if (ruta === RUTA_ERP || ruta.startsWith(`${RUTA_ERP}/`)) {
    const p = perfilPlanta(sesion);
    return !!p && p !== "gerencia";
  }
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
/** Flujo v3.0: tablero de expedientes 26W y expediente por código. */
export const RUTA_ERP = "/erp";
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

