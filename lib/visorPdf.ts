"use client";

// =====================================================================
// Vista previa de PDF (Williams, 2026-11-13): ningún PDF del ERP se descarga ni se abre en otra pestaña
// directamente. Todos pasan primero por una ventana pequeña de vista previa (components/VisorPDF.tsx) y recién
// ahí están Imprimir, Compartir por WhatsApp, Descargar y Firmar.
// =====================================================================

import type { jsPDF } from "jspdf";

/** Línea de firma de un PDF (mm, desde la esquina superior izquierda). x = centro de la línea. */
export interface ZonaFirma {
  /** Página 1..n */
  pagina: number;
  x: number;
  y: number;
  etiqueta: string;
}

export interface PdfVista {
  nombre: string;
  bytes: ArrayBuffer;
  zonas: ZonaFirma[];
}

export const EV_PDF = "erp:pdf";
const MARCA_HOST = "__erpVisorPdf";

/** Líneas de firma que dibujó lib/pdf.ts › firmas() en cada documento. */
const zonasPorDoc = new WeakMap<jsPDF, ZonaFirma[]>();

export function registrarZonaFirma(doc: jsPDF, z: ZonaFirma): void {
  const l = zonasPorDoc.get(doc) ?? [];
  l.push(z);
  zonasPorDoc.set(doc, l);
}

export function marcarHostVisor(activo: boolean): void {
  (window as unknown as Record<string, boolean>)[MARCA_HOST] = activo;
}

const hayVisor = () => typeof window !== "undefined" && !!(window as unknown as Record<string, boolean>)[MARCA_HOST];

const limpiarNombre = (n: string) => n.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "documento";

/** Descarga directa (descargas masivas o páginas sin visor). */
export function descargarBytes(bytes: ArrayBuffer | Uint8Array, nombre: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${limpiarNombre(nombre)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Muestra un PDF ya generado (jsPDF) en la ventana de vista previa. */
export function mostrarPDF(doc: jsPDF, nombre: string): void {
  const n = limpiarNombre(nombre);
  doc.setProperties({ title: n });
  const bytes = doc.output("arraybuffer");
  if (!hayVisor()) {
    descargarBytes(bytes, n);
    return;
  }
  const detalle: PdfVista = { nombre: n, bytes, zonas: zonasPorDoc.get(doc) ?? [] };
  window.dispatchEvent(new CustomEvent<PdfVista>(EV_PDF, { detail: detalle }));
}

/** Muestra un PDF que ya existe como archivo (adjunto, URL blob o data:). */
export async function mostrarPDFUrl(url: string, nombre: string): Promise<void> {
  const bytes = await (await fetch(url)).arrayBuffer();
  if (!hayVisor()) {
    descargarBytes(bytes, nombre);
    return;
  }
  window.dispatchEvent(new CustomEvent<PdfVista>(EV_PDF, { detail: { nombre: limpiarNombre(nombre), bytes, zonas: [] } }));
}
