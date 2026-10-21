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

/** Mientras no se ejecute supabase/cajas.sql: las mismas cajas iniciales, para no bloquear los pagos. */
export const CAJAS_INICIALES: Caja[] = (
  [
    ["CAJA GENERAL", "EFECTIVO"],
    ["CAJA CHICA", "EFECTIVO"],
    ["FONDO DE RESERVA", "EFECTIVO"],
    ["YAPE EMPRESA", "YAPE"],
    ["BCP EMPRESA - CTA 123", "BCP"],
  ] as const
).map(([nombre, tipo], i) => ({ id: nombre, nombre, tipo, saldo_actual: 0, responsable: null, estado: "ACTIVA", orden: (i + 1) * 10 }));

export const CAJA_POR_DEFECTO = CAJAS_INICIALES[0].nombre;

let cache: Promise<Caja[]> | null = null;

/** Cajas ACTIVAS por nombre (se lee una vez por sesión). */
export function listarCajas(): Promise<Caja[]> {
  cache ??= (async () => {
    const { data, error } = await createClient().from("cajas").select("id,nombre,tipo,saldo_actual,responsable,estado,orden");
    if (error || !data?.length) return CAJAS_INICIALES;
    return data
      .map((r) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ""),
        tipo: String(r.tipo ?? ""),
        saldo_actual: Number(r.saldo_actual) || 0,
        responsable: (r.responsable as string | null) ?? null,
        estado: String(r.estado ?? "ACTIVA").toUpperCase(),
        orden: Number(r.orden ?? 100),
      }))
      .filter((c) => c.nombre && c.estado === "ACTIVA")
      // CAJA GENERAL, CAJA CHICA, FONDO DE RESERVA y luego Yape / bancos
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
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

