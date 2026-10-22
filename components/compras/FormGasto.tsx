"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Paperclip, Plus, Receipt, ShoppingBag, Trash2, X } from "lucide-react";
import { FormBancarizacion, bancarizacionVacia } from "@/components/compras/FormBancarizacion";
import { UNIDADES } from "@/lib/empresa";
import { pdfDeclaracionJurada } from "@/lib/pdf";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, cn, ejecutarAsync, toast } from "@/components/ui";
import {
  COMPROBANTES_GASTO,
  DETRACCION_SUGERIDA,
  MAX_ARCHIVO,
  PORCENTAJES_DETRACCION,
  TIPOS_GASTO,
  calcularDetraccion,
  codigoGasto,
  fechaPE,
  hoy,
  parseFechaPE,
  IGV,
  TOPE_BANCARIZACION,
  r2,
  registrarGastoCompleto,
  requiereBancarizacion,
  rucValido,
  soles,
  type DatosGasto,
  subirBaucher,
} from "@/lib/storage";
import type { ArchivoGasto, Factura, Bancarizacion, ComprobanteGasto, Proveedor, Rol, StockItem, TipoGasto } from "@/lib/types";
import { ProductoInput } from "@/components/productos/ProductoInput";

type FilaOC = { id: string; nombre: string; unidad: string; cantidad: number; precioUnit: number };
const filaOC = (): FilaOC => ({ id: Math.random().toString(36).slice(2), nombre: "", unidad: "UND", cantidad: 1, precioUnit: 0 });

/** DD/MM/AAAA mientras se escribe. */
const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

const vacio = (): Omit<DatosGasto, "fecha"> => ({
  tipoGasto: "TRANSPORTE",
  descripcion: "",
  importe: 0,
  comprobante: "FACTURA",
  numero: "",
  proveedor: "",
  ruc: "",
  detraccion: false,
  detraccionPorc: DETRACCION_SUGERIDA.TRANSPORTE,
  archivos: [],
});

/**
 * Gasto / servicio sin stock (Tesorería): almuerzos de representación, servicios básicos, transporte,
 * compras sin requerimiento… No ingresa a almacén: queda en Facturas como POR PAGAR.
 */
