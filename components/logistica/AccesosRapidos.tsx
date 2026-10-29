"use client";

import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  BadgeCheck,
  Banknote,
  BookOpen,
  Boxes,
  ClipboardList,
  Container,
  Eye,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Landmark,
  PackageCheck,
  PackageMinus,
  Play,
  Receipt,
  Scale,
  ShoppingCart,
  Store,
  Truck,
  Upload,
  Users,
} from "lucide-react";
import { puedeVer, type Sesion } from "@/lib/auth";
import { abrirPestana } from "@/lib/logistica";
import { KEYS, useStore } from "@/lib/storage";
import type { Guia } from "@/lib/types";
import { RUTA_MUNDO_VENTAS, perfilPlanta, permisosPlanta, type PermisosPlanta } from "@/lib/permisosPlanta";
import { AccesosModulos, type ModuloPlanta } from "./planta";

interface Accion {
  label: string;
  href: string;
  icono: ReactNode;
  /** Ruta con la que se valida el permiso (si href es una redirección). */
  permiso?: string;
  /** Permiso del perfil que exige la acción. */
  requiere?: keyof PermisosPlanta;
}

const ACCIONES: Record<ModuloPlanta, Accion[]> = {
  logistica: [
    { label: "Mundo Ventas", href: RUTA_MUNDO_VENTAS, permiso: "/dashboard/ventas", requiere: "canAccessMundoVentas", icono: <Store size={26} /> },
    { label: "Emitir Factura", href: "/dashboard/ventas?tab=comprobantes", requiere: "canEmitFactura", icono: <FileCheck2 size={26} /> },
    { label: "Emitir Guía", href: "/dashboard/almacen?tab=despacho", requiere: "canEmitGuia", icono: <FileText size={26} /> },
    { label: "Crear OC", href: "/dashboard/compras?tab=ordenes", icono: <ShoppingCart size={26} /> },
    { label: "Cotizar Proveedor", href: "/dashboard/compras?tab=cotizaciones", icono: <FileSpreadsheet size={26} /> },
    { label: "Confirmar Guía", href: "/dashboard/almacen?tab=ingresos", icono: <PackageCheck size={26} /> },
    { label: "Bancarizar Voucher", href: "/dashboard/compras?tab=ordenes", icono: <Landmark size={26} /> },
    { label: "Pagar Proveedor", href: "/dashboard/compras?tab=facturas", icono: <Banknote size={26} /> },
    { label: "Liquidar Flete", href: "/logistica/cotizar-flete", icono: <Truck size={26} /> },
    { label: "Registrar Factura", href: "/dashboard/compras?tab=facturas", icono: <Receipt size={26} /> },
    { label: "Generar PDT", href: "/dashboard/contable", icono: <FileText size={26} /> },
  ],
  almacen: [
    { label: "Nuevo Requerimiento", href: "/dashboard/almacen?tab=nuevo", icono: <FilePlus2 size={26} /> },
    { label: "Nota de Ingreso", href: "/dashboard/almacen?tab=ingresos", icono: <ArrowDownToLine size={26} /> },
    { label: "Confirmar Guía", href: "/dashboard/almacen?tab=ingresos", icono: <PackageCheck size={26} /> },
    { label: "Validar Stock", href: "/dashboard/almacen?tab=stock", icono: <Boxes size={26} /> },
    { label: "Entrega a Producción", href: "/dashboard/almacen?tab=stock", icono: <PackageMinus size={26} /> },
    { label: "Ingreso PT", href: "/dashboard/produccion", icono: <Container size={26} /> },
    { label: "Despachar OD", href: "/dashboard/almacen?tab=despacho", icono: <Truck size={26} /> },
    { label: "Emitir Guía", href: "/dashboard/almacen?tab=despacho", requiere: "canEmitGuia", icono: <FileText size={26} /> },
    { label: "Mis Requerimientos", href: "/dashboard/almacen?tab=lista", icono: <ClipboardList size={26} /> },
  ],
  finanzas: [
    { label: "Registrar Gasto", href: "/dashboard/compras?tab=registrar", icono: <Receipt size={26} /> },
    { label: "Bancarizar Voucher", href: "/dashboard/compras?tab=ordenes", icono: <Landmark size={26} /> },
    { label: "Pagar Proveedor", href: "/dashboard/compras?tab=facturas", icono: <Banknote size={26} /> },
    { label: "Subir Asistencia", href: "/dashboard/compras?tab=planilla", icono: <Upload size={26} /> },
    { label: "Pagar Planilla", href: "/dashboard/compras?tab=planilla", icono: <Users size={26} /> },
    { label: "Cuentas por Cobrar", href: "/dashboard/ventas?tab=cobrar", icono: <HandCoins size={26} /> },
    // Solo lectura: Finanzas ve facturas, IGV, balance y PDT, pero no emite comprobantes
    { label: "Ver Facturas", href: "/finanzas#facturacion", permiso: "/finanzas", requiere: "canViewFacturas", icono: <Eye size={26} /> },
    { label: "Libros Contables", href: "/dashboard/contable", icono: <BookOpen size={26} /> },
    { label: "Balance", href: "/dashboard/contable?tab=balance", requiere: "canViewFacturas", icono: <Scale size={26} /> },
    { label: "IGV / PDT 621", href: "/dashboard/contable", requiere: "canViewFacturas", icono: <FileText size={26} /> },
  ],
  produccion: [
    { label: "Iniciar OP", href: "/dashboard/produccion", icono: <Play size={26} /> },
    { label: "Solicitar MP a Almacén", href: "/dashboard/almacen?tab=nuevo", icono: <FilePlus2 size={26} /> },
    { label: "Retiro para Producción", href: "/dashboard/almacen?tab=stock", icono: <PackageMinus size={26} /> },
    { label: "Registrar QC", href: "/dashboard/produccion", icono: <BadgeCheck size={26} /> },
    { label: "Entregar PT a Almacén", href: "/dashboard/produccion", icono: <Container size={26} /> },
    { label: "Ver Stock MP", href: "/dashboard/almacen?tab=stock", icono: <Boxes size={26} /> },
  ],
};

