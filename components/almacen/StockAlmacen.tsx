"use client";

import { useMemo, useState } from "react";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { productoNormalizado, sedeNormalizada } from "@/lib/constantes";
import { FileDown, FileSpreadsheet, History, PackageMinus, Truck, Upload } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { SEDES_STOCK, SEDE_REPUESTOS } from "@/lib/empresa";
import { AUTORIZA_DEFECTO, ETIQUETA_KARDEX, ETIQUETA_MOTIVO, MOTIVOS_RETIRO, errorChasis, kardexDe, requiereChasis, retiroProduccion, textoChasis, type MotivoRetiro } from "@/lib/inventario";
import { prepararSaldos, type PlanSaldos } from "@/lib/reglasStock";
import { KEYS, importarSaldosStock, soles, useStore } from "@/lib/storage";
import { normalizarChasis } from "@/lib/utils/chasis";
import type { EquipoTerminado } from "@/lib/equipos";
import type { OrdenProduccion } from "@/lib/produccion";
import type { MovimientoKardex, StockItem } from "@/lib/types";

const fechaCorta = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");
const fechaHora = (iso: string) => (iso ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const num = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const FILTROS_SEDE = ["", SEDE_REPUESTOS, "Oficina Lima"];

/**
 * STOCK DE ALMACÉN: Sede | Producto | Unidad | Cantidad | Último costo | Valorizado | Actualizado | Acciones
 * Acciones por fila: Ver Kardex · Retiro Producción (VPI) · Retiro Despacho (va a Órdenes de despacho).
 */
export function StockAlmacen({ stock, puedeOperar, onIrDespacho }: { stock: StockItem[]; puedeOperar: boolean; onIrDespacho: () => void }) {
  const [sede, setSede] = useState("");
  const [q, setQ] = useState("");
  const [soloSinValor, setSoloSinValor] = useState(false);
  const [kardexDe_, setKardexDe] = useState<StockItem | null>(null);
  const [retiroDe, setRetiroDe] = useState<StockItem | null>(null);
  const [importar, setImportar] = useState(false);
  // Agrupa el mismo producto en sedes que son el mismo lugar (SEDE_MAP) y escrito distinto: 15 + 7 = 22
  const [agrupar, setAgrupar] = useState(true);
  const mismaSede = (a: string, b: string) => (agrupar ? sedeNormalizada(a) === sedeNormalizada(b) : a === b);

  const lista = stock
    .filter((s) => (!sede || mismaSede(s.sede, sede)) && (!q || s.nombre.toLowerCase().includes(q.toLowerCase())) && (!soloSinValor || !(s.costoUnit > 0)))
    .sort((a, b) => a.sede.localeCompare(b.sede) || a.nombre.localeCompare(b.nombre));
  const filas = useMemo(() => {
    if (!agrupar) return lista.map((s) => ({ s, partes: [s], valor: s.cantidad * s.costoUnit, base: s }));
    const grupos = new Map<string, StockItem[]>();
    for (const s of lista) {
      const k = `${sedeNormalizada(s.sede)}|${productoNormalizado(s.nombre)}|${s.unidad}`;
      grupos.set(k, [...(grupos.get(k) ?? []), s]);
    }
    return Array.from(grupos.values())
      .map((partes) => {
        // Las acciones (kardex, retiros) van sobre el registro con más stock; el costo, el más reciente
        const mayor = [...partes].sort((a, b) => b.cantidad - a.cantidad)[0];
        const reciente = [...partes].sort((a, b) => b.actualizado.localeCompare(a.actualizado))[0];
        const s: StockItem = { ...mayor, sede: sedeNormalizada(mayor.sede), cantidad: partes.reduce((a, p) => a + p.cantidad, 0), costoUnit: reciente.costoUnit, actualizado: reciente.actualizado };
        return { s, partes, valor: partes.reduce((a, p) => a + p.cantidad * p.costoUnit, 0), base: mayor };
      })
      .sort((a, b) => a.s.sede.localeCompare(b.s.sede) || a.s.nombre.localeCompare(b.s.nombre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock, sede, q, soloSinValor, agrupar]);
  const valorizado = filas.reduce((a, f) => a + f.valor, 0);
  const sinValor = filas.filter((f) => !(f.s.costoUnit > 0)).length;
  const duplicados = filas.filter((f) => f.partes.length > 1).length;

  return (
    <Card>
      <CardHeader
        title="Stock de almacén"
        subtitle={`${filas.length} producto(s)${agrupar && duplicados ? ` (${duplicados} agrupados)` : ""} · Valorizado ${soles(valorizado)}${sinValor ? ` · ${sinValor} sin valorizar` : ""} (último costo: sin IGV en factura/OC, con IGV en boleta)`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="w-48">
              <Input placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="w-48">
              <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Todas las sedes" options={SEDES_STOCK.map((s) => ({ value: s, label: s }))} />
            </div>
            {puedeOperar && (
              <Button variant="secondary" onClick={() => setImportar(true)} title="Importar saldos desde Excel (Nombre Único | Ubicación | Ctd)">
                <Upload size={16} /> Importar saldos
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-plomo-500">Sede:</span>
        {FILTROS_SEDE.map((s) => (
          <button
            key={s || "todas"}
            type="button"
            data-sede={s || "todas"}
            onClick={() => setSede(s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
              sede === s ? "border-azul-900 bg-azul-900 text-white" : "border-plomo-200 bg-surface text-plomo-600 hover:border-azul-900"
            )}
          >
            {s || "Todas"} <span className="opacity-70">{s ? stock.filter((x) => mismaSede(x.sede, s)).length : stock.length}</span>
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-plomo-600" title="Suma el mismo producto de Taller Principal Aqp y Almacen Aqp (AQP Principal)">
          <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-4 w-4 accent-azul-900" /> Agrupar duplicados
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-amber-800">
          <input type="checkbox" checked={soloSinValor} onChange={(e) => setSoloSinValor(e.target.checked)} className="h-4 w-4 accent-amber-500" /> Solo sin valorizar
        </label>
      </div>
      {/* Actualizado | Producto | Sede y unidad | Cantidad | Acciones. Costo y valorizado: al pasar el mouse sobre la cantidad y en el Kardex. */}
      <ListaDocs
        tipo="inventario"
        filas={filas.map(
          ({ s, partes, valor, base }): FilaDoc => ({
            id: s.id,
            fecha: s.actualizado,
            contraparte: s.nombre,
            ref: (
              <>
                <span className="font-medium text-fg">{s.sede}</span>
                <span className="ml-1.5 text-xs text-plomo-500">{s.unidad}</span>
                {partes.length > 1 && (
                  <span className="tip ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" data-tip={partes.map((p) => `${p.sede}: ${num(p.cantidad)}`).join(" + ")}>
                    {partes.length} registros
                  </span>
                )}
                {!(s.costoUnit > 0) && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" data-sin-valorizar>
                    Sin valorizar
                  </span>
                )}
              </>
            ),
            total: (
              <span className={cn(s.cantidad <= 0 && "text-red-600")} title={s.costoUnit > 0 ? `Último costo ${soles(s.costoUnit)} · valorizado ${soles(valor)}` : "Sin valorizar"}>
                {num(s.cantidad)}
              </span>
            ),
            buscar: `${s.sede} ${s.unidad} ${partes.map((p) => p.sede).join(" ")}`,
            tipoDoc: s.unidad,
            estado: s.costoUnit > 0 ? "VALORIZADO" : "SIN_VALORIZAR",
            acciones: (
                  <div className="flex flex-nowrap gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setKardexDe(base)} title={partes.length > 1 ? `Kardex de ${base.sede} (registro con más stock)` : "Ver Kardex"}>
                      <History size={14} /> Kardex
                    </Button>
                    {puedeOperar && (
                      <>
                        <Button size="sm" onClick={() => setRetiroDe(base)} disabled={base.cantidad <= 0} title={partes.length > 1 ? `Retiro desde ${base.sede} (${num(base.cantidad)} disponibles)` : "Retiro para producción (Vale de Producción Interno)"}>
                          <PackageMinus size={14} /> Retiro Producción
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            toast(`Retiro por venta de ${s.nombre}: se descuenta al despachar la Orden de Despacho (SALIDA-VENTA).`);
                            onIrDespacho();
                          }}
                          title="Retiro para despacho (venta): se hace desde la Orden de Despacho"
                        >
                          <Truck size={14} /> Retiro Despacho
                        </Button>
                      </>
                    )}
                  </div>
            ),
          })
        )}
      />

      {kardexDe_ && <KardexModal item={stock.find((x) => x.id === kardexDe_.id) ?? kardexDe_} onClose={() => setKardexDe(null)} />}
      {retiroDe && <RetiroProduccionModal item={stock.find((x) => x.id === retiroDe.id) ?? retiroDe} onClose={() => setRetiroDe(null)} />}
      {importar && <ImportarSaldosModal onClose={() => setImportar(false)} />}
    </Card>
  );
}

/** Kardex: Fecha | Tipo | Documento | Chasis | Cantidad | Saldo | Usuario */
function KardexModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const kardex = useStore<MovimientoKardex[]>(KEYS.KARDEX, []);
  const movs = kardexDe(item, kardex);
  const color: Record<string, string> = {
    INGRESO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    SALDO_INICIAL: "bg-plomo-100 text-plomo-600 ring-plomo-200",
    "SALIDA-VENTA": "bg-blue-50 text-blue-800 ring-blue-200",
    "SALIDA-PRODUCCION": "bg-red-50 text-red-700 ring-red-200",
    TRANSFERENCIA: "bg-amber-50 text-amber-800 ring-amber-200",
    AJUSTE: "bg-plomo-100 text-plomo-600 ring-plomo-200",
  };
  return (
    <Modal open onClose={onClose} title={`Kardex · ${item.nombre}`} wide>
      <p className="mb-3 text-sm text-plomo-600">
        {item.sede} · {item.unidad} · saldo actual <b className="text-fg">{num(item.cantidad)}</b>
      </p>
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-plomo-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-azul-900 text-left text-[10px] uppercase tracking-widest text-white">
            <tr>
              {["Fecha", "Tipo", "Documento", "Chasis", "Cantidad", "Saldo", "Usuario"].map((h) => (
                <th key={h} className={cn("px-2.5 py-2", (h === "Cantidad" || h === "Saldo") && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id} data-kardex={m.tipo_movimiento} className="border-t border-plomo-100">
                <td className="whitespace-nowrap px-2.5 py-1.5">{fechaHora(m.fecha)}</td>
                <td className="px-2.5 py-1.5">
                  <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset", color[m.tipo_movimiento])}>{ETIQUETA_KARDEX[m.tipo_movimiento]}</span>
                </td>
                <td className="break-all px-2.5 py-1.5 font-mono">{m.documento}</td>
                <td className={cn("px-2.5 py-1.5", m.tipo_movimiento === "SALIDA-PRODUCCION" ? (m.chasis ? "font-mono font-semibold text-fg" : "text-[10px] font-semibold text-amber-700") : "font-mono")}>
                  {m.tipo_movimiento === "SALIDA-PRODUCCION" ? textoChasis(m.chasis) : m.chasis || "-"}
                </td>
                <td className={cn("px-2.5 py-1.5 text-right font-semibold", m.cantidad < 0 ? "text-red-600" : "text-emerald-700")}>
                  {m.cantidad > 0 ? "+" : ""}
                  {num(m.cantidad)}
                </td>
                <td className="px-2.5 py-1.5 text-right font-semibold">{num(m.saldo)}</td>
                <td className="px-2.5 py-1.5">{m.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {movs.length === 0 && <p className="mt-2 text-xs text-plomo-500">Sin movimientos registrados todavía (el kardex empieza con este cambio).</p>}
    </Modal>
  );
}

/** Retiro para producción: Vale de Producción Interno (VPI-000001), sin OD ni guía. */
function RetiroProduccionModal({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []);
  const sesion = getSesion();
  const [cantidad, setCantidad] = useState("1");
  const [chasis, setChasis] = useState("");
  const [motivo, setMotivo] = useState<MotivoRetiro>("PRODUCCION - PLUS 4000");
  const [solicitante, setSolicitante] = useState(sesion?.nombre ?? "");
  const [autoriza, setAutoriza] = useState(AUTORIZA_DEFECTO);
  const [enviando, setEnviando] = useState(false);
  // Chasis / OT conocidos: órdenes de producción (en fabricación primero) y equipos terminados
  const opciones = useMemo(
    () => [
      ...ops.filter((o) => o.estado !== "ANULADA").sort((a, b) => Number(a.estado !== "EN_FABRICACION") - Number(b.estado !== "EN_FABRICACION")).flatMap((o) => [
        { valor: o.codigo_chasis, etiqueta: `${o.id} · ${o.modelo} (${o.estado === "EN_FABRICACION" ? "en fabricación" : "QC aprobado"})`, op: o.id, eq: o.equipo_id ?? null },
        { valor: o.id, etiqueta: `${o.codigo_chasis} · ${o.modelo}`, op: o.id, eq: o.equipo_id ?? null },
      ]),
      ...equipos.filter((e) => !ops.some((o) => o.equipo_id === e.id)).map((e) => ({ valor: e.codigo_chasis, etiqueta: `${e.id} · ${e.modelo} (${e.estado})`, op: e.op_id ?? null, eq: e.id })),
    ],
    [ops, equipos]
  );
  const vinculo = opciones.find((o) => normalizarChasis(o.valor) === normalizarChasis(chasis));
  const n = Number(cantidad);
  const excede = n > item.cantidad;

  const guardar = async () => {
    setEnviando(true);
    try {
      const r = await retiroProduccion(
        { producto_id: item.id, cantidad_a_retirar: n, chasis_ot: chasis.trim() || null, motivo, solicitante, autoriza, op_id: chasis.trim() ? vinculo?.op ?? null : null, equipo_id: chasis.trim() ? vinculo?.eq ?? null : null },
        item.cantidad
      );
      toast(`${r.vpi}: ${num(n)} ${item.unidad} de ${item.nombre} para ${chasis.trim() ? chasis.toUpperCase() : `${motivo} (consumo general)`} · saldo ${num(r.saldo)}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo registrar el retiro.", "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={() => !enviando && onClose()} title={`Retiro para producción · ${item.nombre}`} wide>
      <div className="space-y-4 text-sm">
        <p className="text-plomo-600">
          Consumo interno: genera un <b>Vale de Producción Interno (VPI)</b>, descuenta el stock y queda en el kardex como <b>SALIDA-PRODUCCION</b>: con chasis va al costo del equipo; sin chasis, a CONSUMO GENERAL de taller. No genera Orden de
          Despacho ni Guía de Remisión.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Producto">
            <Input value={`${item.nombre} (${item.unidad})`} readOnly className="bg-plomo-50" />
          </Field>
          <Field label={`Cantidad a retirar * (disponible ${num(item.cantidad)})`}>
            <Input type="number" min={0} step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={cn(excede && "border-red-400")} />
            {excede && <span className="mt-1 block text-xs font-semibold text-red-600">Stock insuficiente: hay {num(item.cantidad)}.</span>}
          </Field>
          <Field label={requiereChasis(motivo) ? "Chasis / OT *" : "Chasis / OT (opcional)"}>
            <Input value={chasis} list="chasis-ot" onChange={(e) => setChasis(e.target.value.toUpperCase())} placeholder="Ej: PLUS-2026-008" className="font-mono" />
            <datalist id="chasis-ot">
              {opciones.map((o) => (
                <option key={o.valor + o.etiqueta} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </datalist>
            {!chasis.trim() && (
              <span className={cn("mt-1 block text-xs", requiereChasis(motivo) ? "font-semibold text-red-600" : "text-plomo-500")}>
                {requiereChasis(motivo) ? errorChasis(motivo, chasis) : "Sin chasis: va a CONSUMO GENERAL (gasto de taller)."}
              </span>
            )}
            {chasis && (
              <span className={cn("mt-1 block text-xs", vinculo ? "text-emerald-700" : "text-amber-700")}>
                {vinculo ? `Vinculado a ${vinculo.etiqueta}` : "No está en Producción / Equipos: se registra igual con este código."}
              </span>
            )}
          </Field>
          <Field label="Motivo *">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRetiro)} options={MOTIVOS_RETIRO.map((m) => ({ value: m, label: ETIQUETA_MOTIVO[m] }))} />
          </Field>
          <Field label="Solicitante *">
            <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
          </Field>
          <Field label="Autoriza *">
            <Input value={autoriza} onChange={(e) => setAutoriza(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={enviando || !(n > 0) || excede || !!errorChasis(motivo, chasis) || !solicitante.trim() || !autoriza.trim()}>
            <PackageMinus size={16} /> {enviando ? "Registrando…" : "Registrar retiro (VPI)"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Importar saldos desde Excel (Nombre Único | Ubicación | Ctd): vista previa + log, luego importa. */
function ImportarSaldosModal({ onClose }: { onClose: () => void }) {
  const [plan, setPlan] = useState<PlanSaldos | null>(null);
  const [archivo, setArchivo] = useState("");
  const [verTodo, setVerTodo] = useState(false);

  const leer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      setPlan(prepararSaldos(filas));
      setArchivo(file.name);
    } catch {
      toast("No se pudo leer el Excel.", "error");
    }
  };
  const descargarLog = () => {
    if (!plan) return;
    const txt = [
      `Importación de saldos · ${archivo} · ${new Date().toLocaleString("es-PE")}`,
      `Filas: ${plan.resumen.filas} · Productos: ${plan.resumen.productos} · Con stock: ${plan.resumen.conStock} · En 0: ${plan.resumen.enCero} · Avisos: ${plan.resumen.avisos} · Errores: ${plan.resumen.errores}`,
      `Unidades: ${Object.entries(plan.resumen.unidades).map(([u, n]) => `${u} ${n}`).join(" · ")}`,
      "",
      ...plan.log.map((l) => `Fila ${l.fila}\t${l.nivel}\t${l.producto}\t${l.mensaje}`),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/plain;charset=utf-8" }));
    a.download = `log_import_stock_${archivo.replace(/\.[^.]+$/, "")}.txt`;
    a.click();
  };
  const importar = () => {
    if (!plan) return;
    let r = { nuevos: 0, actualizados: 0 };
    const ok = ejecutar(() => {
      r = importarSaldosStock(plan.productos, `IMPORT ${archivo}`);
    }, `Saldos importados: ${plan.productos.length} producto(s)`);
    if (ok) {
      toast(`${r.nuevos} nuevo(s) · ${r.actualizados} actualizado(s) (cantidad sumada) · costo 0 = "Sin valorizar"`);
      onClose();
    }
  };
  const lineas = plan ? (verTodo ? plan.log : plan.log.filter((l) => l.nivel !== "OK")) : [];

  return (
    <Modal open onClose={onClose} title="Importar saldos de almacén (Excel)" wide>
      <div className="space-y-4 text-sm">
        <p className="text-plomo-600">
          Columnas: <b>Nombre Único | Ubicación | Ctd</b>. ALMACEN → <b>{SEDE_REPUESTOS}</b>. Unidad: la del nombre (“| UNIDAD”, “| ROLLO”, “| PAR”); ACEITE → LT; BALDE / LÍQUIDO /
          SILICONA / AFLOJATODO → UND; resto → PZA. Costo 0 (se valoriza después con los Ingresos por V°B°). Si el producto ya existe en la sede, se suma la cantidad.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-corp px-4 py-2.5 text-sm font-semibold text-white hover:bg-vino-900">
          <FileSpreadsheet size={16} /> {plan ? "Elegir otro archivo" : "Elegir Excel"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={leer} />
        </label>
        {plan && (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-plomo-200 bg-plomo-50 p-3 md:grid-cols-4" data-resumen-import>
              <span>
                Archivo: <b>{archivo}</b>
              </span>
              <span>
                Productos: <b>{plan.resumen.productos}</b> de {plan.resumen.filas} filas
              </span>
              <span>
                Con stock: <b>{plan.resumen.conStock}</b> · en 0: <b>{plan.resumen.enCero}</b>
              </span>
              <span>
                Avisos: <b>{plan.resumen.avisos}</b> · Errores: <b className={plan.resumen.errores ? "text-red-600" : ""}>{plan.resumen.errores}</b>
              </span>
              <span className="col-span-2 md:col-span-4">
                Unidades:{" "}
                {Object.entries(plan.resumen.unidades)
                  .map(([u, n]) => `${u} ${n}`)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={verTodo} onChange={(e) => setVerTodo(e.target.checked)} /> Ver log completo ({plan.log.length} líneas)
              </label>
              <Button size="sm" variant="ghost" onClick={descargarLog}>
                <FileDown size={14} /> Descargar log
              </Button>
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-xl border border-plomo-200">
              <table className="w-full text-xs">
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i} className={cn("border-b border-plomo-100", l.nivel === "ERROR" ? "bg-red-50" : l.nivel === "AVISO" ? "bg-amber-50" : "")}>
                      <td className="px-2 py-1 text-plomo-500">Fila {l.fila}</td>
                      <td className="px-2 py-1 font-semibold">{l.nivel}</td>
                      <td className="px-2 py-1">{l.producto}</td>
                      <td className="px-2 py-1">{l.mensaje}</td>
                    </tr>
                  ))}
                  {lineas.length === 0 && (
                    <tr>
                      <td className="px-2 py-3 text-center text-emerald-700">Sin avisos ni errores.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={!plan || plan.productos.length === 0}>
            <Upload size={16} /> Importar {plan ? plan.productos.length : ""} producto(s)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
