// =====================================================================
// Modelos del módulo Sucursal Beta (sin "use client": los usa también
// la ruta POST /api/sucursal/derivar-venta). La lógica está en lib/sucursal.ts.
// =====================================================================

import type { EventoHistorial } from "./types";

// ---------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------

export interface Sucursal {
  id: string;
  nombre: string;
  sede: string;
  direccion: string;
  jefeId?: string | null;
  jefeNombre?: string;
  /** Saldo de caja chica al último cierre (el saldo en vivo se calcula de los movimientos). */
  cajaChicaActual: number;
  sedeId?: string;
}

export const SUCURSAL_DEFECTO: Sucursal = {
  id: "SUC-AQP-SUR",
  nombre: "Arequipa Sur",
  sede: "Arequipa",
  direccion: "",
  jefeId: null,
  jefeNombre: "LIZBETH CAHUANA APFATA",
  cajaChicaActual: 0,
};

export const JEFE_SUCURSAL = { nombre: "LIZBETH CAHUANA APFATA", cargo: "Jefe de Sucursal - Módulo de Sucursal Beta" };

export type EstadoVenta = "registrada" | "entregada" | "derivada" | "cerrada";
export type TipoDocVenta = "FA" | "BV";
export type FormaPagoSuc = "CONTADO" | "CREDITO";

export interface LineaVentaSuc {
  id: string;
  /** Producto del stock local (vacío = servicio o producto que no hay en la sucursal). */
  productoId?: string;
  producto: string;
  unidad: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  /** Producto del catálogo maestro (productos_maestro.id) y su SKU. */
  productoMaestroId?: string;
  sku?: string;
}

export interface EntregaVenta {
  fecha: string;
  guia: string; // GE-0001-2026
  recibidoPor: string;
  dni?: string;
  /** Firma del cliente (PNG dataURL, pequeña). */
  firma?: string;
}

export interface VentaSucursal {
  id: string;
  numero: string; // VTA-001-2026
  fecha: string;
  cliente: string;
  clienteId?: string;
  clienteDoc?: string;
  tipoDoc: TipoDocVenta;
  /** "VTA-001-2026 · BV" */
  docRef: string;
  lineas: LineaVentaSuc[];
  total: number;
  estado: EstadoVenta;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
  requiereTraslado: boolean;
  formaPago: FormaPagoSuc;
  pagado: boolean;
  entrega?: EntregaVenta;
  derivacionId?: string;
  observacion?: string;
  creadoPor: string;
  historial: EventoHistorial[];
}

export type MotivoDerivacion = "PRODUCTO_NO_DISPONIBLE" | "SERVICIO_ESPECIALIZADO" | "EQUIPO";
export const MOTIVOS_DERIVACION: Record<MotivoDerivacion, string> = {
  PRODUCTO_NO_DISPONIBLE: "Producto no disponible",
  SERVICIO_ESPECIALIZADO: "Servicio especializado",
  EQUIPO: "Equipo",
};

export interface ProductoTraslado {
  productoId?: string;
  producto: string;
  unidad: string;
  cantidad: number;
  costo?: number;
  /** Producto del catálogo maestro (productos_maestro.id) y su SKU. */
  productoMaestroId?: string;
  sku?: string;
  /** Requerimientos (formulario único): marca y característica del producto. */
  marca?: string;
  caracteristica?: string;
}

/**
 * pendiente / en-preparacion = en la bandeja "Requerimientos de Secocha" de Ventas Arequipa · en-produccion = aceptada
 * (Nota de Pedido NP-0001) · convertida = DESPACHADO (Arequipa emitió la OT y guía de traslado).
 */
export type EstadoDerivacion = "pendiente" | "en-preparacion" | "en-produccion" | "convertida" | "anulada";

/**
 * Derivación de una venta de Secocha: llega a Ventas Arequipa (bandeja "Requerimientos de Secocha"); al aceptarla se
 * crea la Nota de Pedido (PENDIENTE_COSTEO) y sigue el flujo NP → Orden de Despacho → OT + guía → Secocha.
 */
