"use client";

import { Clientes } from "@/app/(dashboard)/dashboard/ventas/maestros";
import { useCargaCondiciones } from "@/app/(dashboard)/dashboard/ventas/comun";

/** Logística · Base de clientes (la misma de Ventas; compartida Arequipa + Secocha). */
export default function BaseClientesPage() {
  useCargaCondiciones();
  return <Clientes logistica />;
}
