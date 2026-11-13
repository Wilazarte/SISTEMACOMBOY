"use client";

// Ventana pequeña de vista previa de PDF (lib/visorPdf.ts › mostrarPDF). Recién aquí están Imprimir,
// Compartir por WhatsApp, Descargar y Firma virtual. Se monta una vez por layout, junto al <Toaster />.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, MessageCircle, MousePointerClick, PenLine, Printer, Trash2, X } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { FirmaPad } from "@/components/FirmaPad";
import { getSesion } from "@/lib/auth";
import { EV_PDF, descargarBytes, marcarHostVisor, type PdfVista, type ZonaFirma } from "@/lib/visorPdf";

/** Firma estampada: centro de la línea (mm) como las de lib/pdf.ts › firmas(). */
interface Firma {
  pagina: number;
  x: number;
  y: number;
  png: string;
  nombre: string;
  fecha: string;
}

interface Pagina {
  url: string;
  /** Tamaño en mm */
  w: number;
  h: number;
}

const MM = 72 / 25.4; // pt por mm
const ANCHO_FIRMA = 44; // mm (igual que la firma del cliente en lib/pdf.ts)
const CLAVE_FIRMA = "erp_firma_virtual";

const leerFirmaGuardada = (): string | undefined => {
  try {
    return localStorage.getItem(CLAVE_FIRMA) ?? undefined;
  } catch {
    return undefined;
  }
};

const fechaHora = () => new Date().toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Estampa las firmas sobre una copia del PDF original (pdf-lib). Sin firmas devuelve el original. */
async function estampar(original: ArrayBuffer, firmas: Firma[]): Promise<Uint8Array> {
  if (!firmas.length) return new Uint8Array(original);
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(original);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const imagenes = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  for (const f of firmas) {
    const pagina = pdf.getPage(Math.min(Math.max(f.pagina, 1), pdf.getPageCount()) - 1);
    const H = pagina.getHeight();
    let img = imagenes.get(f.png);
    if (!img) {
      img = await pdf.embedPng(f.png);
      imagenes.set(f.png, img);
    }
    const w = ANCHO_FIRMA * MM;
    const h = (w * img.height) / img.width;
    // La firma queda apoyada sobre la línea (1 mm por encima)
    pagina.drawImage(img, { x: f.x * MM - w / 2, y: H - (f.y - 1) * MM, width: w, height: h });
    const texto = `Firma virtual: ${f.nombre} · ${f.fecha}`;
    const t = 6;
    pagina.drawText(texto, { x: f.x * MM - fuente.widthOfTextAtSize(texto, t) / 2, y: H - (f.y + 7.5) * MM, size: t, font: fuente, color: rgb(0.39, 0.45, 0.55) });
  }
  return pdf.save();
}

/** Dibuja cada página del PDF como imagen (pdf.js): se ve igual en PC, celular, app Windows y APK. */
async function renderizar(bytes: Uint8Array): Promise<Pagina[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const paginas: Pagina[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const base = p.getViewport({ scale: 1 });
    const vp = p.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    await p.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    paginas.push({ url: canvas.toDataURL("image/png"), w: base.width / MM, h: base.height / MM });
  }
  void doc.destroy();
  return paginas;
}

const esMovil = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const esAppEscritorio = () => typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

/** Imprime las páginas ya dibujadas (celular / app): un contenedor solo visible al imprimir. */
function imprimirImagenes(paginas: Pagina[]): void {
  const id = "erp-impresion-pdf";
  document.getElementById(id)?.remove();
  const caja = document.createElement("div");
  caja.id = id;
  caja.innerHTML =
    `<style>@media screen{#${id}{display:none}}@media print{@page{margin:0}body>*:not(#${id}){display:none!important}#${id} img{display:block;width:100%;page-break-after:always;break-after:page}#${id} img:last-child{page-break-after:auto;break-after:auto}}</style>` +
    paginas.map((p) => `<img src="${p.url}" alt="">`).join("");
  document.body.appendChild(caja);
  const fin = () => {
    caja.remove();
    window.removeEventListener("afterprint", fin);
  };
  window.addEventListener("afterprint", fin);
  setTimeout(() => window.print(), 150);
}

