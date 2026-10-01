"use client";

// =====================================================================
// VENTAS — flujo COMBOY VID:
// Nota de Pedido -> Aprobada -> Factura/Boleta -> Orden de Despacho (Almacén) -> Cobro
// Toda la lógica pasa por aquí; los datos se sincronizan con Supabase vía lib/storage.ts.
// =====================================================================

import {
  ErpError,
  IGV,
  KEYS,
  descontarStock,
  escribir,
  hoy,
  leer,
  nuevoEvento,
  r2,
  rucValido,
  siguienteNumero,
  uid,
} from "./storage";
import type {
  AsientoContable,
  Cliente,
  CobroVenta,
  ComprobanteVenta,
  CondicionPago,
  Cuota,
  FormaPagoVenta,
  LineaDespacho,
  LineaVenta,
  MovimientoDespacho,
  NotaPedido,
  OrdenDespacho,
  Rol,
  TipoComprobanteVenta,
  TipoDocCliente,
} from "./types";

export const getClientes = () => leer<Cliente[]>(KEYS.CLIENTES, []);
export const getCondicionesPago = () => leer<CondicionPago[]>(KEYS.COND_PAGO, []);
export const getNotasPedido = () => leer<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
export const getComprobantes = () => leer<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
export const getCobros = () => leer<CobroVenta[]>(KEYS.COBROS, []);
export const getAsientos = () => leer<AsientoContable[]>(KEYS.ASIENTOS, []);
export const getDespachos = () => leer<OrdenDespacho[]>(KEYS.DESPACHOS, []);

