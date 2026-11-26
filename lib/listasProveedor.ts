// =====================================================================
// Listas de pedido por proveedor · Williams 2026-11-26
//
// Une los REQ de Almacén por proveedor: cada producto del REQ se asigna al proveedor que lo vende
// (Logística › Base de proveedores, con 1ª / 2ª / 3ª opción). Los REQ que llegan dentro de una ventana
// de DIAS_VENTANA días para el mismo proveedor se juntan en UNA lista (SC-001-2026). Tesorería revisa esa
// lista (aceptar, observar, rechazar, editar, mover productos a otro proveedor), la envía por WhatsApp o
// correo a uno o varios proveedores pidiendo cotización y, al recibirla, solo escribe N°, fecha y precios:
// el proveedor, RUC y asesor ya vienen de la base. Se guarda una Cotización por cada REQ de la lista,
// así la Orden de Compra sigue igual que hoy.
//
// Documentos: compras tipo 'lista_proveedor' (KEYS.LISTAS_PROVEEDOR), aislados por sede como los REQ.
// Las listas se arman solas (sincronizarListas) cada vez que Tesorería tiene abierto su módulo: la
// asignación depende solo de los REQ, de la base y de la hora de cada REQ, así que da lo mismo quién la corra.
// =====================================================================

import { EMPRESA } from "./empresa";
import { getSesion } from "./auth";
import {
  DESTINO_ALMACEN_AQP,
  ErpError,
  KEYS,
  aceptarMultiple,
  cargarClave,
  claveCargada,
  crearCotizacion,
  enSucursal,
  escribir,
  getCotizaciones,
  getPendientes,
  getProcesados,
  getProveedores,
  leer,
  observarRequerimiento,
  r2,
  rechazarRequerimiento,
  uid,
} from "./storage";
import type { EventoHistorial, ItemReq, OpcionProveedor, ProductoProveedor, Proveedor, Requerimiento, Rol } from "./types";

/** Días que una lista sigue juntando REQ del mismo proveedor desde el primer REQ (Williams: "cada 2-3 días"). */
export const DIAS_VENTANA = 3;
/** Los REQ aceptados antes de esta fecha no se pasan a listas (ya se cotizaban uno por uno). */
export const INICIO_LISTAS = "2026-11-27";
/** proveedorId de la lista de productos que ningún proveedor de la base vende. */
export const SIN_PROVEEDOR = "";

export type EstadoLista = "ABIERTA" | "ACEPTADA" | "SOLICITADA" | "COTIZADA" | "RECHAZADA";

export interface LineaLista {
  id: string;
  reqId: string;
  reqNumero: string;
  itemReqId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  marca: string;
  caracteristica?: string;
  productoId?: string;
  sku?: string;
  /** Opción de este proveedor para el producto (1ª, 2ª, 3ª); vacío si se movió a mano a un proveedor que no lo tiene. */
  opcion?: OpcionProveedor;
  /** Tesorería cambió la cantidad: ya no se copia la del REQ. */
  cantidadEditada?: boolean;
  /** Tesorería la quitó de la lista (queda para el historial). */
  rechazada?: boolean;
}

export type MedioEnvio = "WHATSAPP" | "CORREO" | "GMAIL";

export interface EnvioSolicitud {
  proveedorId: string;
  proveedor: string;
  medio: MedioEnvio;
  fecha: string; // ISO
  usuario: string;
}

export interface CotizacionDeLista {
  proveedorId: string;
  proveedor: string;
  ruc: string;
  numero: string;
  fecha: string;
  total: number;
  cotizacionIds: string[];
}

export interface ListaProveedor {
  id: string;
  numero: string; // SC-001-2026
  proveedorId: string; // "" = sin proveedor en la base
  proveedor: string;
  ruc: string;
  /** Hora del primer REQ de la lista y hasta cuándo junta REQ nuevos (inicio + DIAS_VENTANA). */
  inicio: string;
  corte: string;
  estado: EstadoLista;
  lineas: LineaLista[];
  envios: EnvioSolicitud[];
  cotizaciones: CotizacionDeLista[];
  observacion?: string;
  historial: EventoHistorial[];
  sedeId?: string;
}

export const getListas = () => leer<ListaProveedor[]>(KEYS.LISTAS_PROVEEDOR, []);

const ahoraISO = () => new Date().toISOString();
const usuario = () => getSesion()?.nombreCompleto || getSesion()?.nombre || getSesion()?.usuario || "sistema";
const ev = (rol: Rol, accion: string, detalle?: string): EventoHistorial => ({ fecha: ahoraISO(), accion, usuario: rol, ...(detalle ? { detalle: `${detalle} · ${usuario()}` } : { detalle: usuario() }) });
const norm = (s: string) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const singular = (s: string) => s.replace(/(ES|S)$/, "");

