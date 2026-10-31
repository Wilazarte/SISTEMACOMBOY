"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, cn, ejecutar } from "@/components/ui";
import { numeroAutomatico } from "@/lib/comprobantes";
import { COMPROBANTES_GASTO, TIPOS_GASTO, editarGasto, fechaPE, parseFechaPE, rucValido, soles } from "@/lib/storage";
import { EstadoRuc } from "@/components/EstadoRuc";
import type { Factura, Rol, TipoGasto } from "@/lib/types";

/** DD/MM/AAAA mientras se escribe (igual que en "Registrar gasto / compra"). */
const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/**
 * Edición de un gasto POR PAGAR con los mismos campos de "Registrar gasto / compra", precargados.
 * El tipo de comprobante, la detracción, la OC y los adjuntos no se cambian aquí.
 */
export function EditarGasto({ gasto, rol, onClose }: { gasto: Factura; rol: Rol; onClose: () => void }) {
  const comp = gasto.comprobanteGasto ?? "FACTURA";
  const [tipoGasto, setTipoGasto] = useState<TipoGasto>(gasto.tipoGasto ?? "OTROS");
  const [fechaTxt, setFechaTxt] = useState(fechaPE(gasto.fecha));
  const [importe, setImporte] = useState(gasto.total);
  const [descripcion, setDescripcion] = useState(gasto.descripcion ?? "");
  const [numero, setNumero] = useState(gasto.numero);
  const [proveedor, setProveedor] = useState(gasto.proveedor);
  const [ruc, setRuc] = useState(gasto.ruc);
  const fecha = parseFechaPE(fechaTxt);
  const rucMal = ruc.length === 11 && !rucValido(ruc);

  const guardar = () => {
    if (ejecutar(() => void editarGasto(gasto.id, { tipoGasto, fecha, importe, descripcion, numero, proveedor, ruc }, rol), `${gasto.codigo ?? gasto.numero} actualizado`)) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Editar gasto ${gasto.codigo ?? gasto.numero}`} wide>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Tipo de gasto *">
          <Select
            value={tipoGasto}
            onChange={(e) => setTipoGasto(e.target.value as TipoGasto)}
            options={(Object.keys(TIPOS_GASTO) as TipoGasto[]).filter((k) => k !== "PLANILLA").map((k) => ({ value: k, label: TIPOS_GASTO[k] }))}
          />
        </Field>
        <Field label="Fecha de gasto *" hint="DD/MM/AAAA">
          <Input value={fechaTxt} inputMode="numeric" maxLength={10} onChange={(e) => setFechaTxt(mascara(e.target.value))} />
        </Field>
        <Field label="Importe total (S/) *" hint={gasto.ocId ? `Fijo: coincide con la ${gasto.ocNumero}` : comp === "FACTURA" ? "Con IGV incluido" : undefined}>
          <Input type="number" min={0} step="0.01" value={importe || ""} disabled={!!gasto.ocId} onChange={(e) => setImporte(parseFloat(e.target.value) || 0)} className="text-lg font-semibold" />
        </Field>
        <Field label="Descripción del gasto *" className="md:col-span-3">
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Field>
        <Field label="Tipo de comprobante">
          <Input value={COMPROBANTES_GASTO[comp]} disabled />
        </Field>
        <Field label={comp === "DJ" ? "N° DJ *" : `N° ${COMPROBANTES_GASTO[comp].toLowerCase()} *`}>
          <Input value={numero} disabled={numeroAutomatico(comp)} onChange={(e) => setNumero(e.target.value.toUpperCase())} />
        </Field>
        <div />
        <Field label="Proveedor / agencia *" className="md:col-span-2">
          <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </Field>
        <Field label={comp === "FACTURA" ? "RUC *" : "RUC / DNI"} hint={rucMal ? "⚠ Dígito verificador inválido" : undefined}>
          <Input
            value={ruc}
            maxLength={11}
            inputMode="numeric"
            onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))}
            className={cn(ruc.length === 11 && (rucMal ? "border-red-400" : "border-emerald-400"))}
          />
          <EstadoRuc ruc={ruc} />
        </Field>
      </div>
      <p className="mt-3 text-xs text-plomo-500">Total actual: {soles(gasto.total)}. Solo se editan gastos por pagar; al pagarlos quedan cerrados.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={!fecha}>
          <Pencil size={15} /> Guardar cambios
        </Button>
      </div>
    </Modal>
  );
}
