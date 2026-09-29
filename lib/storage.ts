"use client";

// =====================================================================
// Capa de persistencia (localStorage). Toda la lógica de negocio pasa por
// aquí para que migrar a Supabase sea reemplazar este archivo.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import type {
  Cotizacion,
  EventoHistorial,
  Factura,
  Guia,
  OrdenCompra,
  Requerimiento,
  Rol,
  TipoAfp,
  TipoSueldo,
  Trabajador,
  VistoBueno,
} from "./types";

export const KEYS = {
  REQS_PENDIENTES: "reqs_almacen_pendientes",
  REQS_PROCESADOS: "reqs_procesados_compras",
  COTIZACIONES: "cotizaciones",
  ORDENES: "ordenes_compra",
  FACTURAS: "facturas",
  GUIAS: "guias",
  CONTADORES: "erp_contadores",
  ROL: "erp_rol",
  TRABAJADORES: "CV_TRABAJADORES_V2",
} as const;

export type StoreKey = (typeof KEYS)[keyof typeof KEYS];

const EVENTO = "erp:update";

export const IGV = 0.18;
/** Tope para compras con Declaración Jurada (sin comprobante). Ajustable. */
export const TOPE_DJ = 700;

// ---------------------------------------------------------------------
// Utilidades base
// ---------------------------------------------------------------------

export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const hoy = (): string => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export const soles = (n: number): string =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fechaPE = (iso: string): string => {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export class ErpError extends Error {}

export function leer<T>(key: StoreKey, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Dato corrupto: se descarta para no romper la app
    window.localStorage.removeItem(key);
    return fallback;
  }
}

export function escribir<T>(key: StoreKey, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      throw new ErpError(
        "Almacenamiento lleno. Elimine guías antiguas o use archivos más livianos (máx. 1.5 MB)."
      );
    }
    throw e;
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: key }));
}

/** Hook reactivo: se actualiza cuando cualquier módulo (o pestaña) escribe la key. */
export function useStore<T>(key: StoreKey, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const cargar = () => setValue(leer<T>(key, fallback));
    cargar();
    const onLocal = (e: Event) => {
      const k = (e as CustomEvent<string>).detail;
      if (k === key) cargar();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) cargar();
    };
    window.addEventListener(EVENTO, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENTO, onLocal);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

function evento(usuario: Rol, accion: string, detalle?: string): EventoHistorial {
  return { fecha: new Date().toISOString(), usuario, accion, detalle };
}

function siguiente(serie: "REQ" | "OC" | "DJ"): number {
  const c = leer<Record<string, number>>(KEYS.CONTADORES, {});
  const n = (c[serie] ?? 0) + 1;
  escribir(KEYS.CONTADORES, { ...c, [serie]: n });
  return n;
}

export function previewNumero(serie: "REQ" | "OC" | "DJ"): string {
  const c = leer<Record<string, number>>(KEYS.CONTADORES, {});
  return formatear(serie, (c[serie] ?? 0) + 1);
}

