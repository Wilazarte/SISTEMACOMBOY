"use client";

import { useMemo, useState } from "react";
import { Ban, Building2, CheckCircle2, FileDown, FilePlus2, HandCoins, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar } from "@/components/ui";
import {
  MEDIOS_PAGO_CONTRATISTA,
  TIPOS_COMPROBANTE,
  TIPOS_SERVICIO,
  agregarComprobante,
  anularConcesion,
  calcularSaldo,
  concesionVacia,
  eliminarConcesion,
  facturado,
  guardarConcesion,
  liquidarConcesion,
  pagado,
  quitarComprobante,
  registrarPago,
} from "@/lib/contratistas";
import { SEDES } from "@/lib/empresa";
import { pdfContratoConcesion } from "@/lib/pdf";
import { KEYS, fechaPE, hoy, r2, rucValido, soles, useStore } from "@/lib/storage";
import type { ComprobanteContratista, ConcesionContratista, PagoContratista, TipoServicioContratista } from "@/lib/types";

const OPC_TIPO = (Object.keys(TIPOS_SERVICIO) as TipoServicioContratista[]).map((k) => ({ value: k, label: TIPOS_SERVICIO[k] }));
const OPC_SEDE = SEDES.map((s) => ({ value: s, label: s }));

/** Planilla › Contratistas / concesiones: servicios externos dados a terceros. */
export function Contratistas({ soloLectura }: { soloLectura: boolean }) {
  const lista = useStore<ConcesionContratista[]>(KEYS.CONTRATISTAS, []);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("ACTIVO");
  const [form, setForm] = useState<ConcesionContratista | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null); // id de la concesión con pagos / comprobantes abiertos

  const visibles = useMemo(
    () => lista.filter((c) => (!filtroTipo || c.tipoServicio === filtroTipo) && (!filtroSede || c.sede === filtroSede) && (!filtroEstado || c.estado === filtroEstado)),
    [lista, filtroTipo, filtroSede, filtroEstado]
  );
  const activos = lista.filter((c) => c.estado === "ACTIVO");
  const sel = lista.find((c) => c.id === detalle) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
          Concesiones activas: <b>{activos.length}</b>
          <p className="text-xs text-slate-500">{lista.length} registradas en total</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
          Contratado (activas): <b>{soles(r2(activos.reduce((s, c) => s + c.monto_total, 0)))}</b>
          <p className="text-xs text-slate-500">Pagado {soles(r2(activos.reduce((s, c) => s + pagado(c), 0)))}</p>
        </div>
        <div className="rounded-xl bg-slate-900 p-3 text-sm text-white">
          Saldo por pagar: <b className="text-amber-400">{soles(r2(activos.reduce((s, c) => s + calcularSaldo(c), 0)))}</b>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Contratistas / concesiones"
          subtitle="Servicios externos: asesorías, trámites, construcción, implementación de equipos y sistemas, servicios básicos…"
          action={
            !soloLectura && (
              <Button variant="warning" onClick={() => setForm(concesionVacia())} className="px-5 py-2.5">
                <Plus size={18} /> Registrar concesión
              </Button>
            )
          }
        />
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
          <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} placeholder="Todos los servicios" options={OPC_TIPO} className="w-56" />
          <Select value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)} placeholder="Todas las sedes" options={OPC_SEDE} className="w-56" />
          <Select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            placeholder="Todos los estados"
            options={["ACTIVO", "FINALIZADO", "ANULADO"].map((s) => ({ value: s, label: s }))}
            className="w-44"
          />
        </div>
        {visibles.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Building2 size={28} />} text={lista.length ? "Ninguna concesión coincide con los filtros." : "Aún no hay concesiones registradas."} />
          </div>
        ) : (
          <Table head={["Contratista", "Servicio", "Sede", "Vigencia", "Monto", "Pagado", "Saldo", "Estado", "Acciones"]}>
            {visibles.map((c) => (
              <tr key={c.id} className={cn("hover:bg-slate-50", c.estado === "ANULADO" && "opacity-60")}>
                <Td>
                  <p className="font-semibold text-slate-900">{c.razonSocial}</p>
                  <p className="text-xs text-slate-500">
                    {c.ruc ? `RUC ${c.ruc}` : "Sin RUC"}
                    {c.representante ? ` · ${c.representante}` : ""}
                  </p>
                </Td>
                <Td>
                  <p className="font-medium">{TIPOS_SERVICIO[c.tipoServicio] ?? c.tipoServicio}</p>
                  <p className="max-w-[220px] truncate text-xs text-slate-500" title={c.descripcion}>
                    {c.descripcion}
                  </p>
                </Td>
                <Td>{c.sede || "-"}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {fechaPE(c.fecha_inicio)}
                  <br />
                  {c.fecha_fin ? `al ${fechaPE(c.fecha_fin)}` : "—"}
                </Td>
                <Td className="text-right font-semibold">{soles(c.monto_total)}</Td>
                <Td className="text-right text-emerald-700">{soles(pagado(c))}</Td>
                <Td className={cn("text-right font-bold", calcularSaldo(c) > 0 ? "text-red-600" : "text-emerald-700")}>{soles(calcularSaldo(c))}</Td>
                <Td>
                  <Badge estado={c.estado} />
                  <p className="mt-1 text-[11px] text-slate-500">{c.comprobantes.length} comprobante(s)</p>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setDetalle(c.id)} title="Pagos y comprobantes">
                      <Wallet size={14} /> Pagos
                    </Button>
                    {!soloLectura && c.estado === "ACTIVO" && (
                      <Button size="sm" variant="ghost" onClick={() => setForm({ ...c })} title="Editar">
                        <Pencil size={14} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => pdfContratoConcesion(c, TIPOS_SERVICIO[c.tipoServicio] ?? c.tipoServicio)} title="Contrato PDF">
                      <FileDown size={14} />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {form && <FormConcesion form={form} onChange={setForm} onClose={() => setForm(null)} />}
      {sel && <PagosConcesion c={sel} soloLectura={soloLectura} onClose={() => setDetalle(null)} />}
    </div>
  );
}

function FormConcesion({ form, onChange, onClose }: { form: ConcesionContratista; onChange: (c: ConcesionContratista) => void; onClose: () => void }) {
  const set = <K extends keyof ConcesionContratista>(k: K, v: ConcesionContratista[K]) => onChange({ ...form, [k]: v });
  const rucMal = form.ruc.length === 11 && !rucValido(form.ruc);
  return (
    <Modal open onClose={onClose} title={form.id ? "Editar concesión" : "Registrar concesión"} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ejecutar(() => guardarConcesion(form), form.id ? "Concesión actualizada" : "Concesión registrada")) onClose();
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Razón social / nombre *" className="lg:col-span-2">
          <Input value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} autoFocus />
        </Field>
        <Field label="RUC / DNI" hint={rucMal ? "⚠ Dígito verificador inválido" : undefined}>
          <Input
            value={form.ruc}
            maxLength={11}
            inputMode="numeric"
            onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))}
            className={cn(form.ruc.length === 11 && (rucMal ? "border-red-400" : "border-emerald-400"))}
          />
        </Field>
        <Field label="Representante">
          <Input value={form.representante} onChange={(e) => set("representante", e.target.value)} />
        </Field>
        <Field label="Celular">
          <Input value={form.celular} inputMode="tel" onChange={(e) => set("celular", e.target.value)} />
        </Field>
        <Field label="Tipo de servicio *">
          <Select value={form.tipoServicio} onChange={(e) => set("tipoServicio", e.target.value as TipoServicioContratista)} options={OPC_TIPO} />
        </Field>
        <Field label="Descripción del servicio *" className="sm:col-span-2 lg:col-span-3">
          <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej: Instalación de sistema de cámaras en Taller Principal" />
        </Field>
        <Field label="Sede">
          <Select value={form.sede} onChange={(e) => set("sede", e.target.value)} placeholder="—" options={OPC_SEDE} />
        </Field>
        <Field label="Fecha de inicio *">
          <Input type="date" value={form.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} />
        </Field>
        <Field label="Fecha de fin">
          <Input type="date" value={form.fecha_fin} onChange={(e) => set("fecha_fin", e.target.value)} />
        </Field>
        <Field label="Monto total (S/) *">
          <Input type="number" min={0} step="0.01" value={form.monto_total || ""} onChange={(e) => set("monto_total", parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Adelanto (S/)">
          <Input type="number" min={0} step="0.01" value={form.adelanto || ""} onChange={(e) => set("adelanto", parseFloat(e.target.value) || 0)} />
        </Field>
        <div className="flex flex-col justify-center rounded-lg bg-slate-50 px-3 text-sm">
          Saldo: <b className="text-lg text-slate-900">{soles(calcularSaldo(form))}</b>
        </div>
        <Field label="Observaciones" className="sm:col-span-2 lg:col-span-3">
          <Textarea value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="warning" className="px-6">
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PagosConcesion({ c, soloLectura, onClose }: { c: ConcesionContratista; soloLectura: boolean; onClose: () => void }) {
  const [comp, setComp] = useState<ComprobanteContratista>({ tipo: "RH", numero: "", monto: 0, fecha: hoy() });
  const [pago, setPago] = useState<PagoContratista>({ fecha: hoy(), monto: 0, medio: "TRANSFERENCIA" });
  const [motivo, setMotivo] = useState("");
  const saldo = calcularSaldo(c);
  const activa = c.estado === "ACTIVO" && !soloLectura;

  return (
    <Modal open onClose={onClose} title={`${c.razonSocial} · ${TIPOS_SERVICIO[c.tipoServicio] ?? ""}`} wide>
      <div className="space-y-4 text-sm">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            Monto: <b>{soles(c.monto_total)}</b>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
            Pagado: <b>{soles(pagado(c))}</b>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-red-700">
            Saldo: <b>{soles(saldo)}</b>
          </div>
          <div className="rounded-lg bg-sky-50 p-3 text-sky-800">
            Comprobantes: <b>{soles(facturado(c))}</b>
          </div>
        </div>

        {/* Pagos */}
        <section className="rounded-xl border border-slate-200">
          <h4 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 font-semibold text-slate-800">
            <HandCoins size={16} className="text-emerald-600" /> Pagos
          </h4>
          <table className="w-full">
            <tbody>
              <tr className="border-b">
                <td className="px-4 py-2">{fechaPE(c.fecha_inicio)}</td>
                <td className="px-4 py-2">Adelanto</td>
                <td className="px-4 py-2 text-right font-semibold">{soles(c.adelanto || 0)}</td>
              </tr>
              {(c.pagos ?? []).map((p, i) => (
                <tr key={i} className="border-b">
                  <td className="px-4 py-2">{fechaPE(p.fecha)}</td>
                  <td className="px-4 py-2">
                    {p.medio}
                    {p.nota ? ` · ${p.nota}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">{soles(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {activa && saldo > 0 && (
            <div className="flex flex-wrap items-end gap-2 p-4">
              <Field label="Fecha">
                <Input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} />
              </Field>
              <Field label="Monto">
                <Input type="number" min={0} step="0.01" value={pago.monto || ""} onChange={(e) => setPago({ ...pago, monto: parseFloat(e.target.value) || 0 })} className="w-32" />
              </Field>
              <Field label="Medio">
                <Select value={pago.medio} onChange={(e) => setPago({ ...pago, medio: e.target.value })} options={MEDIOS_PAGO_CONTRATISTA.map((m) => ({ value: m, label: m }))} />
              </Field>
              <Button variant="success" onClick={() => ejecutar(() => registrarPago(c.id, pago), "Pago registrado") && setPago({ ...pago, monto: 0 })}>
                <Plus size={16} /> Registrar pago
              </Button>
              <Button
                variant="warning"
                onClick={() => confirm(`¿Pagar el saldo de ${soles(saldo)} y finalizar la concesión?`) && ejecutar(() => liquidarConcesion(c.id, pago.medio, pago.fecha), "Concesión liquidada")}
              >
                <CheckCircle2 size={16} /> Liquidar / pagar saldo
              </Button>
            </div>
          )}
          {activa && saldo === 0 && (
            <div className="p-4">
              <Button variant="success" onClick={() => ejecutar(() => liquidarConcesion(c.id, pago.medio), "Concesión finalizada")}>
                <CheckCircle2 size={16} /> Marcar como finalizada
              </Button>
            </div>
          )}
        </section>

        {/* Comprobantes */}
        <section className="rounded-xl border border-slate-200">
          <h4 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 font-semibold text-slate-800">
            <Receipt size={16} className="text-sky-600" /> Comprobantes (RH / factura)
          </h4>
          {c.comprobantes.length === 0 ? (
            <p className="px-4 py-3 text-slate-500">Sin comprobantes.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {c.comprobantes.map((x, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-2">{fechaPE(x.fecha)}</td>
                    <td className="px-4 py-2">
                      {TIPOS_COMPROBANTE[x.tipo]} <b>{x.numero}</b>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{soles(x.monto)}</td>
                    <td className="w-10 px-2">
                      {activa && (
                        <button onClick={() => confirm(`¿Quitar ${x.numero}?`) && ejecutar(() => quitarComprobante(c.id, i), "Comprobante quitado")} className="text-red-500" aria-label="Quitar">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activa && (
            <div className="flex flex-wrap items-end gap-2 p-4">
              <Field label="Tipo">
                <Select value={comp.tipo} onChange={(e) => setComp({ ...comp, tipo: e.target.value as ComprobanteContratista["tipo"] })} options={Object.entries(TIPOS_COMPROBANTE).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Número">
                <Input value={comp.numero} onChange={(e) => setComp({ ...comp, numero: e.target.value.toUpperCase() })} placeholder="E001-123" className="w-36" />
              </Field>
              <Field label="Monto">
                <Input type="number" min={0} step="0.01" value={comp.monto || ""} onChange={(e) => setComp({ ...comp, monto: parseFloat(e.target.value) || 0 })} className="w-32" />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={comp.fecha} onChange={(e) => setComp({ ...comp, fecha: e.target.value })} />
              </Field>
              <Button variant="secondary" onClick={() => ejecutar(() => agregarComprobante(c.id, comp), "Comprobante registrado") && setComp({ ...comp, numero: "", monto: 0 })}>
                <FilePlus2 size={16} /> Agregar comprobante
              </Button>
            </div>
          )}
        </section>

        {c.observaciones && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-slate-600">{c.observaciones}</p>}

        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            {activa && (
              <>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de anulación" className="w-56" />
                <Button variant="danger" onClick={() => ejecutar(() => anularConcesion(c.id, motivo), "Concesión anulada") && onClose()}>
                  <Ban size={16} /> Anular
                </Button>
              </>
            )}
            {!soloLectura && pagado(c) === 0 && c.comprobantes.length === 0 && (
              <Button variant="ghost" onClick={() => confirm("¿Eliminar esta concesión?") && ejecutar(() => eliminarConcesion(c.id), "Concesión eliminada") && onClose()}>
                <Trash2 size={16} className="text-red-600" /> Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => pdfContratoConcesion(c, TIPOS_SERVICIO[c.tipoServicio] ?? c.tipoServicio)}>
              <FileDown size={16} /> Contrato PDF
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
