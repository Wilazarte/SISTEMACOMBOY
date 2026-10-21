"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CornerDownLeft, FileText, Search, type LucideIcon } from "lucide-react";
import { Badge, Kbd, cn } from "@/components/ui";

export interface Comando {
  id: string;
  grupo: string;
  label: string;
  detalle?: string;
  icon: LucideIcon;
  teclas?: string[];
  estado?: string;
  /** Texto extra para la búsqueda (no se muestra). */
  claves?: string;
  run: () => void;
}

/** Buscador global (Ctrl+K): acciones, módulos, secciones y documentos. */
export function CommandPalette({
  abierto,
  onCerrar,
  comandos,
  documentos,
}: {
  abierto: boolean;
  onCerrar: () => void;
  comandos: Comando[];
  /** Documentos que coinciden con el texto (REQ, OC, facturas…). */
  documentos: (q: string) => Comando[];
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abierto) {
      setQ("");
      setSel(0);
    }
  }, [abierto]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const propios = comandos.filter((c) => !t || `${c.label} ${c.detalle ?? ""} ${c.claves ?? ""} ${c.grupo}`.toLowerCase().includes(t));
    return [...propios, ...(t.length >= 2 ? documentos(q) : [])];
  }, [q, comandos, documentos]);
  const actual = Math.min(sel, Math.max(0, items.length - 1));

  useEffect(() => {
    lista.current?.querySelector(`[data-i="${actual}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actual]);

  if (!abierto) return null;

  const ejecutar = (c: Comando | undefined) => {
    if (!c) return;
    onCerrar();
    c.run();
  };

  return (
    <div className="fixed inset-0 z-[90] flex animate-velo items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-[3px]" onMouseDown={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscador global"
        className="w-full max-w-[640px] animate-emerger overflow-hidden rounded-2xl border border-plomo-200 bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 items-center gap-3 border-b border-plomo-200 px-4">
          <Search size={18} className="shrink-0 text-plomo-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(actual + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(actual - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                ejecutar(items[actual]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCerrar();
              }
            }}
            placeholder="Busca documentos (REQ, OC, factura, guía…), módulos o acciones"
            aria-label="Buscar"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-plomo-500"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={lista} className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-plomo-500">Sin resultados para «{q}»</p>
          ) : (
            items.map((c, i) => {
              const Icon = c.icon;
              const grupo = i === 0 || items[i - 1].grupo !== c.grupo ? c.grupo : null;
              return (
                <div key={`${c.grupo}-${c.id}`}>
                  {grupo && <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-plomo-500">{grupo}</p>}
                  <button
                    data-i={i}
                    onMouseMove={() => i !== actual && setSel(i)}
                    onClick={() => ejecutar(c)}
                    className={cn("flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] transition-colors", i === actual ? "bg-plomo-100 text-fg" : "text-fg-2")}
                  >
                    <Icon size={16} className={cn("shrink-0", i === actual ? "text-corp" : "text-plomo-500")} />
                    <span className="truncate font-medium">{c.label}</span>
                    {c.detalle && <span className="min-w-0 flex-1 truncate text-xs text-plomo-500">{c.detalle}</span>}
                    {!c.detalle && <span className="flex-1" />}
                    {c.estado && <Badge estado={c.estado} />}
                    {c.teclas?.map((t) => <Kbd key={t}>{t}</Kbd>)}
                    {i === actual && !c.teclas?.length && <CornerDownLeft size={14} className="shrink-0 text-plomo-500" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-plomo-200 bg-plomo-50 px-4 py-2.5 text-xs text-plomo-500">
          <Ayuda teclas={["↑", "↓"]}>navegar</Ayuda>
          <Ayuda teclas={["Enter"]}>abrir</Ayuda>
          <Ayuda teclas={["Ctrl", "K"]}>abrir / cerrar</Ayuda>
        </div>
      </div>
    </div>
  );
}

function Ayuda({ teclas, children }: { teclas: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {teclas.map((t) => (
        <Kbd key={t}>{t}</Kbd>
      ))}
      {children}
    </span>
  );
}

export const IconoDoc = FileText;
