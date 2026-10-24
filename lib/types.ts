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
  /** Producto del catálogo maestro (productos_maestro.id) y su SKU. */
  productoId?: string;
  sku?: string;
}

/**
 * Movimiento de caja registrado a mano en Reportes › Estados de cuenta (saldo inicial, reposición, transferencia).
 * Los egresos de gastos, compras y adelantos NO se guardan aquí: se leen de esos documentos (lib/estadoCuenta.ts).
 * Tabla contable, tipo MOVIMIENTO_CAJA.
 */
export interface MovimientoCajaManual {
  id: string;
  cuenta: string; // "CAJA CHICA" | "CAJA GENERAL" | "FONDO DE RESERVA"
  fecha: string; // YYYY-MM-DD
  tipo: "INGRESO" | "EGRESO";
  concepto: string;
  documento?: string;
  proveedor?: string;
  monto: number;
  usuario: string;
  creado: string; // ISO
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
  /** Usuario que lo emitió (perfiles.usuario). Los REQ antiguos no lo tienen. */
  creadoPor?: string;
  editadoPor?: string;
  editadoEn?: string;
  /** "SUCURSAL": lo emitió el módulo Secocha (REQ-SECOCHA-001); el resto viene de Almacén. */
  origen?: "SUCURSAL";
  /** A quién llega (REQ-SECOCHA: "Almacén Taller Principal (Arequipa)"). */
  destino?: string;
  sucursalId?: string;
  /** Sede que lo emitió (multi-sede): la pone la base al guardar. */
  sedeId?: string;
  /** BIEN (por defecto, los REQ antiguos no lo tienen) o SERVICIO: este último se atiende con una Orden de Servicio. */
  tipo?: TipoRequerimiento;
}

export type TipoRequerimiento = "BIEN" | "SERVICIO";

export interface ItemPrecio {
  itemReqId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  marca: string;
  precioUnit: number; // valor unitario SIN IGV
  subtotal: number;
  /** Producto del catálogo maestro (productos_maestro.id) y su SKU. */
  productoId?: string;
  sku?: string;
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

/**
 * Flujo de compras: EMITIDA -> BANCARIZADA -> FACTURADA (fin).
 * EN_GUIA / FINALIZADA quedan solo para OC antiguas (guía y V°B° de almacén ya no son parte del flujo).
 */
export type EstadoOC = "EMITIDA" | "BANCARIZADA" | "FACTURADA" | "EN_GUIA" | "FINALIZADA";

export type TipoBancarizacion = "EFECTIVO" | "TRANSFERENCIA BCP" | "YAPE" | "BBVA" | "INTERBANK" | "DETRACCIÓN";

/** Pago de la OC o del gasto por el sistema financiero (bancarización). */
export interface Bancarizacion {
  tipo: TipoBancarizacion;
  nroOperacion?: string;
  fecha: string; // YYYY-MM-DD
  caja: string; // CAJA GENERAL, CAJA CHICA…
}

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
  /** Almacén donde ingresa la mercadería (repuestos) al dar el V°B°. */
  almacenIngreso?: string;
  items: ItemPrecio[];
  subtotal: number;
  igv: number;
  total: number;
  estado: EstadoOC;
  vistoBueno?: VistoBueno;
  // Comprobante de pago y origen (cuenta_origen_pago, voucher_url, voucher_monto)
  cuentaOrigenPago?: CuentaOrigenPago;
  /** Caja de la que sale el pago (tabla cajas). */
  caja?: string;
  bancarizacion?: Bancarizacion;
  /** OC emitida desde "Registrar gasto / compra" (sin cotización): id del gasto en Facturas. */
  gastoId?: string;
  /** Almacén ya registró el ingreso de esta OC (Almacén › Ingresos). */
  ingresadaAlmacen?: boolean;
  voucherUrl?: string; // ruta en Supabase Storage: bucket "tesoreria", carpeta vouchers/
  voucherNombre?: string;
  voucherTipo?: string;
  voucherMonto?: number;
  historial: EventoHistorial[];
}

/**
 * Orden de Servicio (OS-001-2026): mismos datos que la OC, para servicios (no ingresa a almacén).
 * Tabla compras, tipo 'orden_servicio'. Flujo: PENDIENTE -> APROBADA (Gerencia) | ANULADA.
 */
