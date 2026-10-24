"use client";

import { ShoppingBag, Wrench } from "lucide-react";
import { cn } from "@/components/ui";
import type { OrdenAGenerar } from "@/lib/types";

const OPCIONES: { value: OrdenAGenerar; label: string; icono?: JSX.Element }[] = [
  { value: "NINGUNA", label: "No generar" },
  { value: "OC", label: "Generar Orden de Compra OC", icono: <ShoppingBag size={15} /> },
  { value: "OS", label: "Generar Orden de Servicio OS", icono: <Wrench size={15} /> },
];

/**
 * "Registrar gasto / compra": qué orden se emite con el registro. Solo una (OC u OS) por gasto o compra.
 * `bloqueado`: el registro ya tiene su orden (al editar) y no se cambia.
 */
export function SelectorOrden({
  value,
  onChange,
  bloqueado = false,
  disabled = false,
  nota,
  children,
}: {
  value: OrdenAGenerar;
  onChange: (v: OrdenAGenerar) => void;
  bloqueado?: boolean;
  disabled?: boolean;
  nota?: string;
  /** Lo que se muestra debajo cuando se elige OC u OS (ej. productos de la orden en el gasto). */
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-plomo-200 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Orden a emitir</p>
      <div role="radiogroup" className="flex flex-wrap gap-x-6 gap-y-2">
        {OPCIONES.map((o) => (
          <label key={o.value} className={cn("flex items-center gap-2 text-sm font-semibold text-fg", bloqueado || disabled ? "cursor-default opacity-80" : "cursor-pointer")}>
            <input
              type="radio"
              name="orden-a-generar"
              value={o.value}
              checked={value === o.value}
              disabled={bloqueado || disabled}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 accent-corp"
            />
            {o.icono} {o.label}
          </label>
        ))}
      </div>
      {nota && <p className="mt-2 text-xs text-plomo-500">{nota}</p>}
      {value !== "NINGUNA" && children}
    </div>
  );
}
