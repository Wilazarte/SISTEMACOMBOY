"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Ban, CheckCircle2, ClipboardCheck, FileText, HandCoins, PackageCheck, Truck, Wrench } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { BotonNuevo } from "@/components/ui/BotonFiltros";
import { FirmaPad } from "@/components/FirmaPad";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { fechaPE, r2, soles } from "@/lib/storage";
import { pdfGuiaEntrega, pdfVentaSucursal } from "@/lib/pdf";
import {
  MOTIVOS_DERIVACION,
  cerrarVenta,
  cobrarVenta,
  crearTraslado,
  derivarVenta,
  entregarVenta,
  esTaller,
  faltantes,
  operaSucursal,
  prepararDerivacion,
  registrarVenta,
  type ClienteSuc,
  type Derivacion,
  type FormaPagoSuc,
  type MotivoDerivacion,
  type StockLocal,
  type Sucursal,
  type TipoDocVenta,
  type VentaSucursal,
} from "@/lib/sucursal";
import { Acciones, EstadoSuc, LineasEditor, deLineas, lineaVacia, type LineaEdit } from "./comun";

// =====================================================================
// 1. REGISTRAR VENTA: tabla de ventas + formulario rápido (oculto hasta "+ Nueva venta / entrega")
// =====================================================================
export function RegistrarVenta({
  ventas,
  stock,
  clientes,
  sucursal,
  abrirNueva,
  onDerivar,
  onEntregar,
}: {
  ventas: VentaSucursal[];
  stock: StockLocal[];
  clientes: ClienteSuc[];
  sucursal: Sucursal;
  abrirNueva?: boolean;
  onDerivar: (ventaId: string) => void;
  onEntregar: (ventaId: string) => void;
}) {
  const { showForm, setShowForm } = useTogglePanel();
  const opera = operaSucursal();
  useEffect(() => {
    if (abrirNueva && opera) setShowForm(true);
  }, [abrirNueva, opera, setShowForm]);
  const total = r2(ventas.reduce((a, v) => a + v.total, 0));

  const filas: FilaDoc[] = ventas.map((v) => ({
    id: v.id,
    fecha: v.fecha,
    contraparte: v.cliente,
    buscar: `${v.numero} ${v.docRef} ${v.clienteDoc ?? ""} ${v.lineas.map((l) => l.producto).join(" ")}`,
    tipoDoc: v.tipoDoc,
    estado: v.estado,
    subFecha: !v.pagado ? <span className="text-rojo">Por cobrar</span> : undefined,
    ref: (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-fg">{v.docRef}</span>
        <span className="flex items-center gap-1">
          <EstadoSuc estado={v.estado} />
          {v.requiereTraslado && v.estado === "registrada" && <span className="text-[11px] text-amber-500">sin stock local</span>}
        </span>
      </div>
    ),
    total: soles(v.total),
    acciones: (
      <Acciones>
        <Button size="sm" variant="ghost" onClick={() => pdfVentaSucursal(v, sucursal.nombre)} title="Ver PDF">
          <FileText size={14} /> PDF
        </Button>
        {opera && v.estado === "registrada" && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onEntregar(v.id)}>
              <PackageCheck size={14} /> Entregar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onDerivar(v.id)}>
              <ArrowRightLeft size={14} /> Derivar
            </Button>
          </>
        )}
        {opera && !v.pagado && (
          <Button size="sm" variant="secondary" onClick={() => confirm(`¿Registrar el cobro de ${soles(v.total)} de ${v.cliente}? Entra a caja chica.`) && ejecutar(() => cobrarVenta(v.id), "Cobro registrado en caja chica")}>
            <HandCoins size={14} /> Cobrar
          </Button>
        )}
        {v.entrega?.guia && (
          <Button size="sm" variant="ghost" onClick={() => pdfGuiaEntrega(v, sucursal.nombre)} title="Guía de entrega">
            <Truck size={14} /> Guía
          </Button>
        )}
        {opera && v.estado === "entregada" && v.pagado && (
          <Button size="sm" variant="ghost" onClick={() => ejecutar(() => cerrarVenta(v.id), `${v.numero} cerrada`)} title="Cerrar venta">
            <CheckCircle2 size={14} /> Cerrar
          </Button>
        )}
      </Acciones>
    ),
  }));

  return (
    <div className="space-y-4">
      {showForm && opera && (
        <FormVenta
          stock={stock}
          clientes={clientes}
          onCancelar={() => setShowForm(false)}
          onRegistrada={(v) => {
            setShowForm(false);
            if (v.estado === "registrada" && v.requiereTraslado && confirm(`${v.numero} quedó por entregar: no hay stock local de todo.\n¿Derivarla ahora al Taller Principal?`)) onDerivar(v.id);
          }}
        />
      )}
      <Card>
        <CardHeader
          title="Ventas registradas de Sucursal"
          subtitle={`${ventas.length} venta(s) · Total ${soles(total)}`}
          action={opera ? <BotonNuevo abierto={showForm} onClick={() => setShowForm(!showForm)} label="Nueva venta / entrega" /> : undefined}
        />
        <ListaDocs filas={filas} tipo="sucursal" />
      </Card>
    </div>
  );
}

