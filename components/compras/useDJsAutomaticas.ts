"use client";

import { useEffect, useMemo } from "react";
import { toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { KEYS, claveCargada, generarDJsPendientes, puede, requiereDJAutomatica, useStore } from "@/lib/storage";
import type { Factura, OrdenServicio, Rol } from "@/lib/types";

// Una sola corrida a la vez en la pestaña; si la numeración falla (sin permiso / sin SQL) no se reintenta en bucle.
let enCurso = false;
let fallo = false;

/**
 * DJ automática (Williams 2026-11-12): al abrir el Registro de gastos o Declaraciones, los gastos ya guardados sin OC ni
 * OS que aún no tienen declaración jurada la reciben (DJ-0001… del servidor). Solo Tesorería / creador numeran DJ.
 */
export function useDJsAutomaticas(rol: Rol): void {
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const ordenesServicio = useStore<OrdenServicio[]>(KEYS.ORDENES_SERVICIO, []);
  const pendientes = useMemo(() => {
    const conOS = new Set(ordenesServicio.filter((o) => o.estado !== "ANULADA" && o.gastoId).map((o) => o.gastoId!));
    return facturas.filter((f) => requiereDJAutomatica(f, conOS)).length;
  }, [facturas, ordenesServicio]);
  const listo = claveCargada(KEYS.FACTURAS) && claveCargada(KEYS.ORDENES_SERVICIO);
  useEffect(() => {
    if (!listo || !pendientes || enCurso || fallo || !puede(rol, "fac.pagar") || getSesion()?.soloLectura) return;
    enCurso = true;
    generarDJsPendientes(rol)
      .then((n) => n > 0 && toast(`Se generó la declaración jurada de ${n} gasto(s) sin OC ni OS.`))
      .catch((e) => {
        fallo = true;
        toast(`No se pudieron generar las declaraciones juradas: ${(e as Error).message}`, "error");
      })
      .finally(() => {
        enCurso = false;
      });
  }, [listo, pendientes, rol]);
}
