import type { StoreKey } from "./storage";

/**
 * Claves de la caché que se descargan al iniciar sesión según perfiles.modulos.
 * El resto se descarga recién cuando una pantalla la pide (useStore / leer en lib/storage.ts),
 * así el usuario de Tesorería no espera a bajar el kardex, la planilla ni las ventas.
 *
 * Se usan los valores de KEYS como texto para no importar lib/storage.ts en tiempo de ejecución
 * (lib/storage.ts importa este archivo).
 */

/** Siempre: chicas y compartidas (correlativos, observaciones de Gerencia, condiciones de pago). */
export const CLAVES_SIEMPRE: StoreKey[] = ["erp_contadores", "observaciones_gerencia", "ventas_condiciones_pago"];

const COMPRAS: StoreKey[] = [
  "reqs_almacen_pendientes",
  "reqs_procesados_compras",
  "cotizaciones",
  "ordenes_compra",
  "facturas",
  "guias",
  "proveedores",
  "compras_directas",
  "almacen_stock", // Registrar gasto / compra da ingreso al stock
];

const PLANILLA: StoreKey[] = [
  "CV_TRABAJADORES_V2",
  "planilla_asistencia",
  "planilla_liquidaciones",
  "planilla_contratistas",
  "planilla_huellas_alias",
  "planilla_boletas",
  "planilla_listas_semana",
];

/** Ruta del módulo (perfiles.modulos) -> claves que usa su pantalla. */
export const CLAVES_POR_MODULO: Record<string, StoreKey[]> = {
  "/dashboard/compras": COMPRAS,
  "/dashboard/tesoreria": COMPRAS,
  "/dashboard/almacen": [
    "reqs_almacen_pendientes",
    "reqs_procesados_compras",
    "ordenes_compra",
    "facturas",
    "guias",
    "almacen_stock",
    "almacen_despachos",
    "almacen_kardex",
    "almacen_equipos_terminados",
    "almacen_ordenes_produccion",
    "almacen_movimientos",
    "almacen_vales_produccion",
  ],
  "/dashboard/produccion": [
    "almacen_ordenes_produccion",
    "almacen_equipos_terminados",
    "almacen_stock",
    "almacen_kardex",
    "almacen_vales_produccion",
    "almacen_movimientos",
  ],
  "/dashboard/ventas": [
    "ventas_clientes",
    "ventas_notas_pedido",
    "ventas_comprobantes",
    "ventas_cobros",
    "ventas_asientos",
    "almacen_despachos",
    "almacen_stock",
    "almacen_equipos_terminados",
  ],
  "/dashboard/planilla": PLANILLA,
  "/dashboard/contable": ["contable_asientos", "contable_plan_cuentas", "contable_cierres", "ventas_asientos", "contable_mov_caja"],
  "/dashboard/creador": ["CV_TRABAJADORES_V2", "planilla_asistencia", "planilla_huellas_alias"],
  // Secocha (app aparte /secocha, antes /sucursal): la base solo entrega las filas de la sede del usuario
  "/secocha": [
    "sucursal_sucursales",
    "sucursal_ventas",
    "sucursal_traslados",
    "sucursal_derivaciones",
    "sucursal_reqs",
    "sucursal_caja",
    "sucursal_cierres",
    "sucursal_stock",
    "sucursal_clientes",
    // Sus REQ-SECOCHA en Almacén / Tesorería (RLS: solo los de origen SUCURSAL)
    "reqs_almacen_pendientes",
    "reqs_procesados_compras",
  ],
};

/** Claves a descargar al iniciar sesión. `"*"` (creador / gerencia) = todas. */
export function clavesDeModulos(modulos: string[], todas: StoreKey[]): StoreKey[] {
  if (modulos.includes("*")) return todas;
  const set = new Set<StoreKey>(CLAVES_SIEMPRE);
  for (const m of modulos) {
    // perfiles.modulos guardados antes del cambio de nombre: "/sucursal" = "/secocha"
    const mod = m === "/sucursal" || m.startsWith("/sucursal/") ? m.replace("/sucursal", "/secocha") : m;
    const ruta = Object.keys(CLAVES_POR_MODULO).find((r) => mod === r || mod.startsWith(`${r}/`));
    if (ruta) CLAVES_POR_MODULO[ruta].forEach((k) => set.add(k));
  }
  return todas.filter((k) => set.has(k));
}
