"use client";

import { useParams } from "next/navigation";
import { FondoFlujo } from "@/components/expedientes/comun";
import { ExpedienteView } from "@/components/expedientes/ExpedienteView";

/** Expediente por código de seguimiento: /erp/expediente/26W-001 */
export default function ExpedientePage() {
  const { codigo } = useParams<{ codigo: string }>();
  return (
    <FondoFlujo>
      <ExpedienteView codigo={codigo} />
    </FondoFlujo>
  );
}
