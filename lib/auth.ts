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
import { DOMINIO, puedeVer, soloSecocha, tieneSecocha, veDashboard, RUTA_GERENCIA, RUTA_SUCURSAL, RUTA_SUCURSAL_ANTIGUA, type RolAuth, type Sesion } from "./permisos";
import { homeAsignado, isAdmin } from "./permisosPlanta";

export * from "./permisos";

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

const USUARIO_INACTIVO = "Usuario desactivado. Pida a SOPORTE que lo active.";

/** Lee el usuario autenticado y su perfil. */
async function cargarSesion(): Promise<Sesion | null> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  // "*": las columnas nuevas (avatar_iniciales, modulo_asignado, activo…) son opcionales hasta correr su SQL
  const { data, error } = await sb.from("perfiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.activo === false) throw new Error(USUARIO_INACTIVO);
  return {
    usuario: data.usuario,
    rol: data.rol as RolAuth,
    nombre: data.nombre,
    modulos: data.modulos ?? [],
    soloLectura: !!data.solo_lectura,
    cargo: data.cargo ?? undefined,
    nombreCompleto: data.nombre_completo ?? undefined,
    iniciales: data.avatar_iniciales ?? undefined,
    moduloAsignado: data.modulo_asignado ?? undefined,
  };
}

/** Intentos fallidos seguidos antes de bloquear (la base aplica el mismo número). */
const MAX_INTENTOS_LOGIN = 5;

async function segundosBloqueo(rpc: PromiseLike<{ data: unknown; error: unknown }>): Promise<number> {
  try {
    const { data, error } = await rpc;
    return error ? 0 : Number(data) || 0;
  } catch {
    return 0;
  }
}

const msgBloqueo = (seg: number) => `Usuario bloqueado por ${MAX_INTENTOS_LOGIN} intentos fallidos. Intente de nuevo en ${Math.ceil(seg / 60)} minuto(s) o pida al administrador que lo desbloquee.`;

export async function login(usuario: string, pass: string): Promise<{ sesion?: Sesion; error?: string }> {
  const u = usuario.trim().toLowerCase();
  const sb = createClient();
  // Se entra con el nombre completo ("Jose Ortiz Arapa"), el usuario ("almacen") o el correo
  // (supabase/migrations/20261106_perfiles_asignacion.sql, email_de_login); sin esa migración, usuario o correo
  let email = u.includes("@") ? u : `${u}@${DOMINIO}`;
  if (!u.includes("@")) {
    try {
      const { data } = await sb.rpc("email_de_login", { p_texto: usuario.trim() });
      if (typeof data === "string" && data) email = data;
    } catch {
      /* sin la función: usuario@dominio */
    }
  }
  // Bloqueo por intentos fallidos (supabase/migrations/20261102_login_intentos.sql); sin esa migración no bloquea
  const bloqueo = await segundosBloqueo(sb.rpc("login_bloqueo", { p_usuario: email }));
  if (bloqueo > 0) return { error: msgBloqueo(bloqueo) };
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    if (!/invalid login credentials/i.test(error.message)) return { error: `No se pudo iniciar sesión: ${error.message}` };
    const nuevo = await segundosBloqueo(sb.rpc("login_fallido", { p_usuario: email }));
    return { error: nuevo > 0 ? msgBloqueo(nuevo) : "Usuario o contraseña incorrectos." };
  }
  void sb.rpc("login_exitoso").then(() => undefined, () => undefined);
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
    const msg = (e as Error).message;
    return { error: msg === USUARIO_INACTIVO ? msg : `No se pudo leer el perfil: ${msg}` };
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
/** Primer módulo al que entra el usuario tras el login. */
export function inicioDe(sesion: Sesion): string {
  // El usuario solo de Secocha no entra al ERP: su sistema es /secocha
  if (soloSecocha(sesion)) return RUTA_SUCURSAL;
  // GERENCIA: su único inicio es el Dashboard Gerencia (visor general, solo lectura)
  if (sesion.rol === "gerencia") return RUTA_GERENCIA;
  // Moduladores (Finanzas, Almacén, Logística, Producción): su INICIO asignado
  const asignado = homeAsignado(sesion);
  if (asignado) return asignado;
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
 * soporte, logistica, almacen, finanzas y produccion: los 5 del dock del login (pantalla de presentación).
 * ventas, contable, tesoreria, planilla y gerencia: los anteriores, siguen válidos en /login?modulo= y en sesiones guardadas.
 */
export type ModuloLogin = "ventas" | "contable" | "tesoreria" | "produccion" | "logistica" | "sucursal" | "almacen" | "planilla" | "gerencia" | "soporte" | "finanzas";

/**
 * `ruta`: a dónde entra. `rutas`: rutas del módulo (basta tener asignada una en perfiles.modulos).
 * `roles`: roles que también pertenecen al módulo (además del rol con el mismo nombre y creador).
 */
export const MODULOS_LOGIN: Record<ModuloLogin, { nombre: string; ruta: string; rutas: string[]; roles?: RolAuth[] }> = {
  ventas: { nombre: "Ventas", ruta: "/dashboard/ventas", rutas: ["/dashboard/ventas"] },
  contable: { nombre: "Área Contable", ruta: "/dashboard/contable", rutas: ["/dashboard/contable"] },
  tesoreria: { nombre: "Tesorería (Planilla - Compras)", ruta: "/dashboard/compras", rutas: ["/dashboard/compras", "/dashboard/planilla"], roles: ["planilla"] },
  produccion: { nombre: "Producción", ruta: "/produccion", rutas: ["/produccion", "/dashboard/produccion", "/dashboard/almacen"], roles: ["almacen"] },
  logistica: { nombre: "Logística", ruta: "/logistica", rutas: ["/logistica", "/dashboard/almacen"], roles: ["almacen"] },
  sucursal: { nombre: "Secocha", ruta: RUTA_SUCURSAL, rutas: [RUTA_SUCURSAL, RUTA_SUCURSAL_ANTIGUA] },
  almacen: { nombre: "Almacén", ruta: "/almacen", rutas: ["/almacen", "/dashboard/almacen"] },
  planilla: { nombre: "Planilla", ruta: "/dashboard/planilla", rutas: ["/dashboard/planilla"] },
  // GERENCIA (visor de solo lectura): su Dashboard Gerencia
  gerencia: { nombre: "Gerencia General", ruta: RUTA_GERENCIA, rutas: [RUTA_GERENCIA] },
  // SOPORTE: solo el dueño del sistema (creador / soporte); entra al Dashboard con acceso a todo
  soporte: { nombre: "Soporte", ruta: "/dashboard", rutas: [] },
  finanzas: { nombre: "Finanzas", ruta: "/finanzas", rutas: ["/finanzas", "/dashboard/compras", "/dashboard/planilla"], roles: ["tesoreria", "planilla"] },
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