// ---------------------------------------------------------------------
// Qué proveedor vende qué
// ---------------------------------------------------------------------

/** ¿Este producto del proveedor cubre el ítem del REQ? Por id del catálogo; si no, por nombre o rubro (PERNOS ⊂ PERNO HEX 1/2). */
export function vende(p: ProductoProveedor, item: Pick<ItemReq, "nombre" | "productoId">): boolean {
  if (p.productoId && item.productoId) return p.productoId === item.productoId;
  const a = norm(p.nombre);
  const b = norm(item.nombre);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 4) return false;
  return b.includes(a) || (singular(a).length >= 4 && b.split(" ").some((w) => singular(w) === singular(a)));
}

export interface Candidato {
  proveedor: Proveedor;
  opcion: OpcionProveedor;
}

/** Proveedores activos que venden el ítem, primera opción arriba. */
export function candidatos(item: Pick<ItemReq, "nombre" | "productoId">, proveedores: Proveedor[]): Candidato[] {
  const out: Candidato[] = [];
  for (const prov of proveedores) {
    if (prov.estado === "INACTIVO") continue;
    const hits = (prov.productos ?? []).filter((x) => vende(x, item));
    if (hits.length) out.push({ proveedor: prov, opcion: Math.min(...hits.map((h) => h.opcion)) as OpcionProveedor });
  }
  return out.sort((a, b) => a.opcion - b.opcion || a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial));
}

/**
 * Proveedor de cada ítem: gana la primera opción; si dos proveedores son la misma opción, el que tiene MÁS
 * productos de estos REQ (para mandar menos listas). `carga` = productos que cada proveedor ya tiene en listas abiertas.
 */
export function asignar(items: Pick<ItemReq, "id" | "nombre" | "productoId">[], proveedores: Proveedor[], carga: Map<string, number> = new Map()): Map<string, Candidato | null> {
  const cands = new Map(items.map((i) => [i.id, candidatos(i, proveedores)]));
  // Puntaje para desempatar: productos donde el proveedor también es la mejor opción, luego los que vende, luego los que ya tiene en listas abiertas
  const cubreMejor = new Map<string, number>();
  const cubre = new Map<string, number>();
  cands.forEach((cs) =>
    cs.forEach((c) => {
      cubre.set(c.proveedor.id, (cubre.get(c.proveedor.id) ?? 0) + 1);
      if (c.opcion === cs[0].opcion) cubreMejor.set(c.proveedor.id, (cubreMejor.get(c.proveedor.id) ?? 0) + 1);
    }),
  );
  const puntaje = (id: string) => (cubreMejor.get(id) ?? 0) * 10000 + (cubre.get(id) ?? 0) * 100 + (carga.get(id) ?? 0);
  const res = new Map<string, Candidato | null>();
  for (const i of items) {
    const cs = cands.get(i.id) ?? [];
    if (!cs.length) {
      res.set(i.id, null);
      continue;
    }
    const mejorOpcion = cs[0].opcion;
    const empatados = cs.filter((c) => c.opcion === mejorOpcion);
    empatados.sort((a, b) => puntaje(b.proveedor.id) - puntaje(a.proveedor.id) || a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial));
    res.set(i.id, empatados[0]);
  }
  return res;
}

// ---------------------------------------------------------------------
// Qué REQ entran a listas
// ---------------------------------------------------------------------

/** Hora en que se emitió el REQ (primer evento del historial; si no, su fecha). */
export const horaReq = (r: Requerimiento): string => r.historial?.[0]?.fecha || `${r.fecha}T12:00:00.000Z`;

const esBien = (r: Requerimiento) => r.tipo !== "SERVICIO" && r.destino !== DESTINO_ALMACEN_AQP;

/** REQ cuyos productos se juntan: pendientes de revisar y aceptados (desde INICIO_LISTAS) que aún no se cotizan. */
export function reqsParaListas(pendientes: Requerimiento[], procesados: Requerimiento[]): Requerimiento[] {
  return [
    ...pendientes.filter((r) => r.estado === "PENDIENTE" && esBien(r)),
    ...procesados.filter((r) => r.estado === "ACEPTADO" && esBien(r) && r.fecha >= INICIO_LISTAS),
  ].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
}

const claveLinea = (reqId: string, itemId: string) => `${reqId}:${itemId}`;
const masDias = (iso: string, dias: number) => new Date(new Date(iso).getTime() + dias * 86400000).toISOString();
/** ¿La lista todavía junta REQ nuevos? */
export const juntando = (l: ListaProveedor, ahora = ahoraISO()) => l.estado === "ABIERTA" && l.corte > ahora;
export const lineasActivas = (l: ListaProveedor) => l.lineas.filter((x) => !x.rechazada);

