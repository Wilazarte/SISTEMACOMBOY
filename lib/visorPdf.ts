"use client";

// =====================================================================
// Vista previa de PDF (Williams, 2026-11-13): ningún PDF del ERP se descarga ni se abre en otra pestaña
// directamente. Todos pasan primero por una ventana pequeña de vista previa (components/VisorPDF.tsx) y recién
// ahí están Imprimir, Compartir por WhatsApp, Descargar y Firmar.
// =====================================================================

import type { jsPDF } from "jspdf";
import { descargaDirecta } from "./guardarArchivo";

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
  descargaDirecta(bytes, `${limpiarNombre(nombre)}.pdf`, "application/pdf");
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

/**
 * Imprime directo un PDF ya generado, en su propio tamaño de hoja (A4, ticket 80 mm o 58 mm), sin abrir la vista previa.
 * Celular y app de escritorio (Tauri / Electron) no imprimen PDF en un iframe: ahí se abre la vista previa, que sí
 * imprime (como imágenes) con el botón Imprimir.
 */
export function imprimirPDF(doc: jsPDF, nombre: string): void {
  const movil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const app = "__TAURI_INTERNALS__" in window || "__TAURI__" in window || "comboyEscritorio" in window;
  if (movil || app || !hayVisor()) {
    mostrarPDF(doc, nombre);
    return;
  }
  const n = limpiarNombre(nombre);
  doc.setProperties({ title: n });
  const url = URL.createObjectURL(new Blob([doc.output("arraybuffer")], { type: "application/pdf" }));
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  f.title = n;
  f.src = url;
  f.onload = () => {
    try {
      f.contentWindow?.focus();
      f.contentWindow?.print();
    } catch {
      mostrarPDF(doc, nombre);
    }
    // se limpia después: el diálogo de impresión puede seguir abierto un rato
    setTimeout(() => {
      f.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  };
  document.body.appendChild(f);
}
