"use client";

// =====================================================================
// Módulo Sucursal Beta: ventas locales, entregas, derivaciones al Taller
// Principal, traslados (OT + guía de remisión), requerimientos REQ-SUC,
// caja chica, stock local y clientes. Datos en la tabla sucursal
// (supabase/migrations/20261022_sucursal_beta.sql) vía lib/storage.ts.
// =====================================================================

import { getSesion, nombreDe, type Sesion } from "./auth";
import { createClient } from "./supabase/client";
import { canonizar } from "./productos";
import { deSede, esDeSede, getSedeActual, sedeActualId } from "./sedes";
import { ErpError, KEYS, escribir, getPendientes, hoy, leer, r2, uid } from "./storage";
import type { EventoHistorial, ItemReq, Requerimiento, Rol } from "./types";
import {
  SUCURSAL_DEFECTO,
  type CategoriaCaja,
  type CierreCaja,
  type ClienteSuc,
  type FormaPagoSuc,
  type TipoDocVenta,
  type Derivacion,
  type LineaVentaSuc,
  type MotivoDerivacion,
  type MovCaja,
  type ProductoTraslado,
  type ReqSucursal,
  type StockLocal,
  type Sucursal,
  type Traslado,
  type VentaSucursal,
} from "./sucursal-modelos";

export * from "./sucursal-modelos";

// ---------------------------------------------------------------------
// Permisos (la base aplica lo mismo con RLS)
// ---------------------------------------------------------------------

const rolDe = (s: Sesion | null) => (s && !s.soloLectura ? s.rol : null);
/** Opera la sucursal: ventas, entregas, caja, stock, clientes, REQ-SUC, recepción de traslados. */
export const operaSucursal = (s: Sesion | null = getSesion()) => ["creador", "sucursal"].includes(rolDe(s) ?? "");
/** Taller Principal (almacén): prepara derivaciones y emite OT con guía de remisión. */
export const esTaller = (s: Sesion | null = getSesion()) => ["creador", "almacen"].includes(rolDe(s) ?? "");
/** Tesorería Principal: recibe los cierres de caja. */
export const esTesoreria = (s: Sesion | null = getSesion()) => ["creador", "tesoreria"].includes(rolDe(s) ?? "");

const usuario = () => getSesion()?.usuario ?? "sistema";
/** Evento del historial con el usuario real (el historial muestra quién lo hizo). */
const ev = (accion: string, detalle?: string): EventoHistorial => ({ fecha: new Date().toISOString(), usuario: usuario() as Rol, accion, detalle });
const exigir = (ok: boolean, msg: string) => {
  if (!ok) throw new ErpError(msg);
};

// ---------------------------------------------------------------------
// Numeración (siguiente_numero_sucursal en Supabase: atómica)
// ---------------------------------------------------------------------

type SerieSuc = "VTA" | "REQSUC" | "GE" | "CC" | "OT" | "GR";

/** "Secocha" -> "SECOCHA" (sin tildes ni espacios) para el número del requerimiento. */
const nombreSerie = (nombre: string): string =>
  nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "SUC";

/** Destino de los requerimientos de Secocha: el Almacén del Taller Principal (Arequipa). */
export const DESTINO_REQ_SUCURSAL = "Almacén Taller Principal (Arequipa)";

async function siguienteSuc(serie: SerieSuc): Promise<string> {
  // Cada sede numera aparte (la base fuerza la sede del usuario de sede); OT y guías: un solo correlativo del Taller
  const sede = getSedeActual();
  const { data, error } = await createClient().rpc("siguiente_numero_sucursal", { serie, p_sede: sede?.id ?? null });
  if (error) {
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
      throw new ErpError("Falta el módulo Sucursal en Supabase: ejecute supabase/migrations/20261022_sucursal_beta.sql en el SQL Editor.");
    throw new ErpError(error.code === "42501" ? error.message : `No se pudo obtener el número: ${error.message}`);
  }
  const n = Number(data);
  const anio = new Date().getFullYear();
  // Sedes que no son la central llevan su código: VTA-SEC-001-2026 (Arequipa sigue con VTA-001-2026)
  const cod = sede && !sede.es_central ? `${sede.codigo}-` : "";
  if (serie === "VTA") return `VTA-${cod}${String(n).padStart(3, "0")}-${anio}`;
  // Requerimiento de la sucursal: REQ-SECOCHA-001 (nombre de la sede)
  if (serie === "REQSUC") return `REQ-${sede && !sede.es_central ? nombreSerie(sede.nombre) : "SUC"}-${String(n).padStart(3, "0")}`;
  if (serie === "GE") return `GE-${cod}${String(n).padStart(4, "0")}-${anio}`;
  if (serie === "CC") return `CC-${cod}${String(n).padStart(3, "0")}-${anio}`;
  if (serie === "OT") return `OT-${String(n).padStart(5, "0")}`;
  return `T001-${String(n).padStart(6, "0")}`; // guía de remisión remitente
}

