"use client";

import { useEffect, useState } from "react";
import { Ban, FilePlus2, FileText, Printer, Send, Trash2, Truck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar, ejecutarAsync } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { pdfComprobanteVenta, pdfTicketVenta } from "@/lib/pdf";
import { KEYS, fechaPE, hoy, previewNumero, puede, r2, soles, useRol, useStore } from "@/lib/storage";
import {
  SERIE,
  despachoVacio,
  anularComprobante,
  eliminarBorrador,
  emitirComprobante,
  estadoEntrega,
  formaDeCondicion,
  guardarBorrador,
  lineaVacia,
  sumarDias,
  tipoLabel,
  totalesVenta,
  type DatosComprobante,
} from "@/lib/ventas";
import type { ComprobanteVenta, FormaPagoVenta, NotaPedido, OrdenDespacho, TipoComprobanteVenta } from "@/lib/types";
import { CUENTAS_COBRO, DatosDespachoForm, LineasEditor, SelectorCliente, TotalesVenta, useVentas } from "./comun";

type Filtro = "TODOS" | TipoComprobanteVenta;

const datosVacios = (): DatosComprobante => ({
  tipo: "FACTURA",
  fecha: hoy(),
  clienteId: "",
  items: [lineaVacia()],
  conIgv: true,
  descuento: 0,
  formaPago: "CONTADO",
  condPagoId: "",
  diasCredito: 0,
  nCuotas: 2,
  inicial: 0,
  lugarEntrega: "",
  despacho: despachoVacio(),
});

