"use client";

import { useState } from "react";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, ejecutar } from "@/components/ui";
import type { Sesion } from "@/lib/auth";
import { SEDES, UNIDADES } from "@/lib/empresa";
import { editarRequerimiento, reenviarRequerimiento, uid } from "@/lib/storage";
import type { ItemReq, Requerimiento, Rol } from "@/lib/types";

export const itemVacio = (): ItemReq => ({ id: uid(), nombre: "", cantidad: 1, unidad: "UND", marca: "", caracteristica: "" });

/**
 * Quién puede editar un REQ: solo PENDIENTE (antes de la revisión) u OBSERVADO (corregir y reenviar),
 * y solo quien lo emitió o el creador. Gerencia es de solo lectura (y RLS no le deja escribir en compras).
 * Los REQ antiguos no guardan quién los emitió: los edita el rol Almacén, que es quien los emite.
 */
export function permisoEditarReq(req: Requerimiento, sesion: Sesion | null): { ok: boolean; motivo: string } {
  if (req.estado !== "PENDIENTE" && req.estado !== "OBSERVADO") return { ok: false, motivo: "Documento ya procesado" };
  if (!sesion || sesion.soloLectura) return { ok: false, motivo: "Su usuario es de solo lectura" };
  if (sesion.rol === "creador") return { ok: true, motivo: "" };
  const esAutor = req.creadoPor ? req.creadoPor === sesion.usuario : sesion.rol === "almacen";
  return esAutor ? { ok: true, motivo: "" } : { ok: false, motivo: "Solo quien lo emitió puede editarlo" };
}

// =====================================================================
// Editor de productos (nuevo requerimiento, edición y corrección)
// =====================================================================
export function ItemsEditor({ items, onChange }: { items: ItemReq[]; onChange: (i: ItemReq[]) => void }) {
  const set = (id: string, campo: keyof ItemReq, v: string | number) => onChange(items.map((i) => (i.id === id ? { ...i, [campo]: v } : i)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
          <tr>
            <th className="w-8 px-3 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Producto *</th>
            <th className="w-24 px-2 py-2 text-left">Cantidad *</th>
            <th className="w-28 px-2 py-2 text-left">Unidad</th>
            <th className="w-40 px-2 py-2 text-left">Marca</th>
            <th className="px-2 py-2 text-left">Característica</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-plomo-100">
          {items.map((i, k) => (
            <tr key={i.id}>
              <td className="px-3 py-1.5 text-slate-400">{k + 1}</td>
              <td className="px-2 py-1.5">
                <Input value={i.nombre} onChange={(e) => set(i.id, "nombre", e.target.value)} placeholder="Ej: Rodamiento 6205" />
              </td>
              <td className="px-2 py-1.5">
                <Input type="number" min={0} step="any" value={i.cantidad || ""} onChange={(e) => set(i.id, "cantidad", parseFloat(e.target.value) || 0)} />
              </td>
              <td className="px-2 py-1.5">
                <Select value={i.unidad} onChange={(e) => set(i.id, "unidad", e.target.value)} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
              </td>
              <td className="px-2 py-1.5">
                <Input value={i.marca} onChange={(e) => set(i.id, "marca", e.target.value)} placeholder="SKF, 3M…" />
              </td>
              <td className="px-2 py-1.5">
                <Input value={i.caracteristica} onChange={(e) => set(i.id, "caracteristica", e.target.value)} placeholder="Medida, material, norma…" />
              </td>
              <td className="px-2 py-1.5">
                <button
                  onClick={() => onChange(items.length > 1 ? items.filter((x) => x.id !== i.id) : [itemVacio()])}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Eliminar fila"
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-3">
        <Button variant="secondary" size="sm" onClick={() => onChange([...items, itemVacio()])}>
          <Plus size={14} /> Agregar producto
        </Button>
      </div>
    </div>
  );
}
/** Edita un REQ PENDIENTE o corrige uno OBSERVADO: los mismos campos que "Nuevo requerimiento", precargados. */
export function EditarReq({ req, rol, onClose }: { req: Requerimiento; rol: Rol; onClose: () => void }) {
  const [sede, setSede] = useState(req.sede);
  const [solicitante, setSolicitante] = useState(req.solicitante);
  const [fecha, setFecha] = useState(req.fecha);
  const [motivo, setMotivo] = useState(req.motivo);
  const [items, setItems] = useState<ItemReq[]>(req.items.length ? req.items : [itemVacio()]);
  const observado = req.estado === "OBSERVADO";

  const guardar = () => {
    const ok = observado
      ? ejecutar(() => reenviarRequerimiento(req.id, { sede, solicitante, motivo, items }, rol), `${req.numero} reenviado a Tesorería`)
      : ejecutar(() => editarRequerimiento(req.id, { sede, solicitante, fecha, motivo, items }, rol), `${req.numero} actualizado`);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${observado ? "Corregir" : "Editar"} ${req.numero}`} wide>
      {observado && (
        <div className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <b>Observación de Tesorería:</b> {req.observacion}
        </div>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Field label="Sede *">
          <Select value={sede} onChange={(e) => setSede(e.target.value)} options={SEDES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Solicitante *">
          <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={observado} />
        </Field>
        <Field label="Motivo *" className="md:col-span-3">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </div>
      <ItemsEditor items={items} onChange={setItems} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar}>
          {observado ? <Send size={15} /> : <Pencil size={15} />} {observado ? "Reenviar a Tesorería" : "Guardar cambios"}
        </Button>
      </div>
    </Modal>
  );
}