function FormVenta({ stock, clientes, onCancelar, onRegistrada }: { stock: StockLocal[]; clientes: ClienteSuc[]; onCancelar: () => void; onRegistrada: (v: VentaSucursal) => void }) {
  const [clienteId, setClienteId] = useState("");
  const [cliente, setCliente] = useState("");
  const [doc, setDoc] = useState("");
  const [tipoDoc, setTipoDoc] = useState<TipoDocVenta>("BV");
  const [formaPago, setFormaPago] = useState<FormaPagoSuc>("CONTADO");
  const [lineas, setLineas] = useState<LineaEdit[]>([lineaVacia()]);
  const [entrega, setEntrega] = useState<"inmediata" | "pendiente">("inmediata");
  const [obs, setObs] = useState("");
  const [guardando, setGuardando] = useState(false);

  const datos = deLineas(lineas);
  const sinStock = faltantes(datos, stock) > 0;
  useEffect(() => {
    if (sinStock) setEntrega("pendiente");
  }, [sinStock]);

  const elegirCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      setCliente(c.nombre);
      setDoc(c.doc);
      setTipoDoc(c.doc.length === 11 ? "FA" : "BV");
    }
  };

  const guardar = async () => {
    setGuardando(true);
    let venta: VentaSucursal | undefined;
    const ok = await ejecutarAsync(async () => {
      venta = await registrarVenta({ cliente, clienteId: clienteId || undefined, clienteDoc: doc, tipoDoc, formaPago, lineas: datos, entregaInmediata: entrega === "inmediata", observacion: obs });
    }, "Venta registrada");
    setGuardando(false);
    if (ok && venta) {
      toast(`${venta.docRef} · ${soles(venta.total)} · ${venta.estado === "entregada" ? "entregada y descontada del stock" : "por entregar"}`);
      onRegistrada(venta);
    }
  };

  return (
    <Card>
      <CardHeader title="Registrar venta" subtitle="Genera VTA-XXX-2026 (FA / BV), descuenta el stock local o la deja por entregar" />
      <div className="grid gap-4 p-5 md:grid-cols-4">
        {clientes.length > 0 && (
          <Field label="Cliente registrado" className="md:col-span-2">
            <Select value={clienteId} onChange={(e) => elegirCliente(e.target.value)} placeholder="— Cliente nuevo / varios —" options={clientes.map((c) => ({ value: c.id, label: `${c.nombre}${c.doc ? ` · ${c.doc}` : ""}` }))} />
          </Field>
        )}
        <Field label="Cliente *" className="md:col-span-2">
          <Input value={cliente} onChange={(e) => (setCliente(e.target.value), setClienteId(""))} placeholder="Nombre o razón social" />
        </Field>
        <Field label={tipoDoc === "FA" ? "RUC *" : "DNI / RUC"}>
          <Input value={doc} onChange={(e) => setDoc(e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder={tipoDoc === "FA" ? "11 dígitos" : "Opcional"} />
        </Field>
        <Field label="Comprobante">
          <Select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDocVenta)} options={[{ value: "BV", label: "BV · Boleta" }, { value: "FA", label: "FA · Factura" }]} />
        </Field>
        <Field label="Forma de pago">
          <Select value={formaPago} onChange={(e) => setFormaPago(e.target.value as FormaPagoSuc)} options={[{ value: "CONTADO", label: "Contado (entra a caja chica)" }, { value: "CREDITO", label: "Crédito (por cobrar)" }]} />
        </Field>
        <Field label="Entrega">
          <Select
            value={entrega}
            onChange={(e) => setEntrega(e.target.value as "inmediata" | "pendiente")}
            options={[
              { value: "inmediata", label: "En el acto (descuenta stock)" },
              { value: "pendiente", label: "Por entregar" },
            ]}
            disabled={sinStock}
          />
        </Field>
        <div className="md:col-span-4">
          <p className="mb-1.5 text-xs font-medium text-plomo-600">Productos (precio con IGV)</p>
          <LineasEditor lineas={lineas} onChange={setLineas} stock={stock} />
          {sinStock && <p className="mt-2 text-xs text-amber-500">Hay productos sin stock local suficiente: la venta queda por entregar y puede derivarla al Taller Principal.</p>}
        </div>
        <Field label="Observación" className="md:col-span-4">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        </Field>
        <div className="flex justify-end gap-2 md:col-span-4">
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            <ClipboardCheck size={15} /> {guardando ? "Registrando…" : "Registrar venta"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// =====================================================================
// 2. ENTREGAR PRODUCTO: ventas pendientes, entrega con firma del cliente y guía de entrega local
// =====================================================================
export function EntregarProducto({ ventas, stock, sucursal, preVenta }: { ventas: VentaSucursal[]; stock: StockLocal[]; sucursal: Sucursal; preVenta?: string }) {
  const opera = operaSucursal();
  const pendientes = ventas.filter((v) => v.estado === "registrada" || v.estado === "derivada");
  const entregadas = ventas.filter((v) => v.entrega?.guia).slice(0, 10);
  const [sel, setSel] = useState<VentaSucursal | null>(null);
  useEffect(() => {
    const v = preVenta ? ventas.find((x) => x.id === preVenta && x.estado === "registrada") : undefined;
    if (v && opera) setSel(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preVenta]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Ventas pendientes de entrega" subtitle={`${pendientes.length} venta(s) · las derivadas se entregan al recibir el traslado`} />
        <Table head={["Fecha", "Venta", "Cliente", "Productos", "Stock local", "Total", "Acciones"]} empty={pendientes.length === 0}>
          {pendientes.map((v) => {
            const falta = faltantes(v.lineas, stock);
            return (
              <tr key={v.id}>
                <Td>{fechaPE(v.fecha)}</Td>
                <Td>
                  <span className="font-semibold text-fg">{v.docRef}</span>
                  <div>
                    <EstadoSuc estado={v.estado} />
                  </div>
                </Td>
                <Td className="max-w-[220px] truncate">{v.cliente}</Td>
                <Td className="max-w-[260px] truncate" >{v.lineas.map((l) => `${l.cantidad} ${l.unidad} ${l.producto}`).join(" · ")}</Td>
                <Td>{falta ? <span className="text-amber-500">Falta {falta} ítem(s)</span> : <span className="text-emerald-400">Completo</span>}</Td>
                <Td className="text-right font-semibold">{soles(v.total)}</Td>
                <Td>
                  {opera && v.estado === "registrada" ? (
                    <Button size="sm" onClick={() => setSel(v)} disabled={falta > 0} title={falta ? "Sin stock local: derive al Taller o espere el traslado" : "Entregar con firma"}>
                      <PackageCheck size={14} /> Entregar
                    </Button>
                  ) : (
                    <span className="text-xs text-plomo-500">{v.estado === "derivada" ? "Esperando traslado" : "-"}</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Últimas entregas" subtitle="Guías de entrega local con firma del cliente" />
        <Table head={["Fecha", "Guía", "Venta", "Recibió", "Acciones"]} empty={entregadas.length === 0}>
          {entregadas.map((v) => (
            <tr key={v.id}>
              <Td>{fechaPE(v.entrega!.fecha)}</Td>
              <Td className="font-semibold text-fg">{v.entrega!.guia}</Td>
              <Td>{v.docRef}</Td>
              <Td>{v.entrega!.recibidoPor}</Td>
              <Td>
                <Button size="sm" variant="ghost" onClick={() => pdfGuiaEntrega(v, sucursal.nombre)}>
                  <FileText size={14} /> Guía PDF
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {sel && <ModalEntrega venta={sel} sucursal={sucursal} onClose={() => setSel(null)} />}
    </div>
  );
}

function ModalEntrega({ venta, sucursal, onClose }: { venta: VentaSucursal; sucursal: Sucursal; onClose: () => void }) {
  const [recibe, setRecibe] = useState(venta.cliente);
  const [dni, setDni] = useState("");
  const [firma, setFirma] = useState<string>();
  const [guardando, setGuardando] = useState(false);
  const entregar = async () => {
    setGuardando(true);
    let v: VentaSucursal | undefined;
    const ok = await ejecutarAsync(async () => {
      v = await entregarVenta(venta.id, { recibidoPor: recibe, dni, firma });
    }, "Producto entregado");
    setGuardando(false);
    if (ok && v) {
      pdfGuiaEntrega(v, sucursal.nombre);
      onClose();
    }
  };
  return (
    <Modal open onClose={onClose} title={`Entregar ${venta.docRef}`}>
      <div className="space-y-4">
        <ul className="rounded-lg border border-plomo-200 p-3 text-sm text-fg-2">
          {venta.lineas.map((l) => (
            <li key={l.id}>
              {l.cantidad} {l.unidad} · {l.producto}
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Recibe *">
            <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} />
          </Field>
          <Field label="DNI">
            <Input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" />
          </Field>
        </div>
        <FirmaPad onChange={(f) => setFirma(f?.url)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={entregar} disabled={guardando || !firma}>
            <PackageCheck size={15} /> {guardando ? "Entregando…" : "Entregar y generar guía"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// 3. DERIVAR A TALLER: "¿Qué necesita?" -> notificación al Taller Principal -> OT con guía
// =====================================================================
const ICONO_MOTIVO: Record<MotivoDerivacion, typeof Wrench> = { PRODUCTO_NO_DISPONIBLE: Ban, SERVICIO_ESPECIALIZADO: Wrench, EQUIPO: Truck };

export function DerivarTaller({ ventas, derivaciones, preVenta }: { ventas: VentaSucursal[]; derivaciones: Derivacion[]; preVenta?: string }) {
  const opera = operaSucursal();
  const taller = esTaller();
  const derivables = ventas.filter((v) => v.estado === "registrada");
  const [sel, setSel] = useState<VentaSucursal | null>(null);
  const [ot, setOt] = useState<Derivacion | null>(null);
  useEffect(() => {
    const v = preVenta ? ventas.find((x) => x.id === preVenta && x.estado === "registrada") : undefined;
    if (v && opera) setSel(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preVenta]);
  const orden = useMemo(() => [...derivaciones].sort((a, b) => Number(b.estado !== "convertida") - Number(a.estado !== "convertida") || b.fecha.localeCompare(a.fecha)), [derivaciones]);

  return (
    <div className="space-y-4">
      {opera && (
        <Card>
          <CardHeader title="Ventas que se pueden derivar" subtitle="Producto no disponible, servicio especializado o equipo: el Taller Principal lo prepara y lo envía con OT y guía de remisión" />
          <Table head={["Fecha", "Venta", "Cliente", "Productos", "Total", "Acción"]} empty={derivables.length === 0}>
            {derivables.map((v) => (
              <tr key={v.id}>
                <Td>{fechaPE(v.fecha)}</Td>
                <Td className="font-semibold text-fg">{v.docRef}</Td>
                <Td className="max-w-[220px] truncate">{v.cliente}</Td>
                <Td className="max-w-[260px] truncate">{v.lineas.map((l) => `${l.cantidad} ${l.producto}`).join(" · ")}</Td>
                <Td className="text-right font-semibold">{soles(v.total)}</Td>
                <Td>
                  <Button size="sm" onClick={() => setSel(v)}>
                    <ArrowRightLeft size={14} /> Derivar a Taller
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader title="Derivaciones al Taller Principal" subtitle={taller ? "Taller: marque en preparación y convierta en OT (Orden de Traslado) con guía de remisión hacia la sucursal" : "Estado de lo que pidió al Taller"} />
        <Table head={["Fecha", "Venta", "Cliente", "¿Qué necesita?", "Estado", "Acciones"]} empty={orden.length === 0}>
          {orden.map((d) => (
            <tr key={d.id}>
              <Td>{fechaPE(d.fecha)}</Td>
              <Td className="font-semibold text-fg">{d.ventaNumero}</Td>
              <Td className="max-w-[200px] truncate">{d.cliente}</Td>
              <Td className="max-w-[280px]">
                <span className="block">{MOTIVOS_DERIVACION[d.motivo]}</span>
                <span className="block truncate text-xs text-plomo-500">{d.detalle || d.productos.map((p) => `${p.cantidad} ${p.producto}`).join(" · ")}</span>
              </Td>
              <Td>
                <EstadoSuc estado={d.estado} />
              </Td>
              <Td>
                {taller && (d.estado === "pendiente" || d.estado === "en-preparacion") ? (
                  <Acciones>
                    {d.estado === "pendiente" && (
                      <Button size="sm" variant="secondary" onClick={() => ejecutar(() => prepararDerivacion(d.id), `${d.ventaNumero} en preparación`)}>
                        <Wrench size={14} /> En preparación
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setOt(d)}>
                      <Truck size={14} /> Convertir en OT
                    </Button>
                  </Acciones>
                ) : (
                  <span className="text-xs text-plomo-500">{d.estado === "convertida" ? "OT emitida (ver Traslados)" : d.estado === "pendiente" ? "Esperando al Taller" : "En preparación"}</span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {sel && <ModalDerivar venta={sel} onClose={() => setSel(null)} />}
      {ot && <ModalOT derivacion={ot} onClose={() => setOt(null)} />}
    </div>
  );
}

function ModalDerivar({ venta, onClose }: { venta: VentaSucursal; onClose: () => void }) {
  const [motivo, setMotivo] = useState<MotivoDerivacion | null>(null);
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const derivar = async () => {
    if (!motivo) return;
    setEnviando(true);
    const ok = await ejecutarAsync(() => derivarVenta(venta.id, motivo, detalle), `${venta.numero} derivada: el Taller Principal ya fue notificado`);
    setEnviando(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Derivar ${venta.docRef} a Taller`}>
      <div className="space-y-4">
        <p className="text-sm font-semibold text-fg">¿Qué necesita?</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(MOTIVOS_DERIVACION) as MotivoDerivacion[]).map((m) => {
            const Icon = ICONO_MOTIVO[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition",
                  motivo === m ? "border-[#2563eb] bg-[#1e40af]/30 text-white" : "border-plomo-200 text-fg-2 hover:border-slate-500"
                )}
              >
                <Icon size={22} />
                {MOTIVOS_DERIVACION[m]}
              </button>
            );
          })}
        </div>
        <Field label="Detalle para el Taller">
          <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Medidas, modelo, urgencia…" />
        </Field>
        <p className="text-xs text-plomo-500">Al derivar: la venta queda “Derivada · En preparación”, el Taller Principal recibe la notificación y puede convertirla en OT con guía de remisión hacia la sucursal.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={derivar} disabled={!motivo || enviando}>
            <ArrowRightLeft size={15} /> {enviando ? "Derivando…" : "Derivar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Taller: derivación -> OT + guía de remisión (con los productos de la venta). */
export function ModalOT({ derivacion, onClose }: { derivacion: Derivacion; onClose: () => void }) {
  const [transportista, setTransportista] = useState("");
  const [placa, setPlaca] = useState("");
  const [guardando, setGuardando] = useState(false);
  const emitir = async () => {
    setGuardando(true);
    const ok = await ejecutarAsync(
      () => crearTraslado({ productos: derivacion.productos, motivoTraslado: "Traslado entre establecimientos de la misma empresa", transportista, placa, derivacionId: derivacion.id }),
      "OT emitida con guía de remisión: ya aparece en Traslados de la sucursal"
    );
    setGuardando(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`OT para ${derivacion.ventaNumero}`}>
      <div className="space-y-4">
        <ul className="rounded-lg border border-plomo-200 p-3 text-sm text-fg-2">
          {derivacion.productos.map((p, i) => (
            <li key={i}>
              {p.cantidad} {p.unidad} · {p.producto}
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Transportista">
            <Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="Nombre / empresa" />
          </Field>
          <Field label="Placa">
            <Input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC-123" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={emitir} disabled={guardando}>
            <Truck size={15} /> {guardando ? "Emitiendo…" : "Emitir OT y guía"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