export type EstadoOS = "PENDIENTE" | "APROBADA" | "ANULADA";

export interface ItemServicio {
  id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnit: number; // valor unitario SIN IGV
  subtotal: number;
  /** Si la línea es un producto del catálogo maestro. */
  productoId?: string;
  sku?: string;
}

export interface OrdenServicio {
  id: string;
  numero: string; // OS-001-2026
  fecha: string;
  proveedor: string;
  ruc: string;
  concepto: string;
  items: ItemServicio[];
  subtotal: number;
  igv: number;
  total: number;
  /** Condición de pago (mismas opciones que la OC). */
  formaPago: FormaPago;
  lugarServicio?: string;
  plazo?: string;
  estado: EstadoOS;
  /** De dónde se generó: requerimiento tipo SERVICIO, gasto de Tesorería o a mano. */
  origen: "REQUERIMIENTO" | "GASTO" | "MANUAL";
  reqId?: string;
  reqNumero?: string;
  gastoId?: string;
  gastoNumero?: string;
  /** Adjunto (cotización del proveedor, contrato…): "sb:tesoreria/<ruta>" o base64 antiguo. */
  adjunto?: string;
  adjuntoNombre?: string;
  observacion?: string;
  aprobadoPor?: string;
  motivoAnulacion?: string;
  creadoPor?: string;
  historial: EventoHistorial[];
}

/** Cuenta de la que sale el pago de una OC (se guarda como enum). */
export type CuentaOrigenPago = "caja_general" | "caja_chica" | "fondo_reserva";

export type TipoComprobante = "FACTURA" | "DECLARACION_JURADA";

export interface Factura {
  id: string;
  /** Código GST-001-2026 (solo gastos de Tesorería). */
  codigo?: string;
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
  /** Caja de la que salió el pago (al marcarla PAGADA). */
  caja?: string;
  bancarizacion?: Bancarizacion;
  // Solo DJ
  motivoSinComprobante?: string;
  aprobadoPor?: string;
  historial: EventoHistorial[];
  // ---- Gasto / servicio de Tesorería (sin OC ni ingreso a stock) ----
  esGastoTesoreria?: boolean;
  tipoGasto?: TipoGasto;
  descripcion?: string;
  comprobanteGasto?: ComprobanteGasto;
  detraccionPorc?: number; // % de detracción (4, 10, 12)
  detraccionMonto?: number;
  netoPagar?: number; // total - detracción
  archivos?: ArchivoGasto[];
  /** Declaración jurada de gasto: PENDIENTE (recién emitida), ENVIADA (a Gerencia), APROBADA. */
  djEstado?: "PENDIENTE" | "ENVIADA" | "APROBADA";
  /** Usuario que registró el gasto (perfiles.usuario). Los antiguos no lo tienen. */
  creadoPor?: string;
  editadoPor?: string;
  editadoEn?: string;
}

export type TipoGasto = "REPRESENTACION" | "SERVICIO_BASICO" | "TRANSPORTE" | "COMPRA_SIN_REQ" | "OTROS" | "PLANILLA";
export type ComprobanteGasto = "FACTURA" | "BOLETA" | "DJ" | "RECIBO";
export interface ArchivoGasto {
  tipo: "FACTURA" | "GUIA";
  nombre: string;
  mime: string;
  dataUrl: string;
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

export type TipoSueldo = "DIARIO" | "SEMANAL" | "QUINCENAL" | "MENSUAL" | "POR_HORA" | "POR_CONTRATO";

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
  // ---- Ficha del trabajador (opcionales: los registros antiguos no los tienen) ----
  fechaNacimiento?: string; // YYYY-MM-DD (la edad se calcula)
  sede?: string; // lib/empresa.ts SEDES
  nroAfiliacion?: string; // CUSPP / N° de afiliación AFP u ONP
  direccion?: string;
  celular?: string;
  email?: string;
  estadoCivil?: EstadoCivil;
  nroHijos?: number;
  emergenciaNombre?: string;
  emergenciaParentesco?: string;
  emergenciaCelular?: string;
  observacionesMedicas?: string; // alergias, condiciones
  fechaBaja?: string; // YYYY-MM-DD (al dar de baja)
  motivoBaja?: string;
  // ---- Cuenta bancaria para el pago (en planilla.data; no hay tabla trabajadores) ----
  bancoNombre?: string; // BCP, BBVA, Interbank…
  bancoTipoCuenta?: "Ahorros" | "Corriente";
  bancoNumeroCuenta?: string; // solo dígitos
  bancoCci?: string; // 20 dígitos
  bancoTitular?: string; // si la cuenta no es del trabajador
  // ---- Contratista (mismo maestro, pero fuera de la planilla diaria) ----
  esContratista?: boolean; // también cuenta cargo "Contratista" o tipoSueldo POR_CONTRATO
  ruc?: string; // RUC del contratista (11 dígitos); el DNI va en dni
  tipoServicio?: ServicioContratista;
  empresa?: string;
  fechaFinContrato?: string; // inicio = fechaIngreso; monto contratado = sueldo
  formaPagoContrato?: string;
}

