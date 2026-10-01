"use client";

import { OrdenesDespacho } from "../despacho";

/** /dashboard/almacen/despacho — misma vista que la pestaña "Órdenes de despacho" de Almacén. */
export default function DespachoPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Almacén · Despacho</h1>
        <p className="text-sm text-slate-500">Órdenes de despacho generadas desde Ventas</p>
      </div>
      <OrdenesDespacho />
    </div>
  );
}