/**
 * Accesos rápidos según el perfil: solo SOPORTE navega entre los 4 módulos; los demás ven únicamente las funciones
 * de su módulo (las que su perfil y su usuario pueden abrir). Cada acción abre el módulo de siempre en otra pestaña.
 */
export function AccesosRapidos({ sesion, actual }: { sesion: Sesion | null; actual: ModuloPlanta }) {
  const perfil = perfilPlanta(sesion);
  const permisos = permisosPlanta(sesion);
  const guias = useStore<Guia[]>(KEYS.GUIAS, [], perfil !== "soporte" && perfil !== null);
  if (!sesion || perfil === null) return null;
  if (perfil === "soporte" || permisos.canNavegarModulos) return <AccesosModulos sesion={sesion} actual={actual} />;

  // "Confirmar Guía" lleva el número de la primera guía por V°B° (ej. Confirmar Guía T001-554)
  const guia = guias.find((g) => g.estado === "PENDIENTE_VB");
  const acciones = ACCIONES[perfil]
    .map((a) => (a.label === "Confirmar Guía" && guia ? { ...a, label: `Confirmar Guía ${guia.numero}` } : a))
    .filter((a) => (!a.requiere || permisos[a.requiere]) && puedeVer(sesion, a.permiso ?? a.href.split("?")[0]));

  return (
    <section>
      <h2 className="mb-3 text-xl font-bold uppercase text-[#fb923c]">Accesos rápidos</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {acciones.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => abrirPestana(a.href)}
            title="Se abre en una pestaña nueva"
            className="group flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border border-[#2a3445] bg-[#1a212e] px-3 py-4 text-center transition hover:border-[#f97316]"
          >
            <span className="text-[#f97316] transition group-hover:scale-105">{a.icono}</span>
            <span className="text-[15px] font-bold text-white">{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default AccesosRapidos;
