"use client";

// =====================================================================
// Generación de PDFs profesionales con jsPDF + jspdf-autotable
// =====================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { EMPRESA } from "./empresa";
import { fechaPE, soles } from "./storage";
import type { HistorialDetalle, HistorialPlanilla } from "./historial";
import type { ConcesionContratista } from "./types";
import type { ComprobanteVenta, Cotizacion, Factura, Guia, LineaVenta, NotaPedido, OrdenCompra, OrdenDespacho, Requerimiento } from "./types";

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

// ------------------------------------------------------------- Logo (public/logo-comboy.png)
let logo: { data: string; w: number; h: number } | null = null;

/** Precarga el logo como dataURL (jsPDF dibuja síncrono; el PDF se abre en el mismo clic). */
export async function cargarLogo(): Promise<void> {
  if (logo || typeof window === "undefined") return;
  try {
    const blob = await (await fetch("/logo-comboy.png")).blob();
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
  doc.setTextColor(...AZUL);
  doc.text("COMBOY", x, y + h / 2 + 3);
  doc.setTextColor(...ROJO);
  doc.text("VID", x + doc.getTextWidth("COMBOY "), y + h / 2 + 3);
}

interface Bloque {
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

  // Derecha 38 %: cuadro del documento
  const bw = ancho * 0.38;
  const bx = W - M - bw;
  const cx = bx + bw / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const lt = doc.splitTextToSize(titulo.toUpperCase(), bw - 8) as string[];
  doc.setFontSize(11);
  const ls = doc.splitTextToSize(subtitulo, bw - 8) as string[];
  const alto = 10 * PT * 2 + lt.length * 3.6 + 1.4 + ls.length * 4.4 + (estado ? 8 : 0);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(2 * PT);
  doc.roundedRect(bx, top, bw, alto, 10 * PT, 10 * PT, "S");
  let yy = top + 10 * PT + 3;
  doc.setFontSize(9);
  doc.setTextColor(...AZUL);
  doc.text(lt, cx, yy, { align: "center" });
  yy += lt.length * 3.6 + 1.4 + 1;
  doc.setFontSize(11);
  doc.setTextColor(...ROJO);
  doc.text(ls, cx, yy, { align: "center" });
  yy += ls.length * 4.4;
  if (estado) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const txt = `ESTADO: ${estado.toUpperCase()}`;
    const pw = doc.getTextWidth(txt) + 6;
    doc.setLineWidth(1 * PT);
    doc.roundedRect(cx - pw / 2, yy - 0.8, pw, 4.4, 2.2, 2.2, "S");
    doc.setTextColor(...AZUL);
    doc.text(txt, cx, yy + 2.2, { align: "center" });
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
      const lw = Math.min(doc.getTextWidth(label), col * 0.45);
      doc.text(label, x, yy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...NEGRO);
      const val = doc.splitTextToSize(par[1] || "-", col - lw - 3) as string[];
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
function tabla(doc: jsPDF, y: number, head: string[], body: (string | number)[][], alinearDerecha: number[] = []): number {
  const columnStyles: Record<number, { halign: "right" }> = {};
  alinearDerecha.forEach((c) => (columnStyles[c] = { halign: "right" }));
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

function firmas(doc: jsPDF, y: number, nombres: string[], huellaEn?: number): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const tope = H - ALTO_PIE - 12;
  let yy = Math.max(y + 22, tope);
  if (yy > tope) {
    doc.addPage();
    yy = tope;
  }
  const ancho = (W - 2 * M) / nombres.length;
  nombres.forEach((n, i) => {
    const cx = M + ancho * i + ancho / 2;
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.3);
    doc.line(cx - 25, yy, cx + 25, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...AZUL);
    doc.text(n, cx, yy + 4, { align: "center" });
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

function construir(b: Bloque): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: b.horizontal ? "landscape" : "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = cabecera(doc, b.titulo, b.numero, b.estado);
  y = datosGrid(doc, y, b.datos, b.columnas ?? 3);
  y = tabla(doc, y, b.head, b.body, b.alinearDerecha);
  if (b.totales?.length) y = bloqueTotales(doc, y, b.totales);

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

  firmas(doc, y, b.firmas, b.huellaEn);
  pie(doc);
  return doc;
}

function abrir(doc: jsPDF, nombre: string): void {
  const url = doc.output("bloburl");
  const w = window.open(String(url), "_blank");
  if (!w) doc.save(`${nombre}.pdf`); // popup bloqueado → descarga
}

const totales = (s: number, igv: number, t: number): [string, string][] => [
  ["Subtotal (valor venta)", soles(s)],
  ["IGV 18%", soles(igv)],
  ["TOTAL", soles(t)],
];

// ---------------------------------------------------------------------

/** Contrato simple de concesión / servicio externo (Planilla › Contratistas). */
export function pdfContratoConcesion(c: ConcesionContratista, tipoServicio: string): void {
  const pagado = (c.adelanto || 0) + (c.pagos ?? []).reduce((s, p) => s + p.monto, 0);
  abrir(
    construir({
      titulo: "CONTRATO DE LOCACIÓN DE SERVICIOS",
      numero: `CS-${c.id.slice(0, 8).toUpperCase()}`,
      estado: c.estado,
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
    `CONTRATO_${c.razonSocial.replace(/\s+/g, "_")}`
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
  totalPagar: number;
}

/** Boleta individual de pago (Planilla del periodo): se descarga como PDF. */
export function pdfBoletaPago(d: DatosBoleta): void {
  const doc = construir({
    titulo: "BOLETA DE PAGO",
    numero: `${d.nombre.toUpperCase()} - ${d.periodo}`,
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
      ["Liquidación", d.modo],
      ["Pensión", `${d.pension} (${d.afpPorcentaje}%)`],
    ],
    head: ["Tipo", "Concepto", "Detalle", "Importe"],
    body: [
      ["INGRESO", "Remuneración básica", d.basicoDetalle, soles(d.basico)],
      ["INGRESO", "Horas extra", d.horasExtra, soles(d.montoExtra)],
      ["", "Remuneración bruta", "", soles(d.bruto)],
      ["DESCUENTO", `Aporte ${d.pension}`, `${d.afpPorcentaje}% de la remuneración bruta`, `- ${soles(d.descuentoAfp)}`],
      ["DESCUENTO", "Adelantos de sueldo", "Descontados en este periodo", `- ${soles(d.adelantos)}`],
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
  doc.save(`BOLETA_${d.id}_${d.nombre.replace(/\s+/g, "_")}.pdf`);
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
      head: ["N°", "Trabajador", "Sueldo / Tipo", "Pensión", "Días", "Horas", "Tard.", "Bruto", "Dscto", "Neto", "Adelantos", "A pagar"],
      body: detalle.map((d) => [
        d.trabajador_id,
        d.nombre,
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
      alinearDerecha: [4, 5, 6, 7, 8, 9, 10, 11],
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

export function pdfRequerimiento(r: Requerimiento): void {
  abrir(
    construir({
      titulo: "REQUERIMIENTO DE ALMACÉN",
      numero: r.numero,
      estado: r.estado,
      datos: [
        ["Fecha", fechaPE(r.fecha)],
        ["Sede", r.sede],
        ["Solicitante", r.solicitante],
        ["Items", String(r.items.length)],
        ["Motivo", r.motivo],
      ],
      head: ["#", "Producto", "Cant.", "Und.", "Marca", "Característica"],
      body: r.items.map((i, k) => [k + 1, i.nombre, i.cantidad, i.unidad, i.marca || "-", i.caracteristica || "-"]),
      alinearDerecha: [2],
      notas: r.observacion ? [`Observación de Tesorería: ${r.observacion}`] : undefined,
      firmas: ["Solicitante", "Jefe de Almacén", "Tesorería"],
    }),
    r.numero
  );
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
      head: ["#", "Producto", "Marca", "Cant.", "Und.", "P. Unit.", "Subtotal"],
      body: c.items.map((i, k) => [k + 1, i.nombre, i.marca || "-", i.cantidad, i.unidad, soles(i.precioUnit), soles(i.subtotal)]),
      alinearDerecha: [3, 5, 6],
      totales: totales(c.subtotal, c.igv, c.total),
      firmas: ["Tesorería / Compras", "V°B° Gerencia"],
    }),
    `COT-${c.numero}`
  );
}

export function pdfOrdenCompra(o: OrdenCompra): void {
  abrir(
    construir({
      titulo: "ORDEN DE COMPRA",
      numero: o.numero,
      estado: o.estado,
      datos: [
        ["Proveedor", o.proveedor],
        ["RUC", o.ruc],
        ["Fecha", fechaPE(o.fecha)],
        ["Forma de pago", o.formaPago],
        ["Tiempo entrega", o.tiempoEntrega],
        ["Lugar entrega", o.lugarEntrega],
        ["Cotización", o.cotizacionNumero],
        ["Requerimiento", o.reqNumero],
      ],
      head: ["#", "Descripción", "Marca", "Cant.", "Und.", "P. Unit.", "Importe"],
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
    o.numero
  );
}

/** Gasto / servicio de Tesorería (sin OC ni stock). */
function pdfGasto(f: Factura): void {
  const comp = { FACTURA: "Factura", BOLETA: "Boleta", DJ: "Declaración Jurada de Gasto", RECIBO: "Recibo" }[f.comprobanteGasto ?? "FACTURA"];
  abrir(
    construir({
      titulo: "GASTO / SERVICIO - TESORERÍA",
      numero: f.numero,
      estado: f.estadoPago === "PAGADA" ? "PAGADA" : "POR PAGAR",
      datos: [
        ["Proveedor / agencia", f.proveedor],
        ["RUC / DNI", f.ruc || "-"],
        ["Fecha", fechaPE(f.fecha)],
        ["Comprobante", `${comp} ${f.numero}`],
        ["Adjuntos", f.archivos?.length ? f.archivos.map((a) => a.nombre).join(", ") : "-"],
      ],
      head: ["#", "Descripción", "Importe"],
      body: [[1, f.descripcion ?? "-", soles(f.total)]],
      alinearDerecha: [2],
      totales: [
        ...(f.igv ? ([["Subtotal", soles(f.subtotal)], ["IGV 18%", soles(f.igv)]] as [string, string][]) : []),
        ["Total", soles(f.total)],
        ...(f.detraccionMonto ? ([[`Detracción ${f.detraccionPorc}%`, `- ${soles(f.detraccionMonto)}`]] as [string, string][]) : []),
        ["NETO A PAGAR", soles(f.netoPagar ?? f.total)],
      ],
      firmas: ["Solicitante", "Tesorería", "Gerencia"],
    }),
    f.numero
  );
}

export function pdfFactura(f: Factura, oc?: OrdenCompra): void {
  if (f.esGastoTesoreria) return pdfGasto(f);
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
      head: ["#", "Descripción", "Cant.", "Und.", "P. Unit.", "Importe"],
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
  const vence = new Date(`${n.fecha}T12:00:00`);
  vence.setDate(vence.getDate() + n.validezDias);
  abrir(
    construir({
      titulo: "NOTA DE PEDIDO / COTIZACIÓN",
      numero: n.numero,
      estado: n.estado,
      datos: [
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
      head: ["#", "Descripción", "Medidas", "Cant.", "m²", "Precio", "Total"],
      body: cuerpoVenta(n.items),
      alinearDerecha: [3, 4, 5, 6],
      totales: [
        ...(n.descuento > 0 ? ([["Descuento", `- ${soles(n.descuento)}`]] as [string, string][]) : []),
        [n.conIgv ? "Subtotal" : "Subtotal (sin IGV)", soles(n.subtotal)],
        ...(n.conIgv ? ([["IGV 18%", soles(n.igv)]] as [string, string][]) : []),
        ["TOTAL", soles(n.total)],
      ],
      notas: [
        ...(n.observaciones ? [`Observaciones: ${n.observaciones}`] : []),
        `Condiciones: precios en soles${n.conIgv ? " incluyen IGV" : " no incluyen IGV"}. Oferta válida ${n.validezDias} días. Medidas en metros; el m² se calcula ancho × alto × cantidad. Plazo de entrega sujeto a confirmación del pedido.`,
      ],
      qr: `${EMPRESA.ruc}|NP|${n.numero}|${n.total.toFixed(2)}|${n.fecha}|${n.clienteDoc}`,
      qrTexto: ["Pagos a nombre de " + EMPRESA.razonSocial + ":", ...lineasCuentas(), `Enviar constancia indicando la ${n.numero}.`],
      firmas: [`Vendedor: ${n.vendedor}`, "Aceptado: Cliente"],
    }),
    n.numero
  );
}

function qrSunat(c: ComprobanteVenta): string {
  const [doc, num] = c.clienteDoc.split(" ");
  return [EMPRESA.ruc, c.tipo === "FACTURA" ? "01" : "03", c.serie, c.numero.split("-")[1] ?? "", c.igv.toFixed(2), c.total.toFixed(2), c.fecha, tipoDocSunat(doc), num, ""].join("|");
}

export function pdfComprobanteVenta(c: ComprobanteVenta): void {
  const titulo = c.tipo === "FACTURA" ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA";
  abrir(
    construir({
      titulo,
      numero: c.numero || "BORRADOR",
      estado: c.estado === "EMITIDO" ? (c.saldo > 0 ? "EMITIDO · POR COBRAR" : "EMITIDO · COBRADO") : c.estado,
      datos: [
        ["Cliente", c.cliente],
        ["Documento", c.clienteDoc],
        ["Dirección", c.clienteDireccion || "-"],
        ["Fecha emisión", fechaPE(c.fecha)],
        ["Forma de pago", c.formaPago === "CONTADO" ? "Contado" : `${c.condPagoNombre} · vence ${fechaPE(c.fechaVenc)}`],
        ["Nota de pedido", c.npNumero ?? "-"],
        ["Orden despacho", c.odNumero ?? "-"],
        ["Moneda", "Soles (PEN)"],
      ],
      head: ["#", "Descripción", "Medidas", "Cant.", "m²", "V. unit.", "Valor venta"],
      body: cuerpoVenta(c.items),
      alinearDerecha: [3, 4, 5, 6],
      totales: [
        ...(c.descuento > 0 ? ([["Descuento", `- ${soles(c.descuento)}`]] as [string, string][]) : []),
        [c.conIgv ? "Op. gravada" : "Op. inafecta", soles(c.base)],
        ["IGV 18%", soles(c.igv)],
        ["IMPORTE TOTAL", soles(c.total)],
      ],
      notas: [
        ...(c.cuotas.length
          ? [`Cuotas: ${c.cuotas.map((q) => `N°${q.n} ${fechaPE(q.fecha)} ${soles(q.monto)}`).join(" · ")}${c.inicial > 0 ? ` · Inicial ${soles(c.inicial)}` : ""}`]
          : []),
        "Representación impresa del comprobante. Estado SUNAT: NO ENVIADO (el ERP aún no está conectado a un OSE/PSE de facturación electrónica).",
      ],
      qr: qrSunat(c),
      qrTexto: [`${titulo} ${c.numero}`, `Total ${soles(c.total)} · IGV ${soles(c.igv)}`, ...lineasCuentas()],
      firmas: ["Emisor", "Recibí conforme: Cliente"],
    }),
    c.numero || "borrador"
  );
}

/** Ticket 80 mm con IGV discriminado. */
export function pdfTicketVenta(c: ComprobanteVenta): void {
  const alto = 178 + c.items.length * 10;
  const doc = new jsPDF({ unit: "mm", format: [80, alto] });
  const cx = 40;
  let y = 8;
  const linea = (t: string, size = 7.5, bold = false, align: "center" | "left" = "center") => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const l = doc.splitTextToSize(t, 72) as string[];
    doc.text(l, align === "center" ? cx : 4, y, { align });
    y += l.length * (size * 0.45);
  };
  const sep = () => {
    doc.setDrawColor(150);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, 76, y);
    doc.setLineDashPattern([], 0);
    y += 3.5;
  };
  const fila = (k: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 9 : 7.5);
    doc.text(k, 4, y);
    doc.text(v, 76, y, { align: "right" });
    y += bold ? 5 : 4;
  };
  dibujarLogo(doc, 8, 4, 64, 16);
  y = 24;
  linea(EMPRESA.nombreComercial, 8, true);
  linea(`RUC ${EMPRESA.ruc}`, 7.5, true);
  linea(EMPRESA.direccion);
  linea(EMPRESA.telefono);
  y += 1;
  sep();
  linea(c.tipo === "FACTURA" ? "FACTURA ELECTRÓNICA" : "BOLETA DE VENTA ELECTRÓNICA", 8.5, true);
  linea(c.numero || "BORRADOR", 10, true);
  sep();
  linea(`Fecha: ${fechaPE(c.fecha)}`, 7.5, false, "left");
  linea(`Cliente: ${c.cliente}`, 7.5, false, "left");
  linea(c.clienteDoc, 7.5, false, "left");
  linea(`Pago: ${c.formaPago === "CONTADO" ? "Contado" : `${c.condPagoNombre} (vence ${fechaPE(c.fechaVenc)})`}`, 7.5, false, "left");
  sep();
  c.items.forEach((l) => {
    linea(`${l.cantidad} x ${l.descripcion}${l.m2 > 0 ? ` (${l.ancho}x${l.alto} m = ${l.m2.toFixed(2)} m²)` : ""}`, 7.5, false, "left");
    fila(`   ${soles(l.precio)}${l.m2 > 0 ? "/m²" : ""}`, soles(l.total));
  });
  sep();
  if (c.descuento > 0) fila("Descuento", `- ${soles(c.descuento)}`);
  fila(c.conIgv ? "Op. gravada" : "Op. inafecta", soles(c.base));
  fila("IGV 18%", soles(c.igv));
  fila("TOTAL", soles(c.total), true);
  sep();
  dibujarQR(doc, qrSunat(c), cx - 14, y, 28);
  y += 31;
  linea("Representación impresa. Estado SUNAT: NO ENVIADO.", 6.5);
  linea("¡Gracias por su compra!", 8, true);
  // Footer negro ÁREA INFORMÁTICA (al pie del ticket)
  y = Math.max(y + 2, alto - 22);
  doc.setFillColor(...ROJO);
  doc.rect(0, y, 80, 3 * PT, "F");
  doc.setFillColor(...NEGRO);
  doc.rect(0, y + 3 * PT, 80, alto - y, "F");
  doc.setTextColor(255, 255, 255);
  y += 5;
  linea("ÁREA INFORMÁTICA - COMBOY VID", 8, true);
  linea(`${EMPRESA.nombreComercial} • RUC ${EMPRESA.ruc}`, 5.5);
  linea(`${EMPRESA.email} • Tel: ${EMPRESA.telefono}`, 5.5);
  doc.setTextColor(226, 232, 240);
  linea(`Documento generado: ${new Date().toLocaleString("es-PE")}`, 5);
  doc.setTextColor(160, 160, 160);
  linea("DOCUMENTO OFICIAL • NO MODIFICABLE • REGISTRO HISTORIAL", 5);
  abrir(doc, `${c.numero || "borrador"}-ticket`);
}

export function pdfOrdenDespacho(o: OrdenDespacho): void {
  const ultimo = o.despachos[o.despachos.length - 1];
  abrir(
    construir({
      titulo: "ORDEN DE DESPACHO",
      numero: o.numero,
      estado: o.estado.replace("_", " "),
      datos: [
        ["Cliente", o.cliente],
        ["Comprobante", o.comprobanteNumero],
        ["Fecha OD", fechaPE(o.fecha)],
        ["Lugar entrega", o.lugarEntrega || "-"],
        ["Último despacho", ultimo ? `${new Date(ultimo.fecha).toLocaleString("es-PE")} · ${ultimo.responsable}` : "-"],
        ["Guía remisión", ultimo?.guiaRemision || "-"],
      ],
      head: ["#", "Descripción", "Medidas (m)", "Piezas", "Und.", "Solicitado", "Despachado", "Pendiente"],
      body: o.items.map((l, k) => [
        k + 1,
        l.descripcion + (l.productoNombre ? "" : " (servicio)"),
        l.ancho > 0 ? `${l.ancho} × ${l.alto}` : "-",
        l.cantidadPiezas,
        l.unidad,
        l.solicitado,
        l.despachado,
        Math.round((l.solicitado - l.despachado) * 100) / 100,
      ]),
      alinearDerecha: [3, 5, 6, 7],
      notas: o.despachos.map(
        (d, i) => `Despacho ${i + 1}: ${new Date(d.fecha).toLocaleString("es-PE")} · ${d.responsable} · ${d.sede}${d.guiaRemision ? ` · GR ${d.guiaRemision}` : ""}${d.observacion ? ` · ${d.observacion}` : ""}`
      ),
      firmas: ["Despachado por: Almacén", "Transportista", "Recibí conforme: Cliente"],
    }),
    o.numero
  );
}