function siguienteNumero(listas: ListaProveedor[], anio: string): string {
  const pref = enSucursal() ? "SC-SEC-" : "SC-";
  const usados = listas
    .map((l) => l.numero.match(/(\d+)-(\d{4})$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2] === anio)
    .map((m) => Number(m[1]));
  return `${pref}${String((usados.length ? Math.max(...usados) : 0) + 1).padStart(3, "0")}-${anio}`;
}

function nuevaLista(listas: ListaProveedor[], prov: Proveedor | null, inicio: string): ListaProveedor {
  return {
    // id fijo por proveedor + hora del primer REQ: si dos equipos arman la misma lista a la vez, es la misma fila
    id: `lp-${prov?.id || "sin"}-${new Date(inicio).getTime()}`,
    numero: siguienteNumero(listas, inicio.slice(0, 4)),
    proveedorId: prov?.id ?? SIN_PROVEEDOR,
    proveedor: prov?.razonSocial ?? "SIN PROVEEDOR EN LA BASE",
    ruc: prov?.ruc ?? "",
    inicio,
    corte: masDias(inicio, DIAS_VENTANA),
    estado: "ABIERTA",
    lineas: [],
    envios: [],
    cotizaciones: [],
    historial: [{ fecha: ahoraISO(), accion: "Lista creada", usuario: "TESORERIA", detalle: `Junta los REQ de ${DIAS_VENTANA} días para este proveedor` }],
  };
}

const lineaDe = (r: Requerimiento, i: ItemReq, opcion?: OpcionProveedor): LineaLista => ({
  id: uid(),
  reqId: r.id,
  reqNumero: r.numero,
  itemReqId: i.id,
  nombre: i.nombre,
  cantidad: i.cantidad,
  unidad: i.unidad,
  marca: i.marca,
  ...(i.caracteristica ? { caracteristica: i.caracteristica } : {}),
  ...(i.productoId ? { productoId: i.productoId, sku: i.sku } : {}),
  ...(opcion ? { opcion } : {}),
});

/**
 * Arma y actualiza las listas con los REQ vigentes. Devuelve las listas nuevas o null si no cambió nada.
 * - Líneas de listas ABIERTAS: se quitan si su REQ se rechazó, se observó o se le quitó el producto; se copian
 *   nombre y cantidad del REQ (salvo que Tesorería haya cambiado la cantidad).
 * - Productos de REQ que aún no están en ninguna lista: van a la lista abierta de su proveedor cuya ventana
 *   cubre la hora del REQ; si no hay, se crea una nueva.
 * - Las listas aceptadas, enviadas o cotizadas ya no cambian solas.
 */
export function calcularListas(listas: ListaProveedor[], pendientes: Requerimiento[], procesados: Requerimiento[], proveedores: Proveedor[]): ListaProveedor[] | null {
  const porId = new Map<string, Requerimiento>();
  [...procesados, ...pendientes].forEach((r) => porId.set(r.id, r));
  let cambio = false;
  const out: ListaProveedor[] = listas.map((l) => ({ ...l, lineas: [...l.lineas] }));

  // 1. Limpiar / actualizar líneas de las listas abiertas
  for (const l of out) {
    if (l.estado !== "ABIERTA") continue;
    const antes = JSON.stringify(l.lineas);
    l.lineas = l.lineas
      .filter((x) => {
        if (x.rechazada) return true;
        const r = porId.get(x.reqId);
        if (!r || r.estado === "OBSERVADO") return false;
        if (r.estado === "PENDIENTE" && !r.items.some((i) => i.id === x.itemReqId)) return false;
        // Sin proveedor y ya hay uno en la base que lo vende: sale de aquí y se vuelve a asignar (paso 2)
        if (l.proveedorId === SIN_PROVEEDOR && candidatos(x, proveedores).length > 0) return false;
        return true;
      })
      .map((x) => {
        const r = porId.get(x.reqId);
        const i = r?.estado === "PENDIENTE" ? r.items.find((y) => y.id === x.itemReqId) : undefined;
        if (!i) return x;
        return { ...x, reqNumero: r!.numero, nombre: i.nombre, unidad: i.unidad, marca: i.marca, cantidad: x.cantidadEditada ? x.cantidad : i.cantidad, productoId: i.productoId, sku: i.sku };
      });
    if (JSON.stringify(l.lineas) !== antes) cambio = true;
  }

  // 2. Productos que aún no están en ninguna lista
  const enLista = new Set(out.flatMap((l) => l.lineas.map((x) => claveLinea(x.reqId, x.itemReqId))));
  const carga = new Map<string, number>();
  out.filter((l) => l.estado === "ABIERTA").forEach((l) => carga.set(l.proveedorId, (carga.get(l.proveedorId) ?? 0) + lineasActivas(l).length));
  const reqs = reqsParaListas(pendientes, procesados).sort((a, b) => horaReq(a).localeCompare(horaReq(b)));
  for (const r of reqs) {
    const faltan = r.items.filter((i) => i.nombre.trim() && !enLista.has(claveLinea(r.id, i.id)));
    if (!faltan.length) continue;
    const asignados = asignar(faltan, proveedores, carga);
    const t = horaReq(r);
    for (const i of faltan) {
      const c = asignados.get(i.id) ?? null;
      const provId = c?.proveedor.id ?? SIN_PROVEEDOR;
      let lista = out.find((l) => l.estado === "ABIERTA" && l.proveedorId === provId && l.inicio <= t && t < l.corte);
      if (!lista) {
        lista = nuevaLista(out, c?.proveedor ?? null, t);
        out.push(lista);
      }
      lista.lineas.push(lineaDe(r, i, c?.opcion));
      enLista.add(claveLinea(r.id, i.id));
      carga.set(provId, (carga.get(provId) ?? 0) + 1);
      cambio = true;
    }
  }

  // 3. Listas abiertas que se quedaron sin productos (todos sus REQ se observaron o rechazaron): se borran
  const final = out.filter((l) => !(l.estado === "ABIERTA" && l.lineas.length === 0 && l.envios.length === 0));
  if (final.length !== out.length) cambio = true;
  return cambio ? final : null;
}

