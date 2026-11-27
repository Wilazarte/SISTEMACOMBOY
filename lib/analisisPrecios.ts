// =====================================================================
// Análisis de precios por producto y proveedor · Williams 2026-11-27
//
// Lee lo que ya se compró (compras con ingreso a stock, Órdenes de Compra) y lo que se cotizó (cotizaciones)
// para: 1) ver qué proveedor da el precio más bajo de cada producto, 2) sugerir a quién comprar y
// 3) llenar la ficha de cada proveedor (Base de proveedores) con los productos que ya nos vendió.
//
// Todos los precios se comparan CON IGV: los documentos antiguos sin `preciosConIgv` traen valores sin IGV
// (salvo las boletas, que siempre fueron con IGV) y se multiplican por 1.18.
// =====================================================================

import { buscarProducto } from "./productos";
import { IGV, KEYS, escribir, getProveedores, r2 } from "./storage";
import type { Compra, Cotizacion, OpcionProveedor, OrdenCompra, ProductoProveedor, Proveedor } from "./types";

export type OrigenPrecio = "COMPRA" | "OC" | "COTIZACION";

export interface PrecioObservado {
  clave: string;
  nombre: string;
  productoId?: string;
  sku?: string;
  unidad: string;
  proveedor: string;
  ruc: string;
  proveedorId?: string;
  /** Precio unitario CON IGV. */
  precio: number;
  cantidad: number;
  fecha: string;
  origen: OrigenPrecio;
  documento: string;
}

const norm = (s: string) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const conIgv = (precio: number, yaConIgv: boolean) => r2(yaConIgv ? precio : precio * (1 + IGV));

/** Clave del producto: id del catálogo si se reconoce el nombre; si no, el nombre normalizado + unidad. */
function claveProducto(nombre: string, unidad: string, productoId?: string): { clave: string; nombre: string; productoId?: string; sku?: string } {
  if (productoId) {
    const cat = buscarProducto(nombre);
    return { clave: `id:${productoId}`, nombre: cat?.nombre_normalizado ?? norm(nombre), productoId, sku: cat?.sku };
  }
  const cat = buscarProducto(nombre);
  if (cat) return { clave: `id:${cat.id}`, nombre: cat.nombre_normalizado, productoId: cat.id, sku: cat.sku };
  return { clave: `n:${norm(nombre)}|${norm(unidad)}`, nombre: norm(nombre) };
}

/** Todos los precios que se pagaron o cotizaron, con el proveedor de la base cuando se reconoce el RUC. */
export function preciosObservados(compras: Compra[], ordenes: OrdenCompra[], cotizaciones: Cotizacion[], proveedores: Proveedor[]): PrecioObservado[] {
  const porRuc = new Map(proveedores.map((p) => [p.ruc, p]));
  const porId = new Map(proveedores.map((p) => [p.id, p]));
  const out: PrecioObservado[] = [];
  const agregar = (o: Omit<PrecioObservado, "clave" | "nombre" | "productoId" | "sku" | "proveedorId"> & { nombre: string; productoId?: string; proveedorId?: string }) => {
    if (!(o.precio > 0) || !o.nombre.trim()) return;
    const k = claveProducto(o.nombre, o.unidad, o.productoId);
    const prov = (o.proveedorId && porId.get(o.proveedorId)) || porRuc.get(o.ruc);
    out.push({ ...o, ...k, unidad: norm(o.unidad), proveedorId: prov?.id, proveedor: prov?.razonSocial ?? norm(o.proveedor) });
  };
  for (const c of compras) {
    // Boletas: siempre con IGV; facturas y demás antiguas: sin IGV
    const yaCon = !!c.preciosConIgv || c.tipoComprobante === "BOLETA";
    for (const i of c.items ?? [])
      agregar({ nombre: i.nombre, unidad: i.unidad, proveedor: c.proveedor, ruc: c.ruc, proveedorId: c.proveedorId, precio: conIgv(i.precioUnit, yaCon), cantidad: i.cantidad, fecha: c.fecha, origen: "COMPRA", documento: c.numero });
  }
  for (const o of ordenes) {
    if (o.compraId) continue; // la OC de una compra con stock repite la compra
    for (const i of o.items ?? [])
      agregar({ nombre: i.nombre, unidad: i.unidad, productoId: i.productoId, proveedor: o.proveedor, ruc: o.ruc, precio: conIgv(i.precioUnit, !!o.preciosConIgv), cantidad: i.cantidad, fecha: o.fecha, origen: "OC", documento: o.numero });
  }
  for (const c of cotizaciones) {
    for (const i of c.items ?? [])
      agregar({ nombre: i.nombre, unidad: i.unidad, productoId: i.productoId, proveedor: c.proveedor, ruc: c.ruc, proveedorId: c.proveedorId, precio: conIgv(i.precioUnit, !!c.preciosConIgv), cantidad: i.cantidad, fecha: c.fechaEmision, origen: "COTIZACION", documento: c.numero });
  }
  return out;
}