// ---------------------------------------------------------------------
// Lectores
// ---------------------------------------------------------------------

// Todo se lee de la sede en pantalla (un usuario de sede solo recibe la suya; el ERP central elige la sede)

/** Sucursal de la sede en pantalla (Arequipa: SUC-AQP-SUR · Secocha: SUC-SEC). */
export function getSucursal(): Sucursal {
  const fila = deSede(leer<Sucursal[]>(KEYS.SUC_SUCURSALES, []))[0];
  if (fila) return fila;
  const sede = getSedeActual();
  if (!sede || sede.es_central) return SUCURSAL_DEFECTO;
  return { id: `SUC-${sede.codigo}`, nombre: sede.nombre, sede: sede.nombre, direccion: "", jefeId: null, jefeNombre: "", cajaChicaActual: 0, sedeId: sede.id };
}
export const getVentasSuc = () => deSede(leer<VentaSucursal[]>(KEYS.SUC_VENTAS, []));
export const getTraslados = () => deSede(leer<Traslado[]>(KEYS.SUC_TRASLADOS, []));
export const getDerivaciones = () => deSede(leer<Derivacion[]>(KEYS.SUC_DERIVACIONES, []));
export const getReqsSuc = () => deSede(leer<ReqSucursal[]>(KEYS.SUC_REQS, []));
export const getCaja = () => deSede(leer<MovCaja[]>(KEYS.SUC_CAJA, []));
export const getCierres = () => deSede(leer<CierreCaja[]>(KEYS.SUC_CIERRES, []));
export const getStockLocal = () => deSede(leer<StockLocal[]>(KEYS.SUC_STOCK, []));
export const getClientesSuc = () => deSede(leer<ClienteSuc[]>(KEYS.SUC_CLIENTES, []));

type ClaveSuc = (typeof KEYS)[keyof typeof KEYS];

/**
 * Guarda la lista de la sede en pantalla sin tocar las filas de las otras sedes (el ERP central
 * tiene todas en caché: escribir solo la sede actual las borraría). Lo nuevo lleva la sede actual.
 */
function escribirSede<T extends { id: string; sedeId?: string }>(key: ClaveSuc, lista: T[]): void {
  const sede = sedeActualId();
  const propias = lista.map((x) => (x.sedeId || !sede ? x : { ...x, sedeId: sede }));
  const otras = leer<T[]>(key, []).filter((x) => !esDeSede(x));
  escribir(key, [...propias, ...otras]);
}

export const saldoCaja = (movs: MovCaja[]): number => r2(movs.reduce((a, m) => a + (m.tipo === "INGRESO" ? m.monto : -m.monto), 0));
export const valorizado = (s: StockLocal[]): number => r2(s.reduce((a, x) => a + x.stock * x.costo, 0));
export const bajoMinimo = (s: StockLocal) => s.stock < s.minimo;
/** Nombre oficial del catálogo maestro (lanza si el producto no está catalogado). */
const oficial = (nombre: string) => {
  const c = canonizar(nombre);
  return { producto: c.nombre, ...(c.productoId ? { productoMaestroId: c.productoId, sku: c.sku } : {}) };
};
const norm = (t: string) => t.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------------------------------------------------------------------
// Sucursal
// ---------------------------------------------------------------------

export function guardarSucursal(d: Omit<Sucursal, "cajaChicaActual">): void {
  exigir(operaSucursal(), "Su usuario no puede editar la sucursal.");
  exigir(!!d.nombre.trim(), "Ingrese el nombre de la sucursal.");
  const actual = getSucursal();
  const lista = deSede(leer<Sucursal[]>(KEYS.SUC_SUCURSALES, []));
  const nueva: Sucursal = { ...actual, ...d, nombre: d.nombre.trim() };
  escribirSede(KEYS.SUC_SUCURSALES, lista.some((s) => s.id === nueva.id) ? lista.map((s) => (s.id === nueva.id ? nueva : s)) : [nueva, ...lista]);
}

