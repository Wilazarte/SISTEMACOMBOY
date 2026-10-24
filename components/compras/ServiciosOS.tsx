"use client";

import { Plus, Trash2 } from "lucide-react";
import { UNIDADES } from "@/lib/empresa";
import { Button, Input, Select, Textarea, cn } from "@/components/ui";
import { IGV, r2, soles } from "@/lib/storage";

/** Línea de servicio de la OS: texto libre, sin catálogo ni almacén. */
export type FilaServicio = { id: string; descripcion: string; cantidad: number; unidad: string; precioUnit: number; descTocada?: boolean };
export const servicioVacio = (): FilaServicio => ({ id: Math.random().toString(36).slice(2), descripcion: "", cantidad: 1, unidad: "SERVICIO", precioUnit: 0 });

const UNIDADES_SERVICIO = ["SERVICIO", ...UNIDADES];

/**
 * Líneas que se guardan: la primera toma la descripción del gasto mientras no se escriba otra; con una sola
 * línea el precio sale del importe del gasto (sin IGV si es factura), así el total de la OS siempre cuadra.
 */
export function lineasServicio(filas: FilaServicio[], descripcionGasto: string, importe: number, conIgv: boolean): FilaServicio[] {
  const lineas = filas.map((f, k) => (k === 0 && !f.descTocada ? { ...f, descripcion: descripcionGasto } : f));
  if (lineas.length !== 1) return lineas;
  const base = conIgv ? r2((importe || 0) / (1 + IGV)) : r2(importe || 0);
  const cantidad = lineas[0].cantidad > 0 ? lineas[0].cantidad : 1;
  return [{ ...lineas[0], cantidad, precioUnit: r2(base / cantidad) }];
}

/** Formulario de la OS del gasto: descripción libre, cantidad, unidad y precio sin IGV. */
export function ServiciosOS({
  filas,
  onChange,
  descripcionGasto,
  importe,
  conIgv,
}: {
  filas: FilaServicio[];
  onChange: (f: FilaServicio[]) => void;
  descripcionGasto: string;
  importe: number;
  conIgv: boolean;
}) {
  const lineas = lineasServicio(filas, descripcionGasto, importe, conIgv);
  const una = filas.length === 1;
  const set = (id: string, cambios: Partial<FilaServicio>) => onChange(filas.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  const sub = r2(lineas.reduce((a, f) => a + (f.cantidad || 0) * (f.precioUnit || 0), 0));
  const total = una ? r2(importe || 0) : conIgv ? r2(sub * (1 + IGV)) : sub;
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-plomo-500">
        Servicio en texto libre (no es producto de almacén ni toca el kardex). Precios {conIgv ? "sin IGV" : "finales"}.
        {una ? " Con una sola línea el total de la OS es el importe del gasto." : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
            <tr>
              <th className="px-2 py-2 text-left">Descripción del servicio *</th>
              <th className="w-24 px-2 py-2 text-left">Cantidad *</th>
              <th className="w-32 px-2 py-2 text-left">Unidad</th>
              <th className="w-32 px-2 py-2 text-left">P. unit. {conIgv ? "sin IGV" : ""} *</th>
              <th className="w-28 px-2 py-2 text-right">Subtotal</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-plomo-100">
            {lineas.map((f) => (
              <tr key={f.id}>
                <td className="px-2 py-1.5">
                  <Textarea
                    rows={2}
                    value={f.descripcion}
                    onChange={(e) => set(f.id, { descripcion: e.target.value, descTocada: true })}
                    placeholder="Ej: Servicio de estibador, servicio contable…"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} step="any" value={f.cantidad || ""} onChange={(e) => set(f.id, { cantidad: parseFloat(e.target.value) || 0 })} />
                </td>
                <td className="px-2 py-1.5">
                  <Select value={f.unidad} onChange={(e) => set(f.id, { unidad: e.target.value })} options={UNIDADES_SERVICIO.map((u) => ({ value: u, label: u }))} />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={f.precioUnit || ""}
                    disabled={una}
                    title={una ? "Sale del importe del gasto" : undefined}
                    onChange={(e) => set(f.id, { precioUnit: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">{soles(r2((f.cantidad || 0) * (f.precioUnit || 0)))}</td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onChange(filas.length > 1 ? filas.filter((x) => x.id !== f.id) : [servicioVacio()])}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Quitar servicio"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Al pasar a varias líneas, la primera conserva el precio que tenía (sale del importe) */}
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...lineas.map((l) => ({ ...l, descTocada: true })), servicioVacio()])}>
          <Plus size={14} /> Agregar servicio
        </Button>
        <p className={cn("text-sm", Math.abs(total - (importe || 0)) > 0.05 ? "text-red-600" : "text-emerald-700")}>
          Total OS <b>{soles(total)}</b>
          {!una && <> · debe coincidir con el importe {soles(importe || 0)}</>}
        </p>
      </div>
    </div>
  );
}
