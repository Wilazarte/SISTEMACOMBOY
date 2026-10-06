"use client";

import { RotateCcw } from "lucide-react";
import { cn, toast } from "@/components/ui";
import { ajustar, volverAlReloj, type ResultadoLiquidacion } from "@/lib/liquidacion";
import type { LiquidacionPeriodo } from "@/lib/types";

const h2 = (n: number) => Math.round(n * 100) / 100;
const txt = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

function Boton({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="min-w-[2.6rem] rounded-lg border border-plomo-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-corp hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Número editable: se guarda al salir del campo o con Enter (no en cada tecla). */
function Numero({ valor, entero, onGuardar, disabled, sufijo }: { valor: number; entero?: boolean; onGuardar: (n: number) => void; disabled?: boolean; sufijo: string }) {
  // Se muestra con 2 decimales (26.4814 h -> 26.48); el cálculo usa el valor exacto mientras no se edite
  const mostrado = entero ? valor : h2(valor);
  return (
    <label className="inline-flex items-center gap-1">
      <input
        key={mostrado}
        type="number"
        min={0}
        step={entero ? 1 : 0.25}
        defaultValue={mostrado}
        disabled={disabled}
        onBlur={(e) => {
          const n = entero ? parseInt(e.target.value) : parseFloat(e.target.value);
          if (!Number.isNaN(n) && n !== mostrado) onGuardar(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="w-16 rounded-lg border border-plomo-200 px-2 py-1.5 text-right text-sm font-semibold text-azul-900 disabled:bg-plomo-100"
      />
      <span className="text-xs text-plomo-500">{sufijo}</span>
    </label>
  );
}

/**
 * Días / horas a liquidar de un trabajador según el modo del periodo, con botones rápidos.
 * Los cambios son un ajuste manual sobre lo del reloj (el reloj no se modifica) y se pueden revertir.
 */
export function LiquidacionCelda({ periodo, trabajadorId, liq, r, editable }: { periodo: string; trabajadorId: string; liq: LiquidacionPeriodo; r: ResultadoLiquidacion; editable: boolean }) {
  // Sin aviso en cada clic (el total cambia a la vista); solo se avisan los errores
  const silencioso = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo actualizar.", "error");
    }
  };
  const set = (a: Parameters<typeof ajustar>[2]) => silencioso(() => ajustar(periodo, trabajadorId, a));
  const j = liq.horasJornada;
  return (
    <div className={cn("min-w-[170px] space-y-1.5 rounded-lg p-1", r.manual && "bg-amber-50 ring-1 ring-amber-300")}>
      {liq.modo !== "HORAS" && !r.porHora && (
        <div className="flex flex-wrap items-center gap-1">
          <Numero valor={r.dias} entero sufijo="días" disabled={!editable} onGuardar={(dias) => set({ dias })} />
          {editable && (
            <>
              <Boton onClick={() => set({ dias: Math.max(0, r.dias - 1) })} title="Quitar un día" disabled={r.dias <= 0}>
                −1 D
              </Boton>
              <Boton onClick={() => set({ dias: Math.min(31, r.dias + 1) })} title="Sumar un día">
                +1 D
              </Boton>
            </>
          )}
        </div>
      )}
      {(liq.modo === "HORAS" || r.porHora) && (
        <div className="flex flex-wrap items-center gap-1">
          <Numero valor={r.horas} sufijo="h" disabled={!editable} onGuardar={(horas) => set({ horas })} />
          {editable && (
            <>
              <Boton onClick={() => set({ horas: Math.max(0, h2(r.horas - 1)) })} title="Quitar una hora" disabled={r.horas <= 0}>
                −1 h
              </Boton>
              <Boton onClick={() => set({ horas: h2(r.horas + 1) })} title="Sumar una hora">
                +1 h
              </Boton>
              {!r.porHora && (
                <>
                  <Boton onClick={() => set({ horas: h2(r.horas + j) })} title={`Sumar una jornada completa (${j} h)`}>
                    +{txt(j)}h
                  </Boton>
                  <Boton onClick={() => set({ horas: h2(r.horas + j / 2) })} title={`Sumar media jornada (${txt(j / 2)} h)`}>
                    +{txt(j / 2)}h
                  </Boton>
                </>
              )}
            </>
          )}
        </div>
      )}
      {/* S/ por hora: horas extra solo manuales (S/ hora × horas extra), sin jornada */}
      {r.porHora && (
        <div className="flex flex-wrap items-center gap-1" data-horas-extra>
          <Numero valor={r.horasExtra} sufijo="h extra" disabled={!editable} onGuardar={(horasExtra) => set({ horasExtra })} />
          {editable && (
            <>
              <Boton onClick={() => set({ horasExtra: Math.max(0, h2(r.horasExtra - 1)) })} title="Quitar una hora extra" disabled={r.horasExtra <= 0}>
                −1 h
              </Boton>
              <Boton onClick={() => set({ horasExtra: h2(r.horasExtra + 1) })} title="Sumar una hora extra">
                +1 h
              </Boton>
              <Boton onClick={() => set({ horasExtra: h2(r.horasExtra + 2) })} title="Sumar 2 horas extra">
                +2 h
              </Boton>
            </>
          )}
        </div>
      )}
      {liq.modo === "DIAS_HORAS" && !r.porHora && (
        <div className="flex flex-wrap items-center gap-1">
          <Numero valor={r.horasExtra} sufijo="h extra" disabled={!editable} onGuardar={(horasExtra) => set({ horasExtra })} />
          {editable && (
            <>
              <Boton onClick={() => set({ horasExtra: Math.max(0, h2(r.horasExtra - 1)) })} title="Quitar una hora extra" disabled={r.horasExtra <= 0}>
                −1 h
              </Boton>
              <Boton onClick={() => set({ horasExtra: h2(r.horasExtra + 1) })} title="Sumar una hora extra">
                +1 h
              </Boton>
            </>
          )}
        </div>
      )}
      {r.manual && (
        <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-700">
          Ajuste manual
          {editable && (
            <button type="button" onClick={() => silencioso(() => volverAlReloj(periodo, trabajadorId))} className="inline-flex items-center gap-0.5 text-plomo-500 hover:text-azul-900" title="Volver a lo del reloj">
              <RotateCcw size={11} /> reloj
            </button>
          )}
        </div>
      )}
    </div>
  );
}
