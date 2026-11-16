"use client";

import { useState } from "react";
import { FileClock, Wallet } from "lucide-react";
import { Card, Tabs } from "@/components/ui";
import { CajaChica } from "@/components/sucursal/Caja";
import { SucursalShell } from "@/components/sucursal/Shell";
import { SubmodulosSecocha, TituloSub } from "@/components/sucursal/Submodulos";
import { deSede, useSedes } from "@/lib/sedes";
import { KEYS, useStore } from "@/lib/storage";
import type { CierreCaja, MovCaja } from "@/lib/sucursal";

type Tab = "caja" | "proximo";

/** TESORERÍA SECOCHA: caja chica y cierre (fase 1); compras, registro de compras, DJ y planilla llegan en la fase 2. */
export default function TesoreriaSecochaApp() {
  return (
    <SucursalShell>
      <SubmodulosSecocha actual="tesoreria">
        <TesoreriaSecocha />
      </SubmodulosSecocha>
    </SucursalShell>
  );
}

function TesoreriaSecocha() {
  useSedes();
  const [tab, setTab] = useState<Tab>("caja");
  const caja = deSede(useStore<MovCaja[]>(KEYS.SUC_CAJA, []));
  const cierres = deSede(useStore<CierreCaja[]>(KEYS.SUC_CIERRES, []));
  return (
    <div className="w-full space-y-6">
      <TituloSub titulo="Tesorería Secocha" detalle="Caja chica de la sede y cierre diario a Tesorería Principal" />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "caja", label: "Caja chica", icon: <Wallet size={16} /> },
          { id: "proximo", label: "Compras, DJ y planilla", icon: <FileClock size={16} /> },
        ]}
      />
      {tab === "caja" && <CajaChica movs={caja} cierres={cierres} />}
      {tab === "proximo" && (
        <Card className="p-6 text-sm text-plomo-600">
          Compras, registro de compras, declaraciones juradas, fuentes de pago y pago de planilla de Secocha se habilitan en la fase 2 de este
          submódulo, con la misma pantalla de Tesorería de Arequipa y solo los datos de Secocha.
        </Card>
      )}
    </div>
  );
}
