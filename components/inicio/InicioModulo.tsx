"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Video } from "lucide-react";
import { useSesion } from "@/lib/auth";
import { recargarExpedientes, useExpedientes } from "@/lib/expedientes";
import { SALA_MODULO, TITULO_INICIO, accionesPermitidas, type ModuloInicio } from "@/lib/inicioModulos";
import { irA } from "@/lib/navegacion";
import { urlSala } from "@/lib/presencia";
import { recargarDatos, type StoreKey, KEYS } from "@/lib/storage";
import { AccesosModulos, type ModuloPlanta } from "@/components/logistica/planta";
import { permisosPlanta } from "@/lib/permisosPlanta";
import { estiloSeccion } from "@/lib/seccionColor";
import { HOOK_KPIS, type KpiInicio } from "./kpis";
import { NotificacionesEnVivo } from "./NotificacionesEnVivo";
import { PanelResumen } from "./PanelResumen";

// INICIO de cada módulo (ERP v3.0; rediseño de Williams 2026-11-16): encabezado INICIO [MÓDULO] + código 26W y
// videollamada; fila de 4 KPIs reales; a la izquierda (3/12) los avisos del módulo, fijos al hacer scroll; a la derecha
// (9/12) tareas pendientes y gráficos de barras del módulo (PanelResumen). Los accesos rápidos van en la barra azul
// de la derecha (BarraAccesos). Sin mapa de fondo.
// Todo abre en la misma ventana.

/** Abre una pantalla del ERP en la misma ventana (Atrás vuelve al INICIO). Nombre antiguo: antes abría pestaña nueva. */
export const abrirEnPestana = (href: string) => irA(href);

/** Código 26W elegido en el INICIO (por módulo): la barra de accesos rápidos lo usa al abrir una acción. */
export const CLAVE_DOC = "erp-inicio-doc";

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
          <p className="text-[13px] text-[#9CA3AF]">Resumen del módulo: tareas pendientes y gráficos. Los accesos rápidos están en la barra azul de la derecha.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => window.open(urlSala(`Planta ${SALA_MODULO[modulo]}`), "_blank", "noopener")}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold btn-glass text-[#E5E7EB] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f2fe]/60"
        >
          <Video size={16} /> Videollamada {SALA_MODULO[modulo]}
        </button>
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
        </div>
      </header>

      {/* KPIs del módulo en una fila (Williams 2026-11-16: la columna izquierda queda solo para los avisos) */}
      <FilaKpis key={modulo} modulo={modulo} />

      {/* Izquierda (3/12): avisos del módulo en una columna FIJA al hacer scroll (sticky bajo la barra superior, la lista
          con scroll propio); derecha (9/12) gráficos y tareas pendientes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3 lg:sticky lg:top-20 lg:self-start">
          <NotificacionesEnVivo sesion={sesion} modulo={modulo} />
        </div>

        {/* Parte principal (Williams 2026-11-16): los accesos rápidos están en la barra azul de la derecha; aquí van los
            gráficos de barras y las tareas pendientes del módulo */}
        <div className="lg:col-span-9">
          <PanelResumen key={modulo} modulo={modulo} />
        </div>
      </div>
    </div>
  );
}


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
