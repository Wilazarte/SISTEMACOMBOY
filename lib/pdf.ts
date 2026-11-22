"use client";

// =====================================================================
// Generación de PDFs profesionales con jsPDF + jspdf-autotable
// =====================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { EMPRESA } from "./empresa";
import { CUENTAS_ORIGEN_PAGO, numeroDJ, codigoContratista, codigoGasto, cotizacionGasto, getFacturas, cuentaBancariaTxt, fechaPE, getTrabajadores, soles } from "./storage";
import { codigoDesdeNumero, estadoDocumento } from "./utils/codigos";
import { SEDE_PLANTA_PRINCIPAL, bloqueDocumento, sedeOrigenReq, type DocUnificado, type TipoDocumento } from "./plantillasDocumentos";
import { equipoDeLinea, sedeEquipo } from "./equipos";
import { ESTADOS_OD, LUGARES_ENTREGA, estadoOD, origenOD, type EstadoAlmacen, type FilaCxC, type GrupoDeuda } from "./ventas";
import { toast } from "@/components/ui";
import type { Adelanto } from "./adelantos";
import type { HistorialDetalle, HistorialPlanilla } from "./historial";
import type { ConcesionContratista, LugarEntrega } from "./types";
import type { ComprobanteVenta, Cotizacion, Factura, Guia, GuiaRemision, LineaVenta, NotaPedido, OrdenCompra, OrdenDespacho, OrdenServicio, Requerimiento } from "./types";
import type { Traslado, VentaSucursal } from "./sucursal-modelos";
import { COMPROBANTES } from "./comprobantes";
import { imprimirPDF, mostrarPDF, registrarZonaFirma } from "./visorPdf";
import { montoEnLetras } from "./letras";
import { cuadroDepreciacion, depreciacion, nombreCategoria, type Activo, type Depreciacion, type EntregaActivo } from "./activos";

type RGB = [number, number, number];
// Plantilla corporativa COMBOY VID
const AZUL: RGB = [15, 36, 64]; // #0F2440
const ROJO: RGB = [185, 28, 28]; // #B91C1C
const NEGRO: RGB = [0, 0, 0];
const GRIS: RGB = [100, 116, 139];
const BORDE: RGB = [209, 213, 219]; // #D1D5DB
const PLOMO_50: RGB = [248, 250, 252];
const PLOMO_200: RGB = [226, 232, 240];

const PT = 25.4 / 72; // 1 pt en mm
const M = 14; // margen lateral (mm)
/** Alto del footer negro (mm). El contenido nunca baja de aquí. */
const ALTO_PIE = 19;

// ------------------------------------------------------------- Logo (public/comboy-logo.png)
let logo: { data: string; w: number; h: number } | null = null;

/** Precarga el logo como dataURL (jsPDF dibuja síncrono; el PDF se abre en el mismo clic). */
export async function cargarLogo(): Promise<void> {
  if (logo || typeof window === "undefined") return;
  try {
    const blob = await (await fetch("/comboy-logo.png")).blob();
    const data = await new Promise<string>((ok, mal) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = mal;
      r.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise((ok, mal) => {
      img.onload = ok;
      img.onerror = mal;
      img.src = data;
    });
    logo = { data, w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    logo = null; // sin logo se dibuja el nombre en texto
  }
}
void cargarLogo();

/** Logo con object-fit: contain dentro de la caja (x, y, w, h). */
function dibujarLogo(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  const src = logo ?? (EMPRESA.logoDataUrl ? { data: EMPRESA.logoDataUrl, w: 4, h: 1 } : null);
  if (src) {
    const k = Math.min(w / src.w, h / src.h);
    doc.addImage(src.data, "PNG", x, y + (h - src.h * k) / 2, src.w * k, src.h * k, "logo-comboy", "FAST");
    return;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  const ancho = doc.getTextWidth("COMBOY VID");
  if (ancho > w) doc.setFontSize((26 * w) / ancho); // que entre completo (ticket 58 mm)
  doc.setTextColor(...AZUL);
  doc.text("COMBOY", x, y + h / 2 + 3);
  doc.setTextColor(...ROJO);
  doc.text("VID", x + doc.getTextWidth("COMBOY "), y + h / 2 + 3);
  doc.setTextColor(0, 0, 0);
}

export interface Bloque {
  titulo: string;
  numero: string;
  estado?: string;
  datos: [string, string][];
  head: string[];
  body: (string | number)[][];
  alinearDerecha?: number[];
  totales?: [string, string][];
  notas?: string[];
  /** Texto del código QR (se dibuja abajo a la izquierda) y líneas que van a su lado. */
  qr?: string;
  qrTexto?: string[];
  firmas: string[];
  /** Columnas de la sección de datos (por defecto 3). */
  columnas?: number;
  /** Página horizontal (tablas anchas, ej. planilla). */
  horizontal?: boolean;
  /** Casillero de huella digital junto a la firma indicada (índice). */
  huellaEn?: number;
  /** Secciones propias del documento (después de la tabla y los totales). Devuelve la nueva Y. */
  extra?: (doc: jsPDF, y: number) => number;
  /** Imagen de firma (dataURL PNG) sobre la línea de la firma indicada. */
  firmaImagen?: { indice: number; url: string; nombre?: string };
}

/** Dibuja un QR con rectángulos (síncrono: no bloquea la ventana del PDF). */
function dibujarQR(doc: jsPDF, texto: string, x: number, y: number, lado: number): void {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const m = lado / n;
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) doc.rect(x + c * m, y + r * m, m + 0.02, m + 0.02, "F");
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/**
 * Cabecera corporativa: logo 260×65 pt + datos de la empresa debajo (izquierda 60 %),
 * cuadro con título / subtítulo / estado (derecha 38 %) y franja roja de 8 pt.
 */
function cabecera(doc: jsPDF, titulo: string, subtitulo: string, estado?: string): number {
  const W = doc.internal.pageSize.getWidth();
  const ancho = W - 2 * M;
  const top = 10;

  // Izquierda 60 %
  dibujarLogo(doc, M, top, 260 * PT, 65 * PT);
  let y = top + 65 * PT + 6 * PT + 2.6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...AZUL);
  doc.text(EMPRESA.nombreComercial, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...NEGRO);
  for (const l of [`RUC ${EMPRESA.ruc}`, `Dirección: ${EMPRESA.direccion}`, `Tel: ${EMPRESA.telefono} • Email: ${EMPRESA.email}`]) {
    y += 3.1;
    doc.text(l, M, y);
  }

  // Derecha: cuadro limpio (fondo blanco) con solo nombre del documento, código y estado
  const bw = 210 * PT;
  const bx = W - M - bw;
  const cx = bx + bw / 2;
  const pad = 12 * PT;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const lt = doc.splitTextToSize(titulo.toUpperCase(), bw - 2 * pad) as string[];
  const alto = pad * 2 + lt.length * 3.4 + 4 * PT + 4.2 + (estado ? 8 * PT + 4.2 : 0);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(2 * PT);
  doc.roundedRect(bx, top, bw, alto, 12 * PT, 12 * PT, "FD");
  let yy = top + pad + 2.6;
  doc.setTextColor(...AZUL);
  doc.text(lt, cx, yy, { align: "center" });
  yy += (lt.length - 1) * 3.4 + 4 * PT + 4;
  doc.setFontSize(11);
  doc.text(subtitulo, cx, yy, { align: "center" });
  if (estado) {
    yy += 8 * PT + 1.4;
    doc.setFontSize(6.5);
    const txt = `ESTADO: ${estado.toUpperCase()}`;
    const pw = doc.getTextWidth(txt) + 20 * PT;
    doc.setLineWidth(1 * PT);
    doc.roundedRect(cx - pw / 2, yy, pw, 4.2, 10 * PT, 10 * PT, "S");
    doc.text(txt, cx, yy + 2.9, { align: "center" });
  }

  // Franja roja
  const yb = Math.max(y + 3, top + alto) + 10 * PT;
  doc.setFillColor(...ROJO);
  doc.rect(M, yb, ancho, 8 * PT, "F");
  return yb + 8 * PT + 10 * PT + 2;
}

/** Sección de datos compacta: label 8 pt bold azul + valor 7.5 pt negro, en columnas, línea plomo debajo. */
function datosGrid(doc: jsPDF, y: number, datos: [string, string][], columnas = 3): number {
  if (!datos.length) return y;
  const W = doc.internal.pageSize.getWidth();
  const col = (W - 2 * M) / columnas;
  let yy = y;
  for (let i = 0; i < datos.length; i += columnas) {
    let alto = 3.6;
    for (let j = 0; j < columnas; j++) {
      const par = datos[i + j];
      if (!par) continue;
      const x = M + j * col;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...AZUL);
      const label = `${par[0]}: `;
      const lw = doc.getTextWidth(label);
      doc.text(label, x, yy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...NEGRO);
      const val = doc.splitTextToSize(par[1] || "-", Math.max(col - lw - 3, 18)) as string[];
      doc.text(val, x + lw, yy);
      alto = Math.max(alto, val.length * 3.1 + 0.5);
    }
    yy += alto;
  }
  doc.setDrawColor(...PLOMO_200);
  doc.setLineWidth(1 * PT);
  doc.line(M, yy - 1, W - M, yy - 1);
  return yy + 3;
}

/** Tabla corporativa: cabecera azul 7.5 pt, filas 7.5 pt con borde #D1D5DB y alternado #F8FAFC. */
function tabla(
  doc: jsPDF,
  y: number,
  head: string[],
  body: (string | number)[][],
  alinearDerecha: number[] = [],
  anchos: Record<number, { cellWidth: number }> = {}
): number {
  const columnStyles: Record<number, { halign?: "right"; cellWidth?: number }> = { ...anchos };
  alinearDerecha.forEach((c) => (columnStyles[c] = { ...columnStyles[c], halign: "right" }));
  autoTable(doc, {
    startY: y,
    head: [head.map((h) => h.toUpperCase())],
    body,
    theme: "grid",
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 7.5, lineColor: AZUL },
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: BORDE, lineWidth: 0.2, textColor: NEGRO },
    alternateRowStyles: { fillColor: PLOMO_50 },
    columnStyles,
    margin: { left: M, right: M, top: 14, bottom: ALTO_PIE + 6 },
  });
  return finalY(doc) + 4;
}

/** Totales a la derecha (8 pt); el último en caja azul redondeada, blanco, 9 pt bold. */
function bloqueTotales(doc: jsPDF, y: number, filas: [string, string][]): number {
  const W = doc.internal.pageSize.getWidth();
  const w = 74;
  const x = W - M - w;
  filas.forEach(([k, v], i) => {
    if (y > doc.internal.pageSize.getHeight() - ALTO_PIE - 10) {
      doc.addPage();
      y = 20;
    }
    const ultimo = i === filas.length - 1;
    if (ultimo) {
      y += 1;
      doc.setFillColor(...AZUL);
      doc.roundedRect(x, y - 4.2, w, 6.6, 8 * PT, 8 * PT, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(k, x + 2.5, y);
      doc.text(v, W - M - 2.5, y, { align: "right" });
      y += 6.6;
    } else {
      doc.setTextColor(...NEGRO);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(k, x + 2.5, y);
      doc.text(v, W - M - 2.5, y, { align: "right" });
      y += 4 * PT + 3.2;
    }
  });
  return y + 2;
}

function firmas(doc: jsPDF, y: number, nombres: string[], huellaEn?: number, img?: Bloque["firmaImagen"]): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const tope = H - ALTO_PIE - 12;
  let yy = Math.max(y + 22, tope);
  if (yy > tope) {
    doc.addPage();
    yy = tope;
  }
  const ancho = (W - 2 * M) / nombres.length;
  const pagina = doc.getCurrentPageInfo().pageNumber;
  nombres.forEach((n, i) => {
    const cx = M + ancho * i + ancho / 2;
    // La vista previa (Firmar) ofrece estampar la firma sobre esta línea
    registrarZonaFirma(doc, { pagina, x: cx, y: yy, etiqueta: n });
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.3);
    doc.line(cx - 25, yy, cx + 25, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...AZUL);
    doc.text(n, cx, yy + 4, { align: "center" });
    if (img && img.indice === i) {
      try {
        doc.addImage(img.url, "PNG", cx - 22, yy - 15, 44, 14);
      } catch {
        /* firma ilegible: queda la línea */
      }
      if (img.nombre) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...GRIS);
        doc.text(img.nombre, cx, yy + 7.5, { align: "center" });
      }
    }
    if (huellaEn === i) {
      // Casillero de huella digital a la derecha de la firma
      doc.setDrawColor(...BORDE);
      doc.roundedRect(cx + 28, yy - 22, 17, 22, 1.5, 1.5, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...GRIS);
      doc.text("Huella digital", cx + 36.5, yy + 3, { align: "center" });
    }
  });
}

