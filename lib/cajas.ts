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

/**
 * Las 3 cajas de Arequipa. Se usan también mientras no se ejecute supabase/cajas.sql, para no bloquear los pagos.
 * Las cajas viejas (YAPE EMPRESA, BCP EMPRESA…) quedan INACTIVAS: sus pagos se siguen leyendo por nombre.
 */
export const CAJAS_AREQUIPA: { nombre: string; tipo: string; descripcion: string; cuentas: CuentaBancaria[] }[] = [
  { nombre: "CAJA CHICA", tipo: "EFECTIVO", descripcion: "Solo efectivo", cuentas: [] },
  { nombre: "CAJA GENERAL", tipo: "INTERBANK", descripcion: "Interbank Negocios (soles y dólares)", cuentas: CUENTAS_INTERBANK },
  { nombre: "FONDO DE RESERVA", tipo: "EFECTIVO", descripcion: "Efectivo e inyección de accionistas", cuentas: [] },
];

export const CAJAS_INICIALES: Caja[] = CAJAS_AREQUIPA.map(({ nombre, tipo }, i) => ({ id: nombre, nombre, tipo, saldo_actual: 0, responsable: null, estado: "ACTIVA", orden: (i + 1) * 10 }));

export const CAJA_POR_DEFECTO = "CAJA GENERAL";

/** Descripción y cuentas bancarias de una caja (por nombre); undefined si no es una de las 3 cajas. */
export const datosCaja = (nombre?: string | null) => CAJAS_AREQUIPA.find((c) => c.nombre === (nombre ?? "").trim().toUpperCase());

/** "Interbank Soles N° 3003008986156 · CCI 00330000300898615618" */
export const textoCuenta = (c: CuentaBancaria) => `${c.banco} ${c.monedaNombre} N° ${c.numero} · CCI ${c.cci}`;

/** Una caja en efectivo (Caja Chica, Fondo de Reserva): el pago no pasa por banco. */
export const esCajaEfectivo = (nombre?: string | null) => datosCaja(nombre)?.tipo === "EFECTIVO";

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
      // Arequipa trabaja solo con las 3 cajas (aunque supabase/cajas.sql aún no haya desactivado las viejas)
      .filter((c) => c.estado === "ACTIVA" && datosCaja(c.nombre))
      // CAJA CHICA, CAJA GENERAL, FONDO DE RESERVA
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
    return activas.length ? activas : CAJAS_INICIALES;
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

