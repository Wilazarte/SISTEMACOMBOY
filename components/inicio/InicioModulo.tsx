"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Boxes, ClipboardList, FilePlus, FileSearch, FolderOpen, Landmark, LayoutGrid, PackageCheck, Truck, Video, type LucideIcon } from "lucide-react";
import { useSesion } from "@/lib/auth";
import { recargarExpedientes, useExpedientes } from "@/lib/expedientes";
import { GRUPO_EXPEDIENTE, SALA_MODULO, TITULO_INICIO, accionesPermitidas, fasePrincipal, fasesFlujo, urlBoton, type AccionInicio, type ModuloInicio } from "@/lib/inicioModulos";
import { irA } from "@/lib/navegacion";
import { urlSala } from "@/lib/presencia";
import { recargarDatos, type StoreKey, KEYS } from "@/lib/storage";
import { AccesosModulos, type ModuloPlanta } from "@/components/logistica/planta";
import { permisosPlanta } from "@/lib/permisosPlanta";
import { estiloSeccion } from "@/lib/seccionColor";
import { HOOK_KPIS, type KpiInicio } from "./kpis";
import { NotificacionesEnVivo } from "./NotificacionesEnVivo";

// INICIO de cada módulo (ERP v3.0, rediseño de Williams 2026-10-30): encabezado INICIO [MÓDULO] + código 26W; a la
// izquierda (3/12) 4 KPIs reales, notificaciones en vivo y el chat del grupo; a la derecha (9/12) las acciones: el flujo
// 26W en orden (Fase 1 → 8, la fase propia en azul eléctrico, tema GLASS) y debajo los demás grupos en columnas. Sin mapa de fondo.
// Todo abre en la misma ventana.

/** Abre una pantalla del ERP en la misma ventana (Atrás vuelve al INICIO). Nombre antiguo: antes abría pestaña nueva. */
export const abrirEnPestana = (href: string) => irA(href);

const CLAVE_DOC = "erp-inicio-doc";

/** Datos que se vuelven a pedir a Supabase cuando una pestaña guarda y avisa (postMessage reload). */
const RECARGAR: StoreKey[] = [KEYS.ORDENES, KEYS.FACTURAS, KEYS.COTIZACIONES, KEYS.STOCK, KEYS.PRODUCCION, KEYS.DESPACHOS, KEYS.NOTAS_PEDIDO, KEYS.COMPROBANTES];

