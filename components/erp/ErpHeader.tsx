"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, MapPin } from "lucide-react";
import { cargoDe, nombreDe, type Sesion } from "@/lib/auth";
import { ETIQUETA_PERFIL, perfilPlanta } from "@/lib/permisosPlanta";

const TIMES = '"Times New Roman", Times, serif';
export const NOMBRE_EMPRESA = "COMBOY VID";

/**
 * Encabezado fijo de todos los módulos: logo COMBOY VID a la izquierda, "ERP COMBOY VID" centrado y a la derecha
 * buscador (Ctrl K) y campana (`extra`), usuario (avatar SO SOPORTE, FI FINANZAS…) y salir.
 * No lleva botones a otros módulos: esos van en el dock y en Accesos rápidos, filtrados por permiso.
 */
export function ErpHeader({
  titulo = "ERP COMBOY VID",
  inicio = "/dashboard",
  usuario,
  nombre,
  badge,
  onSalir,
  extra,
}: {
  titulo?: string;
  inicio?: string;
  usuario?: string;
  nombre?: string;
  /** Distintivo junto al usuario (ej. "Soporte Dueño"). */
  badge?: string;
  onSalir?: () => void;
  extra?: ReactNode;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-[64px] items-center justify-between gap-3 border-b border-[#2a3445] bg-[#0e1219]/95 px-4 backdrop-blur print:hidden lg:px-6">
      <Link href={inicio} className="z-10 flex shrink-0 items-center" aria-label="Inicio">
        <Image src="/comboy-logo.png" alt="COMBOY VID" width={110} height={36} priority className="h-9 w-auto bg-transparent object-contain" />
      </Link>

      <h1
        className={`pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-extrabold uppercase text-white ${titulo.length > 20 ? "text-[15px] lg:block xl:text-[22px]" : "text-[18px] sm:block sm:text-[26px]"}`}
        style={{ fontFamily: TIMES }}
      >
        {titulo}
      </h1>

      <div className="z-10 flex items-center gap-2">
        {extra}
        {usuario && (
          <div className="flex items-center gap-3 rounded-full border border-[#2a3445] bg-[#1a212e] py-1 pl-1 pr-3 lg:px-3 lg:py-1.5" title={nombre ?? usuario}>
            <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#3f3f46] uppercase text-white md:flex" style={{ fontFamily: TIMES, fontSize: "14px" }}>
              {usuario.slice(0, 2)}
            </span>
            <span className="hidden max-w-[140px] truncate text-sm font-semibold text-white md:block">{usuario}</span>
            {badge && <span className="hidden rounded-full bg-[#f97316] px-2 py-0.5 text-[11px] font-semibold text-white lg:inline">{badge}</span>}
            {onSalir && (
              <button type="button" onClick={onSalir} className="ml-1 rounded-full p-1 transition hover:bg-white/10" aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut className="h-5 w-5 text-[#d4d4d8]" />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * Sub-header de todos los módulos: Nombre · Rol · MODULO X · Empresa; a la derecha Sede y fecha;
 * debajo el flujo del módulo como breadcrumb (Compra nacional → Agencia → Almacén → …).
 */
export function ErpSubHeader({
  sesion,
  modulo,
  flujo,
  persona,
  sede,
}: {
  sesion: Sesion;
  modulo?: string;
  flujo?: string;
  /** Nombre y cargo fijos del módulo. */
  persona?: { nombre: string; cargo: string };
  sede: string;
}) {
  const ruta = usePathname();
  const [fecha, setFecha] = useState("");
  useEffect(() => {
    setFecha(new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }));
  }, [ruta]);

  const perfil = perfilPlanta(sesion);
  const rol = perfil ? ETIQUETA_PERFIL[perfil].label : (persona?.cargo ?? cargoDe(sesion));
  const pasos = flujo ? flujo.split("→").map((p) => p.trim()).filter(Boolean) : [];
  return (
    <section className="flex w-full flex-col gap-2 rounded-xl border border-[#2a3445] bg-[#1a212e]/90 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] text-[#a1a1aa]">
          <span className="font-semibold text-white">{persona?.nombre ?? nombreDe(sesion)}</span>
          <span> · {rol}</span>
          {modulo && <span className="font-semibold text-[#fb923c]"> · MODULO {modulo}</span>}
          <span> · {NOMBRE_EMPRESA}</span>
        </p>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#2a3445] bg-[#212a3a] px-2.5 py-1 text-xs text-[#d4d4d8]">
          <MapPin size={12} className="text-[#f97316]" /> Sede: {sede} · {fecha}
        </span>
      </div>
      {pasos.length > 1 && (
        <nav aria-label="Flujo del módulo" className="flex flex-wrap items-center gap-1 text-[11px] text-[#a1a1aa]">
          {pasos.map((p, i) => (
            <Fragment key={p + i}>
              {i > 0 && <ChevronRight size={12} className="text-[#f97316]" aria-hidden />}
              <span className="rounded-md bg-[#212a3a] px-2 py-0.5">{p}</span>
            </Fragment>
          ))}
        </nav>
      )}
    </section>
  );
}

export default ErpHeader;
