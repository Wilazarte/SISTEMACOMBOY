"use client";

import { OrdenesDespacho } from "../despacho";

/** /dashboard/almacen/despacho — misma vista que la pestaña "Órdenes de despacho" de Almacén. */
export default function DespachoPage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-serif text-[36px] font-light leading-tight text-azul-900 lg:text-[42px]">Almacén · Despacho</h1>
        <p className="mt-1 text-[13px] text-plomo-600">Órdenes de despacho generadas desde Ventas</p>
      </div>
      <OrdenesDespacho />
    </div>
  );
}