export interface Derivacion {
  id: string;
  /** Orden de despacho: OD-VTA-SEC-001-2026 (las antiguas no lo tienen: se usa el de la venta). */
  numero?: string;
  /** Sede que deriva: "SECOCHA". */
  origen?: string;
  fecha: string;
  ventaId: string;
  ventaNumero: string;
  cliente: string;
  motivo: MotivoDerivacion;
  detalle: string;
  sucursal: string;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
  productos: ProductoTraslado[];
  estado: EstadoDerivacion;
  /** Nota de pedido de Ventas Arequipa al aceptarla (EN PRODUCCIÓN NP-0001). */
  npId?: string;
  npNumero?: string;
  trasladoId?: string;
  creadoPor: string;
}

export type EstadoTraslado = "en-camino" | "recibido" | "observado";

export interface Traslado {
  id: string;
  codigo: string; // OT-00091
  origen: "TALLER_PRINCIPAL";
  destinoSucursalId: string;
  /** Sede destino (la del traslado): con ella la base la deja ver solo a esa sucursal. */
  sedeId?: string;
  destino: string;
  productos: ProductoTraslado[];
  estado: EstadoTraslado;
  /** Guía de remisión remitente (tipo 09 SUNAT): serie-número. */
  guiaRemision: string;
  /** PDF de la guía en Storage, si se sube (por ahora el PDF se genera desde estos datos). */
  guiaRemisionUrl?: string;
  fechaEnvio: string;
  fechaRecepcion?: string;
  motivoTraslado: string;
  transportista?: string;
  placa?: string;
  reqId?: string;
  reqNumero?: string;
  derivacionId?: string;
  ventaId?: string;
  ventaNumero?: string;
  observacion?: { tipo: "FALTANTE" | "DANADO"; detalle: string; fecha: string };
  recibidoPor?: string;
  emitidoPor: string;
}

/**
 * enviado = en Ventas Arequipa · aceptado = EN PRODUCCIÓN (Nota de Pedido NP-0001) · en-traslado = OT emitida ·
 * cerrado = recibido en Secocha. aprobado: REQ antiguos (aprobados por Producción).
 */
export type EstadoReqSuc = "enviado" | "aprobado" | "aceptado" | "en-traslado" | "cerrado";

/**
 * REQ-SECOCHA: llega como notificación a Ventas Arequipa ([Aceptar] → Nota de Pedido con costos). No pasa por
 * Producción ni Tesorería (los REQ antiguos siguen en compras con origen SUCURSAL).
 */
export interface ReqSucursal {
  id: string;
  numero: string; // REQ-SECOCHA-001
  fecha: string;
  motivo: string;
  solicitante?: string;
  aprobadoPor?: string;
  fechaAprobacion?: string;
  items: ProductoTraslado[];
  estado: EstadoReqSuc;
  /** Nota de pedido de Ventas Arequipa al aceptarlo (EN PRODUCCIÓN NP-0001). */
  npId?: string;
  npNumero?: string;
  aceptadoPor?: string;
  automatico: boolean;
  trasladoId?: string;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
  creadoPor: string;
}

export type CategoriaCaja = "APERTURA" | "VENTA" | "COBRO" | "GASTO_LOCAL" | "MOVILIDAD" | "OTRO";
export const CATEGORIAS_EGRESO: { value: CategoriaCaja; label: string }[] = [
  { value: "GASTO_LOCAL", label: "Gasto local" },
  { value: "MOVILIDAD", label: "Movilidad" },
  { value: "OTRO", label: "Otro egreso" },
];

export interface MovCaja {
  id: string;
  fecha: string;
  tipo: "INGRESO" | "EGRESO";
  categoria: CategoriaCaja;
  concepto: string;
  monto: number;
  ventaId?: string;
  cierreId?: string;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
  usuario: string;
}

export interface CierreCaja {
  id: string;
  numero: string; // CC-001-2026
  fecha: string;
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  saldoFinal: number;
  movimientos: number;
  estado: "enviado" | "recibido";
  declaradoPor: string;
  recibidoPor?: string;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
}

export interface StockLocal {
  id: string;
  codigo?: string;
  producto: string;
  unidad: string;
  stock: number;
  minimo: number;
  /** Costo unitario (valorizado = stock × costo). */
  costo: number;
  /** Precio de venta sugerido. */
  precio: number;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
  /** Producto del catálogo maestro (productos_maestro.id) y su SKU. */
  productoMaestroId?: string;
  sku?: string;
}

export interface ClienteSuc {
  id: string;
  nombre: string;
  doc: string;
  telefono?: string;
  direccion?: string;
  email?: string;
  sucursalId: string;
  /** Sede (tabla sedes): la pone la base al guardar (sede_isolation). */
  sedeId?: string;
}
