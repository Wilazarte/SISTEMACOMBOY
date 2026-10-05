"use client";

// =====================================================================
// CONTABLE — Libro Diario, Mayor, Balance de comprobación y EEFF.
// Asientos automáticos (tabla contable, tipo ASIENTO_DIARIO):
//   Aprobar NP     -> DEBE 1212 Clientes            HABER 70121 Ventas + 40111 IGV
//   Emitir OC      -> DEBE 6011 Compras + 40111 IGV HABER 4212 Proveedores
//   Pagar planilla -> DEBE 6211 Remuneraciones      HABER 1011 Caja (+ 4032 AFP/ONP y 1412 adelantos)
// También se leen los asientos que Ventas ya generaba (comprobantes y cobros, tabla ventas).
// Ids fijos por origen (NP-<id>, OC-<id>, PLA-<id>): generar dos veces no duplica.
// =====================================================================

import { ErpError, KEYS, escribir, hoy, leer, r2, tablaDisponible } from "./storage";
import type { AsientoContable } from "./types";

export type OrigenAsiento = "NP" | "OC" | "PLANILLA" | "VENTA" | "MANUAL";

export interface LineaAsiento {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
}

export interface AsientoDiario {
  id: string;
  fecha: string; // YYYY-MM-DD
  periodo: string; // YYYY-MM
  glosa: string;
  origen: { tipo: OrigenAsiento; id: string; numero: string };
  lineas: LineaAsiento[];
  /** Asiento que este revierte (anulación). */
  revierte?: string;
  usuario: string;
  creado: string;
}

export interface CuentaPlan {
  id: string; // = código
  codigo: string;
  nombre: string;
}

export interface CierreMensual {
  id: string; // = periodo
  periodo: string;
  fecha: string;
  usuario: string;
  asientos: number;
  totalDebe: number;
  totalHaber: number;
  resultado: number;
}

/** Plan contable (PCGE) de las cuentas que usa el ERP. Se puede ampliar en la tabla (tipo PLAN_CUENTAS). */
export const PLAN_PCGE: CuentaPlan[] = [
  ["1011", "Caja"],
  ["1041", "Cuentas corrientes operativas"],
  ["1212", "Cuentas por cobrar comerciales - Emitidas en cartera (Clientes)"],
  ["1412", "Adelanto de remuneraciones"],
  ["40111", "IGV - Cuenta propia"],
  ["4032", "AFP / ONP por pagar"],
  ["4212", "Cuentas por pagar comerciales - Facturas emitidas (Proveedores)"],
  ["6011", "Compras - Mercaderías"],
  ["6211", "Remuneraciones - Sueldos y salarios"],
  ["70121", "Ventas - Mercaderías"],
].map(([codigo, nombre]) => ({ id: codigo, codigo, nombre }));

export const CLASES: Record<string, string> = {
  "1": "Activo disponible y exigible",
  "2": "Activo realizable",
  "3": "Activo inmovilizado",
  "4": "Pasivo",
  "5": "Patrimonio",
  "6": "Gastos por naturaleza",
  "7": "Ingresos",
};

export const getAsientosDiario = () => leer<AsientoDiario[]>(KEYS.CONTABLE_ASIENTOS, []);
export const getCierres = () => leer<CierreMensual[]>(KEYS.CONTABLE_CIERRES, []);
export const getPlanCuentas = (): CuentaPlan[] => {
  const propio = leer<CuentaPlan[]>(KEYS.CONTABLE_PLAN, []);
  const codigos = new Set(propio.map((c) => c.codigo));
  return [...propio, ...PLAN_PCGE.filter((c) => !codigos.has(c.codigo))].sort((a, b) => a.codigo.localeCompare(b.codigo));
};
export const nombreCuenta = (codigo: string, plan = getPlanCuentas()) => plan.find((c) => c.codigo === codigo)?.nombre ?? codigo;

const cuadra = (l: LineaAsiento[]) => Math.abs(r2(l.reduce((a, x) => a + x.debe - x.haber, 0))) < 0.01;
const linea = (cuenta: string, debe: number, haber: number): LineaAsiento => ({ cuenta, nombre: nombreCuenta(cuenta, PLAN_PCGE), debe: r2(debe), haber: r2(haber) });