// ---------------------------------------------------------------------
// 1. Registrar venta
// ---------------------------------------------------------------------

export interface DatosVenta {
  cliente: string;
  clienteId?: string;
  clienteDoc?: string;
  tipoDoc: TipoDocVenta;
  formaPago: FormaPagoSuc;
  lineas: Omit<LineaVentaSuc, "id" | "subtotal">[];
  /** true: se entrega en el acto y descuenta stock local; false: queda "por entregar". */
  entregaInmediata: boolean;
  observacion?: string;
}

/** Descuenta el stock local de las líneas con producto (o lanza error si no alcanza). Devuelve la lista nueva. */
function descontar(lineas: LineaVentaSuc[], stock: StockLocal[]): StockLocal[] {
  const out = stock.map((s) => ({ ...s }));
  for (const l of lineas) {
    if (!l.productoId) continue;
    const s = out.find((x) => x.id === l.productoId);
    if (!s) throw new ErpError(`El producto ${l.producto} ya no está en el stock local.`);
    if (s.stock < l.cantidad) throw new ErpError(`Stock insuficiente de ${s.producto}: hay ${s.stock} ${s.unidad}, se piden ${l.cantidad}. Derive la venta al Taller Principal.`);
    s.stock = r2(s.stock - l.cantidad);
  }
  return out;
}

/** Líneas que la sucursal no puede atender con su stock (sin producto o con stock insuficiente). */
export function faltantes(lineas: Pick<LineaVentaSuc, "productoId" | "cantidad">[], stock: StockLocal[]): number {
  return lineas.filter((l) => {
    const s = l.productoId ? stock.find((x) => x.id === l.productoId) : undefined;
    return !s || s.stock < l.cantidad;
  }).length;
}

export async function registrarVenta(d: DatosVenta): Promise<VentaSucursal> {
  exigir(operaSucursal(), "Su usuario no puede registrar ventas de la sucursal.");
  exigir(!!d.cliente.trim(), "Ingrese el cliente.");
  if (d.tipoDoc === "FA") exigir(/^\d{11}$/.test(d.clienteDoc?.trim() ?? ""), "Para factura (FA) ingrese el RUC del cliente (11 dígitos).");
  const lineas: LineaVentaSuc[] = d.lineas
    .filter((l) => l.producto.trim())
    .map((l) => ({ ...l, ...oficial(l.producto), id: uid(), cantidad: Number(l.cantidad), precio: r2(Number(l.precio)), subtotal: r2(Number(l.cantidad) * Number(l.precio)) }));
  exigir(lineas.length > 0, "Agregue al menos un producto.");
  exigir(lineas.every((l) => l.cantidad > 0), "Las cantidades deben ser mayores a 0.");
  exigir(lineas.every((l) => l.precio >= 0), "Los precios no pueden ser negativos.");
  const total = r2(lineas.reduce((a, l) => a + l.subtotal, 0));
  exigir(total > 0, "El total de la venta debe ser mayor a 0.");

  const stock = getStockLocal();
  const sinStock = faltantes(lineas, stock) > 0;
  exigir(!(d.entregaInmediata && sinStock), "No hay stock local para entregar todo en el acto: regístrela como 'Por entregar' y derívela al Taller Principal.");
  // Valida el stock ANTES de pedir número (un error no debe gastar un correlativo)
  const stockNuevo = d.entregaInmediata ? descontar(lineas, stock) : stock;

  const suc = getSucursal();
  const numero = await siguienteSuc("VTA");
  const fecha = hoy();
  const venta: VentaSucursal = {
    id: uid(),
    numero,
    fecha,
    cliente: d.cliente.trim(),
    clienteId: d.clienteId,
    clienteDoc: d.clienteDoc?.trim() || undefined,
    tipoDoc: d.tipoDoc,
    docRef: `${numero} · ${d.tipoDoc}`,
    lineas,
    total,
    estado: d.entregaInmediata ? "entregada" : "registrada",
    sucursalId: suc.id,
    requiereTraslado: !d.entregaInmediata && sinStock,
    formaPago: d.formaPago,
    pagado: d.formaPago === "CONTADO",
    entrega: d.entregaInmediata ? { fecha, guia: "", recibidoPor: d.cliente.trim() } : undefined,
    observacion: d.observacion?.trim() || undefined,
    creadoPor: usuario(),
    historial: [ev("Venta registrada", `${d.tipoDoc} · ${lineas.length} ítem(s)${d.entregaInmediata ? " · entregada en el acto" : " · por entregar"}`)],
  };
  if (d.entregaInmediata) escribirSede(KEYS.SUC_STOCK, stockNuevo);
  escribirSede(KEYS.SUC_VENTAS, [venta, ...getVentasSuc()]);
  if (venta.pagado) movimientoCaja({ tipo: "INGRESO", categoria: "VENTA", concepto: `${venta.docRef} · ${venta.cliente}`, monto: total, ventaId: venta.id });
  return venta;
}

