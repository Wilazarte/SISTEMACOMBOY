"use client";

// =====================================================================
// Sedes: Arequipa = Planta Principal / Taller Principal (el ERP) y Secocha = sucursal (módulo /secocha).
// La base aísla cada sede con RLS (supabase/migrations/20261023_sedes_multisede.sql, política sede_isolation):
// un usuario de sede (usuarios_sedes) solo recibe filas de su sede. El módulo Secocha trabaja siempre
// con Secocha, también cuando entra el ERP central (Taller, Tesorería): ya no hay selector de sede.
// (20261027_secocha_planta_principal.sql: sedes.tipo PLANTA_PRINCIPAL / SUCURSAL)
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { fijarVistaSede } from "./storage";

export interface Sede {
  id: string;
  nombre: string;
  codigo: string;
  es_central: boolean;
  /** PLANTA_PRINCIPAL (Arequipa) o SUCURSAL (Secocha); falta si no se corrió 20261027_secocha_planta_principal.sql. */
  tipo?: string | null;
}

export type RolSede = "admin_sede" | "vendedor" | "cajero";

export interface EstadoSedes {
  listo: boolean;
  error: string;
  sedes: Sede[];
  /** Sede asignada al usuario (usuarios_sedes); null = usuario del ERP central (ve todas). */
  asignada: { sedeId: string; rol: RolSede } | null;
  /** Sede con la que se trabaja en pantalla. */
  actualId: string;
}

const EVENTO = "erp:sede";
let estado: EstadoSedes = { listo: false, error: "", sedes: [], asignada: null, actualId: "" };

const avisar = () => window.dispatchEvent(new Event(EVENTO));

/**
 * Lee las sedes visibles y la sede del usuario (una vez por sesión).
 * `vista`: qué datos muestran las pantallas (lib/storage fijarVistaSede):
 *   "sucursal" -> app /secocha: solo lo de Secocha (ventas, tesorería, almacén de la sucursal).
 *   "central"  -> ERP de Arequipa: oculta lo de las sucursales.
 * Sin `vista` (bandejas de Secocha dentro del ERP) no cambia la vista actual.
 */
export async function cargarSedes(vista?: "sucursal" | "central"): Promise<void> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;
  const [s, u] = await Promise.all([
    sb.from("sedes").select("*").order("es_central", { ascending: false }).order("nombre"),
    sb.from("usuarios_sedes").select("sede_id,rol").eq("user_id", user.id).maybeSingle(),
  ]);
  const err = s.error ?? u.error;
  if (err) {
    const falta = err.code === "42P01" || err.code === "PGRST205" || /does not exist|could not find/i.test(err.message);
    estado = { ...estado, listo: true, error: falta ? "Faltan las sedes en Supabase: ejecute supabase/migrations/20261023_sedes_multisede.sql." : err.message };
    avisar();
    return;
  }
  const sedes = (s.data ?? []) as Sede[];
  const asignada = u.data ? { sedeId: u.data.sede_id as string, rol: u.data.rol as RolSede } : null;
  // Usuario de sede: la suya. ERP central (Taller, Tesorería): Secocha, la única sucursal
  const actualId = asignada?.sedeId ?? sedeSucursal(sedes)?.id ?? "";
  estado = { listo: true, error: "", sedes, asignada, actualId };
  // ERP: un usuario de Secocha (o SOPORTE que eligió Secocha) trabaja el ERP completo en modo Secocha
  const erpEnSucursal = vista === "central" && !!actualId && (!!asignada || (sedeElegida() === "sucursal" && !!sedeSucursal(sedes)));
  if ((vista === "sucursal" || erpEnSucursal) && actualId) fijarVistaSede({ modo: "sucursal", propia: actualId });
  else if (vista === "central" && !asignada && sedeCentral(sedes))
    fijarVistaSede({ modo: "central", ajenas: sedes.filter((x) => x.id !== sedeCentral(sedes)!.id).map((x) => x.id), secocha: sedeSucursal(sedes)?.id });
  avisar();
}

/**
 * SOPORTE (ERP central) elige con qué sede trabaja el ERP: Arequipa ("central") o Secocha ("sucursal").
 * Se recuerda en este navegador. Los usuarios de Secocha siempre trabajan en Secocha.
 */
const CLAVE_SEDE_ERP = "erp_sede_trabajo";
export function sedeElegida(): "central" | "sucursal" {
  try {
    return window.localStorage.getItem(CLAVE_SEDE_ERP) === "sucursal" ? "sucursal" : "central";
  } catch {
    return "central";
  }
}
export async function elegirSedeErp(v: "central" | "sucursal"): Promise<void> {
  try {
    window.localStorage.setItem(CLAVE_SEDE_ERP, v);
  } catch {
    /* almacenamiento bloqueado */
  }
  await cargarSedes("central");
}

/** Arequipa (Planta Principal): tipo PLANTA_PRINCIPAL o es_central. */
export const sedeCentral = (sedes: Sede[]): Sede | undefined =>
  sedes.find((s) => s.tipo?.toUpperCase() === "PLANTA_PRINCIPAL") ?? sedes.find((s) => s.es_central);

export function olvidarSedes(): void {
  fijarVistaSede(null);
  estado = { listo: false, error: "", sedes: [], asignada: null, actualId: "" };
  avisar();
}

/** La sucursal (Secocha): tipo SUCURSAL o, sin la columna tipo, la sede que no es central. Nunca Arequipa. */
export const sedeSucursal = (sedes: Sede[]): Sede | undefined =>
  sedes.find((s) => s.tipo?.toUpperCase() === "SUCURSAL") ?? sedes.find((s) => !s.es_central && s.tipo?.toUpperCase() !== "PLANTA_PRINCIPAL");

/** Usuario asignado a una sede (usuarios_sedes): jefe de Secocha o usuario de un submódulo de Secocha. */
export const esUsuarioDeSede = (): boolean => !!estado.asignada;
export const getSedes = (): Sede[] => estado.sedes;
export const sedeActualId = (): string => estado.actualId;
export const getSedeActual = (): Sede | undefined => estado.sedes.find((s) => s.id === estado.actualId);

/** La fila es de la sede en pantalla. Sin sedeId = recién creada aquí (la base la completa al guardar). */
export const esDeSede = (x: { sedeId?: string }): boolean => !x.sedeId || !estado.actualId || x.sedeId === estado.actualId;
export const deSede = <T extends { sedeId?: string }>(lista: T[]): T[] => lista.filter(esDeSede);

export function useSedes(): EstadoSedes {
  const [e, setE] = useState(estado);
  useEffect(() => {
    const on = () => setE(estado);
    on();
    window.addEventListener(EVENTO, on);
    return () => window.removeEventListener(EVENTO, on);
  }, []);
  return e;
}

/**
 * ERP de Arequipa (bandejas Despachos de Secocha y Requerimientos Secocha): carga las sedes si aún no están,
 * así la sede en pantalla es Secocha y las funciones de lib/sucursal trabajan sobre ella.
 */
export function useSedeSecocha(): EstadoSedes {
  const e = useSedes();
  useEffect(() => {
    if (!estado.listo) void cargarSedes();
  }, []);
  return e;
}