function formatear(serie: "REQ" | "OC" | "DJ", n: number): string {
  if (serie === "REQ") return `REQ-ALM-${String(n).padStart(3, "0")}`;
  if (serie === "OC") return `OC-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  return `DJ-${String(n).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------
// Lectores
// ---------------------------------------------------------------------

export const getPendientes = () => leer<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
export const getProcesados = () => leer<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
export const getCotizaciones = () => leer<Cotizacion[]>(KEYS.COTIZACIONES, []);
export const getOrdenes = () => leer<OrdenCompra[]>(KEYS.ORDENES, []);
export const getFacturas = () => leer<Factura[]>(KEYS.FACTURAS, []);
export const getGuias = () => leer<Guia[]>(KEYS.GUIAS, []);

export function buscarReq(id: string): Requerimiento | undefined {
  return getPendientes().find((r) => r.id === id) ?? getProcesados().find((r) => r.id === id);
}

function actualizarProcesado(id: string, fn: (r: Requerimiento) => Requerimiento): void {
  const lista = getProcesados();
  const i = lista.findIndex((r) => r.id === id);
  if (i < 0) throw new ErpError("Requerimiento no encontrado en la lista de procesados.");
  lista[i] = fn(lista[i]);
  escribir(KEYS.REQS_PROCESADOS, lista);
}

function actualizarOC(id: string, fn: (o: OrdenCompra) => OrdenCompra): void {
  const lista = getOrdenes();
  const i = lista.findIndex((o) => o.id === id);
  if (i < 0) throw new ErpError("Orden de compra no encontrada.");
  lista[i] = fn(lista[i]);
  escribir(KEYS.ORDENES, lista);
}

// ---------------------------------------------------------------------
// 1. ALMACÉN: crea requerimiento
// ---------------------------------------------------------------------

export function crearRequerimiento(
  data: Omit<Requerimiento, "id" | "numero" | "estado" | "historial">,
  rol: Rol
): Requerimiento {
  if (!data.sede.trim()) throw new ErpError("Seleccione la sede.");
  if (!data.solicitante.trim()) throw new ErpError("Ingrese el solicitante.");
  if (!data.motivo.trim()) throw new ErpError("Ingrese el motivo del requerimiento.");
  const items = data.items.filter((i) => i.nombre.trim());
  if (items.length === 0) throw new ErpError("Agregue al menos un producto.");
  if (items.some((i) => !(i.cantidad > 0))) throw new ErpError("Todas las cantidades deben ser mayores a 0.");

  const req: Requerimiento = {
    ...data,
    items,
    id: uid(),
    numero: formatear("REQ", siguiente("REQ")),
    estado: "PENDIENTE",
    historial: [evento(rol, "Requerimiento emitido", `${items.length} producto(s) · Sede ${data.sede}`)],
  };
  escribir(KEYS.REQS_PENDIENTES, [req, ...getPendientes()]);
  return req;
}

/** Almacén corrige un REQ observado y lo reenvía a Tesorería. */
export function reenviarRequerimiento(
  id: string,
  cambios: Pick<Requerimiento, "items" | "motivo" | "sede" | "solicitante">,
  rol: Rol
): void {
  const lista = getProcesados();
  const req = lista.find((r) => r.id === id);
  if (!req || req.estado !== "OBSERVADO") throw new ErpError("Solo se pueden reenviar requerimientos OBSERVADOS.");
  const items = cambios.items.filter((i) => i.nombre.trim());
  if (items.length === 0) throw new ErpError("Agregue al menos un producto.");
  const actualizado: Requerimiento = {
    ...req,
    ...cambios,
    items,
    estado: "PENDIENTE",
    historial: [...req.historial, evento(rol, "Corregido y reenviado a Tesorería")],
  };
  escribir(KEYS.REQS_PROCESADOS, lista.filter((r) => r.id !== id));
  escribir(KEYS.REQS_PENDIENTES, [actualizado, ...getPendientes()]);
}

// ---------------------------------------------------------------------
// 2. TESORERÍA: revisa notificaciones
//    ACEPTAR  -> sale de notificaciones, QUEDA en lista con ACEPTADO
//    RECHAZAR -> se borra de TODO el sistema
//    OBSERVAR -> sale de notificaciones, queda en lista OBSERVADO (Almacén corrige)
// ---------------------------------------------------------------------

function sacarDePendientes(id: string): Requerimiento {
  const pend = getPendientes();
  const req = pend.find((r) => r.id === id);
  if (!req) throw new ErpError("El requerimiento ya no está pendiente (quizá fue procesado en otra pestaña).");
  escribir(KEYS.REQS_PENDIENTES, pend.filter((r) => r.id !== id));
  return req;
}

export function aceptarRequerimiento(id: string, rol: Rol): void {
  const req = sacarDePendientes(id);
  const aceptado: Requerimiento = {
    ...req,
    estado: "ACEPTADO",
    observacion: undefined,
    historial: [...req.historial, evento(rol, "Aceptado por Tesorería")],
  };
  escribir(KEYS.REQS_PROCESADOS, [aceptado, ...getProcesados().filter((r) => r.id !== id)]);
}

export function rechazarRequerimiento(id: string): void {
  // Borrado total: notificaciones + lista de procesados
  escribir(KEYS.REQS_PENDIENTES, getPendientes().filter((r) => r.id !== id));
  escribir(KEYS.REQS_PROCESADOS, getProcesados().filter((r) => r.id !== id));
}

export function observarRequerimiento(id: string, motivo: string, rol: Rol): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la observación.");
  const req = sacarDePendientes(id);
  const obs: Requerimiento = {
    ...req,
    estado: "OBSERVADO",
    observacion: motivo.trim(),
    historial: [...req.historial, evento(rol, "Observado por Tesorería", motivo.trim())],
  };
  escribir(KEYS.REQS_PROCESADOS, [obs, ...getProcesados().filter((r) => r.id !== id)]);
}

// ---------------------------------------------------------------------
// 3. COTIZACIÓN (vinculada a REQ aceptado)
// ---------------------------------------------------------------------

export const rucValido = (ruc: string): boolean => {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = f.reduce((a, w, i) => a + w * Number(ruc[i]), 0);
  const d = 11 - (s % 11);
  const dv = d === 10 ? 0 : d === 11 ? 1 : d;
  return dv === Number(ruc[10]);
};

export function crearCotizacion(
  data: Pick<Cotizacion, "numero" | "fechaEmision" | "reqId" | "proveedor" | "ruc" | "items">,
  rol: Rol
): Cotizacion {
  const req = getProcesados().find((r) => r.id === data.reqId);
  if (!req) throw new ErpError("Seleccione un requerimiento válido.");
  if (req.estado !== "ACEPTADO" && req.estado !== "COTIZADO")
    throw new ErpError(`El ${req.numero} está ${req.estado}; solo se cotizan REQ aceptados.`);
  if (!data.proveedor.trim()) throw new ErpError("Ingrese el proveedor.");
  if (!rucValido(data.ruc)) throw new ErpError("RUC inválido (11 dígitos con dígito verificador correcto).");
  if (!data.numero.trim()) throw new ErpError("Ingrese el Nro de cotización.");
  if (getCotizaciones().some((c) => c.numero === data.numero.trim() && c.ruc === data.ruc))
    throw new ErpError("Esa cotización ya fue registrada para este proveedor.");
  if (data.items.some((i) => !(i.precioUnit > 0))) throw new ErpError("Ingrese precio unitario > 0 en todos los productos.");

  const items = data.items.map((i) => ({ ...i, subtotal: r2(i.cantidad * i.precioUnit) }));
  const subtotal = r2(items.reduce((a, i) => a + i.subtotal, 0));
  const igv = r2(subtotal * IGV);
  const coti: Cotizacion = {
    ...data,
    numero: data.numero.trim(),
    proveedor: data.proveedor.trim().toUpperCase(),
    items,
    id: uid(),
    reqNumero: req.numero,
    subtotal,
    igv,
    total: r2(subtotal + igv),
    estado: "REGISTRADA",
    historial: [evento(rol, "Cotización registrada", `${data.proveedor} · ${req.numero}`)],
  };
  escribir(KEYS.COTIZACIONES, [coti, ...getCotizaciones()]);
  if (req.estado === "ACEPTADO") {
    actualizarProcesado(req.id, (r) => ({
      ...r,
      estado: "COTIZADO",
      historial: [...r.historial, evento(rol, "Cotizado", `Cot. ${coti.numero} · ${coti.proveedor}`)],
    }));
  }
  return coti;
}

// ---------------------------------------------------------------------
// 4. ORDEN DE COMPRA (vinculada a COTIZACIÓN)
// ---------------------------------------------------------------------

export function crearOrdenCompra(
  data: Pick<OrdenCompra, "fecha" | "cotizacionId" | "formaPago" | "tiempoEntrega" | "lugarEntrega">,
  rol: Rol
): OrdenCompra {
  const coti = getCotizaciones().find((c) => c.id === data.cotizacionId);
  if (!coti) throw new ErpError("Seleccione una cotización.");
  if (coti.estado === "CON_OC") throw new ErpError("Esta cotización ya tiene Orden de Compra.");
  if (getOrdenes().some((o) => o.reqId === coti.reqId))
    throw new ErpError(`El ${coti.reqNumero} ya tiene una Orden de Compra emitida con otra cotización.`);
  if (!data.tiempoEntrega.trim()) throw new ErpError("Indique el tiempo de entrega.");

  const oc: OrdenCompra = {
    ...data,
    id: uid(),
    numero: formatear("OC", siguiente("OC")),
    cotizacionNumero: coti.numero,
    reqId: coti.reqId,
    reqNumero: coti.reqNumero,
    proveedor: coti.proveedor,
    ruc: coti.ruc,
    items: coti.items,
    subtotal: coti.subtotal,
    igv: coti.igv,
    total: coti.total,
    estado: "EMITIDA",
    historial: [evento(rol, "Orden de compra emitida", `Desde Cot. ${coti.numero}`)],
  };
  escribir(KEYS.ORDENES, [oc, ...getOrdenes()]);
  escribir(
    KEYS.COTIZACIONES,
    getCotizaciones().map((c) =>
      c.id === coti.id
        ? { ...c, estado: "CON_OC" as const, historial: [...c.historial, evento(rol, "Adjudicada", oc.numero)] }
        : c
    )
  );
  actualizarProcesado(coti.reqId, (r) => ({
    ...r,
    estado: "COMPRADO",
    historial: [...r.historial, evento(rol, "Orden de compra emitida", `${oc.numero} · ${oc.proveedor}`)],
  }));
  return oc;
}

// ---------------------------------------------------------------------
// 5. FACTURA (vinculada a OC)  |  8. DECLARACIÓN JURADA (excepción)
// ---------------------------------------------------------------------

export function crearFactura(
  data: Pick<Factura, "numero" | "fecha" | "fechaVencimiento" | "ocId" | "subtotal">,
  rol: Rol
): Factura {
  const oc = getOrdenes().find((o) => o.id === data.ocId);
  if (!oc) throw new ErpError("Seleccione una Orden de Compra.");
  if (oc.estado !== "EMITIDA") throw new ErpError(`La ${oc.numero} ya tiene comprobante.`);
  const num = data.numero.trim().toUpperCase();
  if (!/^[EF][A-Z0-9]{3}-\d{1,8}$/.test(num)) throw new ErpError("Formato de factura inválido. Ej: F001-00001234 / E001-123");
  if (getFacturas().some((f) => f.numero === num && f.ruc === oc.ruc)) throw new ErpError("Factura duplicada para este proveedor.");
  if (!(data.subtotal > 0)) throw new ErpError("El subtotal debe ser mayor a 0.");
  const subtotal = r2(data.subtotal);
  const igv = r2(subtotal * IGV);
  const fac: Factura = {
    ...data,
    tipo: "FACTURA",
    numero: num,
    subtotal,
    igv,
    total: r2(subtotal + igv),
    ocNumero: oc.numero,
    reqId: oc.reqId,
    reqNumero: oc.reqNumero,
    proveedor: oc.proveedor,
    ruc: oc.ruc,
    estadoPago: "POR_PAGAR",
    id: uid(),
    historial: [evento(rol, "Factura registrada", `${num} · ${oc.numero}`)],
  };
  escribir(KEYS.FACTURAS, [fac, ...getFacturas()]);
  actualizarOC(oc.id, (o) => ({
    ...o,
    estado: "FACTURADA",
    historial: [...o.historial, evento(rol, "Facturada", num)],
  }));
  return fac;
}

export function crearDeclaracionJurada(
  data: Pick<Factura, "fecha" | "ocId" | "motivoSinComprobante" | "aprobadoPor"> & { dniVendedor: string; nombreVendedor: string },
  rol: Rol
): Factura {
  if (rol !== "GERENCIA") throw new ErpError("Solo GERENCIA puede aprobar una Declaración Jurada.");
  const oc = getOrdenes().find((o) => o.id === data.ocId);
  if (!oc) throw new ErpError("Seleccione una Orden de Compra.");
  if (oc.estado !== "EMITIDA") throw new ErpError(`La ${oc.numero} ya tiene comprobante.`);
  if (oc.subtotal > TOPE_DJ) throw new ErpError(`El monto (${soles(oc.subtotal)}) supera el tope de DJ (${soles(TOPE_DJ)}).`);
  if (!/^\d{8}$/.test(data.dniVendedor)) throw new ErpError("DNI del vendedor inválido (8 dígitos).");
  if (!data.nombreVendedor.trim()) throw new ErpError("Ingrese el nombre del vendedor.");
  if (!data.motivoSinComprobante?.trim()) throw new ErpError("Indique por qué no hay comprobante.");
  if (!data.aprobadoPor?.trim()) throw new ErpError("Indique quién aprueba.");

  const dj: Factura = {
    id: uid(),
    tipo: "DECLARACION_JURADA",
    numero: formatear("DJ", siguiente("DJ")),
    fecha: data.fecha,
    fechaVencimiento: data.fecha,
    ocId: oc.id,
    ocNumero: oc.numero,
    reqId: oc.reqId,
    reqNumero: oc.reqNumero,
    proveedor: data.nombreVendedor.trim().toUpperCase(),
    ruc: data.dniVendedor,
    subtotal: oc.subtotal,
    igv: 0,
    total: oc.subtotal,
    estadoPago: "POR_PAGAR",
    motivoSinComprobante: data.motivoSinComprobante.trim(),
    aprobadoPor: data.aprobadoPor.trim(),
    historial: [evento(rol, "Declaración jurada aprobada", data.aprobadoPor)],
  };
  escribir(KEYS.FACTURAS, [dj, ...getFacturas()]);
  // La DJ no requiere guía: pasa directo a visto bueno de Almacén
  actualizarOC(oc.id, (o) => ({
    ...o,
    estado: "EN_GUIA",
    historial: [...o.historial, evento(rol, "Sustentada con Declaración Jurada", dj.numero)],
  }));
  return dj;
}

export function marcarPago(id: string, pagada: boolean, rol: Rol): void {
  escribir(
    KEYS.FACTURAS,
    getFacturas().map((f) =>
      f.id === id
        ? {
            ...f,
            estadoPago: pagada ? ("PAGADA" as const) : ("POR_PAGAR" as const),
            historial: [...f.historial, evento(rol, pagada ? "Marcada como PAGADA" : "Revertida a POR PAGAR")],
          }
        : f
    )
  );
}

// ---------------------------------------------------------------------
// 6. GUÍA DE REMISIÓN (archivo vinculado a FACTURA / OC)
// ---------------------------------------------------------------------

export const MAX_ARCHIVO = 1.5 * 1024 * 1024;

export function crearGuia(
  data: Pick<Guia, "numero" | "fecha" | "facturaId" | "archivoNombre" | "archivoTipo" | "archivoDataUrl">,
  rol: Rol
): Guia {
  const fac = getFacturas().find((f) => f.id === data.facturaId);
  if (!fac || fac.tipo !== "FACTURA") throw new ErpError("Seleccione una factura.");
  const previa = getGuias().find((g) => g.facturaId === fac.id);
  if (previa && previa.estado !== "OBSERVADA") throw new ErpError("Esta factura ya tiene guía.");
  if (!data.numero.trim()) throw new ErpError("Ingrese el Nro de guía de remisión.");
  if (!data.archivoDataUrl) throw new ErpError("Adjunte la guía escaneada (PDF o imagen).");
  const guia: Guia = {
    ...data,
    numero: data.numero.trim().toUpperCase(),
    id: uid(),
    facturaNumero: fac.numero,
    ocId: fac.ocId,
    ocNumero: fac.ocNumero,
    reqId: fac.reqId,
    estado: "PENDIENTE_VB",
    historial: [
      ...(previa ? previa.historial : []),
      evento(rol, previa ? "Guía reemplazada tras observación" : "Guía de remisión cargada", data.archivoNombre),
    ],
  };
  escribir(KEYS.GUIAS, [guia, ...getGuias().filter((g) => g.id !== previa?.id)]);
  actualizarOC(fac.ocId, (o) => ({
    ...o,
    estado: "EN_GUIA",
    historial: [...o.historial, evento(rol, "Guía de remisión cargada", guia.numero)],
  }));
  return guia;
}

// ---------------------------------------------------------------------
// 7. ALMACÉN: VISTO BUENO FINAL
// ---------------------------------------------------------------------

export function darVistoBueno(ocId: string, vb: Omit<VistoBueno, "fecha">, rol: Rol): void {
  if (rol !== "ALMACEN" && rol !== "GERENCIA") throw new ErpError("Solo ALMACÉN puede dar el visto bueno de ingreso.");
  if (!vb.recibidoPor.trim()) throw new ErpError("Indique quién recibió la mercadería.");
  const oc = getOrdenes().find((o) => o.id === ocId);
  if (!oc || oc.estado !== "EN_GUIA") throw new ErpError("La OC no está lista para visto bueno.");
  const ahora = new Date().toISOString();
  actualizarOC(ocId, (o) => ({
    ...o,
    estado: "FINALIZADA",
    vistoBueno: { ...vb, fecha: ahora },
    historial: [...o.historial, evento(rol, "Visto bueno de ingreso a almacén", vb.recibidoPor)],
  }));
  escribir(
    KEYS.GUIAS,
    getGuias().map((g) =>
      g.ocId === ocId
        ? { ...g, estado: "CONFORME" as const, historial: [...g.historial, evento(rol, "Conforme en almacén")] }
        : g
    )
  );
  actualizarProcesado(oc.reqId, (r) => ({
    ...r,
    estado: "FINALIZADO",
    historial: [...r.historial, evento(rol, "FINALIZADO · Ingreso a almacén conforme", vb.observaciones || undefined)],
  }));
}

export function observarIngreso(ocId: string, motivo: string, rol: Rol): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la observación.");
  const oc = getOrdenes().find((o) => o.id === ocId);
  if (!oc) throw new ErpError("OC no encontrada.");
  actualizarOC(ocId, (o) => ({
    ...o,
    historial: [...o.historial, evento(rol, "Ingreso observado por Almacén", motivo)],
  }));
  escribir(
    KEYS.GUIAS,
    getGuias().map((g) =>
      g.ocId === ocId
        ? { ...g, estado: "OBSERVADA" as const, historial: [...g.historial, evento(rol, "Observada", motivo)] }
        : g
    )
  );
}

