"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, X } from "lucide-react";

/**
 * Pestañas tipo navegador de todo el ERP (pedido de Williams 2026-11-21). Cada función que se abre (Transferencias,
 * Registrar gasto, Stock…) queda como una pestaña a pantalla completa con su nombre y una X. Se pueden tener varias
 * abiertas y cambiar entre ellas; la X cierra solo esa y vuelve a la pestaña anterior o al INICIO. Solo pide
 * confirmación si en esa pestaña hay cambios sin guardar. Las pestañas se recuerdan en esta ventana (sessionStorage).
 * Solo navegación: cada pestaña es la misma ruta de siempre, no cambia datos ni permisos.
 */

export interface PestanaERP {
  /** Pantalla: ruta + ?tab / ?sub / ?accion / ?doc (sin los filtros que la página escriba en la URL). */
  id: string;
  /** Última URL completa de la pestaña (al volver a ella se abre igual). */
  href: string;
  label: string;
}

const CLAVE = "erp-pestanas-abiertas";
const EV_CAMBIO = "erp:pestanas-abiertas";
const EV_TOAST = "erp:toast";
const MAX_PESTANAS = 12;
const CLAVES_ID = ["tab", "sub", "accion", "doc", "fase", "vista"];

export function idPestana(path: string, search: string): string {
  const q = new URLSearchParams(search);
  const partes = CLAVES_ID.filter((k) => q.get(k)).map((k) => `${k}=${q.get(k)}`);
  return partes.length ? `${path}?${partes.join("&")}` : path;
}

function leer(): PestanaERP[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) ?? "[]") as PestanaERP[];
    return Array.isArray(v) ? v.filter((p) => p && typeof p.id === "string" && typeof p.href === "string") : [];
  } catch {
    return [];
  }
}

function guardar(lista: PestanaERP[]): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: las pestañas viven solo mientras no se recargue */
  }
  memoria = lista;
  window.dispatchEvent(new Event(EV_CAMBIO));
}

let memoria: PestanaERP[] | null = null;
const lista = (): PestanaERP[] => (memoria ??= leer());

/** Al cerrar sesión: no se heredan las pestañas del usuario anterior. */
export function olvidarPestanas(): void {
  memoria = [];
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada */
  }
}

// ---------------------------------------------------------------- Cambios sin guardar
/**
 * Un campo editado cuenta como "cambio sin guardar" solo si es de un formulario real (dentro de un <form>, de una
 * ventana de registro o de una pantalla con botón de guardar). Buscadores y filtros de las listas no cuentan.
 */
export function esEdicionReal(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement) || el.closest("[data-sin-guardar], header, [data-filtros]")) return false;
  if (!el.matches("input, textarea, select, [contenteditable='true']")) return false;
  const inp = el as HTMLInputElement;
  if (inp.type === "search" || /buscar|filtr/i.test(inp.placeholder ?? "") || /buscar|filtr/i.test(inp.getAttribute("aria-label") ?? "")) return false;
  return !!el.closest("form, [role='dialog']") || !!document.querySelector("[data-guardar-pestana]");
}

let sucio = false;
export const hayCambiosSinGuardar = (): boolean => sucio;
export const olvidarCambios = (): void => {
  sucio = false;
};

const confirmarSalida = (): boolean => !sucio || window.confirm("Hay cambios sin guardar en esta pestaña. ¿Cerrarla sin guardar?");

// ---------------------------------------------------------------- Cerrar
type Router = ReturnType<typeof useRouter>;

/**
 * Cierra una pestaña. Si es la que está a la vista, va a la pestaña anterior (la de su izquierda) o al INICIO.
 * `sinPreguntar`: Cancelar / Guardar y Cerrar ya decidieron, no se vuelve a preguntar.
 */
export function cerrarPestana(router: Router, id: string, inicio: string, opciones: { activa: string | null; sinPreguntar?: boolean }): void {
  const actual = lista();
  const i = actual.findIndex((p) => p.id === id);
  const esActiva = id === opciones.activa;
  if (esActiva && !opciones.sinPreguntar && !confirmarSalida()) return;
  const nueva = actual.filter((p) => p.id !== id);
  guardar(nueva);
  if (!esActiva) return;
  sucio = false;
  const anterior = i > 0 ? nueva[i - 1] : null;
  router.push(anterior ? anterior.href : inicio);
}

/** Cierra la pestaña que está a la vista (Cancelar / Guardar y Cerrar del pie, X de la ruta). */
export function cerrarPestanaActiva(router: Router, inicio: string, sinPreguntar = false): void {
  const id = idPestana(window.location.pathname, window.location.search);
  if (lista().some((p) => p.id === id)) cerrarPestana(router, id, inicio, { activa: id, sinPreguntar });
  else {
    if (!sinPreguntar && !confirmarSalida()) return;
    sucio = false;
    router.push(inicio);
  }
}