export const sumarDias = (iso: string, d: number): string => {
  const f = new Date(`${iso}T12:00:00`);
  f.setDate(f.getDate() + d);
  return f.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------

/** Con medidas: m² = ancho × alto × cantidad y total = m² × precio. Sin medidas: total = cantidad × precio. */
export function calcularLinea(l: LineaVenta): LineaVenta {
  const ancho = Math.max(0, Number(l.ancho) || 0);
  const alto = Math.max(0, Number(l.alto) || 0);
  const cantidad = Math.max(0, Number(l.cantidad) || 0);
  const precio = Math.max(0, Number(l.precio) || 0);
  const m2 = ancho > 0 && alto > 0 ? Math.round(ancho * alto * cantidad * 10000) / 10000 : 0;
  return { ...l, ancho, alto, cantidad, precio, m2, total: r2((m2 > 0 ? m2 : cantidad) * precio) };
}

export const lineaVacia = (): LineaVenta => ({
  id: uid(),
  productoNombre: "",
  descripcion: "",
  unidad: "M2",
  ancho: 0,
  alto: 0,
  m2: 0,
  cantidad: 1,
  precio: 0,
  total: 0,
});

/** Subtotal (con descuento), IGV 18 % opcional y total. Precios sin IGV. */
export function totalesVenta(items: LineaVenta[], conIgv: boolean, descuento: number) {
  const bruto = r2(items.reduce((a, l) => a + calcularLinea(l).total, 0));
  const desc = Math.min(Math.max(0, Number(descuento) || 0), bruto);
  const base = r2(bruto - desc);
  const igv = conIgv ? r2(base * IGV) : 0;
  return { bruto, descuento: desc, base, igv, total: r2(base + igv) };
}

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------

export const LARGO_DOC: Record<TipoDocCliente, string> = { DNI: "8 dígitos", RUC: "11 dígitos", CE: "9 a 12 caracteres" };

export function validarDocumento(tipo: TipoDocCliente, num: string): string | null {
  if (tipo === "DNI") return /^\d{8}$/.test(num) ? null : "El DNI debe tener 8 dígitos.";
  if (tipo === "RUC") return rucValido(num) ? null : "RUC inválido (11 dígitos con dígito verificador correcto).";
  return /^[A-Z0-9]{9,12}$/i.test(num) ? null : "El carné de extranjería debe tener de 9 a 12 caracteres.";
}

export const clienteVacio = (): Cliente => ({
  id: "",
  tipoDoc: "RUC",
  numDoc: "",
  razonSocial: "",
  direccionFiscal: "",
  direccionesEntrega: [],
  telefono: "",
  email: "",
  contacto: "",
  condPagoId: "",
  lineaCredito: 0,
  estado: "ACTIVO",
  created_at: "",
});

export function guardarCliente(data: Cliente): Cliente {
  const numDoc = data.numDoc.trim().toUpperCase();
  const err = validarDocumento(data.tipoDoc, numDoc);
  if (err) throw new ErpError(err);
  if (!data.razonSocial.trim()) throw new ErpError("Ingrese la razón social o nombres.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) throw new ErpError("Email inválido.");
  if (!(Number(data.lineaCredito) >= 0)) throw new ErpError("La línea de crédito no puede ser negativa.");
  const lista = getClientes();
  if (lista.some((c) => c.numDoc === numDoc && c.id !== data.id)) throw new ErpError(`Ya existe un cliente con ${data.tipoDoc} ${numDoc}.`);
  const cliente: Cliente = {
    ...data,
    id: data.id || uid(),
    numDoc,
    razonSocial: data.razonSocial.trim().toUpperCase(),
    direccionFiscal: data.direccionFiscal.trim(),
    direccionesEntrega: data.direccionesEntrega.map((d) => d.trim()).filter(Boolean),
    email: data.email.trim(),
    lineaCredito: r2(Number(data.lineaCredito) || 0),
    created_at: data.created_at || new Date().toISOString(),
  };
  const i = lista.findIndex((c) => c.id === cliente.id);
  if (i >= 0) lista[i] = cliente;
  else lista.unshift(cliente);
  escribir(KEYS.CLIENTES, lista);
  return cliente;
}

export function eliminarCliente(id: string): void {
  const usado = getNotasPedido().some((n) => n.clienteId === id) || getComprobantes().some((c) => c.clienteId === id);
  if (usado) throw new ErpError("El cliente tiene notas de pedido o comprobantes: márquelo como INACTIVO en lugar de eliminarlo.");
  escribir(KEYS.CLIENTES, getClientes().filter((c) => c.id !== id));
}

/** Importar clientes desde Excel: columnas Tipo Doc, Numero, Razon Social, Direccion, Telefono, Email, Contacto, Linea Credito. */
export function importarClientes(filas: Record<string, unknown>[]): { creados: number; actualizados: number; errores: string[] } {
  const lista = getClientes();
  const r = { creados: 0, actualizados: 0, errores: [] as string[] };
  const v = (f: Record<string, unknown>, ...k: string[]) => String(k.map((x) => f[x]).find((x) => x !== undefined && x !== "") ?? "").trim();
  filas.forEach((f, i) => {
    const numDoc = v(f, "Numero", "Número", "Num Doc", "RUC", "DNI").toUpperCase();
    if (!numDoc) return;
    const tipoTxt = v(f, "Tipo Doc", "Tipo", "TipoDoc").toUpperCase();
    const tipoDoc: TipoDocCliente = tipoTxt === "DNI" || tipoTxt === "CE" || tipoTxt === "RUC" ? tipoTxt : numDoc.length === 8 ? "DNI" : "RUC";
    const err = validarDocumento(tipoDoc, numDoc);
    const razon = v(f, "Razon Social", "Razón Social", "Nombres", "Cliente");
    if (err || !razon) {
      r.errores.push(`Fila ${i + 2}: ${err ?? "falta razón social"}`);
      return;
    }
    const previo = lista.find((c) => c.numDoc === numDoc);
    const c: Cliente = {
      ...(previo ?? clienteVacio()),
      id: previo?.id ?? uid(),
      tipoDoc,
      numDoc,
      razonSocial: razon.toUpperCase(),
      direccionFiscal: v(f, "Direccion", "Dirección", "Direccion Fiscal") || previo?.direccionFiscal || "",
      telefono: v(f, "Telefono", "Teléfono") || previo?.telefono || "",
      email: v(f, "Email", "Correo") || previo?.email || "",
      contacto: v(f, "Contacto") || previo?.contacto || "",
      lineaCredito: Number(v(f, "Linea Credito", "Línea Crédito", "Linea de Credito")) || previo?.lineaCredito || 0,
      created_at: previo?.created_at ?? new Date().toISOString(),
    };
    if (previo) {
      lista[lista.indexOf(previo)] = c;
      r.actualizados++;
    } else {
      lista.unshift(c);
      r.creados++;
    }
  });
  if (r.creados || r.actualizados) escribir(KEYS.CLIENTES, lista);
  return r;
}

// ---------------------------------------------------------------------
// Condiciones de pago
// ---------------------------------------------------------------------

export function guardarCondicion(data: CondicionPago): void {
  const codigo = data.codigo.trim().toUpperCase();
  if (!codigo) throw new ErpError("Ingrese el código.");
  if (!data.nombre.trim()) throw new ErpError("Ingrese el nombre.");
  if (!(data.dias >= 0 && Number.isInteger(Number(data.dias)))) throw new ErpError("Los días deben ser un entero mayor o igual a 0.");
  if (!(data.porcentajeInicial >= 0 && data.porcentajeInicial <= 100)) throw new ErpError("El % inicial debe estar entre 0 y 100.");
  const lista = getCondicionesPago();
  if (lista.some((c) => c.codigo === codigo && c.id !== data.id)) throw new ErpError(`El código ${codigo} ya existe.`);
  const c: CondicionPago = { ...data, id: data.id || uid(), codigo, nombre: data.nombre.trim(), dias: Number(data.dias), porcentajeInicial: Number(data.porcentajeInicial) };
  const i = lista.findIndex((x) => x.id === c.id);
  if (i >= 0) lista[i] = c;
  else lista.push(c);
  escribir(KEYS.COND_PAGO, lista);
}

export function eliminarCondicion(id: string): void {
  const usada =
    getNotasPedido().some((n) => n.condPagoId === id) || getComprobantes().some((c) => c.condPagoId === id) || getClientes().some((c) => c.condPagoId === id);
  if (usada) throw new ErpError("La condición está en uso: desactívela en lugar de eliminarla.");
  escribir(KEYS.COND_PAGO, getCondicionesPago().filter((c) => c.id !== id));
}

/** Forma de pago del comprobante según la condición. */
export function formaDeCondicion(c?: CondicionPago): FormaPagoVenta {
  if (!c || (c.dias === 0 && c.porcentajeInicial === 0 && !c.contraentrega)) return "CONTADO";
  return "CREDITO";
}

// ---------------------------------------------------------------------
// Notas de pedido
// ---------------------------------------------------------------------

export type DatosNP = Pick<
  NotaPedido,
  "fecha" | "clienteId" | "condPagoId" | "validezDias" | "fechaEntrega" | "lugarObra" | "items" | "conIgv" | "descuento" | "observaciones"
>;

function prepararLineas(items: LineaVenta[]): LineaVenta[] {
  const lineas = items.map(calcularLinea).filter((l) => l.descripcion.trim() || l.productoNombre.trim());
  if (lineas.length === 0) throw new ErpError("Agregue al menos un producto o servicio.");
  if (lineas.some((l) => !(l.cantidad > 0))) throw new ErpError("Todas las cantidades deben ser mayores a 0.");
  if (lineas.some((l) => !(l.precio > 0))) throw new ErpError("Todas las líneas deben tener precio mayor a 0.");
  if (lineas.some((l) => (l.ancho > 0) !== (l.alto > 0))) throw new ErpError("Si indica medidas, ingrese ancho y alto.");
  return lineas.map((l) => ({ ...l, descripcion: (l.descripcion || l.productoNombre).trim() }));
}

export async function crearNotaPedido(data: DatosNP, vendedor: string, rol: Rol): Promise<NotaPedido> {
  const cliente = getClientes().find((c) => c.id === data.clienteId);
  if (!cliente) throw new ErpError("Seleccione el cliente.");
  const cond = getCondicionesPago().find((c) => c.id === data.condPagoId);
  if (!cond) throw new ErpError("Seleccione la condición de pago.");
  if (!(data.validezDias > 0)) throw new ErpError("La validez de la oferta debe ser mayor a 0 días.");
  const items = prepararLineas(data.items);
  const t = totalesVenta(items, data.conIgv, data.descuento);
  if (!(t.total > 0)) throw new ErpError("El total debe ser mayor a 0.");
  const numero = await siguienteNumero("NP");
  const np: NotaPedido = {
    ...data,
    id: uid(),
    numero,
    cliente: cliente.razonSocial,
    clienteDoc: `${cliente.tipoDoc} ${cliente.numDoc}`,
    condPagoNombre: cond.nombre,
    vendedor,
    items,
    descuento: t.descuento,
    subtotal: t.base,
    igv: t.igv,
    total: t.total,
    estado: "PENDIENTE",
    historial: [nuevoEvento(rol, "Nota de pedido registrada", `${cliente.razonSocial} · ${vendedor}`)],
  };
  escribir(KEYS.NOTAS_PEDIDO, [np, ...getNotasPedido()]);
  return np;
}

function actualizarNP(id: string, fn: (n: NotaPedido) => NotaPedido): void {
  const lista = getNotasPedido();
  const i = lista.findIndex((n) => n.id === id);
  if (i < 0) throw new ErpError("Nota de pedido no encontrada.");
  lista[i] = fn(lista[i]);
  escribir(KEYS.NOTAS_PEDIDO, lista);
}

export function aprobarNP(id: string, rol: Rol): void {
  actualizarNP(id, (n) => {
    if (n.estado !== "PENDIENTE") throw new ErpError(`La ${n.numero} está ${n.estado}; solo se aprueban notas PENDIENTES.`);
    return { ...n, estado: "APROBADA", historial: [...n.historial, nuevoEvento(rol, "Aprobada")] };
  });
}

export function anularNP(id: string, motivo: string, rol: Rol): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la anulación.");
  actualizarNP(id, (n) => {
    if (n.estado === "FACTURADA") throw new ErpError(`La ${n.numero} ya está facturada: anule el comprobante.`);
    if (n.estado === "ANULADA") throw new ErpError("Ya está anulada.");
    return { ...n, estado: "ANULADA", historial: [...n.historial, nuevoEvento(rol, "Anulada", motivo.trim())] };
  });
}

export async function clonarNP(id: string, vendedor: string, rol: Rol): Promise<NotaPedido> {
  const o = getNotasPedido().find((n) => n.id === id);
  if (!o) throw new ErpError("Nota de pedido no encontrada.");
  return crearNotaPedido(
    { ...o, fecha: hoy(), items: o.items.map((l) => ({ ...l, id: uid() })) },
    vendedor,
    rol
  );
}

// ---------------------------------------------------------------------
// Comprobantes (Factura / Boleta) -> asiento + Orden de Despacho + cobro / CxC
// ---------------------------------------------------------------------

export const SERIE: Record<"FACTURA" | "BOLETA", "F001" | "B001"> = { FACTURA: "F001", BOLETA: "B001" };

export interface DatosComprobante {
  tipo: "FACTURA" | "BOLETA";
  fecha: string;
  clienteId: string;
  npId?: string;
  items: LineaVenta[];
  conIgv: boolean;
  descuento: number;
  formaPago: FormaPagoVenta;
  condPagoId: string;
  diasCredito: number;
  nCuotas: number;
  inicial: number;
  lugarEntrega: string;
}

export const saldoCliente = (clienteId: string): number =>
  r2(getComprobantes().filter((c) => c.clienteId === clienteId && c.estado === "EMITIDO").reduce((a, c) => a + c.saldo, 0));

function generarCuotas(fecha: string, monto: number, n: number, dias: number): Cuota[] {
  const cuotas: Cuota[] = [];
  let acumulado = 0;
  for (let i = 1; i <= n; i++) {
    const m = i === n ? r2(monto - acumulado) : r2(monto / n);
    acumulado = r2(acumulado + m);
    cuotas.push({ n: i, fecha: sumarDias(fecha, Math.round((dias * i) / n)), monto: m });
  }
  return cuotas;
}

function armarComprobante(data: DatosComprobante, existente?: ComprobanteVenta): ComprobanteVenta {
  const cliente = getClientes().find((c) => c.id === data.clienteId);
  if (!cliente) throw new ErpError("Seleccione el cliente.");
  if (data.tipo === "FACTURA" && cliente.tipoDoc !== "RUC") throw new ErpError("La factura requiere un cliente con RUC. Para DNI/CE emita boleta.");
  const cond = getCondicionesPago().find((c) => c.id === data.condPagoId);
  if (!cond) throw new ErpError("Seleccione la condición de pago.");
  const np = data.npId ? getNotasPedido().find((n) => n.id === data.npId) : undefined;
  if (data.npId && !np) throw new ErpError("La nota de pedido vinculada no existe.");
  if (np && np.estado !== "APROBADA" && np.comprobanteId !== existente?.id) throw new ErpError(`La ${np.numero} está ${np.estado}: solo se facturan notas APROBADAS.`);
  const items = prepararLineas(data.items);
  const conIgv = data.tipo === "FACTURA" ? true : data.conIgv; // factura: siempre gravada
  const t = totalesVenta(items, conIgv, data.descuento);
  if (!(t.total > 0)) throw new ErpError("El total debe ser mayor a 0.");

  const credito = data.formaPago !== "CONTADO";
  const diasCredito = credito ? Math.max(0, Math.round(Number(data.diasCredito) || 0)) : 0;
  if (credito && diasCredito <= 0 && !cond.contraentrega) throw new ErpError("Indique los días de crédito.");
  const inicial = credito ? r2(Math.max(0, Number(data.inicial) || 0)) : 0;
  if (inicial >= t.total && credito) throw new ErpError("La inicial no puede cubrir todo el total: use CONTADO.");
  const nCuotas = data.formaPago === "CREDITO_CUOTAS" ? Math.max(1, Math.round(Number(data.nCuotas) || 0)) : 0;
  if (data.formaPago === "CREDITO_CUOTAS" && nCuotas < 2) throw new ErpError("Crédito en cuotas: indique 2 o más cuotas.");
  const cuotas = nCuotas ? generarCuotas(data.fecha, r2(t.total - inicial), nCuotas, diasCredito) : [];
  const fechaVenc = credito ? (cuotas.length ? cuotas[cuotas.length - 1].fecha : sumarDias(data.fecha, diasCredito)) : data.fecha;

  return {
    ...(existente ?? ({} as ComprobanteVenta)),
    id: existente?.id ?? uid(),
    tipo: data.tipo,
    serie: SERIE[data.tipo],
    numero: existente?.numero ?? "",
    fecha: data.fecha,
    clienteId: cliente.id,
    cliente: cliente.razonSocial,
    clienteDoc: `${cliente.tipoDoc} ${cliente.numDoc}`,
    clienteDireccion: cliente.direccionFiscal,
    npId: np?.id,
    npNumero: np?.numero,
    items,
    conIgv,
    descuento: t.descuento,
    base: t.base,
    igv: t.igv,
    total: t.total,
    formaPago: data.formaPago,
    condPagoId: cond.id,
    condPagoNombre: cond.nombre,
    diasCredito,
    fechaVenc,
    inicial,
    cuotas,
    saldo: t.total,
    estado: "BORRADOR",
    estadoSunat: "NO_ENVIADO",
    lugarEntrega: data.lugarEntrega.trim() || np?.lugarObra || cliente.direccionesEntrega[0] || cliente.direccionFiscal,
    vendedor: existente?.vendedor ?? "",
    historial: existente?.historial ?? [],
  };
}

/** Guarda un borrador (sin número ni efectos). */
export function guardarBorrador(data: DatosComprobante, vendedor: string, rol: Rol, borradorId?: string): ComprobanteVenta {
  const existente = borradorId ? getComprobantes().find((c) => c.id === borradorId) : undefined;
  if (existente && existente.estado !== "BORRADOR") throw new ErpError("Solo se editan comprobantes en BORRADOR.");
  const c = armarComprobante(data, existente);
  c.vendedor = existente?.vendedor || vendedor;
  c.historial = [...c.historial, nuevoEvento(rol, existente ? "Borrador actualizado" : "Borrador creado")];
  const lista = getComprobantes().filter((x) => x.id !== c.id);
  escribir(KEYS.COMPROBANTES, [c, ...lista]);
  return c;
}

/** Asiento de venta (PCGE): 1212 cuentas por cobrar / 40111 IGV / 70121 ventas. */
function asientoVenta(c: ComprobanteVenta, reverso = false): AsientoContable {
  const lado = (debe: number, haber: number) => (reverso ? { debe: haber, haber: debe } : { debe, haber });
  return {
    id: uid(),
    fecha: hoy(),
    glosa: `${reverso ? "Anulación " : ""}${c.tipo === "FACTURA" ? "Factura" : "Boleta"} ${c.numero} · ${c.cliente}`,
    comprobanteId: c.id,
    lineas: [
      { cuenta: "1212", nombre: "Emitidas en cartera (cuentas por cobrar)", ...lado(c.total, 0) },
      ...(c.igv > 0 ? [{ cuenta: "40111", nombre: "IGV - Cuenta propia", ...lado(0, c.igv) }] : []),
      { cuenta: "70121", nombre: "Ventas - Mercaderías", ...lado(0, c.base) },
    ],
  };
}

function asientoCobro(c: ComprobanteVenta, monto: number, medio: CobroVenta["medio"], cuenta: string): AsientoContable {
  return {
    id: uid(),
    fecha: hoy(),
    glosa: `Cobro ${c.numero} · ${c.cliente} · ${cuenta}`,
    comprobanteId: c.id,
    lineas: [
      { cuenta: medio === "CAJA" ? "1011" : "1041", nombre: medio === "CAJA" ? "Caja" : `Cuenta corriente ${cuenta}`, debe: monto, haber: 0 },
      { cuenta: "1212", nombre: "Emitidas en cartera (cuentas por cobrar)", debe: 0, haber: monto },
    ],
  };
}

/** Línea de venta -> línea de despacho. Productos en m² se despachan por m²; servicios no mueven stock. */
function lineaDespacho(l: LineaVenta): LineaDespacho {
  const porM2 = l.unidad === "M2" && l.m2 > 0;
  return {
    id: uid(),
    productoNombre: l.productoNombre.trim().toUpperCase(),
    descripcion: l.descripcion,
    unidad: l.unidad,
    ancho: l.ancho,
    alto: l.alto,
    cantidadPiezas: l.cantidad,
    solicitado: porM2 ? l.m2 : l.cantidad,
    despachado: 0,
  };
}

/**
 * Guardar y emitir: 1) número F001/B001, 2) asiento contable, 3) Orden de Despacho PENDIENTE en Almacén,
 * 4) CONTADO -> cobrado; CRÉDITO -> queda en Cuentas por Cobrar (con la inicial cobrada si hay).
 */
export async function emitirComprobante(
  data: DatosComprobante,
  vendedor: string,
  rol: Rol,
  cobro: { medio: CobroVenta["medio"]; cuenta: string },
  borradorId?: string
): Promise<ComprobanteVenta> {
  const existente = borradorId ? getComprobantes().find((c) => c.id === borradorId) : undefined;
  if (existente && existente.estado !== "BORRADOR") throw new ErpError("Este comprobante ya fue emitido.");
  const c = armarComprobante(data, existente);
  const cliente = getClientes().find((x) => x.id === c.clienteId)!;
  const porCobrar = r2(c.total - (c.formaPago === "CONTADO" ? c.total : c.inicial));
  if (porCobrar > 0 && cliente.lineaCredito > 0 && saldoCliente(cliente.id) + porCobrar > cliente.lineaCredito)
    throw new ErpError(
      `Supera la línea de crédito de ${cliente.razonSocial} (S/ ${cliente.lineaCredito.toFixed(2)}; saldo actual S/ ${saldoCliente(cliente.id).toFixed(2)}).`
    );

  // Números primero (atómicos en Supabase); luego todas las escrituras
  const numero = await siguienteNumero(SERIE[data.tipo]);
  const odNumero = await siguienteNumero("OD");
  const ahora = new Date().toISOString();
  c.numero = numero;
  c.vendedor = existente?.vendedor || vendedor;
  c.estado = "EMITIDO";

  const asiento = asientoVenta(c);
  const od: OrdenDespacho = {
    id: uid(),
    numero: odNumero,
    fecha: hoy(),
    comprobanteId: c.id,
    comprobanteNumero: numero,
    clienteId: c.clienteId,
    cliente: c.cliente,
    lugarEntrega: c.lugarEntrega,
    items: c.items.map(lineaDespacho),
    estado: "PENDIENTE",
    despachos: [],
    historial: [nuevoEvento(rol, "Orden de despacho generada", `Desde ${numero}`)],
  };
  c.odId = od.id;
  c.odNumero = od.numero;
  c.asientoId = asiento.id;

  const cobrado = c.formaPago === "CONTADO" ? c.total : c.inicial;
  const asientos = [asiento];
  const cobros: CobroVenta[] = [];
  if (cobrado > 0) {
    cobros.push({
      id: uid(),
      comprobanteId: c.id,
      comprobanteNumero: numero,
      cliente: c.cliente,
      fecha: c.fecha,
      monto: cobrado,
      medio: cobro.medio,
      cuenta: cobro.cuenta,
      referencia: c.formaPago === "CONTADO" ? "Pago al contado" : "Inicial",
      usuario: vendedor,
      created_at: ahora,
    });
    asientos.push(asientoCobro(c, cobrado, cobro.medio, cobro.cuenta));
  }
  c.saldo = r2(c.total - cobrado);
  c.historial = [
    ...c.historial,
    nuevoEvento(rol, "Emitido", `${numero} · ${c.formaPago}${c.saldo > 0 ? ` · saldo S/ ${c.saldo.toFixed(2)} a Cuentas por Cobrar` : " · cobrado"}`),
  ];

  escribir(KEYS.COMPROBANTES, [c, ...getComprobantes().filter((x) => x.id !== c.id)]);
  escribir(KEYS.ASIENTOS, [...asientos, ...getAsientos()]);
  escribir(KEYS.DESPACHOS, [od, ...getDespachos()]);
  if (cobros.length) escribir(KEYS.COBROS, [...cobros, ...getCobros()]);
  if (c.npId)
    actualizarNP(c.npId, (n) => ({ ...n, estado: "FACTURADA", comprobanteId: c.id, historial: [...n.historial, nuevoEvento(rol, "Facturada", numero)] }));
  return c;
}

export function anularComprobante(id: string, motivo: string, rol: Rol): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la anulación.");
  const lista = getComprobantes();
  const c = lista.find((x) => x.id === id);
  if (!c) throw new ErpError("Comprobante no encontrado.");
  if (c.estado === "ANULADO") throw new ErpError("Ya está anulado.");
  const od = c.odId ? getDespachos().find((o) => o.id === c.odId) : undefined;
  if (od && od.despachos.length > 0) throw new ErpError(`La ${od.numero} ya tiene despachos: no se puede anular el comprobante.`);
  const emitido = c.estado === "EMITIDO";
  const nuevo: ComprobanteVenta = { ...c, estado: "ANULADO", saldo: 0, historial: [...c.historial, nuevoEvento(rol, "Anulado", motivo.trim())] };
  escribir(KEYS.COMPROBANTES, lista.map((x) => (x.id === id ? nuevo : x)));
  if (emitido) escribir(KEYS.ASIENTOS, [asientoVenta(c, true), ...getAsientos()]);
  if (od)
    escribir(
      KEYS.DESPACHOS,
      getDespachos().map((o) => (o.id === od.id ? { ...o, estado: "ANULADO" as const, historial: [...o.historial, nuevoEvento(rol, "Anulada", `Comprobante ${c.numero} anulado`)] } : o))
    );
  if (c.npId && getNotasPedido().find((n) => n.id === c.npId)?.comprobanteId === c.id)
    actualizarNP(c.npId, (n) => ({ ...n, estado: "APROBADA", comprobanteId: undefined, historial: [...n.historial, nuevoEvento(rol, "Comprobante anulado", c.numero)] }));
}

