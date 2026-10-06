"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button, Input, Modal, cn, ejecutar } from "@/components/ui";
import { guardarListaSemana } from "@/lib/listaSemana";
import { getSesion } from "@/lib/auth";

export interface FilaLista {
  id: string;
  nombre: string;
  tipo: string; // "S/ Diario"
  horas: number;
  tieneAsistencia: boolean;
  marcado: boolean;
  pagado: boolean;
}

/**
 * "✏️ Editar lista manual": a quién se paga esta semana.
 * Los que tienen asistencia vienen marcados; se puede agregar a quien no marcó o quitar a quien está de vacaciones.
 */
export function EditarListaSemana({ periodo, filas, onClose }: { periodo: string; filas: FilaLista[]; onClose: () => void }) {
  const [marcados, setMarcados] = useState(() => new Set(filas.filter((f) => f.marcado).map((f) => f.id)));
  const [buscar, setBuscar] = useState("");
  const q = buscar.trim().toUpperCase();
  const lista = filas.filter((f) => !q || f.nombre.includes(q) || f.id === q);
  const cambiar = (id: string, v: boolean) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  const guardar = () => {
    const ok = ejecutar(
      () =>
        guardarListaSemana(
          periodo,
          [...marcados],
          filas.filter((f) => f.tieneAsistencia).map((f) => f.id),
          getSesion()?.usuario ?? "planilla"
        ),
      `Lista de pago guardada: ${marcados.size} trabajador(es)`
    );
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Editar lista manual · ${periodo}`} wide>
      <div className="space-y-3 text-sm">
        <p className="text-plomo-600">
          Marque a quién se paga esta semana. Los que tienen asistencia vienen marcados; puede agregar a quien no marcó (queda con ✏️) o quitar a quien no
          corresponde (ej. vacaciones).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre o N°…" className="w-60" />
          <Button variant="secondary" size="sm" onClick={() => setMarcados(new Set(filas.filter((f) => f.tieneAsistencia).map((f) => f.id)))}>
            <RotateCcw size={14} /> Solo los que tienen asistencia
          </Button>
          <span className="ml-auto text-xs text-plomo-500">
            {marcados.size} de {filas.length} marcados
          </span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-plomo-200">
          {lista.map((f) => (
            <label
              key={f.id}
              data-lista={f.id}
              className={cn("flex cursor-pointer items-center gap-3 border-b border-plomo-100 px-3 py-2 last:border-0 hover:bg-plomo-50", f.pagado && "cursor-not-allowed opacity-60")}
            >
              <input type="checkbox" className="h-4 w-4 accent-[#0f2238]" checked={marcados.has(f.id)} disabled={f.pagado} onChange={(e) => cambiar(f.id, e.target.checked)} />
              <span className="w-10 font-mono text-xs text-slate-400">{f.id}</span>
              <span className="flex-1 font-semibold text-azul-900">{f.nombre}</span>
              <span className="w-24 text-xs text-plomo-500">{f.tipo}</span>
              {f.tieneAsistencia ? (
                <span className="w-28 text-xs text-emerald-700">✅ {f.horas.toLocaleString("es-PE", { maximumFractionDigits: 2 })} h</span>
              ) : (
                <span className="w-28 text-xs text-amber-700">Sin asistencia</span>
              )}
              {f.pagado && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">PAGADO</span>}
            </label>
          ))}
          {lista.length === 0 && <p className="p-4 text-center text-plomo-500">Ningún trabajador coincide.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar}>
            <Save size={16} /> Guardar lista
          </Button>
        </div>
      </div>
    </Modal>
  );
}

