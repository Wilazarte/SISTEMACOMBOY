"use client";

import { Field, Select } from "@/components/ui";
import { useCajas } from "@/lib/cajas";

/** "¿De qué caja sale el dinero?": el mismo selector en todos los pagos del sistema. */
export function SelectorCaja({ value, onChange, label = "Caja de salida *", className }: { value: string; onChange: (caja: string) => void; label?: string; className?: string }) {
  const cajas = useCajas();
  // Un pago antiguo puede tener una caja que ya no está activa: se sigue mostrando
  const opciones = [...cajas.map((c) => ({ value: c.nombre, label: `${c.nombre} · ${c.tipo}` })), ...(value && !cajas.some((c) => c.nombre === value) ? [{ value, label: value }] : [])];
  return (
    <Field label={label} className={className}>
      <Select required value={value} onChange={(e) => onChange(e.target.value)} placeholder="Seleccione la caja…" options={opciones} />
    </Field>
  );
}
