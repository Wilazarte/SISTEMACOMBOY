// Perfil de la planta y lo que puede hacer cada uno (pedido de Williams, 2026-10-29).
// Se usa en las homes de la planta (/logistica, /almacen, /finanzas, /produccion) para mostrar u ocultar
// acciones. Los módulos de trabajo (Ventas, Tesorería…) siguen con sus permisos de siempre.

import type { Sesion } from "./permisos";

/** gerencia: visor general (Dashboard Gerencia /gerencia), no es admin ni opera. */
export type PerfilPlanta = "soporte" | "logistica" | "almacen" | "finanzas" | "produccion" | "gerencia";

/**
 * ADMIN = únicamente SOPORTE (regla de Williams, 2026-10-29). En la BD SOPORTE es el rol "creador"
 * (se muestra como SOPORTE); también se acepta un rol "soporte" si se crea. Nadie más es admin.
 */
export const isAdmin = (sesion: Sesion | null): boolean => {
  const rol = sesion?.rol as string | undefined;
  return rol === "creador" || rol === "soporte";
};

/** Todo el que no es SOPORTE es modulador: solo ve su módulo. */
export const isModulador = (sesion: Sesion | null): boolean => !!sesion && !isAdmin(sesion);

/**
 * - soporte: solo isAdmin (SOPORTE).
 * - moduladores: logistica, almacen, finanzas (tesorería, planilla), produccion.
 * Los roles logistica / finanzas / produccion se reconocen si existen en la tabla perfiles.
 */
export function perfilPlanta(sesion: Sesion | null): PerfilPlanta | null {
  if (!sesion) return null;
  const rol = sesion.rol as string;
  if (isAdmin(sesion)) return "soporte";
  if (rol === "gerencia") return "gerencia";
  if (rol === "logistica") return "logistica";
  if (rol === "almacen") return "almacen";
  if (rol === "produccion") return "produccion";
  if (rol === "tesoreria" || rol === "planilla" || rol === "finanzas") return "finanzas";
  return null;
}

/**
 * INICIO asignado a un modulador (perfiles.modulo_asignado / rol): /logistica, /almacen, /finanzas, /produccion o /gerencia.
 * SOPORTE no tiene uno fijo (entra a todo): null. El middleware y el login llevan ahí a cada usuario.
 */
export function homeAsignado(sesion: Sesion | null): string | null {
  const p = perfilPlanta(sesion);
  return p && p !== "soporte" ? HOME_PERFIL[p] : null;
}

/** Iniciales del avatar: perfiles.avatar_iniciales, o la primera letra de las dos primeras palabras del nombre. */
export function inicialesDe(nombre: string, iniciales?: string): string {
  if (iniciales?.trim()) return iniciales.trim().toUpperCase().slice(0, 3);
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[1][0] : (p[0] ?? "").slice(0, 2)).toUpperCase();
}

export interface PermisosPlanta {
  /** Emitir factura / boleta (Ventas › Comprobantes). */
  canEmitFactura: boolean;
  /** Ver facturas, IGV, balance y PDT (solo lectura). */
  canViewFacturas: boolean;
  /** Emitir guía de remisión (Almacén › Órdenes de despacho). */
  canEmitGuia: boolean;
  /** Botón "Mundo Ventas" (/mundo-ventas → Ventas). */
  canAccessMundoVentas: boolean;
  /**
   * Ve los accesos rápidos a los 4 módulos (Logística, Almacén, Finanzas, Producción) y navega entre sus homes.
   * Solo SOPORTE (isAdmin). Los moduladores (Finanzas, Logística, Almacén, Producción…) solo su módulo.
   */
  canViewOtherModules: boolean;
}

const NINGUNO: PermisosPlanta = { canEmitFactura: false, canViewFacturas: false, canEmitGuia: false, canAccessMundoVentas: false, canViewOtherModules: false };

const PERMISOS: Record<PerfilPlanta, PermisosPlanta> = {
  soporte: { canEmitFactura: true, canViewFacturas: true, canEmitGuia: true, canAccessMundoVentas: true, canViewOtherModules: true },
  logistica: { canEmitFactura: true, canViewFacturas: true, canEmitGuia: true, canAccessMundoVentas: true, canViewOtherModules: false },
  finanzas: { ...NINGUNO, canViewFacturas: true },
  almacen: { ...NINGUNO, canEmitGuia: true },
  produccion: NINGUNO,
  gerencia: NINGUNO,
};

export const permisosPlanta = (sesion: Sesion | null): PermisosPlanta => {
  const p = perfilPlanta(sesion);
  return p ? PERMISOS[p] : NINGUNO;
};

/** Ruta del botón Mundo Ventas (redirige a /dashboard/ventas, ver next.config.mjs). */
export const RUTA_MUNDO_VENTAS = "/mundo-ventas";

/** Cómo se muestra cada perfil en el encabezado: avatar = 2 primeras letras de `label`. */
export const ETIQUETA_PERFIL: Record<PerfilPlanta, { label: string; titulo: string; badge?: string }> = {
  soporte: { label: "SOPORTE", titulo: "SOPORTE (Dueño) · acceso a todos los módulos", badge: "Soporte Dueño" },
  logistica: { label: "LOGISTICA", titulo: "Logística · dueña de ventas", badge: "Dueño de Ventas" },
  almacen: { label: "ALMACEN", titulo: "Almacén · acceso solo a su módulo" },
  finanzas: { label: "FINANZAS", titulo: "Finanzas · acceso solo a su módulo" },
  produccion: { label: "PRODUCCION", titulo: "Producción · acceso solo a su módulo" },
  gerencia: { label: "GERENCIA", titulo: "Gerencia · visor general (solo lectura)", badge: "Visor General" },
};

/** Home de cada perfil de la planta (solo SOPORTE entra a las 4). */
export const HOME_PERFIL: Record<Exclude<PerfilPlanta, "soporte">, string> = {
  logistica: "/logistica",
  almacen: "/almacen",
  finanzas: "/finanzas",
  produccion: "/produccion",
  gerencia: "/gerencia",
};

/** Home de la planta a la que pertenece una ruta (/logistica/agencias → /logistica). */
export const homePlantaDe = (ruta: string): string | undefined =>
  Object.values(HOME_PERFIL).find((h) => ruta === h || ruta.startsWith(`${h}/`));

export const RUTA_NO_AUTORIZADO = "/no-autorizado";
