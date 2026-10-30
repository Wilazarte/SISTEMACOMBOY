"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { notFound } from "next/navigation";
import { buscarAccion, destinoDe, type ModuloInicio } from "@/lib/inicioModulos";

/**
 * /{modulo}/{accion}?doc=26W-XXX: la pestaña nueva que abre un botón del INICIO. Lleva a la pantalla real de esa
 * función con el encabezado "Volver a INICIO" y el pie Cancelar / Guardar y Cerrar (components/inicio/ModoPestana).
 */
export function IrAccion({ modulo, accion }: { modulo: ModuloInicio; accion: string }) {
  const a = buscarAccion(modulo, accion);
  useEffect(() => {
    if (!a) return;
    const doc = new URLSearchParams(window.location.search).get("doc");
    window.location.replace(destinoDe(modulo, a, doc));
  }, [a, modulo]);
  if (!a) notFound();
  return (
    <p className="flex items-center justify-center gap-2 py-24 text-sm text-[#d4d4d8]">
      <Loader2 size={16} className="animate-spin" /> Abriendo {a.label}…
    </p>
  );
}
