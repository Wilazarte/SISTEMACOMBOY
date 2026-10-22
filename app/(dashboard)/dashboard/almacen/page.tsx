"use client";

import { BotonNuevo } from "@/components/ui/BotonFiltros";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { useCallback, useEffect, useState } from "react";
import { Boxes, CheckCircle2, Factory, Truck, ClipboardList, Eye, FilePlus2, FileText, MessageSquareWarning, PackageCheck, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Tabs, Td, Textarea, cn, ejecutar, ejecutarAsync } from "@/components/ui";
import { abrirDoc } from "@/components/doc-viewer";
import { EditarReq, ItemsEditor, itemVacio, permisoEditarReq } from "@/components/compras/EditarReq";
import { getSesion } from "@/lib/auth";
import { SEDES, SEDES_STOCK, UNIDADES } from "@/lib/empresa";
import {
  KEYS,
  crearRequerimiento,
  darVistoBueno,
  fechaPE,
  hoy,
  observarIngreso,
  puede,
  registrarIngresoAlmacen,
  sedeIngresoOC,
  soles,
  uid,
  useRol,
  useStore,
} from "@/lib/storage";
import { pdfActaIngreso, pdfRequerimiento } from "@/lib/pdf";
import type { EstadoReq, Factura, Guia, ItemReq, MovimientoKardex, OrdenCompra, OrdenDespacho, Requerimiento, Rol, StockItem } from "@/lib/types";
import { OrdenesDespacho } from "./despacho";
import { EquiposTerminados } from "@/components/almacen/EquiposTerminados";
import { StockAlmacen } from "@/components/almacen/StockAlmacen";
import { estadoOD } from "@/lib/ventas";

type Tab = "nuevo" | "lista" | "ingresos" | "stock" | "despacho";


export default function AlmacenPage() {
  const [rol] = useRol();
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const despachos = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  // Al entrar solo se ve la lista: el formulario se abre con "Nuevo requerimiento" en la isla
  const [tab, setTab] = useState<Tab>("lista");

  // Campana "nueva orden de despacho": /dashboard/almacen?tab=despacho (o evento si ya está en la página)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "despacho") setTab("despacho");
    const ir = () => setTab("despacho");
    window.addEventListener("erp:ir-despacho", ir);
    return () => window.removeEventListener("erp:ir-despacho", ir);
  }, []);

 const todos = [...pendientes, ...procesados].sort((a, b) => (b.numero || "").localeCompare(a.numero || ""));
  const porVB = ordenes.filter((o) => o.estado === "EN_GUIA" && !guias.some((g) => g.ocId === o.id && g.estado === "OBSERVADA"));
  const observados = procesados.filter((r) => r.estado === "OBSERVADO").length;

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-serif tracking-tight text-2xl font-semibold leading-tight text-fg lg:text-[28px]">Almacén</h1>
        <p className="mt-1 text-[13px] text-plomo-600">Emisión de requerimientos, ingresos de mercadería y stock</p>
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
          { id: "ingresos", label: "Ingresos", icon: <PackageCheck size={16} />, count: porVB.length },
          { id: "stock", label: "Stock", icon: <Boxes size={16} /> },
          {
            id: "despacho",
            label: "Órdenes despacho",
            icon: <Truck size={16} />,
            count: despachos.filter((o) => estadoOD(o) === "PENDIENTE" || estadoOD(o) === "PEDIDO_ALISTADO").length,
          },
        ]}
      />

      {tab === "nuevo" && <NuevoReq rol={rol} onCreado={() => setTab("lista")} onCancelar={() => setTab("lista")} />}
      {tab === "lista" && <ListaReq reqs={todos} rol={rol} />}
      {tab === "ingresos" && (
        <div className="space-y-6">
          <RegistrarIngreso rol={rol} stock={stock} ordenes={ordenes} />
          <Ingresos rol={rol} porVB={porVB} ordenes={ordenes} facturas={facturas} guias={guias} />
        </div>
      )}
      {tab === "stock" && <Stock stock={stock} rol={rol} onIrDespacho={() => setTab("despacho")} />}
      {tab === "despacho" && <OrdenesDespacho />}
    </div>
  );
}

