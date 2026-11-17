"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  Contact,
  Factory,
  FolderKanban,
  Home,
  Landmark,
  LayoutGrid,
  LogOut,
  PackageCheck,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { GRUPO_EXPEDIENTE, RUTA_INICIO, TITULO_INICIO, accionesPermitidas, urlBoton, type AccionInicio, type ModuloInicio } from "@/lib/inicioModulos";
import { puedeVer, type Sesion } from "@/lib/auth";
import { enSucursal } from "@/lib/storage";
import { irA } from "@/lib/navegacion";
import { useNotifFlujo } from "@/lib/notificacionesFlujo";
import { iconoAccion } from "@/lib/iconosFunciones";

// Barra de accesos rápidos (pedido de Williams 2026-11-16, estilo de su imagen de referencia): píldora vertical azul
// marino fija a la DERECHA (la izquierda es del chat rojo), íconos de línea blancos, el activo en un círculo claro con
// muesca, tooltip al pasar y burbuja roja de avisos. Un ícono por grupo del INICIO; al tocarlo se abre su panel con los
// botones del grupo. RBAC: solo las acciones del propio módulo (accionesPermitidas), igual que el INICIO.

/** Íconos de línea de cada grupo del INICIO (lib/inicioModulos.ts). */
const ICONO_GRUPO: Record<string, LucideIcon> = {
  [GRUPO_EXPEDIENTE]: FolderKanban,
  "Compras nacionales": ShoppingCart,
  Transporte: Truck,
  Seguimiento: Activity,
  Requerimientos: ClipboardList,
  "Ingresos y stock": Boxes,
  Despacho: PackageCheck,
  Tesorería: Landmark,
  Planilla: Users,
  Contabilidad: BookOpen,
  Pedidos: ClipboardList,
  "Facturación y cobranza": Receipt,
  "Clientes y productos": Contact,
  Producción: Factory,
  Módulos: LayoutGrid,
  Soporte: Settings,
};

/** Nombre corto del grupo para el tooltip. */
const corto = (g: string) => (g === GRUPO_EXPEDIENTE ? "Expediente 26W" : g);

/** Una entrada de la barra: un grupo del INICIO (ERP) o, en Secocha, un módulo con sus grupos como subtítulos. */
interface Seccion {
  id: string;
  label: string;
  icono: LucideIcon;
  /** Módulo con el que se arma la URL de cada acción. */
  modulo: ModuloInicio;
  grupos: [string, AccionInicio[]][];
  /** Sin panel: abre esta pantalla directo (Dashboard). */
  href?: string;
}

const agrupar = (acciones: AccionInicio[]): [string, AccionInicio[]][] => {
  const m = new Map<string, AccionInicio[]>();
  acciones.forEach((a) => m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]));
  return [...m.entries()];
};

/**
 * Secocha (Williams 2026-11-17): la barra derecha es el menú. Un ícono por módulo (Ventas, Logística, Tesorería,
 * Planilla, Almacén, Producción, Dashboard); al tocarlo se abren sus funciones con los grupos como subtítulos.
 */
function seccionesSecocha(sesion: Sesion): Seccion[] {
  const de = (m: ModuloInicio) => agrupar(accionesPermitidas(sesion, m));
  const finanzas = de("finanzas");
  const lista: Seccion[] = [
    { id: "ventas", label: "Ventas", icono: Receipt, modulo: "ventas", grupos: de("ventas") },
    { id: "logistica", label: "Logística", icono: Truck, modulo: "logistica", grupos: de("logistica") },
    { id: "tesoreria", label: "Tesorería", icono: Landmark, modulo: "finanzas", grupos: finanzas.filter(([g]) => g !== "Planilla") },
    { id: "planilla", label: "Planilla", icono: Users, modulo: "finanzas", grupos: finanzas.filter(([g]) => g === "Planilla") },
    { id: "almacen", label: "Almacén", icono: Boxes, modulo: "almacen", grupos: de("almacen") },
  ];
  const secciones = lista.filter((x) => x.grupos.length > 0);
  if (puedeVer(sesion, "/gerencia")) secciones.push({ id: "dashboard", label: "Dashboard", icono: BarChart3, modulo: "soporte", grupos: [], href: "/gerencia" });
  return secciones;
}