/** Asiento activo (no revertido) de un origen. */
export function asientoDe(tipo: OrigenAsiento, id: string, lista = getAsientosDiario()): AsientoDiario | undefined {
  const a = lista.find((x) => x.origen.tipo === tipo && x.origen.id === id && !x.revierte);
  return a && !lista.some((x) => x.revierte === a.id) ? a : undefined;
}

/** true si el id corresponde a un asiento de la tabla contable (no de Ventas). */
export const esAsientoContable = (id?: string) => !!id && getAsientosDiario().some((a) => a.id === id);

function registrar(a: Omit<AsientoDiario, "periodo" | "creado">): AsientoDiario | null {
  if (!tablaDisponible("contable")) return null; // falta contable_tables.sql: no se bloquea la operación
  const lineas = a.lineas.filter((l) => l.debe > 0 || l.haber > 0);
  if (!cuadra(lineas)) throw new ErpError(`Asiento descuadrado: ${a.glosa}`);
  const lista = getAsientosDiario();
  if (lista.some((x) => x.id === a.id)) return null; // ya generado
  const nuevo: AsientoDiario = { ...a, lineas, periodo: a.fecha.slice(0, 7), creado: new Date().toISOString() };
  escribir(KEYS.CONTABLE_ASIENTOS, [nuevo, ...lista]);
  return nuevo;
}

/** Aprobar NP: DEBE 1212 Clientes / HABER 70121 Ventas + 40111 IGV. */
export function asientoNotaPedido(
  np: { id: string; numero: string; cliente: string; subtotal: number; igv: number; total: number },
  usuario: string,
  fecha = hoy()
): AsientoDiario | null {
  return registrar({
    id: `NP-${np.id}`,
    fecha,
    glosa: `Venta aprobada ${np.numero} · ${np.cliente}`,
    origen: { tipo: "NP", id: np.id, numero: np.numero },
    lineas: [linea("1212", np.total, 0), linea("70121", 0, np.subtotal), linea("40111", 0, np.igv)],
    usuario,
  });
}

/** Factura de una NP con otro importe: asiento por la diferencia (para no duplicar la venta). */
export function asientoAjusteVenta(
  np: { id: string; numero: string; subtotal: number; igv: number; total: number },
  c: { id: string; numero: string; base: number; igv: number; total: number },
  usuario: string
): AsientoDiario | null {
  const dT = r2(c.total - np.total);
  const dB = r2(c.base - np.subtotal);
  const dI = r2(c.igv - np.igv);
  if (!dT && !dB && !dI) return null;
  const lado = (cuenta: string, monto: number, deudora: boolean) => (deudora === monto >= 0 ? linea(cuenta, Math.abs(monto), 0) : linea(cuenta, 0, Math.abs(monto)));
  return registrar({
    id: `NPAJ-${c.id}`,
    fecha: hoy(),
    glosa: `Ajuste ${c.numero} vs ${np.numero} (diferencia de importe)`,
    origen: { tipo: "NP", id: np.id, numero: np.numero },
    lineas: [lado("1212", dT, true), lado("70121", dB, false), lado("40111", dI, false)],
    usuario,
  });
}

/** Emitir OC: DEBE 6011 Compras + 40111 IGV / HABER 4212 Proveedores. */
export function asientoOrdenCompra(
  oc: { id: string; numero: string; proveedor: string; fecha: string; subtotal: number; igv: number; total: number },
  usuario: string,
  fecha = hoy()
): AsientoDiario | null {
  return registrar({
    id: `OC-${oc.id}`,
    fecha,
    glosa: `Compra ${oc.numero} · ${oc.proveedor}`,
    origen: { tipo: "OC", id: oc.id, numero: oc.numero },
    lineas: [linea("6011", oc.subtotal, 0), linea("40111", oc.igv, 0), linea("4212", 0, oc.total)],
    usuario,
  });
}