export type ServicioContratista = "ASESORIA" | "TRAMITE" | "CONSTRUCCION" | "IMPLEMENTACION" | "OTRO";

export type EstadoCivil = "SOLTERO" | "CASADO" | "CONVIVIENTE" | "DIVORCIADO" | "VIUDO";

/** Huellas del reloj que pertenecen a otro trabajador (duplicados unidos): huella -> N° del trabajador. */
export type AliasHuellas = Record<string, string>;

// ---- Liquidación flexible de la planilla del periodo ----
export type ModoLiquidacion = "DIAS" | "HORAS" | "DIAS_HORAS";

/** Ajuste manual de un trabajador en el periodo (sin ajuste se usa lo del reloj). */
export interface AjusteLiquidacion {
  dias?: number; // entero
  horas?: number; // modo HORAS
  horasExtra?: number; // modo DÍAS + HORAS
}

/** Configuración y ajustes de la planilla de un periodo (un registro por periodo). */
export interface LiquidacionPeriodo {
  id: string; // periodo normalizado
  periodo: string;
  modo: ModoLiquidacion;
  horasJornada: number; // sueldo_hora = sueldo_diario / horasJornada (8)
  recargoExtra: number; // % sobre la hora en horas extra (0 = sin recargo)
  ajustes: Record<string, AjusteLiquidacion>; // N° trabajador -> ajuste
}

// ---- Contratistas / concesiones (servicios externos a terceros) ----
export type TipoServicioContratista =
  | "ASESORIA"
  | "GESTION_TRAMITE"
  | "CONSTRUCCION"
  | "IMPLEMENTACION_EQUIPO"
  | "SISTEMA"
  | "SERVICIO_BASICO"
  | "OTRO";

export interface ComprobanteContratista {
  tipo: "RH" | "FACTURA" | "BOLETA" | "OTRO";
  numero: string;
  monto: number;
  fecha: string;
}

export interface PagoContratista {
  fecha: string;
  monto: number;
  medio: string; // EFECTIVO, TRANSFERENCIA...
  caja?: string; // de qué caja salió el dinero
  nota?: string;
}

export interface ConcesionContratista {
  id: string;
  /** Código RCT-001-2026. */
  codigo?: string;
  razonSocial: string;
  ruc: string;
  representante: string;
  celular: string;
  tipoServicio: TipoServicioContratista;
  descripcion: string;
  sede: string;
  fecha_inicio: string;
  fecha_fin: string;
  monto_total: number;
  adelanto: number;
  cajaAdelanto?: string; // de qué caja salió el adelanto
  saldo: number; // monto_total - adelanto - pagos
  estado: "ACTIVO" | "FINALIZADO" | "ANULADO";
  comprobantes: ComprobanteContratista[];
  pagos?: PagoContratista[]; // pagos posteriores al adelanto
  observaciones: string;
  created_at?: string;
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
  caja?: string; // de qué cuenta se pagó ("CAJA GENERAL"…)
  items: ItemCompra[];
  subtotal: number;
  igv: number;
  total: number;
  historial: EventoHistorial[];
  /** Usuario que la registró (perfiles.usuario). Las antiguas no lo tienen. */
  creadoPor?: string;
  editadoPor?: string;
  editadoEn?: string;
}