// ---------------------------------------------------------------------
// 2. Entregar producto
// ---------------------------------------------------------------------

export async function entregarVenta(id: string, d: { recibidoPor: string; dni?: string; firma?: string }): Promise<VentaSucursal> {
  exigir(operaSucursal(), "Su usuario no puede entregar productos.");
  exigir(!!d.recibidoPor.trim(), "Ingrese quién recibe.");
  exigir(!!d.firma, "Falta la firma del cliente.");
  const v = getVentasSuc().find((x) => x.id === id);
  exigir(!!v, "Venta no encontrada.");
  exigir(v!.estado === "registrada", v!.estado === "derivada" ? "La venta está derivada al Taller: espere el traslado y confirme la recepción." : "La venta ya fue entregada.");
  const stockNuevo = descontar(v!.lineas, getStockLocal());
  const guia = await siguienteSuc("GE");
  const fecha = hoy();
  const entregada: VentaSucursal = {
    ...v!,
    estado: "entregada",
    requiereTraslado: false,
    entrega: { fecha, guia, recibidoPor: d.recibidoPor.trim(), dni: d.dni?.trim() || undefined, firma: d.firma },
    historial: [...v!.historial, ev("Producto entregado", `${guia} · recibió ${d.recibidoPor.trim()}`)],
  };
  escribirSede(KEYS.SUC_STOCK, stockNuevo);
  escribirSede(KEYS.SUC_VENTAS, getVentasSuc().map((x) => (x.id === id ? entregada : x)));
  return entregada;
}

/** Cobro de una venta al crédito: entra a caja chica. */
export function cobrarVenta(id: string): void {
  exigir(operaSucursal(), "Su usuario no puede cobrar ventas.");
  const v = getVentasSuc().find((x) => x.id === id);
  exigir(!!v && !v.pagado, "La venta ya está pagada.");
  escribirSede(KEYS.SUC_VENTAS, getVentasSuc().map((x) => (x.id === id ? { ...x, pagado: true, historial: [...x.historial, ev("Cobrada")] } : x)));
  movimientoCaja({ tipo: "INGRESO", categoria: "COBRO", concepto: `Cobro ${v!.docRef} · ${v!.cliente}`, monto: v!.total, ventaId: id });
}

/** Cierra una venta entregada y pagada (ya no aparece en pendientes). */
export function cerrarVenta(id: string): void {
  exigir(operaSucursal(), "Su usuario no puede cerrar ventas.");
  const v = getVentasSuc().find((x) => x.id === id);
  exigir(!!v && v.estado === "entregada", "Solo se cierran ventas entregadas.");
  exigir(v!.pagado, "La venta tiene saldo por cobrar.");
  escribirSede(KEYS.SUC_VENTAS, getVentasSuc().map((x) => (x.id === id ? { ...x, estado: "cerrada" as const, historial: [...x.historial, ev("Venta cerrada")] } : x)));
}

// ---------------------------------------------------------------------
// 3. Derivar a Taller (POST /api/sucursal/derivar-venta)
// ---------------------------------------------------------------------

