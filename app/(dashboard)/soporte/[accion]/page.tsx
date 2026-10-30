"use client";

import { useParams } from "next/navigation";
import { IrAccion } from "@/components/inicio/IrAccion";

/** /soporte/{accion}: pestaña de un botón del INICIO SOPORTE (solo SOPORTE, ver puedeVer). */
export default function Page() {
  const { accion } = useParams<{ accion: string }>();
  return <IrAccion modulo="soporte" accion={accion} />;
}