/** Footer negro con borde rojo: ÁREA INFORMÁTICA - COMBOY VID (todas las páginas). */
function pie(doc: jsPDF): void {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const generado = new Date().toLocaleString("es-PE");
  const y0 = H - ALTO_PIE;
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(...ROJO);
    doc.rect(0, y0, W, 3 * PT, "F");
    doc.setFillColor(...NEGRO);
    doc.rect(0, y0 + 3 * PT, W, ALTO_PIE - 3 * PT, "F");
    const cx = W / 2;
    let y = y0 + 3 * PT + 10 * PT + 2.2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("ÁREA INFORMÁTICA - COMBOY VID", cx, y, { align: "center", charSpace: 0.5 * PT });
    y += 4 * PT + 2.6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(
      `COMBOY VID • ${EMPRESA.nombreComercial} • RUC ${EMPRESA.ruc} • Contacto: ${EMPRESA.email} • Tel: ${EMPRESA.telefono}`,
      cx,
      y,
      { align: "center" }
    );
    y += 3 * PT + 2.2;
    doc.setFontSize(5.5);
    doc.setTextColor(226, 232, 240);
    doc.text(`Documento generado: ${generado} • Página ${i} de ${n}`, cx, y, { align: "center" });
    y += 2 * PT + 2;
    doc.setTextColor(160, 160, 160);
    doc.text("DOCUMENTO OFICIAL • NO MODIFICABLE • REGISTRO HISTORIAL", cx, y, { align: "center" });
  }
}

/** Documento con la plantilla corporativa (cabecera con logo y datos de empresa, tabla, totales, firmas y pie). */
export function construir(b: Bloque): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: b.horizontal ? "landscape" : "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = cabecera(doc, b.titulo, b.numero, b.estado);
  y = datosGrid(doc, y, b.datos, b.columnas ?? 3);
  y = tabla(doc, y, b.head, b.body, b.alinearDerecha);
  if (b.totales?.length) y = bloqueTotales(doc, y, b.totales);
  if (b.extra) y = b.extra(doc, y);

  if (b.notas?.length) {
    y += 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    b.notas.forEach((n) => {
      const l = doc.splitTextToSize(n, W - 2 * M) as string[];
      if (y + l.length * 3.4 > H - ALTO_PIE - 6) {
        doc.addPage();
        y = 20;
      }
      doc.text(l, M, y);
      y += l.length * 3.4 + 0.6;
    });
  }

  if (b.qr) {
    if (y + 34 > H - ALTO_PIE - 26) {
      doc.addPage();
      y = 20;
    }
    y += 3;
    dibujarQR(doc, b.qr, M, y, 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...NEGRO);
    (b.qrTexto ?? []).forEach((t, i) => doc.text(t, M + 30, y + 4 + i * 3.8));
    y += 29;
  }

  firmas(doc, y, b.firmas, b.huellaEn, b.firmaImagen);
  pie(doc);
  return doc;
}

/** Abre la vista previa (Imprimir / WhatsApp / Descargar / Firmar); al descargar se llama como el código (BOL-002-2026.pdf). */
function guardar(doc: jsPDF, codigo: string): void {
  mostrarPDF(doc, codigo);
}

/** Ejecuta un PDF que primero reserva su código en Supabase; los errores se muestran como aviso. */
async function conCodigo(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    toast(e instanceof Error ? e.message : "No se pudo generar el PDF", "error");
  }
}

/** Antes abría el PDF en otra pestaña; ahora todos pasan por la vista previa. */
function abrir(doc: jsPDF, nombre: string): void {
  mostrarPDF(doc, nombre);
}

/** Encabezado del precio unitario: con IGV incluido (documentos nuevos) o sin IGV (anteriores). */
const cabPU = (d: { preciosConIgv?: boolean; igv: number }): string => (d.igv > 0 ? (d.preciosConIgv ? "P.U. inc. IGV" : "P.U. sin IGV") : "P. Unit.");

const totales = (s: number, igv: number, t: number): [string, string][] => [
  ["Subtotal (valor venta)", soles(s)],
  ["IGV 18%", soles(igv)],
  ["TOTAL", soles(t)],
];

// ---------------------------------------------------------------------

/** Contrato simple de concesión / servicio externo (Planilla › Contratistas). */
export function pdfContratoConcesion(c: ConcesionContratista, tipoServicio: string): Promise<void> {
  return conCodigo(async () => pdfContrato(c, tipoServicio, await codigoContratista(c.id)));
}

function pdfContrato(c: ConcesionContratista, tipoServicio: string, codigo: string): void {
  const pagado = (c.adelanto || 0) + (c.pagos ?? []).reduce((s, p) => s + p.monto, 0);
  guardar(
    construir({
      titulo: "REQUERIMIENTO CONTRATISTA",
      numero: codigo,
      estado: estadoDocumento(c.estado),
      datos: [
        ["Contratante", `${EMPRESA.razonSocial} · RUC ${EMPRESA.ruc}`],
        ["Contratista", c.razonSocial],
        ["RUC / DNI", c.ruc || "-"],
        ["Representante", c.representante || "-"],
        ["Celular", c.celular || "-"],
        ["Servicio", tipoServicio],
        ["Sede", c.sede || "-"],
        ["Vigencia", `${fechaPE(c.fecha_inicio)} al ${c.fecha_fin ? fechaPE(c.fecha_fin) : "culminación del servicio"}`],
      ],
      head: ["Concepto", "Detalle", "Importe"],
      body: [
        ["Objeto del servicio", c.descripcion, soles(c.monto_total)],
        ["Adelanto", "A la firma del contrato", soles(c.adelanto || 0)],
        ...(c.pagos ?? []).map((p, i) => [`Pago ${i + 1}`, `${fechaPE(p.fecha)} · ${p.medio}${p.nota ? ` · ${p.nota}` : ""}`, soles(p.monto)]),
      ],
      alinearDerecha: [2],
      totales: [
        ["Monto total", soles(c.monto_total)],
        ["Pagado", soles(pagado)],
        ["SALDO", soles(Math.max(0, c.monto_total - pagado))],
      ],
      notas: [
        "PRIMERA: EL CONTRATISTA presta el servicio descrito con autonomía y sus propios medios; no existe vínculo laboral.",
        "SEGUNDA: El pago se efectúa contra entrega de comprobante (recibo por honorarios o factura) por cada importe pagado.",
        "TERCERA: EL CONTRATISTA asume sus obligaciones tributarias y de seguridad en la ejecución del servicio.",
        "CUARTA: Cualquiera de las partes puede resolver el contrato por incumplimiento, liquidando lo efectivamente ejecutado.",
        ...(c.observaciones ? [`Observaciones: ${c.observaciones}`] : []),
      ],
      firmas: ["EL CONTRATANTE", "EL CONTRATISTA"],
    }),
    codigo
  );
}

export interface DatosBoleta {
  periodo: string;
  id: string;
  nombre: string;
  dni: string;
  cargo: string;
  sede?: string;
  fechaIngreso: string;
  pension: string;
  afpPorcentaje: number;
  sueldo: string;
  sueldoDiario: number;
  valorHora: string;
  modo: string;
  basicoDetalle: string;
  basico: number;
  horasExtra: string;
  montoExtra: number;
  bruto: number;
  descuentoAfp: number;
  adelantos: number;
  /** Cada adelanto descontado en esta boleta (fecha, monto, motivo). Sin lista, la fila sale sin detalle. */
  adelantosDetalle?: AdelantoBoleta[];
  totalPagar: number;
  /** Días de asistencia que se pagan en esta boleta (YYYY-MM-DD). */
  asistenciaDesde?: string | null;
  asistenciaHasta?: string | null;
  /** Fecha en que se realiza el pago (cierre del periodo; sin cerrar: el día de emisión). */
  fechaPago?: string | null;
}

export type AdelantoBoleta = Pick<Adelanto, "fecha" | "monto" | "motivo" | "medio_pago">;

/** "Transferencia BCP" -> "Transf. BCP" (para que el detalle quepa en una línea). */
const medioCorto = (m?: string | null) => (m ?? "").trim().replace(/^Transferencia\b/i, "Transf.");

/**
 * Una fila por adelanto ("10/09/2026 - Efectivo - Pasaje") y, si hay varios, la fila del total descontado.
 * El medio de pago sale solo si se registró.
 */
function filasAdelantos(d: DatosBoleta): string[][] {
  const lista = d.adelantosDetalle ?? [];
  if (!lista.length) {
    if (!d.adelantos) return [["DESCUENTO", "Adelantos de sueldo", "Sin adelantos en este periodo", `- ${soles(0)}`]];
    return [["DESCUENTO", "Adelantos de sueldo", "Detalle no disponible", `- ${soles(d.adelantos)}`]];
  }
  const filas = lista.map((a) => [
    "DESCUENTO",
    "Adelanto sueldo",
    [fechaPE(a.fecha), medioCorto(a.medio_pago), a.motivo?.trim() || "Sin motivo"].filter(Boolean).join(" - "),
    `- ${soles(a.monto)}`,
  ]);
  return lista.length > 1 ? [...filas, ["", "", "Total adelantos descontados", `- ${soles(d.adelantos)}`]] : filas;
}

/** Boleta individual de pago (Planilla del periodo): se descarga como BOL-xxx-AAAA.pdf. */
/** Cuenta bancaria del trabajador (ficha) para las boletas y la planilla. */
const cuentaDe = (id: string): string => cuentaBancariaTxt(getTrabajadores().find((t) => t.id === id));

export function pdfBoletaPago(d: DatosBoleta, codigo: string): void {
  const cuenta = cuentaDe(d.id);
  const doc = construir({
    titulo: "BOLETA DE PAGO",
    numero: codigo,
    estado: "EMITIDA",
    datos: [
      ["Trabajador", d.nombre],
      ["DNI", d.dni || "-"],
      ["N° trabajador", d.id],
      ["Cargo", d.cargo || "-"],
      ["Sede", d.sede || "-"],
      ["Fecha ingreso", d.fechaIngreso ? fechaPE(d.fechaIngreso) : "-"],
      ["Sueldo", d.sueldo],
      ["Sueldo diario", soles(d.sueldoDiario)],
      ["Valor hora", d.valorHora],
      ["Periodo", d.periodo],
      ["Asistencia pagada", d.asistenciaDesde ? `Del ${fechaPE(d.asistenciaDesde)} al ${fechaPE(d.asistenciaHasta || d.asistenciaDesde)}` : "-"],
      ["Fecha de pago", d.fechaPago ? fechaPE(d.fechaPago.slice(0, 10)) : "-"],
      ["Liquidación", d.modo],
      ["Pensión", `${d.pension} (${d.afpPorcentaje}%)`],
      ...(cuenta ? ([["Cuenta de pago", cuenta]] as [string, string][]) : []),
    ],
    head: ["Tipo", "Concepto", "Detalle", "Importe"],
    body: [
      ["INGRESO", "Remuneración básica", d.basicoDetalle, soles(d.basico)],
      ["INGRESO", "Horas extra", d.horasExtra, soles(d.montoExtra)],
      ["", "Remuneración bruta", "", soles(d.bruto)],
      ["DESCUENTO", `Aporte ${d.pension}`, `${d.afpPorcentaje}% de ${soles(d.bruto)} (sueldo pagado: ${d.basicoDetalle})`, `- ${soles(d.descuentoAfp)}`],
      ...filasAdelantos(d),
    ],
    alinearDerecha: [3],
    totales: [
      ["Total ingresos", soles(d.bruto)],
      ["Total descuentos", `- ${soles(d.descuentoAfp + d.adelantos)}`],
      ["NETO A PAGAR", soles(d.totalPagar)],
    ],
    notas: ["Declaro haber recibido el importe neto indicado en esta boleta, conforme a la liquidación del periodo."],
    qr: [EMPRESA.ruc, "BOLETA", d.periodo, d.id, d.dni || "-", d.totalPagar.toFixed(2)].join("|"),
    qrTexto: [`Boleta de pago · ${d.periodo}`, `${d.nombre} · DNI ${d.dni || "-"}`, `Neto a pagar ${soles(d.totalPagar)}`],
    firmas: ["Firma del trabajador", "Firma del empleador"],
    huellaEn: 0,
  });
  guardar(doc, codigo);
}