export function eliminarBorrador(id: string): void {
  const c = getComprobantes().find((x) => x.id === id);
  if (!c || c.estado !== "BORRADOR") throw new ErpError("Solo se eliminan borradores.");
  escribir(KEYS.COMPROBANTES, getComprobantes().filter((x) => x.id !== id));
}

// ---------------------------------------------------------------------
// Cuentas por cobrar
// ---------------------------------------------------------------------

export type EstadoCxC = "PENDIENTE" | "PAGADO" | "VENCIDO";

export function estadoCxC(c: ComprobanteVenta): { estado: EstadoCxC; diasVencido: number; pagado: number } {
  const pagado = r2(c.total - c.saldo);
  if (c.saldo <= 0) return { estado: "PAGADO", diasVencido: 0, pagado };
  const dias = Math.floor((new Date(`${hoy()}T12:00:00`).getTime() - new Date(`${c.fechaVenc}T12:00:00`).getTime()) / 86400000);
  return dias > 0 ? { estado: "VENCIDO", diasVencido: dias, pagado } : { estado: "PENDIENTE", diasVencido: 0, pagado };
}

export function registrarCobro(
  comprobanteId: string,
  datos: { monto: number; medio: CobroVenta["medio"]; cuenta: string; referencia: string; fecha: string },
  usuario: string,
  rol: Rol
): void {
  const lista = getComprobantes();
  const c = lista.find((x) => x.id === comprobanteId);
  if (!c || c.estado !== "EMITIDO") throw new ErpError("Seleccione un comprobante emitido.");
  const monto = r2(Number(datos.monto) || 0);
  if (!(monto > 0)) throw new ErpError("El monto debe ser mayor a 0.");
  if (monto > c.saldo + 0.001) throw new ErpError(`El monto supera el saldo (S/ ${c.saldo.toFixed(2)}).`);
  if (!datos.cuenta.trim()) throw new ErpError("Indique la caja o banco.");
  const nuevo = { ...c, saldo: r2(c.saldo - monto) };
  nuevo.historial = [...c.historial, nuevoEvento(rol, nuevo.saldo <= 0 ? "Cobrado (total)" : "Cobro parcial", `S/ ${monto.toFixed(2)} · ${datos.cuenta}`)];
  const cobro: CobroVenta = {
    id: uid(),
    comprobanteId: c.id,
    comprobanteNumero: c.numero,
    cliente: c.cliente,
    fecha: datos.fecha || hoy(),
    monto,
    medio: datos.medio,
    cuenta: datos.cuenta.trim(),
    referencia: datos.referencia.trim(),
    usuario,
    created_at: new Date().toISOString(),
  };
  escribir(KEYS.COMPROBANTES, lista.map((x) => (x.id === c.id ? nuevo : x)));
  escribir(KEYS.COBROS, [cobro, ...getCobros()]);
  escribir(KEYS.ASIENTOS, [asientoCobro(c, monto, datos.medio, datos.cuenta.trim()), ...getAsientos()]);
}

