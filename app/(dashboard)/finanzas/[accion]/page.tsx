"use client";

import { useParams } from "next/navigation";
import { FinanzasHome } from "@/components/logistica/FinanzasHome";
import { IrAccion } from "@/components/inicio/IrAccion";

/** /finanzas/{accion}: pestaña de un botón del INICIO. "panel" es la vista completa anterior del módulo. */
export default function Page() {
  const { accion } = useParams<{ accion: string }>();
  return accion === "panel" ? <FinanzasHome /> : <IrAccion modulo="finanzas" accion={accion} />;
}
