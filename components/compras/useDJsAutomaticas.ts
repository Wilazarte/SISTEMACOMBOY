"use client";

import { useEffect, useMemo } from "react";
import { toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { KEYS, claveCargada, generarDJsPendientes, puede, requiereDJAutomatica, requiereDJCompra, useStore } from "@/lib/storage";
import type { Compra, Factura, Rol } from "@/lib/types";

// Una sola corrida a la vez en la pestaña; si la numeración falla (sin permiso / sin SQL) no se reintenta en bucle.
let enCurso = false;
let fallo = false;

/**
 * DJ automática (Williams 2026-11-13): al abrir el Registro de gastos o Declaraciones, los gastos ya guardados como
 * "Sin comprobante" (gastos y compras con ingreso a stock) que aún no tienen declaración jurada la reciben (DJ-0001… del servidor). Los gastos con factura,
 * boleta u otro comprobante no llevan DJ. Solo Tesorería / creador numeran DJ.
 */
export function useDJsAutomaticas(rol: Rol): void {
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const compras = useStore<Compra[]>(KEYS.COMPRAS, []);
  const pendientes = useMemo(() => facturas.filter((f) => requiereDJAutomatica(f)).length + compras.filter(requiereDJCompra).length, [facturas, compras]);
  const listo = claveCargada(KEYS.FACTURAS) && claveCargada(KEYS.COMPRAS);
  useEffect(() => {
    if (!listo || !pendientes || enCurso || fallo || !puede(rol, "fac.pagar") || getSesion()?.soloLectura) return;
    enCurso = true;
    generarDJsPendientes(rol)
      .then((n) => n > 0 && toast(`Se generó la declaración jurada de ${n} registro(s) sin comprobante.`))
      .catch((e) => {
        fallo = true;
        toast(`No se pudieron generar las declaraciones juradas: ${(e as Error).message}`, "error");
      })
      .finally(() => {
        enCurso = false;
      });
  }, [listo, pendientes, rol]);
}
