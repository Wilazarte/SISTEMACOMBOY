"use client";

import { useState } from "react";
import { Archive, CheckCircle2, Lock } from "lucide-react";
import { Button, Modal, ejecutarAsync } from "@/components/ui";
import { cerrarPlanilla, type FilaCierre } from "@/lib/historial";
import { fechaPE, r2, soles } from "@/lib/storage";

/**
 * Botón "Pagar planilla" (cierra la semana) de la pestaña principal.
 * Pide confirmación, guarda una COPIA de la planilla que se ve en pantalla y marca como DESCONTADOS
 * los adelantos que se descuentan, con el id de la planilla (todo o nada).
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
  const adelantos = r2(filas.reduce((a, f) => a + f.adelantos, 0));
  const nAdelantos = filas.reduce((a, f) => a + f.adelanto_ids.length, 0);
  const totalPagar = r2(filas.reduce((a, f) => a + f.total_pagar, 0));
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
    }, `Planilla ${periodo} pagada y guardada en el historial${nAdelantos ? ` · ${nAdelantos} adelanto(s) descontado(s)` : ""}`);
    setGuardando(false);
    if (ok) {
      setAbierto(false);
      onCerrado?.(id);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setAbierto(true)} disabled={filas.length === 0} title="Cierra la semana: guarda la planilla en el historial y descuenta los adelantos">
        <Archive size={16} /> Pagar planilla
      </Button>

      <Modal open={abierto} onClose={() => !guardando && setAbierto(false)} title="Pagar planilla y cerrar semana">
        <div className="space-y-4 text-sm">
          <p className="text-plomo-600">
            Se guardará una copia permanente de la planilla <b className="text-azul-900">{periodo}</b> tal como se ve ahora. Después no se podrá modificar ni borrar, aunque
            cambie la asistencia o los trabajadores.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-plomo-200 bg-plomo-50 p-3">
            <span className="text-plomo-500">Trabajadores</span>
            <b className="text-right">{filas.length}</b>
            <span className="text-plomo-500">Total horas</span>
            <b className="text-right">{horas.toLocaleString("es-PE", { maximumFractionDigits: 2 })}</b>
            <span className="text-plomo-500">Total bruto</span>
            <b className="text-right">{soles(bruto)}</b>
            <span className="text-plomo-500">Descuentos</span>
            <b className="text-right text-red-600">- {soles(descuento)}</b>
            <span className="text-plomo-500">Neto</span>
            <b className="text-right">{soles(neto)}</b>
            <span className="text-plomo-500">Adelantos descontados ({nAdelantos})</span>
            <b className="text-right text-red-600">- {soles(adelantos)}</b>
            <span className="font-semibold text-azul-900">Total a pagar</span>
            <b className="text-right text-azul-900">{soles(totalPagar)}</b>
            {rango?.desde && (
              <>
                <span className="text-plomo-500">Asistencia</span>
                <span className="text-right">
                  {fechaPE(rango.desde)} al {fechaPE(rango.hasta)}
                </span>
              </>
            )}
          </div>
          {nAdelantos > 0 && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
              Los {nAdelantos} adelanto(s) descontado(s) pasan a <b>DESCONTADO</b> y quedan vinculados a esta planilla.
            </p>
          )}
          {sinAsistencia > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              {sinAsistencia} trabajador(es) activo(s) sin asistencia: se guardan con 0 días y S/ 0.00.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
            <Button variant="secondary" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="warning" onClick={guardar} disabled={guardando}>
              <Lock size={16} /> {guardando ? "Guardando…" : "Pagar y cerrar semana"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
