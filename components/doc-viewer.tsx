"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Badge, Button, Modal, Timeline } from "./ui";
import { buscarReq, fechaPE, getCotizaciones, getFacturas, getGuias, getOrdenes, soles } from "@/lib/storage";
import { pdfActaIngreso, pdfCotizacion, pdfFactura, pdfOrdenCompra, pdfRequerimiento } from "@/lib/pdf";
import type { EventoHistorial, TipoDoc } from "@/lib/types";

export interface DocRef {
  tipo: TipoDoc;
  id: string;
}

interface Resuelto {
  titulo: string;
  estado: string;
  filas: [string, string][];
  historial: EventoHistorial[];
  pdf?: () => void;
  archivo?: { url: string; tipo: string; nombre: string };
}

function resolver(ref: DocRef): Resuelto | null {
  if (ref.tipo === "REQ") {
    const r = buscarReq(ref.id);
    if (!r) return null;
    return {
      titulo: r.numero,
      estado: r.estado,
      filas: [["Fecha", fechaPE(r.fecha)], ["Sede", r.sede], ["Solicitante", r.solicitante], ["Motivo", r.motivo], ["Productos", r.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(" · ")]],
      historial: r.historial,
      pdf: () => pdfRequerimiento(r),
    };
  }
  if (ref.tipo === "COTI") {
    const c = getCotizaciones().find((x) => x.id === ref.id);
    if (!c) return null;
    return {
      titulo: `Cotización ${c.numero}`,
      estado: c.estado,
      filas: [["Proveedor", `${c.proveedor} (RUC ${c.ruc})`], ["Fecha", fechaPE(c.fechaEmision)], ["Requerimiento", c.reqNumero], ["Total", soles(c.total)]],
      historial: c.historial,
      pdf: () => pdfCotizacion(c),
    };
  }
  if (ref.tipo === "OC") {
    const o = getOrdenes().find((x) => x.id === ref.id);
    if (!o) return null;
    const f = getFacturas().find((x) => x.ocId === o.id);
    const g = getGuias().find((x) => x.ocId === o.id);
    return {
      titulo: o.numero,
      estado: o.estado,
      filas: [["Proveedor", o.proveedor], ["Cotización", o.cotizacionNumero], ["Requerimiento", o.reqNumero], ["Pago", o.formaPago], ["Entrega", `${o.tiempoEntrega} · ${o.lugarEntrega}`], ["Total", soles(o.total)]],
      historial: o.historial,
      pdf: () => (o.estado === "FINALIZADA" ? pdfActaIngreso(o, f, g) : pdfOrdenCompra(o)),
    };
  }
  if (ref.tipo === "FACTURA") {
    const f = getFacturas().find((x) => x.id === ref.id);
    if (!f) return null;
    const oc = getOrdenes().find((x) => x.id === f.ocId);
    if (f.esGastoTesoreria) {
      const adj = f.archivos?.find((a) => a.tipo === "FACTURA") ?? f.archivos?.[0];
      return {
        titulo: `Gasto Tesorería ${f.numero}`,
        estado: f.estadoPago,
        filas: [
          ["Proveedor", `${f.proveedor}${f.ruc ? ` (${f.ruc})` : ""}`],
          ["Fecha", fechaPE(f.fecha)],
          ["Descripción", f.descripcion ?? "-"],
          ["Total", soles(f.total)],
          ...(f.detraccionMonto ? ([["Detracción", `${f.detraccionPorc}% · ${soles(f.detraccionMonto)}`]] as [string, string][]) : []),
          ["Neto a pagar", soles(f.netoPagar ?? f.total)],
        ],
        historial: f.historial,
        pdf: () => pdfFactura(f, oc),
        ...(adj ? { archivo: { url: adj.dataUrl, tipo: adj.mime, nombre: adj.nombre } } : {}),
      };
    }
    return {
      titulo: `${f.tipo === "FACTURA" ? "Factura" : "Decl. Jurada"} ${f.numero}`,
      estado: f.estadoPago,
      filas: [["Proveedor", `${f.proveedor} (${f.ruc})`], ["Fecha", fechaPE(f.fecha)], ["OC", f.ocNumero], ["Subtotal", soles(f.subtotal)], ["IGV", soles(f.igv)], ["Total", soles(f.total)]],
      historial: f.historial,
      pdf: () => pdfFactura(f, oc),
    };
  }
  const g = getGuias().find((x) => x.id === ref.id);
  if (!g) return null;
  return {
    titulo: `Guía ${g.numero}`,
    estado: g.estado,
    filas: [["Fecha", fechaPE(g.fecha)], ["Factura", g.facturaNumero], ["OC", g.ocNumero], ["Archivo", g.archivoNombre]],
    historial: g.historial,
    archivo: { url: g.archivoDataUrl, tipo: g.archivoTipo, nombre: g.archivoNombre },
  };
}

export function DocViewer({ doc, onClose }: { doc: DocRef | null; onClose: () => void }) {
  const r = doc ? resolver(doc) : null;
  return (
    <Modal open={!!doc} onClose={onClose} title={r?.titulo ?? "Documento"} wide>
      {!r ? (
        <p className="text-sm text-plomo-500">El documento ya no existe (pudo ser rechazado y eliminado).</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge estado={r.estado} />
              {r.pdf && (
                <Button size="sm" variant="secondary" onClick={r.pdf}>
                  <FileText size={14} /> Ver PDF
                </Button>
              )}
            </div>
            <dl className="divide-y divide-plomo-100 rounded-lg border border-plomo-200">
              {r.filas.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-2 px-3 py-2 text-sm">
                  <dt className="font-medium text-plomo-500">{k}</dt>
                  <dd className="text-azul-900">{v}</dd>
                </div>
              ))}
            </dl>
            {r.archivo &&
              (r.archivo.tipo.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.archivo.url} alt={r.archivo.nombre} className="max-h-[420px] w-full rounded-lg border object-contain" />
              ) : (
                <iframe src={r.archivo.url} title={r.archivo.nombre} className="h-[420px] w-full rounded-lg border" />
              ))}
          </div>
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-plomo-500">Historial</h4>
            <Timeline eventos={r.historial} />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---- Apertura global (desde cualquier página o el buscador) -------------
const EV_DOC = "erp:open-doc";

export function abrirDoc(ref: DocRef): void {
  window.dispatchEvent(new CustomEvent<DocRef>(EV_DOC, { detail: ref }));
}

export function DocViewerHost() {
  const [doc, setDoc] = useState<DocRef | null>(null);
  useEffect(() => {
    const on = (e: Event) => setDoc((e as CustomEvent<DocRef>).detail);
    window.addEventListener(EV_DOC, on);
    return () => window.removeEventListener(EV_DOC, on);
  }, []);
  return <DocViewer doc={doc} onClose={() => setDoc(null)} />;
}
