"use client";

import { useMemo, useRef, useState } from "react";
import { EstadoRuc } from "@/components/EstadoRuc";
import { nombreDesdeDni } from "@/lib/dni";
import { rucSunat } from "@/lib/ruc";
import { FileUp, Paperclip, Plus, Receipt, Trash2, X } from "lucide-react";
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
  desglosarIgv,
  TOPE_BANCARIZACION,
  TC_MAX,
  TC_MIN,
  solesDeUsd,
  r2,
  registrarGastoCompleto,
  requiereBancarizacion,
  rucValido,
  soles,
  type DatosGasto,
  subirBaucher,
} from "@/lib/storage";
import type { ArchivoGasto, Factura, Bancarizacion, ComprobanteGasto, OrdenAGenerar, Proveedor, Rol, StockItem, TipoGasto } from "@/lib/types";
import { ProductoInput, UnidadProducto } from "@/components/productos/ProductoInput";
import { SelectorOrden } from "@/components/compras/SelectorOrden";
import { EscanearGasto, type ResultadoEscaneo } from "@/components/compras/EscanearGasto";
import { ServiciosOS, lineasServicio, servicioVacio, type FilaServicio } from "@/components/compras/ServiciosOS";
import {
  OPCIONES_COMPROBANTE,
  PORC_RETENCION_RHE,
  TOPE_DJ_MOVILIDAD_DIA,
  TOPE_RETENCION_RHE,
  PROVEEDOR_VARIOS,
  RUC_VARIOS,
  admiteProveedorVarios,
  esProveedorVarios,
  numeroAutomatico,
  placeholderComprobante,
  retencionRHE,
} from "@/lib/comprobantes";

type FilaOC = { id: string; nombre: string; unidad: string; cantidad: number; precioUnit: number };
const filaOC = (): FilaOC => ({ id: Math.random().toString(36).slice(2), nombre: "", unidad: "UND", cantidad: 1, precioUnit: 0 });

/** DD/MM/AAAA mientras se escribe. */
const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/** Campos que el escaneo (OCR) no pudo leer o que no cuadran: se pintan en amarillo hasta que el usuario los toque. */
type CampoOcr = "fecha" | "importe" | "tipoCambio" | "descripcion" | "comprobante" | "numero" | "proveedor" | "ruc";
const AMARILLO = "!border-amber-400 !bg-amber-50 !text-amber-950 ring-2 ring-amber-200";

/** Último tipo de cambio usado en este equipo (comodidad: se propone en el siguiente gasto en dólares). */
export const CLAVE_TC = "erp:gasto-tipo-cambio";
export const tcGuardado = (): number => {
  try {
    const n = Number(localStorage.getItem(CLAVE_TC));
    return n >= TC_MIN && n <= TC_MAX ? n : 0;
  } catch {
    return 0;
  }
};

/** Línea leída del comprobante: precio CON IGV en la moneda del comprobante. */
type LineaEscaneo = { nombre: string; unidad: string; cantidad: number; precio: number };

const vacio = (): Omit<DatosGasto, "fecha"> => ({
  tipoGasto: "TRANSPORTE",
  descripcion: "",
  importe: 0,
  comprobante: "FACTURA",
  numero: "",
  // Por defecto VARIOS/SIN DATOS con N° 010101 (editable); al validar un RUC se reemplaza por la razón social de SUNAT
  proveedor: PROVEEDOR_VARIOS,
  ruc: RUC_VARIOS,
  detraccion: false,
  detraccionPorc: DETRACCION_SUGERIDA.TRANSPORTE,
  archivos: [],
  retencion: true,
  suministro: "",
  cotizacion: "",
  moneda: "PEN",
  tipoCambio: tcGuardado(),
  importeUsd: 0,
});

/**
 * Gasto / servicio sin stock (Tesorería): almuerzos de representación, servicios básicos, transporte,
 * compras sin requerimiento… No ingresa a almacén: queda en Facturas como POR PAGAR.
 */
