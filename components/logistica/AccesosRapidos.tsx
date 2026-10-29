"use client";

import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  BadgeCheck,
  Banknote,
  BookOpen,
  Boxes,
  Camera,
  ClipboardList,
  Container,
  Eye,
  FileCheck2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Landmark,
  MapPin,
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
import type { OrdenProduccion } from "@/lib/produccion";
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
  /** Botón naranja grande (Mundo Ventas). */
  destacado?: boolean;
}

const ACCIONES: Record<ModuloPlanta, Accion[]> = {
  logistica: [
    { label: "Mundo Ventas", href: RUTA_MUNDO_VENTAS, permiso: "/dashboard/ventas", requiere: "canAccessMundoVentas", destacado: true, icono: <Store size={30} /> },
    { label: "Crear OC", href: "/dashboard/compras?tab=ordenes", icono: <ShoppingCart size={26} /> },
    { label: "Cotizar Proveedor", href: "/dashboard/compras?tab=cotizaciones", icono: <FileSpreadsheet size={26} /> },
    { label: "Confirmar Guía", href: "/dashboard/almacen?tab=ingresos", icono: <PackageCheck size={26} /> },
    { label: "Bancarizar Voucher", href: "/dashboard/compras?tab=ordenes", icono: <Landmark size={26} /> },
    { label: "Pagar Proveedor", href: "/dashboard/compras?tab=facturas", icono: <Banknote size={26} /> },
    { label: "Emitir Factura F001", href: "/dashboard/ventas?tab=comprobantes", requiere: "canEmitFactura", icono: <FileCheck2 size={26} /> },
    { label: "Emitir Guía Remisión", href: "/dashboard/almacen?tab=despacho", requiere: "canEmitGuia", icono: <FileText size={26} /> },
    { label: "Liquidar Flete", href: "/logistica/cotizar-flete", icono: <Truck size={26} /> },
    { label: "Cotizar Cliente", href: "/dashboard/ventas?tab=notas", requiere: "canEmitFactura", icono: <HandCoins size={26} /> },
    { label: "Generar Pedido Venta", href: "/dashboard/ventas?tab=notas", requiere: "canEmitFactura", icono: <ClipboardList size={26} /> },
  ],
  almacen: [
    { label: "Capturar Foto", href: "/dashboard/almacen?tab=ingresos", icono: <Camera size={26} /> },
    { label: "Ubicaciones", href: "/dashboard/almacen?tab=stock", icono: <MapPin size={26} /> },
    { label: "Recepción MP", href: "/dashboard/almacen?tab=ingresos", icono: <ArrowDownToLine size={26} /> },
    { label: "Entrega Producción", href: "/dashboard/almacen?tab=stock", icono: <PackageMinus size={26} /> },
    { label: "Ingreso PT", href: "/dashboard/produccion", icono: <Container size={26} /> },
    { label: "Movimientos", href: "/dashboard/almacen?tab=stock", icono: <Boxes size={26} /> },
    { label: "Validación Stock SÍ/NO", href: "/dashboard/almacen?tab=stock", icono: <BadgeCheck size={26} /> },
  ],
  finanzas: [
    // Solo lectura: Finanzas ve facturas, IGV, balance y PDT, pero no emite comprobantes
    { label: "Ver Facturas Emitidas", href: "/finanzas#facturacion", permiso: "/finanzas", requiere: "canViewFacturas", icono: <Eye size={26} /> },
    { label: "Ver IGV", href: "/dashboard/contable", requiere: "canViewFacturas", icono: <Receipt size={26} /> },
    { label: "Ver Balance", href: "/dashboard/contable?tab=balance", requiere: "canViewFacturas", icono: <Scale size={26} /> },
    { label: "Ver PDT 621", href: "/dashboard/contable", requiere: "canViewFacturas", icono: <FileText size={26} /> },
    { label: "Ver CxC / CxP", href: "/finanzas#cuentas", permiso: "/finanzas", icono: <HandCoins size={26} /> },
    { label: "Pagar Planilla", href: "/dashboard/compras?tab=planilla", icono: <Users size={26} /> },
    { label: "Pagar Proveedor", href: "/dashboard/compras?tab=facturas", icono: <Banknote size={26} /> },
    { label: "Liquidar Flete", href: "/finanzas#fletes", permiso: "/finanzas", icono: <Truck size={26} /> },
    { label: "Subir Voucher", href: "/dashboard/compras?tab=ordenes", icono: <Upload size={26} /> },
  ],
  produccion: [
    { label: "Iniciar OT", href: "/dashboard/produccion", icono: <Play size={26} /> },
    { label: "Reportar Avance", href: "/dashboard/produccion", icono: <ClipboardList size={26} /> },
    { label: "Control Calidad", href: "/dashboard/produccion", icono: <BadgeCheck size={26} /> },
    { label: "Consumo MP", href: "/dashboard/almacen?tab=stock", icono: <PackageMinus size={26} /> },
    { label: "Entregar a Almacén Intermedio", href: "/dashboard/almacen?tab=stock", icono: <ArrowDownToLine size={26} /> },
    { label: "Entregar PT a Almacén", href: "/dashboard/produccion", icono: <Container size={26} /> },
    { label: "Solicitar MP a Almacén", href: "/dashboard/almacen?tab=nuevo", icono: <FilePlus2 size={26} /> },
  ],
};

