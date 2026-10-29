"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Factory, Gauge, LayoutDashboard, Landmark, Receipt, ShoppingCart, Truck, Users, Warehouse, type LucideIcon } from "lucide-react";
import { EV_IR_PESTANA, cn } from "@/components/ui";
import { puedeVer, veDashboard, type Sesion } from "@/lib/auth";

type Id = "dashboard" | "gerencia" | "logistica" | "finanzas" | "produccion" | "tesoreria" | "sucursal" | "planilla" | "ventas" | "inventario" | "reportes";

/**
 * Módulos del dock. `corto` es la etiqueta en móvil. Tesorería y Planilla viven en la misma página
 * (/dashboard/compras): `tab` es la pestaña que abre cada botón (ver fueraDeIsla en Tabs).
 * `oculto`: el módulo sigue existiendo (ruta, permisos y datos) pero no se muestra en el dock.
 * Visibles (pedido de Williams, 2026-10-29): Logística, Almacén, Finanzas y Producción.
 */
const ITEMS: { id: Id; href: string; label: string; corto: string; icon: LucideIcon; tab?: string; permiso: string; oculto?: boolean }[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", corto: "Dashboard", icon: LayoutDashboard, permiso: "/dashboard", oculto: true },
  // Dashboard Gerencia: solo lo ven GERENCIA y SOPORTE (puedeVer)
  { id: "gerencia", href: "/gerencia", label: "Gerencia", corto: "Gerencia", icon: Gauge, permiso: "/gerencia" },
  { id: "logistica", href: "/logistica", label: "Logística", corto: "Logística", icon: Truck, permiso: "/logistica" },
  { id: "inventario", href: "/almacen", label: "Almacén", corto: "Almacén", icon: Warehouse, permiso: "/almacen" },
  // Almacén, Finanzas y Producción abren su home (/almacen, /finanzas, /produccion); desde ahí se abre el módulo de trabajo
  { id: "finanzas", href: "/finanzas", label: "Finanzas", corto: "Finanzas", icon: Landmark, permiso: "/finanzas" },
  { id: "produccion", href: "/produccion", label: "Producción", corto: "Producción", icon: Factory, permiso: "/produccion" },
  { id: "tesoreria", href: "/dashboard/compras", label: "Tesorería/Compras", corto: "Tesorería", icon: ShoppingCart, tab: "registrar", permiso: "/dashboard/compras", oculto: true },
  { id: "planilla", href: "/dashboard/compras?tab=planilla", label: "Planilla", corto: "Planilla", icon: Users, tab: "planilla", permiso: "/dashboard/planilla", oculto: true },
  { id: "ventas", href: "/dashboard/ventas", label: "Ventas", corto: "Ventas", icon: Receipt, permiso: "/dashboard/ventas", oculto: true },
  // Reportes = libros, balance y EEFF del módulo contable
  { id: "reportes", href: "/dashboard/contable", label: "Reportes", corto: "Reportes", icon: BarChart3, permiso: "/dashboard/contable", oculto: true },
];

/** Botón activo según la ruta y, en /dashboard/compras, la pestaña abierta (Planilla o Tesorería). */
function activoDe(ruta: string, tab: string | undefined): Id | undefined {
  if (ruta === "/dashboard") return "dashboard";
  // Tesorería, Planilla y Contable se muestran bajo Finanzas
  if (ruta === "/finanzas" || ruta === "/dashboard/compras" || ruta.startsWith("/dashboard/planilla") || ruta.startsWith("/dashboard/contable")) return "finanzas";
  if (ruta.startsWith("/dashboard/almacen")) return "inventario";
  if (ruta.startsWith("/dashboard/produccion")) return "produccion";
  return ITEMS.find((i) => !i.oculto && i.id !== "dashboard" && (ruta === i.href || ruta.startsWith(`${i.href}/`)))?.id;
}

/** Dock flotante: cápsula centrada con los módulos. Solo muestra los que el usuario puede abrir (ver puedeVer en lib/auth.ts). */
export function FloatingDock({ sesion, tab }: { sesion: Sesion; tab?: string }) {
  const ruta = usePathname();
  const items = ITEMS.filter(
    (i) => !i.oculto && (i.id === "dashboard" ? veDashboard(sesion) : puedeVer(sesion, i.permiso))
  );
  if (items.length === 0) return null;
  const activo = activoDe(ruta, tab);

  return (
    <nav
      aria-label="Módulos"
      className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 gap-1 rounded-full border border-[#2a2a2a] bg-[#141414] px-2 py-2 backdrop-blur sm:gap-3 sm:px-4 print:hidden"
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
              on ? "bg-[#ff6b00] font-bold text-white" : "font-normal text-[#a1a1aa] hover:bg-white/5 hover:text-white"
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