export interface StockItem {
  id: string;
  sede: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  costoUnit: number; // último costo: sin IGV (factura / OC) o con IGV (boleta, sin crédito fiscal)
  actualizado: string; // ISO
  /** Producto del catálogo maestro (productos_maestro.id) y su SKU. */
  productoId?: string;
  sku?: string;
}

/** Kardex de almacén: cada entrada / salida de un producto con su saldo. */
export type TipoKardex = "SALDO_INICIAL" | "INGRESO" | "SALIDA-VENTA" | "SALIDA-PRODUCCION" | "TRANSFERENCIA" | "AJUSTE";

export interface MovimientoKardex {
  id: string;
  fecha: string; // ISO
  sede: string;
  stock_id?: string;
  producto: string;
  unidad: string;
  tipo_movimiento: TipoKardex;
  documento: string; // OC / factura / OD / VPI / import
  chasis?: string; // SALIDA-PRODUCCION: chasis u OT
  motivo?: string;
  cantidad: number; // + entra / - sale
  saldo: number; // stock del producto en la sede después del movimiento
  usuario: string;
}

/** Vale de Producción Interno (retiro de repuestos para producción / mantenimiento / taller). */
export interface ValeProduccion {
  id: string; // VPI-000001
  fecha: string; // ISO
  stock_id: string;
  sede: string;
  producto: string;
  unidad: string;
  cantidad: number;
  chasis_ot: string | null; // null = consumo general de taller (no va al costo de un equipo)
  op_id?: string | null;
  equipo_id?: string | null;
  motivo: string;
  solicitante: string;
  autoriza: string;
  usuario: string;
  saldo: number;
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
  horas?: number; // horas trabajadas según el reloj (sin dato: dias × 9)
  tardanzas: number; // días con entrada después de las 08:20
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

/** CONTADO (efectivo, transferencia, Yape...), CREDITO (pide días y calcula el vencimiento), PERSONALIZADO (días y detalle libres). */
export type TipoCondicionPago = "CONTADO" | "CREDITO" | "PERSONALIZADO";

/** Tabla public.condiciones_pago. */
export interface CondicionPago {
  id: string;
  codigo: string; // EFECTIVO, CRED30, ...
  nombre: string;
  tipo: TipoCondicionPago;
  medio?: string; // EFECTIVO, TRANSFERENCIA, DEPOSITO, YAPE, PLIN, TARJETA
  dias: number; // días de crédito por defecto (0 = contado)
  porcentajeInicial: number; // % a pagar al emitir (adelanto)
  contraentrega: boolean;
  activo: boolean;
  orden?: number;
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

/** PENDIENTE_COSTEO: NP creada al aceptar un requerimiento / derivación de Secocha; Ventas pone los costos y pasa a PENDIENTE. */
export type EstadoNP = "PENDIENTE_COSTEO" | "PENDIENTE" | "APROBADA" | "FACTURADA" | "ANULADA";

/** Documento de Secocha que originó la NP (y su OD): REQ-SECOCHA o venta derivada. */
export interface OrigenSecocha {
  tipo: "REQ" | "DERIVACION";
  /** id de la fila en la tabla sucursal (req / derivacion). */
  id: string;
  /** REQ-SECOCHA-001 · OD-VTA-SEC-001-2026 */
  numero: string;
  sede: string;
}

/** Material del REQ-SECOCHA con su precio unitario (ya incluye todo: sin utilidad ni mano de obra aparte). */
export interface ItemCosteoNP {
  lineaId: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
}

/** Costeo de la NP de Secocha: suma de cantidad × precio unitario = subtotal (sin IGV, traslado interno). */
export interface CostosNP {
  req_id: string; // REQ-SECOCHA-002
  np_id: string; // NP-0014
  cliente: string;
  items: ItemCosteoNP[];
  total: number;
}

export interface NotaPedido {
  id: string;
  numero: string; // NP-0001
  fecha: string;
  clienteId: string;
  cliente: string;
  clienteDoc: string;
  condPagoId: string; // id de public.condiciones_pago
  condPagoNombre: string;
  diasCredito?: number; // crédito / personalizado
  fechaVencimiento?: string; // fecha + días de crédito (automática)
  condPagoDetalle?: string; // personalizado: "50% adelanto, saldo contra entrega"...
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
  /** Orden de despacho creada al aprobar la NP (y sus datos de despacho). */
  odId?: string;
  odNumero?: string;
  despacho?: DatosDespacho;
  /** Secocha: origen=SECOCHA, origenId = número del documento (REQ-SECOCHA-001) y sus costos. */
  origen?: "SECOCHA";
  origenId?: string;
  origenSecocha?: OrigenSecocha;
  costos?: CostosNP;
  historial: EventoHistorial[];
  editadoPor?: string;
  editadoEn?: string;
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
  /** Lugar de entrega y agencia para la Orden de Despacho. */
  despacho?: DatosDespacho;
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

/**
 * Estados de Almacén: PENDIENTE → PEDIDO_ALISTADO → PEDIDO_ENTREGADO / DEJADO_EN_AGENCIA.
 * (EN_PREPARACION, DESPACHADO_PARCIAL y DESPACHADO_TOTAL son de órdenes antiguas; ver estadoOD() en lib/ventas.ts.)
 */
export type EstadoOD =
  | "PENDIENTE"
  | "PEDIDO_ALISTADO"
  | "PEDIDO_ENTREGADO"
  | "DEJADO_EN_AGENCIA"
  | "ANULADO"
  | "EN_PREPARACION"
  | "DESPACHADO_PARCIAL"
  | "DESPACHADO_TOTAL";

export type LugarEntrega =
  | "OFICINA_AREQUIPA"
  | "SECOCHA"
  | "ENVIO_AGENCIA"
  | "LOCAL_COMERCIAL_CLIENTE"
  | "OFICINA_CLIENTE"
  | "ENTREGA_ENCARGADO";

/** Datos de despacho que Ventas llena antes de emitir (obligatorios). */
export interface DatosDespacho {
  lugar: LugarEntrega | "";
  agenciaNombre: string; // Shalom, Marvisur…
  guiaNro: string;
  costoEnvio: number;
  direccionDestino: string;
  /** LOCAL_COMERCIAL_CLIENTE / OFICINA_CLIENTE: dirección del cliente (obligatoria). */
  clienteDireccion?: string;
  /** ENTREGA_ENCARGADO: quien recoge (nombre y DNI obligatorios). */
  encargadoNombre?: string;
  encargadoDni?: string;
  encargadoTelefono?: string;
}

export interface ArchivoAdjunto {
  nombre: string;
  tipo: string;
  url: string; // dataURL
}

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
  /** Código del producto en Almacén (id del stock) y ubicación (sedes con stock) al emitir. */
  codigo?: string;
  ubicacion?: string;
  /** Equipo terminado (fabricado): se despacha por chasis, no por stock de repuestos. */
  codigo_chasis?: string;
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
  // --- Flujo Ventas -> Almacén
  /** Nota de pedido que originó la OD (al aprobarla). comprobanteId/Numero quedan vacíos hasta facturar. */
  npId?: string;
  npNumero?: string;
  clienteDoc?: string;
  vendedor?: string;
  lugar?: LugarEntrega;
  agenciaNombre?: string;
  guiaNro?: string;
  costoEnvio?: number;
  direccionDestino?: string;
  clienteDireccionEntrega?: string;
  encargadoNombre?: string;
  encargadoDni?: string;
  encargadoTelefono?: string;
  observacion?: string;
  creadoPor?: string; // Ventas
  atendidoPor?: string; // Almacén
  /** Firma del cliente (Marcar entregado) y foto de la guía (Dejado en agencia). */
  firmaCliente?: ArchivoAdjunto;
  recibidoPor?: string;
  fotoGuia?: ArchivoAdjunto;
  /** false hasta que Almacén abre la pestaña: campana "nueva orden". */
  vistoAlmacen?: boolean;
  /** OD de una NP de Secocha: se atiende con OT + guía de remisión (traslado a Secocha). */
  origenSecocha?: OrigenSecocha;
  trasladoId?: string;
  trasladoCodigo?: string;
  postVentaStatus?: string | null; // reservado
  actualizado?: string;
}
