"use client";

// =====================================================================
// FICHA DE COSTO HOMOLOGADA (PDF) · Producción › Costo de Producción
// Documento para auditoría externa / SUNAT / cliente: código de OP, detalle de costos por sección, versión,
// firmas de quienes aprobaron (firma dibujada + sello SHA-256), hash de validación de la versión, verificación
// de integridad de la base y QR. Cada exportación queda en la bitácora (pc_registrar_pdf).
// Paleta COMBOY VID: #11212D cabecera, #294D61 aprobado, #800021 pendiente / alerta, #CCD0CF fondo.
// =====================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { EMPRESA } from "./empresa";
import { mostrarPDF } from "./visorPdf";
import { NOMBRE_ETAPA, NOMBRE_SECCION, NOMBRE_SUBTIPO, NOMBRE_TIPO_VERSION, S, datosPDF, nombreEstado, pct, referenciaHoja, type CostosHoja, type HojaCosto, type LineaCosto, type Seccion } from "./costoProduccion";

type RGB = [number, number, number];
const NOCHE: RGB = [17, 33, 45]; // #11212D
const VINO: RGB = [128, 0, 33]; // #800021
const ACERO: RGB = [41, 77, 97]; // #294D61
const GRIS: RGB = [204, 208, 207]; // #CCD0CF
const M = 12;

async function imagen(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
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
    return { data, w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }) : "—");