export interface PrecioProveedor {
  proveedor: string;
  ruc: string;
  proveedorId?: string;
  /** Último precio (compra u OC; si nunca se le compró, el de su última cotización). */
  ultimo: number;
  fechaUltimo: string;
  origenUltimo: OrigenPrecio;
  minimo: number;
  promedio: number;
  /** Veces que se le compró (compras + OC). */
  compras: number;
  cotizaciones: number;
}

export interface ResumenProducto {
  clave: string;
  nombre: string;
  sku?: string;
  unidad: string;
  proveedores: PrecioProveedor[]; // el más barato primero
  /** Cuánto más caro es el segundo frente al más barato (%), o null con un solo proveedor. */
  ahorroPct: number | null;
  historial: PrecioObservado[];
}

/** Resumen por producto: precio de cada proveedor, el más barato arriba. */
export function resumenPrecios(obs: PrecioObservado[]): ResumenProducto[] {
  const porProd = new Map<string, PrecioObservado[]>();
  obs.forEach((o) => porProd.set(o.clave, [...(porProd.get(o.clave) ?? []), o]));
  const out: ResumenProducto[] = [];
  porProd.forEach((lista, clave) => {
    const porProv = new Map<string, PrecioObservado[]>();
    lista.forEach((o) => {
      const k = o.proveedorId || o.ruc || o.proveedor;
      porProv.set(k, [...(porProv.get(k) ?? []), o]);
    });
    const proveedores: PrecioProveedor[] = [...porProv.values()].map((ps) => {
      const comprados = ps.filter((p) => p.origen !== "COTIZACION");
      const base = (comprados.length ? comprados : ps).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      const u = base[0];
      return {
        proveedor: u.proveedor,
        ruc: u.ruc,
        proveedorId: u.proveedorId,
        ultimo: u.precio,
        fechaUltimo: u.fecha,
        origenUltimo: u.origen,
        minimo: Math.min(...ps.map((p) => p.precio)),
        promedio: r2(ps.reduce((a, p) => a + p.precio, 0) / ps.length),
        compras: comprados.length,
        cotizaciones: ps.length - comprados.length,
      };
    });
    proveedores.sort((a, b) => a.ultimo - b.ultimo || b.compras - a.compras);
    const ahorroPct = proveedores.length > 1 && proveedores[0].ultimo > 0 ? r2(((proveedores[1].ultimo - proveedores[0].ultimo) / proveedores[0].ultimo) * 100) : null;
    const u = lista[0];
    out.push({ clave, nombre: u.nombre, sku: u.sku, unidad: u.unidad, proveedores, ahorroPct, historial: lista.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)) });
  });
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Resumen de un producto (por id del catálogo o nombre). */
export function resumenDe(resumen: ResumenProducto[], item: { nombre: string; unidad?: string; productoId?: string }): ResumenProducto | undefined {
  const k = claveProducto(item.nombre, item.unidad ?? "", item.productoId).clave;
  return resumen.find((r) => r.clave === k) ?? resumen.find((r) => r.nombre === norm(item.nombre));
}

