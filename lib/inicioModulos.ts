// INICIO de cada módulo (ERP v3.0, pedido de Williams 2026-10-30): sin menús, cada función del sistema es un
// botón que abre /{modulo}/{accion}?doc=26W-XXX en una pestaña nueva. Este catálogo es la única lista de botones:
// cada acción apunta a una pantalla que YA existe (pestaña ?tab= de los módulos de trabajo, secciones de Logística
// o el expediente 26W). No hay acciones inventadas: si algo aún no existe en el ERP, no tiene botón.

import { puedeVer, type Sesion } from "./auth";
import { permisosPlanta, type PermisosPlanta } from "./permisosPlanta";

export type ModuloInicio = "logistica" | "almacen" | "finanzas" | "produccion" | "soporte";

export interface AccionInicio {
  /** Segmento de la URL: /{modulo}/{slug}. */
  slug: string;
  /** Nombre real de la función en el ERP. */
  label: string;
  grupo: string;
  /** Pantalla que abre. Con `exp`, si hay un expediente elegido se abre /erp/expediente/{doc}. */
  destino: string;
  /** Fase del flujo 26W (1-8) que se trabaja dentro del expediente. */
  fase?: number;
  /** Permiso del perfil que exige (Emitir factura, Emitir guía…). */
  requiere?: keyof PermisosPlanta;
  /** Ruta con la que se valida el acceso, si `destino` no sirve (ej. una redirección). */
  permiso?: string;
  /** Enlace externo (videollamada): se abre tal cual. */
  externo?: boolean;
}

export const TITULO_INICIO: Record<ModuloInicio, string> = {
  logistica: "LOGISTICA",
  almacen: "ALMACEN",
  finanzas: "FINANZAS",
  produccion: "PRODUCCION",
  soporte: "SOPORTE",
};

/** INICIO de cada módulo (primera pantalla). SOPORTE entra por /dashboard. */
export const RUTA_INICIO: Record<ModuloInicio, string> = {
  logistica: "/logistica",
  almacen: "/almacen",
  finanzas: "/finanzas",
  produccion: "/produccion",
  soporte: "/dashboard",
};

/** Sala del chat grupal / reunión de cada módulo (mismos nombres que usaba el panel derecho). */
export const SALA_MODULO: Record<ModuloInicio, string> = {
  logistica: "Logística",
  almacen: "Almacén",
  finanzas: "Finanzas",
  produccion: "Producción",
  soporte: "Soporte",
};

const EXP = "Expediente 26W (flujo de 8 fases)";
const LOTES = "/erp/lotes";

const C = "/dashboard/compras";
const V = "/dashboard/ventas";
const A = "/dashboard/almacen";
const K = "/dashboard/contable";
const P = "/dashboard/produccion";