/** Planilla cerrada (historial): copia fiel de lo guardado al cerrar la semana. */
export function pdfPlanillaHistorial(h: HistorialPlanilla, detalle: HistorialDetalle[]): void {
  const horas = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  abrir(
    construir({
      titulo: "PLANILLA DE PAGO - HISTORIAL",
      numero: h.periodo,
      estado: "CERRADA",
      datos: [
        ["Periodo", h.periodo],
        ["Cerrada el", new Date(h.fecha_cierre).toLocaleString("es-PE")],
        ["Cerrada por", h.creado_por || "-"],
        ["Trabajadores", String(h.cantidad_trabajadores)],
        ["Asistencia", h.asistencia_desde ? `${fechaPE(h.asistencia_desde)} al ${fechaPE(h.asistencia_hasta ?? h.asistencia_desde)}` : "-"],
      ],
      head: ["N°", "Trabajador", "Cuenta de pago", "Sueldo / Tipo", "Pensión", "Días", "Horas", "Tard.", "Bruto", "Dscto", "Neto", "Adelantos", "A pagar"],
      body: detalle.map((d) => [
        d.trabajador_id,
        d.nombre,
        cuentaDe(d.trabajador_id) || "-",
        `${soles(d.sueldo)} ${d.tipo_sueldo ?? ""}`,
        `${d.pension ?? "-"} ${d.afp_porcentaje}%`,
        d.dias,
        horas(d.horas),
        d.tardanzas,
        soles(d.bruto),
        soles(d.descuento_afp),
        soles(d.neto),
        d.adelantos ? `- ${soles(d.adelantos)}` : "-",
        soles(d.total_pagar),
      ]),
      alinearDerecha: [5, 6, 7, 8, 9, 10, 11, 12],
      totales: [
        ["Total horas", horas(h.total_horas)],
        ["Total bruto", soles(h.total_bruto)],
        ["Total descuentos", soles(h.total_descuento)],
        ["Total neto", soles(h.total_neto)],
        ["Adelantos descontados", `- ${soles(h.total_adelantos)}`],
        ["TOTAL PAGADO", soles(h.total_pagar)],
      ],
      firmas: ["Elaborado por", "Gerencia"],
      horizontal: true,
      columnas: 4,
    }),
    `PLANILLA_${h.periodo.replace(/\s+/g, "_")}`
  );
}

/** PDF de cualquier sede con TEMPLATE_UNIFICADO (lib/plantillasDocumentos): mismo diseño, solo cambia la sede. */
export function generarDocumento(tipo: TipoDocumento, sede: string, r: DocUnificado): jsPDF {
  const doc = construir(bloqueDocumento(tipo, sede, r));
  doc.setProperties({ title: r.numero });
  return doc;
}

/** REQ-ALM (Arequipa / Taller) y REQ-SECOCHA: el mismo documento. */
export function pdfRequerimiento(r: Requerimiento): void {
  abrir(generarDocumento("REQ", sedeOrigenReq(r), r), r.numero);
}

export function pdfCotizacion(c: Cotizacion): void {
  abrir(
    construir({
      titulo: "REGISTRO DE COTIZACIÓN",
      numero: c.numero,
      datos: [
        ["Proveedor", c.proveedor],
        ["RUC", c.ruc],
        ["Fecha emisión", fechaPE(c.fechaEmision)],
        ["Requerimiento", c.reqNumero],
      ],
      head: ["#", "Producto", "Marca", "Cant.", "Und.", cabPU(c), "Subtotal"],
      body: c.items.map((i, k) => [k + 1, i.nombre, i.marca || "-", i.cantidad, i.unidad, soles(i.precioUnit), soles(i.subtotal)]),
      alinearDerecha: [3, 5, 6],
      totales: totales(c.subtotal, c.igv, c.total),
      firmas: ["Tesorería / Compras", "V°B° Gerencia"],
    }),
    `COT-${c.numero}`
  );
}

export function pdfOrdenCompra(o: OrdenCompra): void {
  const codigo = codigoDesdeNumero("OC", o.numero, o.fecha);
  guardar(
    construir({
      titulo: "ORDEN DE COMPRA",
      numero: codigo,
      estado: estadoDocumento(o.estado),
      datos: [
        ["N° OC", o.numero],
        ["Proveedor", o.proveedor],
        ["RUC", o.ruc],
        ["Fecha", fechaPE(o.fecha)],
        ["Forma de pago", o.formaPago],
        ["Tiempo entrega", o.tiempoEntrega],
        ["Lugar entrega", o.lugarEntrega],
        ["Cotización", o.cotizacionNumero],
        ["Requerimiento", o.reqNumero],
        // Lo que ya no se ve en la tabla de Órdenes de compra: pago, baucher y bancarización
        ["Cuenta de pago", o.caja || (o.cuentaOrigenPago ? CUENTAS_ORIGEN_PAGO[o.cuentaOrigenPago] : "-")],
        ...(o.voucherUrl ? ([["Baucher", `${o.voucherNombre ?? "adjunto"}${o.voucherMonto !== undefined ? ` · ${soles(o.voucherMonto)}` : ""}`]] as [string, string][]) : []),
        ...(o.bancarizacion ? ([["Bancarización", `${o.bancarizacion.tipo}${o.bancarizacion.nroOperacion ? ` · N° ${o.bancarizacion.nroOperacion}` : ""}`]] as [string, string][]) : []),
      ],
      head: ["#", "Descripción", "Marca", "Cant.", "Und.", cabPU(o), "Importe"],
      body: o.items.map((i, k) => [k + 1, i.nombre, i.marca || "-", i.cantidad, i.unidad, soles(i.precioUnit), soles(i.subtotal)]),
      alinearDerecha: [3, 5, 6],
      totales: totales(o.subtotal, o.igv, o.total),
      notas: [
        "1. Consignar el Nro de esta Orden de Compra en la factura y guía de remisión.",
        "2. La mercadería se recibe previa verificación de Almacén; no se aceptan entregas parciales sin coordinación.",
        "3. La factura electrónica debe emitirse a nombre de " + `${EMPRESA.razonSocial} RUC ${EMPRESA.ruc}.`,
      ],
      firmas: ["Elaborado: Compras", "Aprobado: Gerencia", "Proveedor"],
    }),
    codigo
  );
}

/** Orden de Servicio: misma plantilla que la OC, con título "ORDEN DE SERVICIO". */
export function pdfOrdenServicio(o: OrdenServicio): void {
  const origen = o.origen === "REQUERIMIENTO" ? o.reqNumero ?? "-" : o.origen === "GASTO" ? `Gasto ${o.gastoNumero ?? ""}` : o.origen === "COMPRA" ? `Compra ${o.compraNumero ?? ""}` : "Registro directo";
  guardar(
    construir({
      titulo: "ORDEN DE SERVICIO",
      numero: o.numero,
      estado: estadoDocumento(o.estado),
      datos: [
        ["N° OS", o.numero],
        ["Proveedor", o.proveedor],
        ["RUC", o.ruc || "-"],
        ["Fecha", fechaPE(o.fecha)],
        ["Cond. de pago", o.formaPago],
        ["Plazo", o.plazo || "-"],
        ["Lugar del servicio", o.lugarServicio || "-"],
        ["Origen", origen],
        ["Estado", o.estado],
        ["Concepto", o.concepto],
        ...(o.adjuntoNombre ? ([["Adjunto", o.adjuntoNombre]] as [string, string][]) : []),
        ...(o.estado === "ANULADA" && o.motivoAnulacion ? ([["Motivo anulación", o.motivoAnulacion]] as [string, string][]) : []),
      ],
      head: ["#", "Descripción del servicio", "Cant.", "Und.", cabPU(o), "Importe"],
      body: o.items.map((i, k) => [k + 1, i.descripcion, i.cantidad, i.unidad, soles(i.precioUnit), soles(i.subtotal)]),
      alinearDerecha: [2, 4, 5],
      totales: totales(o.subtotal, o.igv, o.total),
      notas: [
        "1. Consignar el Nro de esta Orden de Servicio en la factura o recibo por honorarios.",
        "2. El servicio se da por conforme previa verificación del área solicitante.",
        "3. El comprobante electrónico debe emitirse a nombre de " + `${EMPRESA.razonSocial} RUC ${EMPRESA.ruc}.`,
        ...(o.observacion ? [`Observación: ${o.observacion}`] : []),
      ],
      firmas: ["Elaborado: Compras", "Aprobado: Gerencia", "Proveedor"],
    }),
    o.numero
  );
}

/** Gasto / servicio de Tesorería (sin OC ni stock). */
function pdfGasto(f: Factura, codigo: string): void {
  const comp = COMPROBANTES[f.comprobanteGasto ?? "FACTURA"];
  guardar(
    construir({
      titulo: "GASTO",
      numero: codigo,
      estado: estadoDocumento(f.estadoPago),
      datos: [
        ["Proveedor / agencia", f.proveedor],
        ["RUC / DNI", f.ruc || "-"],
        ["Fecha", fechaPE(f.fecha)],
        ["Comprobante", `${comp} ${f.numero}`],
        ["Cotización", f.cotizacionProveedor ? `${f.cotizacionProveedor}${f.cotizacionAuto ? " (interna)" : ""}` : "-"],
        ["Adjuntos", f.archivos?.length ? f.archivos.map((a) => a.nombre).join(", ") : "-"],
      ],
      head: ["#", "Descripción", "Importe"],
      body: [[1, f.descripcion ?? "-", soles(f.total)]],
      alinearDerecha: [2],
      totales: [
        ...(f.igv ? ([["Subtotal", soles(f.subtotal)], ["IGV 18%", soles(f.igv)]] as [string, string][]) : []),
        ["Total", soles(f.total)],
        ...(f.detraccionMonto ? ([[`Detracción ${f.detraccionPorc}%`, `- ${soles(f.detraccionMonto)}`]] as [string, string][]) : []),
        ...(f.retencionMonto ? ([[`Retención 4ta cat. ${f.retencionPorc}%`, `- ${soles(f.retencionMonto)}`]] as [string, string][]) : []),
        ["NETO A PAGAR", soles(f.netoPagar ?? f.total)],
      ],
      firmas: ["Solicitante", "Tesorería", "Gerencia"],
    }),
    codigo
  );
}

/** Estado de cuenta de una caja: saldo inicial, movimientos del periodo y saldo final. */
export function pdfEstadoCuenta(d: {
  cuenta: string;
  periodo: string;
  saldoInicial: number;
  ingresos: number;
  egresos: number;
  saldoFinal: number;
  movimientos: { fecha: string; concepto: string; documento: string; proveedor: string; debe: number; haber: number; saldo?: number }[];
  descripcion?: string;
  cuentasBancarias?: [string, string][]; // ["Interbank Soles", "N° … · CCI …"]
}): void {
  const nombre = `ESTADO-CUENTA-${d.cuenta.replace(/\s+/g, "-")}-${d.periodo.replace(/\s+/g, "-")}`;
  guardar(
    construir({
      titulo: `ESTADO DE CUENTA · ${d.cuenta}`,
      numero: d.periodo.toUpperCase(),
      estado: "REPORTE",
      datos: [
        ["Cuenta", d.descripcion ? `${d.cuenta} · ${d.descripcion}` : d.cuenta],
        ...(d.cuentasBancarias ?? []),
        ["Periodo", d.periodo],
        ["Sede", "Arequipa"],
        ["Emitido", fechaPE(new Date().toISOString().slice(0, 10))],
        ["Saldo inicial", soles(d.saldoInicial)],
        ["Saldo final", soles(d.saldoFinal)],
      ],
      head: ["Fecha", "Concepto", "Doc. ref.", "Proveedor", "Debe (ingreso)", "Haber (egreso)", "Saldo"],
      body: [
        ["", "SALDO INICIAL", "", "", "", "", soles(d.saldoInicial)],
        ...d.movimientos.map((m) => [fechaPE(m.fecha), m.concepto, m.documento, m.proveedor, m.debe ? soles(m.debe) : "", m.haber ? soles(m.haber) : "", soles(m.saldo ?? 0)]),
      ],
      alinearDerecha: [4, 5, 6],
      totales: [
        ["Saldo inicial", soles(d.saldoInicial)],
        ["Ingresos", soles(d.ingresos)],
        ["Egresos", `- ${soles(d.egresos)}`],
        ["SALDO FINAL", soles(d.saldoFinal)],
      ],
      firmas: ["Tesorería", "Gerencia"],
      horizontal: true,
    }),
    nombre
  );
}

