"use client";

import { useParams } from "next/navigation";
import { LogisticaDetalle, SECCIONES, type Seccion } from "@/components/logistica/LogisticaDetalle";
import { IrAccion } from "@/components/inicio/IrAccion";

/**
 * Secciones de Logística (agencias, proveedores, transferencias…). Compras, Ventas y demás módulos redirigen (next.config.mjs).
 * Cualquier otro segmento es un botón del INICIO (/logistica/{accion}) que abre su pantalla.
 */
export default function LogisticaSeccionPage() {
  const { seccion } = useParams<{ seccion: string }>();
  if (SECCIONES.includes(seccion as Seccion)) return <LogisticaDetalle solo={seccion as Seccion} />;
  return <IrAccion modulo="logistica" accion={seccion} />;
}