export const ACCIONES_INICIO: Record<Exclude<ModuloInicio, "soporte">, AccionInicio[]> = {
  logistica: [
    { slug: "expedientes", label: "Expedientes 26W · Tablero de lotes", grupo: EXP, destino: LOTES },
    { slug: "orden-produccion", label: "Crear OP · Fase 1", grupo: EXP, destino: LOTES, fase: 1 },
    { slug: "cotizacion-oc", label: "Cotización y OC del REQ · Fase 4", grupo: EXP, destino: LOTES, fase: 4 },
    { slug: "transporte", label: "Registrar Transporte · Fase 6", grupo: EXP, destino: LOTES, fase: 6 },

    { slug: "cotizaciones", label: "Cotizaciones", grupo: "Compras nacionales", destino: `${C}?tab=cotizaciones` },
    { slug: "ordenes-oc-os", label: "Órdenes OC / OS", grupo: "Compras nacionales", destino: `${C}?tab=ordenes` },
    { slug: "facturas-compra", label: "Facturas de compra", grupo: "Compras nacionales", destino: `${C}?tab=facturas` },
    { slug: "antecedentes", label: "Antecedentes (REQ procesados)", grupo: "Compras nacionales", destino: `${C}?tab=antecedentes` },
    { slug: "proveedores", label: "Proveedores Nacionales", grupo: "Compras nacionales", destino: "/logistica/proveedores" },

    { slug: "requerimientos-secocha", label: "Requerimientos de Secocha", grupo: "Ventas", destino: `${V}?tab=secocha` },
    { slug: "notas-pedido", label: "Notas de pedido", grupo: "Ventas", destino: `${V}?tab=notas` },
    { slug: "comprobantes", label: "Emitir Factura / Boleta (Comprobantes)", grupo: "Ventas", destino: `${V}?tab=comprobantes`, requiere: "canEmitFactura" },
    { slug: "despachos", label: "Despachos (seguimiento)", grupo: "Ventas", destino: `${V}?tab=despachos` },
    { slug: "clientes", label: "Clientes", grupo: "Ventas", destino: `${V}?tab=clientes` },
    { slug: "cuentas-por-cobrar", label: "Cuentas por cobrar", grupo: "Ventas", destino: `${V}?tab=cobrar` },
    { slug: "catalogo-productos", label: "Catálogo de Productos", grupo: "Ventas", destino: `${V}?tab=productos` },
    { slug: "solicitudes-productos", label: "Solicitudes de productos", grupo: "Ventas", destino: `${V}?tab=productos&sub=solicitudes` },
    { slug: "configuracion-ventas", label: "Configuración (condiciones de pago)", grupo: "Ventas", destino: `${V}?tab=condiciones` },

    { slug: "agencias", label: "Agencias (Marvisur · Grael · Shalom)", grupo: "Transporte", destino: "/logistica/agencias" },
    { slug: "cotizar-flete", label: "Cotizar Flete", grupo: "Transporte", destino: "/logistica/cotizar-flete" },
    { slug: "guia-sunat", label: "Guía SUNAT", grupo: "Transporte", destino: "/logistica/guia-sunat" },
    { slug: "guia-remision", label: "Emitir Guía de Remisión (Órdenes de despacho)", grupo: "Transporte", destino: `${A}?tab=despacho`, requiere: "canEmitGuia" },
    { slug: "transferencias", label: "Transferencias Planta ↔ Sucursal", grupo: "Transporte", destino: "/logistica/transferencias" },

    { slug: "infraestructura", label: "Infraestructura Planta", grupo: "Seguimiento", destino: "/logistica/infraestructura" },
    { slug: "historial", label: "Historial General", grupo: "Seguimiento", destino: "/logistica/historial" },
    { slug: "detalle", label: "Panel Logística (detalle)", grupo: "Seguimiento", destino: "/logistica/detalle" },
  ],
  almacen: [
    { slug: "expedientes", label: "Expedientes 26W · Tablero de lotes", grupo: EXP, destino: LOTES },
    { slug: "validar-stock", label: "Validar Stock y Acta de Entrega de Materiales · Fase 3", grupo: EXP, destino: LOTES, fase: 3 },
    { slug: "acta-entrega-completa", label: "Recepción y Acta de Entrega Completa · Fase 7", grupo: EXP, destino: LOTES, fase: 7 },

    { slug: "nuevo-requerimiento", label: "Nuevo requerimiento", grupo: "Requerimientos", destino: `${A}?tab=nuevo` },
    { slug: "requerimientos", label: "Requerimientos emitidos", grupo: "Requerimientos", destino: `${A}?tab=lista` },

    { slug: "recepcion", label: "Recepción MP (Ingresos · V°B° de guía)", grupo: "Ingresos y stock", destino: `${A}?tab=ingresos` },
    { slug: "stock", label: "Stock y Kardex", grupo: "Ingresos y stock", destino: `${A}?tab=stock` },
    { slug: "catalogo-productos", label: "Catálogo de Productos", grupo: "Ingresos y stock", destino: `${V}?tab=productos` },

    { slug: "ordenes-despacho", label: "Órdenes de despacho (Guía de Remisión)", grupo: "Despacho", destino: `${A}?tab=despacho` },
    { slug: "transferencias", label: "Transferencias Planta ↔ Sucursal", grupo: "Despacho", destino: "/logistica/transferencias" },

    { slug: "panel", label: "Panel Almacén (ubicaciones, movimientos, PT)", grupo: "Seguimiento", destino: "/almacen/panel" },
  ],
  finanzas: [
    { slug: "expedientes", label: "Expedientes 26W · Tablero de lotes", grupo: EXP, destino: LOTES },
    { slug: "pago-bancarizacion", label: "Pagar OC y Bancarización · Fase 5", grupo: EXP, destino: LOTES, fase: 5 },

    { slug: "registrar-gasto", label: "Registrar gasto (Cajas)", grupo: "Tesorería", destino: `${C}?tab=registrar` },
    { slug: "cotizaciones", label: "Cotizaciones", grupo: "Tesorería", destino: `${C}?tab=cotizaciones` },
    { slug: "ordenes-oc-os", label: "Órdenes OC / OS (bancarizar voucher)", grupo: "Tesorería", destino: `${C}?tab=ordenes` },
    { slug: "facturas", label: "Facturas · Pagar proveedor (CxP)", grupo: "Tesorería", destino: `${C}?tab=facturas` },
    { slug: "declaraciones", label: "Declaraciones juradas", grupo: "Tesorería", destino: `${C}?tab=declaraciones` },
    { slug: "antecedentes", label: "Antecedentes (REQ procesados)", grupo: "Tesorería", destino: `${C}?tab=antecedentes` },

    { slug: "planilla", label: "Planilla periodo", grupo: "Planilla", destino: `${C}?tab=planilla&sub=planilla` },
    { slug: "trabajadores", label: "Trabajadores", grupo: "Planilla", destino: `${C}?tab=planilla&sub=trabajadores` },
    { slug: "contratistas", label: "Contratistas", grupo: "Planilla", destino: `${C}?tab=planilla&sub=contratistas` },
    { slug: "historial-planilla", label: "Historial de planilla (boletas)", grupo: "Planilla", destino: `${C}?tab=planilla&sub=historial` },
    { slug: "adelantos", label: "Adelantos", grupo: "Planilla", destino: "/dashboard/planilla/adelantos" },

    { slug: "libro-diario", label: "Libro Diario", grupo: "Contabilidad", destino: `${K}?tab=diario`, requiere: "canViewFacturas" },
    { slug: "libro-mayor", label: "Libro Mayor", grupo: "Contabilidad", destino: `${K}?tab=mayor`, requiere: "canViewFacturas" },
    { slug: "balance", label: "Balance", grupo: "Contabilidad", destino: `${K}?tab=balance`, requiere: "canViewFacturas" },
    { slug: "eeff", label: "Estados Financieros (EEFF)", grupo: "Contabilidad", destino: `${K}?tab=eeff`, requiere: "canViewFacturas" },
    { slug: "estados-cuenta", label: "Estados de cuenta", grupo: "Contabilidad", destino: `${K}?tab=estados`, requiere: "canViewFacturas" },
    { slug: "facturas-emitidas", label: "Facturas emitidas (Registro de Ventas)", grupo: "Contabilidad", destino: `${V}?tab=comprobantes`, requiere: "canViewFacturas" },
    { slug: "cuentas-por-cobrar", label: "Cuentas por cobrar", grupo: "Contabilidad", destino: `${V}?tab=cobrar` },

    { slug: "panel", label: "Panel Finanzas (CxC, CxP, IGV, cajas, costeo)", grupo: "Seguimiento", destino: "/finanzas/panel" },
  ],
  produccion: [
    { slug: "expedientes", label: "Expedientes 26W · Tablero de lotes", grupo: EXP, destino: LOTES },
    { slug: "aceptar-op", label: "Aceptar OP y Solicitud de Materiales · Fase 2", grupo: EXP, destino: LOTES, fase: 2 },
    { slug: "reportar-avance", label: "Reportar avance y horas máquina", grupo: EXP, destino: LOTES },
    { slug: "cierre-pt", label: "N° de serie, QC y Acta de Entrega PT · Fase 8", grupo: EXP, destino: LOTES, fase: 8 },

    { slug: "ordenes-produccion", label: "Órdenes de producción (OT)", grupo: "Producción", destino: P },
    { slug: "nueva-op", label: "Nueva orden de producción", grupo: "Producción", destino: `${P}?nueva=1` },
    { slug: "control-calidad", label: "Control de calidad (QC con firma)", grupo: "Producción", destino: `${P}?estado=EN_FABRICACION` },

    { slug: "solicitar-mp", label: "Solicitar MP a Almacén (Nuevo requerimiento)", grupo: "Materiales", destino: `${A}?tab=nuevo` },
    { slug: "stock", label: "Stock y consumo MP (Kardex)", grupo: "Materiales", destino: `${A}?tab=stock` },

    { slug: "panel", label: "Panel Producción (OT, estaciones, consumo)", grupo: "Seguimiento", destino: "/produccion/panel" },
  ],
};