/**
 * Reporte de deudas (Cuentas por cobrar) en A4 vertical (Williams, 2026-11-17): resumen agrupado
 * (si el reporte está abierto), detalle por documento con días vencidos y totales. Sigue los filtros de la pantalla.
 */
export function pdfReporteDeuda(d: {
  filas: FilaCxC[];
  /** Resumen por cliente / vendedor / mes / equipo (opcional). */
  agrupado?: { por: string; grupos: (GrupoDeuda & { etiqueta: string })[] };
  filtros: string;
  totalSaldo: number;
  vencido: number;
}): void {
  const total = d.filas.reduce((a, f) => a + f.total, 0);
  const pagado = d.filas.reduce((a, f) => a + f.pagado, 0);
  // Montos sin "S/" en las tablas (la cabecera dice S/) para que no se partan en dos líneas
  const m = (n: number) => soles(n).replace(/^S\/\s*/, "");
  const pct = (n: number) => (d.totalSaldo > 0 ? `${((n / d.totalSaldo) * 100).toFixed(1)} %` : "-");
  const hoyIso = new Date().toISOString().slice(0, 10);
  const head = ["Documento", "Cliente", "Emisión", "Vence", "Días venc.", "Total S/", "Pagado S/", "Saldo S/", "Estado"];
  const body = d.filas.map((f) => [
    f.externo ? `${f.documento}\n${f.externo.numero}` : f.documento,
    `${f.cliente}${f.clienteDoc ? `\n${f.clienteDoc}` : ""}`,
    fechaPE(f.fecha),
    fechaPE(f.vencimiento),
    f.diasVencido ? String(f.diasVencido) : "",
    m(f.total),
    m(f.pagado),
    m(f.saldo),
    f.estado,
  ]);
  const anchos = { 0: { cellWidth: 22 }, 1: { cellWidth: 44 }, 2: { cellWidth: 16 }, 3: { cellWidth: 16 }, 4: { cellWidth: 11 }, 8: { cellWidth: 20 } };
  const totales: [string, string][] = [
    ["Documentos", String(d.filas.length)],
    ["Importe total", soles(total)],
    ["Pagado", soles(pagado)],
    ["Vencido", soles(d.vencido)],
    ["SALDO POR COBRAR", soles(d.totalSaldo)],
  ];
  const H = 297;
  const saltar = (doc: jsPDF, y: number, alto: number) => {
    if (y + alto <= H - ALTO_PIE - 8) return y;
    doc.addPage();
    return 20;
  };
  const detalle = (doc: jsPDF, y: number): number => {
    y = tituloSeccion(doc, saltar(doc, y + 2, 20), "DETALLE POR DOCUMENTO");
    return tabla(doc, y, head, body, [4, 5, 6, 7], anchos);
  };
  const resumen = d.agrupado;
  guardar(
    construir({
      titulo: "REPORTE DE DEUDAS · CUENTAS POR COBRAR",
      numero: fechaPE(hoyIso),
      estado: "REPORTE",
      datos: [
        ["Emitido", new Date().toLocaleString("es-PE")],
        ["Documentos", String(d.filas.length)],
        ["Saldo por cobrar", soles(d.totalSaldo)],
        ["Vencido", soles(d.vencido)],
        ["Agrupado por", resumen?.por ?? "Sin agrupar"],
        ["Filtros", d.filtros || "Ninguno (todas las cuentas)"],
      ],
      columnas: 2,
      ...(resumen
        ? {
            head: [resumen.por, "Docs.", "Total S/", "Pagado S/", "Saldo S/", "Vencido S/", "% deuda"],
            body: [
              ...resumen.grupos.map((g) => [g.etiqueta, String(g.documentos), m(g.total), m(g.pagado), m(g.saldo), m(g.vencido), pct(g.saldo)]),
              ["TOTAL", String(d.filas.length), m(total), m(pagado), m(d.totalSaldo), m(d.vencido), d.totalSaldo > 0 ? "100 %" : "-"],
            ],
            alinearDerecha: [1, 2, 3, 4, 5, 6],
            extra: (doc: jsPDF, y: number) => bloqueTotales(doc, detalle(doc, y), totales),
          }
        : {
            head,
            body,
            alinearDerecha: [4, 5, 6, 7],
            totales,
          }),
      notas: [
        "Saldo = importe total menos los cobros registrados (adelantos y pagos). Días venc. = días desde la fecha de vencimiento hasta hoy.",
        ...(resumen?.por.startsWith("Equipo") ? ["Por equipo / producto: el saldo de cada documento se reparte según el importe de cada producto."] : []),
      ],
      firmas: ["Finanzas / Tesorería", "Gerencia"],
    }),
    `REPORTE-DEUDAS-CXC-${hoyIso}`
  );
}

/** Una fila del reporte de stock (ya agrupada / filtrada como en pantalla). */
export interface FilaStockReporte {
  nombre: string;
  categoria: string;
  sede: string;
  unidad: string;
  cantidad: number;
  costoUnit: number;
  valor: number;
  actualizado: string;
}

/**
 * Reporte de stock de almacén en A4 vertical (Williams, 2026-11-17): Almacén › Stock y Kardex › Exportar.
 * Sigue los filtros de la pantalla (almacén, categoría, búsqueda, sin valorizar). Pie en cada hoja.
 */
export function pdfReporteStock(d: { filas: FilaStockReporte[]; filtros: string; almacen: string }): void {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const m = (n: number) => soles(n).replace(/^S\/\s*/, "");
  const cant = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  const valorizado = d.filas.reduce((a, f) => a + f.valor, 0);
  const sinValor = d.filas.filter((f) => !(f.costoUnit > 0)).length;
  const sinStock = d.filas.filter((f) => f.cantidad <= 0).length;
  const variasSedes = new Set(d.filas.map((f) => f.sede)).size > 1;
  const head = ["N°", "Producto", "Categoría", ...(variasSedes ? ["Almacén"] : []), "Und.", "Cantidad", "Últ. costo S/", "Valorizado S/"];
  const body = d.filas.map((f, i) => [
    String(i + 1),
    f.nombre,
    f.categoria,
    ...(variasSedes ? [f.sede] : []),
    f.unidad,
    cant(f.cantidad),
    f.costoUnit > 0 ? m(f.costoUnit) : "-",
    f.costoUnit > 0 ? m(f.valor) : "-",
  ]);
  const n = head.length;
  guardar(
    construir({
      titulo: "REPORTE DE STOCK DE ALMACÉN",
      numero: fechaPE(hoyIso),
      estado: "REPORTE",
      datos: [
        ["Almacén", d.almacen],
        ["Emitido", new Date().toLocaleString("es-PE")],
        ["Productos", String(d.filas.length)],
        ["Valorizado", soles(valorizado)],
        ["Sin valorizar / sin stock", `${sinValor} / ${sinStock}`],
        ["Filtros", d.filtros || "Ninguno"],
      ],
      columnas: 2,
      head,
      body,
      alinearDerecha: [0, n - 3, n - 2, n - 1],
      totales: [
        ["Productos", String(d.filas.length)],
        ["Sin valorizar", String(sinValor)],
        ["VALORIZADO TOTAL", soles(valorizado)],
      ],
      notas: ["Último costo: sin IGV en factura / OC, con IGV en boleta. Valorizado = cantidad × último costo."],
      firmas: ["Almacén", "Logística / Gerencia"],
    }),
    `STOCK-${d.almacen.replace(/\s+/g, "-")}-${hoyIso}`
  );
}

/** Declaración jurada de gasto (gasto sin comprobante) con su N° correlativo DJ-0001. */
export function docDeclaracionJurada(f: Factura): jsPDF {
  const n = numeroDJ(f);
  // La DJ (comprobante DJ o automática de un gasto "Sin comprobante") siempre es de un gasto sin comprobante de pago
  const motivo = "Gasto sin comprobante de pago autorizado";
  const doc = construir({
    titulo: `DECLARACIÓN JURADA DE GASTO N° ${n}`,
    numero: n,
    estado: f.djEstado === "APROBADA" ? "APROBADA" : f.djEstado === "ENVIADA" ? "EN APROBACIÓN" : estadoDocumento(f.estadoPago),
    datos: [
      ["Fecha", fechaPE(f.fecha)],
      ["Concepto", f.descripcion ?? "-"],
      ["Importe", soles(f.total)],
      ["Proveedor", f.proveedor],
      ["DNI / RUC", f.ruc || "-"],
      f.compraDirecta ? ["Compra (ingreso a stock)", f.numero] : ["Código de gasto", f.codigo ?? "-"],
      ["Motivo", motivo],
    ],
    head: ["#", "Concepto", "Importe"],
    body: [[1, f.descripcion ?? "-", soles(f.total)]],
    alinearDerecha: [2],
    totales: [["TOTAL", soles(f.total)]],
    notas: [
      `Yo, ${f.proveedor}${f.ruc ? `, identificado con ${f.ruc.length === 11 ? "RUC" : "DNI"} ${f.ruc}` : ""}, declaro bajo juramento haber recibido de ${EMPRESA.razonSocial} (RUC ${EMPRESA.ruc}) el importe de ${soles(f.total)} por el concepto indicado, el ${fechaPE(f.fecha)}, sin haber emitido comprobante de pago.`,
      "Motivo: gasto sin comprobante de pago autorizado. Documento sustentatorio interno; no otorga derecho a crédito fiscal.",
    ],
    firmas: ["Firma Solicitante", "Firma Gerencia"],
  });
  doc.setProperties({ title: n });
  return doc;
}

/** Vista previa de DJ-0005.pdf */
export function pdfDeclaracionJurada(f: Factura): void {
  guardar(docDeclaracionJurada(f), numeroDJ(f));
}

/** URL blob para ver la DJ dentro de un iframe (vista previa del modal). */
export const urlDeclaracionJurada = (f: Factura): string => String(docDeclaracionJurada(f).output("bloburl"));


export function pdfFactura(f: Factura, oc?: OrdenCompra): void {
  if (f.esGastoTesoreria && f.comprobanteGasto === "DJ") {
    pdfDeclaracionJurada(f);
    return;
  }
  if (f.esGastoTesoreria) {
    void conCodigo(async () => {
      const codigo = await codigoGasto(f.id);
      // Gasto sin cotización (antiguo o guardado antes de correr el SQL): se le asigna COT-PROV-xxxx-AAAA ahora
      const g = await cotizacionGasto(f.id).catch(() => getFacturas().find((x) => x.id === f.id) ?? f);
      pdfGasto({ ...g, codigo }, codigo);
    });
    return;
  }
  const esDJ = f.tipo === "DECLARACION_JURADA";
  abrir(
    construir({
      titulo: esDJ ? "DECLARACIÓN JURADA DE COMPRA" : "REGISTRO DE FACTURA DE COMPRA",
      numero: f.numero,
      estado: f.estadoPago === "PAGADA" ? "PAGADA" : "POR PAGAR",
      datos: [
        [esDJ ? "Vendedor" : "Proveedor", f.proveedor],
        [esDJ ? "DNI" : "RUC", f.ruc],
        ["Fecha", fechaPE(f.fecha)],
        ["Vencimiento", fechaPE(f.fechaVencimiento)],
        ["Orden compra", f.ocNumero],
        ["Requerimiento", f.reqNumero],
        ...(esDJ
          ? ([
              ["Motivo", f.motivoSinComprobante ?? "-"],
              ["Aprobado por", f.aprobadoPor ?? "-"],
            ] as [string, string][])
          : []),
      ],
      head: ["#", "Descripción", "Cant.", "Und.", oc && !esDJ ? cabPU(oc) : "P. Unit.", "Importe"],
      body: (oc?.items ?? []).map((i, k) => [k + 1, i.nombre, i.cantidad, i.unidad, soles(i.precioUnit), soles(i.subtotal)]),
      alinearDerecha: [2, 4, 5],
      totales: esDJ ? [["TOTAL (sin IGV)", soles(f.total)]] : totales(f.subtotal, f.igv, f.total),
      notas: esDJ
        ? [
        `Yo, ${f.proveedor}, identificado con DNI ${f.ruc}, declaro bajo juramento haber vendido los bienes detallados a ${EMPRESA.razonSocial} por el importe indicado, no estando obligado a emitir comprobante de pago. Documento sustentatorio interno; no otorga derecho a crédito fiscal.`,
          ]
        : undefined,
      firmas: esDJ ? ["Vendedor (DNI)", "Comprador", "Aprobado: Gerencia"] : ["Tesorería", "Contabilidad"],
    }),
    f.numero
  );
}

