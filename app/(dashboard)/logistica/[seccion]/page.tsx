"use client";

import { notFound, useParams } from "next/navigation";
import { LogisticaDetalle, SECCIONES, type Seccion } from "@/components/logistica/LogisticaDetalle";

/** Secciones de Logística (agencias, proveedores, transferencias…). Compras, Ventas y demás módulos redirigen (next.config.mjs). */
export default function LogisticaSeccionPage() {
  const { seccion } = useParams<{ seccion: string }>();
  if (!SECCIONES.includes(seccion as Seccion)) notFound();
  return <LogisticaDetalle solo={seccion as Seccion} />;
}
