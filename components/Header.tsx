"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin } from "lucide-react";
import { cargoDe, nombreDe, type Sesion } from "@/lib/auth";

const NOMBRE_EMPRESA = "COMBOY VID SOLUCIONES INDUSTRIALES";
const SEDE = "Arequipa - Planta Principal";

/** Franja de contexto de cada módulo: usuario | cargo | empresa, sede y flujo de trabajo (subtítulo). Sin línea de encargada. */
export function Header({
  sesion,
  flujo,
  persona,
  sede = SEDE,
}: {
  sesion: Sesion;
  flujo?: string;
  /** Nombre y cargo fijos del módulo. */
  persona?: { nombre: string; cargo: string };
  /** Sede del módulo (ERP: Arequipa - Planta Principal · Secocha: Secocha). */
  sede?: string;
}) {
  const ruta = usePathname();
  const [fecha, setFecha] = useState("");

  useEffect(() => {
    setFecha(new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  }, [ruta]);

  const pasos = flujo ? flujo.split("→").map((p) => p.trim()) : [];
  return (
    <section className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] text-plomo-500">
          <span className="font-medium text-fg">{persona?.nombre ?? nombreDe(sesion)}</span> · {persona?.cargo ?? cargoDe(sesion)} · {NOMBRE_EMPRESA}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-plomo-200 bg-surface px-2.5 py-1 text-xs text-plomo-500">
            <MapPin size={12} /> Sede: {sede} · {fecha}
          </span>
        </div>
      </div>
      {/* Flujo del módulo: subtítulo pequeño (ya no es una barra; el único menú es la isla) */}
      {pasos.length > 1 && (
        <p className="text-[11px] text-slate-500" aria-label="Flujo del módulo">
          {pasos.join(" → ")}
        </p>
      )}
    </section>
  );
}
