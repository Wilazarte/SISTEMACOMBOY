// =====================================================================
// Solicitar cotización de un REQ aceptado por WhatsApp · Williams 2026-11-27
//
// Desde Tesorería › NUEVOS REQ › Aceptados · por cotizar: botón "Solicitar cotización" que abre un formulario
// de confirmación (proveedor, asesor de ventas, WhatsApp, productos y mensaje) y luego abre WhatsApp con la
// lista de productos lista para enviar al asesor. Queda anotado en el REQ (solicitudesCotizacion + historial).
// Reutiliza el armado de mensajes y el celular wa.me de las listas por proveedor (lib/listasProveedor.ts).
// =====================================================================

import { EMPRESA } from "./empresa";
import { getSesion } from "./auth";
import { ErpError, KEYS, escribir, getProcesados, getProveedores } from "./storage";
import { celularWhatsApp, vende } from "./listasProveedor";
import { sugerirProveedor, type ResumenProducto } from "./analisisPrecios";
import type { ItemReq, Proveedor, Requerimiento, Rol, SolicitudCotizacionReq } from "./types";

const usuario = () => getSesion()?.nombreCompleto || getSesion()?.nombre || getSesion()?.usuario || "sistema";

export interface OpcionSolicitud {
  proveedor: Proveedor;
  /** Productos del REQ que tiene en su ficha. */
  cubre: number;
  /** Productos del REQ en los que dio el precio más bajo. */
  masBarato: number;
}

/**
 * Proveedores a los que se puede pedir cotización de este REQ: los que venden alguno de sus productos (ficha en
 * la base) o los que dieron el precio más bajo. Primero el que más cubre / más barato; los demás activos después.
 */
export function proveedoresParaReq(req: Requerimiento, proveedores: Proveedor[], resumen: ResumenProducto[]): { sugeridos: OpcionSolicitud[]; otros: Proveedor[] } {
  const activos = proveedores.filter((p) => p.estado !== "INACTIVO");
  const sugeridos: OpcionSolicitud[] = activos
    .map((p) => ({
      proveedor: p,
      cubre: req.items.filter((i) => (p.productos ?? []).some((x) => vende(x, i))).length,
      masBarato: req.items.filter((i) => sugerirProveedor(resumen, i)?.proveedorId === p.id).length,
    }))
    .filter((o) => o.cubre > 0 || o.masBarato > 0)
    .sort((a, b) => b.cubre + b.masBarato - (a.cubre + a.masBarato) || b.masBarato - a.masBarato || a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial));
  const ya = new Set(sugeridos.map((o) => o.proveedor.id));
  const otros = activos.filter((p) => !ya.has(p.id)).sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
  return { sugeridos, otros };
}

/** Productos del REQ que vende este proveedor (si no tiene ninguno en su ficha, todos). */
export function itemsDelProveedor(req: Requerimiento, prov: Proveedor | undefined, resumen: ResumenProducto[]): string[] {
  if (!prov) return req.items.map((i) => i.id);
  const suyos = req.items.filter((i) => (prov.productos ?? []).some((x) => vende(x, i)) || sugerirProveedor(resumen, i)?.proveedorId === prov.id);
  return (suyos.length ? suyos : req.items).map((i) => i.id);
}

/** Mensaje de WhatsApp con la lista de productos. */
export function mensajeSolicitudReq(req: Requerimiento, items: Pick<ItemReq, "nombre" | "cantidad" | "unidad" | "marca" | "caracteristica">[], asesor?: string): string {
  const lineas = items.map((x, k) => `${k + 1}. ${x.nombre} — ${x.cantidad} ${x.unidad}${x.marca ? ` (marca ${x.marca})` : ""}${x.caracteristica ? ` · ${x.caracteristica}` : ""}`);
  return [
    asesor?.trim() ? `Buen día, ${asesor.trim()}.` : "Buen día.",
    `De parte de ${EMPRESA.razonSocial} (COMBOY VID), RUC ${EMPRESA.ruc}, le solicitamos cotización de los siguientes productos:`,
    "",
    ...lineas,
    "",
    "Por favor indique precio unitario con IGV, marca, plazo de entrega, forma de pago y validez de la oferta.",
    `Referencia: ${req.numero}.`,
    "",
    "Gracias.",
    `${usuario()} · ${EMPRESA.razonSocial}`,
    EMPRESA.telefono,
  ].join("\n");
}

export const enlaceWhatsApp = (celular: string, texto: string) => `https://wa.me/${celularWhatsApp(celular)}?text=${encodeURIComponent(texto)}`;

/** Anota en el REQ que se pidió cotización (sin cambiar su estado: sigue ACEPTADO, por cotizar). */
export function registrarSolicitudReq(reqId: string, prov: Proveedor, asesor: string, celular: string, productos: string[], rol: Rol): void {
  const lista = getProcesados();
  const req = lista.find((r) => r.id === reqId);
  if (!req) throw new ErpError("El requerimiento ya no está en Aceptados.");
  const sol: SolicitudCotizacionReq = { proveedorId: prov.id, proveedor: prov.razonSocial, asesor: asesor.trim() || undefined, celular: celularWhatsApp(celular), productos, fecha: new Date().toISOString(), usuario: usuario() };
  const nuevo: Requerimiento = {
    ...req,
    solicitudesCotizacion: [...(req.solicitudesCotizacion ?? []), sol],
    historial: [...req.historial, { fecha: sol.fecha, accion: "Cotización solicitada por WhatsApp", usuario: rol, detalle: `${prov.razonSocial}${sol.asesor ? ` (${sol.asesor})` : ""} · ${productos.length} producto(s) · ${sol.usuario}` }],
  };
  escribir(KEYS.REQS_PROCESADOS, lista.map((r) => (r.id === reqId ? nuevo : r)));
}

/** Guarda en la ficha del proveedor el celular y el asesor escritos en el formulario (solo esos dos campos). */
export function actualizarContactoProveedor(id: string, asesor: string, celular: string): void {
  const lista = getProveedores();
  if (!lista.some((p) => p.id === id)) throw new ErpError("El proveedor ya no está en la base.");
  escribir(
    KEYS.PROVEEDORES,
    lista.map((p) => (p.id === id ? { ...p, asesorVentas: asesor.trim().toUpperCase() || p.asesorVentas, contacto: celular.trim() || p.contacto } : p)),
  );
}
