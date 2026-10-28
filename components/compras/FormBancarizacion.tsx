"use client";

import { SelectorCaja } from "@/components/SelectorCaja";
import { Field, Input, Select } from "@/components/ui";
import { CAJA_POR_DEFECTO, esCajaEfectivo } from "@/lib/cajas";
import { TIPOS_BANCARIZACION_ACTUALES, hoy } from "@/lib/storage";
import type { Bancarizacion, TipoBancarizacion } from "@/lib/types";

export const bancarizacionVacia = (): Bancarizacion => ({ tipo: "INTERBANK", nroOperacion: "", fecha: hoy(), caja: CAJA_POR_DEFECTO });

/**
 * BANCARIZACIÓN: tipo, N° de operación, fecha de pago y cuenta de origen (mismo selector de todos los pagos).
 * `soloCuenta`: pago aún pendiente, solo se elige la cuenta de la que saldrá.
 */
export function FormBancarizacion({
  value,
  onChange,
  soloCuenta = false,
  encabezado = true,
}: {
  value: Bancarizacion;
  onChange: (b: Bancarizacion) => void;
  soloCuenta?: boolean;
  encabezado?: boolean;
}) {
  const set = <K extends keyof Bancarizacion>(k: K, v: Bancarizacion[K]) => onChange({ ...value, [k]: v });
  // Caja Chica / Fondo de Reserva -> EFECTIVO; Caja General (Interbank) -> INTERBANK
  const cambiarCaja = (caja: string) =>
    onChange({ ...value, caja, ...(esCajaEfectivo(caja) ? { tipo: "EFECTIVO" as const } : value.tipo === "EFECTIVO" ? { tipo: "INTERBANK" as const } : {}) });
  const tipos = TIPOS_BANCARIZACION_ACTUALES.includes(value.tipo) ? TIPOS_BANCARIZACION_ACTUALES : [...TIPOS_BANCARIZACION_ACTUALES, value.tipo];
  const cuenta = <SelectorCaja value={value.caja} onChange={cambiarCaja} encabezado={encabezado} className="md:col-span-3" />;
  if (soloCuenta) return <div className="grid gap-4 md:grid-cols-3">{cuenta}</div>;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Tipo de bancarización *">
        <Select value={value.tipo} onChange={(e) => set("tipo", e.target.value as TipoBancarizacion)} options={tipos.map((t) => ({ value: t, label: t }))} />
      </Field>
      <Field label="N° operación bancaria">
        <Input value={value.nroOperacion ?? ""} onChange={(e) => set("nroOperacion", e.target.value)} placeholder="Opcional" />
      </Field>
      <Field label="Fecha de pago *">
        <Input type="date" value={value.fecha} max={hoy()} onChange={(e) => set("fecha", e.target.value)} />
      </Field>
      {cuenta}
    </div>
  );
}