export interface Sugerencia {
  proveedor: string;
  proveedorId?: string;
  precio: number;
  motivo: string;
}

/**
 * Proveedor sugerido para un producto: el que dio el precio más bajo la última vez (compra u OC; si no hay,
 * cotización). Con el mismo precio, el que más veces nos vendió. Sin historial: null.
 */
export function sugerirProveedor(resumen: ResumenProducto[], item: { nombre: string; unidad?: string; productoId?: string }): Sugerencia | null {
  const r = resumenDe(resumen, item);
  const p = r?.proveedores[0];
  if (!r || !p) return null;
  const otros = r.proveedores.length - 1;
  const fecha = p.fechaUltimo.split("-").reverse().join("/");
  const motivo = `${p.origenUltimo === "COTIZACION" ? "Cotizó" : "Le compramos a"} S/ ${p.ultimo.toFixed(2)} el ${fecha}${otros ? ` · el más barato de ${r.proveedores.length}${r.ahorroPct !== null ? ` (ahorro ${r.ahorroPct}% vs. el siguiente)` : ""}` : " · único proveedor con precio"}`;
  return { proveedor: p.proveedor, proveedorId: p.proveedorId, precio: p.ultimo, motivo };
}

// ---------------------------------------------------------------------
// Llenar la Base de proveedores con lo que ya se compró
// ---------------------------------------------------------------------

export interface LlenadoProveedor {
  proveedor: Proveedor;
  nuevos: ProductoProveedor[];
}

/**
 * Productos que cada proveedor de la base ya nos vendió y todavía no están en su ficha. La opción se pone
 * por precio: el más barato de ese producto = 1ª opción, el segundo = 2ª, el resto = 3ª.
 * Los productos que ya tiene la ficha no se tocan.
 */
export function llenadoDesdeCompras(resumen: ResumenProducto[], proveedores: Proveedor[], incluirCotizados = false): LlenadoProveedor[] {
  const porProv = new Map<string, ProductoProveedor[]>();
  for (const r of resumen) {
    const validos = r.proveedores.filter((p) => p.proveedorId && (incluirCotizados || p.compras > 0));
    validos.forEach((p, k) => {
      const opcion = (Math.min(k + 1, 3) as OpcionProveedor);
      const cat = r.clave.startsWith("id:") ? { productoId: r.clave.slice(3), sku: r.sku } : {};
      porProv.set(p.proveedorId!, [...(porProv.get(p.proveedorId!) ?? []), { nombre: r.nombre, opcion, ...cat }]);
    });
  }
  const out: LlenadoProveedor[] = [];
  for (const prov of proveedores) {
    const cand = porProv.get(prov.id) ?? [];
    const ya = new Set((prov.productos ?? []).flatMap((x) => [norm(x.nombre), x.productoId ? `id:${x.productoId}` : ""]).filter(Boolean));
    const nuevos = cand.filter((x) => !ya.has(norm(x.nombre)) && !(x.productoId && ya.has(`id:${x.productoId}`)));
    if (nuevos.length) out.push({ proveedor: prov, nuevos });
  }
  return out.sort((a, b) => b.nuevos.length - a.nuevos.length);
}

/** Guarda los productos nuevos en las fichas (sin volver a validar RUC: solo se agregan productos). Devuelve cuántos. */
export function aplicarLlenado(llenado: LlenadoProveedor[]): number {
  const cambios = new Map(llenado.map((l) => [l.proveedor.id, l.nuevos]));
  let n = 0;
  const lista = getProveedores().map((p) => {
    const nuevos = cambios.get(p.id);
    if (!nuevos?.length) return p;
    const ya = new Set((p.productos ?? []).map((x) => norm(x.nombre)));
    const agregar = nuevos.filter((x) => !ya.has(norm(x.nombre)));
    n += agregar.length;
    return { ...p, productos: [...(p.productos ?? []).filter((x) => x.nombre.trim()), ...agregar] };
  });
  if (n) escribir(KEYS.PROVEEDORES, lista);
  return n;
}
