"use client";

import { DashboardLotes } from "@/components/expedientes/DashboardLotes";
import { FondoFlujo } from "@/components/expedientes/comun";

/** Tablero central de expedientes 26W (Kanban por fase). */
export default function LotesPage() {
  return (
    <FondoFlujo>
      <DashboardLotes />
    </FondoFlujo>
  );
}
