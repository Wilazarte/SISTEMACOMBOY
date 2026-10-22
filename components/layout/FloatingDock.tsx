"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Receipt, ShoppingCart, Users, Warehouse, type LucideIcon } from "lucide-react";
import { EV_IR_PESTANA, cn } from "@/components/ui";
import { puedeVer, veDashboard, type Sesion } from "@/lib/auth";

type Id = "dashboard" | "tesoreria" | "sucursal" | "planilla" | "ventas" | "inventario" | "reportes";

/**
 * Módulos del dock. `corto` es la etiqueta en móvil. Tesorería y Planilla viven en la misma página
 * (/dashboard/compras): `tab` es la pestaña que abre cada botón (ver fueraDeIsla en Tabs).
 */
const ITEMS: { id: Id; href: string; label: string; corto: string; icon: LucideIcon; tab?: string; permiso: string }[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", corto: "Dashboard", icon: LayoutDashboard, permiso: "/dashboard" },
  { id: "tesoreria", href: "/dashboard/compras", label: "Tesorería/Compras", corto: "Tesorería", icon: ShoppingCart, tab: "registrar", permiso: "/dashboard/compras" },
  { id: "planilla", href: "/dashboard/compras?tab=planilla", label: "Planilla", corto: "Planilla", icon: Users, tab: "planilla", permiso: "/dashboard/planilla" },
  { id: "ventas", href: "/dashboard/ventas", label: "Ventas", corto: "Ventas", icon: Receipt, permiso: "/dashboard/ventas" },
  { id: "inventario", href: "/dashboard/almacen", label: "Inventario", corto: "Inventario", icon: Warehouse, permiso: "/dashboard/almacen" },
  // Reportes = libros, balance y EEFF del módulo contable
  { id: "reportes", href: "/dashboard/contable", label: "Reportes", corto: "Reportes", icon: BarChart3, permiso: "/dashboard/contable" },
];

/** Botón activo según la ruta y, en /dashboard/compras, la pestaña abierta (Planilla o Tesorería). */
function activoDe(ruta: string, tab: string | undefined): Id | undefined {
  if (ruta === "/dashboard") return "dashboard";
  if (ruta.startsWith("/dashboard/planilla")) return "planilla";
  if (ruta === "/dashboard/compras") return tab === "planilla" ? "planilla" : "tesoreria";
  return ITEMS.find((i) => i.id !== "dashboard" && (ruta === i.href || ruta.startsWith(`${i.href}/`)))?.id;
}

/** Dock flotante: cápsula centrada con los módulos. Solo muestra los que el usuario puede abrir (ver puedeVer en lib/auth.ts). */
export function FloatingDock({ sesion, tab }: { sesion: Sesion; tab?: string }) {
  const ruta = usePathname();
  const items = ITEMS.filter((i) => (i.id === "dashboard" ? veDashboard(sesion) : puedeVer(sesion, i.permiso)));
  if (items.length === 0) return null;
  const activo = activoDe(ruta, tab);

  return (
    <nav
      aria-label="Módulos"
      className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-1 rounded-full border border-slate-800 bg-[#1e293b] px-2 py-2 backdrop-blur sm:gap-3 sm:px-4 print:hidden"
    >
      {items.map(({ id, href, label, corto, icon: Icon, tab: destino }) => {
        const on = activo === id;
        return (
          <Link
            key={id}
            href={href}
            // Ya en /dashboard/compras: la página no se recarga, se cambia de pestaña (Tesorería ⇄ Planilla)
            onClick={() => destino && ruta === "/dashboard/compras" && window.dispatchEvent(new CustomEvent(EV_IR_PESTANA, { detail: destino }))}
            aria-current={on ? "page" : undefined}
            title={label}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[11px] sm:px-3 transition-colors duration-200",
              on ? "bg-[#2563eb] font-bold text-white" : "font-normal text-gray-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon size={18} strokeWidth={2} />
            <span className="max-w-full truncate lg:hidden">{corto}</span>
            <span className="hidden max-w-full truncate lg:block">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default FloatingDock;
