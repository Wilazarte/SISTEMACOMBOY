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
import type { ComprobanteVenta, Cotizacion, Factura, Guia, LineaVenta, NotaPedido, OrdenCompra, OrdenDespacho, Requerimiento } from "./types";

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
  /** Texto del código QR (se dibuja abajo a la izquierda) y líneas que van a su lado. */
  qr?: string;
  qrTexto?: string[];
  firmas: string[];
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

  if (b.qr) {
    const H = doc.internal.pageSize.getHeight();
    if (y + 34 > H - 45) {
      doc.addPage();
      y = 20;
    }
    y += 3;
    dibujarQR(doc, b.qr, 14, y, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    (b.qrTexto ?? []).forEach((t, i) => doc.text(t, 46, y + 4 + i * 4.2));
    y += 31;
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
      head: ["N°", "Trabajador", "Sueldo / Tipo", "Pensión", "Días", "Horas", "Tard.", "Bruto", "Dscto", "Neto"],
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
      ]),
      alinearDerecha: [4, 5, 6, 7, 8, 9],
      totales: [
        ["Total horas", horas(h.total_horas)],
        ["Total bruto", soles(h.total_bruto)],
        ["Total descuentos", soles(h.total_descuento)],
        ["TOTAL NETO", soles(h.total_neto)],
      ],
      firmas: ["Elaborado por", "Gerencia"],
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
  const alto = 150 + c.items.length * 10;
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
  linea(EMPRESA.razonSocial, 10, true);
  linea(`RUC ${EMPRESA.ruc}`, 8, true);
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
