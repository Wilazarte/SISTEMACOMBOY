"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, ejecutarAsync } from "@/components/ui";
import { BotonNuevo } from "@/components/ui/BotonFiltros";
import { ItemsEditor, itemVacio } from "@/components/compras/EditarReq";
import { hoy } from "@/lib/storage";
import type { ItemReq } from "@/lib/types";

export interface DatosRequerimiento {
  sede: string;
  solicitante: string;
  fecha: string;
  motivo: string;
  items: ItemReq[];
}

/**
 * Formulario "Nuevo requerimiento" único (Arequipa y Secocha): mismos campos, tabla de productos y botón.
 * Arequipa elige el área de la Planta Principal; Secocha tiene la sede fija. Lo que cambia se pasa por props.
 */
export function RequerimientoForm({
  sedeOrigen,
  areas,
  destino,
  numeroProbable,
  solicitanteInicial = "",
  modulo,
  textoEnviar,
  mensajeOk,
  onEnviar,
  onCreado,
  onCancelar,
}: {
  /** Sede que emite: "Arequipa - Planta Principal" o "Secocha". */
  sedeOrigen: string;
  /** Áreas de la sede para elegir (Arequipa). Sin áreas, la sede queda fija (Secocha). */
  areas?: string[];
  /** A quién llega (se muestra en el subtítulo). */
  destino: string;
  numeroProbable: string;
  solicitanteInicial?: string;
  /** Módulo que se registra si se pide un producto nuevo al catálogo. */
  modulo: string;
  textoEnviar: string;
  mensajeOk: string;
  onEnviar: (d: DatosRequerimiento) => Promise<unknown>;
  onCreado: () => void;
  onCancelar: () => void;
}) {
  const [sede, setSede] = useState(areas ? "" : sedeOrigen);
  const [solicitante, setSolicitante] = useState(solicitanteInicial);
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  const [items, setItems] = useState<ItemReq[]>([itemVacio()]);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setEnviando(true);
    const ok = await ejecutarAsync(() => onEnviar({ sede, solicitante, fecha, motivo, items }), mensajeOk);
    setEnviando(false);
    if (ok) {
      setMotivo("");
      setItems([itemVacio()]);
      onCreado();
    }
  };

  return (
    <Card>
      <CardHeader
        title="Nuevo requerimiento"
        subtitle={`Sede origen: ${sedeOrigen} · Llega a ${destino}`}
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-plomo-100 px-3 py-1.5 text-sm font-bold text-slate-700" title="Número probable: el definitivo se asigna al guardar">
              {numeroProbable}
            </span>
            <BotonNuevo abierto onClick={onCancelar} />
          </div>
        }
      />
      <div className="grid gap-4 p-5 md:grid-cols-4">
        <Field label="Sede *">
          {areas ? (
            <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Seleccione…" options={areas.map((s) => ({ value: s, label: s }))} />
          ) : (
            <Input value={sede} readOnly />
          )}
        </Field>
        <Field label="Solicitante *">
          <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nombre y cargo" />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Motivo *" className="md:col-span-4">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Mantenimiento preventivo del remolcador U35 — cambio de rodamientos" />
        </Field>
      </div>
      <ItemsEditor items={items} onChange={setItems} modulo={modulo} />
      <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
        <Button onClick={guardar} disabled={enviando}>
          <Send size={16} /> {enviando ? "Emitiendo…" : textoEnviar}
        </Button>
      </div>
    </Card>
  );
}
