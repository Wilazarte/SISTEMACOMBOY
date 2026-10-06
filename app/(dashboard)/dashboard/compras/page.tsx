"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  MessageSquareWarning,
  PackagePlus,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Tabs, Td, Textarea, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import { abrirDoc } from "@/components/doc-viewer";
import { FormGasto } from "@/components/compras/FormGasto";
import {
  IGV,
  COMPROBANTES_GASTO,
  CUENTAS_ORIGEN_PAGO,
  TIPOS_GASTO,
  KEYS,
  MAX_ARCHIVO,
  TOPE_DJ,
  aceptarRequerimiento,
  crearCotizacion,
  crearDeclaracionJurada,
  crearFactura,
  crearGuia,
  crearProveedor,
  emitirOrdenCompra,
  fechaPE,
  hoy,
  marcarPago,
  observarRequerimiento,
  parseFechaPE,
  puede,
  r2,
  rechazarRequerimiento,
  registrarCompra,
  rucValido,
  soles,
  totalesCompra,
  uid,
  urlVoucher,
  useRol,
  useStore,
  validarVoucher,
  sumarDias,
} from "@/lib/storage";
import { ALMACENES, ALMACEN_DEFECTO, SEDES, UNIDADES } from "@/lib/empresa";
import { pdfCotizacion, pdfFactura, pdfOrdenCompra, pdfRequerimiento } from "@/lib/pdf";
import { asientoOrdenCompra } from "@/lib/contable";
import { getSesion } from "@/lib/auth";
import type { Compra, Cotizacion, CuentaOrigenPago, Factura, FormaPago, Guia, ItemCompra, ItemPrecio, OrdenCompra, Proveedor, Requerimiento, Rol, StockItem, TipoComprobanteCompra } from "@/lib/types";

type Tab = "registrar" | "antecedentes" | "cotizaciones" | "ordenes" | "facturas" | "guias";

const FORMAS_PAGO: FormaPago[] = ["CONTADO", "CREDITO 15 DIAS", "CREDITO 30 DIAS", "CREDITO 60 DIAS", "ADELANTO 50%"];
const DIAS_CREDITO: Record<FormaPago, number> = {
  CONTADO: 0,
  "CREDITO 15 DIAS": 15,
  "CREDITO 30 DIAS": 30,
  "CREDITO 60 DIAS": 60,
  "ADELANTO 50%": 0,
};

/** Días de crédito de la forma de pago; formas antiguas o escritas a mano ("Crédito 45 días") se leen del texto. */
const diasCredito = (forma?: string): number => {
  if (forma && forma in DIAS_CREDITO) return DIAS_CREDITO[forma as FormaPago];
  const n = /(\d+)\s*D[IÍ]AS?/i.exec(forma ?? "")?.[1];
  return n ? Number(n) : 0;
};

// =====================================================================
export default function ComprasPage() {
  const [rol] = useRol();
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const cotizaciones = useStore<Cotizacion[]>(KEYS.COTIZACIONES, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const guias = useStore<Guia[]>(KEYS.GUIAS, []);
  const proveedores = useStore<Proveedor[]>(KEYS.PROVEEDORES, []);
  const compras = useStore<Compra[]>(KEYS.COMPRAS, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);

  const [tab, setTab] = useState<Tab>(puede(rol, "compra.crear") ? "registrar" : "antecedentes");
  const [pre, setPre] = useState<{ req?: string; coti?: string; oc?: string; fac?: string }>({});

  const ir = (t: Tab, p: typeof pre = {}) => {
    setPre(p);
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cotizables = procesados.filter((r) => r.estado === "ACEPTADO" || r.estado === "COTIZADO");
  const cotisSinOC = cotizaciones.filter((c) => c.estado === "REGISTRADA" && !ordenes.some((o) => o.reqId === c.reqId));
  const ocsSinFactura = ordenes.filter((o) => o.estado === "EMITIDA");
  // Los gastos de Tesorería no llevan guía ni V°B° (no ingresan a almacén)
  const facturasSinGuia = facturas.filter((f) => f.tipo === "FACTURA" && !f.esGastoTesoreria && (!guias.some((g) => g.facturaId === f.id) || guias.some((g) => g.facturaId === f.id && g.estado === "OBSERVADA")));

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-light leading-tight text-azul-900 lg:text-3xl">Tesorería / Compras</h1>
          <p className="mt-1 text-[13px] text-plomo-600">Requerimiento → Cotización → Orden de Compra → Factura → Guía → V°B° Almacén</p>
        </div>
        {!puede(rol, "req.revisar") && (
          <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-plomo-600">Modo lectura para su rol</span>
        )}
      </div>

      <Notificaciones pendientes={pendientes} rol={rol} />

      <Tabs<Tab>
        value={tab}
        onChange={(t) => ir(t)}
        tabs={[
          { id: "registrar", label: "Registrar gasto / compra", icon: <PackagePlus size={16} /> },
          { id: "antecedentes", label: "Antecedentes", icon: <History size={16} /> },
          { id: "cotizaciones", label: "Cotizaciones", icon: <FileSpreadsheet size={16} />, count: cotizables.filter((r) => r.estado === "ACEPTADO").length },
          { id: "ordenes", label: "Órdenes de compra", icon: <ShoppingBag size={16} />, count: cotisSinOC.length },
          { id: "facturas", label: "Facturas", icon: <Receipt size={16} />, count: ocsSinFactura.length },
          { id: "guias", label: "Guías de remisión", icon: <Truck size={16} />, count: facturasSinGuia.length },
        ]}
      />

      {tab === "registrar" && <RegistrarCompra rol={rol} proveedores={proveedores} compras={compras} gastos={facturas.filter((f) => f.esGastoTesoreria)} stock={stock} />}
      {tab === "antecedentes" && <Antecedentes reqs={procesados} ordenes={ordenes} rol={rol} onCotizar={(id) => ir("cotizaciones", { req: id })} />}
      {tab === "cotizaciones" && (
        <Cotizaciones key={pre.req ?? "c"} rol={rol} reqs={cotizables} cotizaciones={cotizaciones} preReq={pre.req} onOC={(id) => ir("ordenes", { coti: id })} />
      )}
      {tab === "ordenes" && (
        <Ordenes key={pre.coti ?? "o"} rol={rol} cotis={cotisSinOC} todasCotis={cotizaciones} ordenes={ordenes} reqs={procesados} preCoti={pre.coti} onFacturar={(id) => ir("facturas", { oc: id })} />
      )}
      {tab === "facturas" && <Facturas key={pre.oc ?? "f"} rol={rol} ocs={ocsSinFactura} ordenes={ordenes} facturas={facturas} preOc={pre.oc} onGuia={(id) => ir("guias", { fac: id })} />}
      {tab === "guias" && <Guias key={pre.fac ?? "g"} rol={rol} facturas={facturasSinGuia} guias={guias} preFac={pre.fac} />}
    </div>
  );
}

// =====================================================================
// NOTIFICACIONES (cards amarillas)
// =====================================================================
function Notificaciones({ pendientes, rol }: { pendientes: Requerimiento[]; rol: Rol }) {
  const [rechazo, setRechazo] = useState<Requerimiento | null>(null);
  const [obs, setObs] = useState<Requerimiento | null>(null);
  const [motivo, setMotivo] = useState("");
  const habilitado = puede(rol, "req.revisar");

  if (pendientes.length === 0)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
        <Check size={18} /> No hay requerimientos pendientes de revisión.
      </div>
    );

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Bell size={18} className="text-amber-600" />
        <h2 className="font-semibold text-azul-900">Requerimientos por revisar</h2>
        <span className="rounded-full bg-corp px-2 text-xs font-bold text-white">{pendientes.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pendientes.map((r) => (
          <div key={r.id} className="flex flex-col rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-azul-900">{r.numero}</p>
                <p className="text-xs text-plomo-600">
                  {fechaPE(r.fecha)} · {r.sede}
                </p>
              </div>
              <Badge estado="PENDIENTE" />
            </div>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-medium">{r.solicitante}:</span> {r.motivo}
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-plomo-600">
              {r.items.slice(0, 3).map((i) => (
                <li key={i.id}>
                  • {i.cantidad} {i.unidad} — {i.nombre} {i.marca && `(${i.marca})`}
                </li>
              ))}
              {r.items.length > 3 && <li className="font-medium">+ {r.items.length - 3} producto(s) más</li>}
            </ul>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
              <Button size="sm" variant="secondary" onClick={() => abrirDoc({ tipo: "REQ", id: r.id })}>
                <Eye size={14} /> Ver
              </Button>
              <Button size="sm" variant="success" disabled={!habilitado} onClick={() => ejecutar(() => aceptarRequerimiento(r.id, rol), `${r.numero} ACEPTADO`)}>
                <Check size={14} /> Aceptar
              </Button>
              <Button size="sm" variant="warning" disabled={!habilitado} onClick={() => { setMotivo(""); setObs(r); }}>
                <MessageSquareWarning size={14} /> Observar
              </Button>
              <Button size="sm" variant="danger" disabled={!habilitado} onClick={() => setRechazo(r)}>
                <X size={14} /> Rechazar
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!rechazo} onClose={() => setRechazo(null)} title={`Rechazar ${rechazo?.numero ?? ""}`}>
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          El requerimiento se <b>eliminará de todo el sistema</b> (notificaciones y lista). Esta acción no se puede deshacer.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRechazo(null)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (rechazo && ejecutar(() => rechazarRequerimiento(rechazo.id), `${rechazo.numero} rechazado y eliminado`)) setRechazo(null);
            }}
          >
            Rechazar y eliminar
          </Button>
        </div>
      </Modal>

      <Modal open={!!obs} onClose={() => setObs(null)} title={`Observar ${obs?.numero ?? ""}`}>
        <Field label="Motivo de la observación" hint="Almacén verá esta observación y podrá corregir y reenviar.">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Especificar medida del rodamiento y marca aceptada" autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setObs(null)}>Cancelar</Button>
          <Button
            variant="warning"
            onClick={() => {
              if (obs && ejecutar(() => observarRequerimiento(obs.id, motivo, rol), `${obs.numero} OBSERVADO`)) setObs(null);
            }}
          >
            Enviar observación
          </Button>
        </div>
      </Modal>
    </section>
  );
}

