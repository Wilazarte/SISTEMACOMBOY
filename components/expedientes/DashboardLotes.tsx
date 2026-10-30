"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FolderOpen, Plus, Search } from "lucide-react";
import { useSesion } from "@/lib/auth";
import { FASES, NOMBRE_PERFIL, RESPONSABLE, TITULO_FASE, costos, docsDe, puedeActuar, resumen, textoBusqueda, useExpedientes, type Expediente, type Fase } from "@/lib/expedientes";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, soles, useStore } from "@/lib/storage";
import type { Requerimiento, StockItem, ValeProduccion } from "@/lib/types";
import { Avance, AvisoSql, Boton, Seccion, pct } from "./comun";
import { FormNuevaOP } from "./FormulariosFase";

interface Fila {
  x: Expediente;
  r: ReturnType<typeof resumen>;
  c: ReturnType<typeof costos>;
  busca: string;
}

/** Tablero central: expedientes 26W por fase (Kanban), avance 0-100 %, costo real vs estimado en vivo y buscador. */
export function DashboardLotes() {
  const router = useRouter();
  const { sesion } = useSesion();
  const s = useExpedientes();
  // Documentos que ya existen en el ERP (para avance, costo y búsqueda)
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const reqsP = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const reqsH = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(false);
  const [verCerrados, setVerCerrados] = useState(false);

  const filas = useMemo<Fila[]>(
    () =>
      s.expedientes.map((x) => {
        const d = docsDe(x, s);
        return { x, r: resumen(x, d), c: costos(x, d, stock, vales), busca: textoBusqueda(x, d) };
      }),
    // ops / reqs: docsDe lee la misma caché; se recalcula cuando cambian
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, stock, vales, ops, reqsP, reqsH]
  );
  const t = q.trim().toUpperCase();
  const visibles = filas.filter((f) => (!t || f.busca.includes(t)) && (verCerrados || f.x.estado === "ABIERTO"));
  const abiertos = filas.filter((f) => f.x.estado === "ABIERTO");
  const kpi = {
    abiertos: abiertos.length,
    vencidos: abiertos.filter((f) => f.r.vencido).length,
    avance: abiertos.length ? Math.round(abiertos.reduce((a, f) => a + f.r.avance, 0) / abiertos.length) : 0,
    real: abiertos.reduce((a, f) => a + f.c.real, 0),
    estimado: abiertos.reduce((a, f) => a + f.x.costo_estimado, 0),
    margenBajo: abiertos.filter((f) => f.c.alertaMargen).length,
  };
  const columna = (n: Fase | "CERRADO") => visibles.filter((f) => (n === "CERRADO" ? f.x.estado !== "ABIERTO" : f.x.estado === "ABIERTO" && (f.r.actual ?? 8) === n));
  const abrir = (codigo: string) => router.push(`/erp/expediente/${codigo}`);

  return (
    <div className="space-y-5 text-[#e5e7eb]">
      <nav className="text-[12px] text-[#a1a1aa]" aria-label="Ruta">
        ERP v3.0 › <span className="text-white">Expedientes</span>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold uppercase text-white">Expedientes de fabricación</h1>
          <p className="text-[14px] text-[#d4d4d8]">Orden de Producción → Expediente · 8 fases · código de seguimiento 26W</p>
        </div>
        {puedeActuar(sesion, 1) && (
          <Boton lleno onClick={() => setNueva(true)}>
            <Plus size={15} /> Nueva OP (fase 1)
          </Boton>
        )}
      </header>

      {s.faltaTabla && <AvisoSql />}
      {s.error && <p className="text-[13px] text-[#ff8a80]">{s.error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Abiertos", String(kpi.abiertos)],
          ["Plazo vencido", String(kpi.vencidos)],
          ["Avance promedio", `${kpi.avance} %`],
          ["Costo real", soles(kpi.real)],
          ["Costo estimado", soles(kpi.estimado)],
          ["Margen < 22 %", String(kpi.margenBajo)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-[#2a2a2a] border-b-[#d50000] bg-[#1a1a1a] px-3 py-3">
            <p className="text-[12px] uppercase text-[#a1a1aa]">{k}</p>
            <p className="text-xl font-bold text-white">{v}</p>
          </div>
        ))}
      </div>

      <Seccion>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-[#3a3a3a] bg-[#141414] px-3 py-2">
            <Search size={16} className="text-[#ff5252]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código 26W, N° de serie, RUC, OC, OP, chasis, guía…" className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-[#71717a]" />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Ver cerrados
          </label>
        </div>
      </Seccion>

      {s.listo && !s.faltaTabla && filas.length === 0 && <p className="rounded-lg border border-dashed border-[#2a2a2a] p-6 text-center text-[13px] text-[#a1a1aa]">Sin expedientes registrados. El primero nace con la Nueva OP de Logística.</p>}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {[...FASES, ...(verCerrados ? (["CERRADO"] as const) : [])].map((n) => {
          const items = columna(n);
          return (
            <div key={n} className="w-64 shrink-0 rounded-xl border border-[#2a2a2a] bg-[#111] p-2">
              <h3 className="mb-2 px-1 text-[12px] font-bold uppercase text-[#ff5252]">
                {n === "CERRADO" ? "Cerrados" : `${n}. ${TITULO_FASE[n]}`}
                <span className="block text-[11px] font-normal normal-case text-[#a1a1aa]">{n === "CERRADO" ? "Expediente completo" : NOMBRE_PERFIL[RESPONSABLE[n]]} · {items.length}</span>
              </h3>
              <div className="space-y-2">
                {items.map(({ x, r, c }) => (
                  <button key={x.id} type="button" onClick={() => abrir(x.codigo_expediente)} className="block w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-2.5 text-left transition hover:border-[#d50000]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[17px] font-black text-[#d50000]">{x.codigo_expediente}</span>
                      {x.is_demo && <span className="rounded bg-white/10 px-1.5 text-[10px] text-[#a1a1aa]">DEMO</span>}
                    </span>
                    <span className="block truncate text-[13px] font-semibold text-white">{x.datos.producto}</span>
                    <span className="block text-[11px] text-[#a1a1aa]">
                      {x.op_id}
                      {x.lote ? ` · lote ${x.lote}` : ""} · plazo {x.plazo ?? "—"}
                    </span>
                    <span className="mt-1.5 block">
                      <Avance pct={r.avance} />
                    </span>
                    <span className="mt-1 block text-[11px] text-[#d4d4d8]">
                      Real {soles(c.real)} / est. {soles(x.costo_estimado)} · var. {pct(c.variacion)}
                    </span>
                    {(r.vencido || c.alertaMargen) && (
                      <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#fcd34d]">
                        <AlertTriangle size={12} /> {[r.vencido && "Plazo vencido", c.alertaMargen && `Margen ${pct(c.margen)}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="flex items-center gap-2 text-[12px] text-[#a1a1aa]">
        <FolderOpen size={14} /> Cada tarjeta abre su expediente con los 15 documentos; desde allí cualquier documento queda a un clic.
      </p>

      {nueva && <FormNuevaOP onClose={() => setNueva(false)} onCreado={(c) => (setNueva(false), abrir(c))} />}
    </div>
  );
}

export default DashboardLotes;
