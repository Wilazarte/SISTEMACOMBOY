"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Factory, Loader2, Plus, Search, Settings2, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Modal, cn, toast } from "@/components/ui";
import { useSesion } from "@/lib/auth";
import { perfilPlanta } from "@/lib/permisosPlanta";
import {
  ESTADOS_HOJA,
  S,
  crearHoja,
  dashboard,
  desviacion,
  guardarConfig,
  modelosDisponibles,
  NOMBRE_MODELO,
  referenciaHoja,
  pct,
  useCostoProduccion,
  type ConfigCosto,
  type EstadoCostos,
  type EstadoHoja,
  type OpDisponible,
} from "@/lib/costoProduccion";
import { Alerta, Area, Boton, Celda, Encabezado, Entrada, EstadoChip, Etiqueta, FondoCostos, NOCHE, Tabla, Tarjeta, pinta } from "./piezas";
import { HojaCosto } from "./HojaCosto";

type Vista = "ordenes" | "dashboard" | "parametros";
export type ModoCostos = "produccion" | "finanzas" | "gerencia";

const SUBTITULO: Record<ModoCostos, string> = {
  produccion: "Costo real auditado por cada equipo · Operario registra → Jefe de Producción revisa → Tesorería valida → Gerencia aprueba",
  finanzas: "Validación de Tesorería de los costos de producción (paso 3 de 4)",
  gerencia: "Aprobación de Gerencia del costo final y control de sobrecostos",
};