let ultimoIntento = "";

/**
 * Corre calcularListas con lo que hay en pantalla y guarda solo si algo cambió. Espera a que REQ, proveedores y
 * listas estén descargados (sin la base de proveedores todo caería en "sin proveedor"), y no repite el mismo
 * guardado si la base lo rechazó (p. ej. falta correr el SQL de permisos).
 */
export function sincronizarListas(): boolean {
  const claves = [KEYS.REQS_PENDIENTES, KEYS.REQS_PROCESADOS, KEYS.PROVEEDORES, KEYS.LISTAS_PROVEEDOR] as const;
  if (!claves.every((k) => claveCargada(k))) {
    claves.forEach((k) => void cargarClave(k));
    return false;
  }
  const nuevas = calcularListas(getListas(), getPendientes(), getProcesados(), getProveedores());
  if (!nuevas) return false;
  const firma = JSON.stringify(nuevas.map((l) => [l.id, l.estado, l.lineas.map((x) => [x.reqId, x.itemReqId, x.cantidad, x.rechazada ? 1 : 0])]));
  if (firma === ultimoIntento) return false;
  ultimoIntento = firma;
  escribir(KEYS.LISTAS_PROVEEDOR, nuevas);
  return true;
}

// ---------------------------------------------------------------------
// Aviso al emitir un REQ (Almacén): "se unificará con…"
// ---------------------------------------------------------------------

export interface AvisoUnificacion {
  proveedor: string;
  productos: string[];
  /** Otros REQ de los últimos días con productos del mismo proveedor. */
  conReqs: string[];
}

/** Qué pasará con el REQ recién emitido: con qué REQ y proveedor se juntará. */
export function avisoUnificacion(req: Requerimiento): { avisos: AvisoUnificacion[]; sinProveedor: string[] } {
  if (!esBien(req)) return { avisos: [], sinProveedor: [] };
  const proveedores = getProveedores();
  const desde = new Date(Date.now() - DIAS_VENTANA * 86400000).toISOString();
  const otros = reqsParaListas(getPendientes(), getProcesados()).filter((r) => r.id !== req.id && horaReq(r) >= desde);
  const mios = asignar(req.items, proveedores);
  const porProv = new Map<string, AvisoUnificacion>();
  const sinProveedor: string[] = [];
  for (const i of req.items) {
    const c = mios.get(i.id);
    if (!c) {
      sinProveedor.push(i.nombre);
      continue;
    }
    const a = porProv.get(c.proveedor.id) ?? { proveedor: c.proveedor.razonSocial, productos: [], conReqs: [] };
    a.productos.push(i.nombre);
    porProv.set(c.proveedor.id, a);
  }
  for (const r of otros) {
    const suyos = asignar(r.items, proveedores);
    suyos.forEach((c) => {
      const a = c && porProv.get(c.proveedor.id);
      if (a && !a.conReqs.includes(r.numero)) a.conReqs.push(r.numero);
    });
  }
  return { avisos: [...porProv.values()], sinProveedor };
}