// ---------------------------------------------------------------------
// Órdenes de despacho (Almacén)
// ---------------------------------------------------------------------

export const pendienteLinea = (l: LineaDespacho) => r2(l.solicitado - l.despachado);

/** Estado de entrega del comprobante según su Orden de Despacho. */
export function estadoEntrega(c: ComprobanteVenta, ods: OrdenDespacho[]): "PENDIENTE" | "PARCIAL" | "ENTREGADO" | "-" {
  const od = ods.find((o) => o.id === c.odId);
  if (!od || c.estado !== "EMITIDO") return "-";
  if (od.estado === "DESPACHADO_TOTAL") return "ENTREGADO";
  if (od.estado === "DESPACHADO_PARCIAL") return "PARCIAL";
  return "PENDIENTE";
}

function actualizarOD(id: string, fn: (o: OrdenDespacho) => OrdenDespacho): void {
  const lista = getDespachos();
  const i = lista.findIndex((o) => o.id === id);
  if (i < 0) throw new ErpError("Orden de despacho no encontrada.");
  lista[i] = fn(lista[i]);
  escribir(KEYS.DESPACHOS, lista);
}

export function prepararDespacho(id: string, rol: Rol): void {
  actualizarOD(id, (o) => {
    if (o.estado !== "PENDIENTE") throw new ErpError(`La ${o.numero} está ${o.estado}.`);
    return { ...o, estado: "EN_PREPARACION", historial: [...o.historial, nuevoEvento(rol, "En preparación")] };
  });
}