// =====================================================================
// NUEVO REQUERIMIENTO
// =====================================================================
function NuevoReq({ rol, onCreado, onCancelar }: { rol: Rol; onCreado: () => void; onCancelar: () => void }) {
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
      <CardHeader title="Nuevo requerimiento de almacén" subtitle="Al guardar se notifica automáticamente a Tesorería." action={
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-plomo-100 px-3 py-1.5 text-sm font-bold text-slate-700" title="Número probable: el definitivo se asigna al guardar">{proximo}</span>
            <BotonNuevo abierto onClick={onCancelar} />
          </div>
        }
      />
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
      <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
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

/** Lápiz de la tabla: activo solo si el REQ se puede editar; si no, deshabilitado con el motivo. */
function BotonEditarReq({ req, onEditar }: { req: Requerimiento; onEditar: () => void }) {
  const p = permisoEditarReq(req, getSesion());
  return (
    <span className="tip" data-tip={p.ok ? (req.estado === "OBSERVADO" ? "Corregir y reenviar" : "Editar") : p.motivo}>
      <Button size="sm" variant={req.estado === "OBSERVADO" && p.ok ? "warning" : "ghost"} disabled={!p.ok} onClick={onEditar} aria-label="Editar">
        <Pencil size={14} />
        {req.estado === "OBSERVADO" && p.ok && " Corregir"}
      </Button>
    </span>
  );
}

function ListaReq({ reqs, rol }: { reqs: Requerimiento[]; rol: Rol }) {
  const [sede, setSede] = useState("");
  const [estado, setEstado] = useState("");
  const [editando, setEditando] = useState<Requerimiento | null>(null);

  // Fechas y búsqueda: las del panel "Buscar / Filtrar" de la lista
  const lista = reqs.filter((r) => (!sede || r.sede === sede) && (!estado || r.estado === estado));
  const conteo = ESTADOS.map((e) => ({ e, n: reqs.filter((r) => r.estado === e).length }));

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {conteo.map(({ e, n }) => (
          <button key={e} onClick={() => setEstado(estado === e ? "" : e)} className={cn("rounded-xl border bg-surface p-3 text-left shadow-sm transition", estado === e ? "border-azul-900 ring-2 ring-slate-900" : "border-plomo-200 hover:border-plomo-200")}>
            <p className="text-2xl font-bold text-fg">{n}</p>
            <Badge estado={e} />
          </button>
        ))}
      </div>
      <Card>
        <CardHeader
          title="Requerimientos emitidos"
          subtitle="Los requerimientos rechazados por Tesorería se eliminan del sistema."
        />
        <ListaDocs
          tipo="requerimientos"
          extraActivos={[sede, estado].filter(Boolean).length}
          filtrosExtra={
            <>
              <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Todas las sedes" options={SEDES.map((s) => ({ value: s, label: s }))} className="w-44" />
              <Select value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Todos los estados" options={ESTADOS.map((s) => ({ value: s, label: s }))} className="w-40" />
            </>
          }
          filas={lista.map((r): FilaDoc => {
          return {
          id: r.id,
          fecha: r.fecha,
          contraparte: r.solicitante,
          ref: (
            <>
              <span className="font-semibold text-fg">{r.numero}</span>
                <span className="ml-2 inline-block align-middle"><Badge estado={r.estado} /></span>
                {r.observacion && r.estado === "OBSERVADO" && <p className="mt-1 max-w-[320px] whitespace-normal text-xs text-orange-700">{r.observacion}</p>}
            </>
          ),
          total: `${(r.items || []).length} ítem(s)`,
          acciones: (
            <>
              <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "REQ", id: r.id })} title="Ver e historial">
                    <Eye size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pdfRequerimiento(r)} title="PDF">
                    <FileText size={15} />
                  </Button>
                  <BotonEditarReq req={r} onEditar={() => setEditando(r)} />
                </div>
            </>
          ),
          buscar: `${r.numero} ${r.sede} ${r.motivo}`,
          tipoDoc: "REQ",
          estado: r.estado,
          claseFila: r.estado === "OBSERVADO" ? "bg-orange-50/60" : undefined,
          };
        })}
        />
      </Card>
      {editando && <EditarReq req={editando} rol={rol} onClose={() => setEditando(null)} />}
    </>
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
      {porVB.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <p className="text-[13px] font-semibold text-plomo-600 lg:col-span-2">OCs anteriores pendientes de visto bueno (flujo antiguo con guía)</p>
          {porVB.map((o) => {
            const f = facturas.find((x) => x.ocId === o.id);
            const g = guias.find((x) => x.ocId === o.id);
            return (
              <Card key={o.id} className="border-plomo-200">
                <div className="flex items-start justify-between p-5 pb-3">
                  <div>
                    <p className="text-lg font-bold text-fg">{o.numero}</p>
                    <p className="text-sm text-plomo-500">
                      {o.proveedor} · {o.reqNumero} · {o.lugarEntrega}
                    </p>
                  </div>
                  <Badge estado="EN_GUIA" />
                </div>
                <div className="grid grid-cols-2 gap-2 px-5 text-sm">
                  <div className="rounded-lg bg-plomo-50 p-2.5">
                    <p className="text-xs text-plomo-500">{f?.tipo === "DECLARACION_JURADA" ? "Declaración jurada" : "Factura"}</p>
                    <p className="font-semibold">{f?.numero ?? "-"}</p>
                    <p className="text-xs text-plomo-500">{f ? soles(f.total) : ""}</p>
                  </div>
                  <div className="rounded-lg bg-plomo-50 p-2.5">
                    <p className="text-xs text-plomo-500">Guía de remisión</p>
                    {g ? (
                      <button onClick={() => abrirDoc({ tipo: "GUIA", id: g.id })} className="font-semibold text-azul-700 underline">
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
                <div className="flex flex-wrap gap-2 border-t border-plomo-100 px-5 py-3">
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

      {finalizadas.length > 0 && (
      <Card>
        <CardHeader title="Ingresos finalizados" subtitle="Procesos de compra cerrados con visto bueno de almacén" />
        <ListaDocs
          tipo="compras"
          filas={finalizadas.map((o): FilaDoc => {
          return {
          id: o.id,
          fecha: o.vistoBueno?.fecha ?? o.fecha,
          contraparte: o.proveedor,
          ref: (
            <>
              <span className="font-semibold text-fg">{o.numero}</span>
                <span className="ml-1.5 text-xs text-plomo-500">{o.reqNumero}</span>
            </>
          ),
          total: (
            <>
              {soles(o.total)}
            </>
          ),
          acciones: (
            <>
              <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "OC", id: o.id })} title="Ver (recibido por, V°B°, historial)">
                    <Eye size={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => pdfActaIngreso(o, facturas.find((f) => f.ocId === o.id), guias.find((g) => g.ocId === o.id))}
                  >
                    <FileText size={14} /> Acta PDF
                  </Button>
                </div>
            </>
          ),
          buscar: `${o.numero} ${o.reqNumero} ${o.vistoBueno?.recibidoPor ?? ""}`,
          tipoDoc: "OC",
          };
        })}
        />
      </Card>
      )}

      <Modal open={!!vb} onClose={() => setVb(null)} title={`Visto bueno de ingreso · ${vb?.numero ?? ""}`}>
        <p className="mb-2 text-sm text-plomo-600">Verifique físicamente cada producto:</p>
        <div className="mb-4 space-y-1.5">
          {vb?.items.map((i) => (
            <label key={i.itemReqId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-plomo-200 px-3 py-2 text-sm hover:bg-plomo-50">
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
// REGISTRAR INGRESO (productos de la base de stock, con o sin OC)
// =====================================================================
type FilaIngreso = { id: string; nombre: string; unidad: string; cantidad: string };
const filaIngreso = (): FilaIngreso => ({ id: uid(), nombre: "", unidad: "UND", cantidad: "" });

function RegistrarIngreso({ rol, stock, ordenes }: { rol: Rol; stock: StockItem[]; ordenes: OrdenCompra[] }) {
  const kardex = useStore<MovimientoKardex[]>(KEYS.KARDEX, []);
  const [sede, setSede] = useState("");
  const [ocId, setOcId] = useState("");
  const [lote, setLote] = useState("");
  const [obs, setObs] = useState("");
  const [filas, setFilas] = useState<FilaIngreso[]>([filaIngreso()]);
  const habilitado = puede(rol, "vb.dar");
  const sedes = Array.from(new Set([...SEDES_STOCK, ...stock.map((s) => s.sede)]));
  const ocs = ordenes.filter((o) => !o.ingresadaAlmacen && o.estado !== "FINALIZADA");
  const productos = Array.from(new Set(stock.filter((s) => !sede || s.sede === sede).map((s) => s.nombre))).sort();
  const recientes = kardex.filter((m) => m.tipo_movimiento === "INGRESO").slice(0, 30);
  // Formulario oculto por defecto: solo se ve la tabla hasta pulsar "Registrar ingreso"
  const { showForm, setShowForm } = useTogglePanel();

  const set = (id: string, k: keyof FilaIngreso, v: string) =>
    setFilas((fs) =>
      fs.map((f) => {
        if (f.id !== id) return f;
        const n = { ...f, [k]: v };
        if (k === "nombre") {
          const s = stock.find((x) => x.nombre === v.trim().toUpperCase() && (!sede || x.sede === sede)) ?? stock.find((x) => x.nombre === v.trim().toUpperCase());
          if (s) n.unidad = s.unidad;
        }
        return n;
      }),
    );

  const elegirOC = (id: string) => {
    setOcId(id);
    const oc = ordenes.find((o) => o.id === id);
    if (!oc) return;
    if (!sede) setSede(sedeIngresoOC(oc));
    setFilas(oc.items.map((i) => ({ id: uid(), nombre: i.nombre.toUpperCase(), unidad: i.unidad, cantidad: String(i.cantidad) })));
  };

  const guardar = () => {
    const n = ejecutar(
      () =>
        registrarIngresoAlmacen(
          { sede, ocId: ocId || undefined, lote, observaciones: obs, items: filas.map((f) => ({ nombre: f.nombre, unidad: f.unidad, cantidad: Number(f.cantidad) })) },
          rol,
        ),
      "Ingreso registrado en el stock",
    );
    if (n) {
      setShowForm(false);
      setOcId("");
      setLote("");
      setObs("");
      setFilas([filaIngreso()]);
    }
  };

  return (
    <div className="space-y-6">
      {habilitado && (
        <div className="mb-3 flex gap-2">
          <BotonNuevo abierto={showForm} label="Registrar ingreso" onClick={() => setShowForm(!showForm)} />
        </div>
      )}
      {habilitado && showForm && (
      <Card>
        <CardHeader title="Registrar ingreso" subtitle="Ingrese productos de la base de stock del almacén; las cantidades se suman al stock y quedan en el kardex" />
        <div className="space-y-4 p-5 pt-0">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Almacén *">
              <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Seleccione…" options={sedes.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Orden de compra" hint="Opcional: carga sus productos">
              <Select value={ocId} onChange={(e) => elegirOC(e.target.value)} placeholder="Sin OC" options={ocs.map((o) => ({ value: o.id, label: `${o.numero} · ${o.proveedor}` }))} />
            </Field>
            <Field label="Lote / guía del proveedor">
              <Input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Opcional" />
            </Field>
          </div>

          <datalist id="productos-ingreso">
            {productos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="space-y-2">
            {filas.map((f) => (
              <div key={f.id} className="grid grid-cols-[1fr_110px_110px_auto] items-end gap-2">
                <Field label="Producto">
                  <Input list="productos-ingreso" value={f.nombre} onChange={(e) => set(f.id, "nombre", e.target.value)} placeholder="Buscar en el stock…" />
                </Field>
                <Field label="Unidad">
                  <Select value={f.unidad} onChange={(e) => set(f.id, "unidad", e.target.value)} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
                </Field>
                <Field label="Cantidad">
                  <Input type="number" min="0" step="any" value={f.cantidad} onChange={(e) => set(f.id, "cantidad", e.target.value)} />
                </Field>
                <Button variant="ghost" size="sm" disabled={filas.length === 1} onClick={() => setFilas((fs) => fs.filter((x) => x.id !== f.id))}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setFilas((fs) => [...fs, filaIngreso()])}>
              <Plus size={14} /> Agregar producto
            </Button>
          </div>

          <Field label="Observaciones">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
          </Field>
          <div className="flex justify-end">
            <Button variant="success" disabled={!habilitado} title={habilitado ? "" : "Solo Almacén registra ingresos"} onClick={guardar}>
              <PackageCheck size={15} /> Registrar ingreso
            </Button>
          </div>
        </div>
      </Card>
      )}

      <Card>
        <CardHeader title="Últimos ingresos" subtitle="Movimientos de ingreso del kardex" />
        <Table head={["Fecha", "Almacén", "Producto", "Cantidad", "Saldo", "Documento", "Usuario"]} empty={recientes.length === 0}>
          {recientes.map((m) => (
            <tr key={m.id} className="hover:bg-plomo-50">
              <Td>{new Date(m.fecha).toLocaleString("es-PE")}</Td>
              <Td>{m.sede}</Td>
              <Td className="font-semibold text-fg">{m.producto}</Td>
              <Td>
                {m.cantidad} {m.unidad}
              </Td>
              <Td>{m.saldo}</Td>
              <Td>
                {m.documento}
                {m.motivo ? <span className="block text-xs text-plomo-500">{m.motivo}</span> : null}
              </Td>
              <Td>{m.usuario}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// =====================================================================
// STOCK (alimentado por las compras registradas y por el V°B° de ingresos)
// =====================================================================
function Stock({ stock, rol, onIrDespacho }: { stock: StockItem[]; rol: Rol; onIrDespacho: () => void }) {
  const [nuevoEquipo, setNuevoEquipo] = useState(false);
  const cerrarNuevo = useCallback(() => setNuevoEquipo(false), []);
  const puedeRegistrar = puede(rol, "req.crear") && !getSesion()?.soloLectura; // Almacén y creador
  return (
    <div className="space-y-6">
      <EquiposTerminados puedeRegistrar={puedeRegistrar} nuevo={nuevoEquipo} onNuevoCerrado={cerrarNuevo} />
      <StockAlmacen stock={stock} puedeOperar={puedeRegistrar} onIrDespacho={onIrDespacho} />
    </div>
  );
}