export function VisorPDF() {
  const [vista, setVista] = useState<PdfVista | null>(null);
  const [firmas, setFirmas] = useState<Firma[]>([]);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [cargando, setCargando] = useState(false);
  const [panelFirma, setPanelFirma] = useState(false);
  const [png, setPng] = useState<string | undefined>();
  const [nombre, setNombre] = useState("");
  const [ubicando, setUbicando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const iframe = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    marcarHostVisor(true);
    const on = (e: Event) => {
      const v = (e as CustomEvent<PdfVista>).detail;
      setVista(v);
      setFirmas([]);
      setPanelFirma(false);
      setUbicando(false);
      setPaginas([]);
      setBytes(null);
    };
    window.addEventListener(EV_PDF, on);
    return () => {
      window.removeEventListener(EV_PDF, on);
      marcarHostVisor(false);
    };
  }, []);

  // PDF con las firmas estampadas → páginas para la vista previa
  useEffect(() => {
    if (!vista) return;
    let vivo = true;
    setCargando(true);
    (async () => {
      try {
        const b = await estampar(vista.bytes, firmas);
        const p = await renderizar(b);
        if (!vivo) return;
        setBytes(b);
        setPaginas(p);
      } catch (e) {
        console.error(e);
        if (vivo) toast("No se pudo mostrar la vista previa del PDF", "error");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [vista, firmas]);

  const cerrar = useCallback(() => {
    setVista(null);
    iframe.current?.remove();
    iframe.current = null;
  }, []);

  useEffect(() => {
    if (!vista) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (ubicando ? setUbicando(false) : cerrar());
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [vista, ubicando, cerrar]);

  if (!vista) return null;
  const archivo = `${vista.nombre}.pdf`;
  const listo = !!bytes && !cargando;

  const imprimir = () => {
    if (!bytes) return;
    if (esMovil() || esAppEscritorio()) return imprimirImagenes(paginas);
    try {
      iframe.current?.remove();
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      f.src = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      f.onload = () => {
        try {
          f.contentWindow?.focus();
          f.contentWindow?.print();
        } catch {
          imprimirImagenes(paginas);
        }
      };
      document.body.appendChild(f);
      iframe.current = f;
    } catch {
      imprimirImagenes(paginas);
    }
  };

  // Descargar: ventana "Guardar como" para elegir la carpeta (Chrome / Edge / app Windows).
  // Donde no existe (celular, Firefox, Safari) se descarga a la carpeta de Descargas.
  const descargar = async () => {
    if (!bytes) return;
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (typeof picker !== "function" || esMovil()) return descargarBytes(bytes, vista.nombre);
    try {
      const h = await picker.call(window, { suggestedName: archivo, types: [{ description: "Documento PDF", accept: { "application/pdf": [".pdf"] } }] });
      const w = await h.createWritable();
      await w.write(bytes as unknown as BufferSource);
      await w.close();
      toast(`${h.name} guardado`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // canceló la ventana
      descargarBytes(bytes, vista.nombre);
    }
  };

  const whatsapp = async () => {
    if (!bytes) return;
    const texto = `Le envío el documento ${vista.nombre} - COMBOY VID`;
    const file = new File([bytes as BlobPart], archivo, { type: "application/pdf" });
    setOcupado(true);
    try {
      // Celular / Windows: menú Compartir del sistema con el PDF adjunto (elegir WhatsApp)
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: vista.nombre, text: texto });
        return;
      }
      // Sin menú Compartir: se descarga el PDF y se abre WhatsApp para adjuntarlo
      descargarBytes(bytes, vista.nombre);
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      toast(`${archivo} descargado: adjúntalo en el chat de WhatsApp (clip 📎)`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast("No se pudo compartir el PDF", "error");
    } finally {
      setOcupado(false);
    }
  };

  const abrirFirma = () => {
    setPng((p) => p ?? leerFirmaGuardada());
    setNombre((n) => n || getSesion()?.nombreCompleto || getSesion()?.nombre || "");
    setPanelFirma(true);
  };

  const puedeEstampar = !!png && nombre.trim().length > 1;
  const estamparEn = (z: { pagina: number; x: number; y: number }) => {
    if (!png || !puedeEstampar) return toast("Dibuja tu firma y escribe tu nombre", "error");
    try {
      localStorage.setItem(CLAVE_FIRMA, png);
    } catch {
      /* sin almacenamiento: no se recuerda la firma */
    }
    setFirmas((l) => [...l, { ...z, png, nombre: nombre.trim(), fecha: fechaHora() }]);
    setUbicando(false);
    setPanelFirma(false);
    toast("Firma agregada al PDF");
  };

  const clicPagina = (i: number, ev: React.MouseEvent<HTMLImageElement>) => {
    if (!ubicando) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const p = paginas[i];
    const x = ((ev.clientX - r.left) / r.width) * p.w;
    const y = ((ev.clientY - r.top) / r.height) * p.h;
    // El clic marca el centro de la firma; la "línea" queda 7 mm más abajo
    estamparEn({ pagina: i + 1, x: Math.min(Math.max(x, ANCHO_FIRMA / 2), p.w - ANCHO_FIRMA / 2), y: Math.min(y + 7, p.h - 10) });
  };

  // Sin líneas de firma conocidas (recibos, adjuntos): abajo a la derecha de la última página
  const zonas: ZonaFirma[] = vista.zonas.length
    ? vista.zonas
    : paginas.length
      ? [{ pagina: paginas.length, x: paginas[paginas.length - 1].w - 14 - ANCHO_FIRMA / 2, y: paginas[paginas.length - 1].h - 34, etiqueta: "Abajo a la derecha" }]
      : [];

  const ventana = (
    <div className="fixed inset-0 z-[80] flex animate-velo items-center justify-center bg-black/55 p-2 backdrop-blur-[2px] sm:p-4" onMouseDown={cerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Vista previa ${archivo}`}
        className="flex max-h-[94vh] w-full max-w-3xl animate-emerger flex-col overflow-hidden rounded-2xl border border-plomo-200 bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-plomo-200 px-4 py-3">
          <h3 className="min-w-0 truncate text-[15px] font-semibold text-fg" title={archivo}>
            Vista previa · {archivo}
          </h3>
          <button onClick={cerrar} className="rounded-lg p-1.5 text-plomo-500 transition hover:bg-plomo-100 hover:text-fg" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-plomo-200 px-4 py-2.5">
          <Button size="sm" onClick={imprimir} disabled={!listo}>
            <Printer size={14} /> Imprimir
          </Button>
          <Button size="sm" variant="success" onClick={() => void whatsapp()} disabled={!listo || ocupado} className="!bg-[#128C7E] hover:!bg-[#075E54]">
            <MessageCircle size={14} /> WhatsApp
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void descargar()} disabled={!listo}>
            <Download size={14} /> Descargar
          </Button>
          <Button size="sm" variant="secondary" onClick={panelFirma ? () => setPanelFirma(false) : abrirFirma} disabled={!listo}>
            <PenLine size={14} /> Firmar
          </Button>
          {firmas.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setFirmas((l) => l.slice(0, -1))} title="Quitar la última firma">
              <Trash2 size={14} /> Quitar firma ({firmas.length})
            </Button>
          )}
        </div>

        {panelFirma && (
          <div className="space-y-3 border-b border-plomo-200 bg-plomo-50 px-4 py-3">
            {png ? (
              <div className="flex items-end gap-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-plomo-500">Tu firma</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={png} alt="Firma" className="h-16 rounded-lg border border-plomo-200 bg-white" />
                </div>
                <Button size="sm" variant="ghost" onClick={() => setPng(undefined)}>
                  Dibujar otra
                </Button>
              </div>
            ) : (
              <FirmaPad titulo="Dibuja tu firma" archivo="firma-virtual.png" onChange={(a) => setPng(a?.url)} />
            )}
            <label className="block max-w-sm text-xs font-semibold uppercase tracking-wide text-plomo-500">
              Nombre del firmante
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1 w-full rounded-lg border border-plomo-200 bg-surface px-3 py-1.5 text-sm font-normal normal-case tracking-normal text-fg" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-plomo-500">Firmar en:</span>
              {zonas.map((z, i) => (
                <Button key={i} size="sm" variant="secondary" disabled={!puedeEstampar} onClick={() => estamparEn(z)}>
                  <PenLine size={13} /> {z.etiqueta}
                </Button>
              ))}
              <Button size="sm" variant={ubicando ? "primary" : "ghost"} disabled={!puedeEstampar} onClick={() => setUbicando((u) => !u)}>
                <MousePointerClick size={13} /> {ubicando ? "Toca el PDF donde va la firma…" : "Elegir lugar en el PDF"}
              </Button>
            </div>
          </div>
        )}

        <div className="min-h-[40vh] flex-1 overflow-y-auto bg-plomo-100 p-3">
          {!paginas.length ? (
            <div className="flex h-[50vh] items-center justify-center text-plomo-500">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <div className={`relative mx-auto max-w-[640px] space-y-3 ${cargando ? "opacity-60" : ""}`}>
              {paginas.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={p.url}
                  alt={`Página ${i + 1}`}
                  onClick={(ev) => clicPagina(i, ev)}
                  className={`block w-full rounded bg-white shadow-card ${ubicando ? "cursor-crosshair ring-2 ring-corp" : ""}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
  const raiz = document.querySelector(".tema-planta") ?? document.body;
  return createPortal(ventana, raiz);
}
