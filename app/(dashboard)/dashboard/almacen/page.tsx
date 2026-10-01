"use client";

import { useState } from "react";
import { Boxes, CheckCircle2, Truck, ClipboardList, Eye, FilePlus2, FileText, MessageSquareWarning, PackageCheck, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Tabs, Td, Textarea, cn, ejecutar, ejecutarAsync } from "@/components/ui";
import { abrirDoc } from "@/components/doc-viewer";
import { SEDES, UNIDADES } from "@/lib/empresa";
import {
  KEYS,
  crearRequerimiento,
  darVistoBueno,
  fechaPE,
  hoy,
  observarIngreso,
  puede,
  reenviarRequerimiento,
  sedeIngresoOC,
  soles,
  uid,
  useRol,
  useStore,
} from "@/lib/storage";
import { pdfActaIngreso, pdfRequerimiento } from "@/lib/pdf";
import type { EstadoReq, Factura, Guia, ItemReq, OrdenCompra, OrdenDespacho, Requerimiento, Rol, StockItem } from "@/lib/types";
import { OrdenesDespacho } from "./despacho";

type Tab = "nuevo" | "lista" | "ingresos" | "stock" | "despacho";

const itemVacio = (): ItemReq => ({ id: uid(), nombre: "", cantidad: 1, unidad: "UND", marca: "", caracteristica: "" });

export default function AlmacenPage() {
  const [rol] = useRol();
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const despachos = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const [tab, setTab] = useState<Tab>(puede(rol, "req.crear") ? "nuevo" : "lista");

 const todos = [...pendientes, ...procesados].sort((a, b) => (b.numero || "").localeCompare(a.numero || ""));
  const porVB = ordenes.filter((o) => o.estado === "EN_GUIA" && !guias.some((g) => g.ocId === o.id && g.estado === "OBSERVADA"));
  const observados = procesados.filter((r) => r.estado === "OBSERVADO").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Almacén</h1>
        <p className="text-sm text-slate-500">Emisión de requerimientos y visto bueno de ingreso de mercadería</p>
      </div>

      {observados > 0 && (
        <button onClick={() => setTab("lista")} className="flex w-full items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-5 py-3 text-left text-sm text-orange-800">
          <MessageSquareWarning size={18} /> Tiene {observados} requerimiento(s) OBSERVADO(s) por Tesorería. Corríjalos y reenvíe.
        </button>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "nuevo", label: "Nuevo requerimiento", icon: <FilePlus2 size={16} /> },
          { id: "lista", label: "Requerimientos emitidos", icon: <ClipboardList size={16} />, count: observados },
          { id: "ingresos", label: "Ingresos por V°B°", icon: <PackageCheck size={16} />, count: porVB.length },
          { id: "stock", label: "Stock", icon: <Boxes size={16} /> },
          {
            id: "despacho",
            label: "Órdenes de despacho",
            icon: <Truck size={16} />,
            count: despachos.filter((o) => o.estado === "PENDIENTE" || o.estado === "EN_PREPARACION").length,
          },
        ]}
      />

      {tab === "nuevo" && <NuevoReq rol={rol} onCreado={() => setTab("lista")} />}
      {tab === "lista" && <ListaReq reqs={todos} rol={rol} />}
      {tab === "ingresos" && <Ingresos rol={rol} porVB={porVB} ordenes={ordenes} facturas={facturas} guias={guias} />}
      {tab === "stock" && <Stock stock={stock} />}
      {tab === "despacho" && <OrdenesDespacho />}
    </div>
  );
}

