"use client";

import type { Sesion } from "@/lib/auth";
import { ErpSubHeader } from "@/components/erp/ErpHeader";

const SEDE = "Arequipa - Planta Principal";

/** Franja de contexto de cada módulo: ahora es el sub-header único components/erp/ErpHeader (ErpSubHeader). */
export function Header({
  sesion,
  flujo,
  persona,
  modulo,
  sede = SEDE,
}: {
  sesion: Sesion;
  flujo?: string;
  persona?: { nombre: string; cargo: string };
  modulo?: string;
  sede?: string;
}) {
  return <ErpSubHeader sesion={sesion} flujo={flujo} persona={persona} modulo={modulo} sede={sede} />;
}
