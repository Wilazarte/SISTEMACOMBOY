"use client";

import { useParams } from "next/navigation";
import { IrAccion } from "@/components/inicio/IrAccion";

/** /ventas/{accion}: pantalla de un botón del INICIO VENTAS (Notas de pedido, Comprobantes, Cuentas por cobrar…). */
export default function Page() {
  const { accion } = useParams<{ accion: string }>();
  return <IrAccion modulo="ventas" accion={accion} />;
}
