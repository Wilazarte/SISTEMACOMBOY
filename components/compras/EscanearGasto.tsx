"use client";

import { useRef, useState } from "react";
import { Camera, FileUp, ScanLine, X } from "lucide-react";
import { Button, cn, toast } from "@/components/ui";
import { MAX_ARCHIVO, hoy, subirComprobanteGasto } from "@/lib/storage";
import { parseFactura, type FacturaLeida } from "@/lib/parseFactura";
import type { ArchivoGasto } from "@/lib/types";

/** Lado mayor de la imagen que se lee y se guarda: nítida para el OCR y liviana para Storage. */
const LADO_MAX = 2200;

export interface ResultadoEscaneo {
  datos: FacturaLeida;
  /** La imagen / PDF escaneado, listo para d.archivos (tipo FACTURA). */
  archivo?: ArchivoGasto;
  texto: string;
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

/** Le falta algún dato principal a lo leído (RUC, fecha, serie-número o total). */
const incompleta = (texto: string) => {
  const d = parseFactura(texto, hoy());
  return !d.ruc || !d.fecha || !d.numero || !d.total;
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
    const segunda = (await worker.recognize(imagen)).data.text;
    return `${primera}\n${segunda}`;
  } finally {
    void worker.terminate();
  }
}

/**
 * Botón "Escanear factura" de Registrar gasto: foto o PDF del comprobante → OCR (Tesseract, español) →
 * parseFactura → devuelve los datos para rellenar el formulario. No guarda nada: el usuario revisa y da Guardar.
 */
export function EscanearGasto({ onLeido }: { onLeido: (r: ResultadoEscaneo) => void }) {
  const refCamara = useRef<HTMLInputElement>(null);
  const refArchivo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"" | "preparando" | "leyendo" | "subiendo">("");
  const [progreso, setProgreso] = useState(0);
  const [pasada, setPasada] = useState<1 | 2>(1);
  const avance = (p: number, n: 1 | 2) => {
    setProgreso(p);
    setPasada(n);
  };
  const [ultimo, setUltimo] = useState<{ nombre: string; detectados: string[]; faltan: string[]; igvMal: boolean } | null>(null);
  const ocupado = estado !== "";

  const escanear = async (file?: File) => {
    if (!file) return;
    const esPdf = file.type === "application/pdf";
    if (!esPdf && !/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast("Escanee una foto (JPG, PNG, WEBP) o un PDF del comprobante.", "error");
    if (esPdf && file.size > MAX_ARCHIVO) return toast(`El PDF pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    setUltimo(null);
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
      setEstado("subiendo");
      let archivo: ArchivoGasto | undefined;
      try {
        const { ref } = await subirComprobanteGasto(guardar);
        archivo = { tipo: "FACTURA", nombre, mime: guardar.type, dataUrl: ref };
      } catch (e) {
        toast(`Se leyó el comprobante pero no se pudo adjuntar la imagen: ${(e as Error).message}. Adjúntela abajo.`, "error");
      }
      const datos = parseFactura(texto, hoy());
      const etiquetas: [keyof FacturaLeida, string][] = [
        ["ruc", "RUC"],
        ["fecha", "fecha"],
        ["numero", "serie-número"],
        ["total", "total"],
        ["igv", "IGV"],
      ];
      const detectados = etiquetas.filter(([k]) => datos[k] !== undefined).map(([, l]) => l);
      const faltan = etiquetas.filter(([k]) => datos[k] === undefined && !(k === "igv" && datos.comprobante === "BOLETA")).map(([, l]) => l);
      setUltimo({ nombre, detectados, faltan, igvMal: datos.igvCuadra === false });
      onLeido({ datos, archivo, texto });
      toast(detectados.length ? `Comprobante leído: revise los campos en amarillo y dé Guardar.` : "No se reconocieron datos: complete el formulario a mano.", detectados.length ? "ok" : "error");
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
        <span className="mr-auto text-sm font-semibold text-fg">Escanear factura</span>
        <input ref={refCamara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escanear(e.target.files?.[0])} />
        <input ref={refArchivo} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => escanear(e.target.files?.[0])} />
        <Button type="button" size="sm" onClick={() => refCamara.current?.click()} disabled={ocupado} className="md:hidden">
          <Camera size={14} /> Tomar foto
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => refArchivo.current?.click()} disabled={ocupado}>
          <FileUp size={14} /> Escanear Factura (foto o PDF)
        </Button>
      </div>
      <p className="mt-1 text-xs text-plomo-500">
        Lee RUC, fecha, serie-número (F001-1234), total e IGV y rellena el formulario. No guarda: revise y dé Registrar gasto.
      </p>
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
        <div className={cn("mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs", ultimo.faltan.length || ultimo.igvMal ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
          <div className="mr-auto">
            <b>{ultimo.nombre}</b> · detectado: {ultimo.detectados.join(", ") || "nada"}
            {ultimo.faltan.length > 0 && <> · <b>revisar:</b> {ultimo.faltan.join(", ")}</>}
            {ultimo.igvMal && <> · <b>el IGV leído no es el 18 % del total: revise el importe</b></>}
          </div>
          <button type="button" onClick={() => setUltimo(null)} aria-label="Cerrar aviso" className="opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
