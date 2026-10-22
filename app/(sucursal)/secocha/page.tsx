"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, BarChart3, Boxes, ClipboardList, MapPin, PackageCheck, ShoppingCart, Truck, Users, Wallet } from "lucide-react";
import { Tabs } from "@/components/ui";
import { DerivarTaller, EntregarProducto, RegistrarVenta } from "@/components/sucursal/Ventas";
import { Requerimientos, Traslados } from "@/components/sucursal/Traslados";
import { CajaChica } from "@/components/sucursal/Caja";
import { ClientesTab, StockLocalTab } from "@/components/sucursal/Inventario";
import { ReportesSucursal } from "@/components/sucursal/Reportes";
import { SucursalShell } from "@/components/sucursal/Shell";
import { getSesion } from "@/lib/auth";
import { deSede, useSedes } from "@/lib/sedes";
import { KEYS, tablaDisponible, useStore } from "@/lib/storage";
import {
  esTaller,
  getSucursal,
  esTesoreria,
  operaSucursal,
  type CierreCaja,
  type ClienteSuc,
  type Derivacion,
  type MovCaja,
  type ReqSucursal,
  type StockLocal,
  type Sucursal,
  type Traslado,
  type VentaSucursal,
} from "@/lib/sucursal";
import type { Requerimiento } from "@/lib/types";

type TabSuc = "registrar-venta" | "entregar-producto" | "derivar-taller" | "requerimientos" | "traslados" | "caja-chica" | "stock-local" | "clientes" | "reportes";

/** Última pestaña abierta de la Sucursal (por navegador). */
const CLAVE_TAB = "sucursal-tab-activa";

/** COMBOY VID SECOCHA (/secocha, antes /sucursal): sistema aparte con su propio login (/secocha/login). Solo Secocha. */
export default function SucursalApp() {
  return (
    <SucursalShell>
      <SucursalPage />
    </SucursalShell>
  );
}