// ---------------------------------------------------------------------
// PLANILLA: maestro de trabajadores
// ---------------------------------------------------------------------

export const TIPOS_SUELDO: Record<TipoSueldo, { label: string; divisor: number }> = {
  DIARIO: { label: "Diario", divisor: 1 },
  SEMANAL: { label: "Semanal", divisor: 6 }, // 6 días laborables
  QUINCENAL: { label: "Quincenal", divisor: 15 },
  MENSUAL: { label: "Mensual", divisor: 30 },
};

export const AFP_OPTIONS: Record<TipoAfp, { label: string; porc: number }> = {
  AFP_INTEGRA: { label: "AFP Integra", porc: 13.0 },
  AFP_PRIMA: { label: "AFP Prima", porc: 12.9 },
  AFP_HABITAT: { label: "AFP Habitat", porc: 12.85 },
  AFP_PROFUTURO: { label: "AFP Profuturo", porc: 12.95 },
  ONP: { label: "ONP 13%", porc: 13.0 },
  SIN: { label: "Sin descuento / Recibo por Honorarios", porc: 0 },
};

export const trabajadorVacio = (): Trabajador => ({
  id: "",
  nombre: "",
  dni: "",
  cargo: "Operario",
  fechaIngreso: hoy(),
  sueldo: 80,
  tipoSueldo: "DIARIO",
  afpTipo: "AFP_INTEGRA",
  afpPorcentaje: AFP_OPTIONS.AFP_INTEGRA.porc,
  activo: true,
});

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Completa registros antiguos (sin fechaIngreso / afpTipo / tipoSueldo) para que no rompan la UI. */
function normalizarTrabajador(t: Partial<Trabajador>): Trabajador {
  const base = trabajadorVacio();
  const tipoSueldo = t.tipoSueldo && t.tipoSueldo in TIPOS_SUELDO ? t.tipoSueldo : base.tipoSueldo;
  const afpTipo = t.afpTipo && t.afpTipo in AFP_OPTIONS ? t.afpTipo : base.afpTipo;
  const afpPorcentaje = Number(t.afpPorcentaje);
  const sueldo = Number(t.sueldo);
  return {
    id: String(t.id ?? "").trim(),
    nombre: String(t.nombre ?? "").trim(),
    dni: String(t.dni ?? "").trim(),
    cargo: String(t.cargo ?? "").trim() || base.cargo,
    fechaIngreso: typeof t.fechaIngreso === "string" && FECHA_RE.test(t.fechaIngreso) ? t.fechaIngreso : "",
    sueldo: Number.isFinite(sueldo) && sueldo >= 0 ? sueldo : base.sueldo,
    tipoSueldo,
    afpTipo,
    afpPorcentaje: Number.isFinite(afpPorcentaje) && afpPorcentaje >= 0 ? afpPorcentaje : AFP_OPTIONS[afpTipo].porc,
    activo: t.activo !== false,
  };
}