/** Pagar planilla: DEBE 6211 Remuneraciones (bruto) / HABER 4032 AFP-ONP + 1412 adelantos + 1011 Caja (pagado). */
export function asientoPlanilla(
  p: { id: string; periodo: string; bruto: number; descuento: number; adelantos: number; pagado: number },
  usuario: string,
  fecha = hoy()
): AsientoDiario | null {
  const caja = r2(p.bruto - p.descuento - p.adelantos); // el pagado, cuadrado al céntimo
  return registrar({
    id: `PLA-${p.id}`,
    fecha,
    glosa: `Pago de planilla ${p.periodo}${Math.abs(caja - p.pagado) > 0.01 ? ` (pagado S/ ${p.pagado.toFixed(2)})` : ""}`,
    origen: { tipo: "PLANILLA", id: p.id, numero: p.periodo },
    lineas: [linea("6211", p.bruto, 0), linea("4032", 0, p.descuento), linea("1412", 0, p.adelantos), linea("1011", 0, caja)],
    usuario,
  });
}

/** Anulación: asiento inverso del activo de ese origen. */
export function revertirAsiento(tipo: OrigenAsiento, id: string, motivo: string, usuario: string): AsientoDiario | null {
  const a = asientoDe(tipo, id);
  if (!a) return null;
  return registrar({
    id: `${a.id}-R`,
    fecha: hoy(),
    glosa: `Anulación: ${a.glosa}${motivo ? ` · ${motivo}` : ""}`,
    origen: a.origen,
    lineas: a.lineas.map((l) => ({ ...l, debe: l.haber, haber: l.debe })),
    revierte: a.id,
    usuario,
  });
}

/** Revierte un asiento concreto por id (p. ej. el ajuste de una factura anulada). */
export function revertirAsientoId(id: string, motivo: string, usuario: string): AsientoDiario | null {
  const lista = getAsientosDiario();
  const a = lista.find((x) => x.id === id);
  if (!a || lista.some((x) => x.revierte === id)) return null;
  return registrar({
    id: `${a.id}-R`,
    fecha: hoy(),
    glosa: `Anulación: ${a.glosa}${motivo ? ` · ${motivo}` : ""}`,
    origen: a.origen,
    lineas: a.lineas.map((l) => ({ ...l, debe: l.haber, haber: l.debe })),
    revierte: a.id,
    usuario,
  });
}

/** Asientos de Ventas (comprobantes / cobros, tabla ventas) en el mismo formato. */
function asientosVentas(): AsientoDiario[] {
  return leer<AsientoContable[]>(KEYS.ASIENTOS, []).map((a) => ({
    id: a.id,
    fecha: a.fecha,
    periodo: a.fecha.slice(0, 7),
    glosa: a.glosa,
    origen: { tipo: "VENTA" as const, id: a.comprobanteId, numero: a.glosa.split(" · ")[0] },
    lineas: a.lineas,
    usuario: "Ventas",
    creado: a.fecha,
  }));
}

/** Libro Diario: contable + ventas, ordenado por fecha. */
export function libroDiario(): AsientoDiario[] {
  return [...getAsientosDiario(), ...asientosVentas()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado));
}

export interface Filtro {
  anio: number;
  mes: number | null; // 1..12, null = todo el año
}

export const enPeriodo = (a: AsientoDiario, f: Filtro) =>
  a.fecha.slice(0, 4) === String(f.anio) && (f.mes === null || Number(a.fecha.slice(5, 7)) === f.mes);

/** Hasta el fin del periodo (saldos acumulados del año para Balance y EEFF). */
export const hastaPeriodo = (a: AsientoDiario, f: Filtro) =>
  a.fecha.slice(0, 4) === String(f.anio) && (f.mes === null || Number(a.fecha.slice(5, 7)) <= f.mes);

export interface CuentaMayor {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
  saldo: number; // debe - haber
  movimientos: { fecha: string; glosa: string; origen: string; debe: number; haber: number; saldo: number }[];
}