export function pdfActaIngreso(o: OrdenCompra, f?: Factura, g?: Guia): void {
  abrir(
    construir({
      titulo: "ACTA DE INGRESO A ALMACÉN",
      numero: o.numero,
      estado: o.estado,
      datos: [
        ["Proveedor", o.proveedor],
        ["RUC", o.ruc],
        ["Comprobante", f ? `${f.tipo === "FACTURA" ? "Factura" : "DJ"} ${f.numero}` : "-"],
        ["Guía remisión", g?.numero ?? "No aplica"],
        ["Requerimiento", o.reqNumero],
        ["Sede", o.lugarEntrega],
        ["Recibido por", o.vistoBueno?.recibidoPor ?? "-"],
        ["Fecha V°B°", o.vistoBueno ? new Date(o.vistoBueno.fecha).toLocaleString("es-PE") : "-"],
      ],
      head: ["#", "Descripción", "Marca", "Cant. OC", "Und.", "Conforme"],
      body: o.items.map((i, k) => [k + 1, i.nombre, i.marca || "-", i.cantidad, i.unidad, o.vistoBueno ? "SÍ" : "PEND."]),
      alinearDerecha: [3],
      notas: o.vistoBueno?.observaciones ? [`Observaciones: ${o.vistoBueno.observaciones}`] : undefined,
      firmas: ["Entregado por (Proveedor)", "Recibido: Almacén", "V°B° Jefe de Almacén"],
    }),
    `ACTA-${o.numero}`
  );
}

// =====================================================================
// VENTAS
// =====================================================================

const lineasCuentas = (): string[] =>
  EMPRESA.cuentas.map((c) => `${c.banco} ${c.moneda}: ${c.numero}  ·  CCI: ${c.cci}`);

const medida = (l: LineaVenta) => (l.ancho > 0 && l.alto > 0 ? `${l.ancho} × ${l.alto} m` : "-");

const cuerpoVenta = (items: LineaVenta[]) =>
  items.map((l, k) => [
    k + 1,
    l.descripcion,
    medida(l),
    l.cantidad,
    l.m2 > 0 ? l.m2.toFixed(2) : "-",
    soles(l.precio) + (l.m2 > 0 ? "/m²" : ""),
    soles(l.total),
  ]);

/** Código SUNAT del tipo de documento del cliente: 6 RUC, 1 DNI, 4 CE. */
const tipoDocSunat = (doc: string) => (doc.startsWith("RUC") ? "6" : doc.startsWith("DNI") ? "1" : "4");

export function pdfNotaPedido(n: NotaPedido): void {
  guardar(construir(bloqueNotaPedido(n)), codigoDesdeNumero("NP", n.numero, n.fecha));
}

function bloqueNotaPedido(n: NotaPedido): Bloque {
  const vence = new Date(`${n.fecha}T12:00:00`);
  vence.setDate(vence.getDate() + n.validezDias);
  const codigo = codigoDesdeNumero("NP", n.numero, n.fecha);
  return {
      titulo: "NOTA DE PEDIDO",
      numero: codigo,
      estado: estadoDocumento(n.estado),
      datos: [
        ["N° NP", n.numero],
        ["Cliente", n.cliente],
        ["Documento", n.clienteDoc],
        ["Fecha", fechaPE(n.fecha)],
        ["Válida hasta", `${fechaPE(vence.toISOString())} (${n.validezDias} días)`],
        ["Lugar de obra", n.lugarObra || "-"],
        ["Fecha entrega", n.fechaEntrega ? fechaPE(n.fechaEntrega) : "A coordinar"],
        [
          "Cond. de pago",
          `${n.condPagoNombre}${n.fechaVencimiento ? ` · ${n.diasCredito} días · vence ${fechaPE(n.fechaVencimiento)}` : ""}${n.condPagoDetalle ? ` · ${n.condPagoDetalle}` : ""}`,
        ],
        ["Vendedor", n.vendedor],
      ],
      head: ["#", "Descripción", "Medidas", "Cant.", "m²", n.preciosConIgv && n.conIgv ? "Precio inc. IGV" : "Precio", "Total"],
      body: cuerpoVenta(n.items),
      alinearDerecha: [3, 4, 5, 6],
      totales: [
        ...(n.descuento > 0 ? ([["Descuento", `- ${soles(n.descuento)}`]] as [string, string][]) : []),
        [n.conIgv ? (n.preciosConIgv ? "Base imponible" : "Subtotal") : "Subtotal (sin IGV)", soles(n.subtotal)],
        ...(n.conIgv ? ([["IGV 18%", soles(n.igv)]] as [string, string][]) : []),
        ["TOTAL", soles(n.total)],
      ],
      notas: [
        ...(n.observaciones ? [`Observaciones: ${n.observaciones}`] : []),
        `Condiciones: precios en soles${n.conIgv ? " incluyen IGV" : " no incluyen IGV"}. Oferta válida ${n.validezDias} días. Medidas en metros; el m² se calcula ancho × alto × cantidad. Plazo de entrega sujeto a confirmación del pedido.`,
      ],
      qr: `${EMPRESA.ruc}|NP|${n.numero}|${n.total.toFixed(2)}|${n.fecha}|${n.clienteDoc}`,
      qrTexto: [`Pagos a nombre de ${EMPRESA.razonSocial} · RUC ${EMPRESA.ruc}:`, ...lineasCuentas(), `Enviar constancia indicando la ${n.numero}.`],
      firmas: [`Vendedor: ${n.vendedor}`, "Aceptado: Cliente"],
  };
}

/** Pago a cuenta que se muestra en la nota de pedido actualizada. */
export interface PagoVentaPDF {
  fecha: string;
  monto: number;
  cuenta: string;
  referencia: string;
  observacion?: string;
  documento: string; // NP-0001 / F001-0001 (dónde se registró el cobro)
}

/**
 * Nota de pedido ACTUALIZADA (Cuentas por cobrar): la NP con sus adelantos (fecha, N° de operación, caja/banco),
 * total pagado y saldo pendiente. Sin NP (comprobante directo) se arma con los datos del comprobante.
 */
export function pdfNotaPedidoActualizada(d: {
  np?: NotaPedido;
  comprobante?: ComprobanteVenta;
  pagos: PagoVentaPDF[];
  total: number;
  pagado: number;
  saldo: number;
  vencimiento: string;
}): void {
  const { np, comprobante: c } = d;
  const hoyIso = new Date().toISOString().slice(0, 10);
  const base: Bloque = np
    ? bloqueNotaPedido(np)
    : {
        titulo: "NOTA DE PEDIDO",
        numero: c!.numero,
        datos: [
          ["Comprobante", c!.numero],
          ["Cliente", c!.cliente],
          ["Documento", c!.clienteDoc],
          ["Fecha", fechaPE(c!.fecha)],
          ["Forma de pago", c!.formaPago === "CONTADO" ? "Contado" : `${c!.condPagoNombre} · vence ${fechaPE(c!.fechaVenc)}`],
          ["Vendedor", c!.vendedor || "-"],
        ],
        head: ["#", "Descripción", "Medidas", "Cant.", "m²", c!.preciosConIgv && c!.conIgv ? "Precio inc. IGV" : "Precio", "Total"],
        body: cuerpoVenta(c!.items),
        alinearDerecha: [3, 4, 5, 6],
        totales: [
          ...(c!.descuento > 0 ? ([["Descuento", `- ${soles(c!.descuento)}`]] as [string, string][]) : []),
          [c!.conIgv ? "Op. gravada" : "Op. inafecta", soles(c!.base)],
          ...(c!.conIgv ? ([["IGV 18%", soles(c!.igv)]] as [string, string][]) : []),
          ["TOTAL", soles(c!.total)],
        ],
        firmas: [`Vendedor: ${c!.vendedor || "-"}`, "Aceptado: Cliente"],
      };
  const numero = base.numero;
  const ext = np?.comprobanteExterno ?? c?.comprobanteExterno;
  const datos: [string, string][] = [
    ...base.datos,
    ...(c && np ? ([["Comprobante", c.numero]] as [string, string][]) : []),
    ...(ext ? ([["Comp. externo", ext.numero]] as [string, string][]) : []),
    ["Actualizada al", fechaPE(hoyIso)],
  ];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const conDetalle = r2(d.pagos.reduce((a, p) => a + p.monto, 0));
  // Cobros antiguos sin registro individual: se muestran juntos para que cuadre con lo pagado
  const sinDetalle = r2(d.pagado - conDetalle);
  guardar(
    construir({
      ...base,
      titulo: "NOTA DE PEDIDO · ACTUALIZADA",
      estado: d.saldo <= 0.001 ? "CANCELADA" : d.pagado > 0 ? "CON ADELANTOS" : "POR COBRAR",
      datos,
      extra: (doc, y) => {
        const H = doc.internal.pageSize.getHeight();
        if (y + 30 > H - ALTO_PIE - 6) {
          doc.addPage();
          y = 20;
        }
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...AZUL);
        doc.text("ADELANTOS Y PAGOS A CUENTA", M, y);
        y += 2;
        const filas: (string | number)[][] = d.pagos
          .slice()
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((p, i) => [i + 1, fechaPE(p.fecha), p.referencia || "-", p.cuenta || "-", p.documento, p.observacion || "-", soles(p.monto)]);
        if (sinDetalle > 0.009) filas.push([filas.length + 1, "-", "Pagos anteriores (sin detalle)", "-", "-", "-", soles(sinDetalle)]);
        if (!filas.length) filas.push(["", "", "Aún no se registran adelantos", "", "", "", soles(0)]);
        y = tabla(doc, y, ["#", "Fecha", "N° operación", "Caja / Banco", "Registrado en", "Observación", "Monto"], filas, [6], {
          0: { cellWidth: 7 },
          1: { cellWidth: 19 },
          6: { cellWidth: 25 },
        });
        return bloqueTotales(doc, y, [
          ["Total de la venta", soles(d.total)],
          ["(-) Adelantos / pagos", `- ${soles(d.pagado)}`],
          [d.saldo <= 0.001 ? "SALDO (CANCELADO)" : "SALDO PENDIENTE", soles(Math.max(0, d.saldo))],
        ]);
      },
      notas: [
        `Saldo calculado al ${fechaPE(hoyIso)}${d.saldo > 0.001 ? ` · vence ${fechaPE(d.vencimiento)}` : ""}. Los adelantos se descuentan del total de la venta.`,
        ...(base.notas ?? []),
      ],
    }),
    `${numero}-ACTUALIZADA`
  );
}

const CODIGO_CPE: Record<ComprobanteVenta["tipo"], string> = { FACTURA: "01", BOLETA: "03", NOTA_CREDITO: "07", NOTA_DEBITO: "08" };
const TITULO_CPE: Record<ComprobanteVenta["tipo"], string> = {
  FACTURA: "FACTURA ELECTRÓNICA",
  BOLETA: "BOLETA DE VENTA ELECTRÓNICA",
  NOTA_CREDITO: "NOTA DE CRÉDITO ELECTRÓNICA",
  NOTA_DEBITO: "NOTA DE DÉBITO ELECTRÓNICA",
};

/** QR de la representación impresa (formato SUNAT): RUC|TIPO|SERIE|NÚMERO|IGV|TOTAL|FECHA|TIPO DOC|N° DOC|HASH| */
function qrSunat(c: ComprobanteVenta): string {
  const [doc, num] = c.clienteDoc.split(" ");
  return [EMPRESA.ruc, CODIGO_CPE[c.tipo], c.serie, c.numero.split("-")[1] ?? "", c.igv.toFixed(2), c.total.toFixed(2), c.fecha, tipoDocSunat(doc), num, c.sunat?.hash ?? "", ""].join("|");
}

/** Leyenda SUNAT de la representación impresa (estado y valor resumen / hash). */
function leyendaSunat(c: ComprobanteVenta): string[] {
  const titulo = TITULO_CPE[c.tipo].toLowerCase();
  const estado =
    c.estadoSunat === "ACEPTADO" || c.estadoSunat === "OBSERVADO"
      ? `Aceptado por SUNAT${c.sunat?.entorno === "beta" ? " (BETA - PRUEBAS, sin valor legal)" : ""}`
      : c.estadoSunat === "ANULADO"
        ? "Anulado ante SUNAT (comunicación de baja)"
        : c.estadoSunat === "RECHAZADO"
          ? "RECHAZADO por SUNAT: sin validez"
          : "Pendiente de envío a SUNAT";
  return [
    `Representación impresa de la ${titulo}. Consulte su validez en www.sunat.gob.pe. ${estado}.`,
    ...(c.sunat?.hash ? [`Valor resumen (hash): ${c.sunat.hash}`] : []),
  ];
}

