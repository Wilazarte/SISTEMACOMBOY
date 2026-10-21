"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin } from "lucide-react";
import { cargoDe, moduloGuardado, nombreDe, type ModuloLogin, type Sesion } from "@/lib/auth";

export const ENCARGADOS: Record<string, string> = {
  tesoreria: "Encargada: LIZBETH CAHUANA APFATA - Tesorera / Compras",
  compras: "Encargada: LIZBETH CAHUANA APFATA - Tesorera / Compras",
  almacen: "Encargado: JOSE MANUEL ORTIZ ARAPA - Almacén",
  planilla: "Encargado: RRHH - Planilla",
  gerencia: "Encargado: Gerencia General - COMBOY VID",
};

const NOMBRE_EMPRESA = "COMBOY VID SOLUCIONES INDUSTRIALES";
const SEDE = "Arequipa";

/** Módulo por la ruta, si no hay uno elegido en el login. */
function moduloDeRuta(ruta: string): ModuloLogin {
  if (ruta.startsWith("/dashboard/compras") || ruta.startsWith("/dashboard/ventas") || ruta.startsWith("/dashboard/despachos")) return "tesoreria";
  if (ruta.startsWith("/dashboard/almacen") || ruta.startsWith("/dashboard/produccion")) return "almacen";
  if (ruta.startsWith("/dashboard/planilla")) return "planilla";
  return "gerencia";
}

/** Franja de contexto de cada módulo: usuario | cargo | empresa, encargado, sede y flujo de trabajo. */
export function Header({ sesion, flujo }: { sesion: Sesion; flujo?: string }) {
  const ruta = usePathname();
  const [moduloActual, setModuloActual] = useState<ModuloLogin>(() => moduloDeRuta(ruta));
  const [fecha, setFecha] = useState("");

  useEffect(() => {
    setModuloActual(moduloGuardado() ?? moduloDeRuta(ruta));
    setFecha(new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  }, [ruta]);

  const pasos = flujo ? flujo.split("→").map((p) => p.trim()) : [];
  return (
    <section className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] text-plomo-500">
          <span className="font-medium text-fg">{nombreDe(sesion)}</span> · {cargoDe(sesion)} · {NOMBRE_EMPRESA}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-plomo-200 bg-surface px-2.5 py-1 text-xs text-fg-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> {ENCARGADOS[moduloActual]}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-plomo-200 bg-surface px-2.5 py-1 text-xs text-plomo-500">
            <MapPin size={12} /> Sede {SEDE} · {fecha}
          </span>
        </div>
      </div>
      {pasos.length > 1 && (
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-plomo-500" aria-label="Flujo del módulo">
          <li className="mr-1 font-medium">Flujo</li>
          {pasos.map((p, i) => (
            <li key={p} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>→</span>}
              <span className="rounded-md border border-plomo-200 bg-surface px-2 py-0.5">{p}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