export function Comprobantes({ preNp, onListo }: { preNp?: string; onListo: () => void }) {
  const [rol] = useRol();
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const { clientes, condiciones, stock } = useVentas();
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [form, setForm] = useState<DatosComprobante | null>(null);
  const [borradorId, setBorradorId] = useState<string | undefined>();
  const [cobro, setCobro] = useState<{ medio: "CAJA" | "BANCO"; cuenta: string }>({ medio: "CAJA", cuenta: CUENTAS_COBRO[0] });
  const [anular, setAnular] = useState<ComprobanteVenta | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const habilitado = puede(rol, "venta.gestionar");
  const vendedor = getSesion()?.usuario ?? "";
  const aprobadas = notas.filter((n) => n.estado === "APROBADA");

  const desdeNP = (npId: string, base: DatosComprobante): DatosComprobante => {
    const np = notas.find((n) => n.id === npId);
    if (!np) return { ...base, npId: undefined };
    const cliente = clientes.find((c) => c.id === np.clienteId);
    const cond = condiciones.find((c) => c.id === np.condPagoId);
    return {
      ...base,
      npId,
      tipo: cliente?.tipoDoc === "RUC" ? "FACTURA" : "BOLETA",
      clienteId: np.clienteId,
      items: np.items.map((l) => ({ ...l })),
      conIgv: cliente?.tipoDoc === "RUC" ? true : np.conIgv,
      descuento: np.descuento,
      condPagoId: np.condPagoId,
      // Los días que se pactaron en la nota de pedido (crédito / personalizado)
      formaPago: formaDeCondicion(cond, np.diasCredito ?? cond?.dias ?? 0),
      diasCredito: np.diasCredito ?? cond?.dias ?? 0,
      lugarEntrega: np.lugarObra,
    };
  };

  // Facturar desde una Nota de Pedido aprobada (botón Facturar)
  useEffect(() => {
    if (preNp && habilitado) {
      setBorradorId(undefined);
      setForm(desdeNP(preNp, datosVacios()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preNp]);

  const npConOD = form?.npId ? notas.find((n) => n.id === form.npId && n.odId) : undefined;
  const t = form ? totalesVenta(form.items, form.tipo === "FACTURA" ? true : form.conIgv, form.descuento) : null;
  const cond = condiciones.find((c) => c.id === form?.condPagoId);

  const elegirCondicion = (id: string) => {
    if (!form) return;
    const c = condiciones.find((x) => x.id === id);
    const forma: FormaPagoVenta = formaDeCondicion(c);
    setForm({
      ...form,
      condPagoId: id,
      formaPago: forma === "CONTADO" ? "CONTADO" : form.formaPago === "CREDITO_CUOTAS" ? "CREDITO_CUOTAS" : "CREDITO",
      diasCredito: c?.dias ?? 0,
      inicial: c && t ? r2((t.total * c.porcentajeInicial) / 100) : 0,
    });
  };

  const cerrar = () => {
    setForm(null);
    setBorradorId(undefined);
    onListo();
  };

  const accion = async (emitir: boolean) => {
    if (!form) return;
    setEnviando(true);
    const ok = emitir
      ? await ejecutarAsync(
          () => emitirComprobante(form, vendedor, rol, cobro, borradorId),
          "Comprobante emitido: asiento contable y orden de despacho generados"
        )
      : ejecutar(() => guardarBorrador(form, vendedor, rol, borradorId), "Borrador guardado");
    setEnviando(false);
    if (ok) cerrar();
  };

  const abrirBorrador = (c: ComprobanteVenta) => {
    setBorradorId(c.id);
    setForm({
      tipo: c.tipo === "BOLETA" ? "BOLETA" : "FACTURA",
      fecha: c.fecha,
      clienteId: c.clienteId,
      npId: c.npId,
      items: c.items,
      conIgv: c.conIgv,
      descuento: c.descuento,
      formaPago: c.formaPago,
      condPagoId: c.condPagoId,
      diasCredito: c.diasCredito,
      nCuotas: c.cuotas.length || 2,
      inicial: c.inicial,
      lugarEntrega: c.lugarEntrega,
      despacho: c.despacho ?? despachoVacio(),
    });
  };

  const lista = comprobantes.filter((c) => filtro === "TODOS" || c.tipo === filtro);

  return (
    <Card>
      <CardHeader
        title="Comprobantes de venta"
        subtitle="Al emitir: asiento contable + Orden de Despacho en Almacén + cobro (contado) o Cuentas por Cobrar (crédito)."
        action={
          habilitado && (
            <Button variant="warning" onClick={() => { setBorradorId(undefined); setForm(datosVacios()); }}>
              <FilePlus2 size={16} /> Nuevo comprobante
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-1 border-b border-plomo-100 px-5 py-2">
        {(["TODOS", "FACTURA", "BOLETA", "NOTA_CREDITO", "NOTA_DEBITO"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", filtro === f ? "bg-azul-900 text-white" : "text-plomo-600 hover:bg-plomo-100")}
          >
            {f === "TODOS" ? "Todos" : tipoLabel[f]}
          </button>
        ))}
      </div>
      <Table head={["Fecha", "Serie-Número", "Cliente", "NP origen", "Base", "IGV", "Total", "Condición", "Saldo", "Estado", "SUNAT", "Entrega", "Acciones"]} empty={lista.length === 0}>
        {lista.map((c) => (
          <tr key={c.id} className="hover:bg-plomo-50">
            <Td>{fechaPE(c.fecha)}</Td>
            <Td className="font-semibold text-azul-900">
              {c.numero || <span className="text-slate-400">{c.serie}-(borrador)</span>}
              <p className="text-xs font-normal text-plomo-500">{tipoLabel[c.tipo]}</p>
            </Td>
            <Td>
              <p className="font-medium text-azul-900">{c.cliente}</p>
              <p className="text-xs text-plomo-500">{c.clienteDoc}</p>
            </Td>
            <Td>{c.npNumero ?? "-"}</Td>
            <Td className="text-right">{soles(c.base)}</Td>
            <Td className="text-right">{soles(c.igv)}</Td>
            <Td className="text-right font-semibold">{soles(c.total)}</Td>
            <Td>
              <Badge estado={c.formaPago} />
            </Td>
            <Td className={cn("text-right", c.saldo > 0 && c.estado === "EMITIDO" && "font-semibold text-red-600")}>{c.estado === "EMITIDO" ? soles(c.saldo) : "-"}</Td>
            <Td>
              <Badge estado={c.estado} />
            </Td>
            <Td>
              <Badge estado={c.estadoSunat} />
            </Td>
            <Td>{estadoEntrega(c, ods) === "-" ? "-" : <Badge estado={estadoEntrega(c, ods)} />}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => pdfComprobanteVenta(c)} title="PDF A4">
                  <FileText size={14} /> A4
                </Button>
                <Button size="sm" variant="ghost" onClick={() => pdfTicketVenta(c)} title="Ticket 80 mm">
                  <Printer size={14} />
                </Button>
                {habilitado && c.estado === "BORRADOR" && (
                  <>
                    <Button size="sm" variant="warning" onClick={() => abrirBorrador(c)}>
                      <Send size={14} /> Emitir
                    </Button>
                    <Button size="sm" variant="ghost" title="Eliminar borrador" onClick={() => confirm("¿Eliminar el borrador?") && ejecutar(() => eliminarBorrador(c.id), "Borrador eliminado")}>
                      <Trash2 size={14} className="text-red-600" />
                    </Button>
                  </>
                )}
                {habilitado && c.estado === "EMITIDO" && (
                  <Button size="sm" variant="ghost" title="Anular" onClick={() => { setMotivo(""); setAnular(c); }}>
                    <Ban size={14} className="text-red-600" />
                  </Button>
                )}
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      <Modal open={!!form} onClose={cerrar} title={borradorId ? "Emitir comprobante (borrador)" : "Nuevo comprobante"} wide>
        {form && t && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Tipo *">
                <Select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as "FACTURA" | "BOLETA", clienteId: "" })}
                  options={[{ value: "FACTURA", label: "Factura" }, { value: "BOLETA", label: "Boleta de venta" }]}
                />
              </Field>
              <Field label="Serie / número" hint="Correlativo automático al emitir">
                <Input value={previewNumero(SERIE[form.tipo])} disabled className="font-mono" />
              </Field>
              <Field label="Fecha emisión">
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </Field>
              <Field label="Nota de pedido vinculada">
                <Select
                  value={form.npId ?? ""}
                  onChange={(e) => setForm(e.target.value ? desdeNP(e.target.value, form) : { ...form, npId: undefined })}
                  placeholder="(sin NP — creación libre)"
                  options={aprobadas.map((n) => ({ value: n.id, label: `${n.numero} · ${n.cliente} · ${soles(n.total)}` }))}
                />
              </Field>
              <Field label={form.tipo === "FACTURA" ? "Cliente (solo RUC) *" : "Cliente *"} className="md:col-span-2">
                <SelectorCliente clientes={clientes} value={form.clienteId} onChange={(id) => setForm({ ...form, clienteId: id })} soloRuc={form.tipo === "FACTURA"} />
              </Field>
              <Field label="Lugar de entrega" className="md:col-span-2">
                <Input value={form.lugarEntrega} onChange={(e) => setForm({ ...form, lugarEntrega: e.target.value })} placeholder="Para la orden de despacho" />
              </Field>
              <Field label="Condición de pago *">
                <Select value={form.condPagoId} onChange={(e) => elegirCondicion(e.target.value)} placeholder="Seleccione…" options={condiciones.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nombre }))} />
              </Field>
              <Field label="Forma de pago">
                <Select
                  value={form.formaPago}
                  onChange={(e) => setForm({ ...form, formaPago: e.target.value as FormaPagoVenta })}
                  options={[
                    { value: "CONTADO", label: "Contado" },
                    { value: "CREDITO", label: "Crédito" },
                    { value: "CREDITO_CUOTAS", label: "Crédito en cuotas" },
                  ]}
                />
              </Field>
              {form.formaPago !== "CONTADO" && (
                <>
                  <Field label="Días de crédito" hint={cond?.contraentrega ? "Contraentrega: 0 = al entregar" : undefined}>
                    <Input type="number" min={0} value={form.diasCredito || ""} onChange={(e) => setForm({ ...form, diasCredito: parseInt(e.target.value) || 0 })} />
                  </Field>
                  <Field label="Vencimiento">
                    <Input value={fechaPE(sumarDias(form.fecha, form.diasCredito))} disabled />
                  </Field>
                  <Field label="Inicial S/" hint={cond?.porcentajeInicial ? `${cond.porcentajeInicial}% según la condición` : undefined}>
                    <Input type="number" min={0} step="0.01" value={form.inicial || ""} onChange={(e) => setForm({ ...form, inicial: parseFloat(e.target.value) || 0 })} />
                  </Field>
                  {form.formaPago === "CREDITO_CUOTAS" && (
                    <Field label="N° de cuotas" hint={`${soles(r2((t.total - form.inicial) / Math.max(form.nCuotas, 1)))} c/u aprox.`}>
                      <Input type="number" min={2} value={form.nCuotas || ""} onChange={(e) => setForm({ ...form, nCuotas: parseInt(e.target.value) || 0 })} />
                    </Field>
                  )}
                </>
              )}
              {(form.formaPago === "CONTADO" || form.inicial > 0) && (
                <Field label={form.formaPago === "CONTADO" ? "Cobro al contado en" : "Inicial cobrada en"}>
                  <Select
                    value={cobro.cuenta}
                    onChange={(e) => setCobro({ cuenta: e.target.value, medio: e.target.value.startsWith("Caja") ? "CAJA" : "BANCO" })}
                    options={CUENTAS_COBRO.map((c) => ({ value: c, label: c }))}
                  />
                </Field>
              )}
            </div>
            {npConOD ? (
              <div className="flex items-center gap-2 rounded-xl border border-plomo-200 bg-plomo-50 px-4 py-3 text-sm text-azul-900">
                <Truck size={16} /> Despacho: la orden <b>{npConOD.odNumero}</b> se generó al aprobar {npConOD.numero} y queda vinculada a este comprobante.
              </div>
            ) : (
              <DatosDespachoForm
                value={form.despacho ?? despachoVacio()}
                onChange={(despacho) => setForm({ ...form, despacho })}
                direccionCliente={(() => {
                  const c = clientes.find((x) => x.id === form.clienteId);
                  return form.lugarEntrega || c?.direccionesEntrega[0] || c?.direccionFiscal || "";
                })()}
              />
            )}
            <LineasEditor items={form.items} onChange={(items) => setForm({ ...form, items })} stock={stock} />
            <div className="flex flex-wrap items-start gap-4">
              <div className="space-y-3">
                {form.tipo === "BOLETA" ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.conIgv} onChange={(e) => setForm({ ...form, conIgv: e.target.checked })} /> Boleta con IGV 18 %
                  </label>
                ) : (
                  <p className="text-sm text-plomo-600">Factura: operación gravada, IGV 18 %.</p>
                )}
                <Field label="Descuento S/">
                  <Input type="number" min={0} step="0.01" value={form.descuento || ""} onChange={(e) => setForm({ ...form, descuento: parseFloat(e.target.value) || 0 })} className="w-40" />
                </Field>
              </div>
              <TotalesVenta items={form.items} conIgv={form.tipo === "FACTURA" ? true : form.conIgv} descuento={form.descuento} />
            </div>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Estado SUNAT: el comprobante queda como NO ENVIADO. El ERP aún no está conectado a un OSE/PSE de facturación electrónica.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-plomo-100 pt-4">
              <Button variant="secondary" onClick={cerrar}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={() => accion(false)} disabled={enviando}>
                Guardar borrador
              </Button>
              <Button variant="warning" onClick={() => accion(true)} disabled={enviando}>
                <Send size={16} /> {enviando ? "Emitiendo…" : "Guardar y emitir"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!anular} onClose={() => setAnular(null)} title={`Anular ${anular?.numero ?? ""}`}>
        <p className="mb-3 text-sm text-plomo-600">Se anula también su orden de despacho (si aún no se despachó) y se registra el asiento de reversión. Los cobros ya registrados no se revierten.</p>
        <Field label="Motivo">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAnular(null)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => anular && ejecutar(() => anularComprobante(anular.id, motivo, rol), `${anular.numero} anulado`) && setAnular(null)}>
            Anular comprobante
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

