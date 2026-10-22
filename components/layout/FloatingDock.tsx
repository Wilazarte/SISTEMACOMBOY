"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Receipt, ShoppingCart, Warehouse, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { puedeVer, veDashboard, veTesoreria, type Sesion } from "@/lib/auth";

/** Módulos del dock. `corto` es la etiqueta en móvil. Planilla no va aquí: es una pestaña de Tesorería / Compras. */
const ITEMS: { href: string; label: string; corto: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", corto: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/compras", label: "Tesorería/Compras", corto: "Tesorería", icon: ShoppingCart },
  { href: "/dashboard/ventas", label: "Ventas", corto: "Ventas", icon: Receipt },
  { href: "/dashboard/almacen", label: "Inventario", corto: "Inventario", icon: Warehouse },
  // Reportes = libros, balance y EEFF del módulo contable
  { href: "/dashboard/contable", label: "Reportes", corto: "Reportes", icon: BarChart3 },
];

/** Tesorería / Compras queda activo también en sus subpáginas de planilla (adelantos, historial). */
const activoEn = (ruta: string, href: string) => {
  if (href === "/dashboard/compras") return ruta === href || ruta.startsWith("/dashboard/planilla");
  return href === "/dashboard" ? ruta === href : ruta === href || ruta.startsWith(`${href}/`);
};

/** Dock flotante: cápsula centrada con los módulos. Solo muestra los que el usuario puede abrir (ver puedeVer en lib/auth.ts). */
export function FloatingDock({ sesion }: { sesion: Sesion }) {
  const ruta = usePathname();
  const items = ITEMS.filter((i) => (i.href === "/dashboard" ? veDashboard(sesion) : i.href === "/dashboard/compras" ? veTesoreria(sesion) : puedeVer(sesion, i.href)));
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Módulos"
      className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-1 rounded-full border border-slate-800 bg-[#0f172a] px-2 py-2 sm:gap-5 sm:px-4 print:hidden"
    >
      {items.map(({ href, label, corto, icon: Icon }) => {
        const activo = activoEn(ruta, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            title={label}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-200",
              activo ? "bg-[#1e40af] text-white" : "text-slate-400 hover:bg-[#1e293b] hover:text-slate-200"
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
