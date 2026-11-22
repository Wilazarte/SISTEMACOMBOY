// Cajas: de dónde sale el dinero de cada pago (tabla public.cajas, ver supabase/cajas.sql).
// En los pagos se guarda el NOMBRE de la caja (texto), así el historial se lee aunque la caja se desactive.

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

export interface Caja {
  id: string;
  nombre: string;
  tipo: string; // EFECTIVO | YAPE | BCP | BBVA | INTERBANK
  saldo_actual: number;
  responsable: string | null;
  estado: string; // ACTIVA | INACTIVA
  orden: number; // orden en el selector
}

export interface CuentaBancaria {
  banco: string;
  producto: string;
  moneda: "PEN" | "USD";
  monedaNombre: string; // Soles | Dólares
  numero: string;
  cci: string;
}

/** Cuentas Interbank Negocios de la CAJA GENERAL (Arequipa). */
export const CUENTAS_INTERBANK: CuentaBancaria[] = [
  { banco: "Interbank", producto: "Cuenta Negocios", moneda: "PEN", monedaNombre: "Soles", numero: "3003008986156", cci: "00330000300898615618" },
  { banco: "Interbank", producto: "Cuenta Negocios", moneda: "USD", monedaNombre: "Dólares", numero: "3003008986163", cci: "00330000300898616314" },
];

/** Datos extra obligatorios de una fuente de pago (quién hizo el préstamo, detalle de "Otros"). */
export interface DetalleFuente {
  etiqueta: string; // texto del campo
  placeholder: string;
  prefijo: string; // se antepone al dato al guardarlo: "Préstamo de: Juan Pérez"
}

export interface FuentePago {
  nombre: string; // lo que se guarda en los pagos (texto)
  etiqueta: string; // lo que se ve en el selector
  tipo: string; // INTERBANK | EFECTIVO | PRESTAMO | CREDITO | OTROS
  descripcion: string;
  cuentas: CuentaBancaria[];
  alias?: string[]; // nombres anteriores de la misma caja (pagos ya guardados)
  detalle?: DetalleFuente;
}

/**
 * Fuentes de pago de Arequipa, en el orden del selector. Se usan también mientras no se ejecute el SQL, para no bloquear los pagos.
 * Las cajas viejas (YAPE EMPRESA, BCP EMPRESA…) quedan INACTIVAS: sus pagos se siguen leyendo por nombre.
 */
export const CAJAS_AREQUIPA: FuentePago[] = [
  { nombre: "CAJA GENERAL", etiqueta: "CAJA GENERAL (TRANSFERENCIAS)", tipo: "INTERBANK", descripcion: "Transferencias · Interbank Negocios (soles y dólares)", cuentas: CUENTAS_INTERBANK },
  { nombre: "CAJA CHICA", etiqueta: "CAJA CHICA (EFECTIVO)", tipo: "EFECTIVO", descripcion: "Solo efectivo", cuentas: [] },
  { nombre: "FONDO DE RESERVA", etiqueta: "FONDO DE RESERVA", tipo: "EFECTIVO", descripcion: "Efectivo e inyección de accionistas", cuentas: [] },
  {
    nombre: "PRÉSTAMO",
    etiqueta: "PRÉSTAMO",
    tipo: "PRESTAMO",
    descripcion: "Dinero prestado (indique quién hizo el préstamo)",
    cuentas: [],
    alias: ["PRESTAMO"],
    detalle: { etiqueta: "¿Quién hizo el préstamo? *", placeholder: "Nombre de la persona o empresa que prestó el dinero", prefijo: "Préstamo de: " },
  },
  { nombre: "CRÉDITO", etiqueta: "CRÉDITO", tipo: "CREDITO", descripcion: "Pago a crédito (queda como deuda con el proveedor)", cuentas: [], alias: ["CREDITO"] },
  {
    nombre: "OTROS",
    etiqueta: "OTROS",
    tipo: "OTROS",
    descripcion: "Otra fuente de pago (detalle obligatorio)",
    cuentas: [],
    detalle: { etiqueta: "Detalle de la fuente de pago *", placeholder: "Ej: Tarjeta de crédito del gerente, Yape personal de…, cuenta BCP…", prefijo: "" },
  },
];

export const CAJAS_INICIALES: Caja[] = CAJAS_AREQUIPA.map(({ nombre, tipo }, i) => ({ id: nombre, nombre, tipo, saldo_actual: 0, responsable: null, estado: "ACTIVA", orden: (i + 1) * 10 }));

export const CAJA_POR_DEFECTO = "CAJA GENERAL";

/** Separador entre la fuente y su dato extra en el texto guardado: "OTROS — Tarjeta del gerente". */
export const SEPARADOR_DETALLE = " — ";