// =====================================================================
// Editor de productos (reutilizado en nuevo y corrección)
// =====================================================================
function ItemsEditor({ items, onChange }: { items: ItemReq[]; onChange: (i: ItemReq[]) => void }) {
  const set = (id: string, campo: keyof ItemReq, v: string | number) => onChange(items.map((i) => (i.id === id ? { ...i, [campo]: v } : i)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
        <tbody className="divide-y divide-slate-100">
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

// =====================================================================
// NUEVO REQUERIMIENTO
// =====================================================================
function NuevoReq({ rol, onCreado }: { rol: Rol; onCreado: () => void }) {
  const [sede, setSede] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  const [items, setItems] = useState<ItemReq[]>([itemVacio()]);
  const [enviando, setEnviando] = useState(false);
  const contadores = useStore<Record<string, number>>(KEYS.CONTADORES, {});
  const proximo = `REQ-ALM-${String((contadores.REQ ?? 0) + 1).padStart(3, "0")}`;

  if (!puede(rol, "req.crear"))
    return <Empty icon={<FilePlus2 size={28} />} text="Su rol no puede emitir requerimientos. Cambie a ALMACÉN o GERENCIA." />;

  const guardar = async () => {
    setEnviando(true);
    let numero = "";
    const ok = await ejecutarAsync(async () => {
      numero = (await crearRequerimiento({ sede, solicitante, fecha, motivo, items }, rol)).numero;
    }, "Requerimiento enviado a Tesorería");
    setEnviando(false);
    if (ok) {
      setMotivo("");
      setItems([itemVacio()]);
      if (numero) onCreado();
    }
  };

  return (
    <Card>
      <CardHeader title="Nuevo requerimiento de almacén" subtitle="Al guardar se notifica automáticamente a Tesorería." action={<span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-bold text-slate-700" title="Número probable: el definitivo se asigna al guardar">{proximo}</span>} />
      <div className="grid gap-4 p-5 md:grid-cols-4">
        <Field label="Sede *">
          <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Seleccione…" options={SEDES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Solicitante *">
          <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nombre y cargo" />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Motivo *" className="md:col-span-4">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Mantenimiento preventivo del remolcador U35 — cambio de rodamientos" />
        </Field>
      </div>
      <ItemsEditor items={items} onChange={setItems} />
      <div className="flex justify-end border-t border-slate-100 px-5 py-4">
        <Button onClick={guardar} disabled={enviando}>
          <Send size={16} /> {enviando ? "Emitiendo…" : "Emitir y notificar a Tesorería"}
        </Button>
      </div>
    </Card>
  );
}

// =====================================================================
// LISTA DE REQUERIMIENTOS EMITIDOS
// =====================================================================
const ESTADOS: EstadoReq[] = ["PENDIENTE", "ACEPTADO", "OBSERVADO", "COTIZADO", "COMPRADO", "FINALIZADO"];

function ListaReq({ reqs, rol }: { reqs: Requerimiento[]; rol: Rol }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sede, setSede] = useState("");
  const [estado, setEstado] = useState("");
  const [editando, setEditando] = useState<Requerimiento | null>(null);

  const lista = reqs.filter((r) => (!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta) && (!sede || r.sede === sede) && (!estado || r.estado === estado));
  const conteo = ESTADOS.map((e) => ({ e, n: reqs.filter((r) => r.estado === e).length }));

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {conteo.map(({ e, n }) => (
          <button key={e} onClick={() => setEstado(estado === e ? "" : e)} className={cn("rounded-xl border bg-white p-3 text-left shadow-sm transition", estado === e ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200 hover:border-slate-300")}>
            <p className="text-2xl font-bold text-slate-900">{n}</p>
            <Badge estado={e} />
          </button>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Requerimientos emitidos"
          subtitle="Los requerimientos rechazados por Tesorería se eliminan del sistema."
          action={
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" title="Desde" />
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" title="Hasta" />
              <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Todas las sedes" options={SEDES.map((s) => ({ value: s, label: s }))} className="w-44" />
              <Select value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Todos los estados" options={ESTADOS.map((s) => ({ value: s, label: s }))} className="w-40" />
            </div>
          }
        />
        <Table head={["Nro REQ", "Fecha", "Sede", "Solicitante", "Motivo", "Items", "Estado", "Acciones"]} empty={lista.length === 0}>
          {lista.map((r) => (
            <tr key={r.id} className={cn("hover:bg-slate-50", r.estado === "OBSERVADO" && "bg-orange-50/60")}>
              <Td className="font-semibold text-slate-900">{r.numero}</Td>
              <Td>{fechaPE(r.fecha)}</Td>
              <Td>{r.sede}</Td>
              <Td>{r.solicitante}</Td>
              <Td className="max-w-[240px] truncate">{r.motivo}</Td>
              <Td>{(r.items || []).length}</Td>
              <Td>
                <Badge estado={r.estado} />
                {r.observacion && r.estado === "OBSERVADO" && <p className="mt-1 max-w-[220px] whitespace-normal text-xs text-orange-700">{r.observacion}</p>}
              </Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "REQ", id: r.id })} title="Ver e historial">
                    <Eye size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pdfRequerimiento(r)} title="PDF">
                    <FileText size={15} />
                  </Button>
                  {r.estado === "OBSERVADO" && puede(rol, "req.reenviar") && (
                    <Button size="sm" variant="warning" onClick={() => setEditando(r)}>
                      <Pencil size={13} /> Corregir
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      {editando && <CorregirReq req={editando} rol={rol} onClose={() => setEditando(null)} />}
    </>
  );
}

function CorregirReq({ req, rol, onClose }: { req: Requerimiento; rol: Rol; onClose: () => void }) {
  const [sede, setSede] = useState(req.sede);
  const [solicitante, setSolicitante] = useState(req.solicitante);
  const [motivo, setMotivo] = useState(req.motivo);
  const [items, setItems] = useState<ItemReq[]>(req.items);
  return (
    <Modal open onClose={onClose} title={`Corregir ${req.numero}`} wide>
      <div className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
        <b>Observación de Tesorería:</b> {req.observacion}
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Field label="Sede">
          <Select value={sede} onChange={(e) => setSede(e.target.value)} options={SEDES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Solicitante">
          <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
        </Field>
        <Field label="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </div>
      <ItemsEditor items={items} onChange={setItems} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={() => {
            if (ejecutar(() => reenviarRequerimiento(req.id, { sede, solicitante, motivo, items }, rol), `${req.numero} reenviado a Tesorería`)) onClose();
          }}
        >
          <Send size={15} /> Reenviar
        </Button>
      </div>
    </Modal>
  );
}

// =====================================================================
// INGRESOS POR VISTO BUENO
// =====================================================================
function Ingresos({ rol, porVB, ordenes, facturas, guias }: { rol: Rol; porVB: OrdenCompra[]; ordenes: OrdenCompra[]; facturas: Factura[]; guias: Guia[] }) {
  const [vb, setVb] = useState<OrdenCompra | null>(null);
  const [obs, setObs] = useState<OrdenCompra | null>(null);
  const [recibido, setRecibido] = useState("");
  const [nota, setNota] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const habilitado = puede(rol, "vb.dar");
  const finalizadas = ordenes.filter((o) => o.estado === "FINALIZADA");

  const abrirVB = (o: OrdenCompra) => {
    setRecibido("");
    setNota("");
    setChecks({});
    setVb(o);
  };
  const todoOk = vb ? vb.items.every((i) => checks[i.itemReqId]) : false;

  return (
    <div className="space-y-6">
      {porVB.length === 0 ? (
        <Empty icon={<PackageCheck size={28} />} text="No hay ingresos pendientes de visto bueno" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {porVB.map((o) => {
            const f = facturas.find((x) => x.ocId === o.id);
            const g = guias.find((x) => x.ocId === o.id);
            return (
              <Card key={o.id} className="border-violet-200">
                <div className="flex items-start justify-between p-5 pb-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{o.numero}</p>
                    <p className="text-sm text-slate-500">
                      {o.proveedor} · {o.reqNumero} · {o.lugarEntrega}
                    </p>
                  </div>
                  <Badge estado="EN_GUIA" />
                </div>
                <div className="grid grid-cols-2 gap-2 px-5 text-sm">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-xs text-slate-500">{f?.tipo === "DECLARACION_JURADA" ? "Declaración jurada" : "Factura"}</p>
                    <p className="font-semibold">{f?.numero ?? "-"}</p>
                    <p className="text-xs text-slate-500">{f ? soles(f.total) : ""}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="text-xs text-slate-500">Guía de remisión</p>
                    {g ? (
                      <button onClick={() => abrirDoc({ tipo: "GUIA", id: g.id })} className="font-semibold text-sky-700 underline">
                        {g.numero}
                      </button>
                    ) : (
                      <p className="font-semibold text-slate-400">No aplica (DJ)</p>
                    )}
                  </div>
                </div>
                <ul className="space-y-1 px-5 py-3 text-sm text-slate-700">
                  {o.items.map((i) => (
                    <li key={i.itemReqId}>
                      • <b>{i.cantidad} {i.unidad}</b> {i.nombre} {i.marca && <span className="text-slate-400">({i.marca})</span>}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "OC", id: o.id })}>
                    <Eye size={14} /> Historial
                  </Button>
                  <Button size="sm" variant="warning" disabled={!habilitado} onClick={() => { setNota(""); setObs(o); }}>
                    <MessageSquareWarning size={14} /> Observar
                  </Button>
                  <Button size="sm" variant="success" disabled={!habilitado} onClick={() => abrirVB(o)} className="ml-auto">
                    <CheckCircle2 size={14} /> Dar visto bueno
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader title="Ingresos finalizados" subtitle="Procesos de compra cerrados con visto bueno de almacén" />
        <Table head={["OC", "REQ", "Proveedor", "Recibido por", "Fecha V°B°", "Total", ""]} empty={finalizadas.length === 0}>
          {finalizadas.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td className="font-semibold text-slate-900">{o.numero}</Td>
              <Td>{o.reqNumero}</Td>
              <Td>{o.proveedor}</Td>
              <Td>{o.vistoBueno?.recibidoPor}</Td>
              <Td>{o.vistoBueno ? new Date(o.vistoBueno.fecha).toLocaleString("es-PE") : "-"}</Td>
              <Td className="text-right font-semibold">{soles(o.total)}</Td>
              <Td>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => pdfActaIngreso(o, facturas.find((f) => f.ocId === o.id), guias.find((g) => g.ocId === o.id))}
                >
                  <FileText size={14} /> Acta PDF
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!vb} onClose={() => setVb(null)} title={`Visto bueno de ingreso · ${vb?.numero ?? ""}`}>
        <p className="mb-2 text-sm text-slate-600">Verifique físicamente cada producto:</p>
        <div className="mb-4 space-y-1.5">
          {vb?.items.map((i) => (
            <label key={i.itemReqId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!checks[i.itemReqId]} onChange={(e) => setChecks((p) => ({ ...p, [i.itemReqId]: e.target.checked }))} />
              <span>
                <b>{i.cantidad} {i.unidad}</b> — {i.nombre}
              </span>
            </label>
          ))}
        </div>
        {vb && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Al dar el visto bueno, estas cantidades se suman al stock de <b>{sedeIngresoOC(vb)}</b>.
          </p>
        )}
        <div className="space-y-3">
          <Field label="Recibido por *">
            <Input value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder="Nombre del almacenero" />
          </Field>
          <Field label="Observaciones">
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setVb(null)}>Cancelar</Button>
          <Button
            variant="success"
            disabled={!todoOk}
            title={todoOk ? "" : "Marque todos los productos como recibidos"}
            onClick={() => {
              if (vb && ejecutar(() => darVistoBueno(vb.id, { recibidoPor: recibido, observaciones: nota }, rol), `${vb.reqNumero} FINALIZADO`)) setVb(null);
            }}
          >
            <CheckCircle2 size={15} /> Confirmar ingreso y finalizar
          </Button>
        </div>
      </Modal>

      <Modal open={!!obs} onClose={() => setObs(null)} title={`Observar ingreso · ${obs?.numero ?? ""}`}>
        <Field label="Motivo" hint="La guía queda OBSERVADA y Tesorería deberá cargar una corregida.">
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: llegaron 8 de 10 rodamientos; guía no coincide con OC" autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setObs(null)}>Cancelar</Button>
          <Button
            variant="warning"
            onClick={() => {
              if (obs && ejecutar(() => observarIngreso(obs.id, nota, rol), "Ingreso observado")) setObs(null);
            }}
          >
            Enviar observación
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// =====================================================================
// STOCK (alimentado por las compras registradas y por el V°B° de ingresos)
// =====================================================================
function Stock({ stock }: { stock: StockItem[] }) {
  const [sede, setSede] = useState("");
  const [q, setQ] = useState("");
  const lista = stock
    .filter((s) => (!sede || s.sede === sede) && (!q || s.nombre.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.sede.localeCompare(b.sede) || a.nombre.localeCompare(b.nombre));
  const valorizado = lista.reduce((a, s) => a + s.cantidad * s.costoUnit, 0);
  return (
    <Card>
      <CardHeader
        title="Stock de almacén"
        subtitle={`${lista.length} producto(s) · Valorizado ${soles(valorizado)} (último costo: sin IGV en factura/OC, con IGV en boleta)`}
        action={
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
            <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Todas las sedes" options={SEDES.map((s) => ({ value: s, label: s }))} className="w-48" />
          </div>
        }
      />
      <Table head={["Sede", "Producto", "Unidad", "Cantidad", "Último costo", "Valorizado", "Actualizado"]} empty={lista.length === 0}>
        {lista.map((s) => (
          <tr key={s.id} className="hover:bg-slate-50">
            <Td>{s.sede}</Td>
            <Td className="font-medium text-slate-900">{s.nombre}</Td>
            <Td>{s.unidad}</Td>
            <Td className="text-right font-semibold">{s.cantidad}</Td>
            <Td className="text-right">{soles(s.costoUnit)}</Td>
            <Td className="text-right">{soles(s.cantidad * s.costoUnit)}</Td>
            <Td>{new Date(s.actualizado).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}</Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
