"use client";

// Botones PDF e Imprimir de una fila (comprobantes y guías): PDF abre el selector A4 / 80 mm / 58 mm
// con las plantillas propias de COMBOY VID; Imprimir imprime directo en el último tamaño elegido.

import { useEffect, useState } from "react";
import { Eye, FileText, Printer, Receipt } from "lucide-react";
import { Button, Modal, cn } from "@/components/ui";
import { TAMANOS_PDF, type TamanoPdf } from "@/lib/pdf";

const CLAVE = "erp:pdf-tamano";
const EVENTO = "erp:pdf-tamano";

function leerTamano(): TamanoPdf {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "80" || v === "58" || v === "A4" ? v : "A4";
  } catch {
    return "A4";
  }
}

function guardarTamano(t: TamanoPdf): void {
  try {
    localStorage.setItem(CLAVE, t);
  } catch {
    /* sin almacenamiento: solo dura en esta pantalla */
  }
  window.dispatchEvent(new CustomEvent<TamanoPdf>(EVENTO, { detail: t }));
}

/** Tamaño preferido (se recuerda en este navegador y se comparte entre todas las filas). */
function useTamanoPdf(): [TamanoPdf, (t: TamanoPdf) => void] {
  const [t, setT] = useState<TamanoPdf>("A4");
  useEffect(() => {
    setT(leerTamano());
    const on = (e: Event) => setT((e as CustomEvent<TamanoPdf>).detail);
    window.addEventListener(EVENTO, on);
    return () => window.removeEventListener(EVENTO, on);
  }, []);
  return [t, guardarTamano];
}

const corto = (t: TamanoPdf) => (t === "A4" ? "A4" : `${t} mm`);

export function BotonesPdf({ numero, ver, imprimir }: { numero: string; ver: (t: TamanoPdf) => void; imprimir: (t: TamanoPdf) => void }) {
  const [tam, setTam] = useTamanoPdf();
  const [abierto, setAbierto] = useState(false);
  const accion = (t: TamanoPdf, fn: (t: TamanoPdf) => void) => {
    setTam(t);
    setAbierto(false);
    fn(t);
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAbierto(true)} title="PDF: elegir tamaño (A4 / 80 mm / 58 mm)">
        <FileText size={14} /> PDF
      </Button>
      <Button size="sm" variant="ghost" onClick={() => imprimir(tam)} title={`Imprimir directo en ${corto(tam)}`}>
        <Printer size={14} /> <span className="text-[11px] text-plomo-500">{corto(tam)}</span>
      </Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title={`PDF · ${numero}`}>
        <p className="mb-3 text-sm text-plomo-600">Elija el tamaño. Se recuerda para el botón Imprimir.</p>
        <div className="space-y-2">
          {TAMANOS_PDF.map((o) => (
            <div
              key={o.id}
              className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5", o.id === tam ? "border-corp bg-corp/5" : "border-plomo-200")}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-plomo-100 text-plomo-600">
                {o.id === "A4" ? <FileText size={18} /> : <Receipt size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{o.label}</span>
                <span className="block text-xs text-plomo-500">{o.detalle}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => accion(o.id, ver)}>
                <Eye size={14} /> Ver
              </Button>
              <Button size="sm" onClick={() => accion(o.id, imprimir)}>
                <Printer size={14} /> Imprimir
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