export const getTrabajadores = (): Trabajador[] =>
  leer<Partial<Trabajador>[]>(KEYS.TRABAJADORES, []).map(normalizarTrabajador).filter((t) => t.id);

/** Hook reactivo del maestro de trabajadores, siempre normalizado. */
export function useTrabajadores(): Trabajador[] {
  const raw = useStore<Partial<Trabajador>[]>(KEYS.TRABAJADORES, []);
  return useMemo(() => raw.map(normalizarTrabajador).filter((t) => t.id), [raw]);
}

function validarTrabajador(t: Trabajador): void {
  if (!t.id) throw new ErpError("Ingrese el N° de huella.");
  if (!t.nombre) throw new ErpError("Ingrese el nombre completo.");
  if (t.dni && !/^\d{8}$/.test(t.dni)) throw new ErpError("DNI inválido (8 dígitos).");
  if (!t.fechaIngreso || !FECHA_RE.test(t.fechaIngreso)) throw new ErpError("Ingrese la fecha de ingreso.");
  if (t.fechaIngreso > hoy()) throw new ErpError("La fecha de ingreso no puede ser futura.");
  if (!(t.tipoSueldo in TIPOS_SUELDO)) throw new ErpError("Seleccione el tipo de sueldo.");
  if (!(t.sueldo > 0)) throw new ErpError("El sueldo debe ser mayor a 0.");
  if (!(t.afpTipo in AFP_OPTIONS)) throw new ErpError("Seleccione el sistema de pensiones.");
  if (!(t.afpPorcentaje >= 0 && t.afpPorcentaje <= 100)) throw new ErpError("El % de descuento debe estar entre 0 y 100.");
}

