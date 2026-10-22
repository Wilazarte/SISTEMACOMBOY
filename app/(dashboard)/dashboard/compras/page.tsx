"use client";

import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
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
  Pencil,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  Truck,
  Upload,
  X,
  Users,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Tabs, Td, Textarea, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import { abrirDoc } from "@/components/doc-viewer";
import { FormGasto } from "@/components/compras/FormGasto";
import { SelectorCaja } from "@/components/SelectorCaja";
import { FormBancarizacion, bancarizacionVacia } from "@/components/compras/FormBancarizacion";
import { CAJA_POR_DEFECTO } from "@/lib/cajas";
import {
  IGV,
  COMPROBANTES_GASTO,
  CUENTAS_ORIGEN_PAGO,
  cuentaOrigenDeCaja,
  bancarizarOC,
  requiereBancarizacion,
  TOPE_BANCARIZACION,
  TIPOS_GASTO,
  KEYS,
  esContratista,
  esDeclaracionJurada,
  MAX_ARCHIVO,
  TOPE_DJ,
  abrirArchivo,
  permisoEditarGasto,
  aceptarMultiple,
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
  motivoNoEditableOC,
  editarOrdenCompra,
  type EdicionOC,
  observarRequerimiento,
  parseFechaPE,
  puede,
  r2,
  subirBaucher,
  rechazarMultiple,
  rechazarRequerimiento,
  registrarCompra,
  editarCompra,
  eliminarCompra,
  permisoEditarCompra,
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
import { asientoOrdenCompra, reasentarOrdenCompra } from "@/lib/contable";
import { getSesion, puedeVer } from "@/lib/auth";
import PlanillaInterna from "@/components/tesoreria/PlanillaTab";
import { DeclaracionesJuradas } from "@/components/tesoreria/DeclaracionesJuradas";
import { pdfDeclaracionJurada } from "@/lib/pdf";
import { EditarReq, permisoEditarReq } from "@/components/compras/EditarReq";
import TesoreriaLeftDrawer from "@/components/tesoreria/TesoreriaLeftDrawer";
import QuickActions, { QA_IDS } from "@/components/tesoreria/QuickActions";
import { BotonNuevo } from "@/components/ui/BotonFiltros";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { EditarGasto } from "@/components/compras/EditarGasto";
import type { Trabajador } from "@/lib/types";
import type { Bancarizacion, Compra, Cotizacion, Factura, FormaPago, Guia, ItemCompra, ItemPrecio, OrdenCompra, Proveedor, Requerimiento, Rol, StockItem, TipoComprobanteCompra } from "@/lib/types";

type Tab = "registrar" | "antecedentes" | "cotizaciones" | "ordenes" | "facturas" | "guias" | "planilla" | "declaraciones";

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

/** X / Cancelar arriba a la derecha de un formulario que se abrió con las acciones rápidas. */
function CerrarForm({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} title="Cerrar formulario">
      <X size={15} /> Cancelar
    </Button>
  );
}

// =====================================================================
/** Botones de acción de la tarjeta REQ por revisar (tema azul): pill compacta con glow. */
const BTN_REQ =
  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-white transition duration-150 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100";

