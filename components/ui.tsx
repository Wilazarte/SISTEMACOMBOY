"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import type { EventoHistorial } from "@/lib/types";
import { IslandMenu, type AccionIsla } from "@/components/layout/IslandMenu";

export const cn = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------- Button
type Variante = "primary" | "secondary" | "success" | "danger" | "warning" | "ghost";
const VARIANTES: Record<Variante, string> = {
  // Tema v2: rojo COMBOY como primario, grafito para la acción secundaria fuerte
  primary: "bg-corp text-white shadow-rojo hover:bg-vino-900",
  secondary: "border border-plomo-200 bg-surface text-fg shadow-card hover:bg-plomo-50",
  success: "bg-azul-900 text-white shadow-card hover:bg-azul-900/90",
  danger: "border border-red-200 bg-surface text-rojo shadow-card hover:border-red-300 hover:bg-rojo-soft",
  warning: "bg-corp text-white shadow-rojo hover:bg-vino-900",
  ghost: "text-plomo-600 hover:bg-plomo-100 hover:text-fg",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition duration-150 ease-suave active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-[13px]",
        VARIANTES[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

/** Tecla de atajo, ej. <Kbd>N</Kbd>. */
export const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => <kbd className={cn("kbd", className)}>{children}</kbd>;

// ---------------------------------------------------------------- Card
export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cn("rounded-xl border border-plomo-200 bg-surface/80 shadow-card backdrop-blur-xl", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-plomo-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-plomo-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Form
export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-plomo-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-plomo-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-plomo-200 bg-surface px-3 py-2 text-sm text-fg shadow-card outline-none transition duration-150 placeholder:text-plomo-500 hover:border-plomo-500/40 focus:border-corp focus:ring-[3px] focus:ring-corp/15 disabled:cursor-not-allowed disabled:bg-plomo-100 disabled:text-plomo-500";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "min-h-[72px]", props.className)} />;
}

export function Select({ options, placeholder, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select {...props} className={cn(inputCls, "cursor-pointer", props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- Badge
// Rojo = requiere atención · ámbar = en curso · verde = conforme · grafito = cerrado · gris = anulado / neutro
type Tono = "rojo" | "ambar" | "verde" | "info" | "cerrado" | "neutro";
const TONOS: Record<Tono, { cls: string; punto: string }> = {
  rojo: { cls: "bg-rojo-soft text-rojo ring-red-200", punto: "bg-corp" },
  ambar: { cls: "bg-amber-50 text-amber-700 ring-amber-200", punto: "bg-amber-500" },
  verde: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", punto: "bg-emerald-500" },
  info: { cls: "bg-plomo-100 text-fg-2 ring-plomo-200", punto: "bg-azul-500" },
  cerrado: { cls: "bg-azul-900 text-white ring-azul-900", punto: "bg-corp" },
  neutro: { cls: "bg-plomo-50 text-plomo-500 ring-plomo-200", punto: "bg-slate-400" },
};

const TONO_ESTADO: Record<string, Tono> = {
  PENDIENTE: "rojo",
  OBSERVADO: "rojo",
  OBSERVADA: "rojo",
  POR_PAGAR: "rojo",
  VENCIDO: "rojo",
  INACTIVO: "rojo",
  GASTO_TESORERIA: "rojo",
  EN_QC: "rojo",
  DEJADO_EN_AGENCIA: "rojo",
  EMITIDA: "ambar",
  EN_GUIA: "ambar",
  PENDIENTE_VB: "ambar",
  DESPACHADO_PARCIAL: "ambar",
  PARCIAL: "ambar",
  NO_ENVIADO: "ambar",
  CREDITO: "ambar",
  CREDITO_CUOTAS: "ambar",
  EN_FABRICACION: "ambar",
  COTIZADO: "info",
  COMPRADO: "info",
  REGISTRADA: "info",
  CON_OC: "info",
  FACTURADA: "info",
  DECLARACION_JURADA: "info",
  EMITIDO: "info",
  EN_PREPARACION: "info",
  COMPRA: "info",
  PEDIDO_ALISTADO: "info",
  FINALIZADO: "cerrado",
  FINALIZADA: "cerrado",
  DESPACHADO_TOTAL: "cerrado",
  ENTREGADO: "cerrado",
  VENDIDO: "cerrado",
  ACEPTADO: "verde",
  BANCARIZADA: "verde",
  PAGADA: "verde",
  CONFORME: "verde",
  ACTIVO: "verde",
  APROBADA: "verde",
  PAGADO: "verde",
  CONTADO: "verde",
  DISPONIBLE: "verde",
  QC_APROBADO: "verde",
  PEDIDO_ENTREGADO: "verde",
  DESCONTADO: "verde",
  FACTURA: "neutro",
  ANULADA: "neutro",
  ANULADO: "neutro",
  BORRADOR: "neutro",
};

const ETIQUETA: Record<string, string> = {
  CON_OC: "CON OC",
  EN_GUIA: "POR V°B°",
  POR_PAGAR: "POR PAGAR",
  PENDIENTE_VB: "PEND. V°B°",
  DECLARACION_JURADA: "DECL. JURADA",
  EN_PREPARACION: "EN PREPARACIÓN",
  DESPACHADO_PARCIAL: "DESP. PARCIAL",
  DESPACHADO_TOTAL: "DESP. TOTAL",
  NO_ENVIADO: "NO ENVIADO",
  CREDITO: "CRÉDITO",
  CREDITO_CUOTAS: "CRÉDITO CUOTAS",
  GASTO_TESORERIA: "GASTO TESORERIA",
  PEDIDO_ALISTADO: "ALISTADO",
  EN_QC: "EN QC",
  EN_FABRICACION: "EN FABRICACIÓN",
  QC_APROBADO: "QC APROBADO",
  PEDIDO_ENTREGADO: "ENTREGADO",
  DEJADO_EN_AGENCIA: "EN AGENCIA",
};

export function Badge({ estado }: { estado: string }) {
  const t = TONOS[TONO_ESTADO[estado] ?? "neutro"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", t.cls)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.punto)} aria-hidden />
      {ETIQUETA[estado] ?? estado}
    </span>
  );
}

// ---------------------------------------------------------------- Tabs
/** Contenedor del layout (debajo del encabezado) donde se muestran las pestañas del módulo. */
export const ID_BARRA_PESTANAS = "erp-pestanas";
/** El layout (submenús, buscador) pide abrir una pestaña: detail = id de la pestaña. */
export const EV_IR_PESTANA = "erp:ir-pestana";
/** Las pestañas avisan cuál está abierta (ruta del encabezado y submenú activo): detail = { id, label, ruta }. */
export const EV_PESTANA = "erp:pestana";
export interface PestanaActiva {
  id: string;
  label: string;
  ruta: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  enLinea = false,
  enBarra = false,
  fueraDeIsla = [],
  acciones,
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  /** Sub-pestañas dentro de otra pestaña: se dibujan en su lugar y no leen ni cambian ?tab=. */
  enLinea?: boolean;
  /** Con enLinea: igual se dibuja como la isla superior del layout (p. ej. Planilla dentro de Tesorería). */
  enBarra?: boolean;
  /** Pestañas válidas (?tab=, eventos) que no se dibujan en esta isla; si una está abierta, la isla no se muestra
   *  y su contenido dibuja la suya (Planilla tiene su propio botón en el dock). */
  fueraDeIsla?: T[];
  /** Botones de la isla antes de las pestañas (Buscar, Nuevo, Historial…). */
  acciones?: AccionIsla[];
}) {
  // Las pestañas se dibujan en la barra fija del layout (si existe); si no, en su lugar.
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => setDestino(enLinea && !enBarra ? null : document.getElementById(ID_BARRA_PESTANAS)), [enLinea, enBarra]);
  const principal = !!destino && !enLinea;

  // ?tab=<id> en la URL o un submenú del layout abren la pestaña (solo si existe en esta barra)
  const ref = useRef({ tabs, value, onChange });
  ref.current = { tabs, value, onChange };
  useEffect(() => {
    if (enLinea) return;
    const abrir = (id: string | null) => {
      const { tabs: ts, value: v, onChange: cambiar } = ref.current;
      if (id && id !== v && ts.some((t) => t.id === id)) cambiar(id as T);
    };
    abrir(new URLSearchParams(window.location.search).get("tab"));
    const ir = (e: Event) => abrir((e as CustomEvent<string>).detail);
    window.addEventListener(EV_IR_PESTANA, ir);
    return () => window.removeEventListener(EV_IR_PESTANA, ir);
  }, []);
  const etiqueta = tabs.find((t) => t.id === value)?.label;
  useEffect(() => {
    if (principal && etiqueta) window.dispatchEvent(new CustomEvent<PestanaActiva>(EV_PESTANA, { detail: { id: value, label: etiqueta, ruta: window.location.pathname } }));
  }, [principal, etiqueta, value]);

  const elegir = (id: T) => {
    onChange(id);
    if (principal) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(window.history.state, "", url);
    }
  };

  // Menú isla flotante (components/layout/IslandMenu): una sola cápsula con acciones + pestañas
  if (fueraDeIsla.includes(value)) return null;
  const items = tabs.filter((t) => !fueraDeIsla.includes(t.id));
  const barra = <IslandMenu items={items} activo={value} onElegir={(id) => elegir(id as T)} acciones={acciones} className={enLinea && !enBarra ? "mx-0 mt-0" : undefined} />;
  return destino ? createPortal(barra, destino) : barra;
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex animate-velo items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("w-full animate-emerger rounded-2xl border border-plomo-200 bg-surface shadow-pop", wide ? "max-w-4xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-plomo-200 px-5 py-4">
          <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-plomo-500 transition hover:bg-plomo-100 hover:text-fg" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Table
/** `compacto`: menos relleno y cabeceras que pueden partirse (tablas anchas, ej. planilla del periodo). */
export function Table({ head, children, empty, compacto }: { head: string[]; children: ReactNode; empty?: boolean; compacto?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full min-w-[720px] text-left text-sm", compacto && "[&_td]:px-2 [&_td]:py-2")}>
        <thead className={cn("border-y border-plomo-200 bg-plomo-50 font-medium uppercase text-plomo-500", compacto ? "text-[10px] tracking-wide" : "text-[11px] tracking-wider")}>
          <tr>
            {head.map((h) => (
              <th key={h} className={compacto ? "px-2 py-2 font-medium leading-tight" : "whitespace-nowrap px-4 py-2.5 font-medium"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface [&>tr:hover]:bg-plomo-50 [&>tr]:border-b [&>tr]:border-plomo-100 [&>tr]:transition-colors">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-plomo-500">Sin registros</p>}
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-2.5 text-fg-2", className)}>{children}</td>
);

// ---------------------------------------------------------------- Timeline
export function Timeline({ eventos }: { eventos: EventoHistorial[] }) {
  return (
    <ol className="relative ml-2 border-l border-plomo-200">
      {eventos.map((e, i) => {
        const ultimo = i === eventos.length - 1;
        return (
          <li key={i} className="mb-4 ml-5 last:mb-0">
            <span className={cn("absolute -left-[7px] mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-surface", ultimo ? "bg-corp" : "bg-slate-300")} />
            <p className="text-sm font-semibold text-fg">{e.accion}</p>
            {e.detalle && <p className="text-sm text-plomo-600">{e.detalle}</p>}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-plomo-500">
              <Clock size={11} /> {new Date(e.fecha).toLocaleString("es-PE")} · {e.usuario}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- Toasts
type Toast = { id: number; msg: string; tipo: "ok" | "error" };
const EV_TOAST = "erp:toast";

export function toast(msg: string, tipo: "ok" | "error" = "ok"): void {
  window.dispatchEvent(new CustomEvent<Omit<Toast, "id">>(EV_TOAST, { detail: { msg, tipo } }));
}

/** Ejecuta una acción de negocio y muestra el resultado. Devuelve true si tuvo éxito. */
export function ejecutar(fn: () => void, ok: string): boolean {
  try {
    fn();
    toast(ok, "ok");
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Error inesperado", "error");
    return false;
  }
}

/** Igual que ejecutar(), para acciones que esperan al servidor (ej. numeración en Supabase). */
export async function ejecutarAsync(fn: () => Promise<unknown>, ok: string): Promise<boolean> {
  try {
    await fn();
    toast(ok, "ok");
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Error inesperado", "error");
    return false;
  }
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Omit<Toast, "id">>).detail;
      const id = Date.now() + Math.random();
      setItems((p) => [...p, { ...d, id }]);
      setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 4500);
    };
    window.addEventListener(EV_TOAST, on);
    return () => window.removeEventListener(EV_TOAST, on);
  }, []);
  return (
    <div className="fixed bottom-4 left-1/2 z-[95] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "flex animate-emerger items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-pop",
            t.tipo === "ok" ? "bg-[#0A0A0B] text-white dark:bg-[#F4F4F5] dark:text-[#0A0A0B]" : "bg-corp text-white"
          )}
        >
          {t.tipo === "ok" ? <CheckCircle2 size={18} className="shrink-0 text-emerald-400" /> : <AlertCircle size={18} className="shrink-0" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-plomo-200 bg-surface py-12 text-plomo-500">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
