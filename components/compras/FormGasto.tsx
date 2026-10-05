"use client";

import { useRef, useState } from "react";
import { FileUp, Paperclip, Receipt, X } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, cn, ejecutar, toast } from "@/components/ui";
import {
  COMPROBANTES_GASTO,
  DETRACCION_SUGERIDA,
  MAX_ARCHIVO,
  PORCENTAJES_DETRACCION,
  TIPOS_GASTO,
  calcularDetraccion,
  fechaPE,
  hoy,
  parseFechaPE,
  registrarGastoTesoreria,
  rucValido,
  soles,
  type DatosGasto,
} from "@/lib/storage";
import type { ArchivoGasto, ComprobanteGasto, Proveedor, Rol, TipoGasto } from "@/lib/types";

/** DD/MM/AAAA mientras se escribe. */
const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

const vacio = (): Omit<DatosGasto, "fecha"> => ({
  tipoGasto: "TRANSPORTE",
  descripcion: "",
  importe: 0,
  comprobante: "FACTURA",
  numero: "",
  proveedor: "",
  ruc: "",
  detraccion: false,
  detraccionPorc: DETRACCION_SUGERIDA.TRANSPORTE,
  archivos: [],
});

/**
 * Gasto / servicio sin stock (Tesorería): almuerzos de representación, servicios básicos, transporte,
 * compras sin requerimiento… No ingresa a almacén: queda en Facturas como POR PAGAR.
 */