export function FormGasto({ rol, proveedores, stock = [], onGuardado }: { rol: Rol; proveedores: Proveedor[]; stock?: StockItem[]; onGuardado?: () => void }) {
  const [d, setD] = useState(vacio);
  // Orden de compra opcional por este gasto
  const [conOC, setConOC] = useState(false);
  const [filas, setFilas] = useState<FilaOC[]>([filaOC()]);
  // Bancarización: con ella el gasto queda PAGADO ("Registrar y pagar")
  const [pagar, setPagar] = useState(false);
  const [banc, setBanc] = useState<Bancarizacion>(bancarizacionVacia);
  const [guardando, setGuardando] = useState(false);
  const productos = useMemo(() => {
    const m = new Map<string, StockItem>();
    stock.forEach((s) => m.has(s.nombre) || m.set(s.nombre, s));
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [stock]);
  const [fechaTxt, setFechaTxt] = useState(fechaPE(hoy()));
  const refFactura = useRef<HTMLInputElement>(null);
  const refGuia = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const fechaISO = parseFechaPE(fechaTxt);
  const fechaError = fechaTxt.length === 10 && !fechaISO ? "Fecha inexistente" : fechaISO > hoy() ? "La fecha no puede ser futura" : undefined;
  const { monto, neto } = calcularDetraccion(d.importe, d.detraccion, d.detraccionPorc);
  const rucMal = d.ruc.length === 11 && !rucValido(d.ruc);
  const subOC = r2(filas.reduce((a, f) => a + (f.cantidad || 0) * (f.precioUnit || 0), 0));
  const totalOC = d.comprobante === "FACTURA" ? r2(subOC * (1 + IGV)) : subOC;
  const bancObligatoria = requiereBancarizacion(d.importe || 0, d.ruc);
  const setFila = (id: string, cambios: Partial<FilaOC>) => setFilas((p) => p.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  const elegirProducto = (id: string, nombre: string) => {
    const p = productos.find((x) => x.nombre === nombre);
    setFila(id, p ? { nombre: p.nombre, unidad: p.unidad, precioUnit: p.costoUnit || 0 } : { nombre });
  };

  const adjuntar = (tipo: ArchivoGasto["tipo"], file?: File) => {
    if (!file) return;
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(file.type)) return toast("Adjunte un PDF o una imagen (JPG / PNG).", "error");
    if (file.size > MAX_ARCHIVO) return toast(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    // dataUrl guarda la referencia: "sb:tesoreria/..." (Storage) o el base64 si Storage lo rechaza
    subirBaucher(file, tipo === "GUIA" ? "gasto-guia" : "gasto-factura")
      .then(({ ref }) => setD((x) => ({ ...x, archivos: [...x.archivos.filter((a) => a.tipo !== tipo), { tipo, nombre: file.name, mime: file.type, dataUrl: ref }] })))
      .catch((e) => toast((e as Error).message, "error"));
  };

  const guardar = async () => {
    setGuardando(true);
    let id = "";
    let dj: Factura | undefined;
    const ok = await ejecutarAsync(
      async () => {
        const r = await registrarGastoCompleto({ ...d, fecha: fechaISO }, { items: conOC ? filas : undefined, bancarizacion: pagar ? banc : undefined }, rol);
        id = r.gasto.id;
        if (r.gasto.comprobanteGasto === "DJ") dj = r.gasto;
        return r;
      },
      `Gasto registrado${conOC ? " con su orden de compra" : ""} · ${pagar ? `PAGADO desde ${banc.caja}` : `en Facturas como POR PAGAR${monto ? ` (neto ${soles(neto)})` : ""}`}`
    );
    setGuardando(false);
    if (!ok) return;
    // Declaración jurada: N° correlativo asignado por el servidor y su PDF al instante
    if (dj) {
      toast(`Declaración jurada ${dj.numero} registrada`);
      pdfDeclaracionJurada(dj);
    }
    setD(vacio());
    setConOC(false);
    setFilas([filaOC()]);
    setPagar(false);
    setBanc(bancarizacionVacia());
    onGuardado?.();
    // Código global GST-xxx-AAAA (si falla, se vuelve a intentar al generar el PDF)
    try {
      const codigo = await codigoGasto(id);
      toast(`Código del gasto: ${codigo}`);
    } catch (e) {
      toast(`Gasto registrado sin código GST: ${(e as Error).message}`, "error");
    }
  };

  const archivo = (tipo: ArchivoGasto["tipo"]) => d.archivos.find((a) => a.tipo === tipo);

  return (
    <Card>
      <CardHeader title="Gasto / servicio sin stock" subtitle="Tesorería: no ingresa a almacén. Al guardar va directo a la pestaña Facturas como POR PAGAR." />
      <div className="grid gap-4 p-5 md:grid-cols-3">
        <Field label="Tipo de gasto *">
          <Select
            value={d.tipoGasto}
            onChange={(e) => {
              const tipoGasto = e.target.value as TipoGasto;
              setD((x) => ({ ...x, tipoGasto, detraccionPorc: DETRACCION_SUGERIDA[tipoGasto] }));
            }}
            options={(Object.keys(TIPOS_GASTO) as TipoGasto[]).filter((k) => k !== "PLANILLA").map((k) => ({ value: k, label: TIPOS_GASTO[k] }))}
          />
        </Field>
        <Field label="Fecha de gasto *" hint={fechaError ? `⚠ ${fechaError}` : "DD/MM/AAAA"}>
          <Input value={fechaTxt} inputMode="numeric" maxLength={10} onChange={(e) => setFechaTxt(mascara(e.target.value))} className={cn(fechaError && "border-red-400")} />
        </Field>
        <Field label="Importe total (S/) *" hint={d.comprobante === "FACTURA" ? "Con IGV incluido" : undefined}>
          <Input type="number" min={0} step="0.01" value={d.importe || ""} onChange={(e) => set("importe", parseFloat(e.target.value) || 0)} className="text-lg font-semibold" />
        </Field>
        <Field label="Descripción del gasto *" className="md:col-span-3">
          <Textarea value={d.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej: Servicio de transporte Arequipa - Lima" />
        </Field>

        {/* Orden de compra opcional */}
        <div className="rounded-xl border border-plomo-200 p-4 md:col-span-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-fg">
            <input type="checkbox" checked={conOC} onChange={(e) => setConOC(e.target.checked)} className="h-4 w-4 accent-corp" />
            <ShoppingBag size={15} /> ¿Emitir Orden de Compra por este gasto? (opcional)
          </label>
          {conOC && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-plomo-500">
                La OC se emite a nombre del proveedor de abajo. Busque los productos en el almacén o escríbalos; precios {d.comprobante === "FACTURA" ? "sin IGV" : "finales"}.
              </p>
              <datalist id="productos-oc-gasto">
                {productos.map((p) => (
                  <option key={p.id} value={p.nombre}>
                    {p.unidad} · {p.sede}
                  </option>
                ))}
              </datalist>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
                    <tr>
                      <th className="px-2 py-2 text-left">Producto</th>
                      <th className="w-24 px-2 py-2 text-left">Cantidad</th>
                      <th className="w-28 px-2 py-2 text-left">Unidad</th>
                      <th className="w-32 px-2 py-2 text-left">Precio unit.</th>
                      <th className="w-28 px-2 py-2 text-right">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-plomo-100">
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td className="px-2 py-1.5">
                          <ProductoInput value={f.nombre} modulo="Tesorería · Gasto con OC" onChange={(nombre) => elegirProducto(f.id, nombre)} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} step="any" value={f.cantidad || ""} onChange={(e) => setFila(f.id, { cantidad: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={f.unidad} onChange={(e) => setFila(f.id, { unidad: e.target.value })} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} step="0.01" value={f.precioUnit || ""} onChange={(e) => setFila(f.id, { precioUnit: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">{soles(r2((f.cantidad || 0) * (f.precioUnit || 0)))}</td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => setFilas((p) => (p.length > 1 ? p.filter((x) => x.id !== f.id) : [filaOC()]))}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Quitar producto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setFilas((p) => [...p, filaOC()])}>
                  <Plus size={14} /> Agregar producto
                </Button>
                <p className={cn("text-sm", Math.abs(totalOC - (d.importe || 0)) > 0.05 ? "text-red-600" : "text-emerald-700")}>
                  Total OC <b>{soles(totalOC)}</b>
                  {d.comprobante === "FACTURA" ? ` (${soles(subOC)} + IGV)` : ""} · debe coincidir con el importe {soles(d.importe || 0)}
                </p>
              </div>
            </div>
          )}
        </div>
        <Field label="Tipo de comprobante *">
          <Select
            value={d.comprobante}
            onChange={(e) => set("comprobante", e.target.value as ComprobanteGasto)}
            options={(Object.keys(COMPROBANTES_GASTO) as ComprobanteGasto[]).map((k) => ({ value: k, label: COMPROBANTES_GASTO[k] }))}
          />
        </Field>
        <Field label={d.comprobante === "DJ" ? "N° DJ" : `N° ${COMPROBANTES_GASTO[d.comprobante].toLowerCase()} *`} hint={d.comprobante === "DJ" ? "Se asigna solo al guardar (correlativo)" : undefined}>
          <Input
            value={d.comprobante === "DJ" ? "" : d.numero}
            disabled={d.comprobante === "DJ"}
            onChange={(e) => set("numero", e.target.value.toUpperCase())}
            placeholder={d.comprobante === "FACTURA" ? "F001-00001234" : d.comprobante === "BOLETA" ? "B001-00000456" : d.comprobante === "DJ" ? "Auto: DJ-XXXX" : "N° de recibo"}
          />
        </Field>
        <div />
        <Field label="Proveedor / agencia *" className="md:col-span-2">
          <Input value={d.proveedor} list="proveedores-gasto" onChange={(e) => {
            const p = proveedores.find((x) => x.razonSocial === e.target.value.toUpperCase());
            setD((x) => ({ ...x, proveedor: e.target.value, ruc: p?.ruc ?? x.ruc }));
          }} placeholder="Razón social o nombre" />
          <datalist id="proveedores-gasto">
            {proveedores.map((p) => (
              <option key={p.id} value={p.razonSocial}>
                {p.ruc}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label={d.comprobante === "FACTURA" ? "RUC *" : "RUC / DNI"} hint={rucMal ? "⚠ Dígito verificador inválido" : undefined}>
          <Input
            value={d.ruc}
            maxLength={11}
            inputMode="numeric"
            onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))}
            className={cn(d.ruc.length === 11 && (rucMal ? "border-red-400" : "border-emerald-400"))}
          />
        </Field>

        {/* Detracción */}
        <div className="rounded-xl border border-plomo-200 p-4 md:col-span-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-fg">
            <input type="checkbox" checked={d.detraccion} onChange={(e) => set("detraccion", e.target.checked)} className="h-4 w-4 accent-corp" /> ¿Aplica detracción?
          </label>
          {d.detraccion && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div role="group" aria-label="Porcentaje de detracción">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">% detracción</span>
                <div className="flex gap-1">
                  {PORCENTAJES_DETRACCION.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => set("detraccionPorc", p)}
                      className={cn("rounded-lg border px-4 py-2 text-sm font-bold", d.detraccionPorc === p ? "border-azul-900 bg-azul-900 text-white" : "border-plomo-200 bg-surface text-slate-700 hover:bg-red-50")}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                Detracción: <b>{soles(monto)}</b>
              </div>
              <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                Neto a pagar: <b>{soles(neto)}</b>
              </div>
            </div>
          )}
        </div>

        {/* Bancarización */}
        <div className="rounded-xl border border-plomo-200 p-4 md:col-span-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-fg">
            <input type="checkbox" checked={pagar} onChange={(e) => setPagar(e.target.checked)} className="h-4 w-4 accent-corp" /> Bancarización: registrar el pago ahora
          </label>
          <p className="mt-1 text-xs text-plomo-500">
            {bancObligatoria
              ? `Obligatoria al pagar: el total pasa S/ ${TOPE_BANCARIZACION.toLocaleString("es-PE")} o el proveedor tiene RUC.`
              : "Opcional. Sin pago, el gasto queda POR PAGAR en Facturas."}
          </p>
          {pagar && (
            <div className="mt-3">
              <FormBancarizacion value={banc} onChange={setBanc} />
            </div>
          )}
        </div>

        {/* Adjuntos */}
        <div className="flex flex-wrap gap-3 md:col-span-3">
          {(
            [
              ["FACTURA", "Factura / comprobante (PDF)", refFactura],
              ["GUIA", "Guía de remisión (opcional)", refGuia],
            ] as const
          ).map(([tipo, label, ref]) => {
            const a = archivo(tipo);
            return (
              <div key={tipo} className="flex items-center gap-2 rounded-lg border border-dashed border-plomo-200 px-3 py-2 text-sm">
                <input ref={ref} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => adjuntar(tipo, e.target.files?.[0])} />
                {a ? (
                  <>
                    <Paperclip size={14} className="text-emerald-600" /> <span className="max-w-[220px] truncate font-medium">{a.nombre}</span>
                    <button type="button" onClick={() => setD((x) => ({ ...x, archivos: x.archivos.filter((y) => y.tipo !== tipo) }))} className="text-red-500" aria-label="Quitar archivo">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-1.5 text-plomo-600 hover:text-fg">
                    <FileUp size={14} /> {label}
                  </button>
                )}
              </div>
            );
          })}
          <span className="self-center text-xs text-slate-400">PDF o imagen · máx. 1.5 MB c/u</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-plomo-100 px-5 py-4">
        <p className="text-sm text-plomo-600">
          Total <b className="text-fg">{soles(d.importe || 0)}</b>
          {d.detraccion && (
            <>
              {" "}
              · neto a pagar <b className="text-emerald-700">{soles(neto)}</b>
            </>
          )}
        </p>
        <Button variant={pagar ? "success" : "warning"} onClick={guardar} disabled={!fechaISO || guardando} className="px-5 py-2.5">
          <Receipt size={16} /> {guardando ? "Guardando…" : pagar ? "Registrar y pagar" : "Registrar gasto (por pagar)"}
        </Button>
      </div>
    </Card>
  );
}
