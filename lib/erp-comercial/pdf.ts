// Genera la ficha tecnica de un equipo en PDF (pdf-lib, sin dependencias nativas)
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { readFile } from "fs/promises";
import path from "path";
import type { Equipo } from "@prisma/client";
import { parseJSON } from "./utils";

const AZUL = rgb(0.09, 0.32, 0.62);
const GRIS = rgb(0.35, 0.35, 0.38);
const NEGRO = rgb(0.1, 0.1, 0.12);

// Las fuentes estandar usan WinAnsi: quitamos caracteres no soportados
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2022\u20AC]/g, "");

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function etiqueta(k: string) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export async function generarFichaPDF(equipo: Equipo, opts: { precio?: number; empresa?: string } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Ficha tecnica ${equipo.codigo} - ${equipo.nombre}`);
  pdf.setAuthor(opts.empresa || "COMBOY");
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 48;
  let y = height - M;

  // Cabecera
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: AZUL });
  page.drawText("COMBOY", { x: M, y: height - 52, size: 26, font: bold, color: rgb(1, 1, 1) });
  page.drawText("FICHA TECNICA", { x: width - M - bold.widthOfTextAtSize("FICHA TECNICA", 12), y: height - 48, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(equipo.codigo), { x: width - M - font.widthOfTextAtSize(safe(equipo.codigo), 10), y: height - 64, size: 10, font, color: rgb(0.85, 0.9, 1) });
  y = height - 130;

  page.drawText(safe(equipo.nombre), { x: M, y, size: 20, font: bold, color: NEGRO });
  y -= 20;
  page.drawText(safe(`${equipo.marca}  •  ${equipo.categoria}`), { x: M, y, size: 11, font, color: GRIS });
  y -= 24;

  // Foto (solo JPG/PNG locales)
  const fotos = parseJSON<string[]>(equipo.fotos, []);
  const foto = fotos.find((f) => /\.(jpe?g|png)$/i.test(f) && f.startsWith("/"));
  if (foto) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", foto.replace(/^\/+/, "")));
      const img = /\.png$/i.test(foto) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const s = img.scaleToFit(width - 2 * M, 220);
      page.drawImage(img, { x: (width - s.width) / 2, y: y - s.height, width: s.width, height: s.height });
      y -= s.height + 20;
    } catch {
      /* imagen no disponible */
    }
  }

  // Descripcion
  if (equipo.descripcion) {
    page.drawText("Descripcion", { x: M, y, size: 12, font: bold, color: AZUL });
    y -= 16;
    for (const l of wrap(equipo.descripcion, font, 10.5, width - 2 * M)) {
      page.drawText(l, { x: M, y, size: 10.5, font, color: NEGRO });
      y -= 14;
    }
    y -= 10;
  }

  // Tabla de especificaciones
  const ficha = parseJSON<Record<string, string | number>>(equipo.fichaTecnica, {});
  page.drawText("Especificaciones tecnicas", { x: M, y, size: 12, font: bold, color: AZUL });
  y -= 10;
  const rowH = 22;
  Object.entries(ficha).forEach(([k, v], i) => {
    y -= rowH;
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - 6, width: width - 2 * M, height: rowH, color: rgb(0.94, 0.96, 0.99) });
    page.drawText(safe(etiqueta(k)), { x: M + 10, y, size: 10.5, font: bold, color: GRIS });
    page.drawText(safe(String(v)), { x: M + 200, y, size: 10.5, font, color: NEGRO });
  });
  y -= 30;

  if (opts.precio) {
    page.drawRectangle({ x: M, y: y - 14, width: width - 2 * M, height: 40, color: rgb(0.9, 0.97, 0.92) });
    page.drawText("Precio especial para usted:", { x: M + 12, y, size: 12, font: bold, color: NEGRO });
    const p = `S/ ${opts.precio.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + IGV`;
    page.drawText(p, { x: width - M - 12 - bold.widthOfTextAtSize(p, 14), y, size: 14, font: bold, color: rgb(0.05, 0.5, 0.2) });
  }

  page.drawText(safe(`Documento generado el ${new Date().toLocaleDateString("es-PE")}  •  Especificaciones sujetas a cambio sin previo aviso`), {
    x: M, y: 30, size: 8, font, color: GRIS,
  });
  return Buffer.from(await pdf.save());
}
