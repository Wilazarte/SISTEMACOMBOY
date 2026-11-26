"use client";

import { useRef, useState } from "react";
import { Camera, FileUp, ScanLine, X } from "lucide-react";
import { Button, cn, toast } from "@/components/ui";
import { MAX_ARCHIVO, hoy, soles, subirComprobanteGasto } from "@/lib/storage";
import { NOMBRE_ELECTRONICO, itemsDeLista, parseFactura, renglonesDePalabras, type FacturaLeida, type ItemLeido } from "@/lib/parseFactura";
import type { ArchivoGasto, Rol } from "@/lib/types";
import { VincularNota } from "@/components/compras/VincularNota";

/** Monto en soles o, si el comprobante es en dólares, en US$. */
const dinero = (n: number, usd: boolean) => (usd ? `US$ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : soles(n));

/** Resultado del último escaneo, para el aviso bajo el botón. */
type Ultimo = {
  nombre: string;
  tipoNombre?: string;
  detectados: string[];
  faltan: string[];
  igvMal: boolean;
  items: ItemLeido[];
  conIgv?: boolean;
  usd: boolean;
  /** No se cargó al formulario (no es electrónico, o es nota de crédito / débito). */
  rechazo?: string;
  guia?: boolean;
  /** Nota de crédito / débito leída (se vincula abajo). */
  nota?: string;
  /** Cotización / proforma del proveedor (Registrar gasto). */
  cotizacion?: boolean;
};
const vacioUltimo = (nombre: string): Ultimo => ({ nombre, detectados: [], faltan: [], igvMal: false, items: [], usd: false });

/** Lado mayor de la imagen que se lee y se guarda: nítida para el OCR y liviana para Storage. */
const LADO_MAX = 2200;

export interface ResultadoEscaneo {
  datos: FacturaLeida;
  /** La imagen / PDF escaneado, listo para d.archivos (tipo FACTURA). */
  archivo?: ArchivoGasto;
  texto: string;
  /** Registrar gasto: se escaneó una cotización / proforma del proveedor (N° leído, o "" si no se leyó). */
  cotizacion?: string;
}

const cargarImagen = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((ok, mal) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("No se pudo abrir la imagen. Use JPG, PNG o WEBP."));
    };
    img.src = url;
  });

const aBlob = (c: HTMLCanvasElement, calidad: number): Promise<Blob> =>
  new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo preparar la imagen."))), "image/jpeg", calidad));

/** Foto del celular (3-8 MB) → lienzo de máx. 2200 px + JPEG de menos de 1.5 MB para guardar. */
async function prepararImagen(file: File): Promise<{ lienzo: HTMLCanvasElement; jpeg: Blob }> {
  const img = await cargarImagen(file);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  let jpeg = await aBlob(c, 0.85);
  for (const q of [0.7, 0.55, 0.4]) {
    if (jpeg.size <= MAX_ARCHIVO) break;
    jpeg = await aBlob(c, q);
  }
  return { lienzo: c, jpeg };
}

/** PDF: primero su texto (facturas electrónicas); si es un PDF escaneado, la 1.ª página como imagen para el OCR. */
async function leerPdf(file: File): Promise<{ texto: string; lienzo?: HTMLCanvasElement }> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pagina = await pdf.getPage(1);
    const contenido = await pagina.getTextContent();
    // Une los trozos por renglón (misma altura) para que "IMPORTE TOTAL ... 118.00" quede en una línea
    const renglones = new Map<number, { x: number; s: string }[]>();
    for (const it of contenido.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      renglones.set(y, [...(renglones.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    const texto = [...renglones.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map((t) => t.s).join(" "))
      .join("\n");
    if (texto.replace(/\s/g, "").length > 40) return { texto };
    const vp = pagina.getViewport({ scale: 2.5 });
    const c = document.createElement("canvas");
    c.width = Math.ceil(vp.width);
    c.height = Math.ceil(vp.height);
    await pagina.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    return { texto: "", lienzo: c };
  } finally {
    void pdf.destroy();
  }
}

/** Le falta algún dato principal a lo leído (RUC, fecha, serie-número, total o artículos). */
const incompleta = (texto: string) => {
  const d = parseFactura(texto, hoy());
  return !d.ruc || !d.fecha || !d.numero || !d.total || !d.items?.length;
};

/**
 * OCR en español con Tesseract.js (se carga solo al escanear: no pesa en el resto del ERP).
 * 1.ª pasada: página completa. Si falta un dato (típico: el RUC dentro del recuadro de la cabecera), 2.ª pasada en
 * modo "texto disperso", que lee recuadros y columnas sueltas; parseFactura toma lo de la 1.ª y completa con la 2.ª.
 */
async function ocr(imagen: HTMLCanvasElement, progreso: (p: number, pasada: 1 | 2) => void): Promise<string> {
  const { createWorker, PSM } = await import("tesseract.js");
  let pasada: 1 | 2 = 1;
  const worker = await createWorker("spa", 1, {
    logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && progreso(m.progress, pasada),
  });
  try {
    const primera = (await worker.recognize(imagen)).data.text;
    if (!incompleta(primera)) return primera;
    pasada = 2;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    // Palabras con su posición, rearmadas por renglón: así las celdas de la tabla de artículos quedan en una línea
    const { data } = await worker.recognize(imagen, {}, { text: true, blocks: true });
    const palabras = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    return `${primera}\n${palabras.length ? renglonesDePalabras(palabras) : data.text}`;
  } finally {
    void worker.terminate();
  }
}

/**
 * Dónde se usa el escaneo (Williams 2026-11-24: el mismo botón en todo registro de gasto y en los REQ):
 * - gasto: Registrar gasto (sin stock). Notas de crédito / débito se vinculan al gasto original; una cotización
 *   o proforma del proveedor llena proveedor, RUC, fecha, total y artículos, y su N° y adjunto van a "Cotización del proveedor".
 * - compra: Registrar compra con ingreso a stock (los artículos van a la tabla de productos).
 * - factura: Registrar factura de una OC (número, fecha, total y adjunto).
 * - oc: Emitir orden de compra. Cualquier documento del proveedor (factura, proforma, cotización): elige la
 *   cotización por RUC, compara el total y queda adjunto a la OC.
 * - coti: Registrar cotización. Cotización / proforma del proveedor: RUC, N°, fecha y precios de los productos del
 *   REQ (por parecido del nombre); queda adjunta a la cotización.
 * - req: Nuevo requerimiento de Almacén. Acepta cualquier documento o foto (proforma, lista, cotización):
 *   solo lee los artículos y no adjunta nada.
 */
export type ModoEscaneo = "gasto" | "compra" | "factura" | "req" | "oc" | "coti";

const TEXTOS: Record<ModoEscaneo, { titulo: string; ayuda: string; boton: string; pie: string }> = {
  gasto: {
    titulo: "Escanear comprobante o cotización",
    boton: "Escanear factura o cotización (foto o PDF)",
    ayuda:
      "Factura, boleta, recibo por honorarios, liquidación de compra y guía de remisión electrónicos, y la cotización o proforma del proveedor (las notas de crédito / débito se vinculan a la factura original y le restan o suman). Lee proveedor, RUC, fecha, serie-número o N° de cotización, artículos (cantidad, descripción, precio), total e IGV y rellena el formulario. No guarda: revise y dé Registrar gasto.",
    pie: "Los artículos van a la descripción del gasto y quedan cargados si elige Generar OC u OS (precios con IGV incluido).",
  },
  compra: {
    titulo: "Escanear comprobante electrónico",
    boton: "Escanear Factura (foto o PDF)",
    ayuda:
      "Factura, boleta, liquidación de compra y guía de remisión electrónicas. Lee RUC, fecha, serie-número y los artículos, y llena la tabla de productos (precios con IGV incluido). El comprobante queda adjunto a la compra. No guarda: revise y dé Guardar compra.",
    pie: "Los artículos se cargaron en la tabla de productos con precio CON IGV incluido. Revise que cada uno sea el producto correcto del catálogo.",
  },
  factura: {
    titulo: "Escanear factura electrónica",
    boton: "Escanear Factura (foto o PDF)",
    ayuda: "Lee serie-número, fecha y total de la factura de la OC y la deja adjunta. No guarda: revise y dé Registrar factura.",
    pie: "Compare los artículos leídos con los de la OC antes de registrar.",
  },
  oc: {
    titulo: "Escanear documento del proveedor",
    boton: "Escanear documento (foto o PDF)",
    ayuda:
      "Factura, proforma o cotización del proveedor. Lee el RUC y el total: elige la cotización de ese proveedor, avisa si el total no coincide y deja el documento adjunto a la OC. No emite nada: revise y dé Emitir OC.",
    pie: "Compare los artículos leídos con los de la cotización antes de emitir.",
  },
  coti: {
    titulo: "Escanear cotización del proveedor",
    boton: "Escanear cotización (foto o PDF)",
    ayuda:
      "Cotización o proforma del proveedor. Lee RUC, N° de cotización, fecha y los precios, y los pone en los productos del REQ que se parecen por nombre. El documento queda adjunto. No guarda: revise los precios y dé Guardar cotización.",
    pie: "Los precios se pasaron a los productos del REQ con nombre parecido (con IGV incluido). Revise los que quedaron en 0.",
  },
  req: {
    titulo: "Escanear documento o imagen",
    boton: "Escanear documento (foto o PDF)",
    ayuda:
      "Proforma, cotización, factura, guía o una lista de productos con columnas de cantidad y descripción. Lee los artículos y los pone en la tabla del requerimiento. No envía nada: revise cada producto y dé Emitir.",
    pie: "Los artículos se cargaron en la tabla del requerimiento. Elija el producto correcto del catálogo en cada línea.",
  },
};

/**
 * Botón "Escanear factura": foto o PDF del comprobante → OCR (Tesseract, español) → parseFactura →
 * devuelve los datos para rellenar el formulario. No guarda nada: el usuario revisa y da Guardar.
 */
export function EscanearGasto({ onLeido, rol, modo = "gasto" }: { onLeido: (r: ResultadoEscaneo) => void; /** Solo para vincular notas de crédito / débito (modo gasto). */ rol?: Rol; modo?: ModoEscaneo }) {
  const txt = TEXTOS[modo];
  // Nota de crédito / débito escaneada, a la espera de vincularla al gasto original
  const [nota, setNota] = useState<{ datos: FacturaLeida; archivo: Blob; nombre: string } | null>(null);
  const refCamara = useRef<HTMLInputElement>(null);
  const refArchivo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"" | "preparando" | "leyendo" | "subiendo">("");
  const [progreso, setProgreso] = useState(0);
  const [pasada, setPasada] = useState<1 | 2>(1);
  const avance = (p: number, n: 1 | 2) => {
    setProgreso(p);
    setPasada(n);
  };
  const [ultimo, setUltimo] = useState<Ultimo | null>(null);
  const ocupado = estado !== "";

  const escanear = async (file?: File) => {
    if (!file) return;
    const esPdf = file.type === "application/pdf";
    if (!esPdf && !/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast("Escanee una foto (JPG, PNG, WEBP) o un PDF del comprobante.", "error");
    if (esPdf && file.size > MAX_ARCHIVO) return toast(`El PDF pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    setUltimo(null);
    setNota(null);
    avance(0, 1);
    setEstado("preparando");
    try {
      let texto = "";
      let guardar: Blob = file;
      let nombre = file.name;
      if (esPdf) {
        const r = await leerPdf(file);
        texto = r.texto;
        if (r.lienzo) {
          setEstado("leyendo");
          texto = await ocr(r.lienzo, avance);
        }
      } else {
        const { lienzo, jpeg } = await prepararImagen(file);
        guardar = jpeg;
        nombre = nombre.replace(/\.(png|jpe?g|webp|heic)$/i, "") + ".jpg";
        setEstado("leyendo");
        texto = await ocr(lienzo, avance);
      }
      const datos = parseFactura(texto, hoy());
      const tipo = datos.tipoElectronico;
      // Requerimiento: cualquier documento sirve; solo interesan los artículos (no se adjunta nada)
      if (modo === "req") {
        // Sin precios (lista escrita): cada renglón que empieza con una cantidad es un artículo
        const items = datos.items?.length ? datos.items : itemsDeLista(texto);
        datos.items = items;
        setUltimo({ ...vacioUltimo(nombre), tipoNombre: tipo ? NOMBRE_ELECTRONICO[tipo] : undefined, detectados: items.length ? [`${items.length} artículo(s)`] : [], faltan: items.length ? [] : ["artículos"], items, usd: datos.moneda === "USD" });
        onLeido({ datos, texto });
        return toast(items.length ? `${items.length} artículo(s) leído(s): revise la tabla del requerimiento.` : "No se reconocieron artículos: llene la tabla a mano.", items.length ? "ok" : "error");
      }
      // Registrar gasto: cotización / proforma del proveedor. Llena proveedor, RUC, fecha, total y artículos, y su N° y
      // adjunto van al bloque "Cotización del proveedor" (el N° de la factura se escribe después)
      if (!tipo && modo === "gasto" && datos.esCotizacion) {
        setEstado("subiendo");
        let archivo: ArchivoGasto | undefined;
        try {
          const { ref } = await subirComprobanteGasto(guardar);
          archivo = { tipo: "COTIZACION", nombre, mime: guardar.type, dataUrl: ref };
        } catch (e) {
          toast(`Se leyó la cotización pero no se pudo adjuntar: ${(e as Error).message}. Adjúntela abajo.`, "error");
        }
        const n = datos.numeroCotizacion ?? "";
        const etiquetas: [keyof FacturaLeida, string][] = [
          ["numeroCotizacion", "N° de cotización"],
          ["razonSocial", "proveedor"],
          ["ruc", "RUC"],
          ["fecha", "fecha"],
          ["total", "total"],
          ["items", "artículos"],
        ];
        const detectados = etiquetas.filter(([k]) => datos[k] !== undefined).map(([, l]) => l);
        const faltan = etiquetas.filter(([k]) => datos[k] === undefined && k !== "razonSocial").map(([, l]) => l);
        setUltimo({ nombre, tipoNombre: "Cotización del proveedor", detectados, faltan, igvMal: datos.igvCuadra === false, items: datos.items ?? [], conIgv: datos.itemsConIgv, usd: datos.moneda === "USD", cotizacion: true });
        onLeido({ datos, archivo, texto, cotizacion: n });
        return toast(detectados.length > 1 ? "Cotización leída: revise los campos en amarillo y escriba el N° de la factura." : "Cotización adjuntada: complete el formulario a mano.", detectados.length > 1 ? "ok" : "error");
      }
      // Solo comprobantes electrónicos SUNAT: lo demás (tickets, notas internas, fotos sueltas) no se escanea
      // (la OC sí acepta proformas y cotizaciones del proveedor)
      if (!tipo && modo !== "oc" && modo !== "coti") {
        setUltimo({ ...vacioUltimo(nombre), rechazo: `No se reconoce como comprobante electrónico. Solo se escanean: ${Object.values(NOMBRE_ELECTRONICO).join(", ")}.` });
        return toast("No es un comprobante electrónico: regístrelo a mano.", "error");
      }
      // Nota de crédito / débito: no es un gasto nuevo; se vincula al gasto del comprobante original (en Registrar gasto)
      if (tipo && (tipo === "NOTA_CREDITO" || tipo === "NOTA_DEBITO") && modo !== "gasto") {
        setUltimo({ ...vacioUltimo(nombre), tipoNombre: NOMBRE_ELECTRONICO[tipo], rechazo: `Es una ${NOMBRE_ELECTRONICO[tipo].toLowerCase()}: escanéela en Registrar gasto (Gasto / Servicio sin stock) para vincularla a la factura original.` });
        return toast(`${NOMBRE_ELECTRONICO[tipo]}: escanéela en Registrar gasto.`, "error");
      }
      if (tipo === "NOTA_CREDITO" || tipo === "NOTA_DEBITO") {
        setUltimo({
          ...vacioUltimo(nombre),
          tipoNombre: NOMBRE_ELECTRONICO[tipo],
          nota: `${datos.numero ?? ""}${datos.referencia ? ` · modifica ${datos.referencia}` : ""}${datos.total ? ` · ${dinero(datos.total, datos.moneda === "USD")}` : ""}`,
        });
        setNota({ datos, archivo: guardar, nombre });
        return toast(`${NOMBRE_ELECTRONICO[tipo]} leída: vincúlela a la factura original.`);
      }
      setEstado("subiendo");
      const esGuia = tipo === "GUIA";
      let archivo: ArchivoGasto | undefined;
      try {
        const { ref } = await subirComprobanteGasto(guardar);
        archivo = { tipo: esGuia ? "GUIA" : tipo && modo !== "coti" ? "FACTURA" : "COTIZACION", nombre, mime: guardar.type, dataUrl: ref };
      } catch (e) {
        toast(`Se leyó el comprobante pero no se pudo adjuntar: ${(e as Error).message}. Adjúntelo abajo.`, "error");
      }
      // Guía de remisión: sustenta el traslado; solo se adjunta (el importe sale de la factura)
      if (esGuia) {
        setUltimo({ ...vacioUltimo(nombre), tipoNombre: NOMBRE_ELECTRONICO.GUIA, detectados: [datos.numero ?? "guía"], guia: true });
        onLeido({ datos: { tipoElectronico: "GUIA" }, archivo, texto });
        return toast(`Guía de remisión ${datos.numero ?? ""} adjuntada${modo === "compra" ? " a la compra" : modo === "factura" ? " a la factura" : " al gasto"}.`);
      }
      const etiquetas: [keyof FacturaLeida, string][] = [
        ["ruc", "RUC"],
        ["fecha", "fecha"],
        ["numero", "serie-número"],
        ["total", "total"],
        ["igv", "IGV"],
        ["items", "artículos"],
      ];
      // Boleta y recibo por honorarios no desglosan IGV
      const sinIgv = datos.comprobante === "BOLETA" || datos.comprobante === "RXH";
      const detectados = etiquetas.filter(([k]) => datos[k] !== undefined).map(([, l]) => l);
      const faltan = etiquetas.filter(([k]) => datos[k] === undefined && !(k === "igv" && sinIgv)).map(([, l]) => l);
      const tipoNombre = tipo ? NOMBRE_ELECTRONICO[tipo] : "Documento";
      setUltimo({ nombre, tipoNombre, detectados, faltan, igvMal: datos.igvCuadra === false, items: datos.items ?? [], conIgv: datos.itemsConIgv, usd: datos.moneda === "USD" });
      onLeido({ datos, archivo, texto });
      toast(detectados.length ? `${tipoNombre} leído: revise los campos en amarillo y dé Guardar.` : "No se reconocieron datos: complete el formulario a mano.", detectados.length ? "ok" : "error");
    } catch (e) {
      toast(`No se pudo leer el comprobante: ${(e as Error).message}`, "error");
    } finally {
      setEstado("");
      if (refCamara.current) refCamara.current.value = "";
      if (refArchivo.current) refArchivo.current.value = "";
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-corp/40 bg-corp/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScanLine size={18} className="text-corp" />
        <span className="mr-auto text-sm font-semibold text-fg">{txt.titulo}</span>
        <input ref={refCamara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escanear(e.target.files?.[0])} />
        <input ref={refArchivo} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => escanear(e.target.files?.[0])} />
        <Button type="button" size="sm" onClick={() => refCamara.current?.click()} disabled={ocupado} className="md:hidden">
          <Camera size={14} /> Tomar foto
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => refArchivo.current?.click()} disabled={ocupado}>
          <FileUp size={14} /> {txt.boton}
        </Button>
      </div>
      <p className="mt-1 text-xs text-plomo-500">{txt.ayuda}</p>
      {ocupado && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-plomo-100">
            <div className="h-full bg-corp transition-all" style={{ width: `${estado === "leyendo" ? Math.max(5, Math.round(progreso * 100)) : estado === "subiendo" ? 100 : 3}%` }} />
          </div>
          <p className="mt-1 text-xs text-plomo-600">
            {estado === "preparando" ? "Preparando el comprobante…" : estado === "leyendo" ? `${pasada === 2 ? "Segunda lectura (recuadros y columnas)" : "Leyendo texto (OCR en español)"}… ${Math.round(progreso * 100)} %` : "Adjuntando la imagen…"}
          </p>
        </div>
      )}
      {ultimo && !ocupado && (
        <div className={cn("mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs", ultimo.rechazo ? "bg-red-50 text-red-800" : ultimo.faltan.length || ultimo.igvMal || ultimo.usd ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
          <div className="mr-auto">
            <b>{ultimo.nombre}</b>
            {ultimo.tipoNombre && <> · <b>{ultimo.tipoNombre}</b></>}
            {ultimo.rechazo ? (
              <span className="mt-1 block font-semibold">{ultimo.rechazo}</span>
            ) : ultimo.nota ? (
              <> · {ultimo.nota}</>
            ) : ultimo.guia ? (
              <> · {ultimo.detectados.join(", ")} · adjuntada como guía de remisión</>
            ) : (
              <> · detectado: {ultimo.detectados.join(", ") || "nada"}</>
            )}
            {ultimo.cotizacion && !ultimo.rechazo && (
              <span className="mt-1 block">Datos tomados de la cotización: escriba el <b>N° de la factura o boleta</b> cuando la entregue y confirme la fecha del comprobante.</span>
            )}
            {ultimo.faltan.length > 0 && <> · <b>revisar:</b> {ultimo.faltan.join(", ")}</>}
            {ultimo.igvMal && <> · <b>el IGV leído no es el 18 % del total: revise el importe</b></>}
            {ultimo.usd && modo !== "req" && (
              <span className="mt-1 block font-semibold text-amber-900">
                {modo === "gasto"
                  ? "Comprobante en DÓLARES (US$): se puso la moneda US$. Confirme el tipo de cambio: el importe y la OC / OS se pasan a soles solos."
                  : "Comprobante en DÓLARES (US$): confirme el tipo de cambio abajo; los precios y el total se pasan a soles solos."}
              </span>
            )}
          </div>
          <button type="button" onClick={() => setUltimo(null)} aria-label="Cerrar aviso" className="opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
      {nota && rol && !ocupado && (
        <VincularNota
          datos={nota.datos}
          archivo={nota.archivo}
          nombreArchivo={nota.nombre}
          rol={rol}
          onListo={() => {
            setNota(null);
            setUltimo(null);
          }}
        />
      )}
      {ultimo && !ocupado && ultimo.items.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-plomo-200 bg-surface">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="bg-plomo-100 text-[10px] font-semibold uppercase tracking-wide text-plomo-600">
              <tr>
                <th className="px-2 py-1.5 text-right">Cant.</th>
                <th className="px-2 py-1.5 text-left">Und.</th>
                <th className="px-2 py-1.5 text-left">Descripción leída</th>
                {modo !== "req" && <th className="px-2 py-1.5 text-right">P. unit.</th>}
                {modo !== "req" && <th className="px-2 py-1.5 text-right">Importe</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-plomo-100">
              {ultimo.items.map((i, k) => (
                <tr key={k}>
                  <td className="px-2 py-1 text-right">{i.cantidad}</td>
                  <td className="px-2 py-1">{i.unidad}</td>
                  <td className="px-2 py-1">{i.descripcion}</td>
                  {modo !== "req" && <td className="px-2 py-1 text-right">{dinero(i.precioUnit, ultimo.usd)}</td>}
                  {modo !== "req" && <td className="px-2 py-1 text-right font-semibold">{dinero(i.importe, ultimo.usd)}</td>}
                </tr>
              ))}
            </tbody>
            {modo !== "req" && <tfoot>
              <tr className="border-t border-plomo-200">
                <td colSpan={4} className="px-2 py-1.5 text-right text-plomo-600">
                  Suma de artículos{ultimo.conIgv === true ? " (con IGV, cuadra con el total)" : ultimo.conIgv === false ? " (sin IGV, cuadra con la op. gravada)" : " (no cuadra con el total: revise)"}
                </td>
                <td className={cn("px-2 py-1.5 text-right font-bold", ultimo.conIgv === undefined && "text-amber-700")}>{dinero(ultimo.items.reduce((a, i) => a + i.importe, 0), ultimo.usd)}</td>
              </tr>
            </tfoot>}
          </table>
          <p className="px-2 py-1.5 text-[11px] text-plomo-500">{txt.pie}</p>
        </div>
      )}
    </div>
  );
}
