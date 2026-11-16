"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Boxes, Landmark, ShieldAlert, ShoppingBag, Store } from "lucide-react";
import { RUTA_SUCURSAL, getSesion, type Sesion } from "@/lib/auth";
import { isAdmin } from "@/lib/permisosPlanta";
import { esUsuarioDeSede } from "@/lib/sedes";

// =====================================================================
// Submódulos de Secocha (2026-11-16): Ventas, Tesorería y Almacén, cada uno con su usuario.
//   - Usuario de Secocha con rol ventas / tesoreria / almacen -> solo su submódulo (regla RBAC: un módulo por perfil).
//   - Jefe de sede (rol sucursal, sucsecocha) -> Operación diaria + los tres submódulos.
//   - SOPORTE (creador / admin) -> todo.
//   - Taller y Tesorería de Arequipa (sin sede) -> solo Operación diaria (derivaciones, OT, cierres de caja).
// =====================================================================

export type SubSecocha = "operacion" | "ventas" | "tesoreria" | "almacen";

export const RUTA_SUB: Record<SubSecocha, string> = {
  operacion: RUTA_SUCURSAL,
  ventas: `${RUTA_SUCURSAL}/ventas`,
  tesoreria: `${RUTA_SUCURSAL}/tesoreria`,
  almacen: `${RUTA_SUCURSAL}/almacen`,
};

const INFO: Record<SubSecocha, { label: string; icon: ReactNode }> = {
  operacion: { label: "Operación diaria", icon: <Store size={16} /> },
  ventas: { label: "Ventas", icon: <ShoppingBag size={16} /> },
  tesoreria: { label: "Tesorería", icon: <Landmark size={16} /> },
  almacen: { label: "Almacén", icon: <Boxes size={16} /> },
};

const TODOS: SubSecocha[] = ["operacion", "ventas", "tesoreria", "almacen"];

/** Submódulo propio de un usuario de Secocha según su rol (null = no es usuario de submódulo). */
export function subDeRol(rol: string | undefined): SubSecocha | null {
  if (rol === "ventas") return "ventas";
  if (rol === "tesoreria" || rol === "finanzas" || rol === "planilla") return "tesoreria";
  if (rol === "almacen") return "almacen";
  return null;
}

export function submodulosSecocha(s: Sesion | null = getSesion()): SubSecocha[] {
  if (!s) return [];
  if (isAdmin(s) || s.rol === "creador") return TODOS;
  if (esUsuarioDeSede()) {
    const propio = subDeRol(s.rol);
    return propio ? [propio] : TODOS; // jefe de sede (sucursal) ve todo
  }
  return ["operacion"]; // Taller / Tesorería de Arequipa
}

/** Barra de submódulos + guardia: si el usuario no tiene este submódulo, va al suyo. */
export function SubmodulosSecocha({ actual, children }: { actual: SubSecocha; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const lista = submodulosSecocha();
  const permitido = lista.includes(actual);

  useEffect(() => {
    if (!permitido && lista.length) router.replace(RUTA_SUB[lista[0]]);
  }, [permitido, lista.length, lista[0], router]);

  if (!permitido)
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-plomo-500">
        <ShieldAlert size={24} className="text-amber-500" />
        Abriendo su submódulo…
      </div>
    );

  return (
    <div className="w-full space-y-6">
      {lista.length > 1 && (
        <nav aria-label="Submódulos de Secocha" className="flex flex-wrap gap-2">
          {lista.map((s) => {
            const activo = path === RUTA_SUB[s];
            return (
              <Link
                key={s}
                href={RUTA_SUB[s]}
                aria-current={activo ? "page" : undefined}
                className={
                  "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition " +
                  (activo ? "border-corp bg-corp text-white" : "border-plomo-200 bg-surface text-fg hover:bg-plomo-50")
                }
              >
                {INFO[s].icon}
                {INFO[s].label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}

/** Encabezado de un submódulo de Secocha. */
export function TituloSub({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div>
      <h1 className="font-serif tracking-tight text-2xl font-semibold leading-tight text-fg lg:text-[28px]">{titulo}</h1>
      <p className="mt-1 text-[13px] text-plomo-600">{detalle}</p>
    </div>
  );
}
