// =====================================================================
// Permisos por módulo, sin React ni Supabase: los usa el navegador
// (lib/auth.ts) y el servidor (middleware.ts) con las mismas reglas.
// =====================================================================

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
  // Secocha (sistema aparte, /secocha): solo quien tiene /secocha en perfiles.modulos (o "*", o es creador)
  if (ruta === RUTA_SUCURSAL || ruta.startsWith(`${RUTA_SUCURSAL}/`)) return tieneSecocha(sesion);
  return sesion.modulos.some((m) => {
    const mod = m === RUTA_SUCURSAL_ANTIGUA ? RUTA_SUCURSAL : m; // perfiles con el módulo antiguo /sucursal
    return mod === "*" || ruta === mod || ruta.startsWith(`${mod}/`);
  });
}

export const RUTA_PRODUCCION = "/dashboard/produccion";
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