/**
 * Crea o actualiza un trabajador. `idOriginal` es el N° de huella antes de editar
 * (permite corregirlo sin duplicar el registro).
 */
export function guardarTrabajador(data: Trabajador, idOriginal?: string): Trabajador {
  const t = normalizarTrabajador({ ...data, nombre: data.nombre.toUpperCase() });
  if (t.afpTipo === "SIN") t.afpPorcentaje = 0;
  validarTrabajador(t);
  const lista = getTrabajadores();
  const otros = lista.filter((x) => x.id !== (idOriginal ?? t.id));
  if (otros.some((x) => x.id === t.id)) throw new ErpError(`El N° de huella ${t.id} ya está asignado a otro trabajador.`);
  if (t.dni && otros.some((x) => x.dni === t.dni)) throw new ErpError(`El DNI ${t.dni} ya está registrado.`);
  const i = lista.findIndex((x) => x.id === (idOriginal ?? t.id));
  if (i >= 0) lista[i] = t;
  else lista.push(t);
  escribir(KEYS.TRABAJADORES, lista);
  return t;
}

/** Alta / baja sin revalidar el resto de datos (permite dar de baja a un trabajador incompleto). */
export function cambiarEstadoTrabajador(id: string, activo: boolean): void {
  const lista = getTrabajadores();
  if (!lista.some((t) => t.id === id)) throw new ErpError("Trabajador no encontrado.");
  escribir(KEYS.TRABAJADORES, lista.map((t) => (t.id === id ? { ...t, activo } : t)));
}