function SucursalPage() {
  // Solo Secocha: un usuario de sede ya recibe solo la suya (RLS sede_isolation);
  // el ERP central (Taller, Tesorería) recibe todas y aquí se filtra a Secocha (lib/sedes)
  useSedes();
  useStore<Sucursal[]>(KEYS.SUC_SUCURSALES, []);
  const ventas = deSede(useStore<VentaSucursal[]>(KEYS.SUC_VENTAS, []));
  const traslados = deSede(useStore<Traslado[]>(KEYS.SUC_TRASLADOS, []));
  const derivaciones = deSede(useStore<Derivacion[]>(KEYS.SUC_DERIVACIONES, []));
  const reqs = deSede(useStore<ReqSucursal[]>(KEYS.SUC_REQS, []));
  const caja = deSede(useStore<MovCaja[]>(KEYS.SUC_CAJA, []));
  const cierres = deSede(useStore<CierreCaja[]>(KEYS.SUC_CIERRES, []));
  const stock = deSede(useStore<StockLocal[]>(KEYS.SUC_STOCK, []));
  const clientes = deSede(useStore<ClienteSuc[]>(KEYS.SUC_CLIENTES, []));
  // Estado de cada REQ-SECOCHA en Almacén / Tesorería (la sucursal solo ve los suyos, RLS)
  const pendientes = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const enTesoreria = deSede([...pendientes, ...procesados].filter((r) => r.origen === "SUCURSAL"));
  const sucursal = getSucursal();

  const sesion = getSesion();
  // Taller entra a sus derivaciones, Tesorería a los cierres de caja, la sucursal a sus ventas
  const inicial: TabSuc = operaSucursal(sesion) ? "registrar-venta" : esTaller(sesion) ? "derivar-taller" : esTesoreria(sesion) ? "caja-chica" : "registrar-venta";
  const [tab, setTab] = useState<TabSuc>(inicial);
  const [pre, setPre] = useState<{ venta?: string; nueva?: boolean }>({});

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("nueva")) setPre({ nueva: true });
    try {
      const g = window.localStorage.getItem(CLAVE_TAB) as TabSuc | null;
      if (!p.get("tab") && g) setTab(g);
    } catch {
      /* almacenamiento bloqueado */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_TAB, tab);
    } catch {
      /* almacenamiento bloqueado */
    }
  }, [tab]);

  const ir = (t: TabSuc, p: typeof pre = {}) => {
    setPre(p);
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const porEntregar = ventas.filter((v) => v.estado === "registrada").length;
  const derivPend = derivaciones.filter((d) => d.estado === "pendiente" || d.estado === "en-preparacion").length;
  const tabsSucursal = [
    { id: "registrar-venta" as const, label: "Registrar venta", icon: <ShoppingCart size={16} /> },
    { id: "entregar-producto" as const, label: "Entregar producto", icon: <PackageCheck size={16} />, count: porEntregar },
    { id: "derivar-taller" as const, label: "Derivar a Taller", icon: <ArrowRightLeft size={16} />, count: derivPend },
    { id: "requerimientos" as const, label: "Requerimientos", icon: <ClipboardList size={16} />, count: reqs.filter((r) => r.estado !== "cerrado").length },
    // OT / Guía de remisión
    { id: "traslados" as const, label: "Traslados", icon: <Truck size={16} />, count: traslados.filter((t) => t.estado === "en-camino").length },
    { id: "caja-chica" as const, label: "Caja Chica", icon: <Wallet size={16} />, count: esTesoreria(sesion) ? cierres.filter((c) => c.estado === "enviado").length : undefined },
    { id: "stock-local" as const, label: "Stock Local", icon: <Boxes size={16} />, count: stock.filter((s) => s.stock < s.minimo).length },
    { id: "clientes" as const, label: "Clientes", icon: <Users size={16} /> },
    { id: "reportes" as const, label: "Reportes", icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold leading-tight tracking-tight text-fg lg:text-[28px]">{sucursal.nombre}</h1>
          <p className="mt-1 flex items-center gap-1 text-[13px] text-plomo-500">
            <MapPin size={13} /> Sede {sucursal.sede}
          </p>
        </div>
        {!operaSucursal(sesion) && (
          <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-plomo-600">
            {esTaller(sesion) ? "Taller Principal: derivaciones y OT" : esTesoreria(sesion) ? "Tesorería Principal: cierres de caja" : "Modo lectura para su rol"}
          </span>
        )}
      </div>

      {!tablaDisponible("sucursal") && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          Falta la tabla de la sucursal en Supabase: ejecute supabase/migrations/20261022_sucursal_beta.sql en el SQL Editor. El resto del ERP funciona normal.
        </div>
      )}

      <Tabs<TabSuc> value={tab} onChange={(t) => ir(t)} tabs={tabsSucursal} />

      {tab === "registrar-venta" && (
        <RegistrarVenta
          ventas={ventas}
          stock={stock}
          clientes={clientes}
          sucursal={sucursal}
          abrirNueva={pre.nueva}
          onDerivar={(id) => ir("derivar-taller", { venta: id })}
          onEntregar={(id) => ir("entregar-producto", { venta: id })}
        />
      )}
      {tab === "entregar-producto" && <EntregarProducto ventas={ventas} stock={stock} sucursal={sucursal} preVenta={pre.venta} />}
      {tab === "derivar-taller" && <DerivarTaller ventas={ventas} derivaciones={derivaciones} preVenta={pre.venta} />}
      {tab === "requerimientos" && <Requerimientos reqs={reqs} enTesoreria={enTesoreria} stock={stock} />}
      {tab === "traslados" && <Traslados traslados={traslados} stock={stock} reqs={reqs} />}
      {tab === "caja-chica" && <CajaChica movs={caja} cierres={cierres} />}
      {tab === "stock-local" && <StockLocalTab stock={stock} />}
      {tab === "clientes" && <ClientesTab clientes={clientes} ventas={ventas} />}
      {tab === "reportes" && <ReportesSucursal ventas={ventas} derivaciones={derivaciones} stock={stock} movs={caja} />}
    </div>
  );
}
