"use client";

import { useMemo, useState } from "react";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { productoNormalizado, sedeNormalizada } from "@/lib/constantes";
import { FileDown, FileSpreadsheet, FileText, History, PackageMinus, Truck, Upload } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, cn, ejecutar, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { SEDES_STOCK, SEDE_REPUESTOS } from "@/lib/empresa";
import { AUTORIZA_DEFECTO, ETIQUETA_KARDEX, ETIQUETA_MOTIVO, MOTIVOS_RETIRO, errorChasis, kardexDe, requiereChasis, retiroProduccion, textoChasis, type MotivoRetiro } from "@/lib/inventario";
import { prepararSaldos, type PlanSaldos } from "@/lib/reglasStock";
import { KEYS, importarSaldosStock, planReemplazoStock, reemplazarStock, soles, useStore } from "@/lib/storage";
import { normalizarChasis } from "@/lib/utils/chasis";
import { categoriaDe, useCatalogo } from "@/lib/productos";
import { EtiquetaCategoria, FiltroCategoria, contarCategorias, pasaCategoria } from "@/components/productos/Categorias";
import type { EquipoTerminado } from "@/lib/equipos";
import type { OrdenProduccion } from "@/lib/produccion";
import type { MovimientoKardex, StockItem } from "@/lib/types";
import { guardarArchivo, guardarExcel } from "@/lib/guardarArchivo";
import { pdfReporteStock, type FilaStockReporte } from "@/lib/pdf";

