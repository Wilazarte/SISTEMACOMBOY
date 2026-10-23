import { Calculator, ClipboardList, Factory, KeyRound, LayoutDashboard, PackagePlus, Plus, Receipt, ShoppingCart, Users, Warehouse, type LucideIcon } from "lucide-react";
import { puedeVer, veDashboard, type Sesion } from "@/lib/auth";

/** Submenú: abre la pestaña `tab` del módulo (components/ui Tabs lee ?tab=) o una subpágina (`href`). */
export interface SubNav {
  label: string;
  tab?: string;
  href?: string;
}

export interface ItemNav {
  href: string;
  label: string;
  icon: LucideIcon;
  seccion?: string;
  subs: SubNav[];
}

export const NAV: ItemNav[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, subs: [] },
  { href: "/dashboard/produccion", label: "Producción", icon: Factory, seccion: "Operaciones", subs: [] },
  {
    href: "/dashboard/almacen",
    label: "Almacén",
    icon: Warehouse,
    subs: [
      { label: "Nuevo requerimiento", tab: "nuevo" },
      { label: "Requerimientos", tab: "lista" },
      { label: "Ingresos", tab: "ingresos" },
      { label: "Stock", tab: "stock" },
      { label: "Órdenes de despacho", tab: "despacho" },
    ],
  },
  {
    href: "/dashboard/ventas",
    label: "Ventas",
    icon: Receipt,
    subs: [
      { label: "Notas de pedido", tab: "notas" },
      { label: "Comprobantes", tab: "comprobantes" },
      { label: "Despachos", tab: "despachos" },
      { label: "Catálogo de Productos", tab: "productos" },
      { label: "Clientes", tab: "clientes" },
      { label: "Cuentas por cobrar", tab: "cobrar" },
      { label: "Configuración", tab: "condiciones" },
    ],
  },
  {
    href: "/dashboard/compras",
    label: "Tesorería / Compras",
    icon: ShoppingCart,
    subs: [
      { label: "Registrar gasto / compra", tab: "registrar" },
      { label: "Antecedentes", tab: "antecedentes" },
      { label: "Cotizaciones", tab: "cotizaciones" },
      { label: "Órdenes de compra", tab: "ordenes" },
      { label: "Facturas", tab: "facturas" },
      { label: "Planilla", tab: "planilla" },
    ],
  },
  {
    href: "/dashboard/contable",
    label: "Contable",
    icon: Calculator,
    seccion: "Finanzas y personal",
    subs: [
      { label: "Libro Diario", tab: "diario" },
      { label: "Mayor", tab: "mayor" },
      { label: "Balance", tab: "balance" },
      { label: "EEFF", tab: "eeff" },
    ],
  },
  {
    href: "/dashboard/planilla",
    label: "Planilla",
    icon: Users,
    subs: [
      { label: "Trabajadores", tab: "trabajadores" },
      { label: "Planilla del periodo", tab: "planilla" },
      { label: "Historial", tab: "historial" },
      { label: "Contratistas", tab: "contratistas" },
      { label: "Adelantos", href: "/dashboard/planilla/adelantos" },
    ],
  },
  // Solo creador / admin (ver puedeVer en lib/auth.ts)
  { href: "/dashboard/creador", label: "Módulo Creador", icon: KeyRound, subs: [] },
];

export const navDe = (sesion: Sesion): ItemNav[] => NAV.filter((n) => (n.href === "/dashboard" ? veDashboard(sesion) : puedeVer(sesion, n.href)));

/** Módulo de la ruta actual (el más específico). */
export const moduloDe = (ruta: string): ItemNav | undefined =>
  NAV.find((n) => n.href !== "/dashboard" && (ruta === n.href || ruta.startsWith(`${n.href}/`))) ?? (ruta === "/dashboard" ? NAV[0] : undefined);

export const hrefSub = (n: ItemNav, s: SubNav): string => s.href ?? `${n.href}?tab=${s.tab}`;

/** Acciones rápidas: botón +, buscador y atajos de teclado (una letra). */
export interface AccionRapida {
  id: string;
  label: string;
  detalle: string;
  tecla: string;
  icon: LucideIcon;
  href: string;
}

export const ACCIONES: AccionRapida[] = [
  { id: "venta", label: "Nueva venta", detalle: "Ventas › Comprobantes", tecla: "N", icon: Plus, href: "/dashboard/ventas?tab=comprobantes" },
  { id: "pedido", label: "Nuevo pedido", detalle: "Ventas › Notas de pedido", tecla: "P", icon: ClipboardList, href: "/dashboard/ventas?tab=notas" },
  { id: "req", label: "Nuevo requerimiento", detalle: "Almacén", tecla: "R", icon: PackagePlus, href: "/dashboard/almacen?tab=nuevo" },
  { id: "gasto", label: "Registrar gasto / compra", detalle: "Tesorería / Compras", tecla: "G", icon: ShoppingCart, href: "/dashboard/compras?tab=registrar" },
];

/** Acciones que el usuario puede usar (los de solo lectura no registran nada). */
export const accionesDe = (sesion: Sesion): AccionRapida[] =>
  sesion.soloLectura
    ? []
    : // Taller y Tesorería ven la Sucursal, pero no registran sus ventas
      ACCIONES.filter((a) => puedeVer(sesion, a.href.split("?")[0]));
