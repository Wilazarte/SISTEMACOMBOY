"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { notFound, useRouter } from "next/navigation";
import { buscarAccion, destinoDe, type ModuloInicio } from "@/lib/inicioModulos";

/**
 * /{modulo}/{accion}?doc=26W-XXX: lo que abre un botón del INICIO (en la misma ventana). Lleva a la pantalla real de
 * esa función con la barra NavegacionERP (atrás / adelante / INICIO > MÓDULO > pantalla) y el pie Cancelar / Guardar y Cerrar.
 * Usa replace: Atrás desde la pantalla vuelve directo al INICIO.
 */
export function IrAccion({ modulo, accion }: { modulo: ModuloInicio; accion: string }) {
  const router = useRouter();
  const a = buscarAccion(modulo, accion);
  useEffect(() => {
    if (!a) return;
    const doc = new URLSearchParams(window.location.search).get("doc");
    router.replace(destinoDe(modulo, a, doc));
  }, [a, modulo, router]);
  if (!a) notFound();
  return (
    <p className="flex items-center justify-center gap-2 py-24 text-sm text-[#d4d4d8]">
      <Loader2 size={16} className="animate-spin" /> Abriendo {a.label}…
    </p>
  );
}
