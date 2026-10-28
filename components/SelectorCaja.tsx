"use client";

import { Select, cn } from "@/components/ui";
import { datosCaja, textoCuenta, useCajas } from "@/lib/cajas";

/**
 * "COMPROBANTE DE PAGO Y ORIGEN · ¿DE QUÉ CUENTA SE REALIZA EL PAGO? *": el mismo selector en todos los pagos.
 * Guarda el nombre de la caja ("CAJA CHICA", "CAJA GENERAL", "FONDO DE RESERVA"). Debajo muestra qué es la caja
 * y, en Caja General, sus cuentas Interbank.
 * Sin `encabezado` cuando el formulario ya tiene el título "Comprobante de pago y origen" (emitir OC).
 */
export function SelectorCaja({ value, onChange, encabezado = true, className }: { value: string; onChange: (caja: string) => void; encabezado?: boolean; className?: string }) {
  const cajas = useCajas();
  // Un pago antiguo puede tener una caja que ya no está activa: se sigue mostrando
  const opciones = [...cajas.map((c) => ({ value: c.nombre, label: datosCaja(c.nombre) ? `${c.nombre} · ${datosCaja(c.nombre)!.descripcion}` : c.nombre })), ...(value && !cajas.some((c) => c.nombre === value) ? [{ value, label: value }] : [])];
  return (
    <div className={cn("block", className)}>
      {encabezado && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Comprobante de pago y origen</p>}
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-plomo-500">¿De qué cuenta se realiza el pago? *</span>
        <Select required value={value} onChange={(e) => onChange(e.target.value)} placeholder="Seleccione la cuenta…" options={opciones} />
      </label>
      {!!datosCaja(value)?.cuentas.length && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-plomo-500">
          {datosCaja(value)!.cuentas.map((c) => (
            <li key={c.numero}>{textoCuenta(c)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
