"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Calendar, Cog, Flag, Hash, Home, Info, Layers, Lightbulb, Loader2, Package, Pencil, Plus, Settings, Tag, Trash2 } from "lucide-react";
import { toast } from "@/components/ui";
import { useSesion } from "@/lib/auth";
import { ALMACENES, ALMACEN_DEFECTO } from "@/lib/empresa";
import { MARCAS_MOTOR, TIPOS_EQUIPO } from "@/lib/equipos";
import { costoBomLote, crearOpLote, loteDeHoy, puedeActuar, useExpedientes, type DatosExpediente, type DetalleOP, type EquipoLote } from "@/lib/expedientes";
import { hoy, soles } from "@/lib/storage";

// =====================================================================
// FASE 1 · Crear OP de LOTE MIXTO (/logistica/crear-op), corrección del jefe de Logística (Williams 2026-10-30).
// Un lote lleva varios equipos (tipo, marca de motor, modelo, cantidad). Código 26W y lote LOTE-AAAA-Wss automáticos;
// el costo estimado se calcula en la Fase 2 con el BOM; chasis y serie se llenan en la Fase 8.
// =====================================================================

const TIPOS_LOTE = ["MOTOR ELÉCTRICO", "TRIMOTO", ...TIPOS_EQUIPO];
const PRIORIDADES: DatosExpediente["prioridad"][] = ["NORMAL", "ALTA", "URGENTE"];
const nuevaFila = (): EquipoLote => ({ tipo: "", marca: "RONCO", modelo: "", cantidad: 1 });

const campo = "w-full rounded-lg border border-[#343846] bg-[#23252F] px-3 py-2 text-[14px] text-white outline-none transition placeholder:text-[#6b7080] focus:border-[#60a5fa]";
const etiqueta = "mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#a1a1aa]";
const tarjeta = "rounded-xl border border-[#2a2d38] bg-[#181a21] p-4 sm:p-5";

