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
}

export type EstadoDerivacion = "pendiente" | "en-preparacion" | "convertida" | "anulada";

export interface Derivacion {
  id: string;
  fecha: string;
  ventaId: string;
  ventaNumero: string;
  cliente: string;
  motivo: MotivoDerivacion;
  detalle: string;
  sucursal: string;
  sucursalId: string;
  productos: ProductoTraslado[];
  estado: EstadoDerivacion;
  trasladoId?: string;
  creadoPor: string;
}

export type EstadoTraslado = "en-camino" | "recibido" | "observado";

export interface Traslado {
  id: string;
  codigo: string; // OT-00091
  origen: "TALLER_PRINCIPAL";
  destinoSucursalId: string;
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

export type EstadoReqSuc = "enviado" | "en-traslado" | "cerrado";

/** Seguimiento local de un REQ-SUC (el documento que revisa Tesorería está en compras, mismo id). */
export interface ReqSucursal {
  id: string;
  numero: string; // REQ-SUC-001
  fecha: string;
  motivo: string;
  items: ProductoTraslado[];
  estado: EstadoReqSuc;
  automatico: boolean;
  trasladoId?: string;
  sucursalId: string;
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
}
