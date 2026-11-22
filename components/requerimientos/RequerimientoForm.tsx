"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Select, Textarea, ejecutarAsync } from "@/components/ui";
import { BotonNuevo } from "@/components/ui/BotonFiltros";
import { ItemsEditor, itemVacio } from "@/components/compras/EditarReq";
import { hoy } from "@/lib/storage";
import type { ItemReq, TipoRequerimiento } from "@/lib/types";

export interface DatosRequerimiento {
  sede: string;
  solicitante: string;
  fecha: string;
  motivo: string;
  items: ItemReq[];
  /** BIEN (por defecto) o SERVICIO: este último lo atiende Tesorería con una Orden de Servicio. */
  tipo?: TipoRequerimiento;
  /** Destino elegido (Secocha: ADM Secocha o Almacén de Arequipa). */
  destino?: string;
}

/** Opción de destino del requerimiento (Secocha, Williams 2026-11-22). */
export interface DestinoReq {
  value: string;
  label: string;
  /** Texto del botón de envío. */
  textoEnviar: string;
  mensajeOk: string;
  /** Solo bienes (el Almacén no atiende servicios): oculta "Tipo". */
  soloBienes?: boolean;
  /** Ayuda bajo el selector. */
  hint?: string;
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
  conTipo = false,
  destinos,
  sedeInicial,
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
  /** Muestra "Tipo: Bien / Servicio" (Arequipa). Secocha pide solo bienes. */
  conTipo?: boolean;
  /** Secocha: a quién se envía (ADM Secocha o Almacén de Arequipa). Sin destinos, llega a `destino`. */
  destinos?: DestinoReq[];
  /** Sede elegida al abrir (Secocha: Sucursal Secocha). */
  sedeInicial?: string;
  onEnviar: (d: DatosRequerimiento) => Promise<unknown>;
  onCreado: () => void;
  onCancelar: () => void;
}) {
  const [sede, setSede] = useState(areas ? (sedeInicial ?? "") : sedeOrigen);
  const [destinoSel, setDestinoSel] = useState(destinos?.[0]?.value ?? "");
  const dest = destinos?.find((d) => d.value === destinoSel);
  const conTipoReal = conTipo && !dest?.soloBienes;
  const [solicitante, setSolicitante] = useState(solicitanteInicial);
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  const [items, setItems] = useState<ItemReq[]>([itemVacio()]);
  const [tipo, setTipo] = useState<TipoRequerimiento>("BIEN");
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setEnviando(true);
    const ok = await ejecutarAsync(() => onEnviar({ sede, solicitante, fecha, motivo, items, ...(conTipoReal ? { tipo } : {}), ...(dest ? { destino: dest.value } : {}) }), dest?.mensajeOk ?? mensajeOk);
    setEnviando(false);
    if (ok) {
      setMotivo("");
      setItems([itemVacio()]);
      setTipo("BIEN");
      onCreado();
    }
  };

  return (
    <Card>
      <CardHeader
        title="Nuevo requerimiento"
        subtitle={`Sede origen: ${sedeOrigen} · Llega a ${dest?.label ?? destino}`}
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
        {destinos && destinos.length > 0 && (
          <Field label="Enviar a *" hint={dest?.hint} className="md:col-span-4">
            <div role="radiogroup" aria-label="Destino del requerimiento" className="grid gap-2 sm:grid-cols-2">
              {destinos.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={destinoSel === d.value}
                  onClick={() => setDestinoSel(d.value)}
                  className={
                    "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition " +
                    (destinoSel === d.value ? "border-azul-900 bg-plomo-100 text-azul-900 ring-2 ring-azul-500/40" : "border-plomo-200 bg-surface text-fg hover:border-azul-500")
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
        )}
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
        {conTipoReal && (
          <Field label="Tipo" hint={tipo === "SERVICIO" ? "Tesorería lo atiende con una Orden de Servicio (OS)" : undefined}>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoRequerimiento)}
              options={[
                { value: "BIEN", label: "Bien / producto" },
                { value: "SERVICIO", label: "Servicio" },
              ]}
            />
          </Field>
        )}
        <Field label="Motivo *" className="md:col-span-4">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Mantenimiento preventivo del remolcador U35 — cambio de rodamientos" />
        </Field>
      </div>
      <ItemsEditor items={items} onChange={setItems} modulo={modulo} servicio={conTipoReal && tipo === "SERVICIO"} />
      <div className="flex justify-end border-t border-plomo-100 px-5 py-4">
        <Button onClick={guardar} disabled={enviando}>
          <Send size={16} /> {enviando ? "Emitiendo…" : (dest?.textoEnviar ?? textoEnviar)}
        </Button>
      </div>
    </Card>
  );
}
