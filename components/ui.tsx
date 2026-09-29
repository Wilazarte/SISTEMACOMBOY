"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import type { EventoHistorial } from "@/lib/types";

export const cn = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------- Button
type Variante = "primary" | "secondary" | "success" | "danger" | "warning" | "ghost";
const VARIANTES: Record<Variante, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
  ghost: "text-slate-600 hover:bg-slate-100",
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
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
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
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- Form
export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";

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
  PENDIENTE: "bg-amber-100 text-amber-800 ring-amber-300",
  ACEPTADO: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  OBSERVADO: "bg-orange-100 text-orange-800 ring-orange-300",
  OBSERVADA: "bg-orange-100 text-orange-800 ring-orange-300",
  COTIZADO: "bg-sky-100 text-sky-800 ring-sky-300",
  COMPRADO: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  FINALIZADO: "bg-slate-800 text-white ring-slate-800",
  FINALIZADA: "bg-slate-800 text-white ring-slate-800",
  REGISTRADA: "bg-sky-100 text-sky-800 ring-sky-300",
  CON_OC: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  EMITIDA: "bg-amber-100 text-amber-800 ring-amber-300",
  FACTURADA: "bg-sky-100 text-sky-800 ring-sky-300",
  EN_GUIA: "bg-violet-100 text-violet-800 ring-violet-300",
  POR_PAGAR: "bg-red-100 text-red-800 ring-red-300",
  PAGADA: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  PENDIENTE_VB: "bg-amber-100 text-amber-800 ring-amber-300",
  CONFORME: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  FACTURA: "bg-slate-100 text-slate-700 ring-slate-300",
  DECLARACION_JURADA: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300",
};

const ETIQUETA: Record<string, string> = {
  CON_OC: "CON OC",
  EN_GUIA: "POR V°B°",
  POR_PAGAR: "POR PAGAR",
  PENDIENTE_VB: "PEND. V°B°",
  DECLARACION_JURADA: "DECL. JURADA",
};

export function Badge({ estado }: { estado: string }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", COLORES[estado] ?? "bg-slate-100 text-slate-700 ring-slate-300")}>
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
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
            value === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={cn("rounded-full px-1.5 text-[11px] font-bold", value === t.id ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-800")}>{t.count}</span>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div className={cn("w-full rounded-xl bg-white shadow-2xl", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">
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
        <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-slate-400">Sin registros</p>}
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-2.5 text-slate-700", className)}>{children}</td>
);

// ---------------------------------------------------------------- Timeline
export function Timeline({ eventos }: { eventos: EventoHistorial[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-slate-200">
      {eventos.map((e, i) => {
        const ultimo = i === eventos.length - 1;
        return (
          <li key={i} className="mb-4 ml-5 last:mb-0">
            <span className={cn("absolute -left-[9px] mt-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white", ultimo ? "bg-emerald-500" : "bg-slate-400")} />
            <p className="text-sm font-semibold text-slate-800">{e.accion}</p>
            {e.detalle && <p className="text-sm text-slate-600">{e.detalle}</p>}
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
        <div key={t.id} className={cn("flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg", t.tipo === "ok" ? "bg-emerald-600" : "bg-red-600")}>
          {t.tipo === "ok" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-12 text-slate-400">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}
