"use client";

import { useState } from "react";
import { Archive, CheckCircle2, Lock } from "lucide-react";
import { Button, Modal, ejecutarAsync } from "@/components/ui";
import { cerrarPlanilla, type FilaCierre } from "@/lib/historial";
import { fechaPE, r2, soles } from "@/lib/storage";

/**
 * Botón "Cerrar semana y guardar en historial" de la pestaña principal.
 * Pide confirmación y guarda una COPIA de la planilla que se ve en pantalla (todo o nada).
 */
export function CerrarSemana({
  periodo,
  filas,
  rango,
  yaCerrado,
  onCerrado,
}: {
  periodo: string;
  filas: FilaCierre[];
  rango?: { desde: string; hasta: string };
  yaCerrado: boolean;
  onCerrado?: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const bruto = r2(filas.reduce((a, f) => a + f.bruto, 0));
  const descuento = r2(filas.reduce((a, f) => a + f.descuento_afp, 0));
  const neto = r2(filas.reduce((a, f) => a + f.neto, 0));
  const horas = r2(filas.reduce((a, f) => a + f.horas, 0));
  const sinAsistencia = filas.filter((f) => f.dias === 0).length;

  if (yaCerrado)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700" title="Este periodo ya está guardado en el historial">
        <CheckCircle2 size={16} /> Semana cerrada
      </span>
    );

  const guardar = async () => {
    setGuardando(true);
    let id = "";
    const ok = await ejecutarAsync(async () => {
      id = await cerrarPlanilla(periodo, filas, rango);
    }, `${periodo} guardado en el historial`);
    setGuardando(false);
    if (ok) {
      setAbierto(false);
      onCerrado?.(id);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setAbierto(true)} disabled={filas.length === 0} title="Guarda una copia permanente de esta planilla">
        <Archive size={16} /> Cerrar semana y guardar en historial
      </Button>

      <Modal open={abierto} onClose={() => !guardando && setAbierto(false)} title="Cerrar semana y guardar en historial">
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Se guardará una copia permanente de la planilla <b className="text-slate-900">{periodo}</b> tal como se ve ahora. Después no se podrá modificar ni borrar, aunque
            cambie la asistencia o los trabajadores.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500">Trabajadores</span>
            <b className="text-right">{filas.length}</b>
            <span className="text-slate-500">Total horas</span>
            <b className="text-right">{horas.toLocaleString("es-PE", { maximumFractionDigits: 2 })}</b>
            <span className="text-slate-500">Total bruto</span>
            <b className="text-right">{soles(bruto)}</b>
            <span className="text-slate-500">Descuentos</span>
            <b className="text-right text-red-600">- {soles(descuento)}</b>
            <span className="font-semibold text-slate-900">Total neto</span>
            <b className="text-right text-slate-900">{soles(neto)}</b>
            {rango?.desde && (
              <>
                <span className="text-slate-500">Asistencia</span>
                <span className="text-right">
                  {fechaPE(rango.desde)} al {fechaPE(rango.hasta)}
                </span>
              </>
            )}
          </div>
          {sinAsistencia > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              {sinAsistencia} trabajador(es) activo(s) sin asistencia: se guardan con 0 días y S/ 0.00.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="warning" onClick={guardar} disabled={guardando}>
              <Lock size={16} /> {guardando ? "Guardando…" : "Cerrar y guardar"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
