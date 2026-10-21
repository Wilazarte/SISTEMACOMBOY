"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, Receipt, ShoppingCart, Users, Warehouse, type LucideIcon } from "lucide-react";
import { useIr } from "@/components/shell/ir";
import { cn } from "@/components/ui";
import { puedeVer, veDashboard, type Sesion } from "@/lib/auth";

/** Dock inferior de módulos. `corto` es la etiqueta en móvil. Planilla es la pestaña "planilla" de Tesorería. */
const ITEMS: { href: string; label: string; corto: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", corto: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/compras", label: "Tesorería/Compras", corto: "Tesorería", icon: ShoppingCart },
  { href: "/dashboard/compras?tab=planilla", label: "Planilla", corto: "Planilla", icon: Users },
  { href: "/dashboard/ventas", label: "Ventas", corto: "Ventas", icon: Receipt },
  { href: "/dashboard/almacen", label: "Inventario", corto: "Inventario", icon: Warehouse },
  // Reportes = libros, balance y EEFF del módulo contable
  { href: "/dashboard/contable", label: "Reportes", corto: "Reportes", icon: BarChart3 },
];

const PLANILLA = "/dashboard/compras?tab=planilla";
/** `tab`: pestaña abierta en la página (el layout la conoce por components/ui Tabs). */
const activoEn = (ruta: string, href: string, tab: string | null) => {
  if (href === PLANILLA) return (ruta === "/dashboard/compras" && tab === "planilla") || ruta.startsWith("/dashboard/planilla");
  if (href === "/dashboard/compras") return ruta === href && tab !== "planilla";
  return href === "/dashboard" ? ruta === href : ruta === href || ruta.startsWith(`${href}/`);
};

/** Solo muestra los módulos que el usuario puede abrir (ver puedeVer en lib/auth.ts). */
export function BottomNav({ sesion, tab = null }: { sesion: Sesion; tab?: string | null }) {
  const ruta = usePathname();
  const ir = useIr();
  const items = ITEMS.filter((i) =>
    i.href === "/dashboard"
      ? veDashboard(sesion)
      : i.href === PLANILLA
        ? puedeVer(sesion, "/dashboard/planilla")
        : i.href === "/dashboard/compras"
          ? puedeVer(sesion, "/dashboard/compras")
          : puedeVer(sesion, i.href)
  );
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Módulos"
      className="fixed inset-x-0 bottom-0 z-[70] flex h-20 items-center gap-1 rounded-b-none rounded-t-[24px] border border-white/15 bg-black/60 px-2 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl print:hidden lg:inset-x-auto lg:bottom-6 lg:left-1/2 lg:w-[680px] lg:max-w-[95vw] lg:-translate-x-1/2 lg:rounded-full lg:px-3"
    >
      {items.map(({ href, label, corto, icon: Icon }) => {
        const activo = activoEn(ruta, href, tab);
        return (
          <Link
            key={href}
            href={href}
            onClick={(e) => {
              // Tesorería y Planilla son pestañas de la misma página: también cambian de pestaña sin recargar
              if (href.includes("?tab=") || href === "/dashboard/compras") {
                e.preventDefault();
                ir(href === "/dashboard/compras" ? "/dashboard/compras?tab=registrar" : href);
              }
            }}
            aria-current={activo ? "page" : undefined}
            title={label}
            className={cn(
              "flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full border text-[11px] font-semibold transition-all duration-200",
              activo
                ? "border-[#2a7bff] bg-[#2a7bff]/20 text-[#2a7bff] shadow-[0_0_20px_rgba(42,123,255,0.5)]"
                : "border-transparent text-white/60 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon size={22} strokeWidth={2} />
            <span className="max-w-full truncate px-1 lg:hidden">{corto}</span>
            <span className="hidden max-w-full truncate px-1 lg:block">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
