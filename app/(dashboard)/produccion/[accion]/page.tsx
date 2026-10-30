"use client";

import { useParams } from "next/navigation";
import { ProduccionHome } from "@/components/logistica/ProduccionHome";
import { IrAccion } from "@/components/inicio/IrAccion";

/** /produccion/{accion}: pestaña de un botón del INICIO. "panel" es la vista completa anterior del módulo. */
export default function Page() {
  const { accion } = useParams<{ accion: string }>();
  return accion === "panel" ? <ProduccionHome /> : <IrAccion modulo="produccion" accion={accion} />;
}