/** Despacho (parcial o total): valida stock, descuenta (m² o unidades) y actualiza el estado de la OD. */
export function registrarDespacho(id: string, mov: Omit<MovimientoDespacho, "fecha">, rol: Rol): OrdenDespacho {
  const od = getDespachos().find((o) => o.id === id);
  if (!od) throw new ErpError("Orden de despacho no encontrada.");
  if (od.estado === "ANULADO" || od.estado === "DESPACHADO_TOTAL") throw new ErpError(`La ${od.numero} está ${od.estado}.`);
  if (!mov.responsable.trim()) throw new ErpError("Indique quién despacha.");
  if (!mov.sede) throw new ErpError("Seleccione el almacén (sede) de salida.");
  const lineas = mov.lineas.filter((l) => l.cantidad > 0);
  if (lineas.length === 0) throw new ErpError("Indique al menos una cantidad a despachar.");
  for (const l of lineas) {
    const it = od.items.find((x) => x.id === l.lineaId);
    if (!it) throw new ErpError("Línea de despacho inválida.");
    if (l.cantidad > pendienteLinea(it) + 1e-9) throw new ErpError(`${it.descripcion}: máximo pendiente ${pendienteLinea(it)} ${it.unidad}.`);
  }
  // Salida de stock solo de productos de Almacén (los servicios no mueven stock). Si falta stock, no se despacha nada.
  const salidas = lineas
    .map((l) => ({ it: od.items.find((x) => x.id === l.lineaId)!, cantidad: l.cantidad }))
    .filter(({ it }) => it.productoNombre)
    .map(({ it, cantidad }) => ({ nombre: it.productoNombre, unidad: it.unidad, cantidad }));
  if (salidas.length) descontarStock(mov.sede, salidas);

  let actualizada!: OrdenDespacho;
  actualizarOD(id, (o) => {
    const items = o.items.map((it) => {
      const l = lineas.find((x) => x.lineaId === it.id);
      return l ? { ...it, despachado: r2(it.despachado + l.cantidad) } : it;
    });
    const total = items.every((it) => pendienteLinea(it) <= 0);
    actualizada = {
      ...o,
      items,
      estado: total ? "DESPACHADO_TOTAL" : "DESPACHADO_PARCIAL",
      despachos: [...o.despachos, { ...mov, lineas, responsable: mov.responsable.trim(), fecha: new Date().toISOString() }],
      historial: [
        ...o.historial,
        nuevoEvento(rol, total ? "Despachado total (entregado)" : "Despacho parcial", `${mov.responsable.trim()} · ${mov.sede}${mov.guiaRemision ? ` · GR ${mov.guiaRemision}` : ""}`),
      ],
    };
    return actualizada;
  });
  return actualizada;
}

export const tipoLabel: Record<TipoComprobanteVenta, string> = {
  FACTURA: "Factura",
  BOLETA: "Boleta",
  NOTA_CREDITO: "Nota de crédito",
  NOTA_DEBITO: "Nota de débito",
};
