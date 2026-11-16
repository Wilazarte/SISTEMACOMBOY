"use client";

import { useState } from "react";
import { ClipboardList, Contact, Receipt, Truck, Wallet } from "lucide-react";
import { Tabs } from "@/components/ui";
import { SucursalShell } from "@/components/sucursal/Shell";
import { SubmodulosSecocha, TituloSub } from "@/components/sucursal/Submodulos";
import { KEYS, useStore } from "@/lib/storage";
import { estadoOD, filasCxC } from "@/lib/ventas";
import type { ComprobanteVenta, NotaPedido, OrdenDespacho } from "@/lib/types";
// Mismas pantallas de Ventas de Arequipa: en /secocha la vista de datos es solo Secocha (lib/storage fijarVistaSede)
// y la numeración es propia (NP-SEC-0001, F002-0001, B002-0001, OD-SEC-0001).
import { OrdenesDespacho } from "@/app/(dashboard)/dashboard/almacen/despacho";
import { CuentasPorCobrar } from "@/app/(dashboard)/dashboard/ventas/cobrar";
import { useCargaCondiciones } from "@/app/(dashboard)/dashboard/ventas/comun";
import { Comprobantes } from "@/app/(dashboard)/dashboard/ventas/comprobantes";
import { Clientes } from "@/app/(dashboard)/dashboard/ventas/maestros";
import { NotasPedido } from "@/app/(dashboard)/dashboard/ventas/notas";

type Tab = "notas" | "comprobantes" | "despachos" | "clientes" | "cobrar";

/** VENTAS SECOCHA: nota de pedido -> factura F002 / boleta B002 -> orden de despacho al Almacén de Secocha -> cobro. */
export default function VentasSecochaApp() {
  return (
    <SucursalShell>
      <SubmodulosSecocha actual="ventas">
        <VentasSecocha />
      </SubmodulosSecocha>
    </SucursalShell>
  );
}

function VentasSecocha() {
  const [tab, setTab] = useState<Tab>("notas");
  const [facturarNp, setFacturarNp] = useState<string | undefined>();
  useCargaCondiciones();
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const despachos = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const vencidos = filasCxC(notas, comprobantes).filter((f) => f.estado === "VENCIDO").length;

  return (
    <div className="w-full space-y-6">
      <TituloSub titulo="Ventas Secocha" detalle="Nota de pedido → Factura F002 / Boleta B002 → Orden de despacho al Almacén de Secocha → Cobro" />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          setFacturarNp(undefined);
        }}
        tabs={[
          { id: "notas", label: "Notas de pedido", icon: <ClipboardList size={16} />, count: notas.filter((n) => n.estado === "APROBADA").length },
          { id: "comprobantes", label: "Facturas y boletas", icon: <Receipt size={16} />, count: comprobantes.filter((c) => c.estado === "BORRADOR").length },
          {
            id: "despachos",
            label: "Despachos (seguimiento)",
            icon: <Truck size={16} />,
            count: despachos.filter((o) => estadoOD(o) === "PENDIENTE" || estadoOD(o) === "PEDIDO_ALISTADO").length,
          },
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
      {tab === "despachos" && <OrdenesDespacho vista="ventas" />}
      {tab === "clientes" && <Clientes />}
      {tab === "cobrar" && <CuentasPorCobrar />}
    </div>
  );
}