// =====================================================================
// REGISTRAR COMPRA (proveedor + comprobante + productos -> stock)
// =====================================================================
type FilaCompra = Omit<ItemCompra, "subtotal">;
const filaVacia = (): FilaCompra => ({ id: uid(), nombre: "", unidad: "UND", cantidad: 1, precioUnit: 0 });

/** Máscara DD/MM/AAAA mientras se escribe: solo dígitos y barras automáticas. */
const mascaraFecha = (v: string): string => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/");
};

type ModoRegistro = "GASTO" | "COMPRA";
const MODOS_REGISTRO: { value: ModoRegistro; label: string }[] = [
  { value: "GASTO", label: "Gasto / Servicio sin stock - Tesorería" },
  { value: "COMPRA", label: "Compra con ingreso a stock" },
];

function RegistrarCompra({ rol, proveedores, compras, gastos, stock }: { rol: Rol; proveedores: Proveedor[]; compras: Compra[]; gastos: Factura[]; stock: StockItem[] }) {
  const [modo, setModo] = useState<ModoRegistro>("GASTO");
  const [proveedorId, setProveedorId] = useState("");
  const [nuevoProv, setNuevoProv] = useState<{ razonSocial: string; ruc: string } | null>(null);
  const [fechaTxt, setFechaTxt] = useState(fechaPE(hoy()));
  const [tipo, setTipo] = useState<TipoComprobanteCompra>("FACTURA");
  const [numero, setNumero] = useState("");
  const [sede, setSede] = useState(SEDES[0]);
  const [filas, setFilas] = useState<FilaCompra[]>([filaVacia()]);
  const habilitado = puede(rol, "compra.crear");

  const fechaISO = parseFechaPE(fechaTxt);
  const fechaError = fechaTxt.length === 10 && !fechaISO ? "Fecha inexistente" : fechaISO > hoy() ? "La fecha no puede ser futura" : undefined;
  const { subtotal, igv, total } = totalesCompra(tipo, filas);
  const conIgv = tipo === "BOLETA";
  const prov = proveedores.find((p) => p.id === proveedorId);
  const set = (id: string, campo: keyof FilaCompra, v: string | number) => setFilas((p) => p.map((i) => (i.id === id ? { ...i, [campo]: v } : i)));
  const productosStock = useMemo(() => Array.from(new Set(stock.map((s) => s.nombre))).sort(), [stock]);

  const guardarProveedor = () => {
    if (!nuevoProv) return;
    let creado: Proveedor | undefined;
    if (ejecutar(() => (creado = crearProveedor(nuevoProv)), "Proveedor registrado")) {
      setProveedorId(creado!.id);
      setNuevoProv(null);
    }
  };

  const guardar = () => {
    const ok = ejecutar(
      () => registrarCompra({ proveedorId, fecha: fechaISO, tipoComprobante: tipo, numero, sede, items: filas }, rol),
      `Compra registrada · stock de ${sede} actualizado`
    );
    if (ok) {
      setNumero("");
      setFilas([filaVacia()]);
    }
  };

  // Compras (con stock) y gastos de Tesorería en una sola lista, de la más reciente a la más antigua
  const registros = [
    ...compras.map((c) => ({ tipo: "COMPRA" as const, id: c.id, fecha: c.fecha, compra: c })),
    ...gastos.map((g) => ({ tipo: "GASTO_TESORERIA" as const, id: g.id, fecha: g.fecha, gasto: g })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalRegistros = r2(compras.reduce((a, c) => a + c.total, 0) + gastos.reduce((a, g) => a + g.total, 0));

  return (
    <div className="space-y-6">
      {habilitado && (
        <Card>
          <div className="flex flex-wrap items-end gap-4 p-5">
            <Field label="Tipo de registro" className="min-w-[320px]">
              <Select value={modo} onChange={(e) => setModo(e.target.value as ModoRegistro)} options={MODOS_REGISTRO} className="text-base font-semibold" />
            </Field>
            <p className="pb-2 text-sm text-plomo-500">
              {modo === "GASTO"
                ? "No ingresa a almacén: queda en Facturas como POR PAGAR para Tesorería."
                : "Los productos ingresan al stock del almacén seleccionado."}
            </p>
          </div>
        </Card>
      )}

      {habilitado && modo === "GASTO" && <FormGasto rol={rol} proveedores={proveedores} />}

      {habilitado && modo === "COMPRA" && (
        <Card>
          <CardHeader title="Registrar compra" subtitle="Factura: precios sin IGV (se suma 18 %). Boleta: precios con IGV incluido. Al guardar, los productos ingresan al stock del almacén seleccionado." />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Proveedor" className="md:col-span-2" hint={prov ? `RUC ${prov.ruc}` : undefined}>
              <div className="flex gap-2">
                <Select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  placeholder={proveedores.length ? "Seleccione proveedor…" : "Registre un proveedor →"}
                  options={proveedores.map((p) => ({ value: p.id, label: `${p.razonSocial} · ${p.ruc}` }))}
                />
                <Button type="button" variant="secondary" onClick={() => setNuevoProv({ razonSocial: "", ruc: "" })} title="Nuevo proveedor">
                  <Plus size={16} />
                </Button>
              </div>
            </Field>
            <Field label="Fecha de compra" hint={fechaError ? `⚠ ${fechaError}` : "DD/MM/AAAA"}>
              <Input
                value={fechaTxt}
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                maxLength={10}
                onChange={(e) => setFechaTxt(mascaraFecha(e.target.value))}
                className={cn(fechaError && "border-red-400")}
              />
            </Field>
            <Field label="Comprobante">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoComprobanteCompra)} options={[{ value: "FACTURA", label: "Factura" }, { value: "BOLETA", label: "Boleta de venta" }]} />
            </Field>
            <Field label={`N° ${tipo === "FACTURA" ? "factura" : "boleta"}`}>
              <Input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder={tipo === "FACTURA" ? "F001-00001234" : "B001-00000456"} />
            </Field>
            <Field label="Ingresa a almacén">
              <Select value={sede} onChange={(e) => setSede(e.target.value)} options={SEDES.map((x) => ({ value: x, label: x }))} />
            </Field>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
                <tr>
                  <th className="w-8 px-3 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Producto *</th>
                  <th className="w-28 px-2 py-2 text-left">Unidad</th>
                  <th className="w-28 px-2 py-2 text-left">Cantidad *</th>
                  <th className="w-36 px-2 py-2 text-left">P. Unit. ({conIgv ? "con" : "sin"} IGV) *</th>
                  <th className="w-32 px-2 py-2 text-right">Subtotal</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-plomo-100">
                {filas.map((i, k) => (
                  <tr key={i.id}>
                    <td className="px-3 py-1.5 text-slate-400">{k + 1}</td>
                    <td className="px-2 py-1.5">
                      <Input value={i.nombre} list="productos-stock" onChange={(e) => set(i.id, "nombre", e.target.value)} placeholder="Ej: Rodamiento 6205" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Select value={i.unidad} onChange={(e) => set(i.id, "unidad", e.target.value)} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" min={0} step="any" value={i.cantidad || ""} onChange={(e) => set(i.id, "cantidad", parseFloat(e.target.value) || 0)} className="text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" min={0} step="0.01" value={i.precioUnit || ""} onChange={(e) => set(i.id, "precioUnit", parseFloat(e.target.value) || 0)} className="text-right" />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">{soles(r2((i.cantidad || 0) * (i.precioUnit || 0)))}</td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => setFilas((p) => (p.length > 1 ? p.filter((x) => x.id !== i.id) : [filaVacia()]))}
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
            <datalist id="productos-stock">
              {productosStock.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="px-5 pt-3">
            <Button size="sm" variant="secondary" onClick={() => setFilas((p) => [...p, filaVacia()])}>
              <Plus size={14} /> Agregar producto
            </Button>
          </div>
          {conIgv && <p className="px-5 pt-3 text-right text-xs text-plomo-500">Boleta: los precios incluyen IGV; la base imponible se obtiene dividiendo el total entre 1.18.</p>}
          <Totales subtotal={subtotal} igv={igv} total={total} />
          <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
            <Button onClick={guardar} disabled={!proveedorId || !fechaISO}>
              <PackagePlus size={16} /> Guardar compra e ingresar a stock
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Compras registradas" subtitle={`${compras.length} compra(s) · ${gastos.length} gasto(s) de Tesorería · Total ${soles(totalRegistros)}`} />
        <Table head={["Tipo", "Fecha", "Comprobante", "Proveedor", "RUC", "Almacén / gasto", "Items / detalle", "Subtotal", "IGV", "Total"]} empty={registros.length === 0}>
          {registros.map((r) => {
            if (r.tipo === "GASTO_TESORERIA") {
              const g = r.gasto;
              return (
                <tr key={g.id} className="hover:bg-plomo-50">
                  <Td>
                    <Badge estado="GASTO_TESORERIA" />
                  </Td>
                  <Td>{fechaPE(g.fecha)}</Td>
                  <Td>
                    <span className="font-semibold text-azul-900">{g.numero}</span>
                    <p className="text-xs text-plomo-500">{g.comprobanteGasto ? COMPROBANTES_GASTO[g.comprobanteGasto] : "-"}</p>
                  </Td>
                  <Td>{g.proveedor}</Td>
                  <Td>{g.ruc || "-"}</Td>
                  <Td>{g.tipoGasto ? TIPOS_GASTO[g.tipoGasto] : "-"}</Td>
                  <Td className="max-w-[220px]">
                    <span className="block truncate" title={g.descripcion}>
                      {g.descripcion}
                    </span>
                    {g.detraccionMonto ? <p className="text-xs text-red-600">Detracción {g.detraccionPorc}% − {soles(g.detraccionMonto)}</p> : null}
                  </Td>
                  <Td className="text-right">{soles(g.subtotal)}</Td>
                  <Td className="text-right">{soles(g.igv)}</Td>
                  <Td className="text-right font-semibold">{soles(g.total)}</Td>
                </tr>
              );
            }
            const c = r.compra;
            return (
            <tr key={c.id} className="hover:bg-plomo-50">
              <Td>
                <Badge estado="COMPRA" />
              </Td>
              <Td>{fechaPE(c.fecha)}</Td>
              <Td>
                <span className="font-semibold text-azul-900">{c.numero}</span>
                <p className="text-xs text-plomo-500">{c.tipoComprobante === "FACTURA" ? "Factura" : "Boleta"}</p>
              </Td>
              <Td>{c.proveedor}</Td>
              <Td>{c.ruc}</Td>
              <Td>{c.sede}</Td>
              <Td>
                <span title={c.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join("\n")}>{c.items.length}</span>
              </Td>
              <Td className="text-right">{soles(c.subtotal)}</Td>
              <Td className="text-right">{soles(c.igv)}</Td>
              <Td className="text-right font-semibold">{soles(c.total)}</Td>
            </tr>
            );
          })}
        </Table>
      </Card>

      <Modal open={!!nuevoProv} onClose={() => setNuevoProv(null)} title="Nuevo proveedor">
        {nuevoProv && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              guardarProveedor();
            }}
            className="space-y-4"
          >
            <Field label="Razón social">
              <Input value={nuevoProv.razonSocial} onChange={(e) => setNuevoProv({ ...nuevoProv, razonSocial: e.target.value })} autoFocus />
            </Field>
            <Field label="RUC" hint={nuevoProv.ruc.length === 11 && !rucValido(nuevoProv.ruc) ? "⚠ Dígito verificador inválido" : undefined}>
              <Input
                value={nuevoProv.ruc}
                maxLength={11}
                inputMode="numeric"
                onChange={(e) => setNuevoProv({ ...nuevoProv, ruc: e.target.value.replace(/\D/g, "") })}
                className={cn(nuevoProv.ruc.length === 11 && (rucValido(nuevoProv.ruc) ? "border-emerald-400" : "border-red-400"))}
                placeholder="20XXXXXXXXX"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setNuevoProv(null)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar proveedor</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// =====================================================================
// ANTECEDENTES
// =====================================================================
function Antecedentes({ reqs, ordenes, rol, onCotizar }: { reqs: Requerimiento[]; ordenes: OrdenCompra[]; rol: Rol; onCotizar: (id: string) => void }) {
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  const lista = reqs.filter(
    (r) => (!estado || r.estado === estado) && (!q || `${r.numero} ${r.sede} ${r.solicitante} ${r.motivo}`.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <Card>
      <CardHeader
        title="Antecedentes de requerimientos"
        subtitle="Histórico de REQ aceptados, observados y en proceso de compra"
        action={
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
            <Select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              placeholder="Todos los estados"
              options={["ACEPTADO", "OBSERVADO", "COTIZADO", "COMPRADO", "FINALIZADO"].map((s) => ({ value: s, label: s }))}
              className="w-44"
            />
          </div>
        }
      />
      <Table head={["Nro REQ", "Fecha", "Sede", "Solicitante", "Items", "Estado", "OC", "Acciones"]} empty={lista.length === 0}>
        {lista.map((r) => {
          const oc = ordenes.find((o) => o.reqId === r.id);
          return (
            <tr key={r.id} className="hover:bg-plomo-50">
              <Td className="font-semibold text-azul-900">{r.numero}</Td>
              <Td>{fechaPE(r.fecha)}</Td>
              <Td>{r.sede}</Td>
              <Td>{r.solicitante}</Td>
              <Td>{(r.items || []).length}</Td>
              <Td>
                <Badge estado={r.estado} />
                {r.estado === "OBSERVADO" && <p className="mt-1 max-w-[200px] truncate text-xs text-orange-700" title={r.observacion}>{r.observacion}</p>}
              </Td>
              <Td>{oc ? oc.numero : "-"}</Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "REQ", id: r.id })} title="Ver e historial">
                    <Eye size={15} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pdfRequerimiento(r)} title="PDF">
                    <FileText size={15} />
                  </Button>
                  {(r.estado === "ACEPTADO" || r.estado === "COTIZADO") && puede(rol, "coti.crear") && (
                    <Button size="sm" variant="secondary" onClick={() => onCotizar(r.id)}>
                      Cotizar
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
}

// =====================================================================
// COTIZACIONES
// =====================================================================
function Cotizaciones({
  rol,
  reqs,
  cotizaciones,
  preReq,
  onOC,
}: {
  rol: Rol;
  reqs: Requerimiento[];
  cotizaciones: Cotizacion[];
  preReq?: string;
  onOC: (id: string) => void;
}) {
  const [reqId, setReqId] = useState(preReq ?? "");
  const [proveedor, setProveedor] = useState("");
  const [ruc, setRuc] = useState("");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [items, setItems] = useState<ItemPrecio[]>([]);
  const habilitado = puede(rol, "coti.crear");

  useEffect(() => {
    const req = reqs.find((r) => r.id === reqId);
    setItems(
      req
        ? req.items.map((i) => ({ itemReqId: i.id, nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, marca: i.marca, precioUnit: 0, subtotal: 0 }))
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqId]);

  const subtotal = r2(items.reduce((a, i) => a + i.cantidad * (i.precioUnit || 0), 0));
  const igv = r2(subtotal * IGV);

  const guardar = () => {
    const ok = ejecutar(() => crearCotizacion({ reqId, proveedor, ruc, numero, fechaEmision: fecha, items }, rol), "Cotización registrada");
    if (ok) {
      setProveedor("");
      setRuc("");
      setNumero("");
      setItems((p) => p.map((i) => ({ ...i, precioUnit: 0, subtotal: 0 })));
    }
  };

  // Menor total por REQ para comparativo
  const minPorReq = useMemo(() => {
    const m: Record<string, number> = {};
    cotizaciones.forEach((c) => (m[c.reqId] = Math.min(m[c.reqId] ?? Infinity, c.total)));
    return m;
  }, [cotizaciones]);

  return (
    <div className="space-y-6">
      {habilitado && (
        <Card>
          <CardHeader title="Registrar cotización" subtitle="Vinculada a un requerimiento ACEPTADO. Puede registrar varias cotizaciones por REQ para comparar." />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Requerimiento">
              <Select
                value={reqId}
                onChange={(e) => setReqId(e.target.value)}
                placeholder={reqs.length ? "Seleccione REQ…" : "No hay REQ aceptados"}
                options={reqs.map((r) => ({ value: r.id, label: `${r.numero} · ${r.sede} · ${r.estado}` }))}
              />
            </Field>
            <Field label="Nro cotización">
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="COT-000123" />
            </Field>
            <Field label="Fecha de emisión">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Proveedor" className="md:col-span-2">
              <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Razón social" />
            </Field>
            <Field label="RUC" hint={ruc.length === 11 && !rucValido(ruc) ? "⚠ Dígito verificador inválido" : undefined}>
              <Input
                value={ruc}
                maxLength={11}
                inputMode="numeric"
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))}
                className={cn(ruc.length === 11 && (rucValido(ruc) ? "border-emerald-400" : "border-red-400"))}
                placeholder="20XXXXXXXXX"
              />
            </Field>
          </div>
          {items.length > 0 && (
            <>
              <Table head={["Producto", "Marca", "Cant.", "Und.", "P. Unit. (sin IGV)", "Subtotal"]}>
                {items.map((i, k) => (
                  <tr key={i.itemReqId}>
                    <Td className="font-medium">{i.nombre}</Td>
                    <Td>{i.marca || "-"}</Td>
                    <Td>{i.cantidad}</Td>
                    <Td>{i.unidad}</Td>
                    <Td>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={i.precioUnit || ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setItems((p) => p.map((x, j) => (j === k ? { ...x, precioUnit: v, subtotal: r2(v * x.cantidad) } : x)));
                        }}
                        className="w-32 text-right"
                      />
                    </Td>
                    <Td className="text-right font-medium">{soles(r2(i.cantidad * (i.precioUnit || 0)))}</Td>
                  </tr>
                ))}
              </Table>
              <Totales subtotal={subtotal} igv={igv} />
            </>
          )}
          <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
            <Button onClick={guardar} disabled={!reqId}>
              <FileCheck2 size={16} /> Guardar cotización
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Cotizaciones registradas" subtitle="★ = menor precio del requerimiento" />
        <Table head={["Fecha", "Nro Coti", "Nro REQ", "Proveedor", "RUC", "Monto total", "Estado", "Acciones"]} empty={cotizaciones.length === 0}>
          {cotizaciones.map((c) => (
            <tr key={c.id} className="hover:bg-plomo-50">
              <Td>{fechaPE(c.fechaEmision)}</Td>
              <Td className="font-semibold text-azul-900">{c.numero}</Td>
              <Td>{c.reqNumero}</Td>
              <Td>{c.proveedor}</Td>
              <Td>{c.ruc}</Td>
              <Td className="text-right font-semibold">
                {minPorReq[c.reqId] === c.total && <span className="mr-1 text-corp">★</span>}
                {soles(c.total)}
              </Td>
              <Td>
                <Badge estado={c.estado} />
              </Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "COTI", id: c.id })}>
                    <Eye size={15} />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => pdfCotizacion(c)}>
                    <FileText size={14} /> Ver PDF
                  </Button>
                  {c.estado === "REGISTRADA" && puede(rol, "oc.crear") && (
                    <Button size="sm" onClick={() => onOC(c.id)}>
                      Generar OC
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Totales({ subtotal, igv, total = r2(subtotal + igv) }: { subtotal: number; igv: number; total?: number }) {
  return (
    <div className="flex justify-end px-5 py-3">
      <dl className="w-72 space-y-1 text-sm">
        <div className="flex justify-between text-plomo-600">
          <dt>Subtotal</dt>
          <dd>{soles(subtotal)}</dd>
        </div>
        <div className="flex justify-between text-plomo-600">
          <dt>IGV 18%</dt>
          <dd>{soles(igv)}</dd>
        </div>
        <div className="flex justify-between rounded-lg bg-azul-900 px-3 py-2 font-bold text-white">
          <dt>TOTAL</dt>
          <dd>{soles(total)}</dd>
        </div>
      </dl>
    </div>
  );
}

// =====================================================================
// ÓRDENES DE COMPRA
// =====================================================================
function Ordenes({
  rol,
  cotis,
  todasCotis,
  ordenes,
  reqs,
  preCoti,
  onFacturar,
}: {
  rol: Rol;
  cotis: Cotizacion[];
  todasCotis: Cotizacion[];
  ordenes: OrdenCompra[];
  reqs: Requerimiento[];
  preCoti?: string;
  onFacturar: (id: string) => void;
}) {
  const [cotiId, setCotiId] = useState(preCoti ?? "");
  const [fecha, setFecha] = useState(hoy());
  const [formaPago, setFormaPago] = useState<FormaPago>("CREDITO 30 DIAS");
  const [tiempo, setTiempo] = useState("");
  const [lugar, setLugar] = useState("");
  const [almacenIngreso, setAlmacenIngreso] = useState(ALMACEN_DEFECTO);
  const [cuentaOrigen, setCuentaOrigen] = useState<CuentaOrigenPago>("caja_general");
  const [voucher, setVoucher] = useState<{ file: File; url: string } | null>(null);
  const [voucherMonto, setVoucherMonto] = useState("");
  const voucherRef = useRef<HTMLInputElement>(null);
  const coti = cotis.find((c) => c.id === cotiId);
  // Solo TESORERÍA y CREADOR (oc.crear) emiten la OC; el resto ve el formulario en solo lectura.
  const habilitado = puede(rol, "oc.crear");

  useEffect(() => {
    const sede = reqs.find((r) => r.id === coti?.reqId)?.sede;
    if (sede) setLugar(sede);
  }, [coti, reqs]);

  useEffect(() => {
    setVoucherMonto(coti ? String(coti.total) : "");
  }, [coti]);

  // Libera la vista previa local al reemplazar/quitar el baucher
  useEffect(() => () => { if (voucher) URL.revokeObjectURL(voucher.url); }, [voucher]);

  const cargarVoucher = (file?: File) => {
    if (voucherRef.current) voucherRef.current.value = "";
    if (!file) return;
    try {
      validarVoucher(file);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Archivo no válido", "error");
      return;
    }
    setVoucher({ file, url: URL.createObjectURL(file) });
  };

  const verVoucher = async (ruta: string) => {
    const w = window.open("", "_blank");
    try {
      const url = await urlVoucher(ruta);
      if (w) w.location.href = url;
      else window.open(url, "_blank");
    } catch (e) {
      w?.close();
      toast(e instanceof Error ? e.message : "No se pudo abrir el baucher", "error");
    }
  };

  const competidoras = coti ? todasCotis.filter((c) => c.reqId === coti.reqId) : [];
  const minimo = competidoras.length ? Math.min(...competidoras.map((c) => c.total)) : 0;

  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    const monto = voucherMonto === "" ? undefined : parseFloat(voucherMonto);
    const ok = await ejecutarAsync(async () => {
      const oc = await emitirOrdenCompra(
        { cotizacionId: cotiId, fecha, formaPago, tiempoEntrega: tiempo, lugarEntrega: lugar, cuentaOrigenPago: cuentaOrigen, voucherMonto: monto, almacenIngreso },
        voucher?.file ?? null,
        rol
      );
      // Contable: DEBE 60 Compras + 40 IGV / HABER 42 Proveedores
      asientoOrdenCompra(oc, getSesion()?.usuario ?? String(rol));
      return oc;
    }, "Orden de compra emitida · asiento contable generado");
    setEnviando(false);
    if (ok) {
      setCotiId("");
      setTiempo("");
      setCuentaOrigen("caja_general");
      setVoucher(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Emitir orden de compra" subtitle={habilitado ? "Se genera desde una COTIZACIÓN (no directamente desde el REQ)." : "Solo lectura: solo Tesorería y Creador pueden emitir órdenes de compra."} />
        <fieldset disabled={!habilitado} className="min-w-0">
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Cotización" className="md:col-span-3">
              <Select
                value={cotiId}
                onChange={(e) => setCotiId(e.target.value)}
                placeholder={cotis.length ? "Seleccione Nro de cotización…" : "No hay cotizaciones disponibles"}
                options={cotis.map((c) => ({ value: c.id, label: `${c.numero} · ${c.proveedor} · ${c.reqNumero} · ${soles(c.total)}` }))}
              />
            </Field>
            <Field label="Fecha OC">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Forma de pago">
              <Select value={formaPago} onChange={(e) => setFormaPago(e.target.value as FormaPago)} options={FORMAS_PAGO.map((f) => ({ value: f, label: f }))} />
            </Field>
            <Field label="Tiempo de entrega">
              <Input value={tiempo} onChange={(e) => setTiempo(e.target.value)} placeholder="Ej: 5 días hábiles" />
            </Field>
            <Field label="Lugar de entrega" className="md:col-span-2">
              <Input value={lugar} onChange={(e) => setLugar(e.target.value)} />
            </Field>
            <Field label="Almacén de ingreso *" hint="Al dar el V°B° los repuestos se suman al stock de este almacén">
              <Select value={almacenIngreso} onChange={(e) => setAlmacenIngreso(e.target.value)} options={ALMACENES.map((a) => ({ value: a, label: a }))} />
            </Field>
          </div>
          <div className="mx-5 mb-5 rounded-xl border border-plomo-200 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">Comprobante de pago y origen</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="¿De qué cuenta se realiza el pago? *">
                <Select
                  required
                  value={cuentaOrigen}
                  onChange={(e) => setCuentaOrigen(e.target.value as CuentaOrigenPago)}
                  options={Object.entries(CUENTAS_ORIGEN_PAGO).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label="Monto del baucher (S/)">
                <Input type="number" min={0} step="0.01" value={voucherMonto} onChange={(e) => setVoucherMonto(e.target.value)} />
              </Field>
              <div className="md:col-span-3">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Subir baucher de pago (JPG, PNG, PDF)</span>
                <input ref={voucherRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" onChange={(e) => cargarVoucher(e.target.files?.[0])} />
                {!voucher ? (
                  <button
                    type="button"
                    onClick={() => voucherRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-plomo-200 px-4 py-6 text-center transition hover:border-slate-400 hover:bg-plomo-50 disabled:cursor-not-allowed disabled:hover:border-plomo-200 disabled:hover:bg-transparent"
                  >
                    <Upload size={24} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Haga clic para seleccionar el baucher</span>
                    <span className="text-xs text-slate-400">JPG, PNG o PDF · un archivo · máx. 5 MB</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 rounded-xl border border-plomo-200 bg-plomo-50 p-3 md:flex-row">
                    <div className="h-40 overflow-hidden rounded-lg border border-plomo-200 bg-white md:w-56">
                      {voucher.file.type.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={voucher.url} alt="Vista previa baucher" className="h-full w-full object-contain" />
                      ) : (
                        <iframe src={voucher.url} title="Vista previa baucher" className="h-full w-full" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between gap-2">
                      <div>
                        <p className="break-all text-sm font-medium text-azul-900">{voucher.file.name}</p>
                        <p className="text-xs text-plomo-500">{(voucher.file.size / 1048576).toFixed(2)} MB</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => voucherRef.current?.click()}>
                          <Upload size={14} /> Reemplazar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setVoucher(null)}>
                          <Trash2 size={14} className="text-red-600" /> Eliminar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>
        {coti && (
          <>
            {competidoras.length > 1 && coti.total > minimo && (
              <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle size={16} /> Existe una cotización más barata para {coti.reqNumero} ({soles(minimo)}).
              </div>
            )}
            <Table head={["Producto", "Marca", "Cant.", "Und.", "P. Unit.", "Subtotal"]}>
              {coti.items.map((i) => (
                <tr key={i.itemReqId}>
                  <Td className="font-medium">{i.nombre}</Td>
                  <Td>{i.marca || "-"}</Td>
                  <Td>{i.cantidad}</Td>
                  <Td>{i.unidad}</Td>
                  <Td className="text-right">{soles(i.precioUnit)}</Td>
                  <Td className="text-right">{soles(i.subtotal)}</Td>
                </tr>
              ))}
            </Table>
            <Totales subtotal={coti.subtotal} igv={coti.igv} />
          </>
        )}
        <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
          <Button onClick={guardar} disabled={!habilitado || !cotiId || enviando}>
            <ShoppingBag size={16} /> {enviando ? "Emitiendo…" : "Emitir OC"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Órdenes de compra" />
        <Table head={["Nro OC", "Fecha", "Proveedor", "Cotización", "REQ", "Forma pago", "Cuenta pago", "Baucher", "Total", "Estado", "Acciones"]} empty={ordenes.length === 0}>
          {ordenes.map((o) => (
            <tr key={o.id} className="hover:bg-plomo-50">
              <Td className="font-semibold text-azul-900">{o.numero}</Td>
              <Td>{fechaPE(o.fecha)}</Td>
              <Td>{o.proveedor}</Td>
              <Td>{o.cotizacionNumero}</Td>
              <Td>{o.reqNumero}</Td>
              <Td>{o.formaPago}</Td>
              <Td>{o.cuentaOrigenPago ? CUENTAS_ORIGEN_PAGO[o.cuentaOrigenPago] : "-"}</Td>
              <Td>
                {o.voucherUrl ? (
                  <Button size="sm" variant="ghost" title={o.voucherNombre} onClick={() => verVoucher(o.voucherUrl!)}>
                    <Receipt size={14} /> Ver{o.voucherMonto !== undefined ? ` · ${soles(o.voucherMonto)}` : ""}
                  </Button>
                ) : (
                  "-"
                )}
              </Td>
              <Td className="text-right font-semibold">{soles(o.total)}</Td>
              <Td>
                <Badge estado={o.estado} />
              </Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "OC", id: o.id })}>
                    <Eye size={15} />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => pdfOrdenCompra(o)}>
                    <FileText size={14} /> Ver PDF
                  </Button>
                  {o.estado === "EMITIDA" && puede(rol, "fac.crear") && (
                    <Button size="sm" onClick={() => onFacturar(o.id)}>
                      Registrar factura
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// =====================================================================
// FACTURAS + DECLARACIÓN JURADA
// =====================================================================
function Facturas({
  rol,
  ocs,
  ordenes,
  facturas,
  preOc,
  onGuia,
}: {
  rol: Rol;
  ocs: OrdenCompra[];
  ordenes: OrdenCompra[];
  facturas: Factura[];
  preOc?: string;
  onGuia: (id: string) => void;
}) {
  const [modo, setModo] = useState<"FACTURA" | "DJ">("FACTURA");
  const [ocId, setOcId] = useState(preOc ?? "");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [venc, setVenc] = useState(hoy());
  const [subtotal, setSubtotal] = useState(0);
  // DJ
  const [dni, setDni] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [motivoDJ, setMotivoDJ] = useState("");
  const [aprobador, setAprobador] = useState("");
  const [filtroPago, setFiltroPago] = useState("");

  const oc = ocs.find((o) => o.id === ocId);
  const igv = r2(subtotal * IGV);
  const difiere = oc && Math.abs(subtotal - oc.subtotal) > 0.01;

  useEffect(() => {
    if (oc) {
      setSubtotal(oc.subtotal);
      setVenc(sumarDias(fecha, diasCredito(oc.formaPago)));
    }
  }, [oc, fecha]);

  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    const ok =
      modo === "FACTURA"
        ? ejecutar(() => crearFactura({ ocId, numero, fecha, fechaVencimiento: venc, subtotal }, rol), "Factura registrada")
        : await ejecutarAsync(
            () => crearDeclaracionJurada({ ocId, fecha, dniVendedor: dni, nombreVendedor: vendedor, motivoSinComprobante: motivoDJ, aprobadoPor: aprobador }, rol),
            "Declaración jurada registrada"
          );
    setEnviando(false);
    if (ok) {
      setOcId("");
      setNumero("");
      setDni("");
      setVendedor("");
      setMotivoDJ("");
    }
  };

  const ocsDJ = ocs.filter((o) => o.subtotal <= TOPE_DJ);
  const lista = facturas.filter((f) => !filtroPago || f.estadoPago === filtroPago);
  // Por pagar al proveedor: en gastos con detracción, el neto (la detracción va al Banco de la Nación)
  const porPagar = r2(facturas.filter((f) => f.estadoPago === "POR_PAGAR").reduce((a, f) => a + (f.netoPagar ?? f.total), 0));

  return (
    <div className="space-y-6">
      {puede(rol, "fac.crear") && (
        <Card>
          <CardHeader
            title={modo === "FACTURA" ? "Registrar factura" : "Declaración jurada de compra"}
            subtitle={modo === "FACTURA" ? "Vinculada a una Orden de Compra. IGV y total se calculan automáticamente." : `Excepción: compras sin comprobante, tope ${soles(TOPE_DJ)}, requiere aprobación de Gerencia.`}
            action={
              <div className="flex rounded-lg bg-plomo-100 p-0.5 text-sm">
                {(["FACTURA", "DJ"] as const).map((m) => (
                  <button key={m} onClick={() => { setModo(m); setOcId(""); }} className={cn("rounded-md px-3 py-1.5 font-medium", modo === m ? "bg-white shadow" : "text-plomo-500")}>
                    {m === "FACTURA" ? "Factura" : "Decl. Jurada"}
                  </button>
                ))}
              </div>
            }
          />
          <div className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Orden de compra" className="md:col-span-3">
              <Select
                value={ocId}
                onChange={(e) => setOcId(e.target.value)}
                placeholder={(modo === "FACTURA" ? ocs : ocsDJ).length ? "Seleccione Nro OC…" : "No hay OC pendientes de comprobante"}
                options={(modo === "FACTURA" ? ocs : ocsDJ).map((o) => ({ value: o.id, label: `${o.numero} · ${o.proveedor} · ${soles(o.total)} · ${o.formaPago}` }))}
              />
            </Field>
            {modo === "FACTURA" ? (
              <>
                <Field label="Nro factura">
                  <Input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="F001-00001234" />
                </Field>
                <Field label="Fecha emisión">
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Field>
                <Field label="Fecha vencimiento" hint={oc ? `Según forma de pago: ${oc.formaPago}` : undefined}>
                  <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
                </Field>
                <Field label="Proveedor">
                  <Input value={oc ? `${oc.proveedor} (${oc.ruc})` : ""} disabled />
                </Field>
                <Field label="Subtotal (base imponible)" hint={difiere ? `⚠ Difiere de la OC (${soles(oc!.subtotal)})` : undefined}>
                  <Input type="number" step="0.01" value={subtotal || ""} onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)} className={cn("text-right", difiere && "border-amber-400")} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="IGV 18%">
                    <Input value={soles(igv)} disabled className="text-right" />
                  </Field>
                  <Field label="Total">
                    <Input value={soles(r2(subtotal + igv))} disabled className="text-right font-bold" />
                  </Field>
                </div>
              </>
            ) : (
              <>
                {rol !== "GERENCIA" && (
                  <div className="flex items-center gap-2 rounded-lg bg-[#EEF2F7] px-3 py-2 text-sm text-azul-700 md:col-span-3">
                    <AlertTriangle size={16} /> Solo el rol GERENCIA puede aprobar una declaración jurada. Cambie de rol en el menú lateral.
                  </div>
                )}
                <Field label="DNI vendedor">
                  <Input value={dni} maxLength={8} inputMode="numeric" onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))} />
                </Field>
                <Field label="Nombre del vendedor" className="md:col-span-2">
                  <Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Field>
                <Field label="Aprobado por" className="md:col-span-2">
                  <Input value={aprobador} onChange={(e) => setAprobador(e.target.value)} placeholder="Nombre del gerente" />
                </Field>
                <Field label="Motivo (¿por qué no hay comprobante?)" className="md:col-span-3">
                  <Textarea value={motivoDJ} onChange={(e) => setMotivoDJ(e.target.value)} placeholder="Ej: compra en zona rural a persona natural sin RUC" />
                </Field>
                {oc && (
                  <p className="text-sm text-plomo-600 md:col-span-3">
                    Monto a declarar: <b>{soles(oc.subtotal)}</b> (sin IGV, sin crédito fiscal)
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
            <Button onClick={guardar} disabled={!ocId || enviando || (modo === "DJ" && rol !== "GERENCIA")}>
              <Receipt size={16} /> {modo === "FACTURA" ? "Registrar factura" : "Aprobar declaración jurada"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Facturas y comprobantes"
          subtitle={`Total por pagar: ${soles(porPagar)}`}
          action={
            <Select
              value={filtroPago}
              onChange={(e) => setFiltroPago(e.target.value)}
              placeholder="Todos"
              options={[
                { value: "POR_PAGAR", label: "Por pagar" },
                { value: "PAGADA", label: "Pagadas" },
              ]}
              className="w-40"
            />
          }
        />
        <Table head={["Tipo", "Nro", "Fecha", "Vence", "Proveedor", "OC", "Subtotal", "IGV", "Total", "Pago", "Acciones"]} empty={lista.length === 0}>
          {lista.map((f) => {
            const vencida = f.estadoPago === "POR_PAGAR" && f.fechaVencimiento < hoy();
            return (
              <tr key={f.id} className="hover:bg-plomo-50">
                <Td>
                  {f.esGastoTesoreria ? (
                    <>
                      <Badge estado="GASTO_TESORERIA" />
                      <p className="mt-0.5 text-[11px] text-plomo-500">{f.comprobanteGasto ? COMPROBANTES_GASTO[f.comprobanteGasto] : ""}</p>
                    </>
                  ) : (
                    <Badge estado={f.tipo} />
                  )}
                </Td>
                <Td className="font-semibold text-azul-900">{f.numero}</Td>
                <Td>{fechaPE(f.fecha)}</Td>
                <Td className={cn(vencida && "font-semibold text-red-600")}>{fechaPE(f.fechaVencimiento)}</Td>
                <Td>{f.proveedor}</Td>
                <Td>
                  {f.esGastoTesoreria ? (
                    <>
                      {f.codigo && <p className="font-mono text-xs font-semibold text-azul-900">{f.codigo}</p>}
                      <span className="text-xs text-plomo-600">{f.tipoGasto ? TIPOS_GASTO[f.tipoGasto] : "Gasto"}</span>
                    </>
                  ) : (
                    f.ocNumero
                  )}
                </Td>
                <Td className="text-right">{soles(f.subtotal)}</Td>
                <Td className="text-right">{soles(f.igv)}</Td>
                <Td className="text-right font-semibold">
                  {soles(f.total)}
                  {f.detraccionMonto ? (
                    <p className="text-[11px] font-normal text-plomo-500">
                      Detr. − {soles(f.detraccionMonto)} · neto {soles(f.netoPagar ?? f.total)}
                    </p>
                  ) : null}
                </Td>
                <Td>
                  <button
                    disabled={!puede(rol, "fac.pagar")}
                    onClick={() => ejecutar(() => marcarPago(f.id, f.estadoPago === "POR_PAGAR", rol), f.estadoPago === "POR_PAGAR" ? `${f.numero} marcada como pagada` : `${f.numero} revertida a por pagar`)}
                    title="Cambiar estado de pago"
                    className="disabled:cursor-not-allowed"
                  >
                    <Badge estado={f.estadoPago} />
                  </button>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "FACTURA", id: f.id })}>
                      <Eye size={15} />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => pdfFactura(f, ordenes.find((o) => o.id === f.ocId))}>
                      <FileText size={14} /> PDF
                    </Button>
                    {(f.archivos ?? []).map((a) => (
                      <Button
                        key={a.tipo}
                        size="sm"
                        variant="ghost"
                        title={a.nombre}
                        onClick={() => {
                          const w = window.open();
                          if (w) w.document.write(`<iframe src="${a.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);
                        }}
                      >
                        <Upload size={14} /> {a.tipo === "GUIA" ? "Guía" : "Adjunto"}
                      </Button>
                    ))}
                    {f.tipo === "FACTURA" && ordenes.find((o) => o.id === f.ocId)?.estado === "FACTURADA" && puede(rol, "guia.crear") && (
                      <Button size="sm" onClick={() => onGuia(f.id)}>
                        Subir guía
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}

// =====================================================================
// GUÍAS DE REMISIÓN (drag & drop)
// =====================================================================
function Guias({ rol, facturas, guias, preFac }: { rol: Rol; facturas: Factura[]; guias: Guia[]; preFac?: string }) {
  const [facId, setFacId] = useState(preFac ?? "");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [archivo, setArchivo] = useState<{ nombre: string; tipo: string; url: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fac = facturas.find((f) => f.id === facId);
  const observada = guias.find((g) => g.facturaId === facId && g.estado === "OBSERVADA");

  const cargar = (file: File | undefined) => {
    if (!file) return;
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.type)) {
      toast("Formato no permitido. Use PDF, JPG, PNG o WEBP.", "error");
      return;
    }
    if (file.size > MAX_ARCHIVO) {
      toast(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB (comprima o escanee en menor resolución).`, "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setArchivo({ nombre: file.name, tipo: file.type, url: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    cargar(e.dataTransfer.files[0]);
  };

  const guardar = () => {
    const ok = ejecutar(
      () =>
        crearGuia(
          { facturaId: facId, numero, fecha, archivoNombre: archivo?.nombre ?? "", archivoTipo: archivo?.tipo ?? "", archivoDataUrl: archivo?.url ?? "" },
          rol
        ),
      "Guía cargada. Almacén ya puede dar el visto bueno."
    );
    if (ok) {
      setFacId("");
      setNumero("");
      setArchivo(null);
    }
  };

  return (
    <div className="space-y-6">
      {puede(rol, "guia.crear") && (
        <Card>
          <CardHeader title="Cargar guía de remisión" subtitle="Suba la guía escaneada (PDF o imagen) vinculada a la factura / OC." />
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Factura / OC">
                <Select
                  value={facId}
                  onChange={(e) => setFacId(e.target.value)}
                  placeholder={facturas.length ? "Seleccione factura…" : "No hay facturas pendientes de guía"}
                  options={facturas.map((f) => ({ value: f.id, label: `${f.numero} · ${f.ocNumero} · ${f.proveedor}` }))}
                />
              </Field>
              {observada && (
                <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  Guía {observada.numero} fue OBSERVADA por almacén: {observada.historial[observada.historial.length - 1]?.detalle}. Cargue la guía corregida.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nro guía">
                  <Input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="T001-000123" />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Field>
              </div>
              {fac && (
                <p className="text-sm text-plomo-600">
                  Proveedor: <b>{fac.proveedor}</b> · Total factura: <b>{soles(fac.total)}</b>
                </p>
              )}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition",
                  drag ? "border-azul-900 bg-plomo-100" : "border-plomo-200 hover:border-slate-400 hover:bg-plomo-50"
                )}
              >
                <Upload size={28} className="text-slate-400" />
                <p className="text-sm font-medium text-slate-700">{archivo ? archivo.nombre : "Arrastre aquí la guía o haga clic"}</p>
                <p className="text-xs text-slate-400">PDF, JPG, PNG · máx. 1.5 MB</p>
                <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => cargar(e.target.files?.[0])} />
              </div>
            </div>
            <div className="min-h-[300px] overflow-hidden rounded-xl border border-plomo-200 bg-plomo-50">
              {!archivo ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Vista previa</div>
              ) : archivo.tipo.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={archivo.url} alt="Vista previa guía" className="h-full max-h-[460px] w-full object-contain" />
              ) : (
                <iframe src={archivo.url} title="Vista previa guía" className="h-[460px] w-full" />
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-plomo-100 px-5 py-4">
            {archivo && (
              <Button variant="secondary" onClick={() => setArchivo(null)}>
                Quitar archivo
              </Button>
            )}
            <Button onClick={guardar} disabled={!facId || !archivo}>
              <Truck size={16} /> Guardar guía
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Guías de remisión" />
        {guias.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Truck size={28} />} text="Aún no se cargan guías" />
          </div>
        ) : (
          <Table head={["Nro guía", "Fecha", "Factura", "OC", "Archivo", "Estado", ""]}>
            {guias.map((g) => (
              <tr key={g.id} className="hover:bg-plomo-50">
                <Td className="font-semibold text-azul-900">{g.numero}</Td>
                <Td>{fechaPE(g.fecha)}</Td>
                <Td>{g.facturaNumero}</Td>
                <Td>{g.ocNumero}</Td>
                <Td className="max-w-[200px] truncate">{g.archivoNombre}</Td>
                <Td>
                  <Badge estado={g.estado} />
                </Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => abrirDoc({ tipo: "GUIA", id: g.id })}>
                    <Eye size={14} /> Ver
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
