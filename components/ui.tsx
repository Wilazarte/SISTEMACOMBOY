"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import type { EventoHistorial } from "@/lib/types";

export const cn = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------- Button
type Variante = "primary" | "secondary" | "success" | "danger" | "warning" | "ghost";
const VARIANTES: Record<Variante, string> = {
  // Tema formal corporativo: rojo corporativo / rojo vino, azul oscuro y plomo
  primary: "bg-corp text-white shadow-sm hover:bg-vino-900",
  secondary: "bg-white text-azul-900 border border-plomo-200 hover:bg-plomo-50",
  success: "bg-azul-700 text-white shadow-sm hover:bg-azul-900",
  danger: "bg-vino text-white shadow-sm hover:bg-vino-900",
  warning: "bg-corp text-white shadow-sm hover:bg-vino-900",
  ghost: "text-plomo-600 hover:bg-plomo-100 hover:text-azul-900",
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
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-6 py-2.5 text-sm",
        VARIANTES[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-plomo-200 bg-white shadow-[0_4px_12px_rgba(15,36,64,0.06)]", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-plomo-100 px-6 py-4">
      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-plomo-500">{title}</h3>
        {subtitle && <p className="mt-1 text-[13px] text-plomo-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Form
export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-plomo-200 bg-white px-3 py-2 text-sm text-azul-900 outline-none transition focus:border-azul-900 focus:ring-1 focus:ring-azul-900 disabled:bg-plomo-100";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputCls, "min-h-[72px]", props.className)} />;
}

export function Select({ options, placeholder, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select {...props} className={cn(inputCls, props.className)}>
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
const COLORES: Record<string, string> = {
  // Formales y suaves: verde = conforme, ámbar = pendiente, vino = observado / por pagar, azul = en proceso
  PENDIENTE: "bg-amber-50 text-amber-800 ring-amber-200",
  ACEPTADO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OBSERVADO: "bg-red-50 text-vino ring-red-200",
  OBSERVADA: "bg-red-50 text-vino ring-red-200",
  COTIZADO: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  COMPRADO: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  FINALIZADO: "bg-azul-900 text-white ring-azul-900",
  FINALIZADA: "bg-azul-900 text-white ring-azul-900",
  REGISTRADA: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  CON_OC: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  EMITIDA: "bg-amber-50 text-amber-800 ring-amber-200",
  FACTURADA: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  EN_GUIA: "bg-amber-50 text-amber-800 ring-amber-200",
  POR_PAGAR: "bg-red-50 text-vino ring-red-200",
  PAGADA: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PENDIENTE_VB: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFORME: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FACTURA: "bg-plomo-100 text-plomo-600 ring-plomo-200",
  DECLARACION_JURADA: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  ACTIVO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  APROBADA: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ANULADA: "bg-plomo-100 text-plomo-600 ring-plomo-200",
  ANULADO: "bg-plomo-100 text-plomo-600 ring-plomo-200",
  BORRADOR: "bg-plomo-100 text-plomo-600 ring-plomo-200",
  EMITIDO: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  PAGADO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  VENCIDO: "bg-red-50 text-vino ring-red-200",
  EN_PREPARACION: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  DESPACHADO_PARCIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  DESPACHADO_TOTAL: "bg-azul-900 text-white ring-azul-900",
  ENTREGADO: "bg-azul-900 text-white ring-azul-900",
  PARCIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  NO_ENVIADO: "bg-amber-50 text-amber-800 ring-amber-200",
  CONTADO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CREDITO: "bg-amber-50 text-amber-800 ring-amber-200",
  CREDITO_CUOTAS: "bg-amber-50 text-amber-800 ring-amber-200",
  INACTIVO: "bg-red-50 text-vino ring-red-200",
  COMPRA: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  GASTO_TESORERIA: "bg-red-50 text-vino ring-red-200",
  DISPONIBLE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  EN_QC: "bg-red-50 text-vino ring-red-200",
  PEDIDO_ALISTADO: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]",
  PEDIDO_ENTREGADO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  DEJADO_EN_AGENCIA: "bg-red-50 text-vino ring-red-200",
  DESCONTADO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
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
  PEDIDO_ENTREGADO: "ENTREGADO",
  DEJADO_EN_AGENCIA: "EN AGENCIA",
};

export function Badge({ estado }: { estado: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", COLORES[estado] ?? "bg-plomo-100 text-plomo-600 ring-plomo-200")}>
      {ETIQUETA[estado] ?? estado}
    </span>
  );
}

// ---------------------------------------------------------------- Tabs
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-plomo-200 bg-white p-1 shadow-[0_4px_12px_rgba(15,36,64,0.06)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
            value === t.id ? "bg-azul-900 text-white shadow-sm" : "text-plomo-600 hover:bg-plomo-100 hover:text-azul-900"
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={cn("rounded-full px-1.5 text-[11px] font-bold", value === t.id ? "bg-corp text-white" : "bg-red-50 text-vino")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-azul-900/60 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div className={cn("w-full rounded-xl bg-white shadow-2xl", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-xl border-b-[3px] border-b-corp px-6 py-4">
          <h3 className="font-serif text-lg text-azul-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-plomo-100 hover:text-slate-700" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white [&>tr]:border-b [&>tr]:border-plomo-100">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-plomo-500">Sin registros</p>}
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-2.5 text-slate-700", className)}>{children}</td>
);

// ---------------------------------------------------------------- Timeline
export function Timeline({ eventos }: { eventos: EventoHistorial[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-plomo-200">
      {eventos.map((e, i) => {
        const ultimo = i === eventos.length - 1;
        return (
          <li key={i} className="mb-4 ml-5 last:mb-0">
            <span className={cn("absolute -left-[9px] mt-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white", ultimo ? "bg-emerald-500" : "bg-slate-400")} />
            <p className="text-sm font-semibold text-azul-900">{e.accion}</p>
            {e.detalle && <p className="text-sm text-plomo-600">{e.detalle}</p>}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
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
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cn("flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg", t.tipo === "ok" ? "bg-azul-900" : "bg-vino")}>
          {t.tipo === "ok" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-plomo-200 bg-white py-12 text-plomo-500">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