export async function derivarVenta(ventaId: string, motivo: MotivoDerivacion, detalle: string): Promise<Derivacion> {
  exigir(operaSucursal(), "Su usuario no puede derivar ventas.");
  const r = await fetch("/api/sucursal/derivar-venta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ventaId, motivo, detalle, sucursal: getSucursal().nombre }),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string; derivacion?: Derivacion; venta?: VentaSucursal };
  if (!r.ok || !j.derivacion) throw new ErpError(j.error ?? `No se pudo derivar (${r.status}).`);
  // La caché se actualiza al instante (Realtime trae lo mismo y no cuenta como cambio)
  aplicarLocal(KEYS.SUC_DERIVACIONES, j.derivacion);
  if (j.venta) aplicarLocal(KEYS.SUC_VENTAS, j.venta);
  return j.derivacion;
}

/** Pone en la caché una fila que ya guardó el servidor (no se reenvía: escribir solo manda diferencias). */
function aplicarLocal<T extends { id: string }>(key: (typeof KEYS)[keyof typeof KEYS], fila: T): void {
  const lista = leer<T[]>(key, []);
  escribir(key, lista.some((x) => x.id === fila.id) ? lista.map((x) => (x.id === fila.id ? fila : x)) : [fila, ...lista]);
}

export function prepararDerivacion(id: string): void {
  exigir(esTaller(), "Solo el Taller Principal prepara derivaciones.");
  const lista = getDerivaciones();
  const d = lista.find((x) => x.id === id);
  exigir(!!d && d.estado === "pendiente", "La derivación ya fue atendida.");
  escribirSede(KEYS.SUC_DERIVACIONES, lista.map((x) => (x.id === id ? { ...x, estado: "en-preparacion" as const } : x)));
}

// ---------------------------------------------------------------------
// 5. Traslados: OT + guía de remisión (Taller) y recepción (Sucursal)
// ---------------------------------------------------------------------

export interface DatosTraslado {
  productos: ProductoTraslado[];
  motivoTraslado: string;
  transportista?: string;
  placa?: string;
  reqId?: string;
  derivacionId?: string;
}

export async function crearTraslado(d: DatosTraslado): Promise<Traslado> {
  exigir(esTaller(), "Solo el Taller Principal (almacén) emite órdenes de traslado.");
  const productos = d.productos.filter((p) => p.producto.trim()).map((p) => ({ ...p, ...oficial(p.producto), cantidad: Number(p.cantidad) }));
  exigir(productos.length > 0, "Agregue al menos un producto.");
  exigir(productos.every((p) => p.cantidad > 0), "Las cantidades deben ser mayores a 0.");
  const der = d.derivacionId ? getDerivaciones().find((x) => x.id === d.derivacionId) : undefined;
  if (d.derivacionId) exigir(!!der && der.estado !== "convertida" && der.estado !== "anulada", "La derivación ya tiene OT.");
  const req = d.reqId ? getReqsSuc().find((x) => x.id === d.reqId) : undefined;
  if (d.reqId) exigir(!!req && req.estado === "enviado", "El requerimiento ya tiene traslado.");

  const suc = getSucursal();
  const codigo = await siguienteSuc("OT");
  const guiaRemision = await siguienteSuc("GR");
  const t: Traslado = {
    id: uid(),
    codigo,
    origen: "TALLER_PRINCIPAL",
    destinoSucursalId: suc.id,
    destino: `Sucursal ${suc.nombre}`,
    productos,
    estado: "en-camino",
    guiaRemision,
    fechaEnvio: hoy(),
    motivoTraslado: d.motivoTraslado || "Traslado entre establecimientos de la misma empresa",
    transportista: d.transportista?.trim() || undefined,
    placa: d.placa?.trim().toUpperCase() || undefined,
    reqId: req?.id,
    reqNumero: req?.numero,
    derivacionId: der?.id,
    ventaId: der?.ventaId,
    ventaNumero: der?.ventaNumero,
    emitidoPor: usuario(),
  };
  escribirSede(KEYS.SUC_TRASLADOS, [t, ...getTraslados()]);
  if (der) escribirSede(KEYS.SUC_DERIVACIONES, getDerivaciones().map((x) => (x.id === der.id ? { ...x, estado: "convertida" as const, trasladoId: t.id } : x)));
  if (req) escribirSede(KEYS.SUC_REQS, getReqsSuc().map((x) => (x.id === req.id ? { ...x, estado: "en-traslado" as const, trasladoId: t.id } : x)));
  return t;
}

/** Recepción conforme: suma al stock local, cierra el REQ-SUC y devuelve la venta derivada a "por entregar". */
export function confirmarRecepcion(id: string, recibidoPor: string): void {
  exigir(operaSucursal(), "Solo la sucursal confirma la recepción.");
  exigir(!!recibidoPor.trim(), "Ingrese quién recibe.");
  const t = getTraslados().find((x) => x.id === id);
  exigir(!!t && t.estado !== "recibido", "El traslado ya fue recibido.");
  const suc = getSucursal();

  // Stock local: por producto (id o nombre); lo que no existe se crea
  const stock = getStockLocal();
  for (const p of t!.productos) {
    const s = stock.find((x) => (p.productoId && x.id === p.productoId) || (!!p.productoMaestroId && x.productoMaestroId === p.productoMaestroId) || norm(x.producto) === norm(p.producto));
    if (s) s.stock = r2(s.stock + p.cantidad);
    else stock.unshift({ id: uid(), producto: p.producto, productoMaestroId: p.productoMaestroId, sku: p.sku, unidad: p.unidad || "UND", stock: p.cantidad, minimo: 0, costo: p.costo ?? 0, precio: 0, sucursalId: suc.id });
  }
  escribirSede(KEYS.SUC_STOCK, stock);

  escribirSede(KEYS.SUC_TRASLADOS, getTraslados().map((x) => (x.id === id ? { ...x, estado: "recibido" as const, fechaRecepcion: hoy(), recibidoPor: recibidoPor.trim() } : x)));
  if (t!.reqId) escribirSede(KEYS.SUC_REQS, getReqsSuc().map((x) => (x.id === t!.reqId ? { ...x, estado: "cerrado" as const } : x)));
  if (t!.ventaId)
    escribirSede(
      KEYS.SUC_VENTAS,
      getVentasSuc().map((v) =>
        v.id === t!.ventaId && v.estado === "derivada"
          ? { ...v, estado: "registrada" as const, requiereTraslado: false, historial: [...v.historial, ev("Traslado recibido", `${t!.codigo} · lista para entregar`)] }
          : v
      )
    );
}

export function observarTraslado(id: string, tipo: "FALTANTE" | "DANADO", detalle: string): void {
  exigir(operaSucursal(), "Solo la sucursal observa traslados.");
  exigir(!!detalle.trim(), "Describa el faltante o daño.");
  const t = getTraslados().find((x) => x.id === id);
  exigir(!!t && t.estado === "en-camino", "Solo se observan traslados en camino.");
  escribirSede(KEYS.SUC_TRASLADOS, getTraslados().map((x) => (x.id === id ? { ...x, estado: "observado" as const, observacion: { tipo, detalle: detalle.trim(), fecha: hoy() } } : x)));
}

// ---------------------------------------------------------------------
// 4. Requerimientos REQ-SECOCHA -> Almacén del Taller Principal (Arequipa)
// ---------------------------------------------------------------------

/** Producto del requerimiento (el formulario único RequerimientoForm también manda marca y característica). */
type ItemReqSuc = ProductoTraslado & { marca?: string; caracteristica?: string };

export async function crearReqSucursal(
  items: ItemReqSuc[],
  motivo: string,
  automatico = false,
  datos: { solicitante?: string; fecha?: string } = {}
): Promise<ReqSucursal> {
  exigir(operaSucursal(), "Su usuario no puede emitir requerimientos de la sucursal.");
  exigir(!!motivo.trim(), "Ingrese el motivo del requerimiento.");
  const lista = items.filter((i) => i.producto.trim()).map((i) => ({ ...i, ...oficial(i.producto), cantidad: Number(i.cantidad) }));
  exigir(lista.length > 0, "Agregue al menos un producto.");
  exigir(lista.every((i) => i.cantidad > 0), "Las cantidades deben ser mayores a 0.");
  const sesion = getSesion();
  const suc = getSucursal();
  const numero = await siguienteSuc("REQSUC");
  const id = uid();
  const fecha = datos.fecha || hoy();
  const itemsReq: ItemReq[] = lista.map((i) => ({
    id: uid(),
    nombre: i.producto,
    cantidad: i.cantidad,
    unidad: i.unidad || "UND",
    marca: i.marca?.trim() ?? "",
    caracteristica: i.caracteristica?.trim() ?? "",
    ...(i.productoMaestroId ? { productoId: i.productoMaestroId, sku: i.sku } : {}),
  }));
  // Mismo documento que los REQ de Almacén: llega al Almacén del Taller Principal (Arequipa) y sigue Cotización -> OC
  const req: Requerimiento = {
    id,
    numero,
    fecha,
    sede: suc.nombre,
    destino: DESTINO_REQ_SUCURSAL,
    solicitante: datos.solicitante?.trim() || (sesion ? nombreDe(sesion) : suc.nombre),
    motivo: motivo.trim(),
    items: itemsReq,
    estado: "PENDIENTE",
    historial: [ev(automatico ? "Reposición automática de stock local" : `Requerimiento de ${suc.nombre} emitido`, `${itemsReq.length} producto(s) · ${suc.nombre} → ${DESTINO_REQ_SUCURSAL}`)],
    creadoPor: usuario(),
    origen: "SUCURSAL",
    sucursalId: suc.id,
    sedeId: sedeActualId() || undefined,
  };
  escribir(KEYS.REQS_PENDIENTES, [req, ...getPendientes()]);
  const local: ReqSucursal = { id, numero, fecha, motivo: motivo.trim(), items: lista, estado: "enviado", automatico, sucursalId: suc.id, creadoPor: usuario() };
  escribirSede(KEYS.SUC_REQS, [local, ...getReqsSuc()]);
  return local;
}

/** Número probable del próximo REQ-SECOCHA (el definitivo lo asigna Supabase al enviar). */
export function numeroProbableSuc(reqs: ReqSucursal[]): string {
  const sede = getSedeActual();
  const ultimo = reqs.reduce((m, r) => Math.max(m, Number(/(\d+)$/.exec(r.numero)?.[1] ?? 0)), 0);
  return `REQ-${sede && !sede.es_central ? nombreSerie(sede.nombre) : "SUC"}-${String(ultimo + 1).padStart(3, "0")}`;
}

/** 7. Stock Local -> "Solicitar reposición": REQ-SECOCHA automático con lo que está bajo el mínimo. */
export async function solicitarReposicion(): Promise<ReqSucursal> {
  const bajos = getStockLocal().filter(bajoMinimo);
  exigir(bajos.length > 0, "No hay productos bajo el stock mínimo.");
  // Ya pedidos en un REQ-SECOCHA abierto: no se piden dos veces
  const abiertos = new Set(getReqsSuc().filter((r) => r.estado !== "cerrado").flatMap((r) => r.items.map((i) => i.productoId ?? norm(i.producto))));
  const items = bajos
    .filter((s) => !abiertos.has(s.id) && !abiertos.has(norm(s.producto)))
    .map((s) => ({ productoId: s.id, producto: s.producto, unidad: s.unidad, cantidad: r2(Math.max(s.minimo * 2 - s.stock, s.minimo - s.stock)), costo: s.costo }));
  exigir(items.length > 0, "Los productos bajo el mínimo ya tienen un requerimiento en curso.");
  return crearReqSucursal(items, `Reposición de stock local (${items.length} producto(s) bajo el mínimo)`, true);
}

// ---------------------------------------------------------------------
// 6. Caja chica
// ---------------------------------------------------------------------

function movimientoCaja(m: Omit<MovCaja, "id" | "fecha" | "sucursalId" | "usuario">): void {
  const mov: MovCaja = { ...m, id: uid(), fecha: hoy(), sucursalId: getSucursal().id, usuario: usuario(), monto: r2(m.monto) };
  escribirSede(KEYS.SUC_CAJA, [mov, ...getCaja()]);
}

export function registrarMovCaja(d: { tipo: "INGRESO" | "EGRESO"; categoria: CategoriaCaja; concepto: string; monto: number }): void {
  exigir(operaSucursal(), "Su usuario no puede mover la caja chica.");
  exigir(!!d.concepto.trim(), "Ingrese el concepto.");
  exigir(Number(d.monto) > 0, "El monto debe ser mayor a 0.");
  if (d.tipo === "EGRESO") exigir(Number(d.monto) <= saldoCaja(getCaja()), "El egreso supera el saldo de caja chica.");
  movimientoCaja({ ...d, concepto: d.concepto.trim(), monto: Number(d.monto) });
}

/** Cierre diario: totaliza lo no cerrado y lo envía a Tesorería Principal. */
export async function declararCierre(): Promise<CierreCaja> {
  exigir(operaSucursal(), "Su usuario no puede declarar el cierre de caja.");
  const movs = getCaja();
  const abiertos = movs.filter((m) => !m.cierreId);
  exigir(abiertos.length > 0, "No hay movimientos nuevos desde el último cierre.");
  exigir(!getCierres().some((c) => c.fecha === hoy()), "Ya se declaró el cierre de hoy.");
  const ingresos = r2(abiertos.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + m.monto, 0));
  const egresos = r2(abiertos.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + m.monto, 0));
  const saldoFinal = saldoCaja(movs);
  const suc = getSucursal();
  const cierre: CierreCaja = {
    id: uid(),
    numero: await siguienteSuc("CC"),
    fecha: hoy(),
    saldoInicial: r2(saldoFinal - ingresos + egresos),
    ingresos,
    egresos,
    saldoFinal,
    movimientos: abiertos.length,
    estado: "enviado",
    declaradoPor: usuario(),
    sucursalId: suc.id,
  };
  escribirSede(KEYS.SUC_CIERRES, [cierre, ...getCierres()]);
  escribirSede(KEYS.SUC_CAJA, getCaja().map((m) => (m.cierreId ? m : { ...m, cierreId: cierre.id })));
  const lista = deSede(leer<Sucursal[]>(KEYS.SUC_SUCURSALES, []));
  const conSaldo = { ...suc, cajaChicaActual: saldoFinal };
  escribirSede(KEYS.SUC_SUCURSALES, lista.some((s) => s.id === suc.id) ? lista.map((s) => (s.id === suc.id ? conSaldo : s)) : [conSaldo, ...lista]);
  return cierre;
}

