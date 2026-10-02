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
  // Comprobante de pago y origen (cuenta_origen_pago, voucher_url, voucher_monto)
  cuentaOrigenPago?: CuentaOrigenPago;
  voucherUrl?: string; // ruta en Supabase Storage: bucket "tesoreria", carpeta vouchers/
  voucherNombre?: string;
  voucherTipo?: string;
  voucherMonto?: number;
  historial: EventoHistorial[];
}

/** Cuenta de la que sale el pago de una OC (se guarda como enum). */
export type CuentaOrigenPago = "caja_general" | "caja_chica" | "fondo_reserva";

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
  precioUnit: number; // FACTURA: sin IGV · BOLETA: con IGV incluido
  subtotal: number; // cantidad × precioUnit (mismo criterio que precioUnit)
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
  costoUnit: number; // último costo: sin IGV (factura / OC) o con IGV (boleta, sin crédito fiscal)
  actualizado: string; // ISO
}

// =====================================================================
// Asistencia por periodo (DÍAS / TARD. de la planilla)
// Solo se escribe con Importar asistencia (RELOJ) o el Módulo Creador (CREADOR).
// =====================================================================

export type OrigenEdicion = "RELOJ" | "CREADOR" | "SISTEMA";

export interface AsistenciaPeriodo {
  id: string; // `${periodo}|${trabajador}`
  periodo: string; // normalizado: "SEMANA 14 - ABRIL 2026"
  trabajador: string; // N° de huella
  dias: number;
  tardanzas: number; // días con entrada después de las 08:15
  origen_edicion: OrigenEdicion;
  updated_by: string | null; // usuario (auth.uid) que hizo el último cambio
  updated_by_creator_id: string | null; // solo en ediciones manuales del creador
  fecha: string; // ISO
}

// =====================================================================
// VENTAS: Nota de Pedido -> Aprobada -> Factura/Boleta -> Orden de Despacho -> Cobro
// (documentos JSON en la tabla public.ventas; despachos en public.almacen)
// =====================================================================

export type TipoDocCliente = "DNI" | "RUC" | "CE";

export interface Cliente {
  id: string;
  tipoDoc: TipoDocCliente;
  numDoc: string;
  razonSocial: string;
  direccionFiscal: string;
  direccionesEntrega: string[]; // obras / puntos de entrega
  telefono: string;
  email: string;
  contacto: string;
  condPagoId: string; // condición de pago por defecto
  lineaCredito: number; // S/ (0 = sin línea)
  estado: "ACTIVO" | "INACTIVO";
  created_at: string;
}

export interface CondicionPago {
  id: string;
  codigo: string; // CONTADO, CRED30, ...
  nombre: string;
  dias: number; // días de crédito (0 = contado)
  porcentajeInicial: number; // % a pagar al emitir (adelanto)
  contraentrega: boolean;
  activo: boolean;
}

/** Línea de venta: con medidas se calcula por m² (ancho × alto × cantidad); sin medidas, por unidad. */
export interface LineaVenta {
  id: string;
  productoNombre: string; // de Almacén (stock) o libre
  descripcion: string; // "Vidrio templado incoloro 8mm"
  unidad: string; // M2, UND, ...
  ancho: number; // metros
  alto: number; // metros
  m2: number; // ancho × alto × cantidad (0 si no tiene medidas)
  cantidad: number;
  precio: number; // por m² si tiene medidas, si no por unidad (sin IGV)
  total: number; // sin IGV
}

export type EstadoNP = "PENDIENTE" | "APROBADA" | "FACTURADA" | "ANULADA";

export interface NotaPedido {
  id: string;
  numero: string; // NP-0001
  fecha: string;
  clienteId: string;
  cliente: string;
  clienteDoc: string;
  condPagoId: string;
  condPagoNombre: string;
  validezDias: number;
  fechaEntrega: string;
  lugarObra: string;
  vendedor: string; // usuario logueado
  items: LineaVenta[];
  conIgv: boolean;
  descuento: number; // S/ sobre el subtotal
  subtotal: number;
  igv: number;
  total: number;
  estado: EstadoNP;
  observaciones: string;
  comprobanteId?: string;
  historial: EventoHistorial[];
}

export type TipoComprobanteVenta = "FACTURA" | "BOLETA" | "NOTA_CREDITO" | "NOTA_DEBITO";
export type FormaPagoVenta = "CONTADO" | "CREDITO" | "CREDITO_CUOTAS";

export interface Cuota {
  n: number;
  fecha: string;
  monto: number;
}

export interface ComprobanteVenta {
  id: string;
  tipo: TipoComprobanteVenta;
  serie: string; // F001 / B001
  numero: string; // F001-0001 ("" mientras es borrador)
  fecha: string;
  clienteId: string;
  cliente: string;
  clienteDoc: string;
  clienteDireccion: string;
  npId?: string;
  npNumero?: string;
  items: LineaVenta[];
  conIgv: boolean;
  descuento: number;
  base: number;
  igv: number;
  total: number;
  formaPago: FormaPagoVenta;
  condPagoId: string;
  condPagoNombre: string;
  diasCredito: number;
  fechaVenc: string;
  inicial: number;
  cuotas: Cuota[];
  saldo: number; // por cobrar
  estado: "BORRADOR" | "EMITIDO" | "ANULADO";
  estadoSunat: "NO_ENVIADO";
  lugarEntrega: string;
  odId?: string;
  odNumero?: string;
  asientoId?: string;
  vendedor: string;
  historial: EventoHistorial[];
}

export interface CobroVenta {
  id: string;
  comprobanteId: string;
  comprobanteNumero: string;
  cliente: string;
  fecha: string;
  monto: number;
  medio: "CAJA" | "BANCO";
  cuenta: string; // Caja principal / BCP / Interbank / Yape ...
  referencia: string; // N° operación
  usuario: string;
  created_at: string;
}

export interface AsientoContable {
  id: string;
  fecha: string;
  glosa: string;
  comprobanteId: string;
  lineas: { cuenta: string; nombre: string; debe: number; haber: number }[];
}

export type EstadoOD = "PENDIENTE" | "EN_PREPARACION" | "DESPACHADO_PARCIAL" | "DESPACHADO_TOTAL" | "ANULADO";

export interface LineaDespacho {
  id: string;
  productoNombre: string; // nombre en Almacén (vacío = servicio, no mueve stock)
  descripcion: string;
  unidad: string;
  ancho: number;
  alto: number;
  cantidadPiezas: number;
  solicitado: number; // en la unidad de stock (m² si unidad M2)
  despachado: number;
}

export interface MovimientoDespacho {
  fecha: string;
  responsable: string;
  sede: string;
  guiaRemision: string;
  observacion: string;
  foto?: { nombre: string; tipo: string; url: string };
  lineas: { lineaId: string; cantidad: number }[];
}

export interface OrdenDespacho {
  id: string;
  numero: string; // OD-0001
  fecha: string;
  comprobanteId: string;
  comprobanteNumero: string;
  clienteId: string;
  cliente: string;
  lugarEntrega: string;
  items: LineaDespacho[];
  estado: EstadoOD;
  despachos: MovimientoDespacho[];
  historial: EventoHistorial[];
}