// ---------------------------------------------------------------------
// Representación impresa propia (COMBOY VID): Factura, Boleta, NC, ND y Guía de Remisión T005,
// en A4, ticket 80 mm y ticket 58 mm. Todo sale de los datos guardados en Supabase (no del PDF del PSE).
// ---------------------------------------------------------------------

export type TamanoPdf = "A4" | "80" | "58";
export const TAMANOS_PDF: { id: TamanoPdf; label: string; detalle: string }[] = [
  { id: "A4", label: "A4", detalle: "Hoja completa" },
  { id: "80", label: "Ticket 80 mm", detalle: "Ticketera estándar" },
  { id: "58", label: "Ticket 58 mm", detalle: "Ticketera pequeña / portátil" },
];

/** Respuesta del CDR guardada con el documento (código y descripción de SUNAT). */
function lineaCdr(s?: { codigo?: string; descripcion?: string }): string[] {
  if (!s?.codigo && !s?.descripcion) return [];
  return [`CDR SUNAT: ${[s.codigo ? `código ${s.codigo}` : "", s.descripcion ?? ""].filter(Boolean).join(" · ")}`];
}

const letrasTotal = (total: number) => montoEnLetras(total);

function docA4Comprobante(c: ComprobanteVenta): jsPDF {
  const titulo = TITULO_CPE[c.tipo];
  return construir({
    titulo,
    numero: c.numero || "BORRADOR",
    estado: c.estado === "EMITIDO" ? (c.ref ? "EMITIDO" : c.saldo > 0 ? "EMITIDO · POR COBRAR" : "EMITIDO · COBRADO") : c.estado,
    datos: [
      ["Cliente", c.cliente],
      ["Documento", c.clienteDoc],
      ["Dirección", c.clienteDireccion || "-"],
      ["Fecha emisión", fechaPE(c.fecha)],
      ["Forma de pago", c.formaPago === "CONTADO" ? "Contado" : `${c.condPagoNombre} · vence ${fechaPE(c.fechaVenc)}`],
      ...(c.ref
        ? ([
            ["Documento que modifica", `${c.ref.numero} (${fechaPE(c.ref.fecha)})`],
            ["Motivo", `${c.motivoCodigo ?? ""} · ${c.motivoDescripcion ?? ""}`],
          ] as [string, string][])
        : ([
            ["Nota de pedido", c.npNumero ?? "-"],
            ["Orden despacho", c.odNumero ?? "-"],
          ] as [string, string][])),
      ["Moneda", "Soles (PEN)"],
    ],
    head: ["#", "Descripción", "Medidas", "Cant.", "m²", c.preciosConIgv ? (c.conIgv ? "P. unit. inc. IGV" : "P. unit.") : "V. unit.", c.preciosConIgv ? "Importe" : "Valor venta"],
    body: cuerpoVenta(c.items.map((l) => ({ ...l, descripcion: [l.productoNombre, l.descripcion].filter((x) => x && x.trim()).join(" - ") }))),
    alinearDerecha: [3, 4, 5, 6],
    totales: [
      ...(c.descuento > 0 ? ([["Descuento", `- ${soles(c.descuento)}`]] as [string, string][]) : []),
      [c.conIgv ? "Op. gravada" : "Op. inafecta", soles(c.base)],
      ["IGV 18%", soles(c.igv)],
      ["IMPORTE TOTAL", soles(c.total)],
    ],
    notas: [
      letrasTotal(c.total),
      ...(c.cuotas.length
        ? [`Cuotas: ${c.cuotas.map((q) => `N°${q.n} ${fechaPE(q.fecha)} ${soles(q.monto)}`).join(" · ")}${c.inicial > 0 ? ` · Inicial ${soles(c.inicial)}` : ""}`]
        : []),
      ...leyendaSunat(c),
      ...lineaCdr(c.sunat),
    ],
    qr: qrSunat(c),
    qrTexto: [`${titulo} ${c.numero}`, `Total ${soles(c.total)} · IGV ${soles(c.igv)}`, ...lineasCuentas()],
    firmas: ["Emisor", "Recibí conforme: Cliente"],
  });
}

/** Contenido de un ticket (80 / 58 mm): se mide primero y la hoja sale del largo justo. */
interface Ticket {
  titulo: string;
  numero: string;
  cabecera: string[];
  /** Líneas de detalle: texto y, opcional, importe a la derecha en la línea siguiente. */
  lineas: { texto: string; derecha?: string; izquierda?: string }[];
  totales: { k: string; v: string; fuerte?: boolean }[];
  pie: string[];
  qr: string;
  leyenda: string[];
  despedida?: string;
}

function docTicket(t: Ticket, ancho: 80 | 58): jsPDF {
  const chico = ancho === 58;
  const m = chico ? 3 : 4;
  const util = ancho - 2 * m;
  const cx = ancho / 2;
  const f = (n: number) => (chico ? n - 0.8 : n); // tipografía un poco menor en 58 mm
  const qrLado = chico ? 24 : 28;
  const pieAlto = 22;

  const pintar = (doc: jsPDF, alto: number): number => {
    let y = 8;
    const linea = (txt: string, size = 7.5, bold = false, align: "center" | "left" = "center") => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(f(size));
      const l = doc.splitTextToSize(txt, util) as string[];
      doc.text(l, align === "center" ? cx : m, y, { align });
      y += l.length * (f(size) * 0.45);
    };
    const sep = () => {
      doc.setDrawColor(150);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(m, y, ancho - m, y);
      doc.setLineDashPattern([], 0);
      y += 3.5;
    };
    const fila = (k: string, v: string, fuerte = false) => {
      doc.setFont("helvetica", fuerte ? "bold" : "normal");
      doc.setFontSize(f(fuerte ? 9 : 7.5));
      doc.text(k, m, y);
      doc.text(v, ancho - m, y, { align: "right" });
      y += fuerte ? 5 : 4;
    };
    dibujarLogo(doc, chico ? 6 : 8, 4, ancho - (chico ? 12 : 16), chico ? 13 : 16);
    doc.setTextColor(0, 0, 0);
    y = chico ? 21 : 24;
    linea(EMPRESA.razonSocial, 8, true);
    linea(`RUC ${EMPRESA.ruc}`, 7.5, true);
    linea(EMPRESA.direccion);
    linea(EMPRESA.telefono);
    y += 1;
    sep();
    linea(t.titulo, 8.5, true);
    linea(t.numero, 10, true);
    sep();
    t.cabecera.forEach((x) => linea(x, 7.5, false, "left"));
    sep();
    t.lineas.forEach((l) => {
      linea(l.texto, 7.5, false, "left");
      if (l.derecha) fila(`   ${l.izquierda ?? ""}`, l.derecha);
    });
    if (t.totales.length) {
      sep();
      t.totales.forEach((x) => fila(x.k, x.v, x.fuerte));
    }
    if (t.pie.length) {
      sep();
      t.pie.forEach((x) => linea(x, 7, false, "left"));
    }
    sep();
    dibujarQR(doc, t.qr, cx - qrLado / 2, y, qrLado);
    y += qrLado + 3;
    t.leyenda.forEach((x) => linea(x, 6.5));
    if (t.despedida) linea(t.despedida, 8, true);
    // Pie negro ÁREA INFORMÁTICA (al final del ticket)
    y = Math.max(y + 2, alto - pieAlto);
    doc.setFillColor(...ROJO);
    doc.rect(0, y, ancho, 3 * PT, "F");
    doc.setFillColor(...NEGRO);
    doc.rect(0, y + 3 * PT, ancho, Math.max(pieAlto, alto - y), "F");
    doc.setTextColor(255, 255, 255);
    y += 5;
    linea("ÁREA INFORMÁTICA - COMBOY VID", 8, true);
    linea(`${EMPRESA.nombreComercial} • RUC ${EMPRESA.ruc}`, 5.5);
    linea(`${EMPRESA.email} • Tel: ${EMPRESA.telefono}`, 5.5);
    doc.setTextColor(226, 232, 240);
    linea(`Documento generado: ${new Date().toLocaleString("es-PE")}`, 5);
    doc.setTextColor(160, 160, 160);
    linea("DOCUMENTO OFICIAL • NO MODIFICABLE • REGISTRO HISTORIAL", 5);
    doc.setTextColor(0, 0, 0);
    return y;
  };

  // 1) se mide en una hoja larga; 2) se dibuja en una del largo exacto (rollo de ticketera)
  const medida = new jsPDF({ unit: "mm", format: [ancho, 3000] });
  const fin = pintar(medida, 0);
  const alto = Math.ceil(fin + 4);
  const doc = new jsPDF({ unit: "mm", format: [ancho, alto] });
  pintar(doc, alto);
  return doc;
}

function ticketComprobante(c: ComprobanteVenta): Ticket {
  return {
    titulo: TITULO_CPE[c.tipo],
    numero: c.numero || "BORRADOR",
    cabecera: [
      `Fecha: ${fechaPE(c.fecha)}`,
      `Cliente: ${c.cliente}`,
      c.clienteDoc,
      ...(c.clienteDireccion ? [`Dirección: ${c.clienteDireccion}`] : []),
      ...(c.ref ? [`Modifica: ${c.ref.numero}`, `Motivo: ${c.motivoCodigo ?? ""} ${c.motivoDescripcion ?? ""}`] : []),
      `Pago: ${c.formaPago === "CONTADO" ? "Contado" : `${c.condPagoNombre} (vence ${fechaPE(c.fechaVenc)})`}`,
    ],
    lineas: c.items.map((l) => ({
      texto: `${l.cantidad} x ${[l.productoNombre, l.descripcion].filter((x) => x && x.trim()).join(" - ")}${l.m2 > 0 ? ` (${l.ancho}x${l.alto} m = ${l.m2.toFixed(2)} m²)` : ""}`,
      izquierda: `${soles(l.precio)}${l.m2 > 0 ? "/m²" : ""}`,
      derecha: soles(l.total),
    })),
    totales: [
      ...(c.descuento > 0 ? [{ k: "Descuento", v: `- ${soles(c.descuento)}` }] : []),
      { k: c.conIgv ? "Op. gravada" : "Op. inafecta", v: soles(c.base) },
      { k: "IGV 18%", v: soles(c.igv) },
      { k: "TOTAL", v: soles(c.total), fuerte: true },
    ],
    pie: [letrasTotal(c.total)],
    qr: qrSunat(c),
    leyenda: [...leyendaSunat(c), ...lineaCdr(c.sunat)],
    despedida: "¡Gracias por su compra!",
  };
}

/** PDF del comprobante en el tamaño pedido (sin mostrarlo). */
export function docComprobanteVenta(c: ComprobanteVenta, tam: TamanoPdf = "A4"): jsPDF {
  return tam === "A4" ? docA4Comprobante(c) : docTicket(ticketComprobante(c), tam === "58" ? 58 : 80);
}

const sufijo = (tam: TamanoPdf) => (tam === "A4" ? "" : `-ticket${tam}`);

export function pdfComprobanteVenta(c: ComprobanteVenta, tam: TamanoPdf = "A4"): void {
  abrir(docComprobanteVenta(c, tam), `${c.numero || "borrador"}${sufijo(tam)}`);
}

/** Ticket 80 mm (se mantiene por compatibilidad). */
export function pdfTicketVenta(c: ComprobanteVenta): void {
  pdfComprobanteVenta(c, "80");
}

export function imprimirComprobanteVenta(c: ComprobanteVenta, tam: TamanoPdf): void {
  imprimirPDF(docComprobanteVenta(c, tam), `${c.numero || "borrador"}${sufijo(tam)}`);
}

// --------------------------- Guía de Remisión T005 ---------------------------

const MODALIDAD_GUIA: Record<string, string> = { "01": "Transporte público", "02": "Transporte privado" };
const MOTIVO_GUIA: Record<string, string> = {
  "01": "Venta",
  "02": "Compra",
  "04": "Traslado entre establecimientos de la misma empresa",
  "13": "Otros",
  "14": "Venta sujeta a confirmación del comprador",
};

function qrGuia(g: GuiaRemision): string {
  const [doc, num] = g.clienteDoc.split(" ");
  return [EMPRESA.ruc, "09", g.serie, g.numero.split("-")[1] ?? "", g.fecha, tipoDocSunat(doc ?? ""), num ?? "", g.sunat?.hash ?? "", ""].join("|");
}

