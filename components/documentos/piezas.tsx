"use client";

// Piezas visuales de la Gestión Documentaria. Paleta obligatoria (Williams 2026-11-17), sin otros colores:
// #11212D noche (header / texto), #800021 burdeos (pendiente / crítico / rechazar), #294D61 petróleo
// (aprobado / secundario), #CCD0CF fondo. Blanco solo para las tarjetas.

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { COLOR, colorEstado, et } from "@/lib/gestionDocumental";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function ChipEstado({ estado }: { estado: string }) {
  const c = colorEstado(estado);
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ background: c.fondo, color: c.texto, borderColor: c.borde }}
    >
      {et(estado)}
    </span>
  );
}

type Tono = "critico" | "secundario" | "neutro" | "borde";
const TONO: Record<Tono, string> = {
  critico: "!bg-tema-acento !text-white hover:bg-tema-acento/90 border-tema-acento",
  secundario: "!bg-tema-sec !text-white hover:bg-tema-sec/90 border-tema-sec",
  neutro: "!bg-tema-fuerte !text-white hover:bg-tema-fuerte/90 border-tema-texto",
  borde: "bg-white text-tema-texto hover:bg-tema-borde/40 border-tema-texto/25",
};

export function Boton({ tono = "borde", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tono?: Tono }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        TONO[tono],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Campo({ label, children, ayuda, className }: { label: string; children: ReactNode; ayuda?: string; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tema-texto/75">{label}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-tema-texto/60">{ayuda}</span>}
    </label>
  );
}

export const claseInput =
  "w-full rounded-lg border border-tema-texto/20 bg-white px-3 py-2 text-[13px] text-tema-texto outline-none placeholder:text-tema-texto/40 focus:border-tema-sec focus:ring-2 focus:ring-tema-sec/25";

/** Ventana modal propia (no depende del tema del ERP para respetar la paleta). */
export function VentanaGD({ abierta, titulo, onCerrar, children, ancha }: { abierta: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancha?: boolean }) {
  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierta, onCerrar]);
  if (!abierta || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto !bg-tema-fuerte/55 p-3 pb-24 pt-[5vh] sm:p-4" onMouseDown={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cx("w-full overflow-hidden rounded-2xl bg-white shadow-2xl", ancha ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 !bg-tema-fuerte px-5 py-3.5 !text-white">
          <h3 className="text-[15px] font-semibold">{titulo}</h3>
          <button onClick={onCerrar} className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** Fondo del módulo: #CCD0CF con ondas suaves #294D61 (la marca de agua COMBOY VID la pone el layout del ERP). */
export function FondoOndas() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl" style={{ background: COLOR.fondo }}>
      <svg className="absolute bottom-0 left-0 h-[55%] w-full" viewBox="0 0 1440 420" preserveAspectRatio="none">
        <path d="M0 210 C 240 140 480 300 720 230 S 1200 120 1440 200 L1440 420 L0 420 Z" fill={COLOR.petroleo} opacity="0.07" />
        <path d="M0 290 C 300 220 560 360 860 300 S 1260 230 1440 280 L1440 420 L0 420 Z" fill={COLOR.petroleo} opacity="0.09" />
        <path d="M0 360 C 260 320 620 410 940 360 S 1300 330 1440 350 L1440 420 L0 420 Z" fill={COLOR.petroleo} opacity="0.11" />
      </svg>
      <svg className="absolute left-0 top-0 h-40 w-full" viewBox="0 0 1440 160" preserveAspectRatio="none">
        <path d="M0 40 C 320 110 700 0 1040 60 S 1360 90 1440 50 L1440 0 L0 0 Z" fill={COLOR.petroleo} opacity="0.06" />
      </svg>
    </div>
  );
}

export function Vacio({ texto, icono }: { texto: string; icono?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-[13px] text-tema-texto/60">
      {icono}
      {texto}
    </div>
  );
}

/** Tarjeta blanca del módulo. */
export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-tema-texto/10 bg-white shadow-[0_1px_3px_rgba(17,33,45,0.08)]", className)}>{children}</div>;
}
