"use client";

import { useParams } from "next/navigation";
import { DetalleHistorial } from "@/components/planilla/DetalleHistorial";

/** /dashboard/planilla/historial/[periodoId]: planilla cerrada, solo lectura. */
export default function HistorialPeriodoPage() {
  const { periodoId } = useParams<{ periodoId: string }>();
  return <DetalleHistorial id={periodoId} />;
}
