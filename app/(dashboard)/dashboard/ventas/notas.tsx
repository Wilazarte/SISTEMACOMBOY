"use client";

import { useState } from "react";
import { Ban, Check, Copy, FileText, Plus, Receipt } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, ejecutar, ejecutarAsync } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { pdfNotaPedido } from "@/lib/pdf";
import { KEYS, fechaPE, hoy, puede, soles, useRol, useStore } from "@/lib/storage";
import { anularNP, aprobarNP, clienteVacio, clonarNP, crearNotaPedido, guardarCliente, lineaVacia, type DatosNP } from "@/lib/ventas";
import type { Cliente, NotaPedido } from "@/lib/types";
import { FormCliente, LineasEditor, SelectorCliente, TotalesVenta, useVentas } from "./comun";

const npVacia = (): DatosNP => ({
  fecha: hoy(),
  clienteId: "",
  condPagoId: "",
  validezDias: 15,
  fechaEntrega: "",
  lugarObra: "",
  items: [lineaVacia()],
  conIgv: true,
  descuento: 0,
  observaciones: "",
});

export function NotasPedido({ onFacturar }: { onFacturar: (npId: string) => void }) {
  const [rol] = useRol();
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const { clientes, condiciones, stock } = useVentas();
  const [form, setForm] = useState<DatosNP | null>(null);
  const [clienteRapido, setClienteRapido] = useState<Cliente | null>(null);
  const [anular, setAnular] = useState<NotaPedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const habilitado = puede(rol, "venta.gestionar");
  const vendedor = getSesion()?.usuario ?? "";
  const lista = notas.filter((n) => !filtro || n.estado === filtro);

  const elegirCliente = (id: string) => {
    const c = clientes.find((x) => x.id === id);
    setForm((f) => f && { ...f, clienteId: id, condPagoId: c?.condPagoId || f.condPagoId, lugarObra: f.lugarObra || c?.direccionesEntrega[0] || "" });
  };

  const guardar = async () => {
    if (!form) return;
    setEnviando(true);
    const ok = await ejecutarAsync(() => crearNotaPedido(form, vendedor, rol), "Nota de pedido registrada");
    setEnviando(false);
    if (ok) setForm(null);
  };

  const guardarClienteRapido = () => {
    if (!clienteRapido) return;
    let creado: Cliente | undefined;
    if (ejecutar(() => (creado = guardarCliente(clienteRapido)), "Cliente registrado")) {
      setClienteRapido(null);
      if (creado) elegirCliente(creado.id);
    }
  };

  const cliente = clientes.find((c) => c.id === form?.clienteId);

  return (
    <Card>
      <CardHeader
        title="Notas de pedido"
        subtitle="Cotización al cliente. Al aprobarla se habilita Facturar."
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Todos los estados"
              options={["PENDIENTE", "APROBADA", "FACTURADA", "ANULADA"].map((s) => ({ value: s, label: s }))}
              className="w-44"
            />
            {habilitado && (
              <Button variant="warning" onClick={() => setForm(npVacia())}>
                <Plus size={16} /> Nueva Nota Pedido
              </Button>
            )}
          </div>
        }
      />
      <Table head={["N° NP", "Fecha", "Cliente", "Total", "Condición pago", "Estado", "Vendedor", "Acciones"]} empty={lista.length === 0}>
        {lista.map((n) => (
          <tr key={n.id} className="hover:bg-slate-50">
            <Td className="font-semibold text-slate-900">{n.numero}</Td>
            <Td>{fechaPE(n.fecha)}</Td>
            <Td>
              <p className="font-medium text-slate-900">{n.cliente}</p>
              <p className="text-xs text-slate-500">{n.clienteDoc}</p>
            </Td>
            <Td className="text-right font-semibold">{soles(n.total)}</Td>
            <Td>{n.condPagoNombre}</Td>
            <Td>
              <Badge estado={n.estado} />
            </Td>
            <Td>{n.vendedor}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => pdfNotaPedido(n)} title="PDF cotización">
                  <FileText size={14} /> PDF
                </Button>
                {habilitado && n.estado === "PENDIENTE" && (
                  <Button size="sm" variant="success" onClick={() => ejecutar(() => aprobarNP(n.id, rol), `${n.numero} aprobada`)}>
                    <Check size={14} /> Aprobar
                  </Button>
                )}
                {habilitado && n.estado === "APROBADA" && (
                  <Button size="sm" variant="warning" onClick={() => onFacturar(n.id)}>
                    <Receipt size={14} /> Facturar
                  </Button>
                )}
                {habilitado && (
                  <Button size="sm" variant="ghost" title="Clonar" onClick={() => ejecutarAsync(() => clonarNP(n.id, vendedor, rol), "Nota de pedido clonada")}>
                    <Copy size={14} />
                  </Button>
                )}
                {habilitado && (n.estado === "PENDIENTE" || n.estado === "APROBADA") && (
                  <Button size="sm" variant="ghost" title="Anular" onClick={() => { setMotivo(""); setAnular(n); }}>
                    <Ban size={14} className="text-red-600" />
                  </Button>
                )}
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      <Modal open={!!form} onClose={() => setForm(null)} title="Nueva nota de pedido" wide>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Cliente (RUC / DNI) *" className="md:col-span-2">
                <SelectorCliente clientes={clientes} value={form.clienteId} onChange={elegirCliente} onNuevo={() => setClienteRapido(clienteVacio())} />
              </Field>
              <Field label="Vendedor">
                <Input value={vendedor} disabled />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </Field>
              <Field label="Fecha de entrega">
                <Input type="date" value={form.fechaEntrega} onChange={(e) => setForm({ ...form, fechaEntrega: e.target.value })} />
              </Field>
              <Field label="Validez de la oferta (días) *">
                <Input type="number" min={1} value={form.validezDias || ""} onChange={(e) => setForm({ ...form, validezDias: parseInt(e.target.value) || 0 })} />
              </Field>
              <Field label="Lugar de obra" className="md:col-span-2">
                <Input value={form.lugarObra} list="obras-cliente" onChange={(e) => setForm({ ...form, lugarObra: e.target.value })} />
                <datalist id="obras-cliente">
                  {(cliente?.direccionesEntrega ?? []).map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              <Field label="Condición de pago *">
                <Select
                  value={form.condPagoId}
                  onChange={(e) => setForm({ ...form, condPagoId: e.target.value })}
                  placeholder={condiciones.length ? "Seleccione…" : "Configure condiciones de pago"}
                  options={condiciones.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nombre }))}
                />
              </Field>
            </div>
            <LineasEditor items={form.items} onChange={(items) => setForm({ ...form, items })} stock={stock} />
            <div className="flex flex-wrap items-start gap-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.conIgv} onChange={(e) => setForm({ ...form, conIgv: e.target.checked })} /> Agregar IGV 18 %
                </label>
                <Field label="Descuento S/">
                  <Input type="number" min={0} step="0.01" value={form.descuento || ""} onChange={(e) => setForm({ ...form, descuento: parseFloat(e.target.value) || 0 })} className="w-40" />
                </Field>
              </div>
              <Field label="Observaciones" className="min-w-[240px] flex-1">
                <Textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              </Field>
              <TotalesVenta items={form.items} conIgv={form.conIgv} descuento={form.descuento} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button variant="warning" onClick={guardar} disabled={enviando}>
                {enviando ? "Guardando…" : "Guardar nota de pedido"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!clienteRapido} onClose={() => setClienteRapido(null)} title="Registro rápido de cliente">
        {clienteRapido && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              guardarClienteRapido();
            }}
            className="space-y-4"
          >
            <FormCliente form={clienteRapido} onChange={setClienteRapido} condiciones={condiciones} rapido />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setClienteRapido(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="warning">
                Guardar cliente
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!anular} onClose={() => setAnular(null)} title={`Anular ${anular?.numero ?? ""}`}>
        <Field label="Motivo">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAnular(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => anular && ejecutar(() => anularNP(anular.id, motivo, rol), `${anular.numero} anulada`) && setAnular(null)}>
            Anular
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
