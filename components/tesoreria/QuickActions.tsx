"use client";

import { ArrowRight, FileText, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useIr } from "@/components/shell/ir";
import { RUTA_REQUERIMIENTO } from "@/components/modulos-login";
import { cn } from "@/components/ui";

/**
 * Ids del DOM que usan las acciones rápidas: la lista (con su buscador) y el formulario de cada pestaña.
 * Cada pestaña los pone en su Card (<Card id={QA_IDS.listaOrdenes}>).
 */
export const QA_IDS = {
  listaRequerimientos: "lista-requerimientos",
  listaCotizaciones: "lista-cotizaciones",
  formCotizacion: "form-cotizacion",
  listaOrdenes: "lista-ordenes",
  formOrden: "form-orden",
  listaFacturas: "lista-facturas",
  formFactura: "form-factura",
  listaTrabajadores: "lista-trabajadores",
  listaContratistas: "lista-contratistas",
  listaConcesiones: "lista-concesiones",
} as const;

/** Lleva a la lista, abre su panel de filtros si está cerrado y pone el cursor en el buscador. */
export function irABuscador(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const toggle = el.querySelector<HTMLButtonElement>("[data-toggle-filtros]");
  if (toggle?.getAttribute("aria-expanded") === "false") {
    toggle.click();
    return requestAnimationFrame(() => requestAnimationFrame(() => enfocarBuscador(el)));
  }
  enfocarBuscador(el);
}

function enfocarBuscador(el: HTMLElement) {
  const input =
    el.querySelector<HTMLInputElement>('input[aria-label="Buscar"]') ??
    el.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([type="date"]):not([type="hidden"])') ??
    el.querySelector<HTMLSelectElement>("select");
  input?.focus({ preventScroll: true });
}

/** Sube al formulario de la pestaña y enfoca su primer campo. */
export function irAFormulario(id: string) {
  const el = document.getElementById(id);
  if (!el) return window.scrollTo({ top: 0, behavior: "smooth" });
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.querySelector<HTMLElement>("select, input:not([type='hidden']), textarea")?.focus({ preventScroll: true });
}

interface Accion {
  icono: ReactNode;
  label: string;
  /** Sin función la acción no aplica (sin permiso o sin dato) y no se muestra… */
  run?: () => void;
  /** …salvo que deba verse deshabilitada con este aviso (p. ej. falta elegir la cotización). */
  aviso?: string;
}

/**
 * Acciones rápidas por pestaña de Tesorería / Compras y Planilla: 2-3 botones chicos arriba del formulario o la lista.
 * Buscar y Nuevo funcionan solos con los ids de QA_IDS; navegar, registrar en modal y PDF llegan por props.
 */
export default function QuickActions({
  tab,
  onIr,
  onBuscar,
  onNuevo,
  onVerCoti,
  onPdf,
  puedeCrear = true,
  className,
}: {
  tab: string;
  /** setTab de la página (o de Planilla) para saltar a otra pestaña. */
  onIr?: (tab: string) => void;
  /** Antes de ir al buscador (p. ej. ocultar el formulario y mostrar la lista). */
  onBuscar?: () => void;
  /** Al pulsar Nuevo: muestra el formulario (luego se enfoca) o abre el modal de registro. */
  onNuevo?: () => void;
  /** Órdenes: solo con cotización seleccionada. */
  onVerCoti?: () => void;
  /** Contratistas / concesiones: descarga de recibos (generateReciboPDF). */
  onPdf?: () => void;
  /** Sin permiso de registro no se muestra el botón Nuevo / Registrar. */
  puedeCrear?: boolean;
  className?: string;
}) {
  const ir = useIr();
  // Tras mostrar la lista o el formulario se espera al render para hacer scroll y foco
  const luego = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const buscar = (label: string, id: string): Accion => ({
    icono: <Search size={14} />,
    label,
    run: () => {
      onBuscar?.();
      luego(() => irABuscador(id));
    },
  });
  const nuevo = (label: string, form?: string): Accion => ({
    icono: <Plus size={14} />,
    label,
    run: !puedeCrear
      ? undefined
      : form
        ? () => {
            onNuevo?.();
            luego(() => irAFormulario(form));
          }
        : onNuevo,
  });
  const salto = (label: string, destino: string, icono: ReactNode = <ArrowRight size={14} />): Accion => ({ icono, label, run: onIr && (() => onIr(destino)) });
  const pdf: Accion = { icono: <FileText size={14} />, label: "PDF", run: onPdf };

  const acciones: Record<string, Accion[]> = {
    requerimiento: [
      buscar("Buscar REQ", QA_IDS.listaRequerimientos),
      // Los REQ se crean en Almacén: abre su formulario nuevo (ruta existente)
      { icono: <Plus size={14} />, label: "Nuevo REQ", run: !puedeCrear ? undefined : onNuevo ?? (() => ir(RUTA_REQUERIMIENTO)) },
      salto("Ver Cotizaciones", "cotizaciones"),
    ],
    cotizacion: [buscar("Buscar COT", QA_IDS.listaCotizaciones), nuevo("Nueva COT", QA_IDS.formCotizacion), salto("Emitir OC", "ordenes")],
    ordenes: [
      buscar("Buscar OC", QA_IDS.listaOrdenes),
      nuevo("Emitir OC", QA_IDS.formOrden),
      { icono: <FileText size={14} />, label: "Ver COT origen", run: onVerCoti, aviso: "Seleccione una cotización en el formulario" },
    ],
    bancarizacion: [buscar("Buscar", QA_IDS.listaOrdenes), salto("Ver OC", "ordenes")],
    factura: [buscar("Buscar Factura", QA_IDS.listaFacturas), nuevo("Nueva Factura", QA_IDS.formFactura), salto("Ver OC", "ordenes")],
    "planilla-trabajadores": [buscar("Buscar Trabajador", QA_IDS.listaTrabajadores), nuevo("Registrar"), salto("Generar Planilla", "planilla")],
    "planilla-contratistas": [buscar("Buscar Contratista", QA_IDS.listaContratistas), nuevo("Registrar Contratista"), pdf],
    "planilla-concesiones": [buscar("Buscar Concesión", QA_IDS.listaConcesiones), nuevo("Registrar"), pdf],
  };

  const visibles = (acciones[tab] ?? []).filter((a) => a.run || a.aviso);
  if (!visibles.length) return null;

  return (
    <div className={cn("mb-3 flex flex-wrap gap-2", className)} role="toolbar" aria-label="Acciones rápidas">
      {visibles.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.run}
          disabled={!a.run}
          title={a.run ? undefined : a.aviso}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 text-xs font-medium text-white transition hover:border-slate-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-600 disabled:hover:bg-slate-800"
        >
          {a.icono} {a.label}
        </button>
      ))}
    </div>
  );
}