/** Texto corto del aviso para el toast de Almacén. */
export function textoAviso(req: Requerimiento): string | null {
  const { avisos, sinProveedor } = avisoUnificacion(req);
  const unidos = avisos.filter((a) => a.conReqs.length);
  const partes: string[] = [];
  if (unidos.length)
    partes.push(
      `${req.numero} se unificará con ${unidos.map((a) => `${a.conReqs.join(", ")} en la lista de ${a.proveedor}`).join("; ")}. Tesorería recibirá una sola lista por proveedor.`,
    );
  else if (avisos.length) partes.push(`${req.numero} irá en la lista de ${avisos.map((a) => a.proveedor).join(", ")}.`);
  if (sinProveedor.length) partes.push(`${sinProveedor.length} producto(s) sin proveedor en la base: Tesorería lo asignará.`);
  return partes.length ? partes.join(" ") : null;
}

// ---------------------------------------------------------------------
// Acciones de Tesorería
// ---------------------------------------------------------------------

function actualizar(id: string, fn: (l: ListaProveedor) => ListaProveedor): ListaProveedor {
  const listas = getListas();
  const l = listas.find((x) => x.id === id);
  if (!l) throw new ErpError("La lista ya no existe.");
  const nueva = fn({ ...l, lineas: [...l.lineas] });
  escribir(KEYS.LISTAS_PROVEEDOR, listas.map((x) => (x.id === id ? nueva : x)));
  return nueva;
}

const reqsDeLista = (l: ListaProveedor) => [...new Set(lineasActivas(l).map((x) => x.reqId))];

/** Deja de juntar REQ nuevos (los siguientes abren otra lista). */
export function cerrarLista(id: string, rol: Rol): void {
  actualizar(id, (l) => {
    if (l.estado !== "ABIERTA") throw new ErpError("La lista ya fue revisada.");
    return { ...l, corte: ahoraISO(), historial: [...l.historial, ev(rol, "Cerrada a mano: ya no junta REQ nuevos")] };
  });
}

/** Acepta la lista: sus REQ pendientes pasan a ACEPTADO y la lista deja de cambiar sola. */
export function aceptarLista(id: string, rol: Rol): void {
  const l = getListas().find((x) => x.id === id);
  if (!l) throw new ErpError("La lista ya no existe.");
  if (l.estado !== "ABIERTA") throw new ErpError("La lista ya fue aceptada.");
  if (!l.proveedorId) throw new ErpError("Asigne primero un proveedor a cada producto (botón Editar › Mover).");
  if (!lineasActivas(l).length) throw new ErpError("La lista no tiene productos.");
  const pend = new Set(getPendientes().map((r) => r.id));
  const ids = reqsDeLista(l).filter((r) => pend.has(r));
  if (ids.length) aceptarMultiple(ids, rol);
  actualizar(id, (x) => ({ ...x, estado: "ACEPTADA", corte: x.corte < ahoraISO() ? x.corte : ahoraISO(), historial: [...x.historial, ev(rol, "Lista aceptada por Tesorería", ids.length ? `REQ aceptados: ${ids.length}` : undefined)] }));
}

/** Observa los REQ de la lista (vuelven a Almacén para corregir; al reenviarlos se vuelven a juntar). */
export function observarLista(id: string, motivo: string, rol: Rol): number {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la observación.");
  const l = getListas().find((x) => x.id === id);
  if (!l) throw new ErpError("La lista ya no existe.");
  if (l.estado !== "ABIERTA") throw new ErpError("Solo se observan listas por revisar.");
  const pend = new Set(getPendientes().map((r) => r.id));
  const ids = reqsDeLista(l).filter((r) => pend.has(r));
  if (!ids.length) throw new ErpError("Los REQ de esta lista ya fueron aceptados: edite o quite productos en su lugar.");
  ids.forEach((r) => observarRequerimiento(r, `${motivo.trim()} (lista ${l.numero})`, rol));
  actualizar(id, (x) => ({ ...x, observacion: motivo.trim(), historial: [...x.historial, ev(rol, "Observada: sus REQ vuelven a Almacén", motivo.trim())] }));
  sincronizarListas();
  return ids.length;
}

/**
 * Rechaza la lista: sus productos quedan rechazados. Un REQ cuyos productos están TODOS rechazados se elimina
 * (igual que Rechazar en NUEVOS REQ); si tiene productos en otras listas, sigue con esos.
 */
