// =====================================================================
// Base de proveedores (Logística) · Williams 2026-11-17
// Los proveedores son documentos tipo 'proveedor' de public.compras: los mismos que usa "Registrar compra",
// las OC / OS y los gastos. Aquí se completa su ficha (asesor de ventas, contacto, correo, dirección,
// productos que vende y número de opción). Es UNA base para Arequipa y Secocha (lib/storage COMPARTIDAS_SEDES).
// =====================================================================

import { ErpError, KEYS, escribir, getCompras, getProveedores, rucValido, uid } from "./storage";
import { exigirRucSunat } from "./ruc";
import { validarDocumentoPersona } from "./dni";
import { esAdminSede, perfilPlanta } from "./permisosPlanta";
import type { Sesion } from "./permisos";
import type { OpcionProveedor, ProductoProveedor, Proveedor } from "./types";

export const OPCIONES_PROVEEDOR: { value: OpcionProveedor; label: string; corto: string }[] = [
  { value: 1, label: "Primera opción", corto: "1ª" },
  { value: 2, label: "Segunda opción", corto: "2ª" },
  { value: 3, label: "Tercera opción", corto: "3ª" },
];
export const etiquetaOpcion = (o: OpcionProveedor | undefined): string => OPCIONES_PROVEEDOR.find((x) => x.value === o)?.label ?? "-";

/** Registran y editan proveedores: SOPORTE, Logística, Finanzas (ya los crea al registrar compras) y el administrador de Secocha. */
export const puedeGestionarProveedores = (sesion: Sesion | null): boolean => {
  const p = perfilPlanta(sesion);
  return esAdminSede(sesion) || p === "soporte" || p === "logistica" || p === "finanzas";
};

/** Registran y editan clientes desde Logística: SOPORTE, Logística y el administrador de Secocha (Ventas lo hace en su módulo). */
export const puedeGestionarClientes = (sesion: Sesion | null): boolean => {
  const p = perfilPlanta(sesion);
  return esAdminSede(sesion) || p === "soporte" || p === "logistica" || p === "ventas";
};

export const proveedorVacio = (): Proveedor => ({
  id: "",
  razonSocial: "",
  ruc: "",
  tipoDoc: "RUC",
  asesorVentas: "",
  contacto: "",
  correo: "",
  direccion: "",
  productos: [{ nombre: "", opcion: 1 }],
  estado: "ACTIVO",
});

const limpiarProductos = (lista: ProductoProveedor[] | undefined): ProductoProveedor[] => {
  const vistos = new Set<string>();
  const out: ProductoProveedor[] = [];
  for (const p of lista ?? []) {
    const nombre = (p.nombre ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!nombre || vistos.has(nombre)) continue;
    vistos.add(nombre);
    out.push({ nombre, opcion: p.opcion === 2 || p.opcion === 3 ? p.opcion : 1 });
  }
  return out;
};

/**
 * Crea o actualiza la ficha del proveedor. Con RUC: validado en SUNAT (regla de todo el ERP). Con DNI / CE /
 * pasaporte (persona natural): el número va en `ruc`; el DNI se verifica en RENIEC pero no bloquea.
 */
export function guardarProveedor(data: Proveedor): Proveedor {
  const tipoDoc = data.tipoDoc ?? "RUC";
  const persona = tipoDoc !== "RUC";
  const nombres = persona ? (data.nombres ?? "").trim().toUpperCase() : "";
  const apellidoPaterno = persona ? (data.apellidoPaterno ?? "").trim().toUpperCase() : "";
  const apellidoMaterno = persona ? (data.apellidoMaterno ?? "").trim().toUpperCase() : "";
  const razonSocial = (data.razonSocial.trim() || [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ")).toUpperCase();
  const ruc = data.ruc.trim().toUpperCase();
  if (tipoDoc === "RUC") {
    if (!rucValido(ruc)) throw new ErpError("RUC inválido (11 dígitos con dígito verificador correcto).");
    exigirRucSunat(ruc, "del proveedor");
  } else {
    const err = validarDocumentoPersona(tipoDoc, ruc);
    if (err) throw new ErpError(err);
  }
  if (!razonSocial) throw new ErpError(persona ? "Ingrese los nombres y apellidos del proveedor." : "Ingrese la razón social del proveedor.");
  const correo = (data.correo ?? "").trim();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErpError("Correo inválido.");
  const productos = limpiarProductos(data.productos);
  if (productos.length === 0) throw new ErpError("Indique al menos un producto que vende el proveedor.");
  const lista = getProveedores();
  const dup = lista.find((p) => p.ruc === ruc && p.id !== data.id);
  if (dup) throw new ErpError(tipoDoc === "DNI" ? `Este DNI ya está registrado como ${dup.razonSocial}.` : `El ${tipoDoc === "RUC" ? "RUC" : "documento"} ${ruc} ya está registrado.`);
  const previo = lista.find((p) => p.id === data.id);
  const prov: Proveedor = {
    ...previo,
    id: data.id || uid(),
    razonSocial,
    ruc,
    tipoDoc,
    nombres: nombres || undefined,
    apellidoPaterno: apellidoPaterno || undefined,
    apellidoMaterno: apellidoMaterno || undefined,
    dniVerificadoAt: tipoDoc === "DNI" ? data.dniVerificadoAt || undefined : undefined,
    asesorVentas: (data.asesorVentas ?? "").trim().toUpperCase(),
    contacto: (data.contacto ?? "").trim(),
    correo,
    direccion: (data.direccion ?? "").trim(),
    productos,
    estado: data.estado === "INACTIVO" ? "INACTIVO" : "ACTIVO",
    creadoEn: previo?.creadoEn ?? data.creadoEn ?? new Date().toISOString(),
  };
  const resto = lista.filter((p) => p.id !== prov.id);
  escribir(KEYS.PROVEEDORES, [...resto, prov].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial)));
  return prov;
}

export function eliminarProveedor(id: string): void {
  const prov = getProveedores().find((p) => p.id === id);
  if (!prov) return;
  if (getCompras().some((c) => c.proveedorId === id || c.ruc === prov.ruc))
    throw new ErpError("El proveedor tiene compras registradas: márquelo como INACTIVO en lugar de eliminarlo.");
  escribir(KEYS.PROVEEDORES, getProveedores().filter((p) => p.id !== id));
}

/** Proveedores que venden un producto, ordenados por número de opción (primera opción arriba). */
export function proveedoresDeProducto(lista: Proveedor[], texto: string): { proveedor: Proveedor; producto: ProductoProveedor }[] {
  const q = texto.trim().toUpperCase();
  if (!q) return [];
  return lista
    .filter((p) => p.estado !== "INACTIVO")
    .flatMap((p) => (p.productos ?? []).filter((x) => x.nombre.includes(q)).map((producto) => ({ proveedor: p, producto })))
    .sort((a, b) => a.producto.opcion - b.producto.opcion || a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial));
}
