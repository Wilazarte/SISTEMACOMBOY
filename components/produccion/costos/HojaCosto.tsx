"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, FileDown, History, Lightbulb, Lock, Plus, RefreshCw, Save, Search, Send, ShieldCheck, Snowflake, Trash2, XCircle } from "lucide-react";
import { Modal, cn, toast } from "@/components/ui";
import { FirmaPad } from "@/components/FirmaPad";
import { useSesion } from "@/lib/auth";
import { perfilPlanta } from "@/lib/permisosPlanta";
import {
  EDITABLE,
  EQUIPOS_A_FABRICAR,
  NOMBRE_MODELO,
  NOMBRE_SECCION,
  NOMBRE_SUBTIPO,
  S,
  aBorrador,
  alertas as calcularAlertas,
  anularLinea,
  calcular,
  catalogoMaquinas,
  catalogoStock,
  catalogoTrabajadores,
  comparar,
  flujo,
  guardarBorrador,
  pct,
  ranking,
  sincronizar,
  subtotalLinea,
  sugerencia,
  recargarCostos,
  type AccionFlujo,
  type CabeceraBorrador,
  type CostosHoja,
  type EstadoCostos,
  type HojaCosto as Hoja,
  type LineaBorrador,
  type MaquinaCosto,
  type Seccion,
  type StockCatalogo,
  type TrabajadorCosto,
} from "@/lib/costoProduccion";
import { fichaCostoPDF } from "@/lib/pdfCostoProduccion";
import { UNIDADES } from "@/lib/empresa";
import { ACERO, Alerta, Area, Boton, Celda, Entrada, EstadoChip, Etiqueta, Lista, Tabla, Tarjeta, VINO, pinta } from "./piezas";
import { HistorialCostos } from "./HistorialCostos";

const nuevaKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`);
const n = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(",", ".")));

const PASOS: { estado: string[]; texto: string }[] = [
  { estado: ["BORRADOR", "RECHAZADO"], texto: "Operario registra" },
  { estado: ["EN_REVISION"], texto: "Jefe de Producción revisa" },
  { estado: ["REVISADO"], texto: "Tesorería valida" },
  { estado: ["VALIDADO"], texto: "Gerencia aprueba" },
  { estado: ["APROBADO", "CERRADO"], texto: "Cierre de OP" },
];

function cabeceraDe(h: Hoja, c?: CostosHoja): CabeceraBorrador {
  return {
    cliente_proyecto: h.cliente_proyecto ?? "",
    responsable: h.responsable ?? "",
    fecha_inicio: h.fecha_inicio ?? "",
    fecha_fin_estimada: h.fecha_fin_estimada ?? "",
    cantidad: Number(h.cantidad),
    tipo_equipo: h.tipo_equipo,
    modelo: h.modelo ?? "",
    margen_deseado: c?.margen_deseado ?? 0.3,
    precio_venta: c?.precio_venta ?? 0,
    merma_pct: c?.merma_pct ?? 0,
    justificacion_merma: c?.justificacion_merma ?? "",
    plan_mejora: c?.plan_mejora ?? "",
  };
}

/** Formulario de la hoja de costo de UN equipo: 4 secciones con totales en vivo, versiones, auditoría y flujo de aprobación. */
export function HojaCosto({ hoja, datos, onVolver }: { hoja: Hoja; datos: EstadoCostos; onVolver: () => void }) {
  const { sesion } = useSesion();
  const perfil = perfilPlanta(sesion);
  const costos = datos.costos.get(hoja.id);
  const itemsBase = useMemo(() => datos.items.filter((i) => i.orden_id === hoja.id), [datos.items, hoja.id]);
  const [cab, setCab] = useState<CabeceraBorrador>(() => cabeceraDe(hoja, costos));
  const [lineas, setLineas] = useState<LineaBorrador[]>(() => itemsBase.filter((i) => i.estado === "ACTIVO").map(aBorrador));
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [dialogo, setDialogo] = useState<{ accion: AccionFlujo | "ANULAR_LINEA"; titulo: string; lineaId?: string; firma?: boolean; motivoMin: number; aviso?: string } | null>(null);
  const [trabajadores, setTrabajadores] = useState<TrabajadorCosto[]>([]);
  const [maquinas, setMaquinas] = useState<MaquinaCosto[]>([]);

  const editable = !!sesion && !sesion.soloLectura && (perfil === "produccion" || perfil === "soporte") && EDITABLE.includes(hoja.estado);
  const versiones = datos.versiones.filter((v) => v.orden_id === hoja.id);
  const tieneEstimado = versiones.some((v) => v.mayor >= 1);
  const anuladas = itemsBase.filter((i) => i.estado === "ANULADO");

  // Si nadie está escribiendo, la hoja sigue a la base (otro usuario guardó o Almacén actualizó un costo)
  useEffect(() => {
    if (sucio) return;
    setCab(cabeceraDe(hoja, costos));
    setLineas(itemsBase.filter((i) => i.estado === "ACTIVO").map(aBorrador));
  }, [hoja, costos, itemsBase, sucio]);

  // Al abrir: trae los costos actuales de Almacén / Planilla / Activos (queda en la bitácora) y los catálogos
  useEffect(() => {
    if (EDITABLE.includes(hoja.estado))
      void sincronizar(hoja.id)
        .then((c) => {
          if (c > 0) {
            toast(`${c} costo(s) actualizado(s) automáticamente desde Almacén / Planilla. Ver historial.`);
            void recargarCostos();
          }
        })
        .catch(() => undefined);
    void catalogoTrabajadores().then(setTrabajadores).catch(() => undefined);
    void catalogoMaquinas().then(setMaquinas).catch(() => undefined);
  }, [hoja.id, hoja.estado]);

  const d = { cantidad: cab.cantidad, merma_pct: cab.merma_pct, margen_deseado: cab.margen_deseado, precio_venta: cab.precio_venta, margen_minimo: costos?.margen_minimo ?? datos.config.margen_minimo, merma_maxima: costos?.merma_maxima ?? datos.config.merma_maxima };
  const t = calcular(lineas, d);
  const avisos = calcularAlertas(lineas, t, d, datos.precios, datos.config);
  const top = ranking(lineas, t);
  const sug = sugerencia(hoja, lineas, t, datos);
  const comp = comparar(hoja, t.costo_unitario, datos);

  const cambiarCab = <K extends keyof CabeceraBorrador>(k: K, v: CabeceraBorrador[K]) => {
    setCab((c) => ({ ...c, [k]: v }));
    setSucio(true);
  };
  const cambiarLinea = (key: string, cambio: Partial<LineaBorrador>) => {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambio } : l)));
    setSucio(true);
  };
  const agregar = (l: Omit<LineaBorrador, "key">) => {
    setLineas((ls) => [...ls, { ...l, key: nuevaKey(), estado: "ACTIVO" }]);
    setSucio(true);
  };
  const quitarNueva = (key: string) => {
    setLineas((ls) => ls.filter((l) => l.key !== key));
    setSucio(true);
  };

  const guardar = async () => {
    setOcupado(true);
    try {
      const r = await guardarBorrador(hoja.id, cab, lineas);
      setSucio(false);
      toast(r.cambios ? `Guardado: ${r.cambios} cambio(s) en la bitácora · versión v${r.version}` : "Sin cambios: no se creó versión nueva.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  const ejecutarFlujo = async (accion: AccionFlujo | "ANULAR_LINEA", motivo: string, firma?: string, lineaId?: string) => {
    setOcupado(true);
    try {
      if (sucio && accion !== "ANULAR_LINEA" && editable) {
        await guardarBorrador(hoja.id, cab, lineas);
        setSucio(false);
      }
      if (accion === "ANULAR_LINEA" && lineaId) {
        const r = await anularLinea(lineaId, motivo);
        toast(`Línea anulada con motivo · versión v${r.version}`);
      } else {
        const r = await flujo(hoja.id, accion as AccionFlujo, motivo || undefined, firma);
        toast(accion === "FIJAR_ESTIMADO" ? `Costo estimado fijado: v${r.version}` : `Hoja ${r.estado.replace("_", " ")}${r.version ? ` · v${r.version}` : ""}`);
      }
      setDialogo(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };

  const pdf = async () => {
    if (!costos) return;
    if (sucio) return toast("Guarde el borrador antes de exportar: la ficha muestra la última versión guardada.", "error");
    try {
      await fichaCostoPDF(hoja, costos, itemsBase);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // Aprobación según etapa y perfil (la base vuelve a validar perfil y segregación de funciones)
  const etapa = hoja.estado === "EN_REVISION" ? "Jefe de Producción" : hoja.estado === "REVISADO" ? "Tesorería" : hoja.estado === "VALIDADO" ? "Gerencia" : null;
  const puedeAprobar =
    !!sesion &&
    ((hoja.estado === "EN_REVISION" && (perfil === "produccion" || perfil === "soporte")) ||
      (hoja.estado === "REVISADO" && (perfil === "finanzas" || perfil === "soporte")) ||
      (hoja.estado === "VALIDADO" && (perfil === "gerencia" || perfil === "soporte")));
  const puedeCerrar = hoja.estado === "APROBADO" && (perfil === "produccion" || perfil === "soporte" || perfil === "gerencia");
  const pasoActual = PASOS.findIndex((p) => p.estado.includes(hoja.estado));

  const filas = (s: Seccion) => lineas.filter((l) => l.seccion === s);
  // Hoja por MODELO (Williams 2026-11-17): costo general de UNA unidad del modelo, calculado desde cero
  const porModelo = hoja.origen === "MODELO";

  return (
    <div className="space-y-4">
      {/* Cabecera de la OP */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Boton variante="borde" onClick={onVolver} aria-label="Volver a la lista">
            <ArrowLeft size={15} /> Volver
          </Boton>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-tema-sec">
              {hoja.codigo} · versión v{costos?.version_actual ?? "—"}
            </p>
            <h2 className="break-words text-[18px] font-bold text-tema-texto">
              {porModelo ? `Ficha de costo por modelo · ${NOMBRE_MODELO[hoja.orden_produccion_id] ?? hoja.orden_produccion_id}` : `${hoja.orden_produccion_id} · ${hoja.tipo_equipo}`}
              {!porModelo && hoja.modelo ? ` ${hoja.modelo}` : ""}
            </h2>
          </div>
        </div>
        <EstadoChip estado={hoja.estado} />
      </div>

      {/* Flujo de aprobación */}
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {PASOS.map((p, i) => {
          const hecho = hoja.estado !== "ANULADO" && hoja.estado !== "RECHAZADO" && i < pasoActual;
          const actual = i === pasoActual;
          return (
            <li
              key={p.texto}
              className="rounded-md px-2 py-1.5 text-center text-[11px] font-bold uppercase"
              style={hecho || hoja.estado === "CERRADO" ? pinta(ACERO) : actual ? pinta(VINO) : pinta("rgba(255,255,255,0.7)", "rgba(17,33,45,0.6)")}
            >
              {hecho || hoja.estado === "CERRADO" ? "✓ " : ""}
              {p.texto}
            </li>
          );
        })}
      </ol>
      {hoja.estado === "RECHAZADO" && hoja.motivo_estado && <Alerta icono={<XCircle size={15} />}>Rechazado: {hoja.motivo_estado}. Corrija y vuelva a enviar.</Alerta>}
      {!editable && EDITABLE.includes(hoja.estado) === false && hoja.estado !== "ANULADO" && (
        <Alerta tono="acero" icono={<Lock size={15} />}>
          Hoja {hoja.estado === "CERRADO" ? "cerrada" : "enviada"}: no se puede editar. {etapa ? `Esperando aprobación de ${etapa}.` : ""}
        </Alerta>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* Datos generales */}
          <Tarjeta titulo="Datos generales">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Etiqueta texto={porModelo ? "Modelo de equipo" : "Código Orden (auto)"}>
                <Entrada value={porModelo ? NOMBRE_MODELO[hoja.orden_produccion_id] ?? hoja.orden_produccion_id : hoja.orden_produccion_id} disabled />
              </Etiqueta>
              <Etiqueta texto="Equipo a fabricar">
                <Lista value={cab.tipo_equipo} disabled={!editable || porModelo} onChange={(e) => cambiarCab("tipo_equipo", e.target.value)}>
                  {Array.from(new Set([cab.tipo_equipo, ...EQUIPOS_A_FABRICAR])).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </Lista>
              </Etiqueta>
              <Etiqueta texto="Modelo">
                <Entrada value={cab.modelo} disabled={!editable} onChange={(e) => cambiarCab("modelo", e.target.value.toUpperCase())} />
              </Etiqueta>
              <Etiqueta texto="Cantidad">
                <Entrada type="number" min={1} step="1" value={cab.cantidad} disabled={!editable} onChange={(e) => cambiarCab("cantidad", Math.max(0, n(e.target.value)))} />
              </Etiqueta>
              <Etiqueta texto="Cliente / Proyecto" className="sm:col-span-2">
                <Entrada value={cab.cliente_proyecto} disabled={!editable} onChange={(e) => cambiarCab("cliente_proyecto", e.target.value)} />
              </Etiqueta>
              <Etiqueta texto="Responsable de Producción" className="sm:col-span-2">
                <Entrada value={cab.responsable} disabled={!editable} onChange={(e) => cambiarCab("responsable", e.target.value)} />
              </Etiqueta>
              <Etiqueta texto="Fecha inicio">
                <Entrada type="date" value={cab.fecha_inicio} disabled={!editable} onChange={(e) => cambiarCab("fecha_inicio", e.target.value)} />
              </Etiqueta>
              <Etiqueta texto="Fecha fin estimada">
                <Entrada type="date" value={cab.fecha_fin_estimada} disabled={!editable} onChange={(e) => cambiarCab("fecha_fin_estimada", e.target.value)} />
              </Etiqueta>
              <Etiqueta texto="Precio de venta unitario (sin IGV)">
                <Entrada type="number" min={0} step="0.01" value={cab.precio_venta || ""} disabled={!editable} onChange={(e) => cambiarCab("precio_venta", n(e.target.value))} />
              </Etiqueta>
              <Etiqueta texto="Margen deseado %">
                <Entrada type="number" min={0} max={95} step="0.5" value={Math.round(cab.margen_deseado * 1000) / 10} disabled={!editable} onChange={(e) => cambiarCab("margen_deseado", n(e.target.value) / 100)} />
              </Etiqueta>
            </div>
          </Tarjeta>

          {/* Alertas e inteligencia */}
          {(avisos.length > 0 || sug) && (
            <div className="space-y-2">
              {avisos.map((a, i) => (
                <Alerta key={i} icono={<AlertTriangle size={15} />}>
                  <span className={a.tipo === "MARGEN" ? "font-bold" : ""}>{a.texto}</span>
                </Alerta>
              ))}
              {sug && (
                <Alerta tono="acero" icono={<Lightbulb size={15} />}>
                  {sug.texto}
                  {editable && sug.linea && (
                    <button
                      className="ml-2 rounded px-2 py-0.5 text-[11px] font-bold"
                      style={pinta(ACERO)}
                      onClick={() =>
                        cambiarLinea(sug.linea!.key, {
                          costo_unitario: sug.linea!.costoOtro,
                          proveedor: sug.linea!.proveedor,
                          motivo_manual: `Proveedor alternativo ${sug.linea!.proveedor ?? ""} según ${sug.hoja.orden_produccion_id} (${S(sug.linea!.costoOtro)})`.trim(),
                        })
                      }
                    >
                      Aplicar
                    </button>
                  )}
                </Alerta>
              )}
            </div>
          )}

          {/* A) MATERIALES */}
          <SeccionMateriales desdeCero={porModelo} lineas={filas("MATERIAL")} editable={editable} total={t.materiales} onCambio={cambiarLinea} onAgregar={agregar} onQuitar={quitarNueva} onAnular={(l) => setDialogo({ accion: "ANULAR_LINEA", lineaId: l, titulo: "Anular línea de costo", motivoMin: 10 })} avisos={avisos} />

          {/* B) MANO DE OBRA */}
          <Tarjeta titulo={NOMBRE_SECCION.MANO_OBRA} accion={<span className="text-[13px] font-bold">{S(t.mano_obra)}</span>}>
            <Tabla head={["Trabajador", "Horas trabajadas", "Costo por hora (planilla)", "Subtotal", ""]}>
              {filas("MANO_OBRA").map((l) => (
                <tr key={l.key}>
                  <Celda className="font-semibold">{l.descripcion}</Celda>
                  <Celda>
                    <Entrada type="number" min={0} step="0.5" className="w-24" value={l.cantidad} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { cantidad: n(e.target.value) })} />
                  </Celda>
                  <Celda className="whitespace-nowrap">
                    {S(l.costo_unitario)} <span className="text-[11px] text-tema-sec">· no editable</span>
                  </Celda>
                  <Celda className="whitespace-nowrap font-bold">{S(subtotalLinea(l))}</Celda>
                  <Celda>{editable && <BotonQuitar l={l} onQuitar={quitarNueva} onAnular={(id) => setDialogo({ accion: "ANULAR_LINEA", lineaId: id, titulo: "Anular línea de costo", motivoMin: 10 })} />}</Celda>
                </tr>
              ))}
            </Tabla>
            {editable && (
              <div className="flex flex-wrap items-end gap-2 border-t border-tema-borde p-3">
                <Etiqueta texto="Agregar trabajador (de la planilla)" className="min-w-[220px] flex-1">
                  <Lista
                    value=""
                    onChange={(e) => {
                      const tr = trabajadores.find((x) => x.id === e.target.value);
                      if (tr) agregar({ seccion: "MANO_OBRA", trabajador_id: tr.id, descripcion: tr.nombre, codigo: tr.id, unidad: "HORA", cantidad: 8, costo_unitario: tr.costo_hora, costo_origen: tr.costo_hora, origen_costo: "PLANILLA" });
                    }}
                  >
                    <option value="">Seleccione…</option>
                    {trabajadores.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre} · {x.cargo} · {S(x.costo_hora)}/h
                      </option>
                    ))}
                  </Lista>
                </Etiqueta>
              </div>
            )}
          </Tarjeta>

          {/* C) CIF */}
          <Tarjeta titulo={NOMBRE_SECCION.CIF} accion={<span className="text-[13px] font-bold">{S(t.cif)}</span>}>
            <Tabla head={["Concepto", "Detalle", "Cálculo", "Subtotal", ""]}>
              {filas("CIF").map((l) => (
                <tr key={l.key}>
                  <Celda className="font-semibold">{NOMBRE_SUBTIPO[l.subtipo ?? "OTROS"]}</Celda>
                  <Celda>
                    {l.subtipo === "MANTENIMIENTO" || l.subtipo === "OTROS" ? (
                      <div className="space-y-1">
                        <Entrada value={l.descripcion} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { descripcion: e.target.value })} />
                        {l.subtipo === "OTROS" && (
                          <Entrada placeholder="Justificación (obligatoria)" className={cn((l.justificacion ?? "").trim().length < 10 && "border-tema-acento")} value={l.justificacion ?? ""} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { justificacion: e.target.value })} />
                        )}
                      </div>
                    ) : (
                      l.descripcion
                    )}
                  </Celda>
                  <Celda>
                    {l.subtipo === "ENERGIA" ? (
                      <div className="flex flex-wrap items-center gap-1 text-[12px]">
                        <Entrada type="number" min={0} step="0.5" className="w-20" value={l.cantidad} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { cantidad: n(e.target.value) })} /> h ×
                        <Entrada type="number" min={0} step="0.1" className="w-20" value={l.potencia_kw ?? ""} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { potencia_kw: n(e.target.value) })} /> kW × {S(l.costo_unitario)}/kWh
                      </div>
                    ) : l.subtipo === "DEPRECIACION" ? (
                      <div className="flex flex-wrap items-center gap-1 text-[12px]">
                        <Entrada type="number" min={0} step="0.5" className="w-20" value={l.cantidad} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { cantidad: n(e.target.value) })} /> h-máq × {S(l.costo_unitario)}/h
                      </div>
                    ) : (
                      <Entrada type="number" min={0} step="0.01" className="w-28" value={l.costo_unitario} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { costo_unitario: n(e.target.value), cantidad: 1 })} />
                    )}
                  </Celda>
                  <Celda className="whitespace-nowrap font-bold">{S(subtotalLinea(l))}</Celda>
                  <Celda>{editable && <BotonQuitar l={l} onQuitar={quitarNueva} onAnular={(id) => setDialogo({ accion: "ANULAR_LINEA", lineaId: id, titulo: "Anular línea de costo", motivoMin: 10 })} />}</Celda>
                </tr>
              ))}
            </Tabla>
            {editable && (
              <div className="grid gap-2 border-t border-tema-borde p-3 sm:grid-cols-2 lg:grid-cols-4">
                <Etiqueta texto="+ Energía (máquina)" ayuda={datos.config.tarifa_kwh > 0 ? `Tarifa ${S(datos.config.tarifa_kwh)}/kWh` : <span className="text-tema-tinta">Falta tarifa kWh en Parámetros</span>}>
                  <Lista
                    value=""
                    disabled={datos.config.tarifa_kwh <= 0}
                    onChange={(e) => {
                      const m = maquinas.find((x) => x.id === e.target.value);
                      agregar({ seccion: "CIF", subtipo: "ENERGIA", activo_id: m?.id ?? null, descripcion: `Energía ${m?.nombre ?? "máquina"}`, cantidad: 0, potencia_kw: 0, costo_unitario: datos.config.tarifa_kwh, costo_origen: datos.config.tarifa_kwh, origen_costo: "CONFIG" });
                    }}
                  >
                    <option value="">Seleccione máquina…</option>
                    <option value="_">Otra máquina</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo} · {m.nombre}
                      </option>
                    ))}
                  </Lista>
                </Etiqueta>
                <Etiqueta texto="+ Depreciación (automática)" ayuda="De Finanzas › Activos">
                  <Lista
                    value=""
                    onChange={(e) => {
                      const m = maquinas.find((x) => x.id === e.target.value);
                      if (m) agregar({ seccion: "CIF", subtipo: "DEPRECIACION", activo_id: m.id, codigo: m.codigo, descripcion: `Depreciación ${m.nombre}`, cantidad: 0, costo_unitario: m.dep_hora, costo_origen: m.dep_hora, origen_costo: "ACTIVO" });
                    }}
                  >
                    <option value="">Seleccione máquina…</option>
                    {maquinas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo} · {m.nombre} · {S(m.dep_hora)}/h
                      </option>
                    ))}
                  </Lista>
                </Etiqueta>
                <div className="flex items-end">
                  <Boton variante="borde" className="w-full" onClick={() => agregar({ seccion: "CIF", subtipo: "MANTENIMIENTO", descripcion: "Mantenimiento", cantidad: 1, costo_unitario: 0, origen_costo: "MANUAL" })}>
                    <Plus size={14} /> Mantenimiento
                  </Boton>
                </div>
                <div className="flex items-end">
                  <Boton variante="borde" className="w-full" onClick={() => agregar({ seccion: "CIF", subtipo: "OTROS", descripcion: "Otros indirectos", cantidad: 1, costo_unitario: 0, origen_costo: "MANUAL" })}>
                    <Plus size={14} /> Otros indirectos
                  </Boton>
                </div>
              </div>
            )}
          </Tarjeta>

          {/* D) ADICIONALES */}
          <Tarjeta titulo={NOMBRE_SECCION.ADICIONAL} accion={<span className="text-[13px] font-bold">{S(t.adicionales)}</span>} tono={t.alerta_merma ? "vino" : "noche"}>
            <Tabla head={["Concepto", "Descripción", "Proveedor", "Monto", ""]}>
              {filas("ADICIONAL").map((l) => (
                <tr key={l.key}>
                  <Celda className="font-semibold">{NOMBRE_SUBTIPO[l.subtipo ?? "TERCERIZACION"]}</Celda>
                  <Celda>
                    <Entrada value={l.descripcion} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { descripcion: e.target.value })} />
                  </Celda>
                  <Celda>
                    <Entrada value={l.proveedor ?? ""} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { proveedor: e.target.value })} />
                  </Celda>
                  <Celda>
                    <Entrada type="number" min={0} step="0.01" className="w-28" value={l.costo_unitario} disabled={!editable} onChange={(e) => cambiarLinea(l.key, { costo_unitario: n(e.target.value), cantidad: 1 })} />
                  </Celda>
                  <Celda>{editable && <BotonQuitar l={l} onQuitar={quitarNueva} onAnular={(id) => setDialogo({ accion: "ANULAR_LINEA", lineaId: id, titulo: "Anular línea de costo", motivoMin: 10 })} />}</Celda>
                </tr>
              ))}
              <tr>
                <Celda className="font-semibold">Merma / Desperdicio</Celda>
                <Celda>
                  <span className="text-[12px]">% sobre materiales ({S(t.materiales)})</span>
                </Celda>
                <Celda>
                  <div className="flex items-center gap-1">
                    <Entrada type="number" min={0} max={95} step="0.1" className={cn("w-24", t.alerta_merma && "border-tema-acento text-tema-tinta")} value={Math.round(cab.merma_pct * 1000) / 10} disabled={!editable} onChange={(e) => cambiarCab("merma_pct", n(e.target.value) / 100)} />%
                  </div>
                </Celda>
                <Celda className={cn("whitespace-nowrap font-bold", t.alerta_merma && "text-tema-tinta")}>{S(t.merma_monto)}</Celda>
                <Celda />
              </tr>
            </Tabla>
            {t.alerta_merma && (
              <div className="grid gap-2 border-t border-tema-acento/30 p-3 sm:grid-cols-2">
                <Etiqueta texto="Justificación de la merma (obligatoria)">
                  <Area className={cn(cab.justificacion_merma.trim().length < 15 && "border-tema-acento")} value={cab.justificacion_merma} disabled={!editable} onChange={(e) => cambiarCab("justificacion_merma", e.target.value)} />
                </Etiqueta>
                <Etiqueta texto="Plan de mejora (bloquea el cierre sin él)">
                  <Area className={cn(cab.plan_mejora.trim().length < 20 && "border-tema-acento")} value={cab.plan_mejora} disabled={!editable} onChange={(e) => cambiarCab("plan_mejora", e.target.value)} />
                </Etiqueta>
              </div>
            )}
            {editable && (
              <div className="flex flex-wrap gap-2 border-t border-tema-borde p-3">
                <Boton variante="borde" onClick={() => agregar({ seccion: "ADICIONAL", subtipo: "TRANSPORTE", descripcion: "Transporte / Flete", cantidad: 1, costo_unitario: 0, origen_costo: "MANUAL" })}>
                  <Plus size={14} /> Transporte / Flete
                </Boton>
                <Boton variante="borde" onClick={() => agregar({ seccion: "ADICIONAL", subtipo: "TERCERIZACION", descripcion: "Servicio externo", cantidad: 1, costo_unitario: 0, origen_costo: "MANUAL" })}>
                  <Plus size={14} /> Tercerización / Servicio externo
                </Boton>
              </div>
            )}
          </Tarjeta>

          {anuladas.length > 0 && (
            <Tarjeta titulo={`Líneas anuladas (${anuladas.length}) · quedan en auditoría`}>
              <Tabla head={["Sección", "Descripción", "Subtotal", "Anulado por", "Motivo"]}>
                {anuladas.map((a) => (
                  <tr key={a.id} className="text-tema-texto/70">
                    <Celda>{NOMBRE_SECCION[a.seccion].slice(3)}</Celda>
                    <Celda className="line-through">{a.descripcion}</Celda>
                    <Celda className="whitespace-nowrap line-through">{S(a.subtotal)}</Celda>
                    <Celda>{a.anulado_usuario}</Celda>
                    <Celda className="text-tema-tinta">{a.motivo_anulacion}</Celda>
                  </tr>
                ))}
              </Tabla>
            </Tarjeta>
          )}
        </div>

        {/* Totales en vivo */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Tarjeta titulo="Cálculo automático" tono={t.alerta_margen ? "vino" : "acero"} accion={sucio ? <span className="rounded bg-white/20 px-1.5 text-[10px] font-bold">SIN GUARDAR</span> : null}>
            <dl className="divide-y divide-tema-borde px-4 py-2 text-[13px]">
              {[
                ["Materiales", t.materiales],
                ["Mano de obra", t.mano_obra],
                ["CIF", t.cif],
                ["Adicionales (incl. merma)", t.adicionales],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2 py-1.5">
                  <dt>{k}</dt>
                  <dd className="font-semibold">{S(v as number)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-2 py-2 text-[15px] font-bold">
                <dt>Costo total</dt>
                <dd>{S(t.costo_total)}</dd>
              </div>
              <div className="flex justify-between gap-2 py-1.5">
                <dt>Costo unitario (÷ {cab.cantidad || 1})</dt>
                <dd className="font-bold">{S(t.costo_unitario)}</dd>
              </div>
              <div className="flex justify-between gap-2 py-1.5">
                <dt>Precio sugerido ({pct(cab.margen_deseado, 0)})</dt>
                <dd className="font-semibold text-tema-sec">{S(t.precio_sugerido)}</dd>
              </div>
              <div className="flex justify-between gap-2 py-1.5">
                <dt>Precio de venta</dt>
                <dd className="font-semibold">{cab.precio_venta > 0 ? S(cab.precio_venta) : "—"}</dd>
              </div>
              <div className={cn("flex justify-between gap-2 py-2 text-[15px] font-bold", t.alerta_margen ? "text-tema-tinta" : "text-tema-sec")}>
                <dt>Margen real</dt>
                <dd>{pct(t.margen_real)}</dd>
              </div>
            </dl>
            {t.alerta_margen && <div className="px-3 py-2 text-center text-[12px] font-bold uppercase" style={pinta(VINO)}>Costo elevado - requiere aprobación de Gerencia</div>}
            <p className="px-4 pb-3 pt-1 text-[11px] text-tema-texto/70">Total = Materiales + Mano de obra + CIF + Adicionales. Precio sugerido = Costo unitario ÷ (1 − margen deseado). Margen real = (Precio − Costo unitario) ÷ Precio. Lo calcula y guarda la base de datos.</p>
          </Tarjeta>

          <Tarjeta titulo="Comparador (por unidad)">
            <dl className="space-y-1.5 px-4 py-3 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt>Estimado v1.0</dt>
                <dd className="font-semibold">{comp.estimado ? S(comp.estimado) : "Sin fijar"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Real (en vivo)</dt>
                <dd className="font-semibold">{S(comp.real)}</dd>
              </div>
              {comp.vsEstimado && (
                <div className={cn("flex justify-between gap-2 font-bold", comp.vsEstimado.soles > 0 ? "text-tema-tinta" : "text-tema-sec")}>
                  <dt>Desviación vs estimado</dt>
                  <dd>
                    {comp.vsEstimado.soles > 0 ? "+" : ""}
                    {S(comp.vsEstimado.soles)} ({comp.vsEstimado.soles > 0 ? "+" : ""}
                    {pct(comp.vsEstimado.pct)})
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-2 border-t border-tema-borde pt-1.5">
                <dt>Equipo anterior {comp.anterior ? `(${comp.anterior.hoja.orden_produccion_id})` : ""}</dt>
                <dd className="font-semibold">{comp.anterior ? S(comp.anterior.costo) : "—"}</dd>
              </div>
              {comp.vsAnterior && (
                <div className={cn("flex justify-between gap-2 font-bold", comp.vsAnterior.soles > 0 ? "text-tema-tinta" : "text-tema-sec")}>
                  <dt>Desviación vs anterior</dt>
                  <dd>
                    {comp.vsAnterior.soles > 0 ? "+" : ""}
                    {S(comp.vsAnterior.soles)} ({comp.vsAnterior.soles > 0 ? "+" : ""}
                    {pct(comp.vsAnterior.pct)})
                  </dd>
                </div>
              )}
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Top 5 que más encarecen">
            <ol className="space-y-2 px-4 py-3 text-[12.5px]">
              {top.length === 0 && <li className="text-tema-texto/60">Sin costos cargados.</li>}
              {top.map((r, i) => (
                <li key={i}>
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">
                      {i + 1}. {r.descripcion}
                    </span>
                    <span className="shrink-0">{S(r.subtotal)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded bg-tema-borde">
                    <div className={cn("h-1.5 rounded", i === 0 ? "bg-tema-acento" : "bg-tema-sec")} style={{ width: `${Math.min(100, r.peso * 100)}%` }} />
                  </div>
                  <span className="text-[10.5px] text-tema-sec">{pct(r.peso)} del costo</span>
                </li>
              ))}
            </ol>
          </Tarjeta>
        </aside>
      </div>

      {/* Botones */}
      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl border border-tema-texto/15 bg-white/95 p-2.5 shadow-lg backdrop-blur" data-sin-guardar={!editable || undefined}>
        {editable && (
          <Boton onClick={guardar} disabled={ocupado} data-guardar-pestana>
            <Save size={15} /> Guardar Borrador
          </Boton>
        )}
        {editable && !tieneEstimado && (
          <Boton variante="acero" disabled={ocupado} onClick={() => setDialogo({ accion: "FIJAR_ESTIMADO", titulo: "Fijar costo estimado v1.0", motivoMin: 0, aviso: "El estimado queda congelado: desde ahora cada cambio crea versiones v1.x (Real en proceso) y se compara contra él." })}>
            <Snowflake size={15} /> Fijar estimado v1.0
          </Boton>
        )}
        {editable && (
          <Boton variante="vino" disabled={ocupado} onClick={() => setDialogo({ accion: "ENVIAR", titulo: "Enviar a aprobación", motivoMin: 0, aviso: "Pasa a revisión del Jefe de Producción y se bloquea la edición." })}>
            <Send size={15} /> Enviar a Aprobación
          </Boton>
        )}
        {puedeAprobar && (
          <>
            <Boton
              variante="acero"
              disabled={ocupado}
              onClick={() =>
                setDialogo({
                  accion: "APROBAR",
                  titulo: `Aprobar como ${etapa}`,
                  firma: hoja.estado === "VALIDADO",
                  motivoMin: hoja.estado === "VALIDADO" && costos?.alerta_margen ? 15 : 0,
                  aviso: hoja.estado === "VALIDADO" && costos?.alerta_margen ? `COSTO ELEVADO: margen real ${pct(costos.margen_real)} < mínimo ${pct(costos.margen_minimo, 0)}. Escriba el motivo de la aprobación.` : undefined,
                })
              }
            >
              <CheckCircle2 size={15} /> Aprobar ({etapa})
            </Boton>
            <Boton variante="borde" disabled={ocupado} onClick={() => setDialogo({ accion: "RECHAZAR", titulo: `Rechazar (${etapa})`, motivoMin: 10 })}>
              <XCircle size={15} /> Rechazar
            </Boton>
          </>
        )}
        {puedeCerrar && (
          <Boton variante="acero" disabled={ocupado} onClick={() => setDialogo({ accion: "CERRAR", titulo: "Cerrar orden de producción", motivoMin: 0, aviso: "Cierra la hoja con el costo final v2.0 aprobado por Gerencia." })}>
            <Lock size={15} /> Cerrar OP
          </Boton>
        )}
        <Boton variante="borde" onClick={() => setHistorial(true)}>
          <History size={15} /> Ver Historial de Costos
        </Boton>
        <Boton variante="borde" onClick={pdf} disabled={!costos}>
          <FileDown size={15} /> Exportar Ficha Homologada PDF
        </Boton>
        {editable && (
          <Boton
            variante="borde"
            disabled={ocupado}
            onClick={() =>
              void sincronizar(hoja.id).then((c) => {
                toast(c ? `${c} costo(s) actualizado(s) desde Almacén / Planilla` : "Los costos ya están al día.");
                void recargarCostos();
              })
            }
          >
            <RefreshCw size={15} /> Actualizar costos
          </Boton>
        )}
        {(perfil === "produccion" || perfil === "soporte") && !["CERRADO", "ANULADO"].includes(hoja.estado) && (
          <Boton variante="borde" className="text-tema-tinta" disabled={ocupado} onClick={() => setDialogo({ accion: "ANULAR", titulo: "Anular hoja de costo", motivoMin: 10, aviso: "No se borra: queda ANULADA con su motivo en la auditoría." })}>
            <Ban size={15} /> Anular hoja
          </Boton>
        )}
      </div>

      {dialogo && <DialogoMotivo d={dialogo} ocupado={ocupado} onCerrar={() => setDialogo(null)} onConfirmar={(m, f) => void ejecutarFlujo(dialogo.accion, m, f, dialogo.lineaId)} />}
      {historial && <HistorialCostos hoja={hoja} datos={datos} onCerrar={() => setHistorial(false)} />}
    </div>
  );
}

function BotonQuitar({ l, onQuitar, onAnular }: { l: LineaBorrador; onQuitar: (k: string) => void; onAnular: (id: string) => void }) {
  return l.id ? (
    <button title="Anular con motivo (no existe eliminar)" className="rounded p-1 text-tema-tinta hover:bg-tema-acento/10" onClick={() => onAnular(l.id!)}>
      <Ban size={15} />
    </button>
  ) : (
    <button title="Quitar (aún no se guardó)" className="rounded p-1 text-tema-sec hover:bg-tema-sec/10" onClick={() => onQuitar(l.key)}>
      <Trash2 size={15} />
    </button>
  );
}

function SeccionMateriales({
  desdeCero,
  lineas,
  editable,
  total,
  onCambio,
  onAgregar,
  onQuitar,
  onAnular,
  avisos,
}: {
  desdeCero: boolean;
  lineas: LineaBorrador[];
  editable: boolean;
  total: number;
  onCambio: (k: string, c: Partial<LineaBorrador>) => void;
  onAgregar: (l: Omit<LineaBorrador, "key">) => void;
  onQuitar: (k: string) => void;
  onAnular: (id: string) => void;
  avisos: ReturnType<typeof calcularAlertas>;
}) {
  // Hoja por modelo: los materiales escritos a mano van en una lista ancha (material, unidad, cantidad, costo)
  const libres = desdeCero ? lineas.filter((l) => l.origen_costo === "MANUAL") : [];
  const enTabla = desdeCero ? lineas.filter((l) => l.origen_costo !== "MANUAL") : lineas;
  const [q, setQ] = useState("");
  const [res, setRes] = useState<StockCatalogo[]>([]);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) return setRes([]);
    t.current = setTimeout(() => void catalogoStock(q.trim()).then(setRes).catch(() => setRes([])), 250);
  }, [q]);

  return (
    <Tarjeta titulo={NOMBRE_SECCION.MATERIAL} accion={<span className="text-[13px] font-bold">{S(total)}</span>}>
      {desdeCero && lineas.length === 0 && (
        <p className="px-4 pt-3 text-[12.5px] text-tema-sec">Ficha vacía: toque «Agregar material» y escriba el material, la unidad, la cantidad por equipo y el costo unitario.</p>
      )}
      {desdeCero && libres.length > 0 && (
        <div className="divide-y divide-tema-borde">
          <p className="bg-tema-borde/60 px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-tema-texto">Material · unidad · cantidad por equipo · costo unitario S/ · subtotal</p>
          {libres.map((l, idx) => (
            <div key={l.key} className="grid grid-cols-3 items-center gap-2 px-3 py-2.5 sm:grid-cols-[96px_96px_120px_minmax(0,1fr)_32px]">
              <Entrada className="col-span-3 font-semibold sm:col-span-5" title={l.descripcion} placeholder={`${idx + 1}. Ej. Plancha LAC 3/16`} value={l.descripcion} disabled={!editable} onChange={(e) => onCambio(l.key, { descripcion: e.target.value.toUpperCase() })} />
              <Lista className="px-1" aria-label="Unidad" value={l.unidad ?? "UND"} disabled={!editable} onChange={(e) => onCambio(l.key, { unidad: e.target.value })}>
                {Array.from(new Set([l.unidad ?? "UND", ...UNIDADES])).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Lista>
              <Entrada type="number" min={0} step="0.01" aria-label="Cantidad" className="px-2" value={l.cantidad} disabled={!editable} onChange={(e) => onCambio(l.key, { cantidad: n(e.target.value) })} />
              <Entrada type="number" min={0} step="0.01" aria-label="Costo unitario" className="px-2" value={l.costo_unitario} disabled={!editable} onChange={(e) => onCambio(l.key, { costo_unitario: n(e.target.value) })} />
              <span className="col-span-2 whitespace-nowrap text-[13px] font-bold sm:col-span-1 sm:text-right">{S(subtotalLinea(l))}</span>
              <span className="text-right">{editable && <BotonQuitar l={l} onQuitar={onQuitar} onAnular={onAnular} />}</span>
            </div>
          ))}
        </div>
      )}
      {enTabla.length > 0 && (
      <Tabla head={["Código", "Descripción", "Cantidad", "Costo unitario (Almacén)", "Subtotal", ""]}>
        {enTabla.map((l) => {
          const cambiado = l.origen_costo === "ALMACEN" && l.costo_origen !== null && l.costo_origen !== undefined && Math.abs(l.costo_unitario - l.costo_origen) > 0.00005;
          const sinAlmacen = l.origen_costo === "MANUAL";
          const pideMotivo = editable && !desdeCero && (cambiado || sinAlmacen) && (l.motivo_manual ?? "").trim().length < 10;
          const alza = avisos.some((a) => a.tipo === "ALZA_MATERIAL" && a.lineaKey === l.key);
          return (
            <tr key={l.key} className={cn(alza && "bg-tema-acento/[0.05]")}>
              <Celda className="whitespace-nowrap text-[12px]">{l.codigo ?? "—"}</Celda>
              <Celda>
                <p className="font-semibold">{sinAlmacen && editable ? <Entrada value={l.descripcion} onChange={(e) => onCambio(l.key, { descripcion: e.target.value })} /> : l.descripcion}</p>
                <p className="text-[11px] text-tema-sec">
                  {[l.requerimiento_id, l.proveedor, sinAlmacen ? "Fuera de Almacén" : null].filter(Boolean).join(" · ")}
                  {alza && <span className="ml-1 font-bold text-tema-tinta">▲ subió</span>}
                </p>
              </Celda>
              <Celda>
                <Entrada type="number" min={0} step="0.01" className="w-24" value={l.cantidad} disabled={!editable} onChange={(e) => onCambio(l.key, { cantidad: n(e.target.value) })} />
              </Celda>
              <Celda>
                <Entrada type="number" min={0} step="0.01" className={cn("w-28", (cambiado || sinAlmacen) && "border-tema-acento text-tema-tinta")} value={l.costo_unitario} disabled={!editable} onChange={(e) => onCambio(l.key, { costo_unitario: n(e.target.value) })} />
                {cambiado && <p className="mt-0.5 text-[10.5px] text-tema-tinta">Almacén: {S(l.costo_origen)}</p>}
                {(cambiado || sinAlmacen) && (
                  <Entrada
                    placeholder="MOTIVO obligatorio (queda en auditoría)"
                    className={cn("mt-1 min-w-[180px] text-[12px]", pideMotivo && "border-tema-acento")}
                    value={l.motivo_manual ?? ""}
                    disabled={!editable}
                    onChange={(e) => onCambio(l.key, { motivo_manual: e.target.value })}
                  />
                )}
              </Celda>
              <Celda className="whitespace-nowrap font-bold">{S(subtotalLinea(l))}</Celda>
              <Celda>{editable && <BotonQuitar l={l} onQuitar={onQuitar} onAnular={onAnular} />}</Celda>
            </tr>
          );
        })}
      </Tabla>
      )}
      {editable && (
        <div className="space-y-2 border-t border-tema-borde p-3">
          {desdeCero && (
            <Boton onClick={() => onAgregar({ seccion: "MATERIAL", descripcion: "", unidad: "UND", cantidad: 1, costo_unitario: 0, origen_costo: "MANUAL" })}>
              <Plus size={15} /> Agregar material
            </Boton>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Etiqueta texto={desdeCero ? "O tomar un material de Almacén (opcional)" : "Agregar material de Almacén (código o nombre)"} className="min-w-[220px] flex-1">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-tema-sec" />
                <Entrada className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. plancha, MP-0012…" />
              </div>
            </Etiqueta>
            {!desdeCero && (
              <Boton variante="borde" onClick={() => onAgregar({ seccion: "MATERIAL", descripcion: "Material fuera de almacén", cantidad: 1, costo_unitario: 0, origen_costo: "MANUAL", motivo_manual: "" })}>
                <Plus size={14} /> Fuera de Almacén
              </Boton>
            )}
          </div>
          {res.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-tema-borde bg-white">
              {res.map((s) => (
                <li key={s.id}>
                  <button
                    className="flex w-full flex-wrap justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-tema-borde/40"
                    onClick={() => {
                      onAgregar({ seccion: "MATERIAL", stock_id: s.id, codigo: s.sku, descripcion: s.nombre, unidad: s.unidad, cantidad: 1, costo_unitario: s.costo, costo_origen: s.costo, origen_costo: "ALMACEN" });
                      setQ("");
                    }}
                  >
                    <span className="font-semibold">
                      {s.sku ? `${s.sku} · ` : ""}
                      {s.nombre}
                    </span>
                    <span className="text-tema-sec">
                      {s.sede} · stock {s.cantidad} {s.unidad} · {S(s.costo)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function DialogoMotivo({
  d,
  ocupado,
  onCerrar,
  onConfirmar,
}: {
  d: { accion: string; titulo: string; firma?: boolean; motivoMin: number; aviso?: string };
  ocupado: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string, firma?: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [firma, setFirma] = useState<string | undefined>();
  const falta = motivo.trim().length < d.motivoMin || (d.firma && !firma);
  return (
    <Modal open onClose={onCerrar} title={d.titulo}>
      <div className="space-y-3">
        {d.aviso && <Alerta icono={<ShieldCheck size={15} />}>{d.aviso}</Alerta>}
        <Etiqueta texto={d.motivoMin ? `Motivo (obligatorio, mínimo ${d.motivoMin} caracteres)` : "Comentario (opcional)"}>
          <Area rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Etiqueta>
        {d.firma && <FirmaPad titulo="Firma de Gerencia" archivo="firma-gerencia.png" onChange={(f) => setFirma(f?.url)} />}
        <p className="text-[11px] text-tema-sec">Queda en la bitácora con su usuario, fecha y hora, IP y hash SHA-256.</p>
        <div className="flex justify-end gap-2">
          <Boton variante="borde" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante={d.accion === "RECHAZAR" || d.accion === "ANULAR" || d.accion === "ANULAR_LINEA" ? "vino" : "acero"} disabled={!!falta || ocupado} onClick={() => onConfirmar(motivo.trim(), firma)}>
            Confirmar
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