/** Producción › Costo de Producción (también lo abren Tesorería y Gerencia para su paso del flujo). */
export function CostoProduccion({ modo }: { modo: ModoCostos }) {
  const datos = useCostoProduccion();
  const { sesion } = useSesion();
  const perfil = perfilPlanta(sesion);
  const [vista, setVista] = useState<Vista>("ordenes");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estados, setEstados] = useState<EstadoHoja[]>([]);
  const [nueva, setNueva] = useState<OpDisponible | "elegir" | null>(null);
  const [ops, setOps] = useState<OpDisponible[]>([]);
  const creaHojas = !!sesion && !sesion.soloLectura && (perfil === "produccion" || perfil === "soporte" || perfil === "logistica");

  // ?hoja=CP-2026-0001 (desde la campana) abre la hoja; Tesorería / Gerencia ven primero lo que les toca
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const h = p.get("hoja");
    if (h) setAbierta(h);
    if (modo === "finanzas") setEstados(["REVISADO"]);
    if (modo === "gerencia") setEstados(["VALIDADO"]);
  }, [modo]);
  useEffect(() => {
    if (!datos.listo || datos.faltaTabla) return;
    void modelosDisponibles().then(setOps).catch(() => setOps([]));
  }, [datos.listo, datos.faltaTabla, datos.hojas.length]);

  // Modelos sin hoja abierta (una hoja cerrada permite abrir otra para recalcular)
  const sinHoja = useMemo(() => ops.filter((o) => !datos.hojas.some((h) => h.origen === "MODELO" && h.estado !== "ANULADO" && h.estado !== "CERRADO" && h.orden_produccion_id === o.codigo)), [ops, datos.hojas]);

  const lista = useMemo(() => {
    const t = q.trim().toUpperCase();
    return datos.hojas
      .filter((h) => !t || `${h.codigo} ${h.orden_produccion_id} ${h.tipo_equipo} ${h.modelo ?? ""} ${h.cliente_proyecto ?? ""}`.toUpperCase().includes(t))
      .filter((h) => !estados.length || estados.includes(h.estado))
      .filter((h) => {
        const f = (h.fecha_inicio ?? h.created_at).slice(0, 10);
        return (!desde || f >= desde) && (!hasta || f <= hasta);
      });
  }, [datos.hojas, q, estados, desde, hasta]);

  const hoja = abierta ? datos.hojas.find((h) => h.id === abierta || h.codigo === abierta) : undefined;

  if (!datos.listo)
    return (
      <FondoCostos>
        <Encabezado titulo="Costo de Producción" subtitulo={SUBTITULO[modo]} />
        <p className="flex items-center gap-2 py-16 text-[13px] text-tema-texto">
          <Loader2 size={16} className="animate-spin" /> Cargando costos…
        </p>
      </FondoCostos>
    );
  if (datos.faltaTabla)
    return (
      <FondoCostos>
        <Encabezado titulo="Costo de Producción" subtitulo={SUBTITULO[modo]} />
        <Alerta icono={<AlertTriangle size={15} />}>Falta correr en Supabase el SQL supabase/migrations/20261204_costo_produccion.sql para activar el submódulo.</Alerta>
      </FondoCostos>
    );

  if (hoja)
    return (
      <FondoCostos>
        <Encabezado titulo="Costo de Producción" subtitulo={SUBTITULO[modo]} />
        <HojaCosto key={hoja.id} hoja={hoja} datos={datos} onVolver={() => setAbierta(null)} />
      </FondoCostos>
    );

  return (
    <FondoCostos>
      <Encabezado
        titulo="Costo de Producción"
        subtitulo={SUBTITULO[modo]}
        derecha={
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["ordenes", "Órdenes", Factory],
                ["dashboard", "Dashboard", BarChart3],
                ["parametros", "Parámetros", Settings2],
              ] as [Vista, string, typeof Factory][]
            ).map(([id, txt, Icono]) => (
              <button key={id} onClick={() => setVista(id)} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold hover:opacity-90" style={vista === id ? pinta("var(--card-bg)", NOCHE) : { backgroundColor: "rgba(255,255,255,0.12)", color: "#ffffff" }}>
                <Icono size={13} /> {txt}
              </button>
            ))}
          </div>
        }
      />

      {vista === "ordenes" && (
        <div className="space-y-4">
          {/* Buscador + filtros */}
          <div className="grid gap-2 rounded-xl bg-white/90 p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-tema-sec" />
              <Entrada className="pl-8" placeholder="Buscar por OP, equipo, cliente o CP-…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Entrada type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Entrada type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            {creaHojas && (
              <Boton onClick={() => setNueva("elegir")}>
                <Plus size={15} /> Nueva hoja de costo
              </Boton>
            )}
            <div className="flex flex-wrap gap-1.5 sm:col-span-4">
              {ESTADOS_HOJA.map((e) => {
                const on = estados.includes(e.id);
                const cuenta = datos.hojas.filter((h) => h.estado === e.id).length;
                return (
                  <button
                    key={e.id}
                    onClick={() => setEstados((s) => (on ? s.filter((x) => x !== e.id) : [...s, e.id]))}
                    className={cn("rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", on ? "border-tema-texto" : "border-tema-borde")}
                    style={on ? pinta(NOCHE) : pinta("var(--card-bg)", NOCHE)}
                  >
                    {e.nombre} ({cuenta})
                  </button>
                );
              })}
              {(estados.length > 0 || q || desde || hasta) && (
                <button
                  className="text-[11.5px] font-semibold text-tema-tinta underline"
                  onClick={() => {
                    setEstados([]);
                    setQ("");
                    setDesde("");
                    setHasta("");
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {creaHojas && sinHoja.length > 0 && (
            <Alerta icono={<AlertTriangle size={15} />}>
              <b>{sinHoja.length === 1 ? "1 modelo sin hoja de costo:" : `${sinHoja.length} modelos sin hoja de costo:`}</b>{" "}
              {sinHoja.map((o, i) => (
                <button key={o.codigo} className="mr-1 underline" onClick={() => setNueva(o)}>
                  {NOMBRE_MODELO[o.codigo] ?? o.codigo}
                  {i < sinHoja.length - 1 ? "," : ""}
                </button>
              ))}{" "}
              Toque uno para abrir su ficha de costo.
            </Alerta>
          )}

          <Tarjeta titulo={`Órdenes con hoja de costo (${lista.length})`}>
            {lista.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-tema-texto/70">{datos.hojas.length ? "Ninguna hoja con esos filtros." : "Aún no hay hojas de costo. Abra una por modelo de equipo."}</p>
            ) : (
              <Tabla head={["Modelo / OP", "Equipo", "Cantidad", "Costo estimado", "Costo real", "Desviación", "Margen", "Estado"]}>
                {lista.map((h) => {
                  const c = datos.costos.get(h.id);
                  const dv = desviacion(c);
                  return (
                    <tr key={h.id} className="cursor-pointer hover:bg-tema-borde/35" onClick={() => setAbierta(h.id)}>
                      <Celda>
                        <p className="font-bold">{h.origen === "MODELO" ? NOMBRE_MODELO[h.orden_produccion_id] ?? h.orden_produccion_id : h.orden_produccion_id}</p>
                        <p className="text-[11px] text-tema-sec">{h.codigo}</p>
                      </Celda>
                      <Celda>
                        <p className="font-semibold">{h.tipo_equipo}</p>
                        <p className="text-[11px] text-tema-sec">{[h.modelo, h.cliente_proyecto].filter(Boolean).join(" · ")}</p>
                      </Celda>
                      <Celda>{h.cantidad}</Celda>
                      <Celda className="whitespace-nowrap">{c?.costo_estimado ? S(c.costo_estimado) : <span className="text-tema-texto/50">Sin fijar</span>}</Celda>
                      <Celda className="whitespace-nowrap font-semibold">{S(c?.costo_total)}</Celda>
                      <Celda className={cn("whitespace-nowrap font-semibold", dv && dv.soles > 0 ? "text-tema-tinta" : "text-tema-sec")}>
                        {dv ? `${dv.soles > 0 ? "+" : ""}${S(dv.soles)} (${dv.soles > 0 ? "+" : ""}${pct(dv.pct)})` : "—"}
                      </Celda>
                      <Celda className={cn("whitespace-nowrap font-bold", c?.alerta_margen ? "text-tema-tinta" : "text-tema-sec")}>
                        {pct(c?.margen_real)}
                        {c?.alerta_margen && <AlertTriangle size={12} className="ml-1 inline" />}
                      </Celda>
                      <Celda>
                        <EstadoChip estado={h.estado} />
                      </Celda>
                    </tr>
                  );
                })}
              </Tabla>
            )}
          </Tarjeta>
        </div>
      )}

      {vista === "dashboard" && <DashboardCostos datos={datos} onAbrir={setAbierta} />}
      {vista === "parametros" && <Parametros config={datos.config} edita={!!sesion && !sesion.soloLectura && (perfil === "soporte" || perfil === "finanzas")} />}

      {nueva && <NuevaHoja inicial={nueva === "elegir" ? null : nueva} ops={sinHoja} config={datos.config} onCerrar={() => setNueva(null)} onCreada={(id) => (setNueva(null), setAbierta(id))} />}
    </FondoCostos>
  );
}