/** Última pestaña abierta de Tesorería / Compras (por navegador). */
const CLAVE_TAB = "tesoreria-tab-activa";

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

  // Planilla vive aquí (antes /dashboard/planilla): quien solo tiene Planilla ve solo esa pestaña
  const sesion = getSesion();
  const veCompras = puedeVer(sesion, "/dashboard/compras");
  const vePlanilla = puedeVer(sesion, "/dashboard/planilla");
  const [tab, setTab] = useState<Tab>(!veCompras ? "planilla" : puede(rol, "compra.crear") ? "registrar" : "antecedentes");
  // Contador de la pestaña Planilla (solo se descarga si el usuario ve planilla)
  const trabajadores = useStore<Trabajador[]>(KEYS.TRABAJADORES, [], vePlanilla);
  const activos = trabajadores.filter((t) => t.activo && !esContratista(t)).length;
  const tabsPermitidas: Tab[] = [...(veCompras ? (["registrar", "antecedentes", "cotizaciones", "ordenes", "facturas", "declaraciones"] as Tab[]) : []), ...(vePlanilla ? (["planilla"] as Tab[]) : [])];
  // Al volver a Tesorería abre la última pestaña usada (salvo que la URL pida otra con ?tab=)
  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CLAVE_TAB) as Tab | null;
      // Planilla tiene su propio botón en el dock: "Tesorería / Compras" nunca reabre en Planilla
      if (!new URLSearchParams(window.location.search).get("tab") && guardada && guardada !== "planilla" && tabsPermitidas.includes(guardada)) setTab(guardada);
    } catch {
      /* almacenamiento bloqueado */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (tab !== "planilla") window.localStorage.setItem(CLAVE_TAB, tab);
    } catch {
      /* almacenamiento bloqueado */
    }
  }, [tab]);
  const [pre, setPre] = useState<{ req?: string; coti?: string; oc?: string; fac?: string }>({});

  const ir = (t: Tab, p: typeof pre = {}) => {
    setPre(p);
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Acciones rápidas: solo saltan a pestañas que este usuario ve
  const irTab = (t: string) => tabsPermitidas.includes(t as Tab) && ir(t as Tab);

  const cotizables = procesados.filter((r) => r.estado === "ACEPTADO" || r.estado === "COTIZADO");
  const cotisSinOC = cotizaciones.filter((c) => c.estado === "REGISTRADA" && !ordenes.some((o) => o.reqId === c.reqId));
  // Flujo: OC EMITIDA -> BANCARIZADA -> FACTURA (la OC que no requiere bancarización puede facturarse EMITIDA)
  const ocsSinFactura = ordenes.filter((o) => o.estado === "EMITIDA" || o.estado === "BANCARIZADA");
  // Los gastos de Tesorería no llevan guía ni V°B° (no ingresan a almacén)
  const facturasSinGuia = facturas.filter((f) => f.tipo === "FACTURA" && !f.esGastoTesoreria && (!guias.some((g) => g.facturaId === f.id) || guias.some((g) => g.facturaId === f.id && g.estado === "OBSERVADA")));

  const enPlanilla = tab === "planilla";

  return (
    // Requerimientos por revisar: sección de la barra derecha de notificaciones (layout)
    <div className="w-full space-y-6">
      {/* Planilla (botón propio del dock) muestra solo su título, isla y contenido */}
      {!enPlanilla && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif tracking-tight text-2xl font-bold leading-tight text-fg lg:text-[28px]">Tesorería / Compras</h1>
          </div>
          {!puede(rol, "req.revisar") && (
            <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-plomo-600">Modo lectura para su rol</span>
          )}
        </div>
      )}

      {veCompras && <Notificaciones pendientes={pendientes} rol={rol} />}

      {/* Isla de Tesorería sin Planilla: Planilla abre desde su botón del dock y dibuja su propia isla */}
      <Tabs<Tab>
        value={tab}
        onChange={(t) => ir(t)}
        fueraDeIsla={["planilla"]}
        tabs={[
          // Isla: Registrar gasto · Cotizaciones · Órdenes compra · Facturas · Declaraciones · Antecedentes
          ...(veCompras
            ? [
                { id: "registrar" as const, label: "Registrar gasto", icon: <PackagePlus size={16} /> },
                { id: "cotizaciones" as const, label: "Cotizaciones", icon: <FileSpreadsheet size={16} />, count: cotizables.filter((r) => r.estado === "ACEPTADO").length },
                { id: "ordenes" as const, label: "Órdenes compra", icon: <ShoppingBag size={16} />, count: cotisSinOC.length },
                { id: "facturas" as const, label: "Facturas", icon: <Receipt size={16} />, count: ocsSinFactura.length },
                // Guías de remisión: ya no son parte del flujo (pestaña oculta; las guías cargadas siguen guardadas)
              ]
            : []),
          ...(vePlanilla ? [{ id: "planilla" as const, label: "Planilla", icon: <Users size={16} />, count: activos }] : []),
          ...(veCompras
            ? [
                { id: "declaraciones" as const, label: "Declaraciones", icon: <FileText size={16} />, count: facturas.filter(esDeclaracionJurada).length },
                { id: "antecedentes" as const, label: "Antecedentes", icon: <History size={16} /> },
              ]
            : []),
        ]}
      />

      {tab === "registrar" && <RegistrarCompra rol={rol} proveedores={proveedores} compras={compras} gastos={facturas.filter((f) => f.esGastoTesoreria)} stock={stock} />}
      {tab === "antecedentes" && <Antecedentes reqs={procesados} ordenes={ordenes} rol={rol} onCotizar={(id) => ir("cotizaciones", { req: id })} onIr={irTab} />}
      {tab === "cotizaciones" && (
        <Cotizaciones key={pre.req ?? "c"} rol={rol} reqs={cotizables} cotizaciones={cotizaciones} preReq={pre.req} onOC={(id) => ir("ordenes", { coti: id })} onIr={irTab} />
      )}
      {tab === "ordenes" && (
        <Ordenes key={pre.coti ?? "o"} rol={rol} cotis={cotisSinOC} todasCotis={cotizaciones} ordenes={ordenes} reqs={procesados} preCoti={pre.coti} onFacturar={(id) => ir("facturas", { oc: id })} onIr={irTab} onVerCoti={(reqId) => ir("cotizaciones", { req: reqId })} />
      )}
      {tab === "facturas" && <Facturas key={pre.oc ?? "f"} rol={rol} ocs={ocsSinFactura} ordenes={ordenes} facturas={facturas} preOc={pre.oc} onIr={irTab} />}
      {tab === "declaraciones" && veCompras && <DeclaracionesJuradas facturas={facturas} rol={rol} />}
      {tab === "planilla" && vePlanilla && (
        <div>
          <PlanillaInterna />
        </div>
      )}
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
  // Aprobación en lote: ids marcados (se limpian los que ya no están pendientes)
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [rechazoLote, setRechazoLote] = useState(false);
  const [editReq, setEditReq] = useState<Requerimiento | null>(null);
  const sesion = getSesion();
  const habilitado = puede(rol, "req.revisar");
  const elegidos = pendientes.filter((r) => marcados.has(r.id)).map((r) => r.id);
  const todos = pendientes.length > 0 && elegidos.length === pendientes.length;
  const marcar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const plural = (n: number, txt: string) => `${n} requerimiento${n === 1 ? "" : "s"} ${txt}${n === 1 ? "" : "s"}`;
  const aceptarLote = () => {
    if (ejecutar(() => void aceptarMultiple(elegidos, rol), plural(elegidos.length, "aceptado"))) setMarcados(new Set());
  };

  if (pendientes.length === 0)
    return (
      <TesoreriaLeftDrawer cantidad={0}>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <Check size={16} /> No hay requerimientos pendientes de revisión.
        </div>
      </TesoreriaLeftDrawer>
    );

  return (
    <>
      <TesoreriaLeftDrawer
        cantidad={pendientes.length}
        acciones={
          habilitado && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs font-medium text-white">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2a7bff]"
                  checked={todos}
                  onChange={() => setMarcados(todos ? new Set() : new Set(pendientes.map((r) => r.id)))}
                />
                Seleccionar todos ({pendientes.length})
              </label>
              <button className={`${BTN_REQ} h-7 border-[#2a7bff] bg-[#2a7bff] px-2`} disabled={elegidos.length === 0} onClick={aceptarLote}>
                <Check size={13} /> Aceptar{elegidos.length ? ` (${elegidos.length})` : ""}
              </button>
              <button className={`${BTN_REQ} h-7 border-[#ff1a1a] bg-[#ff1a1a] px-2 font-bold`} disabled={elegidos.length === 0} onClick={() => setRechazoLote(true)}>
                <X size={13} /> Rechazar{elegidos.length ? ` (${elegidos.length})` : ""}
              </button>
            </>
          )
        }
      >
        {pendientes.map((r) => (
          <div key={r.id} className={cn("flex flex-col rounded-lg border bg-[#111827] p-3", marcados.has(r.id) ? "border-[#2a7bff]" : "border-amber-500/30")}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                {habilitado && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#2a7bff]"
                    checked={marcados.has(r.id)}
                    onChange={() => marcar(r.id)}
                    aria-label={`Seleccionar ${r.numero}`}
                  />
                )}
                <div>
                <p className="font-bold text-fg">{r.numero}</p>
                <p className="text-xs text-plomo-600">
                  {fechaPE(r.fecha)} · {r.sede}
                </p>
                </div>
              </div>
              <span className="rounded-full bg-[#fbbf24] px-2 py-0.5 text-[11px] font-bold text-black">PENDIENTE</span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-white">
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
              <button className={`${BTN_REQ} border-[#60a5fa] bg-[#1e3a8a] shadow-[0_0_12px_rgba(30,58,138,0.6)]`} onClick={() => abrirDoc({ tipo: "REQ", id: r.id })}>
                <Eye size={14} /> Ver
              </button>
              {(() => {
                const p = permisoEditarReq(r, sesion);
                return (
                  <span className="tip" data-tip={p.ok ? "Editar antes de revisar" : p.motivo}>
                    <button className={`${BTN_REQ} border-[#94a3b8]/60 bg-[#1e2a45] shadow-[0_0_10px_rgba(148,163,184,0.25)]`} disabled={!p.ok} onClick={() => setEditReq(r)}>
                      <Pencil size={14} /> Editar
                    </button>
                  </span>
                );
              })()}
              <button className={`${BTN_REQ} border-[#2a7bff] bg-[#2a7bff] shadow-[0_0_14px_rgba(42,123,255,0.6)]`} disabled={!habilitado} onClick={() => ejecutar(() => aceptarRequerimiento(r.id, rol), `${r.numero} ACEPTADO`)}>
                <Check size={14} /> Aceptar
              </button>
              <button className={`${BTN_REQ} border-[#2a7bff] bg-[#0e2a5f] shadow-[0_0_12px_rgba(42,123,255,0.35)]`} disabled={!habilitado} onClick={() => { setMotivo(""); setObs(r); }}>
                <MessageSquareWarning size={14} /> Observar
              </button>
              <button className={`${BTN_REQ} border-[#ff1a1a] bg-[#ff1a1a] font-bold shadow-[0_0_14px_rgba(255,26,26,0.6)]`} disabled={!habilitado} onClick={() => setRechazo(r)}>
                <X size={14} /> Rechazar
              </button>
            </div>
          </div>
        ))}
      </TesoreriaLeftDrawer>

      {editReq && <EditarReq req={editReq} rol={rol} onClose={() => setEditReq(null)} />}

      <Modal open={rechazoLote} onClose={() => setRechazoLote(false)} title={`Rechazar ${elegidos.length} requerimiento(s)`}>
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          {pendientes.filter((r) => marcados.has(r.id)).map((r) => r.numero).join(", ")} se <b>eliminarán de todo el sistema</b>. Esta acción no se puede deshacer.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRechazoLote(false)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (ejecutar(() => void rechazarMultiple(elegidos), `${plural(elegidos.length, "rechazado")} y eliminado${elegidos.length === 1 ? "" : "s"}`)) {
                setMarcados(new Set());
                setRechazoLote(false);
              }
            }}
          >
            Rechazar y eliminar
          </Button>
        </div>
      </Modal>

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
    </>
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
  const [cajaCompra, setCajaCompra] = useState(CAJA_POR_DEFECTO);
  const [filas, setFilas] = useState<FilaCompra[]>([filaVacia()]);
  const habilitado = puede(rol, "compra.crear");
  const sesion = getSesion();
  // Edición: el mismo formulario de "Registrar compra" con los datos de la compra
  const [editando, setEditando] = useState<Compra | null>(null);
  const [borrar, setBorrar] = useState<Compra | null>(null);
  const [editGasto, setEditGasto] = useState<Factura | null>(null);
  const [verCompra, setVerCompra] = useState<Compra | null>(null);
  const editarEnFormulario = (c: Compra) => {
    setEditando(c);
    setModo("COMPRA");
    setProveedorId(c.proveedorId);
    setFechaTxt(fechaPE(c.fecha));
    setTipo(c.tipoComprobante);
    setNumero(c.numero);
    setSede(c.sede);
    setCajaCompra(c.caja ?? CAJA_POR_DEFECTO);
    setFilas(c.items.map((i) => ({ id: uid(), nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad, precioUnit: i.precioUnit })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelarEdicion = () => {
    setEditando(null);
    setNumero("");
    setFilas([filaVacia()]);
  };

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
    const datos = { proveedorId, fecha: fechaISO, tipoComprobante: tipo, numero, sede, caja: cajaCompra, items: filas };
    const ok = editando
      ? ejecutar(() => void editarCompra(editando.id, datos, rol), `${editando.numero} corregida · stock de ${sede} ajustado`)
      : ejecutar(() => registrarCompra(datos, rol), `Compra registrada · stock de ${sede} actualizado`);
    if (ok) cancelarEdicion();
  };

  // Compras (con stock) y gastos de Tesorería en una sola lista, de la más reciente a la más antigua
  const registros = [
    ...compras.map((c) => ({ tipo: "COMPRA" as const, id: c.id, fecha: c.fecha, compra: c })),
    ...gastos.map((g) => ({ tipo: "GASTO_TESORERIA" as const, id: g.id, fecha: g.fecha, gasto: g })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalRegistros = r2(compras.reduce((a, c) => a + c.total, 0) + gastos.reduce((a, g) => a + g.total, 0));

  // Formulario oculto por defecto: se abre con "Nuevo registro" (o al editar una compra de la lista)
  const { showForm, setShowForm } = useTogglePanel();
  const verForm = habilitado && (showForm || !!editando);

  return (
    <div className="space-y-6">
      {habilitado && (
        <div className="mb-3 flex gap-2">
          <BotonNuevo
            abierto={verForm}
            label="Nuevo gasto / compra"
            onClick={() => {
              if (verForm) cancelarEdicion();
              setShowForm(!verForm);
            }}
          />
        </div>
      )}
      {verForm && (
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

      {verForm && modo === "GASTO" && <FormGasto rol={rol} proveedores={proveedores} stock={stock} />}

      {verForm && modo === "COMPRA" && (
        <Card>
          <CardHeader
            title={editando ? `Editar compra ${editando.numero}` : "Registrar compra"}
            subtitle={
              editando
                ? "Al guardar se devuelve al almacén lo que ingresó esta compra y entra lo corregido (queda como AJUSTE en el kardex)."
                : "Factura: precios sin IGV (se suma 18 %). Boleta: precios con IGV incluido. Al guardar, los productos ingresan al stock del almacén seleccionado."
            }
          />
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
            <SelectorCaja value={cajaCompra} onChange={setCajaCompra} className="md:col-span-2" />
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
            {editando && (
              <Button variant="secondary" onClick={cancelarEdicion} className="mr-2">
                Cancelar edición
              </Button>
            )}
            <Button onClick={guardar} disabled={!proveedorId || !fechaISO}>
              {editando ? <Pencil size={16} /> : <PackagePlus size={16} />} {editando ? "Guardar cambios" : "Guardar compra e ingresar a stock"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Compras registradas" subtitle={`${compras.length} compra(s) · ${gastos.length} gasto(s) de Tesorería · Total ${soles(totalRegistros)}`} />
        {/* Vista previa: una línea por registro. Comprobante, almacén / gasto, ítems, subtotal e IGV se ven en "Ver". */}
        <ListaDocs
          tipo="compras"
          filas={registros.map((r): FilaDoc => {
            if (r.tipo === "GASTO_TESORERIA") {
              const g = r.gasto;
              const p = permisoEditarGasto(g, sesion);
              return {
                id: g.id,
                fecha: g.fecha,
                contraparte: g.proveedor,
                subFecha: g.tipoGasto === "PLANILLA" ? <span className="text-plomo-500">{g.numero.replace(/^PLLA\s+/, "")}</span> : undefined,
                ref: esDeclaracionJurada(g) ? (
                  <span className="whitespace-nowrap">
                    <span className="font-semibold text-fg">{g.codigo ?? "-"}</span>
                    <button type="button" onClick={() => pdfDeclaracionJurada(g)} className="ml-1.5 text-xs font-semibold text-[#2a7bff] underline" title="Ver PDF de la declaración jurada">
                      {g.numero}
                    </button>
                  </span>
                ) : (
                  <span className="whitespace-nowrap font-semibold text-fg">{g.codigo ?? g.numero}</span>
                ),
                total: soles(g.total),
                buscar: `${g.codigo ?? ""} ${g.numero} ${g.ruc} ${g.descripcion ?? ""}`,
                tipoDoc: g.tipoGasto === "PLANILLA" ? "PLANILLA" : "GASTO",
                estado: g.estadoPago,
                acciones: (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "FACTURA", id: g.id })} title="Ver detalle" aria-label="Ver">
                      <Eye size={15} />
                    </Button>
                    <span className="tip" data-tip={p.ok ? "Editar" : p.motivo}>
                      <Button size="sm" variant="ghost" disabled={!p.ok} onClick={() => setEditGasto(g)} aria-label="Editar">
                        <Pencil size={15} />
                      </Button>
                    </span>
                  </div>
                ),
              };
            }
            const c = r.compra;
            const p = permisoEditarCompra(c, sesion);
            return {
              id: c.id,
              fecha: c.fecha,
              contraparte: c.proveedor,
              ref: <span className="whitespace-nowrap font-semibold text-fg">{c.numero}</span>,
              total: soles(c.total),
              buscar: `${c.numero} ${c.ruc} ${c.sede} ${c.items.map((i) => i.nombre).join(" ")}`,
              tipoDoc: "COMPRA",
              acciones: (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setVerCompra(c)} title="Ver detalle" aria-label="Ver">
                    <Eye size={15} />
                  </Button>
                  <span className="tip" data-tip={p.ok ? "Editar" : p.motivo}>
                    <Button size="sm" variant="ghost" disabled={!p.ok} onClick={() => editarEnFormulario(c)} aria-label="Editar">
                      <Pencil size={15} />
                    </Button>
                  </span>
                  <span className="tip" data-tip={p.ok ? "Eliminar" : p.motivo}>
                    <Button size="sm" variant="ghost" disabled={!p.ok} onClick={() => setBorrar(c)} aria-label="Eliminar">
                      <Trash2 size={15} className="text-red-600" />
                    </Button>
                  </span>
                </div>
              ),
            };
          })}
        />
      </Card>

      {editGasto && <EditarGasto gasto={editGasto} rol={rol} onClose={() => setEditGasto(null)} />}

      <Modal open={!!verCompra} onClose={() => setVerCompra(null)} title={`Compra ${verCompra?.numero ?? ""}`} wide>
        {verCompra && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {(
                [
                  ["Comprobante", `${verCompra.tipoComprobante === "FACTURA" ? "Factura" : "Boleta"} ${verCompra.numero}`],
                  ["Fecha", fechaPE(verCompra.fecha)],
                  ["Proveedor", `${verCompra.proveedor} · RUC ${verCompra.ruc}`],
                  ["Ingresó a almacén", verCompra.sede],
                  ["Pagado desde", verCompra.caja ?? "-"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-plomo-500">{k}</dt>
                  <dd className="text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <Table head={["Producto", "Unidad", "Cantidad", "P. unit.", "Subtotal"]}>
              {verCompra.items.map((i) => (
                <tr key={i.id}>
                  <Td>{i.nombre}</Td>
                  <Td>{i.unidad}</Td>
                  <Td className="text-right">{i.cantidad}</Td>
                  <Td className="text-right">{soles(i.precioUnit)}</Td>
                  <Td className="text-right">{soles(i.subtotal)}</Td>
                </tr>
              ))}
            </Table>
            <Totales subtotal={verCompra.subtotal} igv={verCompra.igv} total={verCompra.total} />
          </div>
        )}
      </Modal>

      <Modal open={!!borrar} onClose={() => setBorrar(null)} title={`Eliminar compra ${borrar?.numero ?? ""}`}>
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          <span>
            Se elimina la compra y se <b>saca del almacén {borrar?.sede}</b> lo que ingresó ({borrar?.items.length} producto(s)), como AJUSTE en el kardex. Si esos productos ya se usaron, no se podrá eliminar.
          </span>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBorrar(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (borrar && ejecutar(() => eliminarCompra(borrar.id, rol), `${borrar.numero} eliminada · stock ajustado`)) {
                if (editando?.id === borrar.id) cancelarEdicion();
                setBorrar(null);
              }
            }}
          >
            Eliminar compra
          </Button>
        </div>
      </Modal>

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
function Antecedentes({ reqs, ordenes, rol, onCotizar, onIr }: { reqs: Requerimiento[]; ordenes: OrdenCompra[]; rol: Rol; onCotizar: (id: string) => void; onIr: (tab: string) => void }) {
  // Búsqueda y estado: en el panel "Buscar / Filtrar" de la lista (oculto por defecto)
  const lista = reqs;
  return (
    <div>
      <QuickActions tab="requerimiento" onIr={onIr} puedeCrear={puede(rol, "req.crear")} />
      <Card id={QA_IDS.listaRequerimientos}>
      <CardHeader
        title="Antecedentes de requerimientos"
        subtitle="Histórico de REQ aceptados, observados y en proceso de compra"
      />
      <ListaDocs
          tipo="requerimientos"
          filas={lista.map((r): FilaDoc => {
          const oc = ordenes.find((o) => o.reqId === r.id);
          return {
          id: r.id,
          fecha: r.fecha,
          contraparte: r.solicitante,
          ref: (
            <>
              <span className="font-semibold text-fg">{r.numero}</span>
                {oc && <span className="ml-1.5 text-xs text-plomo-500">→ {oc.numero}</span>}
                <span className="ml-2 inline-block align-middle"><Badge estado={r.estado} /></span>
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
                  {(r.estado === "ACEPTADO" || r.estado === "COTIZADO") && puede(rol, "coti.crear") && (
                    <Button size="sm" variant="secondary" onClick={() => onCotizar(r.id)}>
                      Cotizar
                    </Button>
                  )}
                </div>
            </>
          ),
          buscar: `${r.numero} ${r.sede} ${r.motivo} ${oc?.numero ?? ""}`,
          tipoDoc: "REQ",
          estado: r.estado,
          };
        })}
        />
      </Card>
    </div>
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
  onIr,
}: {
  rol: Rol;
  reqs: Requerimiento[];
  cotizaciones: Cotizacion[];
  preReq?: string;
  onOC: (id: string) => void;
  onIr: (tab: string) => void;
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

  // Por defecto solo la lista; el formulario se abre con "Nueva COT" (o al venir de "Cotizar" con un REQ elegido)
  const [showRegistrar, setShowRegistrar] = useState(!!preReq);
  const nuevaCoti = () => {
    setReqId("");
    setProveedor("");
    setRuc("");
    setNumero("");
    setFecha(hoy());
    setShowRegistrar(true);
  };

  return (
    <div className="space-y-6">
      <QuickActions tab="cotizacion" onIr={onIr} onBuscar={() => setShowRegistrar(false)} onNuevo={nuevaCoti} puedeCrear={habilitado} />
      {habilitado && showRegistrar && (
        <Card id={QA_IDS.formCotizacion}>
          <CardHeader
            title="Registrar cotización"
            subtitle="Vinculada a un requerimiento ACEPTADO. Puede registrar varias cotizaciones por REQ para comparar."
            action={<CerrarForm onClick={() => setShowRegistrar(false)} />}
          />
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

      {!showRegistrar && (
      <Card id={QA_IDS.listaCotizaciones}>
        <CardHeader title="Cotizaciones registradas" subtitle="★ = menor precio del requerimiento" />
        <ListaDocs
          tipo="cotizaciones"
          filas={cotizaciones.map((c): FilaDoc => {
          return {
          id: c.id,
          fecha: c.fechaEmision,
          contraparte: c.proveedor,
          ref: (
            <>
              <span className="font-semibold text-fg">{c.numero}</span>
                <span className="ml-1.5 text-xs text-plomo-500">{c.reqNumero}</span>
                <span className="ml-2 inline-block align-middle"><Badge estado={c.estado} /></span>
            </>
          ),
          total: (
            <>
              {minPorReq[c.reqId] === c.total && <span className="mr-1 text-rojo">★</span>}
                {soles(c.total)}
            </>
          ),
          acciones: (
            <>
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
            </>
          ),
          buscar: `${c.numero} ${c.reqNumero} ${c.ruc}`,
          tipoDoc: "COTI",
          estado: c.estado,
          };
        })}
        />
      </Card>
      )}
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
  onIr,
  onVerCoti,
}: {
  rol: Rol;
  cotis: Cotizacion[];
  todasCotis: Cotizacion[];
  ordenes: OrdenCompra[];
  reqs: Requerimiento[];
  preCoti?: string;
  onFacturar: (id: string) => void;
  onIr: (tab: string) => void;
  /** Abre Cotizaciones con el REQ de la cotización elegida. */
  onVerCoti: (reqId: string) => void;
}) {
  const [bancarizar, setBancarizar] = useState<OrdenCompra | null>(null);
  const [editar, setEditar] = useState<OrdenCompra | null>(null);
  const facturasOC = useStore<Factura[]>(KEYS.FACTURAS, []);
  const [banc, setBanc] = useState<Bancarizacion>(bancarizacionVacia);
  const [cotiId, setCotiId] = useState(preCoti ?? "");
  const [fecha, setFecha] = useState(hoy());
  const [formaPago, setFormaPago] = useState<FormaPago>("CREDITO 30 DIAS");
  const [tiempo, setTiempo] = useState("");
  const [lugar, setLugar] = useState("");
  const [almacenIngreso, setAlmacenIngreso] = useState(ALMACEN_DEFECTO);
  const [caja, setCaja] = useState(CAJA_POR_DEFECTO);
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

  // Por defecto solo la lista; el formulario se abre con "Emitir OC" (o al venir de "Generar OC" con una cotización)
  const [showRegistrar, setShowRegistrar] = useState(!!preCoti);
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    setEnviando(true);
    const monto = voucherMonto === "" ? undefined : parseFloat(voucherMonto);
    const ok = await ejecutarAsync(async () => {
      const oc = await emitirOrdenCompra(
        { cotizacionId: cotiId, fecha, formaPago, tiempoEntrega: tiempo, lugarEntrega: lugar, cuentaOrigenPago: cuentaOrigenDeCaja(caja), caja, voucherMonto: monto, almacenIngreso },
        voucher?.file ?? null,
        rol
      );
      // Contable: DEBE 60 Compras + 40 IGV / HABER 42 Proveedores
      asientoOrdenCompra(oc, getSesion()?.usuario ?? String(rol));
      return oc;
    }, "Orden de compra emitida · asiento contable generado");
    setEnviando(false);
    if (ok) {
      setShowRegistrar(false);
      setCotiId("");
      setTiempo("");
      setCaja(CAJA_POR_DEFECTO);
      setVoucher(null);
    }
  };

  return (
    <div className="space-y-6">
      <QuickActions
        tab="ordenes"
        onIr={onIr}
        onBuscar={() => setShowRegistrar(false)}
        onNuevo={() => setShowRegistrar(true)}
        puedeCrear={habilitado}
        onVerCoti={coti ? () => onVerCoti(coti.reqId) : undefined}
      />
      {showRegistrar && (
      <Card id={QA_IDS.formOrden}>
        <CardHeader
          title="Emitir orden de compra"
          subtitle={habilitado ? "Se genera desde una COTIZACIÓN (no directamente desde el REQ)." : "Solo lectura: solo Tesorería y Creador pueden emitir órdenes de compra."}
          action={<CerrarForm onClick={() => setShowRegistrar(false)} />}
        />
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
            <Field label="Almacén de ingreso *" hint="Almacén registra el ingreso de los repuestos en este almacén">
              <Select value={almacenIngreso} onChange={(e) => setAlmacenIngreso(e.target.value)} options={ALMACENES.map((a) => ({ value: a, label: a }))} />
            </Field>
          </div>
          <div className="mx-5 mb-5 rounded-xl border border-plomo-200 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">Comprobante de pago y origen</p>
            <div className="grid gap-4 md:grid-cols-3">
              <SelectorCaja value={caja} onChange={setCaja} encabezado={false} />
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
                    <div className="h-40 overflow-hidden rounded-lg border border-plomo-200 bg-surface md:w-56">
                      {voucher.file.type.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={voucher.url} alt="Vista previa baucher" className="h-full w-full object-contain" />
                      ) : (
                        <iframe src={voucher.url} title="Vista previa baucher" className="h-full w-full" />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between gap-2">
                      <div>
                        <p className="break-all text-sm font-medium text-fg">{voucher.file.name}</p>
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
      )}

      {!showRegistrar && (
      <Card id={QA_IDS.listaOrdenes}>
        <CardHeader title="Órdenes de compra" />
        <ListaDocs
          tipo="ordenes"
          filas={ordenes.map((o): FilaDoc => {
          return {
          id: o.id,
          fecha: o.fecha,
          contraparte: o.proveedor,
          ref: (
            <>
              <span className="font-semibold text-fg">{o.numero}</span>
                <span className="ml-1.5 text-xs text-plomo-500">{o.cotizacionNumero}</span>
                <span className="ml-2 inline-block align-middle"><Badge estado={o.estado} /></span>
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
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "OC", id: o.id })}>
                    <Eye size={15} />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => pdfOrdenCompra(o)}>
                    <FileText size={14} /> Ver PDF
                  </Button>
                  {puede(rol, "oc.crear") &&
                    (() => {
                      const bloqueo = motivoNoEditableOC(o, facturasOC);
                      return (
                        <span title={bloqueo ?? "Editar OC"}>
                          <Button size="sm" variant="ghost" disabled={!!bloqueo} onClick={() => setEditar(o)}>
                            <Pencil size={14} />
                          </Button>
                        </span>
                      );
                    })()}
                  {o.estado === "EMITIDA" && puede(rol, "fac.pagar") && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => {
                        setBanc({ ...bancarizacionVacia(), caja: o.caja || CAJA_POR_DEFECTO });
                        setBancarizar(o);
                      }}
                    >
                      Bancarizar
                    </Button>
                  )}
                  {(o.estado === "BANCARIZADA" || (o.estado === "EMITIDA" && !requiereBancarizacion(o.total, o.ruc))) && puede(rol, "fac.crear") && (
                    <Button size="sm" onClick={() => onFacturar(o.id)}>
                      Registrar factura
                    </Button>
                  )}
                </div>
            </>
          ),
          buscar: `${o.numero} ${o.cotizacionNumero} ${o.reqNumero} ${o.ruc} ${o.formaPago}`,
          tipoDoc: "OC",
          estado: o.estado,
          };
        })}
        />
      </Card>
      )}

      <Modal open={!!editar} onClose={() => setEditar(null)} title={`Editar · ${editar?.numero ?? ""}`} wide>
        {editar && <EditarOC key={editar.id} oc={editar} rol={rol} cotizaciones={todasCotis} onClose={() => setEditar(null)} />}
      </Modal>

      <Modal open={!!bancarizar} onClose={() => setBancarizar(null)} title={`Bancarización · ${bancarizar?.numero ?? ""}`}>
        {bancarizar && (
          <div className="space-y-4 text-sm">
            <p className="text-plomo-600">
              {bancarizar.proveedor} · <b className="text-fg">{soles(bancarizar.total)}</b>. Después de bancarizar se registra la factura y termina el proceso.
            </p>
            <FormBancarizacion value={banc} onChange={setBanc} />
            <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
              <Button variant="secondary" onClick={() => setBancarizar(null)}>
                Cancelar
              </Button>
              <Button
                variant="success"
                onClick={() => {
                  if (ejecutar(() => bancarizarOC(bancarizar.id, banc, rol), `${bancarizar.numero} bancarizada: ya puede registrar la factura`)) {
                    setBancarizar(null);
                    onFacturar(bancarizar.id);
                  }
                }}
              >
                Registrar bancarización
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// =====================================================================
// EDITAR OC (solo sin factura ni pago)
// =====================================================================
function EditarOC({ oc, rol, cotizaciones, onClose }: { oc: OrdenCompra; rol: Rol; cotizaciones: Cotizacion[]; onClose: () => void }) {
  const [d, setD] = useState<EdicionOC>(() => ({
    fecha: oc.fecha.slice(0, 10),
    proveedor: oc.proveedor,
    ruc: oc.ruc,
    formaPago: oc.formaPago,
    tiempoEntrega: oc.tiempoEntrega,
    lugarEntrega: oc.lugarEntrega,
    cotizacionId: oc.cotizacionId,
    items: oc.items.map((i) => ({ ...i })),
  }));
  const [guardando, setGuardando] = useState(false);
  const opcionesCoti = cotizaciones.filter((c) => c.id === oc.cotizacionId || c.estado !== "CON_OC");
  const coti = cotizaciones.find((c) => c.id === d.cotizacionId);
  const subtotal = r2(d.items.reduce((a, i) => a + r2(i.cantidad * i.precioUnit), 0));
  const igv = r2(subtotal * IGV);
  const set = <K extends keyof EdicionOC>(k: K, v: EdicionOC[K]) => setD((x) => ({ ...x, [k]: v }));
  const setItem = (n: number, cambio: Partial<ItemPrecio>) => set("items", d.items.map((i, j) => (j === n ? { ...i, ...cambio } : i)));

  const elegirCoti = (id: string) => {
    const c = cotizaciones.find((x) => x.id === id);
    if (!c) return;
    // Otra cotización: se cargan su proveedor y productos
    setD((x) => ({ ...x, cotizacionId: id, proveedor: c.proveedor, ruc: c.ruc, items: c.items.map((i) => ({ ...i })) }));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const nueva = await editarOrdenCompra(oc.id, d, rol);
      reasentarOrdenCompra(nueva, getSesion()?.usuario ?? String(rol));
      toast(`${oc.numero} actualizada`, "ok");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error inesperado", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Cotización" className="md:col-span-2">
          <Select value={d.cotizacionId} onChange={(e) => elegirCoti(e.target.value)} options={opcionesCoti.map((c) => ({ value: c.id, label: `${c.numero} · ${c.proveedor} · ${soles(c.total)}` }))} />
        </Field>
        <Field label="Requerimiento">
          <Input value={coti?.reqNumero ?? oc.reqNumero} disabled />
        </Field>
        <Field label="Proveedor" className="md:col-span-2">
          <Input value={d.proveedor} onChange={(e) => set("proveedor", e.target.value)} />
        </Field>
        <Field label="RUC">
          <Input value={d.ruc} onChange={(e) => set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11))} />
        </Field>
        <Field label="Fecha OC">
          <Input type="date" value={d.fecha} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
        <Field label="Forma de pago">
          <Select value={d.formaPago} onChange={(e) => set("formaPago", e.target.value as FormaPago)} options={FORMAS_PAGO.map((f) => ({ value: f, label: f }))} />
        </Field>
        <Field label="Tiempo de entrega">
          <Input value={d.tiempoEntrega} onChange={(e) => set("tiempoEntrega", e.target.value)} />
        </Field>
        <Field label="Lugar de entrega" className="md:col-span-3">
          <Input value={d.lugarEntrega} onChange={(e) => set("lugarEntrega", e.target.value)} />
        </Field>
      </div>

      <Table head={["Producto", "Cant.", "Und", "Marca", "P. unit (sin IGV)", "Subtotal", ""]}>
        {d.items.map((i, n) => (
          <tr key={n}>
            <Td>
              <Input value={i.nombre} onChange={(e) => setItem(n, { nombre: e.target.value })} />
            </Td>
            <Td className="w-24">
              <Input type="number" min={0} step="any" value={i.cantidad} onChange={(e) => setItem(n, { cantidad: Number(e.target.value) })} />
            </Td>
            <Td className="w-24">
              <Select value={i.unidad} onChange={(e) => setItem(n, { unidad: e.target.value })} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
            </Td>
            <Td className="w-28">
              <Input value={i.marca} onChange={(e) => setItem(n, { marca: e.target.value })} />
            </Td>
            <Td className="w-32">
              <Input type="number" min={0} step="0.01" value={i.precioUnit} onChange={(e) => setItem(n, { precioUnit: Number(e.target.value) })} />
            </Td>
            <Td className="text-right">{soles(r2(i.cantidad * i.precioUnit))}</Td>
            <Td>
              <Button size="sm" variant="ghost" disabled={d.items.length === 1} onClick={() => set("items", d.items.filter((_, j) => j !== n))}>
                <Trash2 size={14} />
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
      <Button size="sm" variant="secondary" onClick={() => set("items", [...d.items, { itemReqId: uid(), nombre: "", cantidad: 1, unidad: "UND", marca: "", precioUnit: 0, subtotal: 0 }])}>
        <Plus size={14} /> Agregar producto
      </Button>
      <Totales subtotal={subtotal} igv={igv} />

      <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={guardando}>
          <Pencil size={14} /> {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
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
  onIr,
}: {
  rol: Rol;
  ocs: OrdenCompra[];
  ordenes: OrdenCompra[];
  facturas: Factura[];
  preOc?: string;
  onIr: (tab: string) => void;
}) {
  const [editGasto, setEditGasto] = useState<Factura | null>(null);
  const sesion = getSesion();
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
  const [pagarFac, setPagarFac] = useState<Factura | null>(null);
  const [cajaFac, setCajaFac] = useState(CAJA_POR_DEFECTO);
  const [bancFac, setBancFac] = useState<Bancarizacion>(bancarizacionVacia);
  const abrirPago = (f: Factura) => {
    setBancFac(bancarizacionVacia());
    setCajaFac(CAJA_POR_DEFECTO);
    setPagarFac(f);
  };

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
      setShowRegistrar(false);
      setOcId("");
      setNumero("");
      setDni("");
      setVendedor("");
      setMotivoDJ("");
    }
  };

  // Por defecto solo la lista; el formulario se abre con "Nueva Factura" (o al venir de "Facturar" con una OC)
  const [showRegistrar, setShowRegistrar] = useState(!!preOc);
  const ocsDJ = ocs.filter((o) => o.subtotal <= TOPE_DJ);
  const lista = facturas.filter((f) => !filtroPago || f.estadoPago === filtroPago);
  // Por pagar al proveedor: en gastos con detracción, el neto (la detracción va al Banco de la Nación)
  const porPagar = r2(facturas.filter((f) => f.estadoPago === "POR_PAGAR").reduce((a, f) => a + (f.netoPagar ?? f.total), 0));

  return (
    <div className="space-y-6">
      <QuickActions tab="factura" onIr={onIr} onBuscar={() => setShowRegistrar(false)} onNuevo={() => setShowRegistrar(true)} puedeCrear={puede(rol, "fac.crear")} />
      {puede(rol, "fac.crear") && showRegistrar && (
        <Card id={QA_IDS.formFactura}>
          <CardHeader
            title={modo === "FACTURA" ? "Registrar factura" : "Declaración jurada de compra"}
            subtitle={modo === "FACTURA" ? "Vinculada a una Orden de Compra. IGV y total se calculan automáticamente." : `Excepción: compras sin comprobante, tope ${soles(TOPE_DJ)}, requiere aprobación de Gerencia.`}
            action={
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-plomo-100 p-0.5 text-sm">
                  {(["FACTURA", "DJ"] as const).map((m) => (
                    <button key={m} onClick={() => { setModo(m); setOcId(""); }} className={cn("rounded-md px-3 py-1.5 font-medium", modo === m ? "bg-surface shadow" : "text-plomo-500")}>
                      {m === "FACTURA" ? "Factura" : "Decl. Jurada"}
                    </button>
                  ))}
                </div>
                <CerrarForm onClick={() => setShowRegistrar(false)} />
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
                  <div className="flex items-center gap-2 rounded-lg bg-plomo-100 px-3 py-2 text-sm text-azul-700 md:col-span-3">
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

      {!showRegistrar && (
      <Card id={QA_IDS.listaFacturas}>
        <CardHeader
          title="Facturas y comprobantes"
          subtitle={`Total por pagar: ${soles(porPagar)}`}
        />
        <ListaDocs
          tipo="facturas"
          extraActivos={filtroPago ? 1 : 0}
          filtrosExtra={
            <Select
              value={filtroPago}
              onChange={(e) => setFiltroPago(e.target.value)}
              placeholder="Pago: todos"
              options={[
                { value: "POR_PAGAR", label: "Por pagar" },
                { value: "PAGADA", label: "Pagadas" },
              ]}
              className="w-40"
            />
          }
          filas={lista.map((f): FilaDoc => {
          const vencida = f.estadoPago === "POR_PAGAR" && f.fechaVencimiento < hoy();
          return {
          id: f.id,
          fecha: f.fecha,
          contraparte: f.proveedor,
          ref: (
            <>
              <span className="font-semibold text-fg">{f.numero}</span>
                  <span className="ml-1.5 text-xs text-plomo-500">{f.esGastoTesoreria ? f.codigo ?? "Gasto" : f.ocNumero}</span>
                  {/* El estado de pago sigue siendo el botón para pagar / revertir */}
                  <button
                    disabled={!puede(rol, "fac.pagar")}
                    onClick={() => (f.estadoPago === "POR_PAGAR" ? abrirPago(f) : ejecutar(() => marcarPago(f.id, false, rol), `${f.numero} revertida a por pagar`))}
                    title={f.estadoPago === "POR_PAGAR" ? "Marcar como pagada (elegir caja)" : "Revertir a por pagar"}
                    className="ml-2 align-middle disabled:cursor-not-allowed"
                  >
                    <Badge estado={f.estadoPago} />
                  </button>
            </>
          ),
          total: (
            <>
              {soles(f.total)}
            </>
          ),
          acciones: (
            <>
              <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => abrirDoc({ tipo: "FACTURA", id: f.id })} title="Ver">
                      <Eye size={15} />
                    </Button>
                    {(() => {
                      const p = permisoEditarGasto(f, sesion);
                      return (
                        <span className="tip" data-tip={p.ok ? "Editar" : p.motivo}>
                          <Button size="sm" variant="ghost" disabled={!p.ok} onClick={() => setEditGasto(f)} aria-label="Editar">
                            <Pencil size={15} />
                          </Button>
                        </span>
                      );
                    })()}
                    <Button size="sm" variant="secondary" onClick={() => pdfFactura(f, ordenes.find((o) => o.id === f.ocId))}>
                      <FileText size={14} /> PDF
                    </Button>
                    {(f.archivos ?? []).map((a) => (
                      <Button
                        key={a.tipo}
                        size="sm"
                        variant="ghost"
                        title={a.nombre}
                        onClick={() => abrirArchivo(a.dataUrl)}
                      >
                        <Upload size={14} /> {a.tipo === "GUIA" ? "Guía" : "Adjunto"}
                      </Button>
                    ))}
                  </div>
            </>
          ),
          buscar: `${f.numero} ${f.ocNumero} ${f.codigo ?? ""} ${f.ruc}`,
          tipoDoc: f.esGastoTesoreria ? "GASTO" : f.tipo === "DECLARACION_JURADA" ? "DJ" : "FACTURA",
          estado: f.estadoPago,
          subFecha: vencida ? <span className="font-semibold text-red-600">venció {fechaPE(f.fechaVencimiento)}</span> : undefined,
          };
        })}
        />
      </Card>
      )}

      {editGasto && <EditarGasto gasto={editGasto} rol={rol} onClose={() => setEditGasto(null)} />}

      <Modal open={!!pagarFac} onClose={() => setPagarFac(null)} title={`Pagar ${pagarFac?.numero ?? ""}`}>
        {pagarFac && (
          <div className="space-y-4 text-sm">
            <p className="text-plomo-600">
              {pagarFac.proveedor} · <b className="text-fg">{soles(pagarFac.netoPagar ?? pagarFac.total)}</b>
            </p>
            {requiereBancarizacion(pagarFac.netoPagar ?? pagarFac.total, pagarFac.ruc) ? (
              <>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  <b>Bancarización obligatoria:</b> el pago supera S/ {TOPE_BANCARIZACION.toLocaleString("es-PE")} o el proveedor tiene RUC.
                </p>
                <FormBancarizacion value={bancFac} onChange={setBancFac} />
              </>
            ) : (
              <SelectorCaja value={cajaFac} onChange={setCajaFac} />
            )}
            <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
              <Button variant="secondary" onClick={() => setPagarFac(null)}>
                Cancelar
              </Button>
              <Button
                variant="success"
                onClick={() => {
                  const banc = requiereBancarizacion(pagarFac.netoPagar ?? pagarFac.total, pagarFac.ruc);
                  const caja = banc ? bancFac.caja : cajaFac;
                  if (ejecutar(() => marcarPago(pagarFac.id, true, rol, caja, banc ? bancFac : undefined), `${pagarFac.numero} pagada desde ${caja}`)) setPagarFac(null);
                }}
              >
                Marcar como pagada
              </Button>
            </div>
          </div>
        )}
      </Modal>
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
  // url: vista previa local; ref: lo que se guarda (Storage "sb:..." o base64 si Storage lo rechaza)
  const [archivo, setArchivo] = useState<{ nombre: string; tipo: string; url: string; ref: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
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
    setSubiendo(true);
    subirBaucher(file, "guia")
      .then(({ ref }) => setArchivo({ nombre: file.name, tipo: file.type, url: URL.createObjectURL(file), ref }))
      .catch((e) => toast((e as Error).message, "error"))
      .finally(() => setSubiendo(false));
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
          { facturaId: facId, numero, fecha, archivoNombre: archivo?.nombre ?? "", archivoTipo: archivo?.tipo ?? "", archivoDataUrl: archivo?.ref ?? "" },
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
            <Button onClick={guardar} disabled={!facId || !archivo || subiendo}>
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
                <Td className="font-semibold text-fg">{g.numero}</Td>
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
