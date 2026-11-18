"use client";

// PDF, XML y CDR de Nubefact en la lista de comprobantes: el mismo visor para los tres,
// con Ver, Descargar, Compartir e Imprimir.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, FileCheck2, FileCode2, FileText, Loader2, Printer, Share2, X } from "lucide-react";
import { Button, toast } from "@/components/ui";
import { guardarArchivo } from "@/lib/guardarArchivo";
import type { DatosSunatPse, EstadoSunat } from "@/lib/types";

type Clase = "pdf" | "xml" | "cdr";

interface Archivo {
  clase: Clase;
  numero: string;
  enlace: string;
}

const TITULO: Record<Clase, string> = { pdf: "PDF", xml: "XML", cdr: "CDR" };
const MIME: Record<string, string> = { pdf: "application/pdf", xml: "application/xml", zip: "application/zip" };

/** Trae el archivo de Nubefact (vía /api/sunat/archivo por CORS; si no existe, como en la app de escritorio, directo). */
async function traer(enlace: string): Promise<Uint8Array> {
  const intentos = [`/api/sunat/archivo?url=${encodeURIComponent(enlace)}`, enlace];
  let ultimo = "";
  for (const url of intentos) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        ultimo = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`;
        continue;
      }
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      ultimo = (e as Error).message;
    }
  }
  throw new Error(ultimo || "No se pudo traer el archivo.");
}

const esZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** Primer .xml dentro de un ZIP (el CDR de SUNAT trae R-....xml). */
async function xmlDeZip(b: Uint8Array): Promise<string> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("ZIP inválido");
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true);
    const tam = v.getUint32(p + 20, true);
    const nLen = v.getUint16(p + 28, true);
    const eLen = v.getUint16(p + 30, true);
    const cLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nLen));
    p += 46 + nLen + eLen + cLen;
    if (!/\.xml$/i.test(nombre)) continue;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = b.slice(ini, ini + tam);
    if (metodo === 0) return new TextDecoder().decode(datos);
    if (metodo !== 8) throw new Error(`Compresión ${metodo} no soportada`);
    const s = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(s).text();
  }
  throw new Error("El ZIP no trae un XML");
}

/** Datos de la constancia (ApplicationResponse del CDR). */
function leerCdr(xml: string) {
  const tag = (n: string) => xml.match(new RegExp(`<(?:\\w+:)?${n}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${n}>`))?.[1]?.trim() ?? "";
  const notas = [...xml.matchAll(/<(?:\w+:)?Note[^>]*>([\s\S]*?)<\/(?:\w+:)?Note>/g)].map((m) => m[1].trim());
  return { codigo: tag("ResponseCode"), descripcion: tag("Description"), referencia: tag("ReferenceID"), fecha: tag("ResponseDate"), hora: tag("ResponseTime"), notas };
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ventana de impresión con HTML propio (XML y constancia del CDR). */
function imprimirHtml(titulo: string, cuerpo: string) {
  const w = window.open("", "_blank");
  if (!w) return toast("El navegador bloqueó la ventana de impresión", "error");
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>` +
      "body{font:12px/1.45 system-ui,sans-serif;margin:16mm;color:#111}h1{font-size:16px;margin:0 0 8px}" +
      "pre{white-space:pre-wrap;word-break:break-all;font:10px/1.35 ui-monospace,Consolas,monospace;border:1px solid #ccc;padding:8px}" +
      "table{border-collapse:collapse;margin:8px 0 14px}td{padding:3px 10px 3px 0;vertical-align:top}td:first-child{font-weight:600}" +
      `</style></head><body>${cuerpo}</body></html>`
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

function Visor({ a, onClose }: { a: Archivo; onClose: () => void }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [urlPdf, setUrlPdf] = useState("");

  useEffect(() => {
    let vivo = true;
    let url = "";
    (async () => {
      try {
        const b = await traer(a.enlace);
        if (!vivo) return;
        setBytes(b);
        if (a.clase === "pdf") {
          url = URL.createObjectURL(new Blob([b as BlobPart], { type: "application/pdf" }));
          setUrlPdf(url);
        } else if (a.clase === "cdr" && esZip(b)) {
          setTexto(await xmlDeZip(b).catch((e) => `No se pudo abrir el ZIP del CDR: ${(e as Error).message}`));
        } else {
          setTexto(new TextDecoder().decode(b));
        }
      } catch (e) {
        if (vivo) setError((e as Error).message);
      }
    })();
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [a]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const ext = a.clase === "pdf" ? "pdf" : a.clase === "xml" ? "xml" : bytes && !esZip(bytes) ? "xml" : "zip";
  const archivo = `${a.numero}.${ext}`;
  const cdr = a.clase === "cdr" && texto ? leerCdr(texto) : null;

  const ver = () => window.open(a.enlace, "_blank", "noopener");

  const descargar = async () => {
    if (!bytes) return ver();
    await guardarArchivo(archivo, bytes, { tipo: MIME[ext] });
  };

  const compartir = async () => {
    const titulo = `${TITULO[a.clase]} ${a.numero}`;
    const textoMsj = `${titulo} - COMBOY VID`;
    setOcupado(true);
    try {
      const file = bytes ? new File([bytes as BlobPart], archivo, { type: MIME[ext] }) : null;
      if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: titulo, text: textoMsj });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: titulo, text: textoMsj, url: a.enlace });
        return;
      }
      await navigator.clipboard.writeText(a.enlace);
      toast("Enlace copiado: pégalo en WhatsApp o en el correo", "ok");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(a.enlace);
        toast("Enlace copiado: pégalo en WhatsApp o en el correo", "ok");
      } catch {
        window.prompt("Copia el enlace:", a.enlace);
      }
    } finally {
      setOcupado(false);
    }
  };

  const imprimir = () => {
    if (a.clase === "pdf") {
      if (!urlPdf) return ver();
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      f.src = urlPdf;
      f.onload = () => {
        try {
          f.contentWindow?.focus();
          f.contentWindow?.print();
        } catch {
          ver();
        }
        setTimeout(() => f.remove(), 60_000);
      };
      document.body.appendChild(f);
      return;
    }
    if (a.clase === "xml") return imprimirHtml(archivo, `<h1>XML ${escapar(a.numero)}</h1><pre>${escapar(texto)}</pre>`);
    // CDR: constancia de recepción (si se pudo leer) + el XML
    const filas = cdr
      ? `<table><tr><td>Comprobante</td><td>${escapar(cdr.referencia || a.numero)}</td></tr>` +
        `<tr><td>Código SUNAT</td><td>${escapar(cdr.codigo)}</td></tr>` +
        `<tr><td>Respuesta</td><td>${escapar(cdr.descripcion)}</td></tr>` +
        `<tr><td>Fecha</td><td>${escapar(`${cdr.fecha} ${cdr.hora}`.trim())}</td></tr>` +
        (cdr.notas.length ? `<tr><td>Observaciones</td><td>${cdr.notas.map(escapar).join("<br>")}</td></tr>` : "") +
        "</table>"
      : "";
    imprimirHtml(`CDR ${a.numero}`, `<h1>Constancia de recepción SUNAT (CDR) · ${escapar(a.numero)}</h1>${filas}${texto ? `<pre>${escapar(texto)}</pre>` : ""}`);
  };

  const listo = !!bytes || !!error;

  const ventana = (
    <div className="fixed inset-0 z-[80] flex animate-velo items-center justify-center bg-black/55 p-2 backdrop-blur-[2px] sm:p-4" onMouseDown={onClose}>
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-plomo-500 transition hover:bg-plomo-100 hover:text-fg" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-plomo-200 px-4 py-2.5">
          <Button size="sm" variant="secondary" onClick={ver}>
            <Eye size={14} /> Ver
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void descargar()} disabled={!listo}>
            <Download size={14} /> Descargar
          </Button>
          <Button size="sm" variant="success" onClick={() => void compartir()} disabled={ocupado} className="!bg-[#128C7E] hover:!bg-[#075E54]">
            <Share2 size={14} /> Compartir
          </Button>
          <Button size="sm" onClick={imprimir} disabled={!listo}>
            <Printer size={14} /> Imprimir
          </Button>
        </div>

        <div className="min-h-[40vh] flex-1 overflow-y-auto bg-plomo-100 p-3">
          {error ? (
            <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm text-plomo-600">
              <p>No se pudo mostrar la vista previa: {error}</p>
              <p>Usa <b>Ver</b> para abrirlo en una pestaña nueva.</p>
            </div>
          ) : !bytes ? (
            <div className="flex h-[50vh] items-center justify-center text-plomo-500">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : a.clase === "pdf" ? (
            <iframe src={urlPdf} title={archivo} className="h-[70vh] w-full rounded bg-white shadow-card" />
          ) : (
            <div className="space-y-3">
              {cdr && (
                <div className="rounded-lg bg-white p-3 text-sm shadow-card">
                  <p className="mb-1 font-semibold text-fg">Constancia de recepción SUNAT</p>
                  <p>
                    <b>Código:</b> {cdr.codigo || "—"} · <b>Comprobante:</b> {cdr.referencia || a.numero}
                  </p>
                  <p>{cdr.descripcion}</p>
                  {cdr.notas.map((n, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      {n}
                    </p>
                  ))}
                </div>
              )}
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-white p-3 font-mono text-[11px] leading-snug text-fg shadow-card">{texto}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  const raiz = document.querySelector(".tema-planta") ?? document.body;
  return createPortal(ventana, raiz);
}

/** Lo que necesitan los botones: comprobante de venta o guía de remisión. */
export interface DocConArchivos {
  numero: string;
  estadoSunat?: EstadoSunat;
  sunat?: DatosSunatPse;
}

/** Botones PDF · XML · CDR de una fila (XML y CDR solo con SUNAT ACEPTADO). */
export function ArchivosSunat({ c }: { c: DocConArchivos }) {
  const [abierto, setAbierto] = useState<Archivo | null>(null);
  const cerrar = useCallback(() => setAbierto(null), []);
  const s = c.sunat;
  if (!s?.enlacePdf && !s?.enlaceXml && !s?.enlaceCdr) return null;
  const aceptado = c.estadoSunat === "ACEPTADO";
  const abrir = (clase: Clase, enlace?: string) => enlace && setAbierto({ clase, numero: c.numero, enlace });
  return (
    <>
      {s.enlacePdf && (
        <Button size="sm" variant="ghost" title="PDF de Nubefact" onClick={() => abrir("pdf", s.enlacePdf)}>
          <FileText size={14} /> PDF
        </Button>
      )}
      {aceptado && (
        <Button size="sm" variant="ghost" title={s.enlaceXml ? "XML firmado" : "Nubefact aún no devuelve el XML"} disabled={!s.enlaceXml} onClick={() => abrir("xml", s.enlaceXml)}>
          <FileCode2 size={14} /> XML
        </Button>
      )}
      {aceptado && (
        <Button size="sm" variant="ghost" title={s.enlaceCdr ? "Constancia de recepción SUNAT (CDR)" : "SUNAT aún no devuelve el CDR"} disabled={!s.enlaceCdr} onClick={() => abrir("cdr", s.enlaceCdr)}>
          <FileCheck2 size={14} /> CDR
        </Button>
      )}
      {abierto && <Visor a={abierto} onClose={cerrar} />}
    </>
  );
}
