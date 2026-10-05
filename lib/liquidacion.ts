// Planilla › liquidación flexible por periodo: modo DÍAS / HORAS / DÍAS + HORAS.
// Los días y horas del reloj (asistencia) no se tocan: aquí se guarda un ajuste manual por trabajador,
// visible como "manual" y reversible ("Volver al reloj"). Se guarda en la tabla planilla (tipo 'liquidacion').

import { ErpError, KEYS, escribir, leer, normalizarPeriodo, r2 } from "./storage";
import type { AjusteLiquidacion, LiquidacionPeriodo, ModoLiquidacion } from "./types";

export const MODOS_LIQUIDACION: Record<ModoLiquidacion, { label: string; ayuda: string }> = {
  DIAS: { label: "Días", ayuda: "Básico = sueldo diario × días trabajados" },
  HORAS: { label: "Horas", ayuda: "Básico = sueldo por hora × horas trabajadas" },
  DIAS_HORAS: { label: "Días + horas extra", ayuda: "Básico = sueldo diario × días; extra = sueldo por hora × horas extra" },
};

export const HORAS_JORNADA = 8;

export const liquidacionVacia = (periodo: string): LiquidacionPeriodo => ({
  id: normalizarPeriodo(periodo),
  periodo: normalizarPeriodo(periodo),
  modo: "HORAS",
  horasJornada: HORAS_JORNADA,
  recargoExtra: 0,
  ajustes: {},
});

export const getLiquidaciones = () => leer<LiquidacionPeriodo[]>(KEYS.LIQUIDACIONES, []);

/** Configuración del periodo (si no existe, la de por defecto). */
export function liquidacionDe(lista: LiquidacionPeriodo[], periodo: string): LiquidacionPeriodo {
  const id = normalizarPeriodo(periodo);
  const l = lista.find((x) => x.id === id);
  return l ? { ...liquidacionVacia(periodo), ...l, ajustes: l.ajustes ?? {} } : liquidacionVacia(periodo);
}

function guardar(periodo: string, fn: (l: LiquidacionPeriodo) => LiquidacionPeriodo): void {
  const id = normalizarPeriodo(periodo);
  if (!id) throw new ErpError("Indique el periodo.");
  const lista = getLiquidaciones();
  const nuevo = fn(liquidacionDe(lista, periodo));
  const i = lista.findIndex((x) => x.id === id);
  if (i >= 0) lista[i] = nuevo;
  else lista.push(nuevo);
  escribir(KEYS.LIQUIDACIONES, lista);
}

export function cambiarModo(periodo: string, modo: ModoLiquidacion): void {
  if (!(modo in MODOS_LIQUIDACION)) throw new ErpError("Modo inválido.");
  guardar(periodo, (l) => ({ ...l, modo }));
}

export function cambiarConfig(periodo: string, cfg: { horasJornada?: number; recargoExtra?: number }): void {
  if (cfg.horasJornada !== undefined && !(cfg.horasJornada >= 1 && cfg.horasJornada <= 24)) throw new ErpError("La jornada debe estar entre 1 y 24 horas.");
  if (cfg.recargoExtra !== undefined && !(cfg.recargoExtra >= 0 && cfg.recargoExtra <= 200)) throw new ErpError("El recargo debe estar entre 0 % y 200 %.");
  guardar(periodo, (l) => ({ ...l, ...cfg }));
}

/** Ajuste manual de un trabajador (valores finales, no incrementos). */
export function ajustar(periodo: string, trabajadorId: string, ajuste: AjusteLiquidacion): void {
  const a: AjusteLiquidacion = {};
  if (ajuste.dias !== undefined) {
    if (!Number.isInteger(ajuste.dias) || ajuste.dias < 0 || ajuste.dias > 31) throw new ErpError("Los días deben ser un entero entre 0 y 31.");
    a.dias = ajuste.dias;
  }
  if (ajuste.horas !== undefined) {
    if (!(ajuste.horas >= 0 && ajuste.horas <= 744)) throw new ErpError("Las horas deben estar entre 0 y 744.");
    a.horas = r2(ajuste.horas);
  }
  if (ajuste.horasExtra !== undefined) {
    if (!(ajuste.horasExtra >= 0 && ajuste.horasExtra <= 300)) throw new ErpError("Las horas extra deben estar entre 0 y 300.");
    a.horasExtra = r2(ajuste.horasExtra);
  }
  guardar(periodo, (l) => ({ ...l, ajustes: { ...l.ajustes, [trabajadorId]: { ...l.ajustes[trabajadorId], ...a } } }));
}

/** Quita el ajuste: vuelve a lo del reloj. */
export function volverAlReloj(periodo: string, trabajadorId: string): void {
  guardar(periodo, (l) => {
    const ajustes = { ...l.ajustes };
    delete ajustes[trabajadorId];
    return { ...l, ajustes };
  });
}

// ---------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------

export interface ResultadoLiquidacion {
  modo: ModoLiquidacion;
  dias: number;
  horas: number;
  horasExtra: number;
  sueldoDiario: number;
  sueldoHora: number;
  basico: number;
  montoExtra: number;
  bruto: number;
  manual: boolean; // tiene ajuste manual
}

/**
 * sueldo_diario = sueldo / divisor del tipo (MENSUAL 26, QUINCENAL 13, SEMANAL 6, DIARIO 1)
 * sueldo_hora = sueldo_diario / horas de jornada (8)
 * DÍAS: básico = diario × días · HORAS: básico = hora × horas · DÍAS + HORAS: básico = diario × días; extra = hora × (1 + recargo) × horas extra
 */
export function liquidar(
  sueldo: number,
  divisor: number,
  reloj: { dias: number; horas: number },
  cfg: Pick<LiquidacionPeriodo, "modo" | "horasJornada" | "recargoExtra">,
  ajuste?: AjusteLiquidacion
): ResultadoLiquidacion {
  const jornada = cfg.horasJornada > 0 ? cfg.horasJornada : HORAS_JORNADA;
  const sueldoDiario = sueldo / (divisor > 0 ? divisor : 1);
  const sueldoHora = sueldoDiario / jornada;
  const dias = ajuste?.dias ?? reloj.dias;
  const horas = ajuste?.horas ?? reloj.horas;
  // Sin ajuste: horas extra = lo que pasa de la jornada en los días marcados
  const horasExtra = ajuste?.horasExtra ?? r2(Math.max(0, reloj.horas - reloj.dias * jornada));
  let basico = 0;
  let montoExtra = 0;
  if (cfg.modo === "DIAS") basico = sueldoDiario * dias;
  else if (cfg.modo === "HORAS") basico = sueldoHora * horas;
  else {
    basico = sueldoDiario * dias;
    montoExtra = sueldoHora * (1 + (cfg.recargoExtra || 0) / 100) * horasExtra;
  }
  basico = r2(basico);
  montoExtra = r2(montoExtra);
  const usados: (keyof AjusteLiquidacion)[] = cfg.modo === "DIAS" ? ["dias"] : cfg.modo === "HORAS" ? ["horas"] : ["dias", "horasExtra"];
  return {
    modo: cfg.modo,
    dias,
    horas: cfg.modo === "HORAS" ? horas : cfg.modo === "DIAS" ? r2(dias * jornada) : r2(dias * jornada + horasExtra),
    horasExtra: cfg.modo === "DIAS_HORAS" ? horasExtra : 0,
    sueldoDiario,
    sueldoHora,
    basico,
    montoExtra,
    bruto: r2(basico + montoExtra),
    manual: !!ajuste && usados.some((k) => ajuste[k] !== undefined),
  };
}