function leyendaGuia(g: GuiaRemision): string[] {
  const estado =
    g.estado === "ANULADA"
      ? "ANULADA en el ERP: sin validez"
      : g.estadoSunat === "ACEPTADO" || g.estadoSunat === "OBSERVADO"
        ? `Aceptada por SUNAT${g.sunat?.entorno === "beta" ? " (BETA - PRUEBAS, sin valor legal)" : ""}`
        : g.estadoSunat === "RECHAZADO"
          ? "RECHAZADA por SUNAT: sin validez"
          : g.estadoSunat === "ENVIADO"
            ? "En proceso en SUNAT"
            : "Pendiente de envío a SUNAT";
  return [
    `Representación impresa de la guía de remisión remitente electrónica. Consulte su validez en www.sunat.gob.pe. ${estado}.`,
    ...(g.sunat?.hash ? [`Valor resumen (hash): ${g.sunat.hash}`] : []),
  ];
}

const transporteGuia = (g: GuiaRemision): [string, string][] =>
  g.modalidad === "01"
    ? [
        ["Transportista", `${g.transportistaNombre} · RUC ${g.transportistaRuc}`],
        ...(g.placa ? ([["Placa", g.placa]] as [string, string][]) : []),
      ]
    : [
        ["Conductor", `${g.conductorNombres} ${g.conductorApellidos} · DNI ${g.conductorDni}`],
        ["Licencia", g.conductorLicencia],
        ["Placa", g.placa],
      ];

function docA4Guia(g: GuiaRemision): jsPDF {
  return construir({
    titulo: "GUÍA DE REMISIÓN REMITENTE ELECTRÓNICA",
    numero: g.numero,
    estado: g.estado,
    datos: [
      ["Destinatario", g.cliente],
      ["Documento", g.clienteDoc],
      ["Fecha emisión", fechaPE(g.fecha)],
      ["Inicio de traslado", fechaPE(g.fechaTraslado)],
      ["Motivo de traslado", `${g.motivoTraslado} · ${MOTIVO_GUIA[g.motivoTraslado] ?? ""}`],
      ["Modalidad", MODALIDAD_GUIA[g.modalidad] ?? g.modalidad],
      ...transporteGuia(g),
      ["Punto de partida", `${g.partidaDireccion} (ubigeo ${g.partidaUbigeo})`],
      ["Punto de llegada", `${g.llegadaDireccion} (ubigeo ${g.llegadaUbigeo})`],
      ["Peso bruto total", `${g.pesoKg} kg`],
      ["N° de bultos", String(g.bultos)],
      ["Comprobante relacionado", g.comprobanteNumero ?? "-"],
    ],
    columnas: 2,
    head: ["#", "Código", "Descripción", "Unidad", "Cantidad"],
    body: g.items.map((l, k) => [k + 1, l.codigo || String(k + 1).padStart(3, "0"), l.descripcion, l.unidad, l.cantidad]),
    alinearDerecha: [4],
    notas: [...(g.observaciones ? [`Observaciones: ${g.observaciones}`] : []), ...leyendaGuia(g), ...lineaCdr(g.sunat)],
    qr: qrGuia(g),
    qrTexto: [`Guía ${g.numero}`, `${g.pesoKg} kg · ${g.bultos} bulto(s)`, `Destino: ${g.llegadaDireccion}`],
    firmas: ["Remitente", "Transportista / Conductor", "Recibí conforme: Destinatario"],
  });
}

function ticketGuia(g: GuiaRemision): Ticket {
  return {
    titulo: "GUÍA DE REMISIÓN REMITENTE ELECTRÓNICA",
    numero: g.numero,
    cabecera: [
      `Emisión: ${fechaPE(g.fecha)} · Traslado: ${fechaPE(g.fechaTraslado)}`,
      `Destinatario: ${g.cliente}`,
      g.clienteDoc,
      `Motivo: ${g.motivoTraslado} ${MOTIVO_GUIA[g.motivoTraslado] ?? ""}`,
      `${MODALIDAD_GUIA[g.modalidad] ?? g.modalidad}`,
      ...transporteGuia(g).map(([k, v]) => `${k}: ${v}`),
      `Partida: ${g.partidaDireccion} (${g.partidaUbigeo})`,
      `Llegada: ${g.llegadaDireccion} (${g.llegadaUbigeo})`,
      ...(g.comprobanteNumero ? [`Comprobante: ${g.comprobanteNumero}`] : []),
    ],
    lineas: g.items.map((l, k) => ({ texto: `${l.codigo || String(k + 1).padStart(3, "0")} · ${l.descripcion}`, izquierda: l.unidad, derecha: String(l.cantidad) })),
    totales: [
      { k: "Peso bruto total", v: `${g.pesoKg} kg` },
      { k: "N° de bultos", v: String(g.bultos), fuerte: true },
    ],
    pie: g.observaciones ? [`Obs.: ${g.observaciones}`] : [],
    qr: qrGuia(g),
    leyenda: [...leyendaGuia(g), ...lineaCdr(g.sunat)],
  };
}

export function docGuiaVenta(g: GuiaRemision, tam: TamanoPdf = "A4"): jsPDF {
  return tam === "A4" ? docA4Guia(g) : docTicket(ticketGuia(g), tam === "58" ? 58 : 80);
}

export function pdfGuiaVenta(g: GuiaRemision, tam: TamanoPdf = "A4"): void {
  abrir(docGuiaVenta(g, tam), `${g.numero}${sufijo(tam)}`);
}

export function imprimirGuiaVenta(g: GuiaRemision, tam: TamanoPdf): void {
  imprimirPDF(docGuiaVenta(g, tam), `${g.numero}${sufijo(tam)}`);
}

/** Casilla de verificación (marcada con X) + texto. */
function casilla(doc: jsPDF, x: number, y: number, marcada: boolean, texto: string): number {
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.3);
  doc.rect(x, y - 2.8, 3.2, 3.2, "S");
  if (marcada) {
    doc.setFillColor(...AZUL);
    doc.rect(x + 0.6, y - 2.2, 2, 2, "F");
  }
  doc.setFont("helvetica", marcada ? "bold" : "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...(marcada ? AZUL : NEGRO));
  doc.text(texto, x + 4.6, y);
  return x + 4.6 + doc.getTextWidth(texto) + 7;
}

function tituloSeccion(doc: jsPDF, y: number, t: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...AZUL);
  doc.text(t, M, y);
  doc.setDrawColor(...PLOMO_200);
  doc.setLineWidth(1 * PT);
  doc.line(M, y + 1.2, doc.internal.pageSize.getWidth() - M, y + 1.2);
  return y + 5.5;
}

/** Orden de despacho OD-001-2026: ítems, lugar de entrega, estados de Almacén y firmas. */
export function pdfOrdenDespacho(o: OrdenDespacho): void {
  const codigo = codigoDesdeNumero("OD", o.numero, o.fecha);
  const e = estadoOD(o);
  guardar(
    construir({
      titulo: "ORDEN DE DESPACHO",
      numero: codigo,
      estado: ESTADOS_OD[e],
      datos: [
        ["Cliente", o.cliente],
        ["DNI / RUC", o.clienteDoc || "-"],
        ["Venta origen", origenOD(o)],
        ["Fecha OD", fechaPE(o.fecha)],
        ["Vendedor", o.vendedor || "-"],
        ["N° interno", o.numero],
      ],
      head: ["Código", "Nombre repuesto / equipo", "Cantidad", "Ubicación"],
      body: o.items.map((l) => {
        // Equipo terminado: código EQ, chasis y sede real
        const eq = equipoDeLinea(l);
        return [
        eq?.id || l.codigo || "-",
        l.descripcion + (l.ancho > 0 ? ` (${l.ancho} × ${l.alto} m × ${l.cantidadPiezas})` : "") + (l.productoNombre ? "" : " (servicio)"),
        `${l.solicitado} ${l.unidad}${l.despachado > 0 && l.despachado < l.solicitado ? ` (entregado ${l.despachado})` : ""}`,
        eq ? `${sedeEquipo(eq)}${eq.estado !== "DISPONIBLE" ? ` (${eq.estado})` : ""} · chasis ${eq.codigo_chasis}` : l.ubicacion ?? "-",
      ];
      }),
      alinearDerecha: [2],
      extra: (doc, y0) => {
        let y = y0 + 2;
        if (y > doc.internal.pageSize.getHeight() - ALTO_PIE - 60) {
          doc.addPage();
          y = 20;
        }
        // LUGAR DE ENTREGA
        y = tituloSeccion(doc, y, "LUGAR DE ENTREGA");
        let x = M;
        // Fila 1: Oficina Arequipa / Secocha / Envío por agencia
        (["OFICINA_AREQUIPA", "SECOCHA", "ENVIO_AGENCIA"] as LugarEntrega[]).forEach((k) => (x = casilla(doc, x, y, o.lugar === k, LUGARES_ENTREGA[k])));
        y += 5;
        if (o.lugar === "ENVIO_AGENCIA") {
          y = datosGrid(
            doc,
            y,
            [
              ["Agencia", o.agenciaNombre || "-"],
              ["N° guía", o.guiaNro || "-"],
              ["Costo envío", o.costoEnvio ? soles(o.costoEnvio) : "-"],
              ["Destino", o.direccionDestino || "-"],
            ],
            4
          );
        } else if (o.lugar === "OFICINA_AREQUIPA" || o.lugar === "SECOCHA" || !o.lugar) {
          y = datosGrid(doc, y, [["Dirección", o.lugar === "OFICINA_AREQUIPA" ? EMPRESA.direccion : o.direccionDestino || o.lugarEntrega || "-"]], 1);
        }
        // Filas 2-4: con línea para completar (o el dato si es la opción elegida)
        const linea = (k: LugarEntrega, campos: [string, string | undefined][]) => {
          const marcada = o.lugar === k;
          let xx = casilla(doc, M, y, marcada, `${LUGARES_ENTREGA[k]}:`) - 4;
          campos.forEach(([label, valor]) => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(...AZUL);
            doc.text(`${label}:`, xx, y);
            xx += doc.getTextWidth(`${label}: `) + 0.5;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...NEGRO);
            const v = marcada && valor ? valor : "";
            const ancho = Math.max(doc.getTextWidth(v) + 2, k === "ENTREGA_ENCARGADO" ? 32 : 110);
            if (v) doc.text(v, xx, y);
            doc.setDrawColor(...BORDE);
            doc.setLineWidth(0.2);
            doc.line(xx, y + 0.8, xx + ancho, y + 0.8);
            xx += ancho + 4;
          });
          y += 5.2;
        };
        linea("LOCAL_COMERCIAL_CLIENTE", [["Dirección", o.clienteDireccionEntrega]]);
        linea("OFICINA_CLIENTE", [["Dirección", o.clienteDireccionEntrega]]);
        linea("ENTREGA_ENCARGADO", [
          ["Nombre", o.encargadoNombre],
          ["DNI", o.encargadoDni],
          ["Tel", o.encargadoTelefono],
        ]);
        y += 1;
        // ESTADOS ALMACÉN
        y = tituloSeccion(doc, y + 1, "ESTADOS ALMACÉN");
        x = M;
        const orden: EstadoAlmacen[] = ["PENDIENTE", "PEDIDO_ALISTADO", "PEDIDO_ENTREGADO", "DEJADO_EN_AGENCIA"];
        const alcanzado = (k: EstadoAlmacen) =>
          k === "PENDIENTE" || k === e || (k === "PEDIDO_ALISTADO" && (e === "PEDIDO_ENTREGADO" || e === "DEJADO_EN_AGENCIA"));
        orden.forEach((k) => (x = casilla(doc, x, y, e !== "ANULADO" && alcanzado(k), ESTADOS_OD[k])));
        y += 5;
        y = datosGrid(
          doc,
          y,
          [
            ["Atendido por", o.atendidoPor || "-"],
            ["Recibió", o.recibidoPor || "-"],
            ["Actualizado", o.actualizado ? new Date(o.actualizado).toLocaleString("es-PE") : "-"],
            ["Observación", o.observacion || "-"],
          ],
          2
        );
        return y;
      },
      notas: o.despachos.map(
        (d, i) => `Salida ${i + 1}: ${new Date(d.fecha).toLocaleString("es-PE")} · ${d.responsable} · ${d.sede}${d.guiaRemision ? ` · guía ${d.guiaRemision}` : ""}${d.observacion ? ` · ${d.observacion}` : ""}`
      ),
      firmas: ["Almacén", "Cliente"],
      firmaImagen: o.firmaCliente ? { indice: 1, url: o.firmaCliente.url, nombre: o.recibidoPor } : undefined,
    }),
    codigo
  );
}