export function rechazarLista(id: string, motivo: string, rol: Rol): string[] {
  if (!motivo.trim()) throw new ErpError("Indique el motivo del rechazo.");
  const l = actualizar(id, (x) => {
    if (x.estado === "COTIZADA") throw new ErpError("La lista ya tiene cotizaciones: no se puede rechazar.");
    return { ...x, estado: "RECHAZADA", observacion: motivo.trim(), lineas: x.lineas.map((y) => ({ ...y, rechazada: true })), historial: [...x.historial, ev(rol, "Lista rechazada", motivo.trim())] };
  });
  return eliminarReqsRechazados(reqsDeLista({ ...l, lineas: l.lineas.map((y) => ({ ...y, rechazada: false })) }));
}

function eliminarReqsRechazados(reqIds: string[]): string[] {
  const listas = getListas();
  const eliminados: string[] = [];
  for (const reqId of reqIds) {
    const r = [...getPendientes(), ...getProcesados()].find((x) => x.id === reqId);
    if (!r || (r.estado !== "PENDIENTE" && r.estado !== "ACEPTADO")) continue;
    const lineas = listas.flatMap((l) => l.lineas.filter((x) => x.reqId === reqId));
    const todas = r.items.every((i) => lineas.some((x) => x.itemReqId === i.id && x.rechazada));
    if (todas) {
      rechazarRequerimiento(reqId);
      eliminados.push(r.numero);
    }
  }
  return eliminados;
}

/** Tesorería cambia la cantidad de un producto de la lista. */
export function cambiarCantidad(id: string, lineaId: string, cantidad: number, rol: Rol): void {
  if (!(cantidad > 0)) throw new ErpError("La cantidad debe ser mayor a 0.");
  actualizar(id, (l) => {
    if (l.estado === "COTIZADA" || l.estado === "RECHAZADA") throw new ErpError("La lista ya no se puede editar.");
    const x = l.lineas.find((y) => y.id === lineaId);
    if (!x) throw new ErpError("Producto no encontrado.");
    return {
      ...l,
      lineas: l.lineas.map((y) => (y.id === lineaId ? { ...y, cantidad: r2(cantidad), cantidadEditada: true } : y)),
      historial: [...l.historial, ev(rol, "Cantidad editada", `${x.nombre}: ${x.cantidad} → ${r2(cantidad)} ${x.unidad}`)],
    };
  });
}

/** Quita un producto de la lista (queda rechazado). Si su REQ se queda sin productos, el REQ se elimina. */
export function quitarLinea(id: string, lineaId: string, rol: Rol): string[] {
  let reqId = "";
  actualizar(id, (l) => {
    if (l.estado === "COTIZADA" || l.estado === "RECHAZADA") throw new ErpError("La lista ya no se puede editar.");
    const x = l.lineas.find((y) => y.id === lineaId);
    if (!x) throw new ErpError("Producto no encontrado.");
    reqId = x.reqId;
    return { ...l, lineas: l.lineas.map((y) => (y.id === lineaId ? { ...y, rechazada: true } : y)), historial: [...l.historial, ev(rol, "Producto quitado", `${x.nombre} (${x.reqNumero})`)] };
  });
  return eliminarReqsRechazados([reqId]);
}

/** Pasa un producto a otro proveedor: va a la lista abierta de ese proveedor (o a una nueva). */
export function moverLinea(id: string, lineaId: string, proveedorId: string, rol: Rol): ListaProveedor {
  const prov = getProveedores().find((p) => p.id === proveedorId);
  if (!prov) throw new ErpError("Elija un proveedor de la base.");
  const listas = getListas();
  const origen = listas.find((l) => l.id === id);
  if (!origen) throw new ErpError("La lista ya no existe.");
  if (origen.estado === "COTIZADA" || origen.estado === "RECHAZADA") throw new ErpError("La lista ya no se puede editar.");
  if (origen.proveedorId === proveedorId) throw new ErpError("El producto ya está en la lista de ese proveedor.");
  const linea = origen.lineas.find((y) => y.id === lineaId);
  if (!linea || linea.rechazada) throw new ErpError("Producto no encontrado.");
  const opcion = (prov.productos ?? []).filter((x) => vende(x, linea)).map((x) => x.opcion).sort()[0];
  const ahora = ahoraISO();
  let destino = listas.find((l) => l.id !== id && l.proveedorId === proveedorId && juntando(l, ahora));
  const nueva = !destino;
  if (!destino) destino = nuevaLista(listas, prov, ahora);
  destino = {
    ...destino,
    lineas: [...destino.lineas, { ...linea, id: uid(), opcion }],
    historial: [...destino.historial, ev(rol, "Producto recibido de otra lista", `${linea.nombre} (${linea.reqNumero}) desde ${origen.numero}`)],
  };
  const origenNuevo: ListaProveedor = {
    ...origen,
    lineas: origen.lineas.filter((y) => y.id !== lineaId),
    historial: [...origen.historial, ev(rol, "Producto movido a otro proveedor", `${linea.nombre} → ${prov.razonSocial} (${destino.numero})`)],
  };
  const resto = listas.map((l) => (l.id === id ? origenNuevo : l.id === destino!.id ? destino! : l));
  escribir(KEYS.LISTAS_PROVEEDOR, nueva ? [...resto, destino] : resto);
  return destino;
}