const fechaHora = (iso: string) => (iso ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const num = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const FILTROS_SEDE = ["", ...SEDES_STOCK];

/**
 * STOCK DE ALMACÉN: Sede | Producto | Unidad | Cantidad | Último costo | Valorizado | Actualizado | Acciones
 * Acciones por fila: Ver Kardex · Retiro Producción (VPI) · Retiro Despacho (va a Órdenes de despacho).
 */
export function StockAlmacen({ stock, puedeOperar, onIrDespacho }: { stock: StockItem[]; puedeOperar: boolean; onIrDespacho: () => void }) {
  const [sede, setSede] = useState("");
  // Categoría del producto en el catálogo maestro ("" = todas)
  const [cat, setCat] = useState("");
  const { productos: catalogo } = useCatalogo();
  const [soloSinValor, setSoloSinValor] = useState(false);
  const [kardexDe_, setKardexDe] = useState<StockItem | null>(null);
  const [retiroDe, setRetiroDe] = useState<StockItem | null>(null);
  const [importar, setImportar] = useState(false);
  // Agrupa el mismo producto en sedes que son el mismo lugar (SEDE_MAP) y escrito distinto: 15 + 7 = 22
  const [agrupar, setAgrupar] = useState(true);
  const mismaSede = (a: string, b: string) => (agrupar ? sedeNormalizada(a) === sedeNormalizada(b) : a === b);

  const lista = stock
    .filter((s) => (!sede || mismaSede(s.sede, sede)) && (!soloSinValor || !(s.costoUnit > 0)) && pasaCategoria(categoriaDe(s.nombre), cat))
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
  }, [stock, sede, soloSinValor, agrupar, cat, catalogo]);
  const conteoCat = useMemo(() => contarCategorias(stock.filter((s) => !sede || mismaSede(s.sede, sede)).map((s) => categoriaDe(s.nombre))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, sede, agrupar, catalogo]);
  const valorizado = filas.reduce((a, f) => a + f.valor, 0);
  const sinValor = filas.filter((f) => !(f.s.costoUnit > 0)).length;
  const duplicados = filas.filter((f) => f.partes.length > 1).length;
  // Lo que queda tras el buscador del panel "Buscar / Filtrar" (null = aún sin filtrar = todas)
  const [visibles, setVisibles] = useState<{ ids: Set<string>; buscar: string } | null>(null);

  // ---- Exportar stock (Excel / PDF A4) con los mismos filtros de la pantalla ----
  const filasExportar = (): FilaStockReporte[] =>
    filas
      .filter((f) => !visibles || visibles.ids.has(f.s.id))
      .map(({ s, valor }) => ({
        nombre: s.nombre,
        categoria: categoriaDe(s.nombre) || "Sin categoría",
        sede: s.sede,
        unidad: s.unidad,
        cantidad: s.cantidad,
        costoUnit: s.costoUnit > 0 ? s.costoUnit : 0,
        valor: s.costoUnit > 0 ? valor : 0,
        actualizado: s.actualizado,
      }));
  const textoFiltros = () =>
    [
      cat && `Categoría: ${cat}`,
      visibles?.buscar && `Buscar: "${visibles.buscar}"`,
      soloSinValor && "Solo sin valorizar",
      !agrupar && "Sin agrupar duplicados",
    ]
      .filter(Boolean)
      .join(" · ");
  const nombreAlmacen = sede || "Todos los almacenes";
  const hoyIso = () => new Date().toISOString().slice(0, 10);

  const exportarExcel = async () => {
    const datos = filasExportar();
    if (!datos.length) return toast("No hay productos para exportar con estos filtros", "error");
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(
      datos.map((f, i) => ({
        "N°": i + 1,
        Producto: f.nombre,
        Categoría: f.categoria,
        Almacén: f.sede,
        Unidad: f.unidad,
        Cantidad: f.cantidad,
        "Último costo S/": f.costoUnit || "",
        "Valorizado S/": f.costoUnit ? Math.round(f.valor * 100) / 100 : "",
        "Última actualización": f.actualizado ? fechaHora(f.actualizado) : "",
      }))
    );
    hoja["!cols"] = [{ wch: 5 }, { wch: 48 }, { wch: 20 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(libro, hoja, "Stock");
    // Resumen por almacén y categoría
    const resumen = new Map<string, { productos: number; cantidad: number; valor: number }>();
    for (const f of datos) {
      const k = `${f.sede}|${f.categoria}`;
      const r = resumen.get(k) ?? { productos: 0, cantidad: 0, valor: 0 };
      resumen.set(k, { productos: r.productos + 1, cantidad: r.cantidad + f.cantidad, valor: r.valor + f.valor });
    }
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet([
        ...Array.from(resumen.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, r]) => ({ Almacén: k.split("|")[0], Categoría: k.split("|")[1], Productos: r.productos, "Valorizado S/": Math.round(r.valor * 100) / 100 })),
        { Almacén: "TOTAL", Categoría: "", Productos: datos.length, "Valorizado S/": Math.round(datos.reduce((a, f) => a + f.valor, 0) * 100) / 100 },
        {},
        { Almacén: `Emitido: ${new Date().toLocaleString("es-PE")}`, Categoría: textoFiltros() ? `Filtros: ${textoFiltros()}` : "" },
      ]),
      "Resumen"
    );
    await guardarExcel(libro, `Stock-${nombreAlmacen.replace(/\s+/g, "-")}-${hoyIso()}.xlsx`);
  };

  const exportarPDF = () => {
    const datos = filasExportar();
    if (!datos.length) return toast("No hay productos para exportar con estos filtros", "error");
    pdfReporteStock({ filas: datos, filtros: textoFiltros(), almacen: nombreAlmacen });
  };

  return (
    <Card>
      <CardHeader
        title="Stock de almacén"
        subtitle={`${filas.length} producto(s)${agrupar && duplicados ? ` (${duplicados} agrupados)` : ""} · Valorizado ${soles(valorizado)}${sinValor ? ` · ${sinValor} sin valorizar` : ""} (último costo: sin IGV en factura/OC, con IGV en boleta)`}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={exportarPDF} disabled={filas.length === 0} title={`Exportar stock en PDF A4 (${nombreAlmacen}, con los filtros actuales)`} data-exportar-stock="pdf">
              <FileText size={16} /> Exportar PDF
            </Button>
            <Button variant="secondary" onClick={exportarExcel} disabled={filas.length === 0} title={`Exportar stock a Excel (${nombreAlmacen}, con los filtros actuales)`} data-exportar-stock="excel">
              <FileSpreadsheet size={16} /> Exportar Excel
            </Button>
            {puedeOperar && (
              <Button variant="secondary" onClick={() => setImportar(true)} title="Importar Excel: reemplazar todo el stock o sumar saldos">
                <Upload size={16} /> Importar / Reemplazar
              </Button>
            )}
          </div>
        }
      />
      {/* Actualizado | Producto | Sede y unidad | Cantidad | Acciones. Costo y valorizado: al pasar el mouse sobre la cantidad y en el Kardex. */}
      {/* Búsqueda, sede y "sin valorizar": en el panel "Buscar / Filtrar" (oculto por defecto) */}
      <ListaDocs
        tipo="inventario"
        extraActivos={(sede ? 1 : 0) + (soloSinValor ? 1 : 0) + (cat ? 1 : 0)}
        onFiltradas={(ids, buscar) => setVisibles({ ids: new Set(ids), buscar })}
        filtrosExtra={
              <div className="flex w-full flex-wrap items-center gap-2">
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
                <FiltroCategoria value={cat} onChange={setCat} conteo={conteoCat} />
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-plomo-600" title="Suma el mismo producto guardado con nombres viejos de almacén (Almacen Aqp, Adm Aqp, Planta Arequipa -> Taller Principal Aqp)">
                  <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-4 w-4 accent-azul-900" /> Agrupar duplicados
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-amber-800">
                  <input type="checkbox" checked={soloSinValor} onChange={(e) => setSoloSinValor(e.target.checked)} className="h-4 w-4 accent-amber-500" /> Solo sin valorizar
                </label>
              </div>
        }
        filas={filas.map(
          ({ s, partes, valor, base }): FilaDoc => ({
            id: s.id,
            fecha: s.actualizado,
            contraparte: s.nombre,
            ref: (
              <>
                <span className="font-medium text-fg">{s.sede}</span>
                <span className="ml-1.5 text-xs text-plomo-500">{s.unidad}</span>
                <EtiquetaCategoria nombre={categoriaDe(s.nombre)} className="ml-1.5" />
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
            buscar: `${s.sede} ${s.unidad} ${categoriaDe(s.nombre)} ${partes.map((p) => p.sede).join(" ")}`,
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
      {importar && <ImportarSaldosModal onClose={() => setImportar(false)} onRespaldo={exportarExcel} />}
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
                <td className="break-all px-2.5 py-1.5">{m.documento}</td>
                <td className={cn("px-2.5 py-1.5", m.tipo_movimiento === "SALIDA-PRODUCCION" ? (m.chasis ? "font-semibold text-fg" : "text-[10px] font-semibold text-amber-700") : "")}>
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
            <Input value={chasis} list="chasis-ot" onChange={(e) => setChasis(e.target.value.toUpperCase())} placeholder="Ej: PLUS-2026-008" />
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
function ImportarSaldosModal({ onClose, onRespaldo }: { onClose: () => void; onRespaldo: () => Promise<void> }) {
  const [plan, setPlan] = useState<PlanSaldos | null>(null);
  const [archivo, setArchivo] = useState("");
  const [verTodo, setVerTodo] = useState(false);
  // SUMAR = suma al stock actual (saldo inicial) · REEMPLAZAR = el Excel pasa a ser todo el stock
  const [modo, setModo] = useState<"SUMAR" | "REEMPLAZAR">("REEMPLAZAR");
  const [alcance, setAlcance] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verCambios, setVerCambios] = useState(false);
  const reemplazo = useMemo(() => {
    if (!plan || modo !== "REEMPLAZAR") return null;
    try {
      return planReemplazoStock(plan.productos, alcance);
    } catch {
      return null;
    }
  }, [plan, modo, alcance]);

  const leer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      setPlan(prepararSaldos(filas, undefined, { enteros: false }));
      setArchivo(file.name);
      setConfirmar("");
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
      ...(reemplazo
        ? [
            "",
            `REEMPLAZO (${alcance || "todos los almacenes"}): ${reemplazo.aplicar.length} del Excel · ${reemplazo.cambian} cambian · ${reemplazo.nuevos} nuevos · ${reemplazo.aCero.length} quedan en 0 · ${reemplazo.omitidos.length} no están en el catálogo`,
            ...reemplazo.omitidos.map((n) => `NO ESTÁ EN EL CATÁLOGO (no se importa)\t${n}`),
            ...reemplazo.aCero.map((z) => `QUEDA EN 0 (no está en el Excel)\t${z.sede}\t${z.nombre}\t${z.cantidad} ${z.unidad} -> 0`),
            ...reemplazo.aplicar.filter((a) => !a.existente || a.antes !== a.cantidad).map((a) => `${a.existente ? "CAMBIA" : "NUEVO"}\t${a.sede}\t${a.nombre}\t${a.antes} -> ${a.cantidad} ${a.unidad}`),
          ]
        : []),
      "",
      ...plan.log.map((l) => `Fila ${l.fila}\t${l.nivel}\t${l.producto}\t${l.mensaje}`),
    ].join("\n");
    void guardarArchivo(`log_import_stock_${archivo.replace(/\.[^.]+$/, "")}.txt`, new Blob([txt], { type: "text/plain;charset=utf-8" }));
  };
  const importar = () => {
    if (!plan) return;
    if (modo === "REEMPLAZAR") {
      if (!reemplazo) return;
      let r = { cambiados: 0, nuevos: 0, enCero: 0 };
      const ok = ejecutar(() => {
        r = reemplazarStock(reemplazo, `REEMPLAZO ${archivo}`);
      }, `Stock reemplazado desde ${archivo}`);
      if (ok) {
        toast(`${r.cambiados} actualizado(s) · ${r.nuevos} nuevo(s) · ${r.enCero} en 0 (no estaban en el Excel). Cada cambio quedó en el Kardex como Ajuste.`);
        onClose();
      }
      return;
    }
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
  const listoReemplazo = !!reemplazo && reemplazo.aplicar.length > 0 && confirmar.trim().toUpperCase() === "REEMPLAZAR";
  const cambios = reemplazo
    ? [
        ...reemplazo.aCero.map((z) => ({ k: `0-${z.id}`, tipo: "Queda en 0", sede: z.sede, nombre: z.nombre, antes: z.cantidad, despues: 0, unidad: z.unidad })),
        ...reemplazo.aplicar
          .filter((a) => !a.existente || a.antes !== a.cantidad)
          .map((a) => ({ k: `a-${a.sede}-${a.nombre}`, tipo: a.existente ? "Cambia" : "Nuevo", sede: a.sede, nombre: a.nombre, antes: a.antes, despues: a.cantidad, unidad: a.unidad })),
      ]
    : [];

  return (
    <Modal open onClose={onClose} title={modo === "REEMPLAZAR" ? "Reemplazar stock de almacén con Excel" : "Importar saldos de almacén (Excel)"} wide>
      <div className="space-y-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2" data-modo-import>
          {(
            [
              ["REEMPLAZAR", "Reemplazar todo el stock", "El Excel pasa a ser el stock: cada producto queda con la cantidad del archivo y los que no están en el archivo quedan en 0."],
              ["SUMAR", "Sumar al stock actual", "Saldo inicial: la cantidad del Excel se suma a la que ya hay."],
            ] as const
          ).map(([v, t, d]) => (
            <button
              key={v}
              type="button"
              data-modo={v}
              onClick={() => {
                setModo(v);
                setConfirmar("");
              }}
              className={cn("rounded-xl border p-3 text-left transition", modo === v ? "border-azul-900 bg-azul-900/5 ring-2 ring-azul-900" : "border-plomo-200 hover:border-azul-900")}
            >
              <span className="block font-semibold text-fg">{t}</span>
              <span className="block text-xs text-plomo-600">{d}</span>
            </button>
          ))}
        </div>
        <p className="text-plomo-600">
          Columnas: <b>Producto (o Nombre Único) | Almacén (o Ubicación) | Unidad | Cantidad</b> y, opcional, <b>Último costo</b>. Sirve el mismo Excel de <b>Exportar Excel</b>: expórtelo,
          corrija las cantidades y vuelva a subirlo. Sin columna Almacén → <b>{SEDE_REPUESTOS}</b>. Sin columna Unidad: la del nombre (“| UNIDAD”), ACEITE → LT, resto → PZA.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {modo === "REEMPLAZAR" && (
            <Button variant="secondary" onClick={() => void onRespaldo()} title="Guarde una copia del stock actual antes de reemplazarlo">
              <FileDown size={16} /> 1. Descargar respaldo del stock actual
            </Button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-corp px-4 py-2.5 text-sm font-semibold text-white hover:bg-vino-900">
            <FileSpreadsheet size={16} /> {modo === "REEMPLAZAR" ? "2. " : ""}
            {plan ? "Elegir otro archivo" : "Elegir Excel"}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={leer} />
          </label>
          {modo === "REEMPLAZAR" && (
            <label className="flex items-center gap-2 text-xs font-semibold text-plomo-600">
              Almacén a reemplazar:
              <Select
                value={alcance}
                onChange={(e) => setAlcance(e.target.value)}
                className="w-auto"
                aria-label="Almacén a reemplazar"
                options={[{ value: "", label: "Todos los almacenes" }, ...SEDES_STOCK.map((x) => ({ value: x, label: `Solo ${x}` }))]}
              />
            </label>
          )}
        </div>
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
            {reemplazo && (
              <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3" data-resumen-reemplazo>
                <p className="font-semibold text-amber-900">
                  Al reemplazar {alcance ? `el stock de ${alcance}` : "TODO el stock (todos los almacenes)"}:
                </p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <span>
                    Del Excel: <b>{reemplazo.aplicar.length}</b>
                  </span>
                  <span>
                    Cambian: <b>{reemplazo.cambian}</b> · nuevos: <b>{reemplazo.nuevos}</b>
                  </span>
                  <span className={reemplazo.aCero.length ? "font-semibold text-red-700" : ""}>
                    Quedan en 0 (no están en el Excel): <b>{reemplazo.aCero.length}</b>
                  </span>
                  <span className={reemplazo.omitidos.length ? "font-semibold text-red-700" : ""}>
                    No están en el catálogo: <b>{reemplazo.omitidos.length}</b>
                  </span>
                </div>
                {reemplazo.fueraDeAlcance > 0 && <p className="text-xs text-amber-900">{reemplazo.fueraDeAlcance} fila(s) del Excel son de otro almacén y no se tocan.</p>}
                {reemplazo.omitidos.length > 0 && (
                  <p className="text-xs text-red-700">
                    No se importan (pida a Soporte que los cree en el catálogo o corrija el nombre): {reemplazo.omitidos.slice(0, 8).join(", ")}
                    {reemplazo.omitidos.length > 8 ? ` y ${reemplazo.omitidos.length - 8} más (ver log)` : ""}.
                  </p>
                )}
                <p className="text-xs text-plomo-600">Nada se borra: los registros y su Kardex se conservan, y cada diferencia queda en el Kardex como Ajuste.</p>
                {cambios.length > 0 && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={verCambios} onChange={(e) => setVerCambios(e.target.checked)} /> Ver los {cambios.length} cambios de cantidad
                  </label>
                )}
                {verCambios && (
                  <div className="max-h-[220px] overflow-y-auto rounded-lg border border-plomo-200 bg-surface">
                    <table className="w-full text-xs" data-tabla-cambios>
                      <tbody>
                        {cambios.map((c) => (
                          <tr key={c.k} className={cn("border-b border-plomo-100", c.tipo === "Queda en 0" && "bg-red-50")}>
                            <td className="px-2 py-1 font-semibold">{c.tipo}</td>
                            <td className="px-2 py-1">{c.sede}</td>
                            <td className="px-2 py-1">{c.nombre}</td>
                            <td className="whitespace-nowrap px-2 py-1 text-right">
                              {num(c.antes)} → <b>{num(c.despues)}</b> {c.unidad}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={verTodo} onChange={(e) => setVerTodo(e.target.checked)} /> Ver log completo ({plan.log.length} líneas)
              </label>
              <Button size="sm" variant="ghost" onClick={descargarLog}>
                <FileDown size={14} /> Descargar log
              </Button>
            </div>
            <div className="max-h-[200px] overflow-y-auto rounded-xl border border-plomo-200">
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-plomo-100 pt-4">
          {modo === "REEMPLAZAR" && plan && (
            <Field label='Escriba REEMPLAZAR para confirmar'>
              <Input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="REEMPLAZAR" className="w-44" data-confirmar-reemplazo />
            </Field>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {modo === "REEMPLAZAR" ? (
            <Button variant="danger" onClick={importar} disabled={!listoReemplazo} data-boton-reemplazar>
              <Upload size={16} /> Reemplazar stock{reemplazo ? ` (${reemplazo.aplicar.length} productos)` : ""}
            </Button>
          ) : (
            <Button onClick={importar} disabled={!plan || plan.productos.length === 0}>
              <Upload size={16} /> Importar {plan ? plan.productos.length : ""} producto(s)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
