"use client";

// =====================================================================
// Sedes (multi-sede): Arequipa (central) y Secocha. La base aísla cada sede con RLS
// (supabase/migrations/20261023_sedes_multisede.sql, política sede_isolation):
// un usuario de sede (usuarios_sedes) solo recibe filas de su sede. Los usuarios del ERP
// central (creador, Taller, Tesorería) reciben todas y eligen en pantalla con qué sede trabajan.
// =====================================================================

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";

export interface Sede {
  id: string;
  nombre: string;
  codigo: string;
  es_central: boolean;
}

export type RolSede = "admin_sede" | "vendedor" | "cajero";

interface EstadoSedes {
  listo: boolean;
  error: string;
  sedes: Sede[];
  /** Sede asignada al usuario (usuarios_sedes); null = usuario del ERP central (ve todas). */
  asignada: { sedeId: string; rol: RolSede } | null;
  /** Sede con la que se trabaja en pantalla. */
  actualId: string;
}

const EVENTO = "erp:sede";
const CLAVE = "sucursal-sede";
let estado: EstadoSedes = { listo: false, error: "", sedes: [], asignada: null, actualId: "" };

const avisar = () => window.dispatchEvent(new Event(EVENTO));

/** Lee las sedes visibles y la sede del usuario (una vez por sesión). */
export async function cargarSedes(): Promise<void> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;
  const [s, u] = await Promise.all([
    sb.from("sedes").select("id,nombre,codigo,es_central").order("es_central", { ascending: false }).order("nombre"),
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
  let guardada = "";
  try {
    guardada = window.localStorage.getItem(CLAVE) ?? "";
  } catch {
    /* almacenamiento bloqueado */
  }
  const actualId = asignada?.sedeId ?? (sedes.some((x) => x.id === guardada) ? guardada : (sedes.find((x) => x.es_central) ?? sedes[0])?.id ?? "");
  estado = { listo: true, error: "", sedes, asignada, actualId };
  avisar();
}

export function olvidarSedes(): void {
  estado = { listo: false, error: "", sedes: [], asignada: null, actualId: "" };
  avisar();
}

/** Solo el ERP central cambia de sede (un usuario de sede siempre trabaja en la suya). */
export function elegirSede(id: string): void {
  if (estado.asignada || !estado.sedes.some((s) => s.id === id)) return;
  estado = { ...estado, actualId: id };
  try {
    window.localStorage.setItem(CLAVE, id);
  } catch {
    /* almacenamiento bloqueado */
  }
  avisar();
}

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
