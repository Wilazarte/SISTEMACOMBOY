import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function soles(n: number | null | undefined) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(n ?? 0);
}

export function pct(n: number | null | undefined, d = 1) {
  return `${(n ?? 0).toFixed(d)}%`;
}

export function fecha(d: Date | string | null | undefined, conHora = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-PE", conHora
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

export function diasDesde(d: Date | string | null | undefined) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function addMonths(d: Date, m: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  return r;
}

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Normaliza un telefono peruano a formato WhatsApp internacional (sin +) */
export function normalizarTelefono(t: string) {
  let d = t.replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("9")) d = "51" + d;
  return d;
}