export function recibirCierre(id: string): void {
  exigir(esTesoreria(), "Solo Tesorería Principal recibe los cierres de caja.");
  escribirSede(KEYS.SUC_CIERRES, getCierres().map((c) => (c.id === id ? { ...c, estado: "recibido" as const, recibidoPor: usuario() } : c)));
}

// ---------------------------------------------------------------------
// 7. Stock local · 8. Clientes
// ---------------------------------------------------------------------

export function guardarStock(d: Omit<StockLocal, "id" | "sucursalId"> & { id?: string }): void {
  exigir(operaSucursal(), "Su usuario no puede editar el stock local.");
  exigir(!!d.producto.trim(), "Ingrese el producto.");
  exigir(d.stock >= 0 && d.minimo >= 0 && d.costo >= 0 && d.precio >= 0, "Los valores no pueden ser negativos.");
  const lista = getStockLocal();
  const of = oficial(d.producto);
  exigir(!lista.some((s) => s.id !== d.id && norm(s.producto) === norm(of.producto)), "Ese producto ya está en el stock local.");
  const item: StockLocal = { ...d, ...of, id: d.id ?? uid(), sucursalId: getSucursal().id };
  escribirSede(KEYS.SUC_STOCK, d.id ? lista.map((s) => (s.id === d.id ? item : s)) : [item, ...lista]);
}