export function InicioModulo({ modulo }: { modulo: ModuloInicio }) {
  const { sesion } = useSesion();
  const acciones = useMemo(() => accionesPermitidas(sesion, modulo), [sesion, modulo]);
  // VENTAS no trabaja expedientes 26W: solo se descargan si el módulo tiene botones del flujo
  const exp = useExpedientes((modulo !== "soporte" && modulo !== "ventas") || acciones.some((a) => a.destino.startsWith("/erp")));
  const abiertos = exp.expedientes.filter((x) => x.estado === "ABIERTO").sort((a, b) => b.codigo_expediente.localeCompare(a.codigo_expediente));
  const [doc, setDoc] = useState("");

  // Código 26W elegido: se recuerda por navegador
  useEffect(() => {
    try {
      setDoc(window.localStorage.getItem(`${CLAVE_DOC}:${modulo}`) ?? "");
    } catch {
      /* almacenamiento bloqueado */
    }
  }, [modulo]);
  const elegirDoc = (v: string) => {
    setDoc(v);
    try {
      window.localStorage.setItem(`${CLAVE_DOC}:${modulo}`, v);
    } catch {
      /* almacenamiento bloqueado */
    }
  };
  const docValido = abiertos.some((x) => x.codigo_expediente === doc) ? doc : "";

  // Una pestaña guardó (Guardar y Cerrar): se recargan los datos del INICIO
  useEffect(() => {
    const oir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string } | null)?.type !== "reload") return;
      void recargarDatos(...RECARGAR);
      void recargarExpedientes();
    };
    window.addEventListener("message", oir);
    return () => window.removeEventListener("message", oir);
  }, []);

  // Flujo 26W en orden (Fase 1 → 8) y, debajo, los demás grupos en columnas (Compras nacionales, Ventas, Transporte…)
  const fases = useMemo(() => (acciones.some((a) => a.grupo === GRUPO_EXPEDIENTE) ? fasesFlujo(modulo) : []), [acciones, modulo]);
  const extrasFlujo = acciones.filter((a) => a.grupo === GRUPO_EXPEDIENTE && !a.fase);
  const principal = fasePrincipal(modulo);
  const grupos = useMemo(() => {
    const m = new Map<string, AccionInicio[]>();
    acciones.filter((a) => a.grupo !== GRUPO_EXPEDIENTE).forEach((a) => m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]));
    return [...m.entries()];
  }, [acciones]);
  const abrir = (a: AccionInicio) => abrirEnPestana(urlBoton(modulo, a, docValido || undefined));

  return (
    <div className="w-full space-y-4 text-white">
      {/* Acceso rápido a los 4 módulos (solo SOPORTE): fila discreta arriba, no compite con las acciones del módulo */}
      {permisosPlanta(sesion).canViewOtherModules && <AccesosModulos sesion={sesion} actual={modulo === "soporte" ? undefined : (modulo as ModuloPlanta)} />}

      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] glass-card glass-blur px-5 py-4">
        <div>
          <h1 className="text-3xl font-bold uppercase leading-tight lg:text-4xl">
            INICIO {TITULO_INICIO[modulo]}
            {docValido && <span className="texto-azul ml-3 align-middle text-2xl lg:text-3xl">{docValido}</span>}
          </h1>
          <p className="text-[13px] text-[#9CA3AF]">Cada botón abre su pantalla aquí mismo; con Atrás vuelve al INICIO.</p>
        </div>
        {!exp.faltaTabla && abiertos.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] font-semibold text-[#D1D5DB]">
            <FolderOpen size={16} className="text-[#00f2fe]" /> Expediente
            <select value={docValido} onChange={(e) => elegirDoc(e.target.value)} className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[14px] text-white">
              <option value="">Sin expediente</option>
              {abiertos.map((x) => (
                <option key={x.id} value={x.codigo_expediente}>
                  {x.codigo_expediente}
                  {x.lote ? ` · ${x.lote}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {/* KPIs del módulo en una fila (Williams 2026-11-16: la columna izquierda queda solo para los avisos) */}
      <FilaKpis key={modulo} modulo={modulo} />

      {/* Izquierda (3/12): avisos del módulo en una columna FIJA al hacer scroll (sticky bajo la barra superior, la lista
          con scroll propio); derecha (9/12) acciones por flujo */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3 lg:sticky lg:top-20 lg:self-start">
          <NotificacionesEnVivo sesion={sesion} modulo={modulo} />
        </div>

        <section className="space-y-5 rounded-xl border border-white/[0.08] glass-card glass-blur p-5 lg:col-span-9">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <LayoutGrid size={16} /> Acciones rápidas
          </h2>
          {acciones.length === 0 && <p className="text-[13px] text-[#9CA3AF]">Su usuario no tiene funciones habilitadas en este módulo.</p>}

          {fases.length > 0 && (
            <div className="seccion rounded-xl border bg-white/[0.02] p-4" style={estiloSeccion(0)}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="seccion-titulo text-[13px] font-bold uppercase tracking-wide">{GRUPO_EXPEDIENTE}</p>
                {extrasFlujo.map((a) => (
                  <button key={a.slug} type="button" onClick={() => abrir(a)} className="rounded-lg px-3 py-1 text-[12px] font-semibold btn-glass text-[#E5E7EB] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f2fe]/60">
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {fases.map((a) => {
                  const Icono = ICONO_FASE[a.fase ?? 1];
                  const esPrincipal = a.fase === principal;
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      onClick={() => abrir(a)}
                      className={`flex min-h-[64px] items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug transition ${
                        esPrincipal ? "grad-azul font-semibold hover-cian" : "btn-glass text-[#E5E7EB] hover:text-white"
                      }`}
                    >
                      <Icono size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                      <span>{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {grupos.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map(([grupo, lista], i) => (
                // Cada grupo con su color de marca (rojo, cian, naranja…) para distinguirlo de un vistazo
                <div key={grupo} className="seccion rounded-xl border bg-white/[0.02] p-4" style={estiloSeccion(i + 1)}>
                  <p className="seccion-titulo mb-3 text-[13px] font-bold uppercase tracking-wide">{grupo}</p>
                  <div className="grid grid-cols-1 gap-2">
                    {lista.map((a) => (
                      <button
                        key={a.slug}
                        type="button"
                        onClick={() => abrir(a)}
                        className="flex min-h-[40px] w-full items-center justify-center rounded-lg px-3 py-2 text-center text-[13px] font-semibold leading-snug btn-glass text-[#E5E7EB] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f2fe]/60"
                      >
                        <span>{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={() => window.open(urlSala(`Planta ${SALA_MODULO[modulo]}`), "_blank", "noopener")}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold btn-glass text-[#E5E7EB] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f2fe]/60"
            >
              <Video size={16} /> Iniciar videollamada {SALA_MODULO[modulo]}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Íconos de línea de las 8 fases del flujo 26W. */
const ICONO_FASE: Record<number, LucideIcon> = { 1: FilePlus, 2: ClipboardList, 3: Boxes, 4: FileSearch, 5: Landmark, 6: Truck, 7: PackageCheck, 8: BadgeCheck };

function FilaKpis({ modulo }: { modulo: ModuloInicio }) {
  const useKpis = HOOK_KPIS[modulo];
  const kpis = useKpis(true);
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {kpis.map((k, i) => (
        <TarjetaKpi key={k.titulo} k={k} i={i} />
      ))}
    </div>
  );
}

function TarjetaKpi({ k, i }: { k: KpiInicio; i: number }) {
  return (
    <button type="button" onClick={() => abrirEnPestana(k.href)} className="seccion min-w-0 rounded-xl border glass-card glass-blur px-3 py-3 text-left hover-cian" style={estiloSeccion(i)}>
      <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">{k.titulo}</span>
      <span className="mt-0.5 block truncate text-xl font-bold text-white">{k.valor}</span>
      <span className={`mt-0.5 block truncate text-[11px] ${k.alerta ? "text-[#ff6a5f]" : "text-[#4ade80]"}`}>{k.detalle}</span>
    </button>
  );
}

export default InicioModulo;
