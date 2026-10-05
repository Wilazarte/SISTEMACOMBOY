"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Folder, FolderOpen, Search, Users } from "lucide-react";
import { Empty, Input, cn } from "@/components/ui";
import { soles } from "@/lib/storage";
import type { HistorialPlanilla as Periodo } from "@/lib/historial";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** Carpeta del periodo: "SEMANA 14 - ABRIL 2026" -> "ABRIL 2026"; si no se reconoce, mes y año del cierre. */
function carpetaDe(p: Periodo): { clave: string; nombre: string } {
  const m = /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEP?TIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\D*(\d{4})/.exec(p.periodo);
  if (m) {
    const mes = m[1] === "SEPTIEMBRE" ? "SETIEMBRE" : m[1];
    return { clave: `${m[2]}-${String(MESES.indexOf(mes) + 1).padStart(2, "0")}`, nombre: `${mes} ${m[2]}` };
  }
  const f = new Date(p.fecha_cierre);
  if (isNaN(f.getTime())) return { clave: "0000", nombre: "OTROS" };
  return { clave: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`, nombre: `${MESES[f.getMonth()]} ${f.getFullYear()}` };
}

const fechaHora = (iso: string) => {
  const f = new Date(iso);
  return isNaN(f.getTime()) ? "-" : f.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/**
 * Explorador del historial: carpeta colapsable con subcarpetas por mes y una tarjeta por periodo.
 * Al hacer clic se abre /dashboard/planilla/historial/[id] (solo lectura).
 */
export function HistorialPlanilla({ lista, cargando, error }: { lista: Periodo[]; cargando: boolean; error: string | null }) {
  const [abierta, setAbierta] = useState(true);
  const [cerradas, setCerradas] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState("");

  const carpetas = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    const m = new Map<string, { nombre: string; periodos: Periodo[] }>();
    lista
      .filter((p) => !q || p.periodo.includes(q) || (p.creado_por ?? "").toUpperCase().includes(q))
      .forEach((p) => {
        const c = carpetaDe(p);
        if (!m.has(c.clave)) m.set(c.clave, { nombre: c.nombre, periodos: [] });
        m.get(c.clave)!.periodos.push(p);
      });
    return [...m].sort((a, b) => b[0].localeCompare(a[0]));
  }, [lista, buscar]);

  const alternar = (clave: string) =>
    setCerradas((s) => {
      const n = new Set(s);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-plomo-200 bg-white shadow-sm">
      <button onClick={() => setAbierta((v) => !v)} className="flex w-full items-center gap-3 bg-azul-900 px-5 py-3 text-left text-white">
        {abierta ? <FolderOpen size={20} className="text-white" /> : <Folder size={20} className="text-white" />}
        <span className="flex-1">
          <span className="block font-semibold">Historial de planillas</span>
          <span className="block text-xs text-slate-400">{lista.length} periodo(s) cerrado(s) · copia permanente, solo lectura</span>
        </span>
        <ChevronRight size={18} className={cn("transition", abierta && "rotate-90")} />
      </button>

      {abierta && (
        <div className="space-y-3 p-4">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar periodo (ej: ABRIL 2026, SEMANA 14)…" className="pl-9" />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : cargando ? (
            <p className="py-8 text-center text-sm text-slate-400">Cargando historial…</p>
          ) : carpetas.length === 0 ? (
            <Empty
              icon={<Folder size={28} />}
              text={lista.length ? "Ningún periodo coincide con la búsqueda." : "Aún no hay semanas cerradas. Use “Cerrar semana y guardar en historial” en la planilla del periodo."}
            />
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {carpetas.map(([clave, c]) => {
                const abiertaC = !cerradas.has(clave);
                return (
                  <div key={clave} className="rounded-lg border border-plomo-200">
                    <button onClick={() => alternar(clave)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-plomo-50">
                      <ChevronRight size={16} className={cn("text-slate-400 transition", abiertaC && "rotate-90")} />
                      {abiertaC ? <FolderOpen size={16} className="text-corp" /> : <Folder size={16} className="text-corp" />}
                      <span className="flex-1">{c.nombre}</span>
                      <span className="text-xs font-normal text-plomo-500">
                        {c.periodos.length} · {soles(c.periodos.reduce((a, p) => a + p.total_pagar, 0))}
                      </span>
                    </button>
                    {abiertaC && (
                      <div className="grid gap-2 border-t border-plomo-100 p-2 sm:grid-cols-2 xl:grid-cols-3">
                        {c.periodos.map((p) => (
                          <Link
                            key={p.id}
                            href={`/dashboard/planilla/historial/${p.id}`}
                            className="group flex items-start gap-3 rounded-lg border border-plomo-200 bg-white p-3 transition hover:border-corp hover:shadow-sm"
                          >
                            <FileText size={20} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-corp" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-azul-900">{p.periodo}</span>
                              <span className="mt-0.5 block text-lg font-bold text-azul-900" title="Total pagado (neto - adelantos)">{soles(p.total_pagar)}</span>
                              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-plomo-500">
                                <span>{fechaHora(p.fecha_cierre)}</span>
                                <span className="inline-flex items-center gap-1">
                                  <Users size={12} /> {p.cantidad_trabajadores}
                                </span>
                                {p.creado_por && <span>por {p.creado_por}</span>}
                              </span>
                            </span>
                            <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300 group-hover:text-corp" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
