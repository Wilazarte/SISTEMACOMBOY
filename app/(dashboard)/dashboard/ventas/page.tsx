"use client";

import { useState } from "react";
import { AlertTriangle, ClipboardList, Contact, Receipt, Settings2, Truck, Wallet } from "lucide-react";
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

type Tab = "notas" | "comprobantes" | "despachos" | "condiciones" | "clientes" | "cobrar";

/**
 * VENTAS — Nota de Pedido -> Aprobada -> Factura/Boleta -> Orden de Despacho (Almacén) -> Cobro.
 */
export default function VentasPage() {
  const [tab, setTab] = useState<Tab>("notas");
  const [facturarNp, setFacturarNp] = useState<string | undefined>();
  useCargaCondiciones(); // condiciones_pago al día para notas, comprobantes y clientes
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const despachos = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const sinOD = npsSinDespacho(notas, despachos);
  const vencidos = comprobantes.filter((c) => c.estado === "EMITIDO" && estadoCxC(c).estado === "VENCIDO").length;

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-serif text-[36px] font-light leading-tight text-azul-900 lg:text-[42px]">Ventas</h1>
        <p className="mt-1 text-[13px] text-plomo-600">Nota de pedido → Aprobada (orden de despacho a Almacén) → Factura / Boleta → Cobro · seguimiento del despacho</p>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          setFacturarNp(undefined);
        }}
        tabs={[
          { id: "notas", label: "Notas de pedido", icon: <ClipboardList size={16} />, count: notas.filter((n) => n.estado === "APROBADA").length },
          { id: "comprobantes", label: "Comprobantes", icon: <Receipt size={16} />, count: comprobantes.filter((c) => c.estado === "BORRADOR").length },
          {
            id: "despachos",
            label: "Despachos (seguimiento)",
            icon: <Truck size={16} />,
            count: despachos.filter((o) => estadoOD(o) === "PENDIENTE" || estadoOD(o) === "PEDIDO_ALISTADO").length,
          },
          { id: "condiciones", label: "Configuración", icon: <Settings2 size={16} /> },
          { id: "clientes", label: "Clientes", icon: <Contact size={16} /> },
          { id: "cobrar", label: "Cuentas por cobrar", icon: <Wallet size={16} />, count: vencidos },
        ]}
      />
      {tab === "notas" && (
        <NotasPedido
          onFacturar={(npId) => {
            setFacturarNp(npId);
            setTab("comprobantes");
          }}
        />
      )}
      {tab === "comprobantes" && <Comprobantes preNp={facturarNp} onListo={() => setFacturarNp(undefined)} />}
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
      {tab === "condiciones" && <CondicionesPago />}
      {tab === "clientes" && <Clientes />}
      {tab === "cobrar" && <CuentasPorCobrar />}
    </div>
  );
}
