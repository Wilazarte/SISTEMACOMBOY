"use client";

import { useParams } from "next/navigation";
import { AlmacenHome } from "@/components/logistica/AlmacenHome";
import { IrAccion } from "@/components/inicio/IrAccion";

/** /almacen/{accion}: pestaña de un botón del INICIO. "panel" es la vista completa anterior del módulo. */
export default function Page() {
  const { accion } = useParams<{ accion: string }>();
  return accion === "panel" ? <AlmacenHome /> : <IrAccion modulo="almacen" accion={accion} />;
}