/** Hoja de costo por MODELO de equipo (Williams 2026-11-17): se calcula desde cero, una por modelo. */
function NuevaHoja({ inicial, ops, config, onCerrar, onCreada }: { inicial: OpDisponible | null; ops: OpDisponible[]; config: ConfigCosto; onCerrar: () => void; onCreada: (id: string) => void }) {
  const [sel, setSel] = useState(inicial?.codigo ?? "");
  const modelo = ops.find((o) => o.codigo === sel) ?? (inicial?.codigo === sel ? inicial : null);
  const [f, setF] = useState({ responsable: "", fecha_inicio: new Date().toISOString().slice(0, 10), precio_venta: 0, margen_deseado: config.margen_deseado });
  const [ocupado, setOcupado] = useState(false);

  const crear = async () => {
    if (!modelo) return toast("Elija el modelo de equipo.", "error");
    setOcupado(true);
    try {
      const r = await crearHoja({ origen: "MODELO", orden_produccion_id: modelo.codigo, tipo_equipo: modelo.tipo_equipo, cantidad: 1, ...f });
      toast(`${r.codigo} creada: agregue los materiales, cantidades y costos.`);
      onCreada(r.id);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal open onClose={onCerrar} title="Nueva ficha de costo por modelo" wide>
      <div className="space-y-3">
        <Etiqueta texto="Modelo de equipo" ayuda="Una ficha general por modelo: el costo de UNA unidad, que vale para todas sus OP.">
          <div className="grid gap-2 sm:grid-cols-2">
            {ops.map((o) => (
              <button
                key={o.codigo}
                type="button"
                onClick={() => setSel(o.codigo)}
                className="rounded-lg border-2 px-3 py-2 text-left"
                style={sel === o.codigo ? { borderColor: "var(--secundario)", backgroundColor: "color-mix(in srgb, var(--secundario) 8%, transparent)", color: NOCHE } : { borderColor: "var(--border)", backgroundColor: "var(--card-bg)", color: NOCHE }}
              >
                <span className="block text-[13.5px] font-bold">{NOMBRE_MODELO[o.codigo] ?? o.codigo}</span>
                <span className="block text-[11.5px] text-tema-sec">{o.detalle}</span>
              </button>
            ))}
            {ops.length === 0 && <p className="text-[12.5px] text-tema-tinta">Los 4 modelos ya tienen una ficha abierta: ábrala desde la lista.</p>}
          </div>
        </Etiqueta>
        <div className="grid gap-3 sm:grid-cols-2">
          <Etiqueta texto="Responsable de Producción">
            <Entrada value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} />
          </Etiqueta>
          <Etiqueta texto="Fecha">
            <Entrada type="date" value={f.fecha_inicio} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} />
          </Etiqueta>
          <Etiqueta texto="Precio de venta unitario (opcional)">
            <Entrada type="number" min={0} step="0.01" value={f.precio_venta || ""} onChange={(e) => setF({ ...f, precio_venta: Number(e.target.value) })} />
          </Etiqueta>
          <Etiqueta texto="Margen deseado %">
            <Entrada type="number" min={0} max={95} value={Math.round(f.margen_deseado * 100)} onChange={(e) => setF({ ...f, margen_deseado: Number(e.target.value) / 100 })} />
          </Etiqueta>
        </div>
        <p className="text-[11.5px] text-tema-sec">La ficha empieza vacía: usted agrega cada material con su cantidad y costo. Todo queda en la bitácora de auditoría.</p>
        <div className="flex justify-end gap-2">
          <Boton variante="borde" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => void crear()} disabled={!modelo || ocupado}>
            {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Crear ficha de costo
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

function DashboardCostos({ datos, onAbrir }: { datos: EstadoCostos; onAbrir: (id: string) => void }) {
  const d = dashboard(datos);
  const kpis: [string, string, boolean][] = [
    ["Hojas de costo", String(d.totales.hojas), false],
    ["Por aprobar", String(d.totales.porAprobar), d.totales.porAprobar > 0],
    ["Con alerta (margen / merma)", String(d.totales.alertas), d.totales.alertas > 0],
    ["Costo del último mes", S(d.totales.costoMes), false],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([k, v, alerta]) => (
          <div key={k} className={cn("rounded-xl border-l-4 bg-white/95 p-3 shadow-sm", alerta ? "border-tema-acento" : "border-tema-sec")}>
            <p className="text-[11px] font-bold uppercase text-tema-sec">{k}</p>
            <p className={cn("mt-1 text-[20px] font-bold", alerta ? "text-tema-tinta" : "text-tema-texto")}>{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Costo unitario promedio por tipo de equipo">
          <div className="h-64 p-2">
            {d.tipos.length ? (
              <ResponsiveContainer>
                <BarChart data={d.tipos} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="tipo" tick={{ fontSize: 10, fill: "var(--text)" }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => S(v)} />
                  <Bar dataKey="promedio" name="Promedio" fill="var(--secundario)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="maximo" name="Máximo" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-[13px]">Sin datos.</p>
            )}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Tendencia mensual (real vs estimado)">
          <div className="h-64 p-2">
            {d.tendencia.length ? (
              <ResponsiveContainer>
                <LineChart data={d.tendencia} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "var(--text)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--text)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => S(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total" name="Real" stroke="var(--accent)" strokeWidth={2.5} dot />
                  <Line type="monotone" dataKey="estimado" name="Estimado" stroke="var(--secundario)" strokeWidth={2} strokeDasharray="5 4" dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-[13px]">Sin datos.</p>
            )}
          </div>
        </Tarjeta>
      </div>
      <Tarjeta titulo="Equipos con mayor sobrecosto (real vs estimado)" tono="vino">
        {d.sobrecosto.length === 0 ? (
          <p className="py-8 text-center text-[13px]">Ningún equipo supera su costo estimado.</p>
        ) : (
          <Tabla head={["OP", "Equipo", "Estimado", "Real", "Sobrecosto", "Margen", "Estado"]}>
            {d.sobrecosto.map((x) => (
              <tr key={x.hoja.id} className="cursor-pointer hover:bg-tema-borde/35" onClick={() => onAbrir(x.hoja.id)}>
                <Celda className="font-bold">{referenciaHoja(x.hoja)}</Celda>
                <Celda>{x.hoja.tipo_equipo}</Celda>
                <Celda className="whitespace-nowrap">{S(x.estimado)}</Celda>
                <Celda className="whitespace-nowrap">{S(x.real)}</Celda>
                <Celda className="whitespace-nowrap font-bold text-tema-tinta">
                  +{S(x.soles)} (+{pct(x.pct)})
                </Celda>
                <Celda>{pct(x.margen)}</Celda>
                <Celda>
                  <EstadoChip estado={x.hoja.estado} />
                </Celda>
              </tr>
            ))}
          </Tabla>
        )}
      </Tarjeta>
      <Tarjeta titulo="Detalle por tipo de equipo">
        <Tabla head={["Tipo de equipo", "Hojas", "Promedio", "Mínimo", "Máximo"]}>
          {d.tipos.map((x) => (
            <tr key={x.tipo}>
              <Celda className="font-semibold">{x.tipo}</Celda>
              <Celda>{x.hojas}</Celda>
              <Celda className="whitespace-nowrap">{S(x.promedio)}</Celda>
              <Celda className="whitespace-nowrap text-tema-sec">{S(x.minimo)}</Celda>
              <Celda className="whitespace-nowrap text-tema-tinta">{S(x.maximo)}</Celda>
            </tr>
          ))}
        </Tabla>
      </Tarjeta>
    </div>
  );
}

function Parametros({ config, edita }: { config: ConfigCosto; edita: boolean }) {
  const [c, setC] = useState(config);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => setC(config), [config]);
  const campos: [keyof ConfigCosto, string, "pct" | "num", string][] = [
    ["margen_minimo", "Margen mínimo", "pct", "Por debajo: COSTO ELEVADO, Gerencia aprueba con motivo"],
    ["margen_deseado", "Margen deseado (por defecto)", "pct", "Para el precio de venta sugerido"],
    ["merma_maxima", "Merma máxima", "pct", "Por encima: justificación y plan de mejora"],
    ["alza_material", "Alerta de alza de material", "pct", "vs la compra anterior del mismo material"],
    ["tarifa_kwh", "Tarifa de energía (S/ por kWh)", "num", "Del recibo de luz de la planta"],
    ["horas_jornada", "Horas de la jornada", "num", "Costo hora = sueldo diario ÷ jornada"],
    ["horas_maquina_mes", "Horas de uso de máquina al mes", "num", "Depreciación por hora = mensual ÷ horas"],
    ["cargas_sociales", "Recargo de cargas sociales", "pct", "Ej. 9 % EsSalud (0 = solo sueldo)"],
  ];
  const guardar = async () => {
    setOcupado(true);
    try {
      await guardarConfig(c, motivo);
      setMotivo("");
      toast("Parámetros guardados (quedan en la bitácora).");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Tarjeta titulo="Parámetros del costeo" accion={!edita ? <span className="text-[11px]">Solo lectura · los cambia Soporte o Finanzas</span> : null}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {campos.map(([k, txt, tipo, ayuda]) => (
          <Etiqueta key={k} texto={txt} ayuda={ayuda}>
            <Entrada
              type="number"
              step={tipo === "pct" ? "0.5" : "0.01"}
              disabled={!edita}
              value={tipo === "pct" ? Math.round(Number(c[k]) * 1000) / 10 : Number(c[k])}
              onChange={(e) => setC({ ...c, [k]: tipo === "pct" ? Number(e.target.value) / 100 : Number(e.target.value) })}
            />
          </Etiqueta>
        ))}
      </div>
      {edita && (
        <div className="flex flex-wrap items-end gap-2 border-t border-tema-borde p-4">
          <Etiqueta texto="Motivo del cambio (obligatorio)" className="min-w-[240px] flex-1">
            <Area rows={1} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Recibo SEAL noviembre 2026" />
          </Etiqueta>
          <Boton variante="acero" onClick={() => void guardar()} disabled={ocupado || motivo.trim().length < 10}>
            <ShieldCheck size={15} /> Guardar parámetros
          </Boton>
        </div>
      )}
      {config.updated_by && (
        <p className="px-4 pb-3 text-[11px] text-tema-sec">
          Último cambio: {config.updated_by} · {config.updated_at ? new Date(config.updated_at).toLocaleString("es-PE", { timeZone: "America/Lima" }) : ""}
        </p>
      )}
    </Tarjeta>
  );
}
