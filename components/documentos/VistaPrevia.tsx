"use client";

// Vista previa protegida: el archivo se pide a la Edge Function (que registra VER en audit_log y le pone
// marca de agua al PDF) y se dibuja en <canvas> dentro de la página. No hay botón de descarga, ni clic
// derecho, ni arrastrar, ni Ctrl+S / Ctrl+P / Ctrl+C mientras está abierta, y al imprimir sale en blanco.
// LÍMITE HONESTO: lo que se ve en pantalla siempre puede fotografiarse o capturarse; un navegador no puede
// impedir capturas de pantalla ni bloquear USB. Por eso cada página lleva el nombre del usuario y la fecha.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileQuestion, Loader2, ShieldCheck } from "lucide-react";
import { verArchivo, type ArchivoGD } from "@/lib/gestionDocumental";

export function VistaPrevia({ docId, version, usuario }: { docId: string; version?: string; usuario: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "sin-vista" | "error">("cargando");
  const [error, setError] = useState("");
  const [info, setInfo] = useState<Pick<ArchivoGD, "integridad" | "version" | "hash" | "marca"> | null>(null);
  const sello = `${usuario} · ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}`;

  useEffect(() => {
    let vivo = true;
    const destino = caja.current;
    setEstado("cargando");
    (async () => {
      try {
        const a = await verArchivo(docId, version);
        if (!vivo || !destino) return;
        setInfo({ integridad: a.integridad, version: a.version, hash: a.hash, marca: a.marca });
        destino.innerHTML = "";
        const esPdf = a.tipo.includes("pdf") || /\.pdf$/i.test(a.nombre);
        if (esPdf) {
          const pdfjs = await import("pdfjs-dist");
          if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();
          const pdf = await pdfjs.getDocument({ data: new Uint8Array(a.bytes) }).promise;
          for (let i = 1; i <= Math.min(pdf.numPages, 60) && vivo; i++) {
            const p = await pdf.getPage(i);
            const vp = p.getViewport({ scale: 1.6 });
            const c = document.createElement("canvas");
            c.width = Math.ceil(vp.width);
            c.height = Math.ceil(vp.height);
            c.className = "mb-3 block h-auto w-full rounded border border-[#11212D]/10 bg-white";
            await p.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
            destino.appendChild(c);
          }
          void pdf.destroy();
          setEstado("listo");
        } else if (a.tipo.startsWith("image/")) {
          const url = URL.createObjectURL(new Blob([a.bytes], { type: a.tipo }));
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext("2d")!.drawImage(img, 0, 0);
            c.className = "block h-auto w-full rounded bg-white";
            destino.appendChild(c);
            URL.revokeObjectURL(url);
            if (vivo) setEstado("listo");
          };
          img.src = url;
        } else {
          setEstado("sin-vista");
        }
        // Los bytes no se guardan en ningún lado: al cerrar el panel se pierden
      } catch (e) {
        if (vivo) {
          setError((e as Error).message);
          setEstado("error");
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [docId, version]);

  // Bloqueo de atajos de copia / guardado / impresión mientras la vista previa está abierta
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["s", "p", "c"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, []);

  return (
    <div className="space-y-2">
      {info?.integridad === "ALERTA" && (
        <div className="flex items-start gap-2 rounded-lg border-2 border-[#800021] bg-white px-3 py-2 text-[13px] font-semibold text-[#800021]">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          ALERTA DE INTEGRIDAD: el archivo guardado no coincide con su hash SHA-256. Pudo ser modificado fuera del sistema. Ya se avisó a Gerencia.
        </div>
      )}
      {info?.integridad === "OK" && (
        <p className="flex items-center gap-1.5 text-[11px] text-[#294D61]">
          <ShieldCheck size={14} /> Integridad verificada al abrir: el hash SHA-256 coincide ({info.version}).
        </p>
      )}
      <div
        className="gd-vista-protegida relative max-h-[62vh] select-none overflow-y-auto overflow-x-hidden rounded-lg border border-[#11212D]/15 bg-[#CCD0CF]/50 p-2"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
      >
        <div ref={caja} />
        {/* Sello visible encima (además de la marca de agua que la Edge Function pone en el PDF) */}
        {estado === "listo" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="absolute left-[-10%] w-[130%] -rotate-[24deg] text-center text-[13px] font-bold tracking-widest text-[#800021]/[0.13]" style={{ top: `${6 + i * 13}%` }}>
                {sello} · {sello}
              </span>
            ))}
          </div>
        )}
        {estado === "cargando" && (
          <p className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#11212D]/70">
            <Loader2 size={16} className="animate-spin" /> Cargando vista previa (queda registrada en la auditoría)…
          </p>
        )}
        {estado === "sin-vista" && (
          <p className="flex flex-col items-center justify-center gap-2 py-12 text-center text-[13px] text-[#11212D]/70">
            <FileQuestion size={28} />
            Este tipo de archivo no tiene vista previa en el navegador. Solo se puede descargar con permiso &quot;Lectura y Descarga&quot; o superior.
          </p>
        )}
        {estado === "error" && <p className="px-3 py-10 text-center text-[13px] font-semibold text-[#800021]">{error}</p>}
      </div>
      <style>{`@media print { .gd-vista-protegida { display: none !important; } }`}</style>
    </div>
  );
}
