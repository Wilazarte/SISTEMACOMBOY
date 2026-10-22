"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

const TIMES = '"Times New Roman", Times, serif';

/**
 * Encabezado fijo de cada módulo: logo a la izquierda, "MODULO X" centrado absoluto (Times New Roman 800, 28px)
 * y a la derecha buscador / campana (`extra`) + cápsula del usuario con cerrar sesión. Sin línea de encargada.
 */
export function ModuleHeader({
  moduleName,
  inicio = "/dashboard",
  usuario,
  nombre,
  onSalir,
  extra,
}: {
  moduleName: string;
  inicio?: string;
  usuario?: string;
  nombre?: string;
  onSalir?: () => void;
  /** Buscador global (Ctrl K), campana y avisos: van antes de la cápsula del usuario. */
  extra?: ReactNode;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-[64px] items-center justify-between gap-3 border-b border-gray-800/50 bg-[#0f172a] px-4 print:hidden lg:px-6">
      {/* Izquierda - Logo */}
      <Link href={inicio} className="z-10 flex shrink-0 items-center" aria-label="Inicio">
        <Image src="/comboy-logo.png" alt="COMBOY VID" width={110} height={36} priority className="h-9 w-auto bg-transparent object-contain" />
      </Link>

      {/* Centro - absolutamente centrado */}
      <h1
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[18px] font-extrabold uppercase text-white sm:text-[28px]"
        style={{ fontFamily: TIMES }}
      >
        MODULO {moduleName}
      </h1>

      {/* Derecha - buscador, campana y usuario */}
      <div className="z-10 flex items-center gap-2">
        {extra}
        {usuario && (
          <div className="flex items-center gap-3 rounded-full border border-gray-700 bg-[#1e293b] py-1 pl-1 pr-3 lg:px-4 lg:py-2" title={nombre ?? usuario}>
            <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#57534e] uppercase text-white md:flex" style={{ fontFamily: TIMES, fontSize: "14px" }}>
              {usuario.slice(0, 2)}
            </span>
            <span className="hidden max-w-[140px] truncate text-sm text-white md:block" style={{ fontFamily: TIMES }}>
              {usuario}
            </span>
            {onSalir && (
              <button type="button" onClick={onSalir} className="ml-1 rounded-full p-1 transition hover:bg-white/10 md:ml-2" aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut className="h-5 w-5 text-gray-300" />
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export default ModuleHeader;
