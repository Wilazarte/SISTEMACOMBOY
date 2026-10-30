"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

const TIMES = '"Times New Roman", Times, serif';
export const NOMBRE_EMPRESA = "COMBOY VID";

/**
 * Barra superior de todos los módulos (pedido de Williams, 2026-10-29): izquierda logo + "ERP COMBOY VID",
 * centro el nombre del módulo actual en rojo #2a7bff (ALMACEN, LOGISTICA, FINANZAS, PRODUCCION…; viene de la ruta),
 * derecha buscador (Ctrl K), campana (`extra`), usuario (SO SOPORTE…) y salir.
 * No lleva botones a otros módulos: esos van en el dock y en Accesos rápidos, filtrados por permiso.
 */
export function ErpHeader({
  modulo,
  inicio = "/dashboard",
  usuario,
  nombre,
  badge,
  onSalir,
  extra,
}: {
  /** Nombre del módulo actual (centro, en rojo). */
  modulo?: string;
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
      <Link href={inicio} className="z-10 flex shrink-0 items-center gap-3" aria-label="Inicio">
        <Image src="/comboy-logo.png" alt="COMBOY VID" width={110} height={36} priority className="h-9 w-auto bg-transparent object-contain" />
        <span className="hidden whitespace-nowrap text-[18px] font-extrabold uppercase text-white lg:block" style={{ fontFamily: TIMES }}>
          ERP COMBOY VID
        </span>
      </Link>

      {modulo && (
        <h1
          className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[20px] font-extrabold uppercase text-[#2a7bff] sm:block sm:text-[28px]"
          style={{ fontFamily: TIMES }}
        >
          {modulo}
        </h1>
      )}

      <div className="z-10 flex items-center gap-2">
        {extra}
        {usuario && (
          <div className="flex items-center gap-3 rounded-full border border-[#2a3445] bg-[#1a212e] py-1 pl-1 pr-3 lg:px-3 lg:py-1.5" title={nombre ?? usuario}>
            <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#3f3f46] uppercase text-white md:flex" style={{ fontFamily: TIMES, fontSize: "14px" }}>
              {usuario.slice(0, 2)}
            </span>
            <span className="hidden max-w-[140px] truncate text-sm font-semibold text-white md:block">{usuario}</span>
            {badge && <span className="hidden rounded-full bg-[#2a7bff] px-2 py-0.5 text-[11px] font-semibold text-white lg:inline">{badge}</span>}
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

export default ErpHeader;
