// =====================================================================
// ERP COMBOY VID — Tipos del módulo de Compras
// =====================================================================

export type Rol = "ALMACEN" | "TESORERIA" | "GERENCIA" | "CONTADOR";

export type EstadoReq =
  | "PENDIENTE"
  | "ACEPTADO"
  | "OBSERVADO"
  | "COTIZADO"
  | "COMPRADO"
  | "FINALIZADO";

export interface EventoHistorial {
  fecha: string; // ISO
  accion: string;
  usuario: Rol;
  detalle?: string;
}

export interface ItemReq {
  id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  marca: string;
  caracteristica: string;
}

export interface Requerimiento {
  id: string;
  numero: string; // REQ-ALM-001
  fecha: string; // YYYY-MM-DD
  sede: string;
  solicitante: string;
  motivo: string;
  items: ItemReq[];
  estado: EstadoReq;
  observacion?: string;
  historial: EventoHistorial[];
}

export interface ItemPrecio {
  itemReqId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  marca: string;
  precioUnit: number; // valor unitario SIN IGV
  subtotal: number;
}

export interface Cotizacion {
  id: string;
  numero: string; // Nro de cotización del proveedor
  fechaEmision: string;
  reqId: string;
  reqNumero: string;
  proveedor: string;
  ruc: string;
  items: ItemPrecio[];
  subtotal: number;
  igv: number;
  total: number;
  estado: "REGISTRADA" | "CON_OC";
  historial: EventoHistorial[];
}

export type FormaPago = "CONTADO" | "CREDITO 15 DIAS" | "CREDITO 30 DIAS" | "CREDITO 60 DIAS" | "ADELANTO 50%";

export type EstadoOC = "EMITIDA" | "FACTURADA" | "EN_GUIA" | "FINALIZADA";

export interface OrdenCompra {
  id: string;
  numero: string; // OC-2026-0001
  fecha: string;
  cotizacionId: string;
  cotizacionNumero: string;
  reqId: string;
  reqNumero: string;
  proveedor: string;
  ruc: string;
  formaPago: FormaPago;
  tiempoEntrega: string;
  lugarEntrega: string;
  items: ItemPrecio[];
  subtotal: number;
  igv: number;
  total: number;
  estado: EstadoOC;
  vistoBueno?: VistoBueno;
  historial: EventoHistorial[];
}

export type TipoComprobante = "FACTURA" | "DECLARACION_JURADA";

export interface Factura {
  id: string;
  tipo: TipoComprobante;
  numero: string; // F001-00001234 o DJ-001
  fecha: string;
  fechaVencimiento: string;
  ocId: string;
  ocNumero: string;
  reqId: string;
  reqNumero: string;
  proveedor: string;
  ruc: string; // en DJ: DNI del vendedor
  subtotal: number;
  igv: number;
  total: number;
  estadoPago: "POR_PAGAR" | "PAGADA";
  // Solo DJ
  motivoSinComprobante?: string;
  aprobadoPor?: string;
  historial: EventoHistorial[];
}

export interface Guia {
  id: string;
  numero: string; // T001-000123
  fecha: string;
  facturaId: string;
  facturaNumero: string;
  ocId: string;
  ocNumero: string;
  reqId: string;
  archivoNombre: string;
  archivoTipo: string;
  archivoDataUrl: string;
  estado: "PENDIENTE_VB" | "OBSERVADA" | "CONFORME";
  historial: EventoHistorial[];
}

export interface VistoBueno {
  fecha: string;
  recibidoPor: string;
  observaciones: string;
}

export type TipoDoc = "REQ" | "COTI" | "OC" | "FACTURA" | "GUIA";

// =====================================================================
// Módulo de Planilla — Trabajadores
// =====================================================================

export type TipoSueldo = "DIARIO" | "SEMANAL" | "QUINCENAL" | "MENSUAL";

export type TipoAfp = "AFP_INTEGRA" | "AFP_PRIMA" | "AFP_HABITAT" | "AFP_PROFUTURO" | "ONP" | "SIN";

export interface Trabajador {
  id: string; // N° de huella del reloj biométrico
  nombre: string;
  dni: string;
  cargo: string;
  fechaIngreso: string; // YYYY-MM-DD
  sueldo: number; // monto según tipoSueldo
  tipoSueldo: TipoSueldo;
  afpTipo: TipoAfp;
  afpPorcentaje: number; // ej. 13
  activo: boolean;
}

// =====================================================================
// Compras directas y stock de almacén
// =====================================================================

export interface Proveedor {
  id: string;
  razonSocial: string;
  ruc: string;
}

export type TipoComprobanteCompra = "FACTURA" | "BOLETA";

export interface ItemCompra {
  id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  precioUnit: number; // valor unitario SIN IGV
  subtotal: number;
}

export interface Compra {
  id: string;
  fecha: string; // YYYY-MM-DD (se muestra DD/MM/YYYY)
  proveedorId: string;
  proveedor: string;
  ruc: string;
  tipoComprobante: TipoComprobanteCompra;
  numero: string; // F001-00001234 / B001-00000456
  sede: string; // almacén donde ingresa
  items: ItemCompra[];
  subtotal: number;
  igv: number;
  total: number;
  historial: EventoHistorial[];
}

export interface StockItem {
  id: string;
  sede: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnit: number; // último costo de compra sin IGV
  actualizado: string; // ISO
}