export function FormGasto({ rol, proveedores, stock = [], onGuardado }: { rol: Rol; proveedores: Proveedor[]; stock?: StockItem[]; onGuardado?: () => void }) {
  const [d, setD] = useState(vacio);
  // Orden de compra o de servicio opcional por este gasto (solo una)
  const [orden, setOrden] = useState<OrdenAGenerar>("NINGUNA");
  const conOC = orden !== "NINGUNA";
  const [filas, setFilas] = useState<FilaOC[]>([filaOC()]);
  // OS: servicios en texto libre (sin catálogo)
  const [servicios, setServicios] = useState<FilaServicio[]>([servicioVacio()]);
  // Artículos del último escaneo: se jalan a la OC / OS cuando el gestor la elige (en soles: US$ × tipo de cambio)
  const [escaneo, setEscaneo] = useState<{ lineas: LineaEscaneo[]; usd: boolean } | null>(null);
  // true mientras las líneas de la OC / OS sean las del escaneo sin tocar: se recalculan si cambia el tipo de cambio
  const [lineasAuto, setLineasAuto] = useState(false);
  const enUsd = d.moneda === "USD";
  const factorMoneda = (usd: boolean) => (usd ? d.tipoCambio || 0 : 1);
  const lineasOC = (e: { lineas: LineaEscaneo[]; usd: boolean }, k = factorMoneda(e.usd)): FilaOC[] =>
    e.lineas.map((l) => ({ ...filaOC(), nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad, precioUnit: r2(l.precio * k) }));
  const lineasOS = (e: { lineas: LineaEscaneo[]; usd: boolean }, k = factorMoneda(e.usd)): FilaServicio[] =>
    e.lineas.map((l) => ({ ...servicioVacio(), descripcion: l.nombre, descTocada: true, cantidad: l.cantidad, unidad: l.unidad, precioUnit: r2(l.precio * k) }));
  /** Dólares: el importe en soles es siempre US$ × tipo de cambio; las líneas escaneadas se recalculan. */
  const setUsd = (cambios: Partial<Pick<DatosGasto, "moneda" | "tipoCambio" | "importeUsd">>) => {
    setD((x) => {
      const n = { ...x, ...cambios };
      return n.moneda === "USD" ? { ...n, importe: solesDeUsd(n.importeUsd || 0, n.tipoCambio || 0) } : n;
    });
    if (cambios.tipoCambio !== undefined && escaneo?.usd && lineasAuto) {
      setFilas(lineasOC(escaneo, cambios.tipoCambio || 0));
      setServicios(lineasOS(escaneo, cambios.tipoCambio || 0));
    }
    if (cambios.tipoCambio && cambios.tipoCambio >= TC_MIN && cambios.tipoCambio <= TC_MAX)
      try {
        localStorage.setItem(CLAVE_TC, String(cambios.tipoCambio));
      } catch {
        /* sin almacenamiento local: solo no se recuerda */
      }
  };
  const ocVacia = (fs: FilaOC[]) => fs.every((f) => !f.nombre.trim() && !f.precioUnit);
  const osVacia = (fs: FilaServicio[]) => fs.every((f) => !f.descripcion.trim() && !f.precioUnit);
  /** OC u OS según elija el gestor: si sus líneas están vacías, se llenan con lo escaneado (o el gasto en una línea). */
  const elegirOrden = (o: OrdenAGenerar) => {
    setOrden(o);
    if (o === "OC" && ocVacia(filas)) {
      if (escaneo?.lineas.length) {
        setFilas(lineasOC(escaneo));
        setLineasAuto(true);
      }
      else if ((d.importe || 0) > 0 && d.descripcion.trim())
        setFilas([{ ...filaOC(), nombre: d.descripcion.trim().toUpperCase().slice(0, 200), cantidad: 1, precioUnit: r2(d.importe) }]);
    }
    if (o === "OS" && osVacia(servicios) && escaneo?.lineas.length) {
      setServicios(lineasOS(escaneo));
      setLineasAuto(true);
    }
  };
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
  const refCotizacion = useRef<HTMLInputElement>(null);
  // Sin cotización del proveedor: el sistema genera COT-PROV-0001-2026 al guardar
  const [sinCotizacion, setSinCotizacion] = useState(false);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  // Escanear factura: campos a revisar (amarillo). Se quitan al editar el campo.
  const [revisar, setRevisar] = useState<Set<CampoOcr>>(() => new Set());
  const revisado = (...c: CampoOcr[]) => setRevisar((r) => (c.some((k) => r.has(k)) ? new Set([...r].filter((k) => !c.includes(k))) : r));
  const ocr = (c: CampoOcr) => (revisar.has(c) ? AMARILLO : undefined);
  /** Rellena el formulario con lo leído; no guarda (el usuario revisa y da Registrar gasto). */
  const descripcionActual = () => d.descripcion.trim();
  const aplicarEscaneo = ({ datos, archivo, cotizacion }: ResultadoEscaneo) => {
    // Cotización / proforma del proveedor: N° y adjunto del bloque "Cotización del proveedor"; además llena
    // proveedor, RUC, fecha, total y artículos (no el comprobante ni su N°: la factura llega después)
    const esCoti = cotizacion !== undefined;
    if (esCoti) {
      setSinCotizacion(false);
      setD((x) => ({ ...x, ...(cotizacion ? { cotizacion } : {}), archivos: archivo ? [...x.archivos.filter((a) => a.tipo !== "COTIZACION"), archivo] : x.archivos }));
      // Ya se escaneó la factura: sus datos mandan; de la cotización solo quedan el N° y el adjunto
      if (d.archivos.some((a) => a.tipo === "FACTURA")) {
        toast("Cotización adjuntada. Se mantienen los datos de la factura ya escaneada.");
        return;
      }
    }
    // Guía de remisión: solo se adjunta al gasto (no cambia importe ni comprobante)
    if (datos.tipoElectronico === "GUIA") {
      if (archivo) setD((x) => ({ ...x, archivos: [...x.archivos.filter((a) => a.tipo !== "GUIA"), archivo] }));
      return;
    }
    const falta = new Set<CampoOcr>();
    if (datos.fecha) setFechaTxt(fechaPE(datos.fecha));
    // La de la cotización puede no ser la del comprobante: a confirmar
    if (!datos.fecha || esCoti) falta.add("fecha");
    // Comprobante en dólares: moneda US$ y el tipo de cambio queda en amarillo para confirmarlo
    const usd = datos.moneda === "USD";
    if (!datos.total || datos.igvCuadra === false) falta.add("importe");
    if (usd) falta.add("tipoCambio");
    if (!datos.comprobante && !esCoti) falta.add("comprobante");
    if (!datos.numero && !(esCoti && d.numero.trim())) falta.add("numero");
    // Detalle: la descripción del gasto lista cada artículo con su costo; si las líneas no suman el total, a revisar
    const items = datos.items ?? [];
    if (!items.length || datos.itemsConIgv === undefined) falta.add("descripcion");
    const mon = (n: number) => (datos.moneda === "USD" ? `US$ ${n.toFixed(2)}` : soles(n));
    const descripcion = items
      .map((i) => `${i.cantidad} ${i.unidad} ${i.descripcion} x ${mon(i.precioUnit)} = ${mon(i.importe)}`)
      .join("; ")
      .concat(items.length && datos.itemsConIgv === false ? " (valores sin IGV)" : "")
      .slice(0, 1000);
    if (items.length) {
      // OC / OS del gasto: líneas ya cargadas con precio CON IGV incluido (si el comprobante las trae sin IGV, se suma)
      const factor = datos.itemsConIgv === false && (datos.comprobante ?? d.comprobante) === "FACTURA" ? 1.18 : 1;
      const e = { usd, lineas: items.map((i) => ({ nombre: i.descripcion, unidad: i.unidad, cantidad: i.cantidad, precio: r2(i.precioUnit * factor) })) };
      setEscaneo(e);
      setFilas(lineasOC(e));
      setServicios(lineasOS(e));
      setLineasAuto(true);
    } else {
      setEscaneo(null);
      // Sin artículos leídos: la OC ya elegida toma el gasto en una línea (descripción e importe leídos)
      if (orden === "OC" && ocVacia(filas) && datos.total && descripcionActual())
        setFilas([{ ...filaOC(), nombre: descripcionActual().toUpperCase().slice(0, 200), cantidad: 1, precioUnit: r2(datos.total * factorMoneda(usd)) }]);
    }
    // RUC leído: la razón social la pone el padrón SUNAT (rucSunat) o la consulta Decolecta de EstadoRuc al validar
    const sunat = datos.ruc ? rucSunat(datos.ruc) : undefined;
    if (!datos.ruc) falta.add("ruc").add("proveedor");
    else if (!sunat) falta.add("proveedor");
    setD((x) => ({
      ...x,
      ...(datos.comprobante ? { comprobante: datos.comprobante } : {}),
      // Recibo por honorarios: servicio profesional de 4ta categoría (como al elegirlo a mano)
      ...(datos.comprobante === "RXH" ? { tipoGasto: "SERV_PROFESIONALES" as const, detraccionPorc: DETRACCION_SUGERIDA.SERV_PROFESIONALES } : {}),
      ...(datos.numero ? { numero: datos.numero } : {}),
      ...(datos.total
        ? usd
          ? { moneda: "USD" as const, importeUsd: datos.total, importe: solesDeUsd(datos.total, x.tipoCambio || 0) }
          : { moneda: "PEN" as const, importe: datos.total, importeUsd: 0 }
        : {}),
      ...(descripcion ? { descripcion } : {}),
      // Sin padrón SUNAT: la razón social leída del documento (provisional; al validar el RUC la pone SUNAT)
      ...(datos.ruc ? { ruc: datos.ruc, proveedor: sunat ? sunat.razon_social : datos.razonSocial ?? (esProveedorVarios(x.proveedor) ? "" : x.proveedor) } : {}),
      archivos: archivo && !esCoti ? [...x.archivos.filter((a) => a.tipo !== "FACTURA"), archivo] : x.archivos,
    }));
    setRevisar(falta);
  };
  const fechaISO = parseFechaPE(fechaTxt);
  const fechaError = fechaTxt.length === 10 && !fechaISO ? "Fecha inexistente" : fechaISO > hoy() ? "La fecha no puede ser futura" : undefined;
  const { monto, neto: netoDetraccion } = calcularDetraccion(d.importe, d.detraccion, d.detraccionPorc);
  const esRHE = d.comprobante === "RXH";
  const retencion = esRHE ? retencionRHE(d.importe || 0, d.retencion ?? true) : 0;
  const neto = r2(netoDetraccion - retencion);
  const rucMal = d.ruc.length === 11 && !rucValido(d.ruc);
  const subOC = r2(filas.reduce((a, f) => a + (f.cantidad || 0) * (f.precioUnit || 0), 0));
  // Precios de la OC con IGV incluido: su total es la suma de las líneas (la factura desglosa base e IGV)
  const totalOC = subOC;
  const igvOC = d.comprobante === "FACTURA" ? desglosarIgv(subOC).igv : 0;
  const bancObligatoria = requiereBancarizacion(d.importe || 0, d.ruc);
  const editarFilas = (fn: (p: FilaOC[]) => FilaOC[]) => {
    setLineasAuto(false);
    setFilas(fn);
  };
  const setFila = (id: string, cambios: Partial<FilaOC>) => {
    setLineasAuto(false);
    setFilas((p) => p.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  };
  const elegirProducto = (id: string, nombre: string) => {
    const p = productos.find((x) => x.nombre === nombre);
    setFila(id, p ? { nombre: p.nombre, unidad: p.unidad, precioUnit: p.costoUnit || 0 } : { nombre });
  };

  const adjuntar = (tipo: ArchivoGasto["tipo"], file?: File) => {
    if (!file) return;
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(file.type)) return toast("Adjunte un PDF o una imagen (JPG / PNG).", "error");
    if (file.size > MAX_ARCHIVO) return toast(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    // dataUrl guarda la referencia: "sb:tesoreria/..." (Storage) o el base64 si Storage lo rechaza
    subirBaucher(file, tipo === "GUIA" ? "gasto-guia" : tipo === "COTIZACION" ? "gasto-cotizacion" : "gasto-factura")
      .then(({ ref }) => setD((x) => ({ ...x, archivos: [...x.archivos.filter((a) => a.tipo !== tipo), { tipo, nombre: file.name, mime: file.type, dataUrl: ref }] })))
      .catch((e) => toast((e as Error).message, "error"));
  };

  const guardar = async () => {
    setGuardando(true);
    let id = "";
    let dj: Factura | undefined;
    let cot = "";
    let auto = false;
    let aviso = "";
    const ok = await ejecutarAsync(
      async () => {
        if (!sinCotizacion && !d.cotizacion?.trim())
          throw new Error('Ingrese el N° de la cotización del proveedor o marque "El proveedor no entregó cotización".');
        const r = await registrarGastoCompleto(
          { ...d, cotizacion: sinCotizacion ? "" : d.cotizacion, archivos: sinCotizacion ? d.archivos.filter((a) => a.tipo !== "COTIZACION") : d.archivos, fecha: fechaISO },
          {
            items: orden === "OC" ? filas : undefined,
            servicios: orden === "OS" ? lineasServicio(servicios, d.descripcion, d.importe, d.comprobante === "FACTURA") : undefined,
            bancarizacion: pagar ? banc : undefined,
          },
          rol
        );
        id = r.gasto.id;
        cot = r.gasto.cotizacionProveedor ?? "";
        auto = !!r.gasto.cotizacionAuto;
        aviso = r.avisoCotizacion ?? "";
        if (r.gasto.comprobanteGasto === "DJ") dj = r.gasto;
        return r;
      },
      `Gasto registrado${conOC ? ` con su orden de ${orden === "OS" ? "servicio (APROBADA)" : "compra"}` : ""} · ${pagar ? `PAGADO desde ${banc.caja}` : `en Facturas como POR PAGAR${monto ? ` (neto ${soles(neto)})` : ""}`}`
    );
    setGuardando(false);
    if (!ok) return;
    // Declaración jurada: N° correlativo asignado por el servidor y su PDF al instante
    if (dj) {
      toast(`Declaración jurada ${dj.numero} registrada`);
      pdfDeclaracionJurada(dj);
    }
    if (auto && cot) toast(`Cotización generada: ${cot}`);
    if (aviso) toast(`Gasto registrado sin código de cotización: ${aviso}`, "error");
    setD(vacio());
    setRevisar(new Set());
    setSinCotizacion(false);
    setOrden("NINGUNA");
    setEscaneo(null);
    setLineasAuto(false);
    setFilas([filaOC()]);
    setServicios([servicioVacio()]);
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
        <div className="md:col-span-3">
          <EscanearGasto onLeido={aplicarEscaneo} rol={rol} />
        </div>
        <Field label="Tipo de gasto *">
          <Select
            value={d.tipoGasto}
            onChange={(e) => {
              const tipoGasto = e.target.value as TipoGasto;
              // Servicios profesionales (4ta categoría): por defecto, recibo por honorarios electrónico
              setD((x) => ({ ...x, tipoGasto, detraccionPorc: DETRACCION_SUGERIDA[tipoGasto], ...(tipoGasto === "SERV_PROFESIONALES" ? { comprobante: "RXH" as const } : {}) }));
            }}
            options={(Object.keys(TIPOS_GASTO) as TipoGasto[]).filter((k) => k !== "PLANILLA").map((k) => ({ value: k, label: TIPOS_GASTO[k] }))}
          />
          {d.tipoGasto === "SERV_PROFESIONALES" && <span className="mt-1 block text-xs text-plomo-500">Persona natural con RUC 10 - 4ta categoría</span>}
        </Field>
        <Field label="Fecha de gasto *" hint={fechaError ? `⚠ ${fechaError}` : "DD/MM/AAAA"}>
          <Input
            value={fechaTxt}
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => {
              setFechaTxt(mascara(e.target.value));
              revisado("fecha");
            }}
            className={cn(ocr("fecha"), fechaError && "border-red-400")}
          />
        </Field>
        <Field
          label={enUsd ? "Importe total (US$) *" : "Importe total (S/) *"}
          hint={
            enUsd
              ? d.tipoCambio
                ? `Equivale a ${soles(d.importe || 0)}${d.comprobante === "FACTURA" ? " · con IGV incluido" : ""}`
                : "Ingrese el tipo de cambio para ver el importe en soles"
              : d.comprobante === "FACTURA"
              ? "Con IGV incluido"
              : d.comprobante === "DJ"
                ? `Movilidad: máx. ${soles(TOPE_DJ_MOVILIDAD_DIA)} por día (SUNAT)`
                : esRHE
                  ? `Monto bruto del RHE (retención 8 % si pasa ${soles(TOPE_RETENCION_RHE)})`
                  : undefined
          }
        >
          <div className="flex gap-2">
            <div role="group" aria-label="Moneda del comprobante" className="flex shrink-0 overflow-hidden rounded-lg border border-plomo-200">
              {(["PEN", "USD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setUsd(
                      m === "USD"
                        ? { moneda: "USD", importeUsd: d.moneda === "USD" ? d.importeUsd : d.importe || 0 }
                        : { moneda: "PEN" }
                    )
                  }
                  className={cn("px-3 text-sm font-bold", d.moneda === m || (m === "PEN" && !d.moneda) ? "bg-azul-900 text-white" : "bg-surface text-plomo-600 hover:bg-red-50")}
                  aria-pressed={d.moneda === m}
                >
                  {m === "PEN" ? "S/" : "US$"}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={(enUsd ? d.importeUsd : d.importe) || ""}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                if (enUsd) setUsd({ importeUsd: v });
                else set("importe", v);
                revisado("importe");
              }}
              className={cn("text-lg font-semibold", ocr("importe"))}
            />
          </div>
        </Field>
        {enUsd && (
          <div className="grid gap-3 rounded-xl border border-plomo-200 p-4 md:col-span-3 md:grid-cols-3">
            <Field label="Tipo de cambio (S/ por US$) *" hint="Venta SUNAT del día del comprobante">
              <Input
                type="number"
                min={TC_MIN}
                max={TC_MAX}
                step="0.001"
                value={d.tipoCambio || ""}
                onChange={(e) => {
                  setUsd({ tipoCambio: parseFloat(e.target.value) || 0 });
                  revisado("tipoCambio");
                }}
                placeholder="Ej: 3.750"
                className={cn(ocr("tipoCambio"), !!d.tipoCambio && (d.tipoCambio < TC_MIN || d.tipoCambio > TC_MAX) && "border-red-400")}
              />
            </Field>
            <div className="flex flex-col justify-center rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900 md:col-span-2">
              <span className="text-xs uppercase tracking-wide text-emerald-700">Cambio a soles</span>
              <span>
                US$ {(d.importeUsd || 0).toFixed(2)} × {(d.tipoCambio || 0).toFixed(3)} = <b className="text-lg">{soles(d.importe || 0)}</b>
              </span>
              <span className="text-xs text-emerald-700">El gasto se registra en soles (Facturas, cajas y detracción); se guardan los US$ y el tipo de cambio.</span>
            </div>
          </div>
        )}
        <Field label="Descripción del gasto *" className="md:col-span-3">
          <Textarea
            value={d.descripcion}
            onChange={(e) => {
              set("descripcion", e.target.value);
              revisado("descripcion");
            }}
            placeholder="Ej: Servicio de transporte Arequipa - Lima"
            className={ocr("descripcion")}
          />
        </Field>

        {/* Orden de compra u orden de servicio opcional (una sola) */}
        <div className="md:col-span-3">
          <SelectorOrden value={orden} onChange={elegirOrden} nota="Opcional. La OS nace APROBADA con correlativo OS-001-2026.">
            {orden === "OS" ? (
              <ServiciosOS
                filas={servicios}
                onChange={(fs) => {
                  setLineasAuto(false);
                  setServicios(fs);
                }} descripcionGasto={d.descripcion} importe={d.importe} conIgv={d.comprobante === "FACTURA"} />
            ) : (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-plomo-500">
                La OC se emite a nombre del proveedor de abajo. Busque los productos en el almacén o escríbalos; precios {d.comprobante === "FACTURA" ? "CON IGV incluido" : "finales"}.
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
                      <th className="w-32 px-2 py-2 text-left">{d.comprobante === "FACTURA" ? "P. unit. inc. IGV" : "Precio unit."}</th>
                      <th className="w-28 px-2 py-2 text-right">Importe</th>
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
                          <UnidadProducto nombre={f.nombre} value={f.unidad} onChange={(unidad) => setFila(f.id, { unidad })} modulo="Tesorería · Gasto con OC" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} step="0.01" value={f.precioUnit || ""} onChange={(e) => setFila(f.id, { precioUnit: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">{soles(r2((f.cantidad || 0) * (f.precioUnit || 0)))}</td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => editarFilas((p) => (p.length > 1 ? p.filter((x) => x.id !== f.id) : [filaOC()]))}
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
                <Button type="button" size="sm" variant="secondary" onClick={() => editarFilas((p) => [...p, filaOC()])}>
                  <Plus size={14} /> Agregar producto
                </Button>
                <p className={cn("text-sm", Math.abs(totalOC - (d.importe || 0)) > 0.05 ? "text-red-600" : "text-emerald-700")}>
                  Total OC <b>{soles(totalOC)}</b>
                  {d.comprobante === "FACTURA" ? ` (incluye IGV ${soles(igvOC)})` : ""} · debe coincidir con el importe {soles(d.importe || 0)}
                </p>
              </div>
            </div>
            )}
          </SelectorOrden>
        </div>
        <Field label="Tipo de comprobante *">
          <Select
            value={d.comprobante}
            onChange={(e) => {
              const comprobante = e.target.value as ComprobanteGasto;
              revisado("comprobante");
              setD((x) => ({
                ...x,
                comprobante,
                // DJ / RHE llevan el nombre de una persona: el genérico se quita; al volver, se repone si quedó vacío
                ...(!admiteProveedorVarios(comprobante)
                  ? esProveedorVarios(x.proveedor) ? { proveedor: "", ruc: x.ruc === RUC_VARIOS ? "" : x.ruc } : {}
                  : !x.proveedor.trim() && !x.ruc ? { proveedor: PROVEEDOR_VARIOS, ruc: RUC_VARIOS } : {}),
              }));
            }}
            options={OPCIONES_COMPROBANTE}
            className={ocr("comprobante")}
          />
          {esRHE && <span className="mt-1 block text-xs text-plomo-500">Persona natural con RUC 10 - 4ta categoría</span>}
        </Field>
        <Field
          label={d.comprobante === "DJ" ? "N° DJ" : numeroAutomatico(d.comprobante) ? "N° interno" : `N° ${COMPROBANTES_GASTO[d.comprobante].toLowerCase()} *`}
          hint={d.comprobante === "DJ" ? "Se asigna solo al guardar (correlativo)" : numeroAutomatico(d.comprobante) ? "Se asigna solo al guardar" : undefined}
        >
          <Input
            value={numeroAutomatico(d.comprobante) ? "" : d.numero}
            disabled={numeroAutomatico(d.comprobante)}
            onChange={(e) => {
              set("numero", e.target.value.toUpperCase());
              revisado("numero");
            }}
            placeholder={placeholderComprobante(d.comprobante)}
            className={ocr("numero")}
          />
        </Field>
        {d.comprobante === "SERVICIO_PUBLICO" ? (
          <Field label="N° de suministro" hint="Sin IGV separado">
            <Input value={d.suministro ?? ""} onChange={(e) => set("suministro", e.target.value.toUpperCase())} placeholder="Ej: 123456 (SEAL / SEDAPAR)" />
          </Field>
        ) : (
          <div />
        )}
        <Field label={d.comprobante === "DJ" ? "Nombre de quien declara *" : esRHE ? "Persona que emite el RHE *" : "Proveedor / agencia *"} className="md:col-span-2">
          <Input value={d.proveedor} list="proveedores-gasto" onChange={(e) => {
            const v = e.target.value;
            revisado("proveedor");
            const p = proveedores.find((x) => x.razonSocial === v.toUpperCase());
            // VARIOS/SIN DATOS pone 010101; al cambiar a otro proveedor, el 010101 se limpia
            const ruc = esProveedorVarios(v) ? RUC_VARIOS : p?.ruc ?? "";
            setD((x) => ({ ...x, proveedor: v, ruc: esProveedorVarios(v) || p ? ruc : x.ruc === RUC_VARIOS ? "" : x.ruc }));
          }} onFocus={(e) => esProveedorVarios(d.proveedor) && e.target.select()} placeholder="Razón social o nombre" className={ocr("proveedor")} />
          {esProveedorVarios(d.proveedor) && (
            <span className="mt-1 block text-xs text-plomo-500">
              Por defecto (N° {RUC_VARIOS}). Escriba encima o elija otro de la lista; si escribe un RUC real, se pone la razón social de SUNAT.
            </span>
          )}
          <datalist id="proveedores-gasto">
            <option value={PROVEEDOR_VARIOS}>{RUC_VARIOS}</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.razonSocial}>
                {p.ruc}
              </option>
            ))}
          </datalist>
        </Field>
        <Field
          label={d.comprobante === "FACTURA" ? "RUC *" : d.comprobante === "DJ" ? "DNI *" : esRHE ? "RUC (10…) / DNI *" : "RUC / DNI"}
          hint={rucMal ? "⚠ Dígito verificador inválido" : undefined}
        >
          <Input
            value={d.ruc}
            maxLength={d.comprobante === "DJ" ? 8 : 11}
            onFocus={(e) => d.ruc === RUC_VARIOS && e.target.select()}
            inputMode="numeric"
            onChange={(e) => {
              const ruc = e.target.value.replace(/\D/g, "");
              revisado("ruc");
              // RUC ya validado en el sistema: reemplaza PROVEEDORES VARIOS por su razón social
              const sunat = ruc.length === 11 ? rucSunat(ruc) : undefined;
              setD((x) => ({ ...x, ruc, proveedor: sunat ? sunat.razon_social : x.proveedor }));
            }}
            className={cn(ocr("ruc"), d.ruc.length === 11 && (rucMal ? "border-red-400" : "border-emerald-400"))}
          />
          <EstadoRuc
            ruc={d.ruc}
            onValidado={(r) => {
              setD((x) => ({ ...x, proveedor: r.razon_social }));
              revisado("proveedor");
            }}
            onDni={(r) => setD((x) => ({ ...x, proveedor: nombreDesdeDni(r) }))}
          />
        </Field>

        {/* Cotización emitida por el proveedor (o código interno si no la entregó) */}
        <div className="rounded-xl border border-plomo-200 p-4 md:col-span-3">
          <p className="text-sm font-semibold text-fg">Cotización del proveedor</p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <Field label={sinCotizacion ? "Código de cotización" : "N° de cotización del proveedor *"} hint={sinCotizacion ? "Se genera solo al guardar (correlativo del año)" : "Tal como figura en la cotización"}>
              <Input
                value={sinCotizacion ? "" : d.cotizacion ?? ""}
                disabled={sinCotizacion}
                maxLength={40}
                onChange={(e) => set("cotizacion", e.target.value.toUpperCase())}
                placeholder={sinCotizacion ? "COT-PROV-0001-2026" : "Ej: COT-2026-0154"}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 self-center text-sm text-fg md:col-span-2">
              <input type="checkbox" checked={sinCotizacion} onChange={(e) => setSinCotizacion(e.target.checked)} className="h-4 w-4 accent-corp" />
              El proveedor no entregó cotización: generar código automático
            </label>
          </div>
          {!sinCotizacion && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <input ref={refCotizacion} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => adjuntar("COTIZACION", e.target.files?.[0])} />
              {archivo("COTIZACION") ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-plomo-200 px-3 py-2">
                  <Paperclip size={14} className="text-emerald-600" /> <span className="max-w-[220px] truncate font-medium">{archivo("COTIZACION")?.nombre}</span>
                  <button type="button" onClick={() => setD((x) => ({ ...x, archivos: x.archivos.filter((y) => y.tipo !== "COTIZACION") }))} className="text-red-500" aria-label="Quitar cotización">
                    <X size={14} />
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => refCotizacion.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-plomo-200 px-3 py-2 text-plomo-600 hover:text-fg">
                  <FileUp size={14} /> Adjuntar cotización (opcional)
                </button>
              )}
              <span className="text-xs text-slate-400">PDF o imagen · máx. 1.5 MB</span>
            </div>
          )}
        </div>

        {/* Retención de 4ta categoría (RHE por más de S/ 1,500) */}
        {esRHE && (
          <div className="rounded-xl border border-plomo-200 p-4 md:col-span-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-fg">
              <input type="checkbox" checked={d.retencion ?? true} onChange={(e) => set("retencion", e.target.checked)} className="h-4 w-4 accent-corp" />
              Retención 4ta categoría ({PORC_RETENCION_RHE} %)
            </label>
            <p className="mt-1 text-xs text-plomo-500">
              {(d.importe || 0) > TOPE_RETENCION_RHE
                ? "Aplica: el recibo supera S/ 1,500. Desmárquela solo si el emisor tiene suspensión de retenciones (Formulario 1609)."
                : `No aplica: el recibo no supera ${soles(TOPE_RETENCION_RHE)}.`}
            </p>
            {retencion > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                  Retención: <b>{soles(retencion)}</b>
                </div>
                <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                  Neto a pagar: <b>{soles(neto)}</b>
                </div>
              </div>
            )}
          </div>
        )}

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
          {(d.detraccion || retencion > 0) && (
            <>
              {" "}
              · neto a pagar <b className="text-emerald-700">{soles(neto)}</b>
            </>
          )}
        </p>
        {/* data-guardar-pestana: abierta desde el INICIO, este botón va en la barra inferior (un solo botón de guardar) */}
        <Button variant={pagar ? "success" : "warning"} onClick={guardar} disabled={!fechaISO || guardando} className="px-5 py-2.5" data-guardar-pestana>
          <Receipt size={16} /> {guardando ? "Guardando…" : pagar ? "Registrar y pagar" : "Registrar gasto (por pagar)"}
        </Button>
      </div>
    </Card>
  );
}