/** Mayúsculas, sin tildes ni espacios dobles (para comparar nombres de caja). */
const normalizar = (s?: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Separa el texto guardado en fuente y dato extra: "PRÉSTAMO — Préstamo de: Ana" -> { base, detalle: "Ana" }. */
export function partirCaja(valor?: string | null): { base: string; detalle: string } {
  // Sin recortar el final: el selector lo usa mientras se escribe (los espacios entre palabras deben quedarse)
  const v = (valor ?? "").trimStart();
  const i = v.indexOf(SEPARADOR_DETALLE);
  if (i < 0) return { base: v.trim(), detalle: "" };
  const base = v.slice(0, i).trim();
  let detalle = v.slice(i + SEPARADOR_DETALLE.length).trimStart();
  const prefijo = datosCaja(base)?.detalle?.prefijo.trim();
  if (prefijo && detalle.toUpperCase().startsWith(prefijo.toUpperCase())) detalle = detalle.slice(prefijo.length).trimStart();
  return { base, detalle };
}

/** Texto que se guarda en el pago: la fuente y, si pide dato extra, el dato ("OTROS — Tarjeta del gerente"). */
export function componerCaja(nombre: string, detalle?: string): string {
  const d = (detalle ?? "").trim();
  const def = datosCaja(nombre);
  if (!def?.detalle || !d) return def?.nombre ?? nombre;
  return `${def.nombre}${SEPARADOR_DETALLE}${def.detalle.prefijo}${d}`;
}

/** Fuente de pago (por nombre, nombre anterior o texto guardado con detalle); undefined si no es una de Arequipa. */
export function datosCaja(nombre?: string | null): FuentePago | undefined {
  const v = (nombre ?? "").trim();
  const n = normalizar(v.includes(SEPARADOR_DETALLE) ? v.slice(0, v.indexOf(SEPARADOR_DETALLE)) : v);
  return CAJAS_AREQUIPA.find((c) => normalizar(c.nombre) === n || c.alias?.some((a) => normalizar(a) === n));
}

/** Nombre de la fuente de un pago, sin su dato extra ("OTROS — Tarjeta…" -> "OTROS"); undefined si no es de Arequipa. */
export const nombreCaja = (valor?: string | null) => datosCaja(valor)?.nombre;

/** Mensaje si falta el dato obligatorio de la fuente (quién prestó, detalle de Otros); null si está completo. */
export function errorCaja(valor?: string | null): string | null {
  if (!(valor ?? "").trim()) return "Seleccione de qué cuenta se realiza el pago.";
  const def = datosCaja(valor);
  if (def?.detalle && !partirCaja(valor).detalle.trim()) {
    return def.nombre === "OTROS" ? "Fuente de pago OTROS: escriba el detalle de la fuente." : `${def.nombre}: indique quién hizo el préstamo.`;
  }
  return null;
}

/** "Interbank Soles N° 3003008986156 · CCI 00330000300898615618" */
export const textoCuenta = (c: CuentaBancaria) => `${c.banco} ${c.monedaNombre} N° ${c.numero} · CCI ${c.cci}`;

/** Una caja en efectivo (Caja Chica, Fondo de Reserva): el pago no pasa por banco. */
export const esCajaEfectivo = (nombre?: string | null) => datosCaja(nombre)?.tipo === "EFECTIVO";

/** Caja General: transferencias por Interbank. */
export const esCajaBanco = (nombre?: string | null) => datosCaja(nombre)?.tipo === "INTERBANK";

let cache: Promise<Caja[]> | null = null;

/** Cajas ACTIVAS por nombre (se lee una vez por sesión). */
export function listarCajas(): Promise<Caja[]> {
  cache ??= (async () => {
    const { data, error } = await createClient().from("cajas").select("id,nombre,tipo,saldo_actual,responsable,estado,orden");
    if (error || !data?.length) return CAJAS_INICIALES;
    const activas = data
      .map((r) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ""),
        tipo: String(r.tipo ?? ""),
        saldo_actual: Number(r.saldo_actual) || 0,
        responsable: (r.responsable as string | null) ?? null,
        estado: String(r.estado ?? "ACTIVA").toUpperCase(),
        orden: Number(r.orden ?? 100),
      }))
      // Arequipa trabaja solo con sus fuentes de pago (aunque el SQL aún no haya desactivado las viejas)
      .filter((c) => c.estado === "ACTIVA" && datosCaja(c.nombre))
      // nombre oficial (sin tildes distintas ni espacios de más)
      .map((c) => ({ ...c, nombre: nombreCaja(c.nombre)! }));
    // Siempre las 6 fuentes en el orden de CAJAS_AREQUIPA, aunque el SQL aún no cree CRÉDITO y OTROS
    return CAJAS_INICIALES.map((ini) => activas.find((c) => c.nombre === ini.nombre) ?? ini).map((c, i) => ({ ...c, orden: (i + 1) * 10 }));
  })();
  return cache;
}

export function useCajas(): Caja[] {
  const [cajas, setCajas] = useState<Caja[]>(CAJAS_INICIALES);
  useEffect(() => {
    let vivo = true;
    void listarCajas().then((c) => vivo && setCajas(c));
    return () => {
      vivo = false;
    };
  }, []);
  return cajas;
}

