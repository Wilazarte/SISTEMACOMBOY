"use client";

import { useState } from "react";
import { Ban, CalendarClock, Check, Copy, FileText, Plus, Receipt, Truck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, ejecutar, ejecutarAsync } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { pdfNotaPedido } from "@/lib/pdf";
import { codigoDesdeNumero } from "@/lib/utils/codigos";
import { KEYS, fechaPE, hoy, puede, soles, useRol, useStore } from "@/lib/storage";
import { anularNP, aprobarNP, despachoVacio, faltaDespacho, estadoOD, generarDespachoNP, odDeNP, clienteVacio, clonarNP, crearNotaPedido, getCondicionesPago, guardarCliente, guardarCondicion, lineaVacia, pideDias, sumarDias, type DatosNP } from "@/lib/ventas";
import type { Cliente, CondicionPago, DatosDespacho, NotaPedido, OrdenDespacho } from "@/lib/types";
import { AvisoCondiciones, DatosDespachoForm, FormCliente, LineasEditor, SelectorCliente, TotalesVenta, useCargaCondiciones, useVentas } from "./comun";
import { FormCondicion, condVacia } from "./maestros";

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
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const { clientes, condiciones, stock } = useVentas();
  const [form, setForm] = useState<DatosNP | null>(null);
  const [clienteRapido, setClienteRapido] = useState<Cliente | null>(null);
  const [condRapida, setCondRapida] = useState<CondicionPago | null>(null);
  const carga = useCargaCondiciones(!!form); // se vuelve a leer de Supabase al abrir la nota de pedido
  const activas = condiciones.filter((c) => c.activo);
  const [anular, setAnular] = useState<NotaPedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [aprobar, setAprobar] = useState<{ np: NotaPedido; despacho: DatosDespacho } | null>(null);
  const habilitado = puede(rol, "venta.gestionar");
  const vendedor = getSesion()?.usuario ?? "";
  const lista = notas.filter((n) => !filtro || n.estado === filtro);

  /** Al cambiar la condición se proponen sus días (crédito) y se limpia el detalle (personalizado). */
  const conCondicion = (f: DatosNP, condPagoId: string): DatosNP => {
    const c = getCondicionesPago().find((x) => x.id === condPagoId);
    return { ...f, condPagoId, diasCredito: pideDias(c) ? c!.dias : undefined, condPagoDetalle: undefined };
  };

  const elegirCliente = (id: string) => {
    const c = clientes.find((x) => x.id === id);
    setForm((f) => {
      if (!f) return f;
      const conCliente = { ...f, clienteId: id, lugarObra: f.lugarObra || c?.direccionesEntrega[0] || "" };
      return c?.condPagoId && c.condPagoId !== f.condPagoId ? conCondicion(conCliente, c.condPagoId) : conCliente;
    });
  };

  const guardarCondRapida = () => {
    if (!condRapida) return;
    if (ejecutar(() => guardarCondicion(condRapida), "Condición de pago creada")) {
      const nueva = getCondicionesPago().find((c) => c.codigo === condRapida.codigo.trim().toUpperCase().replace(/\s+/g, ""));
      setCondRapida(null);
      if (nueva) setForm((f) => f && conCondicion(f, nueva.id));
    }
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
  const cond = condiciones.find((c) => c.id === form?.condPagoId);
  const diasNP = form?.diasCredito ?? cond?.dias ?? 0;

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
      <Table head={["N° NP", "Fecha", "Cliente", "Total", "Condición pago", "Estado", "Despacho", "Vendedor", "Acciones"]} empty={lista.length === 0}>
        {lista.map((n) => (
          <tr key={n.id} className="hover:bg-plomo-50">
            <Td className="font-semibold text-azul-900">{n.numero}</Td>
            <Td>{fechaPE(n.fecha)}</Td>
            <Td>
              <p className="font-medium text-azul-900">{n.cliente}</p>
              <p className="text-xs text-plomo-500">{n.clienteDoc}</p>
            </Td>
            <Td className="text-right font-semibold">{soles(n.total)}</Td>
            <Td>
              {n.condPagoNombre}
              {n.fechaVencimiento && (
                <p className="text-xs text-plomo-500">
                  {n.diasCredito} días · vence {fechaPE(n.fechaVencimiento)}
                </p>
              )}
              {n.condPagoDetalle && <p className="max-w-[200px] truncate text-xs text-plomo-500" title={n.condPagoDetalle}>{n.condPagoDetalle}</p>}
            </Td>
            <Td>
              <Badge estado={n.estado} />
            </Td>
            <Td>
              {(() => {
                const od = odDeNP(n, ods) ?? (n.odId ? ods.find((o) => o.id === n.odId) : undefined);
                return od ? (
                  <div>
                    <p className="font-mono text-xs font-semibold text-azul-900">{codigoDesdeNumero("OD", od.numero, od.fecha)}</p>
                    <Badge estado={estadoOD(od)} />
                  </div>
                ) : n.estado === "APROBADA" || n.estado === "FACTURADA" ? (
                  <span className="text-xs font-semibold text-vino">Sin orden</span>
                ) : (
                  "-"
                );
              })()}
            </Td>
            <Td>{n.vendedor}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => pdfNotaPedido(n)} title="PDF cotización">
                  <FileText size={14} /> PDF
                </Button>
                {habilitado && n.estado === "PENDIENTE" && (
                  <Button size="sm" variant="success" onClick={() => setAprobar({ np: n, despacho: n.despacho ?? { ...despachoVacio(), direccionDestino: n.lugarObra } })}>
                    <Check size={14} /> Aprobar
                  </Button>
                )}
                {habilitado && (n.estado === "APROBADA" || n.estado === "FACTURADA") && !odDeNP(n, ods) && (
                  <Button size="sm" variant="danger" title="Esta nota no tiene orden de despacho" onClick={() => setAprobar({ np: n, despacho: n.despacho ?? { ...despachoVacio(), direccionDestino: n.lugarObra } })}>
                    <Truck size={14} /> Generar despacho
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
                <div className="flex gap-2">
                  <Select
                    value={form.condPagoId}
                    onChange={(e) => setForm(conCondicion(form, e.target.value))}
                    placeholder={activas.length ? "Seleccione…" : carga.cargando ? "Cargando condiciones…" : "Configure condiciones de pago"}
                    options={activas.map((c) => ({ value: c.id, label: c.nombre }))}
                  />
                  <Button type="button" variant="secondary" onClick={() => setCondRapida(condVacia())} title="Nueva condición de pago">
                    <Plus size={16} />
                  </Button>
                </div>
                <AvisoCondiciones carga={carga} activas={activas.length} />
              </Field>
              {pideDias(cond) && (
                <>
                  <Field label={cond?.tipo === "CREDITO" ? "Días de crédito *" : "Días de plazo"} hint={cond?.tipo === "PERSONALIZADO" ? "0 = sin plazo" : undefined}>
                    <Input
                      type="number"
                      min={cond?.tipo === "CREDITO" ? 1 : 0}
                      max={365}
                      value={form.diasCredito ?? ""}
                      onChange={(e) => setForm({ ...form, diasCredito: e.target.value === "" ? undefined : parseInt(e.target.value) })}
                    />
                  </Field>
                  <Field label="Fecha de vencimiento" hint="Automática: fecha + días">
                    <div className="flex items-center gap-2 rounded-lg border border-plomo-200 bg-plomo-50 px-3 py-2 text-sm font-semibold text-azul-900">
                      <CalendarClock size={16} className="text-corp" />
                      {form.fecha && diasNP >= 0 ? fechaPE(sumarDias(form.fecha, diasNP)) : "-"}
                    </div>
                  </Field>
                  {cond?.tipo === "PERSONALIZADO" && (
                    <Field label="Detalle de la condición" className="md:col-span-3">
                      <Input
                        value={form.condPagoDetalle ?? ""}
                        onChange={(e) => setForm({ ...form, condPagoDetalle: e.target.value })}
                        placeholder="Ej: 50% adelanto, saldo a 20 días con letra"
                      />
                    </Field>
                  )}
                </>
              )}
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
            <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
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

      <Modal open={!!condRapida} onClose={() => setCondRapida(null)} title="Nueva condición de pago">
        {condRapida && <FormCondicion form={condRapida} onChange={setCondRapida} onCancel={() => setCondRapida(null)} onSave={guardarCondRapida} />}
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

      <Modal
        open={!!aprobar}
        onClose={() => setAprobar(null)}
        title={`${aprobar?.np.estado === "PENDIENTE" ? "Aprobar" : "Generar despacho"} ${aprobar?.np.numero ?? ""} · ${aprobar?.np.cliente ?? ""}`}
        wide
      >
        {aprobar && (
          <div className="space-y-4">
            <p className="text-sm text-plomo-600">
              Al aprobar se genera la <b>Orden de Despacho</b> y se notifica a Almacén. Indique dónde se entrega el pedido.
            </p>
            <DatosDespachoForm
              value={aprobar.despacho}
              onChange={(despacho) => setAprobar({ ...aprobar, despacho })}
              direccionCliente={(() => {
                const c = clientes.find((x) => x.id === aprobar.np.clienteId);
                return c?.direccionesEntrega[0] || c?.direccionFiscal || aprobar.np.lugarObra || "";
              })()}
            />
            <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
              <Button variant="secondary" onClick={() => setAprobar(null)}>
                Cancelar
              </Button>
              {faltaDespacho(aprobar.despacho) && <p className="mr-auto self-center text-xs text-vino">{faltaDespacho(aprobar.despacho)}</p>}
              <Button
                variant="success"
                disabled={enviando || !!faltaDespacho(aprobar.despacho)}
                onClick={async () => {
                  setEnviando(true);
                  const ok = await ejecutarAsync(async () => {
                    const pendiente = aprobar.np.estado === "PENDIENTE";
                    return pendiente ? aprobarNP(aprobar.np.id, aprobar.despacho, vendedor, rol) : generarDespachoNP(aprobar.np.id, aprobar.despacho, vendedor, rol);
                  }, `${aprobar.np.numero}: orden de despacho enviada a Almacén`);
                  setEnviando(false);
                  if (ok) setAprobar(null);
                }}
              >
                <Check size={16} /> {aprobar.np.estado === "PENDIENTE" ? "Aprobar y generar orden de despacho" : "Generar orden de despacho"}
              </Button>
            </div>
          </div>
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