// ---------------------------------------------------------------- Barra
export function BarraPestanasERP({
  label,
  registrar,
  esInicio,
  inicio,
}: {
  /** Nombre de la pantalla actual (el mismo de la ruta INICIO > MÓDULO > pantalla). */
  label: string;
  /** La pantalla actual va como pestaña (no los INICIO ni las rutas que solo redirigen). */
  registrar: boolean;
  esInicio: boolean;
  /** INICIO del módulo actual. */
  inicio: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const qs = useSearchParams().toString();
  const [pestanas, setPestanas] = useState<PestanaERP[]>([]);
  const activa = registrar ? idPestana(path, qs) : null;
  const caja = useRef<HTMLDivElement>(null);

  // Lista compartida (sessionStorage) y aviso cuando cambia
  useEffect(() => {
    const leerLista = () => setPestanas([...lista()]);
    leerLista();
    window.addEventListener(EV_CAMBIO, leerLista);
    return () => window.removeEventListener(EV_CAMBIO, leerLista);
  }, []);

  // La pantalla abierta entra como pestaña (o actualiza su nombre / URL si ya estaba)
  useEffect(() => {
    if (!activa) return;
    const href = qs ? `${path}?${qs}` : path;
    const actual = lista();
    const i = actual.findIndex((p) => p.id === activa);
    if (i >= 0) {
      if (actual[i].href === href && actual[i].label === label) return;
      const copia = [...actual];
      copia[i] = { id: activa, href, label };
      guardar(copia);
    } else guardar([...actual, { id: activa, href, label }].slice(-MAX_PESTANAS));
  }, [activa, path, qs, label]);

  // Cambios sin guardar de la pestaña a la vista: un campo de formulario editado, hasta que el ERP confirma el guardado
  useEffect(() => {
    sucio = false;
    const alEditar = (e: Event) => {
      if (esEdicionReal(e.target as Element | null)) sucio = true;
    };
    const alAvisar = (e: Event) => {
      if ((e as CustomEvent<{ tipo?: string }>).detail?.tipo !== "error") sucio = false;
    };
    document.addEventListener("input", alEditar, true);
    document.addEventListener("change", alEditar, true);
    window.addEventListener(EV_TOAST, alAvisar);
    return () => {
      document.removeEventListener("input", alEditar, true);
      document.removeEventListener("change", alEditar, true);
      window.removeEventListener(EV_TOAST, alAvisar);
    };
  }, [path]);

  // La pestaña activa siempre a la vista en la barra (celular: la barra se desliza de lado)
  useEffect(() => {
    const barra = caja.current;
    const sel = barra?.querySelector<HTMLElement>("[aria-selected='true']")?.closest<HTMLElement>(".pestana-erp");
    if (!barra || !sel) return;
    const izq = sel.offsetLeft - barra.offsetLeft;
    if (izq < barra.scrollLeft) barra.scrollLeft = izq - 8;
    else if (izq + sel.offsetWidth > barra.scrollLeft + barra.clientWidth) barra.scrollLeft = izq + sel.offsetWidth - barra.clientWidth + 8;
  }, [activa, pestanas.length]);

  const ir = (href: string, id: string | null) => {
    if (id === activa) return;
    if (!confirmarSalida()) return;
    sucio = false;
    router.push(href);
  };

  if (!pestanas.length && esInicio) return null;

  return (
    <div ref={caja} role="tablist" aria-label="Pestañas abiertas" className="pestanas-erp flex items-end gap-1 overflow-x-auto px-2 pt-2 sm:px-4" data-sin-guardar>
      <button
        type="button"
        role="tab"
        aria-selected={esInicio}
        onClick={() => ir(inicio, esInicio ? null : "__inicio")}
        className={`pestana-erp flex h-9 shrink-0 items-center gap-1.5 rounded-t-lg px-3 text-[13px] font-semibold ${esInicio ? "pestana-activa" : ""}`}
        title="INICIO del módulo"
      >
        <Home size={15} /> <span className="hidden sm:inline">INICIO</span>
      </button>
      {pestanas.map((p) => {
        const sel = p.id === activa;
        return (
          <div key={p.id} className={`pestana-erp group flex h-9 min-w-0 max-w-[200px] shrink-0 sm:max-w-[260px] items-center rounded-t-lg ${sel ? "pestana-activa" : ""}`} title={p.label}>
            <button type="button" role="tab" aria-selected={sel} onClick={() => ir(p.href, p.id)} className="min-w-0 flex-1 truncate py-2 pl-3 pr-1 text-left text-[13px] font-semibold">
              {p.label}
            </button>
            <button
              type="button"
              onClick={() => cerrarPestana(router, p.id, inicio, { activa })}
              className="pestana-cerrar mr-1 shrink-0 rounded-md p-1"
              aria-label={`Cerrar ${p.label}`}
              title="Cerrar pestaña"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
