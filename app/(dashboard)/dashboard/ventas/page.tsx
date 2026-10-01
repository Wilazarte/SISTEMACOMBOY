"use client";

import { useState } from "react";
import { ClipboardList, Contact, Receipt, Settings2, Wallet } from "lucide-react";
import { Tabs } from "@/components/ui";
import { KEYS, useStore } from "@/lib/storage";
import { estadoCxC } from "@/lib/ventas";
import type { ComprobanteVenta, NotaPedido } from "@/lib/types";
import { CuentasPorCobrar } from "./cobrar";
import { Comprobantes } from "./comprobantes";
import { Clientes, CondicionesPago } from "./maestros";
import { NotasPedido } from "./notas";

type Tab = "notas" | "comprobantes" | "condiciones" | "clientes" | "cobrar";

/**
 * VENTAS — Nota de Pedido -> Aprobada -> Factura/Boleta -> Orden de Despacho (Almacén) -> Cobro.
 */
export default function VentasPage() {
  const [tab, setTab] = useState<Tab>("notas");
  const [facturarNp, setFacturarNp] = useState<string | undefined>();
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const vencidos = comprobantes.filter((c) => c.estado === "EMITIDO" && estadoCxC(c).estado === "VENCIDO").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ventas</h1>
        <p className="text-sm text-slate-500">Nota de pedido → Aprobada → Factura / Boleta → Orden de despacho → Cobro</p>
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
          { id: "condiciones", label: "Condiciones de pago", icon: <Settings2 size={16} /> },
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
      {tab === "condiciones" && <CondicionesPago />}
      {tab === "clientes" && <Clientes />}
      {tab === "cobrar" && <CuentasPorCobrar />}
    </div>
  );
}
