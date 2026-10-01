"use client";

import { useState } from "react";
import { MessageSquareText, Send, Trash2 } from "lucide-react";
import { Button, Card, Textarea, ejecutar } from "@/components/ui";
import type { Sesion } from "@/lib/auth";
import { ErpError, KEYS, escribir, leer, uid, useStore } from "@/lib/storage";

export interface Observacion {
  id: string;
  texto: string;
  fecha: string; // ISO
  usuario: string;
}

/** Observaciones por módulo: { "/dashboard/compras": [...], ... } */
type PorModulo = Record<string, Observacion[]>;

const NOMBRES: Record<string, string> = {
  "/dashboard/compras": "Tesorería / Compras",
  "/dashboard/tesoreria": "Tesorería",
  "/dashboard/almacen": "Almacén",
  "/dashboard/ventas": "Ventas",
  "/dashboard/planilla": "Planilla",
};

/**
 * Gerencia escribe observaciones sobre el módulo; todos los usuarios del módulo las ven.
 * Gerencia y el creador pueden eliminarlas.
 */
export function ObservacionesGerencia({ modulo, sesion }: { modulo: string; sesion: Sesion }) {
  const todas = useStore<PorModulo>(KEYS.OBSERVACIONES, {});
  const lista = todas[modulo] ?? [];
  const [texto, setTexto] = useState("");
  const escribe = sesion.rol === "gerencia";
  const borra = sesion.rol === "gerencia" || sesion.rol === "creador";

  // Los módulos sin observaciones no muestran nada a quien no puede escribir
  if (!escribe && lista.length === 0) return null;

  const agregar = () => {
    const ok = ejecutar(() => {
      const t = texto.trim();
      if (!t) throw new ErpError("Escriba la observación.");
      const actual = leer<PorModulo>(KEYS.OBSERVACIONES, {});
      const obs: Observacion = { id: uid(), texto: t, fecha: new Date().toISOString(), usuario: sesion.usuario };
      escribir(KEYS.OBSERVACIONES, { ...actual, [modulo]: [obs, ...(actual[modulo] ?? [])] });
    }, "Observación registrada");
    if (ok) setTexto("");
  };

  const eliminar = (id: string) => {
    if (!confirm("¿Eliminar esta observación?")) return;
    const actual = leer<PorModulo>(KEYS.OBSERVACIONES, {});
    escribir(KEYS.OBSERVACIONES, { ...actual, [modulo]: (actual[modulo] ?? []).filter((o) => o.id !== id) });
  };

  return (
    <Card className="border-amber-300 bg-amber-50/60">
      <div className="flex items-center gap-2 border-b border-amber-200 px-5 py-3">
        <MessageSquareText size={18} className="text-amber-700" />
        <h3 className="font-semibold text-slate-900">Observaciones de Gerencia · {NOMBRES[modulo] ?? modulo}</h3>
        {lista.length > 0 && <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-slate-900">{lista.length}</span>}
      </div>
      <div className="space-y-3 p-5">
        {escribe && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              agregar();
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escriba una observación para el responsable de este módulo…" className="flex-1 bg-white" />
            <Button type="submit" variant="warning" className="sm:self-stretch">
              <Send size={16} /> Enviar
            </Button>
          </form>
        )}
        {lista.length === 0 ? (
          <p className="text-sm text-slate-500">Sin observaciones en este módulo.</p>
        ) : (
          <ul className="space-y-2">
            {lista.map((o) => (
              <li key={o.id} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2">
                <div className="flex-1">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{o.texto}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(o.fecha).toLocaleString("es-PE")} · {o.usuario}
                  </p>
                </div>
                {borra && (
                  <button onClick={() => eliminar(o.id)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Eliminar observación">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default ObservacionesGerencia;
