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

/** Roles con permisos definidos en el ERP. Cualquier otro rol de la tabla perfiles se trata como solo lectura. */
export type RolAuth = "creador" | "tesoreria" | "almacen" | "planilla" | "gerencia";

/** Dominio de los correos de Supabase Auth: en el login basta con escribir "tesoreria". */
export const DOMINIO = "comboyvid.local";

export interface Sesion {
  usuario: string;
  rol: RolAuth;
  nombre: string;
  /** Rutas permitidas; "*" = todos los módulos. */
  modulos: string[];
  soloLectura: boolean;
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
  const { data, error } = await sb.from("perfiles").select("usuario, rol, nombre, modulos, solo_lectura").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { usuario: data.usuario, rol: data.rol as RolAuth, nombre: data.nombre, modulos: data.modulos ?? [], soloLectura: !!data.solo_lectura };
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
export const PERMISO_EDITAR_ASISTENCIA = "editar_asistencia_creador";
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
  return sesion.modulos.some((m) => m === "*" || ruta === m || ruta.startsWith(`${m}/`));
}

export const RUTA_PRODUCCION = "/dashboard/produccion";

/** Primer módulo al que entra el usuario tras el login. */
export function inicioDe(sesion: Sesion): string {
  if (sesion.modulos.includes("*") || veDashboard(sesion)) return "/dashboard";
  // Sin módulos asignados se queda en /dashboard (el layout muestra el aviso; evita el bucle con /login)
  return sesion.modulos.find((m) => m.startsWith("/dashboard/")) ?? "/dashboard";
}

/** Rol de negocio; un rol desconocido (ej. uno antiguo de la tabla) queda sin permisos de escritura. */
export const rolNegocio = (sesion: Sesion | null): Rol => (sesion ? ROL_NEGOCIO[sesion.rol as RolAuth] ?? "CONTADOR" : "CONTADOR");
