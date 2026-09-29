"use client";

// =====================================================================
// Generación de PDFs profesionales con jsPDF + jspdf-autotable
// =====================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { EMPRESA } from "./empresa";
import { fechaPE, soles } from "./storage";
import type { Cotizacion, Factura, Guia, OrdenCompra, Requerimiento } from "./types";

type RGB = [number, number, number];
const AZUL: RGB = [15, 42, 82];
const AMBAR: RGB = [217, 119, 6];
const GRIS: RGB = [100, 116, 139];

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
  firmas: string[];
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function cabecera(doc: jsPDF, titulo: string, numero: string, estado?: string): number {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 4, "F");

  if (EMPRESA.logoDataUrl) {
    doc.addImage(EMPRESA.logoDataUrl, "PNG", 14, 10, 24, 24);
  } else {
    doc.setFillColor(...AZUL);
    doc.roundedRect(14, 10, 24, 24, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("CV", 26, 25, { align: "center" });
    doc.setFillColor(...AMBAR);
    doc.rect(14, 31, 24, 3, "F");
  }

  doc.setTextColor(...AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(EMPRESA.razonSocial, 42, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(EMPRESA.nombreComercial, 42, 21);
  doc.text(`RUC ${EMPRESA.ruc} · ${EMPRESA.direccion}`, 42, 25.5);
  doc.text(`${EMPRESA.telefono} · ${EMPRESA.email}`, 42, 30);

  // Recuadro tipo comprobante
  const bx = W - 72;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.roundedRect(bx, 9, 58, 26, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...AZUL);
  const lineas = doc.splitTextToSize(titulo, 54) as string[];
  doc.text(lineas, bx + 29, 15, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(...AMBAR);
  doc.text(numero, bx + 29, 15 + lineas.length * 4.5 + 2, { align: "center" });
  if (estado) {
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(`Estado: ${estado}`, bx + 29, 33, { align: "center" });
  }
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(14, 40, W - 14, 40);
  return 45;
}

function datosGrid(doc: jsPDF, y: number, datos: [string, string][]): number {
  const W = doc.internal.pageSize.getWidth();
  const col = (W - 28) / 2;
  doc.setFontSize(8.5);
  let yy = y;
  for (let i = 0; i < datos.length; i += 2) {
    let alto = 5;
    for (let j = 0; j < 2; j++) {
      const par = datos[i + j];
      if (!par) continue;
      const x = 14 + j * col;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...AZUL);
      doc.text(`${par[0]}:`, x, yy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      const val = doc.splitTextToSize(par[1] || "-", col - 34) as string[];
      doc.text(val, x + 32, yy);
      alto = Math.max(alto, val.length * 4 + 1.5);
    }
    yy += alto;
  }
  return yy + 2;
}

function firmas(doc: jsPDF, y: number, nombres: string[]): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let yy = Math.max(y + 22, H - 40);
  if (yy > H - 20) {
    doc.addPage();
    yy = 60;
  }
  const ancho = (W - 28) / nombres.length;
  nombres.forEach((n, i) => {
    const cx = 14 + ancho * i + ancho / 2;
    doc.setDrawColor(...GRIS);
    doc.line(cx - 25, yy, cx + 25, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(n, cx, yy + 4.5, { align: "center" });
  });
}

function pie(doc: jsPDF): void {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(`Generado por ERP ${EMPRESA.razonSocial} · ${new Date().toLocaleString("es-PE")}`, 14, H - 8);
    doc.text(`Página ${i} de ${n}`, W - 14, H - 8, { align: "right" });
  }
}

function construir(b: Bloque): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = cabecera(doc, b.titulo, b.numero, b.estado);
  y = datosGrid(doc, y, b.datos);

  const columnStyles: Record<number, { halign: "right" }> = {};
  (b.alinearDerecha ?? []).forEach((c) => (columnStyles[c] = { halign: "right" }));
  autoTable(doc, {
    startY: y,
    head: [b.head],
    body: b.body,
    theme: "grid",
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: 14, right: 14 },
  });
  y = finalY(doc) + 4;

  if (b.totales?.length) {
    const W = doc.internal.pageSize.getWidth();
    b.totales.forEach(([k, v], i) => {
      const ultimo = i === b.totales!.length - 1;
      if (ultimo) {
        doc.setFillColor(...AZUL);
        doc.rect(W - 84, y - 4, 70, 6.5, "F");
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setTextColor(30, 41, 59);
      }
      doc.setFont("helvetica", ultimo ? "bold" : "normal");
      doc.setFontSize(9);
      doc.text(k, W - 82, y);
      doc.text(v, W - 16, y, { align: "right" });
      y += 6.5;
    });
  }

  if (b.notas?.length) {
    y += 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    b.notas.forEach((n) => {
      const l = doc.splitTextToSize(n, doc.internal.pageSize.getWidth() - 28) as string[];
      doc.text(l, 14, y);
      y += l.length * 4;
    });
  }

  firmas(doc, y, b.firmas);
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

export function pdfFactura(f: Factura, oc?: OrdenCompra): void {
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