export function eliminarStock(id: string): void {
  exigir(operaSucursal(), "Su usuario no puede editar el stock local.");
  escribirSede(KEYS.SUC_STOCK, getStockLocal().filter((s) => s.id !== id));
}

export function guardarCliente(d: Omit<ClienteSuc, "id" | "sucursalId"> & { id?: string }): ClienteSuc {
  exigir(operaSucursal(), "Su usuario no puede editar clientes.");
  exigir(!!d.nombre.trim(), "Ingrese el nombre del cliente.");
  const doc = d.doc.trim();
  exigir(!doc || /^(\d{8}|\d{11})$/.test(doc), "El documento debe ser DNI (8 dígitos) o RUC (11 dígitos).");
  const lista = getClientesSuc();
  exigir(!doc || !lista.some((c) => c.id !== d.id && c.doc === doc), "Ya existe un cliente con ese documento.");
  const c: ClienteSuc = { ...d, id: d.id ?? uid(), nombre: d.nombre.trim(), doc, sucursalId: getSucursal().id };
  escribirSede(KEYS.SUC_CLIENTES, d.id ? lista.map((x) => (x.id === d.id ? c : x)) : [c, ...lista]);
  return c;
}

export function eliminarCliente(id: string): void {
  exigir(operaSucursal(), "Su usuario no puede editar clientes.");
  exigir(!getVentasSuc().some((v) => v.clienteId === id && !v.pagado), "El cliente tiene deuda pendiente.");
  escribirSede(KEYS.SUC_CLIENTES, getClientesSuc().filter((c) => c.id !== id));
}

/** Compras, deuda y frecuencia de un cliente (por id o, en ventas antiguas, por nombre). */
export function resumenCliente(c: Pick<ClienteSuc, "id" | "nombre">, ventas: VentaSucursal[]) {
  const suyas = ventas.filter((v) => v.clienteId === c.id || (!v.clienteId && norm(v.cliente) === norm(c.nombre)));
  return {
    ventas: suyas,
    comprado: r2(suyas.reduce((a, v) => a + v.total, 0)),
    deuda: r2(suyas.filter((v) => !v.pagado).reduce((a, v) => a + v.total, 0)),
    frecuente: suyas.length >= 3,
    ultima: suyas.map((v) => v.fecha).sort().pop(),
  };
}