/** SOPORTE: entra a los 4 INICIO y a las funciones globales. */
export const ACCIONES_SOPORTE: AccionInicio[] = [
  { slug: "logistica", label: "INICIO Logística", grupo: "Módulos", destino: "/logistica" },
  { slug: "almacen", label: "INICIO Almacén", grupo: "Módulos", destino: "/almacen" },
  { slug: "finanzas", label: "INICIO Finanzas", grupo: "Módulos", destino: "/finanzas" },
  { slug: "produccion", label: "INICIO Producción", grupo: "Módulos", destino: "/produccion" },
  { slug: "gerencia", label: "Dashboard Gerencia", grupo: "Módulos", destino: "/gerencia" },
  { slug: "secocha", label: "Secocha (sucursal)", grupo: "Módulos", destino: "/secocha" },
  { slug: "expedientes", label: "Expedientes 26W · Tablero de lotes", grupo: EXP, destino: LOTES },
  { slug: "resumen", label: "Dashboard general (resumen)", grupo: "Soporte", destino: "/dashboard?vista=resumen" },
  { slug: "creador", label: "Creador (usuarios, asistencia)", grupo: "Soporte", destino: "/dashboard/creador" },
];

export const accionesDe = (modulo: ModuloInicio): AccionInicio[] => (modulo === "soporte" ? ACCIONES_SOPORTE : ACCIONES_INICIO[modulo]);

