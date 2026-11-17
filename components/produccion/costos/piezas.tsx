"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/components/ui";
import type { EstadoHoja } from "@/lib/costoProduccion";
import { nombreEstado } from "@/lib/costoProduccion";

// Paleta obligatoria del submódulo (Williams 2026-11-17): solo estos 4 colores.
export const NOCHE = "#11212D"; // cabecera, texto
export const VINO = "#800021"; // pendiente / alerta de sobrecosto
export const ACERO = "#294D61"; // aprobado
export const GRIS = "#CCD0CF"; // fondo

/** Fondo de color + texto blanco en línea: el tema claro (globals.css) remapea .text-white y bg-[#1…] dentro de main/diálogos. */
export const pinta = (fondo: string, color = "#ffffff") => ({ backgroundColor: fondo, color });

/** Fondo #CCD0CF con ondas suaves #294D61 (la marca de agua COMBOY VID la pone ErpLayout en todas las pantallas). */
export function FondoCostos({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate -mx-3 overflow-hidden rounded-2xl bg-[#CCD0CF] px-3 pb-6 pt-0 sm:mx-0 sm:px-5">
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1200 800">
        <path d="M0 120 C 220 60 420 190 640 130 S 1000 60 1200 120 L1200 0 L0 0 Z" fill="#294D61" opacity="0.10" />
        <path d="M0 330 C 260 260 520 400 760 330 S 1060 260 1200 320" stroke="#294D61" strokeWidth="2" fill="none" opacity="0.18" />
        <path d="M0 360 C 280 300 540 430 780 360 S 1080 290 1200 350" stroke="#294D61" strokeWidth="1.2" fill="none" opacity="0.12" />
        <path d="M0 640 C 240 580 470 700 720 640 S 1040 570 1200 630 L1200 800 L0 800 Z" fill="#294D61" opacity="0.08" />
      </svg>
      {children}
    </div>
  );
}

export function Encabezado({ titulo, subtitulo, derecha }: { titulo: string; subtitulo?: string; derecha?: ReactNode }) {
  return (
    <div className="-mx-3 mb-4 flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-[#800021] px-4 py-3 sm:-mx-5 sm:px-5" style={pinta(NOCHE)}>
      <div className="min-w-0">
        <h1 className="text-[17px] font-bold uppercase tracking-wide">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-[12.5px] text-[#CCD0CF]">{subtitulo}</p>}
      </div>
      {derecha}
    </div>
  );
}

export function Tarjeta({ children, className, titulo, accion, tono = "noche" }: { children: ReactNode; className?: string; titulo?: ReactNode; accion?: ReactNode; tono?: "noche" | "acero" | "vino" }) {
  const borde = tono === "vino" ? "border-[#800021]" : tono === "acero" ? "border-[#294D61]" : "border-[#11212D]/20";
  const cab = tono === "vino" ? VINO : tono === "acero" ? ACERO : NOCHE;
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-white/95 shadow-sm", borde, className)}>
      {titulo && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" style={pinta(cab)}>
          <h2 className="text-[13px] font-bold uppercase tracking-wide">{titulo}</h2>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

type Var = "noche" | "acero" | "vino" | "borde";
export function Boton({ variante = "noche", className, children, style, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Var }) {
  const fondo = variante === "noche" ? NOCHE : variante === "acero" ? ACERO : variante === "vino" ? VINO : null;
  return (
    <button
      {...p}
      style={{ ...(fondo ? pinta(fondo) : { backgroundColor: "#ffffff", color: NOCHE }), ...style }}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45", !fondo && "border border-[#294D61]", className)}
    >
      {children}
    </button>
  );
}

const campo = "w-full rounded-md border border-[#CCD0CF] bg-white px-2.5 py-1.5 text-[13px] text-[#11212D] outline-none transition placeholder:text-[#294D61]/50 focus:border-[#294D61] focus:ring-2 focus:ring-[#294D61]/20 disabled:bg-[#CCD0CF]/35 disabled:text-[#11212D]/70";
export const Entrada = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(campo, className)} />;
export const Area = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={2} {...p} className={cn(campo, className)} />;
export const Lista = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn(campo, className)}>
    {children}
  </select>
);
export function Etiqueta({ texto, children, className, ayuda }: { texto: string; children: ReactNode; className?: string; ayuda?: ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#294D61]">{texto}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-[#11212D]/70">{ayuda}</span>}
    </label>
  );
}

/** Aprobado = #294D61 · Pendiente / alerta = #800021 · Cerrado = #11212D · Anulado = gris. */
export function EstadoChip({ estado }: { estado: EstadoHoja }) {
  const estilo =
    estado === "APROBADO"
      ? pinta(ACERO)
      : estado === "CERRADO"
        ? pinta(NOCHE)
        : estado === "ANULADO"
          ? pinta(GRIS, NOCHE)
          : estado === "RECHAZADO"
            ? { ...pinta("#ffffff", VINO), border: `1px solid ${VINO}` }
            : pinta(VINO);
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase", estado === "ANULADO" && "line-through")} style={estilo}>
      {nombreEstado(estado)}
    </span>
  );
}

export function Alerta({ children, tono = "vino", icono }: { children: ReactNode; tono?: "vino" | "acero"; icono?: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border-l-4 px-3 py-2 text-[12.5px]", tono === "vino" ? "border-[#800021] bg-[#800021]/[0.07] text-[#800021]" : "border-[#294D61] bg-[#294D61]/[0.08] text-[#11212D]")}>
      {icono && <span className="mt-0.5 shrink-0">{icono}</span>}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

/** Tabla del submódulo (en celular, components/TablasMovil la vuelve tarjetas: sin desplazamiento horizontal). */
export function Tabla({ head, children, className }: { head: string[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-[13px] text-[#11212D]">
        <thead className="border-b-2 border-[#294D61] bg-[#CCD0CF]/60 text-[10.5px] font-bold uppercase tracking-wide text-[#11212D]">
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} className="whitespace-nowrap px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-[#CCD0CF]">{children}</tbody>
      </table>
    </div>
  );
}

export const Celda = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-3 py-2 align-top", className)}>{children}</td>;