// ---------------------------------------------------------------------
// Solicitud de cotización por WhatsApp / correo
// ---------------------------------------------------------------------

/** Celular para wa.me: 9 dígitos que empiezan en 9 → 51 + número; si ya trae 51, tal cual; si no, "". */
export function celularWhatsApp(contacto?: string): string {
  const d = (contacto ?? "").replace(/\D/g, "");
  const m = d.match(/^(?:0051|51)?(9\d{8})$/);
  if (m) return `51${m[1]}`;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

/** Proveedores a los que se puede pedir cotización: el de la lista y los demás que venden alguno de sus productos. */
export function proveedoresParaSolicitar(l: ListaProveedor, proveedores: Proveedor[]): { proveedor: Proveedor; cubre: number; principal: boolean }[] {
  const lineas = productosConsolidados(l).map((g) => g.lineas[0]);
  return proveedores
    .filter((p) => p.estado !== "INACTIVO")
    .map((p) => ({ proveedor: p, cubre: lineas.filter((x) => (p.productos ?? []).some((y) => vende(y, x))).length, principal: p.id === l.proveedorId }))
    .filter((x) => x.principal || x.cubre > 0)
    .sort((a, b) => Number(b.principal) - Number(a.principal) || b.cubre - a.cubre || a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial));
}

export interface ProductoConsolidado {
  clave: string;
  nombre: string;
  unidad: string;
  marca: string;
  sku?: string;
  cantidad: number;
  reqs: string[];
  lineas: LineaLista[];
}

/** El mismo producto pedido en varios REQ va en UNA línea con la cantidad sumada (para el proveedor). */
export function productosConsolidados(l: ListaProveedor): ProductoConsolidado[] {
  const m = new Map<string, ProductoConsolidado>();
  for (const x of lineasActivas(l)) {
    const clave = `${x.productoId || norm(x.nombre)}|${norm(x.unidad)}|${norm(x.marca)}`;
    const g = m.get(clave) ?? { clave, nombre: x.nombre, unidad: x.unidad, marca: x.marca, sku: x.sku, cantidad: 0, reqs: [], lineas: [] };
    g.cantidad = r2(g.cantidad + x.cantidad);
    if (!g.reqs.includes(x.reqNumero)) g.reqs.push(x.reqNumero);
    g.lineas.push(x);
    m.set(clave, g);
  }
  return [...m.values()];
}

/** Mensaje de la solicitud de cotización (WhatsApp y correo). */
export function mensajeSolicitud(l: ListaProveedor, prov?: Proveedor): string {
  const saludo = prov?.asesorVentas ? `Buen día, ${prov.asesorVentas}.` : "Buen día.";
  const lineas = productosConsolidados(l).map((x, k) => {
    const carac = [...new Set(x.lineas.map((y) => y.caracteristica).filter(Boolean))].join("; ");
    return `${k + 1}. ${x.nombre} — ${x.cantidad} ${x.unidad}${x.marca ? ` (marca ${x.marca})` : ""}${carac ? ` · ${carac}` : ""}`;
  });
  return [
    saludo,
    `De parte de ${EMPRESA.razonSocial} (COMBOY VID), RUC ${EMPRESA.ruc}, le solicitamos cotización de los siguientes productos:`,
    "",
    ...lineas,
    "",
    "Por favor indique precio unitario con IGV, marca, plazo de entrega, forma de pago y validez de la oferta.",
    `Referencia: solicitud ${l.numero}.`,
    "",
    "Gracias.",
    `${usuario()} · ${EMPRESA.razonSocial}`,
    EMPRESA.telefono,
  ].join("\n");
}

export const asuntoSolicitud = (l: ListaProveedor) => `Solicitud de cotización ${l.numero} · ${EMPRESA.razonSocial}`;