/** Funciones globales de SOPORTE (además de la navegación entre los 4 módulos). */
const GLOBALES: Accion[] = [
  { label: "Mundo Ventas", href: RUTA_MUNDO_VENTAS, permiso: "/dashboard/ventas", destacado: true, icono: <Store size={30} /> },
  { label: "Crear OC", href: "/dashboard/compras?tab=ordenes", icono: <ShoppingCart size={26} /> },
  { label: "Pagar Proveedor", href: "/dashboard/compras?tab=facturas", icono: <Banknote size={26} /> },
  { label: "Emitir Factura F001", href: "/dashboard/ventas?tab=comprobantes", icono: <FileCheck2 size={26} /> },
  { label: "Emitir Guía Remisión", href: "/dashboard/almacen?tab=despacho", icono: <FileText size={26} /> },
  { label: "Recepción MP", href: "/dashboard/almacen?tab=ingresos", icono: <ArrowDownToLine size={26} /> },
  { label: "Iniciar OT", href: "/dashboard/produccion", icono: <Play size={26} /> },
  { label: "Pagar Planilla", href: "/dashboard/compras?tab=planilla", icono: <Users size={26} /> },
  { label: "Libros Contables", href: "/dashboard/contable", icono: <BookOpen size={26} /> },
];

function GrillaAcciones({ acciones }: { acciones: Accion[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {acciones.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => abrirPestana(a.href)}
          title="Se abre en una pestaña nueva"
          className={
            a.destacado
              ? "group col-span-2 flex min-h-[110px] items-center justify-center gap-3 rounded-xl bg-[#f97316] px-4 py-4 text-center text-white transition hover:bg-[#ea580c]"
              : "group flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border border-[#2a3445] bg-[#1a212e] px-3 py-4 text-center transition hover:border-[#f97316]"
          }
        >
          <span className={a.destacado ? "text-white" : "text-[#f97316] transition group-hover:scale-105"}>{a.icono}</span>
          <span className={a.destacado ? "text-xl font-bold" : "text-[15px] font-bold text-white"}>{a.destacado ? `${a.label} · Ir a Ventas` : a.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Accesos rápidos según el perfil. La barra de los 4 módulos solo la ven ADMIN / SOPORTE / FINANZAS
 * (canViewOtherModules); los moduladores ven únicamente las funciones de su módulo.
 * SOPORTE además tiene las funciones globales. Cada acción abre el módulo de siempre en otra pestaña.
 */
export function AccesosRapidos({ sesion, actual }: { sesion: Sesion | null; actual: ModuloPlanta }) {
  const perfil = perfilPlanta(sesion);
  const permisos = permisosPlanta(sesion);
  const activo = perfil !== "soporte" && perfil !== null;
  const guias = useStore<Guia[]>(KEYS.GUIAS, [], activo);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, [], perfil === "produccion");
  if (!sesion || perfil === null) return null;
  const visible = (a: Accion) => (!a.requiere || permisos[a.requiere]) && puedeVer(sesion, a.permiso ?? a.href.split(/[?#]/)[0]);
  const barraModulos = permisos.canViewOtherModules && <AccesosModulos sesion={sesion} actual={actual} />;

  if (perfil === "soporte")
    return (
      <div className="space-y-4">
        {barraModulos}
        <div>
          <h3 className="mb-2 text-[13px] font-bold uppercase text-[#fb923c]">Funciones globales</h3>
          <GrillaAcciones acciones={GLOBALES.filter(visible)} />
        </div>
      </div>
    );

  // Textos con el documento real: "Confirmar Guía T001-554", "Reportar Avance OP-2026-0003"
  const guia = guias.find((g) => g.estado === "PENDIENTE_VB");
  const op = ops.find((o) => o.estado === "EN_FABRICACION");
  const acciones = ACCIONES[perfil]
    .map((a) => (a.label === "Confirmar Guía" && guia ? { ...a, label: `Confirmar Guía ${guia.numero}` } : a.label === "Reportar Avance" && op ? { ...a, label: `Reportar Avance ${op.id}` } : a))
    .filter(visible);

  return (
    <div className="space-y-4">
      {barraModulos}
      <section>
        <h2 className={barraModulos ? "mb-2 text-[13px] font-bold uppercase text-[#fb923c]" : "mb-3 text-xl font-bold uppercase text-[#fb923c]"}>
          {barraModulos ? "Funciones del módulo" : "Accesos rápidos"}
        </h2>
        <GrillaAcciones acciones={acciones} />
      </section>
    </div>
  );
}

export default AccesosRapidos;
