"use client";

import { useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { Button, Modal, toast } from "@/components/ui";
import { cerrarPlanilla, type FilaCierre } from "@/lib/historial";
import { asientoPlanilla } from "@/lib/contable";
import { getSesion, rolNegocio } from "@/lib/auth";
import { esperarGuardado, fechaPE, r2, registrarEgresoPlanilla, soles } from "@/lib/storage";

const VERDE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * "💰 Pagar semana filtrada": paga solo los trabajadores del filtro (ej. sueldo diario) de la semana elegida.
 * Guarda la planilla en el historial como "<periodo> · <grupo>" (descuenta sus adelantos), registra el asiento
 * contable y el EGRESO en Tesorería (Facturas › gasto tipo Planilla, PAGADA).
 */
export function PagarSemanaFiltrada({
  periodo,
  grupo,
  etiqueta,
  filas,
  rango,
  yaPagado,
  onPagado,
}: {
  periodo: string;
  grupo: string; // DIARIO | MENSUAL | POR HORA | TODOS
  etiqueta: string; // "S/ Diario"
  filas: FilaCierre[];
  rango: { desde: string; hasta: string };
  yaPagado: boolean;
  onPagado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const total = r2(filas.reduce((a, f) => a + f.total_pagar, 0));
  const bruto = r2(filas.reduce((a, f) => a + f.bruto, 0));
  const afp = r2(filas.reduce((a, f) => a + f.descuento_afp, 0));
  const adelantos = r2(filas.reduce((a, f) => a + f.adelantos, 0));
  const periodoPago = `${periodo} · ${grupo}`;

  if (yaPagado)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700" title={`${periodoPago} ya está en el historial`}>
        <CheckCircle2 size={16} /> Semana pagada ({etiqueta})
      </span>
    );

  const pagar = async () => {
    setGuardando(true);
    let id = "";
    try {
      id = await cerrarPlanilla(periodoPago, filas, rango);
      asientoPlanilla({ id, periodo: periodoPago, bruto, descuento: afp, adelantos, pagado: total }, getSesion()?.usuario ?? "planilla");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo pagar la semana.", "error");
      setGuardando(false);
      return;
    }
    // La planilla ya quedó pagada: si el egreso no se guarda, se avisa sin deshacer el pago
    try {
      registrarEgresoPlanilla({ periodo, grupo, desde: rango.desde, hasta: rango.hasta, total, trabajadores: filas.length, historialId: id }, rolNegocio(getSesion()));
      const err = await esperarGuardado();
      if (err) throw new Error(err);
      toast(`Semana pagada: ${filas.length} trabajador(es) · ${soles(total)} · egreso registrado en Tesorería`, "ok");
    } catch (e) {
      toast(`Semana pagada (${soles(total)}), pero el egreso no se registró en Tesorería: ${(e as Error).message}. Ejecute supabase/egreso_planilla.sql en Supabase.`, "error");
    }
    setGuardando(false);
    setAbierto(false);
    onPagado?.();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={filas.length === 0 || !(total > 0)}
        title="Paga solo los trabajadores del filtro y registra el egreso en Tesorería"
        className={VERDE}
      >
        💰 Pagar semana filtrada ({filas.length} trabajadores) - {soles(total)}
      </button>

      <Modal open={abierto} onClose={() => !guardando && setAbierto(false)} title={`Pagar semana filtrada · ${etiqueta}`}>
        <div className="space-y-4 text-sm">
          <p className="text-plomo-600">
            Se pagará <b className="text-azul-900">{periodoPago}</b>
            {rango.desde && (
              <>
                {" "}
                (del {fechaPE(rango.desde)} al {fechaPE(rango.hasta)})
              </>
            )}
            : se guarda en el historial, se descuentan los adelantos y se registra un <b>EGRESO</b> en Tesorería.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-plomo-200 bg-plomo-50 p-3">
            <span className="text-plomo-500">Trabajadores</span>
            <b className="text-right">{filas.length}</b>
            <span className="text-plomo-500">Básico + H. extra</span>
            <b className="text-right">{soles(bruto)}</b>
            <span className="text-plomo-500">AFP / ONP</span>
            <b className="text-right text-red-600">- {soles(afp)}</b>
            <span className="text-plomo-500">Adelantos</span>
            <b className="text-right text-red-600">- {soles(adelantos)}</b>
            <span className="font-semibold text-azul-900">Total a pagar (egreso)</span>
            <b className="text-right text-azul-900">{soles(total)}</b>
          </div>
          <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
            <Button variant="secondary" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <button type="button" onClick={pagar} disabled={guardando} className={VERDE}>
              <Lock size={16} /> {guardando ? "Pagando…" : `Pagar ${soles(total)}`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