export function libroMayor(asientos: AsientoDiario[]): CuentaMayor[] {
  const plan = getPlanCuentas();
  const m = new Map<string, CuentaMayor>();
  for (const a of asientos)
    for (const l of a.lineas) {
      const c = m.get(l.cuenta) ?? { cuenta: l.cuenta, nombre: nombreCuenta(l.cuenta, plan) || l.nombre, debe: 0, haber: 0, saldo: 0, movimientos: [] };
      c.debe = r2(c.debe + l.debe);
      c.haber = r2(c.haber + l.haber);
      c.saldo = r2(c.debe - c.haber);
      c.movimientos.push({ fecha: a.fecha, glosa: a.glosa, origen: a.origen.numero, debe: l.debe, haber: l.haber, saldo: c.saldo });
      m.set(l.cuenta, c);
    }
  return [...m.values()].sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

export function balanceComprobacion(asientos: AsientoDiario[]) {
  const cuentas = libroMayor(asientos).map((c) => ({ ...c, deudor: c.saldo > 0 ? c.saldo : 0, acreedor: c.saldo < 0 ? -c.saldo : 0 }));
  const t = (k: "debe" | "haber" | "deudor" | "acreedor") => r2(cuentas.reduce((a, c) => a + c[k], 0));
  return { cuentas, totales: { debe: t("debe"), haber: t("haber"), deudor: t("deudor"), acreedor: t("acreedor") } };
}

/** Estados financieros simplificados por clase de cuenta (PCGE). */
export function estadosFinancieros(asientos: AsientoDiario[]) {
  const cuentas = libroMayor(asientos);
  const clase = (c: CuentaMayor) => c.cuenta[0];
  const de = (cl: string[]) => cuentas.filter((c) => cl.includes(clase(c)));
  const ingresos = de(["7"]).map((c) => ({ ...c, monto: r2(c.haber - c.debe) }));
  const gastos = de(["6"]).map((c) => ({ ...c, monto: r2(c.debe - c.haber) }));
  const totalIngresos = r2(ingresos.reduce((a, c) => a + c.monto, 0));
  const totalGastos = r2(gastos.reduce((a, c) => a + c.monto, 0));
  const resultado = r2(totalIngresos - totalGastos);
  const activo = de(["1", "2", "3"]).map((c) => ({ ...c, monto: c.saldo }));
  const pasivo = de(["4"]).map((c) => ({ ...c, monto: r2(-c.saldo) }));
  const patrimonio = de(["5"]).map((c) => ({ ...c, monto: r2(-c.saldo) }));
  const suma = (x: { monto: number }[]) => r2(x.reduce((a, c) => a + c.monto, 0));
  return {
    resultados: { ingresos, gastos, totalIngresos, totalGastos, resultado },
    situacion: {
      activo,
      pasivo,
      patrimonio,
      totalActivo: suma(activo),
      totalPasivo: suma(pasivo),
      totalPatrimonio: r2(suma(patrimonio) + resultado),
      resultado,
    },
  };
}

/** Cierre mensual: guarda los totales del mes (no borra ni bloquea asientos). */
export function cerrarMes(periodo: string, usuario: string): CierreMensual {
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new ErpError("Seleccione un mes para cerrar.");
  if (!tablaDisponible("contable")) throw new ErpError("Falta la tabla contable: ejecute supabase/contable_tables.sql.");
  const lista = getCierres();
  if (lista.some((c) => c.periodo === periodo)) throw new ErpError(`El mes ${periodo} ya está cerrado.`);
  const [anio, mes] = periodo.split("-").map(Number);
  const del = libroDiario().filter((a) => enPeriodo(a, { anio, mes }));
  if (del.length === 0) throw new ErpError(`No hay asientos en ${periodo}.`);
  const b = balanceComprobacion(del);
  const cierre: CierreMensual = {
    id: periodo,
    periodo,
    fecha: new Date().toISOString(),
    usuario,
    asientos: del.length,
    totalDebe: b.totales.debe,
    totalHaber: b.totales.haber,
    resultado: estadosFinancieros(del).resultados.resultado,
  };
  escribir(KEYS.CONTABLE_CIERRES, [cierre, ...lista]);
  return cierre;
}

export function reabrirMes(periodo: string): void {
  escribir(KEYS.CONTABLE_CIERRES, getCierres().filter((c) => c.periodo !== periodo));
}