export function FormGasto({ rol, proveedores, onGuardado }: { rol: Rol; proveedores: Proveedor[]; onGuardado?: () => void }) {
  const [d, setD] = useState(vacio);
  const [fechaTxt, setFechaTxt] = useState(fechaPE(hoy()));
  const refFactura = useRef<HTMLInputElement>(null);
  const refGuia = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const fechaISO = parseFechaPE(fechaTxt);
  const fechaError = fechaTxt.length === 10 && !fechaISO ? "Fecha inexistente" : fechaISO > hoy() ? "La fecha no puede ser futura" : undefined;
  const { monto, neto } = calcularDetraccion(d.importe, d.detraccion, d.detraccionPorc);
  const rucMal = d.ruc.length === 11 && !rucValido(d.ruc);

  const adjuntar = (tipo: ArchivoGasto["tipo"], file?: File) => {
    if (!file) return;
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(file.type)) return toast("Adjunte un PDF o una imagen (JPG / PNG).", "error");
    if (file.size > MAX_ARCHIVO) return toast(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    const reader = new FileReader();
    reader.onload = () =>
      setD((x) => ({ ...x, archivos: [...x.archivos.filter((a) => a.tipo !== tipo), { tipo, nombre: file.name, mime: file.type, dataUrl: String(reader.result) }] }));
    reader.readAsDataURL(file);
  };

  const guardar = () => {
    if (
      ejecutar(
        () => registrarGastoTesoreria({ ...d, fecha: fechaISO }, rol),
        `Gasto registrado · en Facturas como POR PAGAR${monto ? ` (neto ${soles(neto)})` : ""}`
      )
    ) {
      setD(vacio());
      onGuardado?.();
    }
  };

  const archivo = (tipo: ArchivoGasto["tipo"]) => d.archivos.find((a) => a.tipo === tipo);

  return (
    <Card>
      <CardHeader title="Gasto / servicio sin stock" subtitle="Tesorería: no ingresa a almacén. Al guardar va directo a la pestaña Facturas como POR PAGAR." />
      <div className="grid gap-4 p-5 md:grid-cols-3">
        <Field label="Tipo de gasto *">
          <Select
            value={d.tipoGasto}
            onChange={(e) => {
              const tipoGasto = e.target.value as TipoGasto;
              setD((x) => ({ ...x, tipoGasto, detraccionPorc: DETRACCION_SUGERIDA[tipoGasto] }));
            }}
            options={(Object.keys(TIPOS_GASTO) as TipoGasto[]).map((k) => ({ value: k, label: TIPOS_GASTO[k] }))}
          />
        </Field>
        <Field label="Fecha de gasto *" hint={fechaError ? `⚠ ${fechaError}` : "DD/MM/AAAA"}>
          <Input value={fechaTxt} inputMode="numeric" maxLength={10} onChange={(e) => setFechaTxt(mascara(e.target.value))} className={cn(fechaError && "border-red-400")} />
        </Field>
        <Field label="Importe total (S/) *" hint={d.comprobante === "FACTURA" ? "Con IGV incluido" : undefined}>
          <Input type="number" min={0} step="0.01" value={d.importe || ""} onChange={(e) => set("importe", parseFloat(e.target.value) || 0)} className="text-lg font-semibold" />
        </Field>
        <Field label="Descripción del gasto *" className="md:col-span-3">
          <Textarea value={d.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej: Servicio de transporte Arequipa - Lima" />
        </Field>
        <Field label="Tipo de comprobante *">
          <Select
            value={d.comprobante}
            onChange={(e) => set("comprobante", e.target.value as ComprobanteGasto)}
            options={(Object.keys(COMPROBANTES_GASTO) as ComprobanteGasto[]).map((k) => ({ value: k, label: COMPROBANTES_GASTO[k] }))}
          />
        </Field>
        <Field label={d.comprobante === "DJ" ? "N° DJ *" : `N° ${COMPROBANTES_GASTO[d.comprobante].toLowerCase()} *`}>
          <Input
            value={d.numero}
            onChange={(e) => set("numero", e.target.value.toUpperCase())}
            placeholder={d.comprobante === "FACTURA" ? "F001-00001234" : d.comprobante === "BOLETA" ? "B001-00000456" : d.comprobante === "DJ" ? "DJ-001" : "N° de recibo"}
          />
        </Field>
        <div />
        <Field label="Proveedor / agencia *" className="md:col-span-2">
          <Input value={d.proveedor} list="proveedores-gasto" onChange={(e) => {
            const p = proveedores.find((x) => x.razonSocial === e.target.value.toUpperCase());
            setD((x) => ({ ...x, proveedor: e.target.value, ruc: p?.ruc ?? x.ruc }));
          }} placeholder="Razón social o nombre" />
          <datalist id="proveedores-gasto">
            {proveedores.map((p) => (
              <option key={p.id} value={p.razonSocial}>
                {p.ruc}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label={d.comprobante === "FACTURA" ? "RUC *" : "RUC / DNI"} hint={rucMal ? "⚠ Dígito verificador inválido" : undefined}>
          <Input
            value={d.ruc}
            maxLength={11}
            inputMode="numeric"
            onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))}
            className={cn(d.ruc.length === 11 && (rucMal ? "border-red-400" : "border-emerald-400"))}
          />
        </Field>

        {/* Detracción */}
        <div className="rounded-xl border border-slate-200 p-4 md:col-span-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={d.detraccion} onChange={(e) => set("detraccion", e.target.checked)} className="h-4 w-4 accent-amber-500" /> ¿Aplica detracción?
          </label>
          {d.detraccion && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div role="group" aria-label="Porcentaje de detracción">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">% detracción</span>
                <div className="flex gap-1">
                  {PORCENTAJES_DETRACCION.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("detraccionPorc", p)}
                      className={cn("rounded-lg border px-4 py-2 text-sm font-bold", d.detraccionPorc === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-amber-50")}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                Detracción: <b>{soles(monto)}</b>
              </div>
              <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                Neto a pagar: <b>{soles(neto)}</b>
              </div>
            </div>
          )}
        </div>

        {/* Adjuntos */}
        <div className="flex flex-wrap gap-3 md:col-span-3">
          {(
            [
              ["FACTURA", "Factura / comprobante (PDF)", refFactura],
              ["GUIA", "Guía de remisión (opcional)", refGuia],
            ] as const
          ).map(([tipo, label, ref]) => {
            const a = archivo(tipo);
            return (
              <div key={tipo} className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm">
                <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => adjuntar(tipo, e.target.files?.[0])} />
                {a ? (
                  <>
                    <Paperclip size={14} className="text-emerald-600" /> <span className="max-w-[220px] truncate font-medium">{a.nombre}</span>
                    <button type="button" onClick={() => setD((x) => ({ ...x, archivos: x.archivos.filter((y) => y.tipo !== tipo) }))} className="text-red-500" aria-label="Quitar archivo">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900">
                    <FileUp size={14} /> {label}
                  </button>
                )}
              </div>
            );
          })}
          <span className="self-center text-xs text-slate-400">PDF o imagen · máx. 1.5 MB c/u</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <p className="text-sm text-slate-600">
          Total <b className="text-slate-900">{soles(d.importe || 0)}</b>
          {d.detraccion && (
            <>
              {" "}
              · neto a pagar <b className="text-emerald-700">{soles(neto)}</b>
            </>
          )}
        </p>
        <Button variant="warning" onClick={guardar} disabled={!fechaISO} className="px-5 py-2.5">
          <Receipt size={16} /> Registrar gasto (por pagar)
        </Button>
      </div>
    </Card>
  );
}