export function CrearOP() {
  const router = useRouter();
  const { sesion } = useSesion();
  const s = useExpedientes();
  const [almacen, setAlmacen] = useState(ALMACEN_DEFECTO);
  const [plazo, setPlazo] = useState("");
  const [prioridad, setPrioridad] = useState<DatosExpediente["prioridad"]>("NORMAL");
  const [detalles, setDetalles] = useState<EquipoLote[]>([nuevaFila()]);
  const [editando, setEditando] = useState<number | null>(0);
  const [ocupado, setOcupado] = useState(false);

  const agregarDetalle = () => {
    setDetalles((d) => [...d, nuevaFila()]);
    setEditando(detalles.length);
  };
  const eliminarDetalle = (idx: number) => {
    setDetalles((d) => d.filter((_, i) => i !== idx));
    setEditando(null);
  };
  const actualizarDetalle = <K extends keyof EquipoLote>(idx: number, field: K, value: EquipoLote[K]) => setDetalles((d) => d.map((x, i) => (i === idx ? { ...x, [field]: value } : x)));

  const total = detalles.reduce((a, d) => a + (Number(d.cantidad) > 0 ? Number(d.cantidad) : 0), 0);
  const modelos = new Set(detalles.map((d) => d.modelo.trim().toUpperCase()).filter(Boolean)).size;
  // Vista previa del costo con el BOM ya cargado (el oficial lo guarda Producción en la Fase 2)
  const previa = costoBomLote(
    detalles.filter((d) => d.modelo.trim() && d.cantidad > 0).map((d, i) => ({ id: String(i), orden_id: "", tipo_equipo: d.tipo, marca_motor: d.marca, modelo: d.modelo.trim().toUpperCase(), cantidad: d.cantidad, codigo_chasis: null, serie_motor: null, unidades: [], costo_bom: 0, orden: i }) as DetalleOP),
    s.bom
  );
  const conBom = previa.porDetalle.filter((p) => !p.sinBom).length;
  const puede = puedeActuar(sesion, 1);

  const crear = async () => {
    setOcupado(true);
    try {
      const x = await crearOpLote({ almacen, plazo, prioridad, equipos: detalles });
      toast(`OP ${x.codigo_expediente} creada · ${x.lote} · se avisó a Producción y Almacén`);
      router.push(`/erp/expediente/${x.codigo_expediente}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void crear();
      }}
      className="mx-auto max-w-5xl space-y-5 text-[#e5e7eb]"
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Fase 1 · Crear Orden de Producción</h1>
          <span className="rounded-full border border-dashed border-teal-400 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-teal-300">Lote mixto</span>
        </div>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-[#a1a1aa]">
          <span className="flex items-center gap-1.5">
            <Info size={14} className="text-[#60a5fa]" /> Código de seguimiento: <b className="text-white">26W-XXX automático</b>
          </span>
          <span className="flex items-center gap-1.5">
            <Info size={14} className="text-[#60a5fa]" /> Lote de fabricación: <b className="text-white">{loteDeHoy()} automático</b>
          </span>
        </p>
      </header>

      {!puede && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">Solo Logística crea la OP (Fase 1).</p>}
      {s.faltaTabla && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">Falta correr en Supabase el SQL de expedientes (20261105) y el de lote mixto (20261108).</p>}

      <section className={tarjeta}>
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-white">Destino y plazo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className={etiqueta}>
              <Home size={14} /> Almacén destino
            </span>
            <select value={almacen} onChange={(e) => setAlmacen(e.target.value)} className={campo}>
              {ALMACENES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={etiqueta}>
              <Calendar size={14} /> Plazo de finalización
            </span>
            <input type="date" required min={hoy()} value={plazo} onChange={(e) => setPlazo(e.target.value)} className={`${campo} [color-scheme:dark]`} />
          </label>
          <label>
            <span className={etiqueta}>
              <Flag size={14} /> Prioridad
            </span>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as DatosExpediente["prioridad"])} className={campo}>
              {PRIORIDADES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={tarjeta}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-white">
            <Settings size={16} className="text-[#60a5fa]" /> Equipos a fabricar en este lote
          </h2>
          <span className="rounded-full border border-dashed border-teal-400/70 px-2.5 py-0.5 text-[12px] text-teal-300">
            Lote mixto · {modelos} modelo{modelos === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-[#2a2d38] text-left text-[12px] uppercase tracking-wide text-[#a1a1aa]">
                {[
                  [Box, "Tipo de equipo"],
                  [Cog, "Marca motor"],
                  [Tag, "Modelo"],
                  [Hash, "Cantidad"],
                  [Pencil, "Acción"],
                ].map(([Icono, t]) => {
                  const I = Icono as typeof Box;
                  return (
                    <th key={t as string} className="px-2 py-2 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <I size={14} /> {t as string}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {detalles.map((d, i) => {
                const abierta = editando === i || !d.tipo || !d.modelo.trim();
                return (
                  <tr key={i} className="border-b border-[#23252F] last:border-0">
                    <td className="px-2 py-2">
                      {abierta ? (
                        <select required value={d.tipo} onChange={(e) => actualizarDetalle(i, "tipo", e.target.value)} className={campo} aria-label={`Tipo de equipo fila ${i + 1}`}>
                          <option value="">Elegir…</option>
                          {TIPOS_LOTE.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-white">{d.tipo}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {abierta ? (
                        <select required value={d.marca} onChange={(e) => actualizarDetalle(i, "marca", e.target.value)} className={campo} aria-label={`Marca de motor fila ${i + 1}`}>
                          {MARCAS_MOTOR.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{d.marca}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {abierta ? (
                        <input required value={d.modelo} onChange={(e) => actualizarDetalle(i, "modelo", e.target.value.toUpperCase())} placeholder="CV-300" className={campo} aria-label={`Modelo fila ${i + 1}`} />
                      ) : (
                        <span className="font-semibold text-white">{d.modelo}</span>
                      )}
                    </td>
                    <td className="w-32 px-2 py-2">
                      <input
                        required
                        type="number"
                        min={1}
                        step={1}
                        value={d.cantidad || ""}
                        onChange={(e) => actualizarDetalle(i, "cantidad", Math.floor(Number(e.target.value)))}
                        className={campo}
                        aria-label={`Cantidad fila ${i + 1}`}
                      />
                    </td>
                    <td className="w-24 px-2 py-2">
                      <span className="flex gap-1">
                        <button type="button" onClick={() => setEditando(editando === i ? null : i)} className="rounded-md p-2 text-[#93c5fd] transition hover:bg-[#23252F]" title="Editar" aria-label={`Editar fila ${i + 1}`}>
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={detalles.length === 1}
                          onClick={() => eliminarDetalle(i)}
                          className="rounded-md p-2 text-[#f87171] transition hover:bg-[#23252F] disabled:opacity-30"
                          title={detalles.length === 1 ? "El lote necesita al menos un equipo" : "Quitar"}
                          aria-label={`Quitar fila ${i + 1}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={agregarDetalle}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-400 px-3 py-2.5 text-[14px] font-semibold text-blue-300 transition hover:bg-blue-400/10"
        >
          <Plus size={16} /> Agregar otro tipo de equipo al lote
        </button>
      </section>

      <section className={tarjeta}>
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-white">Resumen</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg bg-[#23252F] px-4 py-3">
            <Package size={22} className="text-[#60a5fa]" />
            <div>
              <p className="text-[12px] uppercase text-[#a1a1aa]">Total equipos</p>
              <p className="text-xl font-bold text-white">
                {total} unidad{total === 1 ? "" : "es"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-[#23252F] px-4 py-3">
            <Layers size={22} className="text-[#60a5fa]" />
            <div>
              <p className="text-[12px] uppercase text-[#a1a1aa]">Modelos</p>
              <p className="text-xl font-bold text-white">
                {modelos} modelo{modelos === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 py-3 text-[13px] text-blue-100">
          <Lightbulb size={18} className="mt-0.5 shrink-0 text-blue-300" />
          <span>
            El costo estimado se calcula automáticamente en la Fase 2: cuando Producción valida materiales, el BOM de cada modelo × su cantidad, a costo de stock.
            {conBom > 0 && (
              <>
                {" "}
                Con el BOM cargado hoy ({conBom} de {previa.porDetalle.length} modelo(s)): <b className="text-white">{soles(previa.total)}</b>.
              </>
            )}
          </span>
        </p>
      </section>

      <div className="flex justify-end gap-2 pb-6">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-[#343846] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#23252F]">
          Cancelar
        </button>
        <button type="submit" disabled={ocupado || !puede} className="flex items-center gap-2 rounded-lg bg-[#2a7bff] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#1e64e6] disabled:opacity-50">
          {ocupado && <Loader2 size={16} className="animate-spin" />} Crear orden
        </button>
      </div>
    </form>
  );
}

export default CrearOP;