export function enlaceEnvio(medio: MedioEnvio, prov: Proveedor, texto: string, asunto: string): string {
  if (medio === "WHATSAPP") {
    const cel = celularWhatsApp(prov.contacto);
    return `https://wa.me/${cel}?text=${encodeURIComponent(texto)}`;
  }
  if (medio === "GMAIL")
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(prov.correo ?? "")}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
  return `mailto:${encodeURIComponent(prov.correo ?? "")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
}

/** Anota que se pidió cotización a un proveedor (y acepta la lista si aún no lo estaba). */
export function registrarEnvio(id: string, prov: Proveedor, medio: MedioEnvio, rol: Rol): void {
  const l = getListas().find((x) => x.id === id);
  if (!l) throw new ErpError("La lista ya no existe.");
  if (l.estado === "RECHAZADA") throw new ErpError("La lista fue rechazada.");
  if (l.estado === "ABIERTA") aceptarLista(id, rol);
  actualizar(id, (x) => ({
    ...x,
    estado: x.estado === "COTIZADA" ? "COTIZADA" : "SOLICITADA",
    envios: [...x.envios, { proveedorId: prov.id, proveedor: prov.razonSocial, medio, fecha: ahoraISO(), usuario: usuario() }],
    historial: [...x.historial, ev(rol, "Cotización solicitada", `${prov.razonSocial} por ${medio === "WHATSAPP" ? "WhatsApp" : medio === "GMAIL" ? "Gmail" : "correo"}`)],
  }));
}

// ---------------------------------------------------------------------
// Registrar la cotización recibida: solo N°, fecha y precios
// ---------------------------------------------------------------------

/**
 * Guarda la cotización del proveedor: una Cotización por cada REQ de la lista con los productos que cotizó
 * (precio > 0, con IGV). El proveedor, RUC y asesor salen de la base de proveedores.
 */
export function registrarCotizacionLista(
  id: string,
  proveedorId: string,
  datos: { numero: string; fecha: string; precios: Record<string, number> },
  rol: Rol,
): CotizacionDeLista {
  const l = getListas().find((x) => x.id === id);
  if (!l) throw new ErpError("La lista ya no existe.");
  if (l.estado === "RECHAZADA") throw new ErpError("La lista fue rechazada.");
  const prov = getProveedores().find((p) => p.id === proveedorId);
  if (!prov) throw new ErpError("Elija el proveedor que cotizó.");
  if ((prov.tipoDoc ?? "RUC") !== "RUC") throw new ErpError(`${prov.razonSocial} no tiene RUC en la base: complete su ficha en Logística › Base de proveedores.`);
  const numero = datos.numero.trim();
  if (!numero) throw new ErpError("Ingrese el N° de la cotización del proveedor.");
  if (!datos.fecha) throw new ErpError("Ingrese la fecha de la cotización.");
  if (l.cotizaciones.some((c) => c.proveedorId === proveedorId && c.numero === numero)) throw new ErpError("Esa cotización ya está registrada en la lista.");
  const cotizadas = lineasActivas(l).filter((x) => (datos.precios[x.id] ?? 0) > 0);
  if (!cotizadas.length) throw new ErpError("Escriba el precio de al menos un producto (deje en blanco los que no cotizó).");
  if (l.estado === "ABIERTA") aceptarLista(id, rol);

  const ids: string[] = [];
  let total = 0;
  const porReq = new Map<string, LineaLista[]>();
  cotizadas.forEach((x) => porReq.set(x.reqId, [...(porReq.get(x.reqId) ?? []), x]));
  porReq.forEach((lineas, reqId) => {
    const c = crearCotizacion(
      {
        reqId,
        numero,
        fechaEmision: datos.fecha,
        proveedor: prov.razonSocial,
        ruc: prov.ruc,
        listaId: l.id,
        listaNumero: l.numero,
        proveedorId: prov.id,
        ...(prov.asesorVentas ? { asesorVentas: prov.asesorVentas } : {}),
        items: lineas.map((x) => {
          const precioUnit = r2(datos.precios[x.id]);
          return { itemReqId: x.itemReqId, nombre: x.nombre, cantidad: x.cantidad, unidad: x.unidad, marca: x.marca, precioUnit, subtotal: r2(precioUnit * x.cantidad), ...(x.productoId ? { productoId: x.productoId, sku: x.sku } : {}) };
        }),
      },
      rol,
    );
    ids.push(c.id);
    total = r2(total + c.total);
  });
  const reg: CotizacionDeLista = { proveedorId: prov.id, proveedor: prov.razonSocial, ruc: prov.ruc, numero, fecha: datos.fecha, total, cotizacionIds: ids };
  actualizar(id, (x) => ({
    ...x,
    estado: "COTIZADA",
    cotizaciones: [...x.cotizaciones, reg],
    historial: [...x.historial, ev(rol, "Cotización registrada", `${prov.razonSocial} · N° ${numero} · ${cotizadas.length} producto(s) · ${porReq.size} REQ`)],
  }));
  return reg;
}

/** Cotizaciones (por REQ) que salieron de esta lista. */
export const cotizacionesDeLista = (l: ListaProveedor) => getCotizaciones().filter((c) => c.listaId === l.id);
