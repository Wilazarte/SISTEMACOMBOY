"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, Eye, FileText, Paperclip, Plus, Trash2, Upload, Wrench, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import type { FilaDoc } from "@/components/ui/ListaDocs";
import { ProductoInput } from "@/components/productos/ProductoInput";
import {
  abrirArchivo,
  anularOrdenServicio,
  aprobarOrdenServicio,
  emitirOrdenServicio,
  fechaPE,
  hoy,
  puede,
  soles,
  totalesOS,
  uid,
  validarVoucher,
  type DatosOrdenServicio,
} from "@/lib/storage";
import { SEDES, UNIDADES } from "@/lib/empresa";
import { pdfOrdenServicio } from "@/lib/pdf";
import type { Factura, FormaPago, ItemServicio, OrdenServicio, Proveedor, Requerimiento, Rol } from "@/lib/types";

// =====================================================================
// ÓRDENES DE SERVICIO (OS-001-2026)
// Clon de la Orden de Compra para servicios: mismo formulario y misma lista (Tesorería › Órdenes, filtro
// Tipo doc. OC / OS). No toca el flujo de la OC: no bancariza, no factura ni ingresa a almacén.
// =====================================================================

const FORMAS_PAGO: FormaPago[] = ["CONTADO", "CREDITO 15 DIAS", "CREDITO 30 DIAS", "CREDITO 60 DIAS", "ADELANTO 50%"];
const UNIDADES_OS = ["SERV", ...UNIDADES, "HORA", "DIA", "MES", "GLB"];

type Linea = Omit<ItemServicio, "subtotal">;
const lineaVacia = (): Linea => ({ id: uid(), descripcion: "", cantidad: 1, unidad: "SERV", precioUnit: 0 });

/** Origen preseleccionado al llegar con "Generar OS" desde un REQ o un gasto. */
export interface PreOS {
  reqId?: string;
  gastoId?: string;
}

/** OS vigente (no anulada) por REQ / gasto: no se genera dos veces desde el mismo origen. */
const conOS = (os: OrdenServicio[], campo: "reqId" | "gastoId", id: string) => os.some((o) => o.estado !== "ANULADA" && o[campo] === id);