export function BarraAccesos({
  sesion,
  modulo,
  esInicio,
  accionActiva,
  avisos: calculados,
  onBuscar,
  onSalir,
}: {
  sesion: Sesion;
  modulo: ModuloInicio;
  esInicio: boolean;
  /** Slug de la acción abierta (?accion=), para marcar su grupo. */
  accionActiva?: string | null;
  /** Avisos calculados sin ver (los de la campana); se suman los del flujo sin leer de este módulo. */
  avisos: number;
  onBuscar: () => void;
  onSalir: () => void;
}) {
  const flujo = useNotifFlujo(true);
  const avisos = calculados + flujo.items.filter((n) => !n.leida && (modulo === "soporte" || n.modulo === modulo.toUpperCase())).length;
  const secocha = enSucursal();
  const secciones = useMemo<Seccion[]>(
    () =>
      secocha
        ? seccionesSecocha(sesion)
        : agrupar(accionesPermitidas(sesion, modulo)).map(([g, acc]) => ({ id: g, label: corto(g), icono: ICONO_GRUPO[g] ?? LayoutGrid, modulo, grupos: [[g, acc]] })),
    [sesion, modulo, secocha]
  );
  // Sección marcada: la que tiene la acción abierta; en Secocha, si no hay acción, la del módulo actual
  const conAccion = accionActiva
    ? secciones.find((x) => x.modulo === modulo && x.grupos.some(([, acc]) => acc.some((a) => a.slug === accionActiva)))?.id
    : undefined;
  const seccionActiva = conAccion ?? (secocha ? secciones.find((x) => x.modulo === modulo)?.id : undefined);
  const [abierto, setAbierto] = useState<string | null>(null);
  // Celular: la barra se pliega en un botón redondo abajo a la derecha
  const [movilAbierta, setMovilAbierta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto && !movilAbierta) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setAbierto(null);
        setMovilAbierta(false);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setAbierto(null), setMovilAbierta(false));
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto, movilAbierta]);

  if (secciones.length === 0) return null;

  const ir = (href: string) => {
    setAbierto(null);
    setMovilAbierta(false);
    irA(href);
  };
  // Expediente 26W elegido en el INICIO del módulo: las fases se abren en ese expediente
  const docElegido = () => {
    try {
      return window.localStorage.getItem(`erp-inicio-doc:${modulo}`) || undefined;
    } catch {
      return undefined;
    }
  };
  const panel = abierto ? secciones.find((x) => x.id === abierto) : undefined;

  return (
    <div ref={raiz} className="print:hidden">
      {/* Celular: botón para desplegar la barra */}
      <button
        type="button"
        onClick={() => setMovilAbierta((v) => !v)}
        aria-label={movilAbierta ? "Cerrar accesos rápidos" : "Accesos rápidos"}
        className="barra-accesos fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl lg:hidden"
      >
        {movilAbierta ? <X size={22} /> : <Zap size={22} />}
        {avisos > 0 && !movilAbierta && <Burbuja n={avisos} />}
      </button>

      <nav
        aria-label={`Accesos rápidos ${TITULO_INICIO[modulo]}`}
        className={`barra-accesos fixed z-40 w-[76px] flex-col items-center rounded-full py-5 shadow-[0_20px_50px_-12px_rgba(17,33,45,0.7)] ${
          movilAbierta ? "bottom-[152px] right-[6px] flex max-h-[calc(100vh-220px)] overflow-y-auto" : "hidden"
        } lg:right-3 lg:top-[84px] lg:bottom-6 lg:flex lg:max-h-none lg:overflow-visible`}
      >
        <Icono icono={Home} label={`INICIO ${TITULO_INICIO[modulo]}`} activo={esInicio && !abierto} onClick={() => ir(RUTA_INICIO[modulo])} />
        <span className="my-3 h-px w-9 bg-white/20" />

        <div className="flex flex-col items-center gap-3 lg:flex-1 lg:justify-center">
          {secciones.map((x) => (
            <Icono
              key={x.id}
              icono={x.icono}
              label={x.label}
              activo={abierto ? abierto === x.id : seccionActiva === x.id}
              onClick={() => (x.href ? ir(x.href) : setAbierto((v) => (v === x.id ? null : x.id)))}
            />
          ))}
        </div>

        <span className="my-3 h-px w-9 bg-white/20" />
        <div className="flex flex-col items-center gap-3">
          <Icono icono={Search} label="Buscar (Ctrl K)" onClick={onBuscar} />
          <Icono icono={Bell} label={avisos > 0 ? `${avisos} aviso(s) sin leer` : "Avisos"} onClick={() => ir(RUTA_INICIO[modulo])} burbuja={avisos} />
          <Icono icono={LogOut} label="Cerrar sesión" onClick={onSalir} />
        </div>
      </nav>

      {/* Panel del grupo: a la izquierda de la barra, mismo azul */}
      {panel && (
        <div
          role="menu"
          className="barra-accesos fixed z-40 w-[min(340px,calc(100vw-110px))] rounded-2xl p-3 text-white shadow-[0_20px_50px_-12px_rgba(17,33,45,0.7)] max-lg:bottom-[152px] max-lg:right-[92px] lg:right-[100px] lg:top-1/2 lg:-translate-y-1/2"
        >
          <p className={`mb-2 px-2 font-bold uppercase tracking-wider ${secocha ? "text-[13px] text-white" : "text-[11px] text-white/60"}`}>{panel.label}</p>
          <div className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto">
            {panel.grupos.map(([g, acc]) => (
              <div key={g} className="flex flex-col gap-1">
                {/* Secocha: cada grupo del módulo como subtítulo */}
                {secocha && <p className="mt-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/55 first:mt-0">{corto(g)}</p>}
                {acc.map((a) => {
                  const activa = a.slug === accionActiva && panel.modulo === modulo;
                  const I = iconoAccion(a.slug, a.label);
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      role="menuitem"
                      onClick={() => ir(urlBoton(panel.modulo, a, panel.modulo === modulo ? docElegido() : undefined))}
                      className={`group/acc flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] leading-snug transition ${
                        activa ? "bg-[#CCD0CF] font-semibold text-[#11212D]" : "text-white/90 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {/* Un ícono por función (lib/iconosFunciones.ts) */}
                      <span
                        aria-hidden
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                          activa ? "bg-[#800021] text-white" : "bg-white/10 text-[#CCD0CF] group-hover/acc:bg-[#800021] group-hover/acc:text-white"
                        }`}
                      >
                        <I size={17} strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Icono({ icono: I, label, activo, onClick, burbuja = 0 }: { icono: LucideIcon; label: string; activo?: boolean; onClick: () => void; burbuja?: number }) {
  return (
    <div className="group relative flex items-center justify-center">
      {/* Muesca del activo (hacia el contenido) */}
      {activo && <span aria-hidden className="absolute -left-[12px] h-8 w-[5px] rounded-full bg-white/90" />}
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={activo ? "page" : undefined}
        className={`relative flex items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
          activo
            ? "h-14 w-14 bg-[#CCD0CF] text-[#11212D] shadow-[0_6px_18px_-4px_rgba(204,208,207,0.7)]"
            : "h-12 w-12 text-white/80 hover:bg-white/10 hover:text-white"
        }`}
      >
        <I size={24} strokeWidth={1.6} />
        {burbuja > 0 && <Burbuja n={burbuja} />}
      </button>
      {/* Tooltip (solo PC) */}
      <span className="pointer-events-none absolute right-[calc(100%+18px)] hidden whitespace-nowrap rounded-md bg-[#11212D] px-3 py-1.5 text-[13px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 lg:block">
        {label}
      </span>
    </div>
  );
}

function Burbuja({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-[#800021] px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-[#CCD0CF]">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export default BarraAccesos;
