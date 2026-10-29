// Perfil de la planta y lo que puede hacer cada uno (pedido de Williams, 2026-10-29).
// Se usa en las homes de la planta (/logistica, /almacen, /finanzas, /produccion) para mostrar u ocultar
// acciones. Los módulos de trabajo (Ventas, Tesorería…) siguen con sus permisos de siempre.

import type { Sesion } from "./auth";

export type PerfilPlanta = "soporte" | "logistica" | "almacen" | "finanzas" | "produccion";

/**
 * - soporte: creador / gerencia o módulos "*".
 * - logistica, almacen, finanzas (tesorería, planilla), produccion.
 * Los roles logistica / finanzas / produccion se reconocen si existen en la tabla perfiles.
 */
export function perfilPlanta(sesion: Sesion | null): PerfilPlanta | null {
  if (!sesion) return null;
  const rol = sesion.rol as string;
  if (rol === "creador" || rol === "gerencia" || sesion.modulos.includes("*")) return "soporte";
  if (rol === "logistica") return "logistica";
  if (rol === "almacen") return "almacen";
  if (rol === "produccion") return "produccion";
  if (rol === "tesoreria" || rol === "planilla" || rol === "finanzas") return "finanzas";
  return null;
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
  /** Accesos rápidos de navegación entre los 4 módulos. */
  canNavegarModulos: boolean;
}

const NINGUNO: PermisosPlanta = { canEmitFactura: false, canViewFacturas: false, canEmitGuia: false, canAccessMundoVentas: false, canNavegarModulos: false };

const PERMISOS: Record<PerfilPlanta, PermisosPlanta> = {
  soporte: { canEmitFactura: true, canViewFacturas: true, canEmitGuia: true, canAccessMundoVentas: true, canNavegarModulos: true },
  logistica: { canEmitFactura: true, canViewFacturas: true, canEmitGuia: true, canAccessMundoVentas: true, canNavegarModulos: false },
  finanzas: { ...NINGUNO, canViewFacturas: true },
  almacen: { ...NINGUNO, canEmitGuia: true },
  produccion: NINGUNO,
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
};

/** Home de cada perfil de la planta (SOPORTE entra a las 4). */
export const HOME_PERFIL: Record<Exclude<PerfilPlanta, "soporte">, string> = {
  logistica: "/logistica",
  almacen: "/almacen",
  finanzas: "/finanzas",
  produccion: "/produccion",
};

/** Home de la planta a la que pertenece una ruta (/logistica/agencias → /logistica). */
export const homePlantaDe = (ruta: string): string | undefined =>
  Object.values(HOME_PERFIL).find((h) => ruta === h || ruta.startsWith(`${h}/`));

export const RUTA_NO_AUTORIZADO = "/no-autorizado";
