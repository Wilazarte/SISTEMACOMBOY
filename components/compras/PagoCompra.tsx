"use client";

import { FormBancarizacion, bancarizacionVacia } from "@/components/compras/FormBancarizacion";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { CAJA_POR_DEFECTO } from "@/lib/cajas";
import { hoy } from "@/lib/storage";
import type { Bancarizacion, Compra, PagoCompra } from "@/lib/types";

/** Estado del formulario: la bancarización siempre está (su `caja` es la cuenta), aunque el pago siga pendiente. */
export type FormPagoCompra = Omit<PagoCompra, "bancarizacion"> & { bancarizacion: Bancarizacion };

export const pagoCompraVacio = (): FormPagoCompra => ({ formaPago: "CONTADO", estado: "PAGADO", fechaVencimiento: hoy(), bancarizacion: bancarizacionVacia(), observaciones: "" });

/** Precarga el formulario con el pago de una compra registrada (las antiguas solo tienen la caja). */
export const pagoCompraDe = (c: Compra): FormPagoCompra => {
  const p = c.pago;
  const caja = c.caja ?? CAJA_POR_DEFECTO;
  return {
    formaPago: p?.formaPago ?? "CONTADO",
    estado: p?.estado ?? "PAGADO",
    fechaVencimiento: p?.fechaVencimiento ?? c.fecha,
    bancarizacion: { ...bancarizacionVacia(), fecha: c.fecha, ...p?.bancarizacion, caja },
    observaciones: p?.observaciones ?? "",
  };
};

/**
 * COMPROBANTE DE PAGO Y ORIGEN de la compra con ingreso a stock: forma de pago, estado, vencimiento y
 * la bancarización de siempre (tipo, N° operación, fecha de pago y cuenta).
 */
export function PagoCompraForm({ value, onChange }: { value: FormPagoCompra; onChange: (p: FormPagoCompra) => void }) {
  const set = <K extends keyof FormPagoCompra>(k: K, v: FormPagoCompra[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="rounded-xl border border-plomo-200 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">Comprobante de pago y origen</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Forma de pago *">
          <Select
            value={value.formaPago}
            onChange={(e) => set("formaPago", e.target.value as FormPagoCompra["formaPago"])}
            options={[
              { value: "CONTADO", label: "Contado" },
              { value: "CREDITO", label: "Crédito" },
            ]}
          />
        </Field>
        <Field label="Estado de pago *">
          <Select
            value={value.estado}
            onChange={(e) => set("estado", e.target.value as FormPagoCompra["estado"])}
            options={[
              { value: "PAGADO", label: "Pagado" },
              { value: "PENDIENTE", label: "Pendiente" },
            ]}
          />
        </Field>
        <Field label={`Fecha de vencimiento${value.formaPago === "CREDITO" ? " *" : ""}`}>
          <Input type="date" value={value.fechaVencimiento} onChange={(e) => set("fechaVencimiento", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <FormBancarizacion value={value.bancarizacion} onChange={(b) => set("bancarizacion", b)} soloCuenta={value.estado === "PENDIENTE"} encabezado={false} />
      </div>
      <Field label="Observaciones de pago" className="mt-4">
        <Textarea value={value.observaciones ?? ""} onChange={(e) => set("observaciones", e.target.value)} placeholder="Opcional" />
      </Field>
    </div>
  );
}
