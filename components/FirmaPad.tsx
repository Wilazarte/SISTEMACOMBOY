"use client";

import { useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui";
import type { ArchivoAdjunto } from "@/lib/types";

/** Firma con el dedo / mouse (canvas) → PNG. */
export function FirmaPad({ onChange, titulo = "Firma del cliente", archivo = "firma-cliente.png" }: { onChange: (f?: ArchivoAdjunto) => void; titulo?: string; archivo?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const trazo = useRef(false);
  const [vacia, setVacia] = useState(true);

  const pos = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) * c.width) / r.width, y: ((ev.clientY - r.top) * c.height) / r.height };
  };
  const ctx = () => {
    const g = ref.current!.getContext("2d")!;
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.strokeStyle = "#0F2440";
    return g;
  };
  const limpiar = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    trazo.current = false;
    setVacia(true);
    onChange(undefined);
  };

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-plomo-500">{titulo} *</p>
      <div className="flex items-end gap-2">
        <canvas
          ref={ref}
          width={600}
          height={160}
          aria-label={titulo}
          className="h-32 w-full max-w-xl touch-none rounded-lg border-2 border-dashed border-plomo-200 bg-white"
          onPointerDown={(ev) => {
            dibujando.current = true;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            const g = ctx();
            const p = pos(ev);
            g.beginPath();
            g.moveTo(p.x, p.y);
          }}
          onPointerMove={(ev) => {
            if (!dibujando.current) return;
            const g = ctx();
            const p = pos(ev);
            g.lineTo(p.x, p.y);
            g.stroke();
            trazo.current = true;
            setVacia(false);
          }}
          onPointerUp={() => {
            dibujando.current = false;
            if (trazo.current) onChange({ nombre: archivo, tipo: "image/png", url: ref.current!.toDataURL("image/png") });
          }}
        />
        <Button type="button" variant="ghost" size="sm" onClick={limpiar} title="Borrar firma">
          <Eraser size={14} />
        </Button>
      </div>
      {vacia && <p className="mt-1 text-xs text-plomo-500">Firme dentro del recuadro.</p>}
    </div>
  );
}