/** Formulario "Generar OS desde Requerimiento / Gasto" (o a mano). */
export function FormOrdenServicio({
  rol,
  reqs,
  gastos,
  proveedores,
  ordenesServicio,
  pre,
  onClose,
}: {
  rol: Rol;
  /** Requerimientos (pendientes y procesados): se ofrecen primero los de tipo SERVICIO. */
  reqs: Requerimiento[];
  /** Gastos de Tesorería. */
  gastos: Factura[];
  proveedores: Proveedor[];
  ordenesServicio: OrdenServicio[];
  pre?: PreOS;
  onClose: () => void;
}) {
  const habilitado = puede(rol, "oc.crear");
  const [origen, setOrigen] = useState<DatosOrdenServicio["origen"]>(pre?.gastoId ? "GASTO" : pre?.reqId ? "REQUERIMIENTO" : "REQUERIMIENTO");
  const [reqId, setReqId] = useState(pre?.reqId ?? "");
  const [gastoId, setGastoId] = useState(pre?.gastoId ?? "");
  const [verBienes, setVerBienes] = useState(false);
  const [fecha, setFecha] = useState(hoy());
  const [proveedor, setProveedor] = useState("");
  const [ruc, setRuc] = useState("");
  const [concepto, setConcepto] = useState("");
  const [formaPago, setFormaPago] = useState<FormaPago>("CONTADO");
  const [plazo, setPlazo] = useState("");
  const [lugar, setLugar] = useState("");
  const [observacion, setObservacion] = useState("");
  const [conIgv, setConIgv] = useState(true);
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [adjunto, setAdjunto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const adjRef = useRef<HTMLInputElement>(null);

  // Un REQ una sola vez (puede estar en pendientes y en procesados) y sin OS vigente
  const reqsDisponibles = useMemo(() => {
    const vistos = new Set<string>();
    return reqs
      .filter((r) => !vistos.has(r.id) && vistos.add(r.id) && r.estado !== "FINALIZADO" && !conOS(ordenesServicio, "reqId", r.id))
      .filter((r) => verBienes || r.tipo === "SERVICIO" || r.id === reqId)
      .sort((a, b) => Number(b.tipo === "SERVICIO") - Number(a.tipo === "SERVICIO") || b.fecha.localeCompare(a.fecha));
  }, [reqs, ordenesServicio, verBienes, reqId]);
  const gastosDisponibles = useMemo(
    () => gastos.filter((g) => g.tipoGasto !== "PLANILLA" && (g.id === gastoId || !conOS(ordenesServicio, "gastoId", g.id))),
    [gastos, ordenesServicio, gastoId]
  );
  const req = reqs.find((r) => r.id === reqId);
  const gasto = gastos.find((g) => g.id === gastoId);

  // Al elegir el origen se precargan los datos (se pueden corregir antes de emitir)
  useEffect(() => {
    if (origen !== "REQUERIMIENTO" || !req) return;
    setConcepto(req.motivo);
    setLugar(req.sede);
    setLineas(
      req.items.length
        ? req.items.map((i) => ({
            id: uid(),
            descripcion: [i.nombre, i.caracteristica].filter((x) => x?.trim()).join(" - "),
            cantidad: i.cantidad,
            unidad: i.unidad || "SERV",
            precioUnit: 0,
            ...(i.productoId ? { productoId: i.productoId, sku: i.sku } : {}),
          }))
        : [lineaVacia()]
    );
  }, [origen, req]);
  useEffect(() => {
    if (origen !== "GASTO" || !gasto) return;
    setProveedor(gasto.proveedor);
    setRuc(gasto.ruc);
    setFecha(gasto.fecha.slice(0, 10));
    setConcepto(gasto.descripcion ?? "");
    setConIgv(gasto.igv > 0);
    setLineas([{ id: uid(), descripcion: gasto.descripcion || "Servicio", cantidad: 1, unidad: "SERV", precioUnit: gasto.igv > 0 ? gasto.subtotal : gasto.total }]);
  }, [origen, gasto]);

  const elegirProveedor = (nombre: string) => {
    setProveedor(nombre);
    const p = proveedores.find((x) => x.razonSocial.toLowerCase() === nombre.trim().toLowerCase());
    if (p) setRuc(p.ruc);
  };
  const setLinea = (id: string, cambio: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...cambio } : l)));
  const tot = totalesOS(lineas, conIgv);

  const cargarAdjunto = (file?: File) => {
    if (adjRef.current) adjRef.current.value = "";
    if (!file) return;
    try {
      validarVoucher(file);
      setAdjunto(file);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Archivo no válido", "error");
    }
  };

  const guardar = async () => {
    setEnviando(true);
    const ok = await ejecutarAsync(
      () =>
        emitirOrdenServicio(
          {
            fecha,
            proveedor,
            ruc,
            concepto,
            formaPago,
            plazo,
            lugarServicio: lugar,
            observacion: observacion.trim() || undefined,
            origen,
            ...(origen === "REQUERIMIENTO" && req ? { reqId: req.id, reqNumero: req.numero } : {}),
            ...(origen === "GASTO" && gasto ? { gastoId: gasto.id, gastoNumero: gasto.codigo ?? gasto.numero } : {}),
            items: lineas,
            conIgv,
          },
          adjunto,
          rol
        ),
      "Orden de servicio emitida · pendiente de aprobación de Gerencia"
    );
    setEnviando(false);
    if (ok) onClose();
  };

  return (
    <Card>
      <CardHeader
        title="Emitir orden de servicio"
        subtitle={habilitado ? "Mismos datos que la OC. Se genera desde un REQUERIMIENTO tipo SERVICIO, un GASTO de Tesorería o a mano." : "Solo lectura: solo Tesorería y Creador pueden emitir órdenes de servicio."}
        action={
          <Button size="sm" variant="ghost" onClick={onClose} title="Cerrar formulario">
            <X size={15} /> Cancelar
          </Button>
        }
      />
      <fieldset disabled={!habilitado} className="min-w-0">
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Field label="Origen del dato">
            <Select
              value={origen}
              onChange={(e) => setOrigen(e.target.value as DatosOrdenServicio["origen"])}
              options={[
                { value: "REQUERIMIENTO", label: "Requerimiento (tipo SERVICIO)" },
                { value: "GASTO", label: "Tesorería › Gasto" },
                { value: "MANUAL", label: "Registro directo" },
              ]}
            />
          </Field>
          {origen === "REQUERIMIENTO" && (
            <Field label="Requerimiento" className="md:col-span-2" hint={verBienes ? undefined : "Solo REQ tipo SERVICIO sin OS"}>
              <div className="flex gap-2">
                <Select
                  value={reqId}
                  onChange={(e) => setReqId(e.target.value)}
                  placeholder={reqsDisponibles.length ? "Seleccione el REQ…" : "No hay requerimientos de servicio disponibles"}
                  options={reqsDisponibles.map((r) => ({ value: r.id, label: `${r.numero}${r.tipo === "SERVICIO" ? " · SERVICIO" : ""} · ${r.sede} · ${r.motivo.slice(0, 60)}` }))}
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-plomo-600">
                  <input type="checkbox" checked={verBienes} onChange={(e) => setVerBienes(e.target.checked)} /> Ver todos
                </label>
              </div>
            </Field>
          )}
          {origen === "GASTO" && (
            <Field label="Gasto de Tesorería" className="md:col-span-2">
              <Select
                value={gastoId}
                onChange={(e) => setGastoId(e.target.value)}
                placeholder={gastosDisponibles.length ? "Seleccione el gasto…" : "No hay gastos disponibles"}
                options={gastosDisponibles.map((g) => ({ value: g.id, label: `${g.codigo ?? g.numero} · ${g.proveedor} · ${fechaPE(g.fecha)} · ${soles(g.total)}` }))}
              />
            </Field>
          )}
          {origen === "MANUAL" && <div className="md:col-span-2" />}

          <Field label="Proveedor *" className="md:col-span-2">
            <Input value={proveedor} onChange={(e) => elegirProveedor(e.target.value)} list="os-proveedores" placeholder="Razón social" />
            <datalist id="os-proveedores">
              {proveedores.map((p) => (
                <option key={p.id} value={p.razonSocial}>
                  {p.ruc}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="RUC">
            <Input value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="11 dígitos" inputMode="numeric" />
          </Field>
          <Field label="Fecha OS">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Cond. de pago">
            <Select value={formaPago} onChange={(e) => setFormaPago(e.target.value as FormaPago)} options={FORMAS_PAGO.map((f) => ({ value: f, label: f }))} />
          </Field>
          <Field label="Plazo de ejecución">
            <Input value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="Ej: 3 días hábiles" />
          </Field>
          <Field label="Concepto *" className="md:col-span-2">
            <Textarea value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Mantenimiento correctivo del remolcador U35" />
          </Field>
          <Field label="Lugar del servicio">
            <Input value={lugar} onChange={(e) => setLugar(e.target.value)} list="os-sedes" />
            <datalist id="os-sedes">
              {SEDES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>

        {/* Detalle: servicios en texto libre o productos del catálogo maestro */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
              <tr>
                <th className="w-8 px-3 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Detalle del servicio *</th>
                <th className="w-24 px-2 py-2 text-left">Cant. *</th>
                <th className="w-28 px-2 py-2 text-left">Und.</th>
                <th className="w-32 px-2 py-2 text-left">P. Unit. (sin IGV)</th>
                <th className="w-28 px-2 py-2 text-right">Importe</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-plomo-100">
              {lineas.map((l, k) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 text-slate-400">{k + 1}</td>
                  <td className="px-2 py-1.5">
                    <ProductoInput
                      value={l.descripcion}
                      modulo="Tesorería · Orden de servicio"
                      placeholder="Describa el servicio o busque en el catálogo…"
                      libre={() => true}
                      onChange={(descripcion, p) => setLinea(l.id, { descripcion, ...(p ? { productoId: p.id, sku: p.sku, unidad: p.unidad } : { productoId: undefined, sku: undefined }) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} step="any" value={l.cantidad || ""} onChange={(e) => setLinea(l.id, { cantidad: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={l.unidad} onChange={(e) => setLinea(l.id, { unidad: e.target.value })} options={Array.from(new Set([...UNIDADES_OS, l.unidad])).map((u) => ({ value: u, label: u }))} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} step="0.01" value={l.precioUnit || ""} onChange={(e) => setLinea(l.id, { precioUnit: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td className="px-2 py-1.5 text-right">{soles((l.cantidad || 0) * (l.precioUnit || 0))}</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [lineaVacia()]))}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Eliminar línea"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
              <Plus size={14} /> Agregar línea
            </Button>
            <label className="flex items-center gap-2 text-sm text-plomo-600">
              <input type="checkbox" checked={conIgv} onChange={(e) => setConIgv(e.target.checked)} /> Afecto a IGV 18%
            </label>
          </div>
        </div>

        <div className="flex justify-end px-5 py-3">
          <dl className="w-72 space-y-1 text-sm">
            <div className="flex justify-between text-plomo-600">
              <dt>Subtotal</dt>
              <dd>{soles(tot.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-plomo-600">
              <dt>IGV 18%</dt>
              <dd>{soles(tot.igv)}</dd>
            </div>
            <div className="flex justify-between rounded-lg bg-azul-900 px-3 py-2 font-bold text-white">
              <dt>TOTAL</dt>
              <dd>{soles(tot.total)}</dd>
            </div>
          </dl>
        </div>

        <div className="mx-5 mb-5 grid gap-4 rounded-xl border border-plomo-200 p-4 md:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Adjunto (cotización, contrato… JPG, PNG o PDF · máx. 5 MB)</span>
            <input ref={adjRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => cargarAdjunto(e.target.files?.[0])} />
            {adjunto ? (
              <div className="flex items-center gap-2 rounded-lg border border-plomo-200 bg-plomo-50 px-3 py-2 text-sm">
                <Paperclip size={14} className="text-plomo-500" />
                <span className="flex-1 break-all">{adjunto.name}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdjunto(null)} aria-label="Quitar adjunto">
                  <Trash2 size={14} className="text-red-600" />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => adjRef.current?.click()}>
                <Upload size={14} /> Subir adjunto
              </Button>
            )}
          </div>
          <Field label="Observación">
            <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>
      </fieldset>
      <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
        <Button onClick={guardar} disabled={!habilitado || enviando}>
          <Wrench size={16} /> {enviando ? "Emitiendo…" : "Emitir OS"}
        </Button>
      </div>
    </Card>
  );
}

/** Ver, PDF, adjunto, aprobar (Gerencia) y anular de una OS en la lista de Órdenes. */
function AccionesOS({ os, rol }: { os: OrdenServicio; rol: Rol }) {
  const [ver, setVer] = useState(false);
  const [anular, setAnular] = useState(false);
  const [motivo, setMotivo] = useState("");
  const puedeAprobar = puede(rol, "dj.aprobar") && os.estado === "PENDIENTE";
  const puedeAnular = os.estado !== "ANULADA" && (puede(rol, "dj.aprobar") || (puede(rol, "oc.crear") && os.estado === "PENDIENTE"));
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => setVer(true)} title="Ver detalle" aria-label="Ver">
        <Eye size={15} />
      </Button>
      <Button size="sm" variant="secondary" onClick={() => pdfOrdenServicio(os)}>
        <FileText size={14} /> Ver PDF
      </Button>
      {os.adjunto && (
        <Button size="sm" variant="ghost" onClick={() => abrirArchivo(os.adjunto!)} title={`Adjunto: ${os.adjuntoNombre ?? ""}`} aria-label="Ver adjunto">
          <Paperclip size={14} />
        </Button>
      )}
      {puedeAprobar && (
        <Button size="sm" variant="success" onClick={() => ejecutar(() => aprobarOrdenServicio(os.id, rol), `${os.numero} aprobada`)}>
          <Check size={14} /> Aprobar
        </Button>
      )}
      {puedeAnular && (
        <Button size="sm" variant="ghost" onClick={() => setAnular(true)} title="Anular OS" aria-label="Anular">
          <Ban size={14} className="text-red-600" />
        </Button>
      )}

      <Modal open={ver} onClose={() => setVer(false)} title={`Orden de servicio · ${os.numero}`} wide>
        <div className="space-y-4 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {(
              [
                ["Proveedor", `${os.proveedor}${os.ruc ? ` · RUC ${os.ruc}` : ""}`],
                ["Fecha", fechaPE(os.fecha)],
                ["Cond. de pago", os.formaPago],
                ["Plazo", os.plazo || "-"],
                ["Lugar del servicio", os.lugarServicio || "-"],
                ["Origen", os.origen === "REQUERIMIENTO" ? os.reqNumero : os.origen === "GASTO" ? `Gasto ${os.gastoNumero}` : "Registro directo"],
                ["Concepto", os.concepto],
                ["Estado", os.estado === "ANULADA" && os.motivoAnulacion ? `ANULADA · ${os.motivoAnulacion}` : os.estado],
              ] as [string, string | undefined][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-plomo-500">{k}</dt>
                <dd className="text-fg">{v || "-"}</dd>
              </div>
            ))}
          </dl>
          <Table head={["Detalle", "Cant.", "Und.", "P. Unit.", "Importe"]}>
            {os.items.map((i) => (
              <tr key={i.id}>
                <Td className="font-medium">{i.descripcion}</Td>
                <Td>{i.cantidad}</Td>
                <Td>{i.unidad}</Td>
                <Td className="text-right">{soles(i.precioUnit)}</Td>
                <Td className="text-right">{soles(i.subtotal)}</Td>
              </tr>
            ))}
          </Table>
          <p className="text-right">
            Subtotal {soles(os.subtotal)} · IGV {soles(os.igv)} · <b>Total {soles(os.total)}</b>
          </p>
          <ul className="space-y-1 border-t border-plomo-100 pt-3 text-xs text-plomo-600">
            {os.historial.map((h, k) => (
              <li key={k}>
                {fechaPE(h.fecha)} · {h.accion}
                {h.detalle ? ` · ${h.detalle}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal open={anular} onClose={() => setAnular(false)} title={`Anular · ${os.numero}`}>
        <div className="space-y-4 text-sm">
          <Field label="Motivo de la anulación *">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
            <Button variant="secondary" onClick={() => setAnular(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (ejecutar(() => anularOrdenServicio(os.id, motivo, rol), `${os.numero} anulada`)) setAnular(false);
              }}
            >
              <Ban size={14} /> Anular OS
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Filas de las OS para la lista de Órdenes (Tipo doc. "OS"; las OC van con "OC"). */
export function filasOrdenesServicio(lista: OrdenServicio[], rol: Rol): FilaDoc[] {
  return lista.map((o) => ({
    id: o.id,
    fecha: o.fecha,
    contraparte: o.proveedor,
    ref: (
      <>
        <span className="font-semibold text-fg">{o.numero}</span>
        <span className="ml-1.5 text-xs text-plomo-500">{o.reqNumero ?? o.gastoNumero ?? ""}</span>
        <span className="ml-2 inline-block align-middle">
          <Badge estado={o.estado} />
        </span>
      </>
    ),
    total: soles(o.total),
    acciones: <AccionesOS os={o} rol={rol} />,
    buscar: `${o.numero} ${o.reqNumero ?? ""} ${o.gastoNumero ?? ""} ${o.ruc} ${o.concepto} ${o.formaPago}`,
    tipoDoc: "OS",
    estado: o.estado,
  }));
}