const dia = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export async function fichaCostoPDF(hoja: HojaCosto, costos: CostosHoja, items: LineaCosto[]): Promise<void> {
  const d = await datosPDF(hoja.id); // registra EXPORTAR_PDF y trae versión, hash, firmas e integridad
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await imagen("/comboy-logo.png");
  const qr = await QRCode.toDataURL(`COMBOY VID|${hoja.codigo}|${hoja.orden_produccion_id}|v${d.version}|${d.hash}`, { margin: 0, width: 220, color: { dark: "#11212D", light: "#FFFFFF" } });

  const marcaAgua = () => {
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.08 }) as never);
    doc.setTextColor(...ACERO);
    doc.setFont("times", "bold");
    doc.setFontSize(64);
    doc.text("COMBOY VID", W / 2, H / 2, { align: "center", angle: 35 });
    doc.restoreGraphicsState();
  };

  const cabecera = () => {
    doc.setFillColor(...NOCHE);
    doc.rect(0, 0, W, 26, "F");
    doc.setFillColor(...VINO);
    doc.rect(0, 26, W, 1.2, "F");
    if (logo) {
      const h = 16;
      doc.addImage(logo.data, "PNG", M, 5, (logo.w / logo.h) * h, h);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("FICHA DE COSTO DE PRODUCCIÓN · HOMOLOGADA", W - M, 11, { align: "right" });
    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.text(`${EMPRESA.razonSocial} · RUC ${EMPRESA.ruc}`, W - M, 16.5, { align: "right" });
    doc.text(`${hoja.codigo} · ${hoja.origen === "MODELO" ? referenciaHoja(hoja) : `OP ${hoja.orden_produccion_id}`} · Versión v${d.version} (${NOMBRE_TIPO_VERSION[d.tipo]})`, W - M, 21.5, { align: "right" });
  };

  const pie = (n: number, total: number) => {
    doc.setDrawColor(...GRIS);
    doc.line(M, H - 13, W - M, H - 13);
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...ACERO);
    doc.text(`Hash de validación SHA-256 (v${d.version}): ${d.hash}`, M, H - 9);
    doc.setFont("times", "normal");
    doc.setFontSize(7.5);
    doc.text(`Emitido ${fecha(new Date().toISOString())} · Documento generado por el ERP COMBOY VID; cualquier alteración invalida el hash.`, M, H - 5);
    doc.text(`Página ${n} de ${total}`, W - M, H - 5, { align: "right" });
  };

  marcaAgua();
  cabecera();
  let y = 33;

  // Datos generales
  doc.setTextColor(...NOCHE);
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text("DATOS GENERALES", M, y);
  const estadoColor = ["APROBADO", "CERRADO"].includes(hoja.estado) ? ACERO : VINO;
  doc.setFillColor(...estadoColor);
  doc.roundedRect(W - M - 42, y - 4, 42, 6, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(nombreEstado(hoja.estado).toUpperCase(), W - M - 21, y, { align: "center" });
  y += 2;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M + 36 },
    theme: "plain",
    styles: { font: "times", fontSize: 8.5, cellPadding: 1.1, textColor: NOCHE },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 }, 2: { fontStyle: "bold", cellWidth: 30 } },
    body: [
      [hoja.origen === "MODELO" ? "Modelo de equipo" : "Código de orden", hoja.origen === "MODELO" ? referenciaHoja(hoja).replace(/^Modelo /, "") : hoja.orden_produccion_id, "Hoja de costo", hoja.codigo],
      ["Equipo a fabricar", `${hoja.tipo_equipo}${hoja.modelo ? ` · ${hoja.modelo}` : ""}`, "Cantidad", String(hoja.cantidad)],
      ["Cliente / Proyecto", hoja.cliente_proyecto ?? "—", "Responsable", hoja.responsable ?? "—"],
      ["Fecha inicio", dia(hoja.fecha_inicio), "Fin estimada", dia(hoja.fecha_fin_estimada)],
    ],
  });
  doc.addImage(qr, "PNG", W - M - 30, y + 1, 30, 30);
  y = Math.max((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY, y + 32) + 4;

  // Detalle por sección
  const activas = items.filter((i) => i.estado === "ACTIVO");
  const secciones: Seccion[] = ["MATERIAL", "MANO_OBRA", "CIF", "ADICIONAL"];
  const totalSec: Record<Seccion, number> = { MATERIAL: costos.materiales, MANO_OBRA: costos.mano_obra, CIF: costos.cif, ADICIONAL: costos.adicionales };
  for (const s of secciones) {
    const filas = activas.filter((i) => i.seccion === s);
    const cuerpo: string[][] = filas.map((i) => {
      const cant = s === "MANO_OBRA" ? `${i.cantidad} h` : i.subtipo === "ENERGIA" ? `${i.cantidad} h × ${i.potencia_kw} kW` : s === "CIF" && i.subtipo === "DEPRECIACION" ? `${i.cantidad} h-máq` : String(i.cantidad);
      const origen = i.manual ? `MANUAL: ${i.motivo_manual ?? ""}` : i.origen_costo === "ALMACEN" ? `Almacén${i.requerimiento_id ? ` · ${i.requerimiento_id}` : ""}` : i.origen_costo === "PLANILLA" ? "Planilla" : i.origen_costo === "ACTIVO" ? "Activos (depreciación)" : i.origen_costo === "CONFIG" ? "Tarifa kWh" : "";
      return [i.codigo ?? (i.subtipo ? NOMBRE_SUBTIPO[i.subtipo] : ""), i.descripcion + (i.proveedor ? `\n${i.proveedor}` : ""), cant, S(i.costo_unitario).replace("S/ ", ""), S(i.subtotal).replace("S/ ", ""), origen];
    });
    if (s === "ADICIONAL" && costos.merma_monto > 0) cuerpo.push(["MERMA", `Merma / desperdicio ${pct(costos.merma_pct)} de materiales`, pct(costos.merma_pct), "", S(costos.merma_monto).replace("S/ ", ""), costos.justificacion_merma ?? ""]);
    if (!cuerpo.length) cuerpo.push(["", "Sin registros", "", "", "0.00", ""]);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 32, bottom: 18 },
      head: [[{ content: NOMBRE_SECCION[s].toUpperCase(), colSpan: 6, styles: { fillColor: NOCHE, textColor: [255, 255, 255], halign: "left" } }], ["Código", "Descripción", s === "MANO_OBRA" ? "Horas" : "Cantidad", s === "MANO_OBRA" ? "Costo/hora" : "Costo unit.", "Subtotal", "Origen del costo"]],
      body: cuerpo,
      foot: [[{ content: `Subtotal ${NOMBRE_SECCION[s].slice(3)}`, colSpan: 4, styles: { halign: "right" } }, { content: S(totalSec[s]), colSpan: 2 }]],
      theme: "grid",
      styles: { font: "times", fontSize: 7.8, cellPadding: 1.3, lineColor: GRIS, lineWidth: 0.15, textColor: NOCHE },
      headStyles: { fillColor: ACERO, textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: GRIS, textColor: NOCHE, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 22, halign: "right" }, 3: { cellWidth: 20, halign: "right" }, 4: { cellWidth: 22, halign: "right" }, 5: { cellWidth: 40, fontSize: 6.8 } },
      didDrawPage: () => {
        marcaAgua();
        cabecera();
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  // Cálculo final
  if (y > H - 95) {
    doc.addPage();
    marcaAgua();
    cabecera();
    y = 33;
  }
  const alerta = costos.alerta_margen;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: W / 2 + 2 },
    head: [[{ content: "CÁLCULO FINAL (automático)", colSpan: 2 }]],
    body: [
      ["Materiales", S(costos.materiales)],
      ["Mano de obra", S(costos.mano_obra)],
      ["CIF", S(costos.cif)],
      ["Adicionales (incl. merma)", S(costos.adicionales)],
      ["COSTO TOTAL DE PRODUCCIÓN", S(costos.costo_total)],
      [`Costo unitario (÷ ${hoja.cantidad})`, S(costos.costo_unitario)],
      [`Precio sugerido (margen ${pct(costos.margen_deseado, 0)})`, S(costos.precio_sugerido)],
      ["Precio de venta unitario", S(costos.precio_venta)],
      ["Margen real", `${pct(costos.margen_real)} (mín. ${pct(costos.margen_minimo, 0)})`],
    ],
    theme: "grid",
    styles: { font: "times", fontSize: 8.3, cellPadding: 1.4, lineColor: GRIS, lineWidth: 0.15, textColor: NOCHE },
    headStyles: { fillColor: NOCHE, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === 4) Object.assign(c.cell.styles, { fillColor: GRIS, fontStyle: "bold" });
      if (c.section === "body" && c.row.index === 8) Object.assign(c.cell.styles, { textColor: alerta ? VINO : ACERO, fontStyle: "bold" });
    },
  });
  const yCalc = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  // Comparador
  const est = d.estimado;
  autoTable(doc, {
    startY: y,
    margin: { left: W / 2 + 2, right: M },
    head: [[{ content: "ESTIMADO vs REAL", colSpan: 2 }]],
    body: [
      [`Estimado ${est ? `v${est.version}` : "(sin fijar)"}`, est ? S(est.costo_total) : "—"],
      [`Real v${d.version}`, S(costos.costo_total)],
      ["Desviación S/", est ? S(costos.costo_total - est.costo_total) : "—"],
      ["Desviación %", est && est.costo_total > 0 ? pct((costos.costo_total - est.costo_total) / est.costo_total) : "—"],
      ["Integridad de la base", d.integridad.ok ? `VERIFICADA (${d.integridad.registros} registros, ${d.integridad.versiones} versiones)` : `CON ALERTAS (${d.integridad.errores.length})`],
    ],
    theme: "grid",
    styles: { font: "times", fontSize: 8.3, cellPadding: 1.4, lineColor: GRIS, lineWidth: 0.15, textColor: NOCHE },
    headStyles: { fillColor: ACERO, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === 4) Object.assign(c.cell.styles, { textColor: d.integridad.ok ? ACERO : VINO });
    },
  });
  y = Math.max(yCalc, (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 4;
  if (alerta) {
    doc.setFillColor(...VINO);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.text("COSTO ELEVADO - REQUIERE APROBACIÓN DE GERENCIA", W / 2, y + 4.8, { align: "center" });
    y += 10;
  }

  // Firmas digitales
  if (y > H - 70) {
    doc.addPage();
    marcaAgua();
    cabecera();
    y = 33;
  }
  doc.setTextColor(...NOCHE);
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text("FIRMAS DIGITALES DEL FLUJO DE APROBACIÓN", M, y);
  y += 3;
  const etapas: ("JEFE_PRODUCCION" | "TESORERIA" | "GERENCIA")[] = ["JEFE_PRODUCCION", "TESORERIA", "GERENCIA"];
  const ancho = (W - 2 * M - 8) / 3;
  etapas.forEach((e, k) => {
    const f = [...d.firmas].reverse().find((x) => x.etapa === e);
    const x = M + k * (ancho + 4);
    const ok = f?.decision === "APROBADO";
    doc.setDrawColor(...(ok ? ACERO : VINO));
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, ancho, 40, 2, 2, "S");
    doc.setFillColor(...(ok ? ACERO : VINO));
    doc.rect(x, y, ancho, 5.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text(`${NOMBRE_ETAPA[e]} · ${f ? f.decision : "PENDIENTE"}`, x + ancho / 2, y + 3.9, { align: "center" });
    doc.setTextColor(...NOCHE);
    if (f?.firma?.startsWith("data:image")) {
      try {
        doc.addImage(f.firma, "PNG", x + 6, y + 7, ancho - 12, 13);
      } catch {
        /* firma ilegible: queda el sello */
      }
    }
    doc.setFont("times", "normal");
    doc.setFontSize(7.5);
    doc.line(x + 5, y + 21.5, x + ancho - 5, y + 21.5);
    doc.text(f ? `${f.nombre ?? f.usuario}${f.cargo ? ` · ${f.cargo}` : ""}` : "—", x + ancho / 2, y + 25, { align: "center", maxWidth: ancho - 4 });
    doc.text(f ? `${fecha(f.created_at)} · v${f.version}` : "", x + ancho / 2, y + 28.5, { align: "center" });
    if (f) {
      doc.setFont("courier", "normal");
      doc.setFontSize(5.6);
      doc.text(doc.splitTextToSize(`Sello SHA-256: ${f.sello}`, ancho - 6), x + 3, y + 32);
    }
  });
  y += 44;
  doc.setFont("times", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...ACERO);
  doc.text(
    doc.splitTextToSize(
      "Cada sello = SHA-256(hash de la versión | usuario | etapa | decisión | fecha). La versión y la bitácora están encadenadas: para validar este documento, el auditor compara el hash de validación y los sellos con Producción › Costo de Producción › Verificar integridad.",
      W - 2 * M
    ),
    M,
    y
  );

  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    pie(n, total);
  }
  mostrarPDF(doc, `Ficha-Costo-${hoja.codigo}-${hoja.orden_produccion_id}-v${d.version}`);
}
