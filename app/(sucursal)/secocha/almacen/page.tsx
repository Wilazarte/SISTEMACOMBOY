"use client";

import { useState } from "react";
import { Boxes, ClipboardList, PackageCheck, Truck } from "lucide-react";
import { Tabs } from "@/components/ui";
import { StockLocalTab } from "@/components/sucursal/Inventario";
import { SucursalShell } from "@/components/sucursal/Shell";
import { SubmodulosSecocha, TituloSub } from "@/components/sucursal/Submodulos";
import { Requerimientos, Traslados } from "@/components/sucursal/Traslados";
import { deSede, useSedes } from "@/lib/sedes";
import { KEYS, useStore } from "@/lib/storage";
import { estadoOD } from "@/lib/ventas";
import type { OrdenDespacho } from "@/lib/types";
import type { ReqSucursal, StockLocal, Traslado } from "@/lib/sucursal";
import { OrdenesDespacho } from "@/app/(dashboard)/dashboard/almacen/despacho";

type Tab = "requerimientos" | "traslados" | "despachos" | "stock";

/** ALMACÉN SECOCHA: requerimientos al Taller Principal, traslados entrantes (OT + guía), órdenes de despacho de Ventas Secocha y stock. */
export default function AlmacenSecochaApp() {
  return (
    <SucursalShell>
      <SubmodulosSecocha actual="almacen">
        <AlmacenSecocha />
      </SubmodulosSecocha>
    </SucursalShell>
  );
}

function AlmacenSecocha() {
  useSedes();
  const [tab, setTab] = useState<Tab>("requerimientos");
  const reqs = deSede(useStore<ReqSucursal[]>(KEYS.SUC_REQS, []));
  const traslados = deSede(useStore<Traslado[]>(KEYS.SUC_TRASLADOS, []));
  const stock = deSede(useStore<StockLocal[]>(KEYS.SUC_STOCK, []));
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  return (
    <div className="w-full space-y-6">
      <TituloSub titulo="Almacén Secocha" detalle="Requerimientos al Taller Principal, traslados con guía, órdenes de despacho y stock de la Sucursal Secocha" />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "requerimientos", label: "Requerimientos", icon: <ClipboardList size={16} />, count: reqs.filter((r) => r.estado !== "cerrado").length },
          { id: "traslados", label: "Traslados", icon: <Truck size={16} />, count: traslados.filter((t) => t.estado === "en-camino").length },
          {
            id: "despachos",
            label: "Órdenes de despacho",
            icon: <PackageCheck size={16} />,
            count: ods.filter((o) => estadoOD(o) === "PENDIENTE" || estadoOD(o) === "PEDIDO_ALISTADO").length,
          },
          { id: "stock", label: "Stock Secocha", icon: <Boxes size={16} />, count: stock.filter((s) => s.stock < s.minimo).length },
        ]}
      />
      {tab === "requerimientos" && <Requerimientos reqs={reqs} stock={stock} />}
      {tab === "traslados" && <Traslados traslados={traslados} stock={stock} reqs={reqs} />}
      {tab === "despachos" && <OrdenesDespacho vista="almacen" />}
      {tab === "stock" && <StockLocalTab stock={stock} />}
    </div>
  );
}