export function eliminarTrabajador(id: string): void {
  escribir(KEYS.TRABAJADORES, getTrabajadores().filter((t) => t.id !== id));
}

/** Registra en bloque los N° de huella que llegan del reloj y aún no existen. Devuelve cuántos se crearon. */
export function registrarDesdeAsistencia(nuevos: { id: string; nombre: string }[]): number {
  const lista = getTrabajadores();
  let n = 0;
  nuevos.forEach(({ id, nombre }) => {
    if (!id || lista.some((t) => t.id === id)) return;
    // fechaIngreso vacía: se completa al editar el trabajador
    lista.push({ ...trabajadorVacio(), id, nombre: nombre.toUpperCase() || `TRABAJADOR ${id}`, fechaIngreso: "" });
    n++;
  });
  if (n > 0) escribir(KEYS.TRABAJADORES, lista);
  return n;
}

// ---------------------------------------------------------------------
// Rol activo (simulado)
// ---------------------------------------------------------------------

export const PERMISOS: Record<Rol, { label: string; puede: string[] }> = {
  ALMACEN: { label: "Almacén", puede: ["req.crear", "req.reenviar", "vb.dar"] },
  TESORERIA: { label: "Tesorería / Compras", puede: ["req.revisar", "coti.crear", "oc.crear", "fac.crear", "guia.crear", "fac.pagar"] },
  GERENCIA: {
    label: "Gerencia (admin)",
    puede: ["req.crear", "req.reenviar", "req.revisar", "coti.crear", "oc.crear", "fac.crear", "guia.crear", "fac.pagar", "dj.aprobar", "vb.dar"],
  },
  CONTADOR: { label: "Contador (lectura)", puede: [] },
};

export const puede = (rol: Rol, permiso: string): boolean => PERMISOS[rol].puede.includes(permiso);

export function useRol(): [Rol, (r: Rol) => void] {
  const rol = useStore<Rol>(KEYS.ROL, "GERENCIA");
  return [rol, (r: Rol) => escribir(KEYS.ROL, r)];
}