// ---------------------------------------------------------------------
// Sucursal Beta
// ---------------------------------------------------------------------

/** Precios de la sucursal incluyen IGV: se desglosa para el comprobante. */
const desgloseIGV = (total: number): [string, string][] => {
  const base = Math.round((total / 1.18) * 100) / 100;
  return totales(base, Math.round((total - base) * 100) / 100, total);
};

export function pdfVentaSucursal(v: VentaSucursal, sucursal: string): void {
  abrir(
    construir({
      titulo: v.tipoDoc === "FA" ? "VENTA SUCURSAL · FACTURA" : "VENTA SUCURSAL · BOLETA",
      numero: v.numero,
      estado: v.estado.toUpperCase(),
      datos: [
        ["Fecha", fechaPE(v.fecha)],
        ["Cliente", v.cliente],
        ["DNI / RUC", v.clienteDoc || "-"],
        ["Sucursal", sucursal],
        ["Forma de pago", v.formaPago === "CONTADO" ? "Contado" : `Crédito${v.pagado ? " (cobrado)" : " (por cobrar)"}`],
        ["Doc. referencia", v.docRef],
      ],
      head: ["#", "Producto", "Cant.", "Und.", "P. Unit.", "Subtotal"],
      body: v.lineas.map((l, k) => [k + 1, l.producto, l.cantidad, l.unidad, soles(l.precio), soles(l.subtotal)]),
      alinearDerecha: [2, 4, 5],
      totales: desgloseIGV(v.total),
      notas: ["Documento interno de la sucursal. El comprobante electrónico (FA / BV) se emite en el módulo de Ventas."],
      firmas: ["Jefe de Sucursal", "Cliente"],
    }),
    v.numero
  );
}

export function pdfGuiaEntrega(v: VentaSucursal, sucursal: string): void {
  const e = v.entrega;
  abrir(
    construir({
      titulo: "GUÍA DE ENTREGA LOCAL",
      numero: e?.guia || v.numero,
      estado: "ENTREGADO",
      datos: [
        ["Fecha entrega", fechaPE(e?.fecha ?? v.fecha)],
        ["Venta", v.docRef],
        ["Cliente", v.cliente],
        ["Recibió", e?.recibidoPor ?? v.cliente],
        ["DNI", e?.dni || "-"],
        ["Sucursal", sucursal],
      ],
      head: ["#", "Producto", "Cantidad", "Und."],
      body: v.lineas.map((l, k) => [k + 1, l.producto, l.cantidad, l.unidad]),
      alinearDerecha: [2],
      firmas: ["Entregado por (Sucursal)", "Recibí conforme (Cliente)"],
      firmaImagen: e?.firma ? { indice: 1, url: e.firma, nombre: e.recibidoPor } : undefined,
    }),
    e?.guia || v.numero
  );
}

/** Orden de Traslado Producción Arequipa -> Secocha (atiende un REQ-SECOCHA): TEMPLATE_UNIFICADO. */
export function pdfOrdenTraslado(t: Traslado): void {
  const doc = generarDocumento("OT", SEDE_PLANTA_PRINCIPAL, {
    numero: t.codigo,
    estado: t.estado === "en-camino" ? "EN CAMINO" : t.estado === "recibido" ? "RECIBIDO" : "OBSERVADO",
    fecha: t.fechaEnvio,
    solicitante: t.emitidoPor,
    motivo: t.motivoTraslado,
    destino: t.destino,
    referencia: t.reqNumero,
    guia: t.guiaRemision,
    items: t.productos.map((p, k) => ({ id: String(k), nombre: p.producto, cantidad: p.cantidad, unidad: p.unidad, marca: p.marca ?? "", caracteristica: p.caracteristica ?? "", sku: p.sku })),
  });
  abrir(doc, t.codigo);
}

/** Guía de remisión remitente (formato tipo 09 SUNAT) de un traslado Taller Principal -> Sucursal. */
export function pdfGuiaRemision(t: Traslado): void {
  abrir(
    construir({
      titulo: "GUÍA DE REMISIÓN REMITENTE",
      numero: t.guiaRemision,
      estado: t.estado === "en-camino" ? "EN CAMINO" : t.estado === "recibido" ? "RECIBIDO" : "OBSERVADO",
      datos: [
        ["Tipo de documento", "09 - Guía de remisión remitente"],
        ["Orden de traslado", t.codigo],
        ["Fecha de traslado", fechaPE(t.fechaEnvio)],
        ["Punto de partida", "Taller Principal Aqp"],
        ["Punto de llegada", t.destino],
        ["Motivo", t.motivoTraslado],
        ["Transportista", t.transportista || "-"],
        ["Placa", t.placa || "-"],
        ["Referencia", [t.reqNumero, t.ventaNumero].filter(Boolean).join(" · ") || "-"],
      ],
      head: ["#", "Descripción", "Cantidad", "Und."],
      body: t.productos.map((p, k) => [k + 1, p.producto, p.cantidad, p.unidad]),
      alinearDerecha: [2],
      notas: [
        ...(t.observacion ? [`Observación de la sucursal (${t.observacion.tipo === "FALTANTE" ? "faltante" : "dañado"}): ${t.observacion.detalle}`] : []),
        ...(t.recibidoPor ? [`Recibido por ${t.recibidoPor} el ${fechaPE(t.fechaRecepcion ?? "")}.`] : []),
        "Representación impresa interna. La emisión electrónica ante SUNAT requiere el OSE / PSE de la empresa.",
      ],
      qr: `${EMPRESA.ruc}|09|${t.guiaRemision}|${t.fechaEnvio}`,
      qrTexto: [`RUC ${EMPRESA.ruc}`, `Guía ${t.guiaRemision}`],
      firmas: ["Almacén Taller Principal", "Transportista", "Recibí conforme (Sucursal)"],
    }),
    t.guiaRemision
  );
}

// =====================================================================
// ACTIVOS DE LA EMPRESA (Finanzas › Contabilidad › Activos)
// =====================================================================

/** Ficha de entrega de un activo a su responsable (firman quien entrega y quien recibe, con huella). */
export function pdfFichaEntregaActivo(a: Activo, e: EntregaActivo): void {
  guardar(
    construir({
      titulo: "FICHA DE ENTREGA DE ACTIVO",
      numero: e.numero,
      estado: e.devuelto ? `DEVUELTO ${fechaPE(e.devuelto)}` : "VIGENTE",
      datos: [
        ["Código del activo", a.codigo],
        ["Activo", a.nombre],
        ["Categoría", nombreCategoria(a.categoria)],
        ["Marca / Modelo", [a.marca, a.modelo].filter(Boolean).join(" ") || "-"],
        ["N° de serie", a.serie || "-"],
        ["Fecha de entrega", fechaPE(e.fecha)],
        ["Responsable", e.responsable],
        ["DNI", e.dni || "-"],
        ["Cargo", e.cargo || "-"],
        ["Ubicación", [e.sede, a.area].filter(Boolean).join(" · ")],
        ["Estado al entregar", e.condicion],
        ["Entregado por", e.entregadoPor],
      ],
      head: ["#", "Bien / accesorio entregado", "Cant.", "Condición"],
      body: [
        [1, `${a.nombre}${a.serie ? ` (S/N ${a.serie})` : ""}`, 1, e.condicion],
        ...e.accesorios
          .split(/[\n,;]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x, i) => [i + 2, x, 1, e.condicion]),
      ],
      notas: [
        ...(e.observaciones ? [`Observaciones: ${e.observaciones}`] : []),
        "COMPROMISO DEL RESPONSABLE: recibo el bien descrito en buen estado y me comprometo a usarlo solo para labores de la empresa, " +
          "cuidarlo, no prestarlo ni trasladarlo sin autorización, avisar de inmediato cualquier falla, pérdida o robo, y devolverlo con sus " +
          "accesorios al término de mi labor o cuando la empresa lo solicite. La pérdida o daño por negligencia podrá ser descontado conforme a ley.",
      ],
      qr: `${EMPRESA.ruc}|ACTIVO|${a.codigo}|${e.numero}|${e.dni || e.responsable}`,
      qrTexto: [`Activo ${a.codigo}`, `Ficha ${e.numero}`, `Responsable: ${e.responsable}`],
      firmas: ["Entregado por (Empresa)", `Recibí conforme: ${e.responsable}`],
      huellaEn: 1,
    }),
    e.numero
  );
}

/** Hoja de vida del activo: datos, compra, depreciación (cuadro anual), entregas y mantenimientos. */
export function pdfHojaVidaActivo(a: Activo): void {
  const d = depreciacion(a);
  const cuadro = cuadroDepreciacion(a);
  construirYMostrarHoja(a, d, cuadro);
}

function construirYMostrarHoja(a: Activo, d: Depreciacion, cuadro: ReturnType<typeof cuadroDepreciacion>): void {
  const doc = construir({
    titulo: "HOJA DE VIDA DEL ACTIVO",
    numero: a.codigo,
    estado: a.estado === "BAJA" ? "DE BAJA" : a.estado.replace("_", " "),
    datos: [
      ["Activo", a.nombre],
      ["Categoría", nombreCategoria(a.categoria)],
      ["Marca / Modelo", [a.marca, a.modelo].filter(Boolean).join(" ") || "-"],
      ["N° de serie", a.serie || "-"],
      ["Ubicación", [a.sede, a.area].filter(Boolean).join(" · ")],
      ["Responsable", a.responsable || "Sin asignar"],
      ["Fecha de compra", fechaPE(a.fechaCompra)],
      ["Proveedor", a.proveedor || "-"],
      ["Comprobante", a.comprobante || "-"],
      ["Costo (sin IGV)", soles(a.costo)],
      ["Tasa anual / vida útil", `${a.tasaAnual}% · ${d.vidaUtilMeses ? `${(d.vidaUtilMeses / 12).toLocaleString("es-PE", { maximumFractionDigits: 1 })} años` : "-"}`],
      ["Valor residual", soles(a.valorResidual)],
      ["Depreciación mensual", soles(d.mensual)],
      ["Depreciación acumulada", soles(d.acumulada)],
      ["Valor en libros", soles(d.valorLibros)],
    ],
    head: ["Año", "Meses", "Depreciación del año", "Acumulada", "Valor en libros"],
    body: cuadro.map((f) => [f.anio, f.meses, soles(f.depreciacion), soles(f.acumulada), soles(f.valorLibros)]),
    alinearDerecha: [1, 2, 3, 4],
    extra: (doc, y) => {
      let yy = y;
      const seccion = (titulo: string, head: string[], body: (string | number)[][]) => {
        if (!body.length) return;
        autoTable(doc, {
          startY: yy + 4,
          head: [[titulo, ...head.slice(1)]],
          body,
          margin: { left: M, right: M, bottom: ALTO_PIE + 6 },
          styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, lineColor: BORDE, lineWidth: 0.1 },
          headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold" },
        });
        yy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      };
      seccion(
        "Entregas (fichas)",
        ["", "Fecha", "Responsable", "Cargo", "Devuelto"],
        a.entregas.map((e) => [e.numero, fechaPE(e.fecha), e.responsable, e.cargo || "-", e.devuelto ? fechaPE(e.devuelto) : "Vigente"])
      );
      seccion(
        "Mantenimientos",
        ["", "Tipo", "Detalle", "Proveedor", "Costo"],
        a.mantenimientos.map((m) => [fechaPE(m.fecha), m.tipo, m.detalle, m.proveedor || "-", soles(m.costo)])
      );
      return yy + 2;
    },
    notas: [
      ...(a.proximoMantenimiento ? [`Próximo mantenimiento: ${fechaPE(a.proximoMantenimiento)}`] : []),
      ...(a.baja ? [`Baja: ${fechaPE(a.baja.fecha)} · ${a.baja.motivo}${a.baja.detalle ? ` · ${a.baja.detalle}` : ""}${a.baja.valorVenta ? ` · Venta ${soles(a.baja.valorVenta)}` : ""}`] : []),
      "Depreciación por el método lineal desde el mes de inicio de uso. Tasas de referencia: art. 22 del Reglamento de la Ley del Impuesto a la Renta; el contador valida la tasa de cada bien.",
    ],
    firmas: ["Contabilidad", "V°B° Gerencia"],
  });
  guardar(doc, `HOJA-VIDA-${a.codigo}`);
}
