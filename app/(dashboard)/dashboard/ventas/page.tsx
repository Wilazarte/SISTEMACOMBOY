"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Inbox, Contact, FilePlus2, History, Package, Receipt, Search, Settings2, Truck, Wallet } from "lucide-react";
import { abrirBuscadorDePagina } from "@/components/layout/IslandMenu";
import { CatalogoProductos } from "@/components/productos/CatalogoProductos";
import { Button, Tabs } from "@/components/ui";
import { KEYS, useStore } from "@/lib/storage";
import { estadoCxC, estadoOD, npsSinDespacho } from "@/lib/ventas";
import type { ComprobanteVenta, NotaPedido, OrdenDespacho } from "@/lib/types";
import { OrdenesDespacho } from "../almacen/despacho";
import { CuentasPorCobrar } from "./cobrar";
import { useCargaCondiciones } from "./comun";
import { Comprobantes } from "./comprobantes";
import { Clientes, CondicionesPago } from "./maestros";
import { NotasPedido } from "./notas";
import { RequerimientosSecocha, useSecocha } from "./secocha";

type Tab = "secocha" | "notas" | "comprobantes" | "despachos" | "productos" | "condiciones" | "clientes" | "cobrar";

/**
 * VENTAS — Nota de Pedido -> Aprobada -> Factura/Boleta -> Orden de Despacho (Almacén) -> Cobro.
 * Secocha: sus requerimientos y ventas derivadas llegan a "Requerimientos de Secocha" y se aceptan como NP.
 * Catálogo de Productos (antes /dashboard/productos): catálogo maestro, solicitudes y duplicados.
 */
export default function VentasPage() {
  const [tab, setTab] = useState<Tab>("notas");
  const [facturarNp, setFacturarNp] = useState<string | undefined>();
  // "Emitir Nuevo" de la isla: abre Comprobantes con el formulario (0 = cerrado al entrar)
  const [nuevoPedido, setNuevoPedido] = useState(0);
  useCargaCondiciones(); // condiciones_pago al día para notas, comprobantes y clientes
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const despachos = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const sinOD = npsSinDespacho(notas, despachos);
  const vencidos = comprobantes.filter((c) => c.estado === "EMITIDO" && estadoCxC(c).estado === "VENCIDO").length;
  const secocha = useSecocha();
  // Campana "Requerimiento de Secocha": /dashboard/ventas?tab=secocha
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "secocha") setTab("secocha");
  }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif tracking-tight text-2xl font-semibold leading-tight text-fg lg:text-[28px]">Ventas</h1>
          <p className="mt-1 text-[13px] text-plomo-600">Nota de pedido → Aprobada (orden de despacho a Almacén) → Factura / Boleta → Cobro · seguimiento del despacho</p>
        </div>
        {secocha.pendientes > 0 && (
          <button
            type="button"
            onClick={() => setTab("secocha")}
            className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/15 px-4 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/25"
          >
            <Inbox size={15} /> Requerimientos Secocha ({secocha.pendientes})
          </button>
        )}
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          setFacturarNp(undefined);
          setNuevoPedido(0);
        }}
        acciones={[
          { label: "Buscar Documento", icon: <Search size={14} />, onClick: abrirBuscadorDePagina },
          {
            label: "Emitir Nuevo",
            icon: <FilePlus2 size={14} />,
            onClick: () => {
              setFacturarNp(undefined);
              setTab("comprobantes");
              setNuevoPedido((n) => n + 1);
            },
          },
          {
            label: "Ver Historial",
            icon: <History size={14} />,
            onClick: () => {
              setNuevoPedido(0);
              setTab("comprobantes");
            },
          },
        ]}
        tabs={[
          { id: "secocha", label: "Requerimientos de Secocha", icon: <Inbox size={16} />, count: secocha.pendientes },
          { id: "notas", label: "Notas de pedido", icon: <ClipboardList size={16} />, count: notas.filter((n) => n.estado === "APROBADA").length },
          { id: "comprobantes", label: "Comprobantes", icon: <Receipt size={16} />, count: comprobantes.filter((c) => c.estado === "BORRADOR").length },
          {
            id: "despachos",
            label: "Despachos (seguimiento)",
            icon: <Truck size={16} />,
            count: despachos.filter((o) => estadoOD(o) === "PENDIENTE" || estadoOD(o) === "PEDIDO_ALISTADO").length,
          },
          { id: "productos", label: "Catálogo de Productos", icon: <Package size={16} /> },
          { id: "condiciones", label: "Configuración", icon: <Settings2 size={16} /> },
          { id: "clientes", label: "Clientes", icon: <Contact size={16} /> },
          { id: "cobrar", label: "Cuentas por cobrar", icon: <Wallet size={16} />, count: vencidos },
        ]}
      />
      {tab === "secocha" && <RequerimientosSecocha datos={secocha} onIrNotas={() => setTab("notas")} />}
      {tab === "notas" && (
        <NotasPedido
          onFacturar={(npId) => {
            setFacturarNp(npId);
            setTab("comprobantes");
          }}
        />
      )}
      {tab === "comprobantes" && <Comprobantes preNp={facturarNp} onListo={() => setFacturarNp(undefined)} nuevoPedido={nuevoPedido} />}
      {tab === "despachos" && (
        <>
          {sinOD.length > 0 && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-vino">
              <AlertTriangle size={18} className="shrink-0" />
              <span className="flex-1">
                {sinOD.length} nota(s) de pedido aprobada(s) sin orden de despacho: <b>{sinOD.map((n) => n.numero).join(", ")}</b>. Se aprobaron antes de este flujo
                o no se pudo guardar la orden. Genérela con el botón <b>Generar despacho</b>.
              </span>
              <Button size="sm" onClick={() => setTab("notas")}>
                Ir a Notas de pedido
              </Button>
            </div>
          )}
          <OrdenesDespacho vista="ventas" />
        </>
      )}
      {tab === "productos" && <CatalogoProductos />}
      {tab === "condiciones" && <CondicionesPago />}
      {tab === "clientes" && <Clientes />}
      {tab === "cobrar" && <CuentasPorCobrar />}
    </div>
  );
}
