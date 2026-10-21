"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, GripVertical } from "lucide-react";
import { cn } from "@/components/ui";
import { guardarPrefs, usePrefs } from "@/lib/preferencias";

export interface Tarjeta {
  id: string;
  icon: ReactNode;
  label: string;
  valor: string;
  detalle: string;
  href: string;
  tono: "rojo" | "grafito" | "neutro";
  alerta?: boolean;
}

const TONO = { rojo: "bg-rojo-soft text-rojo", grafito: "bg-azul-900 text-white", neutro: "bg-plomo-100 text-fg-2" };

/** KPIs del Dashboard que se reordenan arrastrando; el orden se guarda en las preferencias del usuario (Supabase). */
export function TarjetasOrdenables({ tarjetas }: { tarjetas: (Tarjeta | false)[] }) {
  const prefs = usePrefs();
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const visibles = tarjetas.filter((t): t is Tarjeta => !!t);
  const orden = prefs.ordenDashboard ?? [];
  const pos = (id: string) => (orden.includes(id) ? orden.indexOf(id) : orden.length + visibles.findIndex((t) => t.id === id));
  const lista = [...visibles].sort((a, b) => pos(a.id) - pos(b.id));
  const reordenado = orden.length > 0;

  const soltar = (destino: string) => {
    if (!arrastrada || arrastrada === destino) return;
    const ids = lista.map((t) => t.id).filter((id) => id !== arrastrada);
    const desde = lista.findIndex((t) => t.id === arrastrada);
    const hasta = lista.findIndex((t) => t.id === destino);
    ids.splice(ids.indexOf(destino) + (desde < hasta ? 1 : 0), 0, arrastrada);
    // Conserva las tarjetas que este usuario no ve ahora (permisos) al final
    guardarPrefs({ ordenDashboard: [...ids, ...orden.filter((id) => !ids.includes(id))] });
  };

  if (lista.length === 0) return null;
  return (
    <section aria-label="Indicadores" className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-plomo-500">
        <span className="inline-flex items-center gap-1.5">
          <GripVertical size={13} /> Arrastra las tarjetas para ordenarlas a tu gusto
        </span>
        {reordenado && (
          <button onClick={() => guardarPrefs({ ordenDashboard: [] })} className="rounded-md px-1.5 py-0.5 font-medium text-rojo hover:bg-rojo-soft">
            Restablecer orden
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {lista.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", t.id);
              setArrastrada(t.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (sobre !== t.id) setSobre(t.id);
            }}
            onDragLeave={() => sobre === t.id && setSobre(null)}
            onDrop={(e) => {
              e.preventDefault();
              soltar(t.id);
              setArrastrada(null);
              setSobre(null);
            }}
            onDragEnd={() => {
              setArrastrada(null);
              setSobre(null);
            }}
            className={cn(
              "group relative cursor-grab rounded-xl border bg-surface shadow-card transition duration-200 ease-suave active:cursor-grabbing",
              arrastrada === t.id ? "opacity-40" : "hover:-translate-y-0.5 hover:border-red-200 hover:shadow-pop",
              sobre === t.id && arrastrada && arrastrada !== t.id ? "border-dashed border-corp bg-rojo-soft" : "border-plomo-200"
            )}
          >
            <Link href={t.href} draggable={false} className="flex flex-col gap-3 p-5">
              <span className="flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", TONO[t.tono])}>{t.icon}</span>
                <span className="flex-1 text-[13px] font-medium text-plomo-500">{t.label}</span>
                <GripVertical size={15} className="text-plomo-500 opacity-0 transition group-hover:opacity-100" aria-hidden />
              </span>
              <span className={cn("text-[28px] font-semibold leading-none tracking-tight tabular", t.alerta ? "text-rojo" : "text-fg")}>{t.valor}</span>
              <span className="flex items-center justify-between gap-2 text-xs text-plomo-500">
                {t.detalle}
                <ArrowRight size={14} className="shrink-0 transition group-hover:translate-x-0.5 group-hover:text-rojo" />
              </span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