/** Las acciones que el usuario puede abrir: permiso del perfil y acceso a la pantalla de destino. */
export function accionesPermitidas(sesion: Sesion | null, modulo: ModuloInicio): AccionInicio[] {
  if (!sesion) return [];
  const permisos = permisosPlanta(sesion);
  return accionesDe(modulo).filter((a) => {
    if (a.externo) return true;
    if (a.requiere && !permisos[a.requiere]) return false;
    return puedeVer(sesion, (a.permiso ?? a.destino).split("?")[0]);
  });
}

/** URL del botón (lo que se abre en la pestaña nueva): /{modulo}/{accion}?doc=26W-XXX. */
export function urlBoton(modulo: ModuloInicio, a: AccionInicio, doc?: string): string {
  if (a.externo) return a.destino;
  const base = modulo === "soporte" ? `/soporte/${a.slug}` : `${RUTA_INICIO[modulo]}/${a.slug}`;
  return doc ? `${base}?doc=${encodeURIComponent(doc)}` : base;
}

/**
 * Pantalla real de una acción, con los datos de la pestaña: `pestana` (módulo, para el encabezado Volver y el pie
 * Cancelar / Guardar y Cerrar), `accion` (título) y `doc` (código 26W). Con expediente, las fases abren su expediente.
 */
export function destinoDe(modulo: ModuloInicio, a: AccionInicio, doc?: string | null): string {
  const base = doc && a.destino === LOTES ? `/erp/expediente/${encodeURIComponent(doc)}` : a.destino;
  const url = new URL(base, "http://x");
  url.searchParams.set("pestana", modulo);
  url.searchParams.set("accion", a.slug);
  if (doc) url.searchParams.set("doc", doc);
  if (a.fase) url.searchParams.set("fase", String(a.fase));
  return `${url.pathname}${url.search}`;
}

export const buscarAccion = (modulo: ModuloInicio, slug: string): AccionInicio | undefined => accionesDe(modulo).find((a) => a.slug === slug);

export const esModuloInicio = (m: string | null | undefined): m is ModuloInicio => !!m && m in TITULO_INICIO;
