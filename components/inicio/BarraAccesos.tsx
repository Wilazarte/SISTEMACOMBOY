"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
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
import type { Sesion } from "@/lib/auth";
import { GRUPO_EXPEDIENTE, RUTA_INICIO, TITULO_INICIO, accionesPermitidas, urlBoton, type AccionInicio, type ModuloInicio } from "@/lib/inicioModulos";
import { irA } from "@/lib/navegacion";
import { useNotifFlujo } from "@/lib/notificacionesFlujo";

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
  const acciones = useMemo(() => accionesPermitidas(sesion, modulo), [sesion, modulo]);
  const grupos = useMemo(() => {
    const m = new Map<string, AccionInicio[]>();
    acciones.forEach((a) => m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]));
    return [...m.entries()];
  }, [acciones]);
  const grupoActivo = accionActiva ? acciones.find((a) => a.slug === accionActiva)?.grupo : undefined;
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

  if (grupos.length === 0) return null;

  const ir = (href: string) => {
    setAbierto(null);
    setMovilAbierta(false);
    irA(href);
  };
  const lista = abierto ? grupos.find(([g]) => g === abierto)?.[1] ?? [] : [];

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
        className={`barra-accesos fixed z-40 w-[76px] flex-col items-center rounded-full py-5 shadow-[0_20px_50px_-12px_rgba(10,16,48,0.75)] ${
          movilAbierta ? "bottom-[152px] right-[6px] flex max-h-[calc(100vh-220px)] overflow-y-auto" : "hidden"
        } lg:right-3 lg:top-[84px] lg:bottom-6 lg:flex lg:max-h-none lg:overflow-visible`}
      >
        <Icono icono={Home} label={`INICIO ${TITULO_INICIO[modulo]}`} activo={esInicio && !abierto} onClick={() => ir(RUTA_INICIO[modulo])} />
        <span className="my-3 h-px w-9 bg-white/20" />

        <div className="flex flex-col items-center gap-3 lg:flex-1 lg:justify-center">
          {grupos.map(([g]) => (
            <Icono
              key={g}
              icono={ICONO_GRUPO[g] ?? LayoutGrid}
              label={corto(g)}
              activo={abierto ? abierto === g : grupoActivo === g}
              onClick={() => setAbierto((v) => (v === g ? null : g))}
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
      {abierto && (
        <div
          role="menu"
          className="barra-accesos fixed z-40 w-[min(340px,calc(100vw-110px))] rounded-2xl p-3 text-white shadow-[0_20px_50px_-12px_rgba(10,16,48,0.75)] max-lg:bottom-[152px] max-lg:right-[92px] lg:right-[100px] lg:top-1/2 lg:-translate-y-1/2"
        >
          <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-white/60">{corto(abierto)}</p>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {lista.map((a) => (
              <button
                key={a.slug}
                type="button"
                role="menuitem"
                onClick={() => ir(urlBoton(modulo, a))}
                className={`rounded-xl px-3 py-2 text-left text-[13px] leading-snug transition ${
                  a.slug === accionActiva ? "bg-white font-semibold text-[#1e2a5a]" : "text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                {a.label}
              </button>
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
            ? "h-14 w-14 bg-gradient-to-b from-white to-[#dfe6ff] text-[#1e2a5a] shadow-[0_6px_18px_-4px_rgba(150,175,255,0.8)]"
            : "h-12 w-12 text-white/80 hover:bg-white/10 hover:text-white"
        }`}
      >
        <I size={24} strokeWidth={1.6} />
        {burbuja > 0 && <Burbuja n={burbuja} />}
      </button>
      {/* Tooltip (solo PC) */}
      <span className="pointer-events-none absolute right-[calc(100%+18px)] hidden whitespace-nowrap rounded-md bg-[#141a33] px-3 py-1.5 text-[13px] font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 lg:block">
        {label}
      </span>
    </div>
  );
}

function Burbuja({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-[#ff3b4e] px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-[#1e2a5a]">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export default BarraAccesos;
