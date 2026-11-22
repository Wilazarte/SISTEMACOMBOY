"use client";

import { Input, Select, cn } from "@/components/ui";
import { componerCaja, datosCaja, nombreCaja, partirCaja, textoCuenta, useCajas } from "@/lib/cajas";

/**
 * "COMPROBANTE DE PAGO Y ORIGEN · ¿DE QUÉ CUENTA SE REALIZA EL PAGO? *": el mismo selector en todos los pagos.
 * Fuentes: CAJA GENERAL (TRANSFERENCIAS), CAJA CHICA (EFECTIVO), FONDO DE RESERVA, PRÉSTAMO, CRÉDITO y OTROS.
 * PRÉSTAMO pide quién hizo el préstamo y OTROS pide el detalle (obligatorios): se guardan en el mismo texto,
 * "PRÉSTAMO — Préstamo de: Juan Pérez", así el dato viaja con el pago sin cambiar tablas.
 * Sin `encabezado` cuando el formulario ya tiene el título "Comprobante de pago y origen" (emitir OC).
 */
export function SelectorCaja({ value, onChange, encabezado = true, className }: { value: string; onChange: (caja: string) => void; encabezado?: boolean; className?: string }) {
  const cajas = useCajas();
  const { base, detalle } = partirCaja(value);
  const def = datosCaja(base);
  const seleccion = def?.nombre ?? base;
  // Un pago antiguo puede tener una caja que ya no está activa: se sigue mostrando
  const opciones = [
    ...cajas.map((c) => ({ value: c.nombre, label: datosCaja(c.nombre)?.etiqueta ?? c.nombre })),
    ...(seleccion && !cajas.some((c) => c.nombre === seleccion) ? [{ value: seleccion, label: seleccion }] : []),
  ];
  return (
    <div className={cn("block", className)}>
      {encabezado && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Comprobante de pago y origen</p>}
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-plomo-500">¿De qué cuenta se realiza el pago? *</span>
        <Select
          required
          value={seleccion}
          onChange={(e) => onChange(nombreCaja(e.target.value) ? componerCaja(e.target.value, datosCaja(e.target.value)?.detalle ? detalle : "") : e.target.value)}
          placeholder="Seleccione la cuenta…"
          options={opciones}
        />
      </label>
      {def && <p className="mt-1 text-xs text-plomo-500">{def.descripcion}</p>}
      {def?.detalle && (
        <label className="mt-2 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-plomo-500">{def.detalle.etiqueta}</span>
          <Input
            required
            value={detalle}
            onChange={(e) => onChange(e.target.value.trim() ? `${def.nombre} — ${def.detalle!.prefijo}${e.target.value.trimStart()}` : def.nombre)}
            placeholder={def.detalle.placeholder}
            className={cn(!detalle.trim() && "border-red-400")}
          />
          {!detalle.trim() && <span className="mt-0.5 block text-[11px] font-semibold text-red-500">Obligatorio</span>}
        </label>
      )}
      {!!def?.cuentas.length && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-plomo-500">
          {def.cuentas.map((c) => (
            <li key={c.numero}>{textoCuenta(c)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
