"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin, UserCheck } from "lucide-react";
import { cargoDe, moduloGuardado, type ModuloLogin, type Sesion } from "@/lib/auth";

export const ENCARGADOS: Record<ModuloLogin, string> = {
  tesoreria: "Encargado: C.P.C. Maria Torres - Tesorería",
  almacen: "Encargado: Ing. Will Lazarte - Almacén",
  planilla: "Encargado: Lic. Ana Quispe - RRHH",
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

/** Encabezado de cada módulo: bienvenida, usuario | cargo | empresa y el encargado del módulo. */
export function Header({ sesion }: { sesion: Sesion }) {
  const ruta = usePathname();
  const [moduloActual, setModuloActual] = useState<ModuloLogin>(() => moduloDeRuta(ruta));
  const [fecha, setFecha] = useState("");

  useEffect(() => {
    setModuloActual(moduloGuardado() ?? moduloDeRuta(ruta));
    setFecha(new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  }, [ruta]);

  return (
    <section className="flex w-full flex-col gap-4 rounded-xl border border-plomo-200 bg-white px-6 py-5 shadow-[0_4px_12px_rgba(15,36,64,0.06)] md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-xl font-semibold text-azul-900 sm:text-2xl">Bienvenido al Sistema ERP COMBOY VID</h1>
        <p className="mt-1 truncate text-sm text-plomo-600">
          {sesion.nombre} | {cargoDe(sesion)} | {NOMBRE_EMPRESA}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1.5 md:items-end">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
          <UserCheck size={14} /> {ENCARGADOS[moduloActual]}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-plomo-500">
          <MapPin size={12} /> Sede: {SEDE} | {fecha}
        </span>
      </div>
    </section>
  );
}
