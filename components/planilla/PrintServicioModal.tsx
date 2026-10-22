"use client";

import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { FileDown, Printer, X } from "lucide-react";
import { EMPRESA } from "@/lib/empresa";
import { toast } from "@/components/ui";
import { fechaPE, hoy, soles } from "@/lib/storage";

/** Datos que muestra el recibo: un contratista del maestro o una concesión / servicio externo. */
export interface ReciboServicio {
  tipo: "CONTRATISTA" | "CONCESION";
  numero: string;
  servicio: string;
  descripcion?: string;
  contratista: string;
  documento: string; // "DNI 12345678" / "RUC 20…"
  empresa: string;
  sede: string;
  inicio: string; // YYYY-MM-DD
  fin: string;
  monto: number;
  modalidad: string;
  estado: string;
}

const TITULOS: Record<ReciboServicio["tipo"], string> = {
  CONTRATISTA: "RECIBO DE SERVICIO",
  CONCESION: "RECIBO DE CONCESION / SERVICIO EXTERNO",
};

const fecha = (f: string) => (f ? fechaPE(f) : "—");

/** Vista previa del recibo (modal oscuro, recibo blanco) con impresión vía react-to-print y descarga en PDF. */
export function PrintServicioModal({ recibo, onClose }: { recibo: ReciboServicio; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titulo = TITULOS[recibo.tipo];
  const imprimir = useReactToPrint({
    contentRef: ref,
    documentTitle: recibo.numero,
    pageStyle: "@page { size: A4; margin: 12mm } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }",
  });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const filas: [string, string][] = [
    ["Servicio", recibo.servicio],
    ["Contratista", recibo.contratista],
    ["Documento", recibo.documento || "Sin documento"],
    ["Empresa", recibo.empresa || "-"],
    ["Sede", recibo.sede || "-"],
    ["Inicio", fecha(recibo.inicio)],
    ["Fin", fecha(recibo.fin)],
    ["Modalidad", recibo.modalidad || "-"],
    ["Estado", recibo.estado],
  ];

  const [generando, setGenerando] = useState(false);
  /** PDF A4 idéntico a la vista previa: captura el div blanco del recibo (logo incluido) con html2canvas. */
  const descargar = async () => {
    if (!ref.current) return;
    setGenerando(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const ancho = doc.internal.pageSize.getWidth() - 24;
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 12, 12, ancho, (canvas.height * ancho) / canvas.width);
      doc.setProperties({ title: recibo.numero });
      doc.save(`${recibo.numero}.pdf`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo generar el PDF", "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-velo items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[5vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-3xl animate-emerger rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <Printer size={18} className="text-[#3B82F6]" /> Vista previa · {titulo}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto bg-slate-950/60 p-5">
          {/* Contenido que se imprime: blanco y limpio */}
          <div ref={ref} className="mx-auto max-w-[720px] bg-white p-8 text-slate-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
            <div className="flex items-start justify-between gap-4 border-b-2 border-[#0F2440] pb-4">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-comboy.png" alt="COMBOY VID" className="h-14 w-auto" />
                <p className="mt-2 text-xs text-slate-600">
                  {EMPRESA.razonSocial} · RUC {EMPRESA.ruc}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold leading-tight text-[#0F2440]">{titulo}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-[#B91C1C]">{recibo.numero}</p>
                <p className="mt-1 text-xs text-slate-500">Emitido: {fechaPE(hoy())}</p>
              </div>
            </div>

            <table className="mt-5 w-full border-collapse text-sm">
              <tbody>
                {filas.map(([k, v]) => (
                  <tr key={k} className="border-b border-slate-200">
                    <th className="w-40 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</th>
                    <td className="px-3 py-2 font-medium">
                      {v}
                      {k === "Servicio" && recibo.descripcion && <p className="text-xs font-normal text-slate-500">{recibo.descripcion}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-5 flex justify-end">
              <div className="rounded-lg border-2 border-[#0F2440] px-5 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monto</p>
                <p className="text-2xl font-bold text-[#0F2440]">{soles(recibo.monto)}</p>
              </div>
            </div>

            <div className="mt-16 grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
              <div className="border-t border-slate-400 pt-2">{EMPRESA.razonSocial}</div>
              <div className="border-t border-slate-400 pt-2">
                {recibo.contratista}
                <br />
                {recibo.documento}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800">
            Cerrar
          </button>
          <button onClick={descargar} disabled={generando} className="inline-flex items-center gap-2 rounded-lg border border-[#3B82F6] px-4 py-2 text-sm font-semibold text-[#3B82F6] transition hover:bg-[#3B82F6]/10 disabled:opacity-60">
            <FileDown size={16} /> {generando ? "Generando…" : "Descargar PDF"}
          </button>
          <button onClick={() => imprimir()} className="inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563EB]">
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
