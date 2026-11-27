"use client";

// =====================================================================
// FINANZAS › CONTABILIDAD: Flujo de caja, Estados financieros y Ratios (Williams, 2026-11-27).
//
// Todo se calcula de los documentos que ya registra el ERP (no hay un segundo registro que se pueda descuadrar):
//   - Cobros a clientes (ventas_cobros), gastos y facturas pagadas (facturas), compras directas, adelantos de sueldo,
//     movimientos manuales de caja (Estados de cuenta) -> Flujo de caja (método directo, NIC 7).
//   - Comprobantes emitidos y NP aprobadas -> Ventas; facturas de OC y compras -> Compras; kardex + stock -> Inventarios;
//     registro de activos -> Propiedades, planta y equipo y depreciación; planilla cerrada -> Gastos de personal.
// Lo que el ERP no registra (capital, saldos de apertura, préstamos anteriores, gastos financieros…) se ingresa
// en "Datos de apertura y ajustes" (tabla contable, tipo DATOS_EEFF, un registro por año). Sin esos datos el
// Estado de Situación muestra la "Diferencia por conciliar" en lugar de inventar cifras.
// =====================================================================

import type { Adelanto } from "./adelantos";
import { depreciacion, type Activo } from "./activos";
import { nombreCaja } from "./cajas";
import type { HistorialPlanilla } from "./historial";
import { KEYS, escribir, hoy, leer, r2 } from "./storage";
import type { CobroVenta, Compra, ComprobanteVenta, Factura, MovimientoCajaManual, MovimientoKardex, NotaPedido, StockItem, TipoGasto } from "./types";

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

// ------------------------------------------------------------------ Datos de apertura y ajustes (por año)

export type TipoAjuste = "OTRO_INGRESO" | "GASTO_FINANCIERO" | "OTRO_GASTO";
export const TIPOS_AJUSTE: { id: TipoAjuste; nombre: string }[] = [
  { id: "OTRO_INGRESO", nombre: "Otros ingresos (intereses ganados, venta de activos, diferencia de cambio…)" },
  { id: "GASTO_FINANCIERO", nombre: "Gastos financieros (intereses, comisiones bancarias, ITF)" },
  { id: "OTRO_GASTO", nombre: "Otros gastos (multas, pérdidas, gastos no deducibles)" },
];

export interface AjusteEEFF {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoAjuste;
  concepto: string;
  monto: number;
}

export type RegimenIR = "GENERAL" | "MYPE";

export interface DatosEEFF {
  id: string; // = año ("2026")
  anio: number;
  /** Saldos al 1 de enero. null = calcular con los registros del ERP. */
  efectivoInicial: number | null;
  inventarioInicial: number | null;
  prestamosInicial: number | null;
  resultadosAcumulados: number | null;
  capitalSocial: number;
  otrasCxC: number;
  otrosActivosCorrientes: number;
  otrosActivosNoCorrientes: number;
  otrasCxP: number;
  pasivoNoCorriente: number;
  /** Impuesto a la renta. */
  regimen: RegimenIR;
  uit: number;
  ajustes: AjusteEEFF[];
  notas: string;
  usuario: string;
  actualizado: string;
}

export const UIT_DEFECTO = 5500;

export const datosVacios = (anio: number): DatosEEFF => ({
  id: String(anio),
  anio,
  efectivoInicial: null,
  inventarioInicial: null,
  prestamosInicial: null,
  resultadosAcumulados: null,
  capitalSocial: 0,
  otrasCxC: 0,
  otrosActivosCorrientes: 0,
  otrosActivosNoCorrientes: 0,
  otrasCxP: 0,
  pasivoNoCorriente: 0,
  regimen: "GENERAL",
  uit: UIT_DEFECTO,
  ajustes: [],
  notas: "",
  usuario: "",
  actualizado: "",
});

export const getDatosEEFF = (): DatosEEFF[] => leer<DatosEEFF[]>(KEYS.CONTABLE_DATOS_EEFF, []);

export function datosDelAnio(anio: number, lista: DatosEEFF[] = getDatosEEFF()): DatosEEFF {
  const d = lista.find((x) => x.id === String(anio));
  return d ? { ...datosVacios(anio), ...d, ajustes: d.ajustes ?? [] } : datosVacios(anio);
}

export function guardarDatosEEFF(d: DatosEEFF, usuario: string): DatosEEFF {
  const limpio: DatosEEFF = {
    ...d,
    id: String(d.anio),
    ajustes: d.ajustes.filter((a) => a.concepto.trim() && Number(a.monto) > 0).map((a) => ({ ...a, concepto: a.concepto.trim(), monto: r2(Number(a.monto)) })),
    usuario,
    actualizado: new Date().toISOString(),
  };
  escribir(KEYS.CONTABLE_DATOS_EEFF, [limpio, ...getDatosEEFF().filter((x) => x.id !== limpio.id)]);
  return limpio;
}

/** Impuesto a la renta estimado sobre la utilidad antes de impuestos (0 si hay pérdida). */
export function impuestoRenta(base: number, d: Pick<DatosEEFF, "regimen" | "uit">): number {
  if (base <= 0) return 0;
  if (d.regimen === "MYPE") {
    const tramo = 15 * (d.uit || UIT_DEFECTO);
    return r2(Math.min(base, tramo) * 0.1 + Math.max(0, base - tramo) * 0.295);
  }
  return r2(base * 0.295);
}

// ------------------------------------------------------------------ Fuentes

export interface FuentesEEFF {
  facturas: Factura[];
  compras: Compra[];
  adelantos: Adelanto[];
  manuales: MovimientoCajaManual[];
  cobros: CobroVenta[];
  notas: NotaPedido[];
  comprobantes: ComprobanteVenta[];
  stock: StockItem[];
  kardex: MovimientoKardex[];
  activos: Activo[];
  /** null = no se pudo leer la planilla (sin permiso): se usan los pagos de planilla. */
  planilla: HistorialPlanilla[] | null;
  datos: DatosEEFF[];
}

const dia = (f?: string | null) => String(f ?? "").slice(0, 10);
const suma = <T,>(l: T[], f: (x: T) => number) => r2(l.reduce((a, x) => a + (Number(f(x)) || 0), 0));
const finDeMes = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;
const diaAnterior = (f: string) => {
  const d = new Date(`${f}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
const norm = (s?: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

export interface Periodo {
  anio: number;
  mes: number | null;
}
export const rangoPeriodo = (p: Periodo): { desde: string; hasta: string } =>
  p.mes ? { desde: `${p.anio}-${String(p.mes).padStart(2, "0")}-01`, hasta: finDeMes(p.anio, p.mes) } : { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` };
export const nombrePeriodo = (p: Periodo) => (p.mes ? `${MESES[p.mes - 1]} ${p.anio}` : `Año ${p.anio}`);

// ------------------------------------------------------------------ Flujo de caja

export type Actividad = "OPERACION" | "INVERSION" | "FINANCIAMIENTO" | "APERTURA";

export interface MovFlujo {
  id: string;
  fecha: string;
  actividad: Actividad;
  rubro: string;
  concepto: string;
  documento: string;
  tercero: string;
  caja: string;
  /** + ingreso / − egreso */
  monto: number;
}

/** Fuentes que son dinero de la empresa. PRÉSTAMO y CRÉDITO no mueven efectivo: el tercero pagó o queda la deuda. */
const CAJAS_EFECTIVO = ["CAJA GENERAL", "CAJA CHICA", "FONDO DE RESERVA", "OTROS"];
export type TipoFuente = "EFECTIVO" | "PRESTAMO" | "CREDITO";
export function tipoFuente(caja?: string | null): TipoFuente {
  const n = nombreCaja(caja);
  if (n === "PRÉSTAMO") return "PRESTAMO";
  if (n === "CRÉDITO") return "CREDITO";
  return "EFECTIVO";
}
const cajaEfectivo = (caja?: string | null): string => {
  const n = nombreCaja(caja);
  if (n && CAJAS_EFECTIVO.includes(n)) return n;
  const t = norm(caja);
  if (/CHICA/.test(t)) return "CAJA CHICA";
  if (/RESERVA/.test(t)) return "FONDO DE RESERVA";
  if (!t.trim()) return "SIN CAJA INDICADA";
  return "CAJA GENERAL";
};

export const RUBRO_GASTO: Record<TipoGasto | "SIN_TIPO", string> = {
  REPRESENTACION: "Gastos de representación",
  SERVICIO_BASICO: "Servicios básicos (luz, agua, internet, teléfono)",
  TRANSPORTE: "Transporte y fletes",
  COMPRA_SIN_REQ: "Compras sin requerimiento",
  SERV_PROFESIONALES: "Honorarios y servicios profesionales",
  SERV_TERCEROS: "Servicios de terceros",
  MANO_OBRA: "Mano de obra de terceros",
  ALQUILER: "Alquileres",
  MANTENIMIENTO: "Mantenimiento y reparaciones",
  OTROS: "Otros gastos",
  PLANILLA: "Remuneraciones y adelantos al personal",
  SIN_TIPO: "Otros gastos",
};

const RUBRO_COBRANZA = "Cobranza a clientes";
const RUBRO_PROVEEDORES = "Pago a proveedores (mercadería y materiales)";
const RUBRO_SERVICIOS_OS = "Pago de órdenes de servicio";
const RUBRO_ACTIVO = "Compra de propiedades, planta y equipo";

/** Fecha en que se marcó pagada (historial); si no está, la del documento. */
const fechaPagoFactura = (f: Factura): string => dia([...(f.historial ?? [])].reverse().find((e) => /PAGADA/i.test(e.accion))?.fecha) || dia(f.bancarizacion?.fecha) || dia(f.fecha);
const compraPagada = (c: Compra) => c.pago?.estado !== "PENDIENTE";
const fechaPagoCompra = (c: Compra) => dia(c.pago?.bancarizacion?.fecha) || dia(c.fecha);

/** Comprobantes de compra registrados como activo fijo (Activos › comprobante), para llevarlos a Inversión. */
const comprobantesActivo = (activos: Activo[]) => new Set(activos.map((a) => norm(a.comprobante).replace(/\s+/g, "")).filter((x) => x.length > 3));

function clasificarManual(m: MovimientoCajaManual): { actividad: Actividad; rubro: string } {
  const t = norm(`${m.concepto} ${m.documento ?? ""}`);
  if (/SALDO INICIAL|APERTURA/.test(t)) return { actividad: "APERTURA", rubro: "Saldos iniciales registrados en cajas" };
  if (/PRESTAMO|FINANCIAMIENTO|CREDITO BANCARIO/.test(t))
    return m.tipo === "INGRESO" ? { actividad: "FINANCIAMIENTO", rubro: "Préstamos recibidos" } : { actividad: "FINANCIAMIENTO", rubro: "Amortización de préstamos" };
  if (/APORTE|INYECCION|ACCIONISTA|CAPITAL/.test(t)) return m.tipo === "INGRESO" ? { actividad: "FINANCIAMIENTO", rubro: "Aportes de accionistas" } : { actividad: "FINANCIAMIENTO", rubro: "Devolución a accionistas" };
  if (/DIVIDENDO/.test(t)) return { actividad: "FINANCIAMIENTO", rubro: "Dividendos pagados" };
  if (/VENTA DE ACTIVO|VENTA ACTIVO/.test(t)) return { actividad: "INVERSION", rubro: "Venta de activos" };
  return m.tipo === "INGRESO" ? { actividad: "OPERACION", rubro: "Otros cobros (registro manual en cajas)" } : { actividad: "OPERACION", rubro: "Otros pagos (registro manual en cajas)" };
}

export interface NoEfectivo {
  prestamo: { fecha: string; documento: string; tercero: string; monto: number; detalle: string }[];
  credito: { fecha: string; documento: string; tercero: string; monto: number }[];
}

/** Todos los movimientos de efectivo de la empresa (ingresos +, egresos −) y los pagos que no movieron efectivo. */
export function movimientosEfectivo(f: FuentesEEFF): { movs: MovFlujo[]; noEfectivo: NoEfectivo } {
  const movs: MovFlujo[] = [];
  const noEfectivo: NoEfectivo = { prestamo: [], credito: [] };
  const deActivo = comprobantesActivo(f.activos);
  const esActivo = (numero: string) => deActivo.has(norm(numero).replace(/\s+/g, ""));
  const ocDeCompras = new Set(f.compras.map((c) => c.ordenCompraId).filter(Boolean));

  for (const c of f.cobros) {
    if (!(c.monto > 0)) continue;
    movs.push({ id: `cob-${c.id}`, fecha: dia(c.fecha), actividad: "OPERACION", rubro: RUBRO_COBRANZA, concepto: `Cobro ${c.npNumero || c.comprobanteNumero || ""}`.trim(), documento: c.comprobanteNumero || c.npNumero || "-", tercero: c.cliente, caja: cajaEfectivo(c.cuenta), monto: r2(c.monto) });
  }
  for (const x of f.facturas) {
    if (x.estadoPago !== "PAGADA") continue;
    if (x.ocId && ocDeCompras.has(x.ocId)) continue; // ya está como compra directa
    const monto = r2(x.netoPagar ?? x.total);
    if (!(monto > 0)) continue;
    const fecha = fechaPagoFactura(x);
    const tf = tipoFuente(x.caja);
    if (tf === "PRESTAMO") {
      noEfectivo.prestamo.push({ fecha, documento: x.codigo || x.numero, tercero: x.proveedor, monto, detalle: x.caja ?? "" });
      continue;
    }
    if (tf === "CREDITO") {
      noEfectivo.credito.push({ fecha, documento: x.codigo || x.numero, tercero: x.proveedor, monto });
      continue;
    }
    const rubro = esActivo(x.numero)
      ? RUBRO_ACTIVO
      : x.tipoGasto === "PLANILLA"
        ? RUBRO_GASTO.PLANILLA
        : x.esGastoTesoreria
          ? RUBRO_GASTO[x.tipoGasto ?? "SIN_TIPO"]
          : /^OS/i.test(x.ocNumero ?? "")
            ? RUBRO_SERVICIOS_OS
            : RUBRO_PROVEEDORES;
    movs.push({
      id: `fac-${x.id}`,
      fecha,
      actividad: rubro === RUBRO_ACTIVO ? "INVERSION" : "OPERACION",
      rubro,
      concepto: x.esGastoTesoreria ? x.descripcion || `Gasto ${x.codigo || x.numero}` : `Factura ${x.numero}${x.ocNumero ? ` · ${x.ocNumero}` : ""}`,
      documento: x.codigo || x.numero,
      tercero: x.proveedor,
      caja: cajaEfectivo(x.caja),
      monto: -monto,
    });
  }
  for (const c of f.compras) {
    if (!(c.total > 0) || !compraPagada(c)) continue;
    const fecha = fechaPagoCompra(c);
    const tf = tipoFuente(c.caja);
    if (tf === "PRESTAMO") {
      noEfectivo.prestamo.push({ fecha, documento: c.numero, tercero: c.proveedor, monto: r2(c.total), detalle: c.caja ?? "" });
      continue;
    }
    if (tf === "CREDITO") {
      noEfectivo.credito.push({ fecha, documento: c.numero, tercero: c.proveedor, monto: r2(c.total) });
      continue;
    }
    const rubro = esActivo(c.numero) ? RUBRO_ACTIVO : c.ordenServicioId ? RUBRO_SERVICIOS_OS : RUBRO_PROVEEDORES;
    movs.push({ id: `com-${c.id}`, fecha, actividad: rubro === RUBRO_ACTIVO ? "INVERSION" : "OPERACION", rubro, concepto: `Compra ${c.numero}`, documento: c.numero, tercero: c.proveedor, caja: cajaEfectivo(c.caja), monto: -r2(c.total) });
  }
  for (const a of f.adelantos) {
    if (/anulad/i.test(a.estado) || !(a.monto > 0)) continue;
    const tf = tipoFuente(a.caja_nombre);
    if (tf !== "EFECTIVO") continue;
    movs.push({ id: `ade-${a.id}`, fecha: dia(a.fecha), actividad: "OPERACION", rubro: RUBRO_GASTO.PLANILLA, concepto: `Adelanto de sueldo${a.motivo ? ` · ${a.motivo}` : ""}`, documento: "ADELANTO", tercero: a.trabajador_nombre, caja: cajaEfectivo(a.caja_nombre), monto: -r2(a.monto) });
  }
  for (const m of f.manuales) {
    if (!(m.monto > 0) || tipoFuente(m.cuenta) !== "EFECTIVO") continue;
    const c = clasificarManual(m);
    movs.push({ id: `man-${m.id}`, fecha: dia(m.fecha), ...c, concepto: m.concepto, documento: m.documento || "-", tercero: m.proveedor || "-", caja: cajaEfectivo(m.cuenta), monto: m.tipo === "INGRESO" ? r2(m.monto) : -r2(m.monto) });
  }
  movs.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.monto - a.monto);
  return { movs, noEfectivo };
}

/** Saldo de efectivo al cierre de una fecha (incluida). Usa el saldo de apertura del año si se ingresó. */
export function efectivoAl(fecha: string, movs: MovFlujo[], datos: DatosEEFF[]): number {
  const anio = Number(fecha.slice(0, 4));
  const ap = datosDelAnio(anio, datos).efectivoInicial;
  if (ap !== null && ap !== undefined) return r2(ap + suma(movs.filter((m) => m.fecha >= `${anio}-01-01` && m.fecha <= fecha), (m) => m.monto));
  // Sin apertura del año: la última apertura ingresada de un año anterior, o todo el historial
  const previos = datos.filter((d) => d.anio < anio && d.efectivoInicial !== null && d.efectivoInicial !== undefined).sort((a, b) => b.anio - a.anio);
  if (previos.length) {
    const p = previos[0];
    return r2((p.efectivoInicial ?? 0) + suma(movs.filter((m) => m.fecha >= `${p.anio}-01-01` && m.fecha <= fecha), (m) => m.monto));
  }
  return suma(movs.filter((m) => m.fecha <= fecha), (m) => m.monto);
}

export interface FilaFlujo {
  clave: string;
  texto: string;
  tipo: "titulo" | "linea" | "subtotal" | "total" | "saldo";
  valores: number[]; // una por columna
  total: number;
}

export interface FlujoCaja {
  columnas: string[];
  filas: FilaFlujo[];
  saldoInicial: number;
  saldoFinal: number;
  porCaja: { caja: string; ingresos: number; egresos: number; neto: number }[];
  noEfectivo: { prestamo: number; credito: number; detalle: NoEfectivo };
  movimientos: MovFlujo[];
}

const ORDEN_ACT: { id: Actividad; titulo: string; neto: string }[] = [
  { id: "OPERACION", titulo: "A. ACTIVIDADES DE OPERACIÓN", neto: "Flujo neto de actividades de operación" },
  { id: "INVERSION", titulo: "B. ACTIVIDADES DE INVERSIÓN", neto: "Flujo neto de actividades de inversión" },
  { id: "FINANCIAMIENTO", titulo: "C. ACTIVIDADES DE FINANCIAMIENTO", neto: "Flujo neto de actividades de financiamiento" },
];

/**
 * Flujo de caja (método directo) del año, mes a mes; con un mes elegido, solo ese mes.
 * Columnas = meses; la última columna (total) es el acumulado del rango.
 */
export function flujoDeCaja(f: FuentesEEFF, p: Periodo): FlujoCaja {
  const { movs, noEfectivo } = movimientosEfectivo(f);
  const meses = p.mes ? [p.mes] : Array.from({ length: 12 }, (_, i) => i + 1);
  const rangos = meses.map((m) => ({ desde: `${p.anio}-${String(m).padStart(2, "0")}-01`, hasta: finDeMes(p.anio, m) }));
  const { desde, hasta } = rangoPeriodo(p);
  const enRango = movs.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const col = (filtro: (m: MovFlujo) => boolean) => {
    const valores = rangos.map((r) => suma(enRango.filter((m) => m.fecha >= r.desde && m.fecha <= r.hasta && filtro(m)), (m) => m.monto));
    return { valores, total: r2(valores.reduce((a, v) => a + v, 0)) };
  };
  const filas: FilaFlujo[] = [];
  for (const act of ORDEN_ACT) {
    filas.push({ clave: `t-${act.id}`, texto: act.titulo, tipo: "titulo", valores: [], total: 0 });
    const deAct = enRango.filter((m) => m.actividad === act.id);
    const rubros = [...new Set(deAct.map((m) => m.rubro))];
    // Ingresos primero, luego egresos (por monto)
    const orden = rubros
      .map((r) => ({ r, t: suma(deAct.filter((m) => m.rubro === r), (m) => m.monto) }))
      .sort((a, b) => (a.t >= 0 ? 0 : 1) - (b.t >= 0 ? 0 : 1) || Math.abs(b.t) - Math.abs(a.t));
    if (!orden.length) filas.push({ clave: `v-${act.id}`, texto: "Sin movimientos", tipo: "linea", valores: rangos.map(() => 0), total: 0 });
    for (const { r } of orden) filas.push({ clave: `${act.id}-${r}`, texto: r, tipo: "linea", ...col((m) => m.actividad === act.id && m.rubro === r) });
    filas.push({ clave: `n-${act.id}`, texto: act.neto, tipo: "subtotal", ...col((m) => m.actividad === act.id) });
  }
  const neto = col((m) => m.actividad !== "APERTURA");
  filas.push({ clave: "neto", texto: "AUMENTO (DISMINUCIÓN) NETO DE EFECTIVO", tipo: "total", ...neto });
  const apertura = col((m) => m.actividad === "APERTURA");
  if (apertura.total) filas.push({ clave: "apertura", texto: "Saldos iniciales registrados en cajas", tipo: "linea", ...apertura });
  const iniciales = rangos.map((r) => efectivoAl(diaAnterior(r.desde), movs, f.datos));
  const finales = rangos.map((r) => efectivoAl(r.hasta, movs, f.datos));
  filas.push({ clave: "ini", texto: "Saldo de efectivo al inicio del periodo", tipo: "saldo", valores: iniciales, total: iniciales[0] ?? 0 });
  filas.push({ clave: "fin", texto: "SALDO DE EFECTIVO AL FINAL DEL PERIODO", tipo: "total", valores: finales, total: finales[finales.length - 1] ?? 0 });

  const cajas = [...new Set(enRango.map((m) => m.caja))];
  const porCaja = cajas
    .map((c) => {
      const l = enRango.filter((m) => m.caja === c);
      const ingresos = suma(l.filter((m) => m.monto > 0), (m) => m.monto);
      const egresos = suma(l.filter((m) => m.monto < 0), (m) => -m.monto);
      return { caja: c, ingresos, egresos, neto: r2(ingresos - egresos) };
    })
    .sort((a, b) => b.ingresos + b.egresos - (a.ingresos + a.egresos));
  const enRangoNE = (l: { fecha: string; monto: number }[]) => suma(l.filter((x) => x.fecha >= desde && x.fecha <= hasta), (x) => x.monto);
  return {
    columnas: meses.map((m) => MESES_CORTOS[m - 1]),
    filas,
    saldoInicial: iniciales[0] ?? 0,
    saldoFinal: finales[finales.length - 1] ?? 0,
    porCaja,
    noEfectivo: {
      prestamo: enRangoNE(noEfectivo.prestamo),
      credito: enRangoNE(noEfectivo.credito),
      detalle: { prestamo: noEfectivo.prestamo.filter((x) => x.fecha >= desde && x.fecha <= hasta), credito: noEfectivo.credito.filter((x) => x.fecha >= desde && x.fecha <= hasta) },
    },
    movimientos: enRango,
  };
}

// ------------------------------------------------------------------ Inventarios

/** Valor del inventario (cantidad × último costo) al cierre de una fecha, reconstruido con el kardex. */
export function inventarioAl(fecha: string, stock: StockItem[], kardex: MovimientoKardex[]): number {
  const porId = new Map<string, MovimientoKardex[]>();
  const porNombre = new Map<string, MovimientoKardex[]>();
  for (const k of kardex) {
    if (k.stock_id) porId.set(k.stock_id, [...(porId.get(k.stock_id) ?? []), k]);
    const n = `${norm(k.sede)}|${norm(k.producto)}`;
    porNombre.set(n, [...(porNombre.get(n) ?? []), k]);
  }
  let total = 0;
  for (const s of stock) {
    const movs = porId.get(s.id) ?? porNombre.get(`${norm(s.sede)}|${norm(s.nombre)}`) ?? [];
    let cant: number;
    if (!movs.length || fecha >= hoy()) cant = Number(s.cantidad) || 0;
    else {
      const previos = movs.filter((m) => dia(m.fecha) <= fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
      cant = previos.length ? Number(previos[previos.length - 1].saldo) || 0 : 0;
    }
    if (cant > 0) total += cant * (Number(s.costoUnit) || 0);
  }
  return r2(total);
}

function inventarioInicialAnio(f: FuentesEEFF, anio: number): number {
  const d = datosDelAnio(anio, f.datos).inventarioInicial;
  return d !== null && d !== undefined ? r2(d) : inventarioAl(`${anio - 1}-12-31`, f.stock, f.kardex);
}

// ------------------------------------------------------------------ Estado de resultados

/** Base sin IGV de un gasto / compra (con IGV solo si el comprobante da crédito fiscal). */
const baseCompra = (x: { subtotal: number; igv: number; total: number }) => r2(x.igv > 0 ? Number(x.subtotal) || 0 : Number(x.total) || 0);

export interface LineaDetalle {
  texto: string;
  monto: number;
}

export interface EstadoResultados {
  ventas: number;
  detalleVentas: LineaDetalle[];
  costoVentas: number;
  detalleCosto: LineaDetalle[];
  utilidadBruta: number;
  gastosVentas: number;
  detalleGastosVentas: LineaDetalle[];
  gastosAdministracion: number;
  detalleGastosAdm: LineaDetalle[];
  utilidadOperativa: number;
  otrosIngresos: number;
  gastosFinancieros: number;
  otrosGastos: number;
  resultadoAntesIR: number;
  impuestoRenta: number;
  resultadoNeto: number;
  /** Para ratios de gestión. */
  ventasConIgv: number;
  comprasConIgv: number;
  igvVentas: number;
  igvCompras: number;
  planillaDesdePagos: boolean;
}

const TIPO_ER: Record<TipoGasto | "SIN_TIPO", "COSTO" | "VENTAS" | "ADM"> = {
  COMPRA_SIN_REQ: "COSTO",
  MANO_OBRA: "COSTO",
  SERV_TERCEROS: "COSTO",
  TRANSPORTE: "VENTAS",
  REPRESENTACION: "VENTAS",
  SERVICIO_BASICO: "ADM",
  ALQUILER: "ADM",
  SERV_PROFESIONALES: "ADM",
  MANTENIMIENTO: "ADM",
  OTROS: "ADM",
  PLANILLA: "ADM",
  SIN_TIPO: "ADM",
};

function agrupar(l: LineaDetalle[]): LineaDetalle[] {
  const m = new Map<string, number>();
  l.forEach((x) => m.set(x.texto, r2((m.get(x.texto) ?? 0) + x.monto)));
  return [...m.entries()].map(([texto, monto]) => ({ texto, monto })).filter((x) => Math.abs(x.monto) >= 0.005).sort((a, b) => b.monto - a.monto);
}

/** Ventas del rango: comprobantes emitidos (notas de crédito restan) + NP aprobadas sin comprobante del sistema. */
function ventasRango(f: FuentesEEFF, desde: string, hasta: string) {
  const en = (x: string) => dia(x) >= desde && dia(x) <= hasta;
  let base = 0,
    igv = 0,
    total = 0,
    facturas = 0,
    nc = 0,
    np = 0;
  for (const c of f.comprobantes) {
    if (c.estado !== "EMITIDO" || !en(c.fecha)) continue;
    const s = c.tipo === "NOTA_CREDITO" ? -1 : 1;
    base += s * (Number(c.base) || 0);
    igv += s * (Number(c.igv) || 0);
    total += s * (Number(c.total) || 0);
    if (c.tipo === "NOTA_CREDITO") nc += Number(c.base) || 0;
    else facturas += Number(c.base) || 0;
  }
  for (const n of f.notas) {
    if ((n.estado !== "APROBADA" && n.estado !== "FACTURADA") || n.comprobanteId || n.origen === "SECOCHA" || !en(n.fecha)) continue;
    base += Number(n.subtotal) || 0;
    igv += Number(n.igv) || 0;
    total += Number(n.total) || 0;
    np += Number(n.subtotal) || 0;
  }
  return { base: r2(base), igv: r2(igv), total: r2(total), facturas: r2(facturas), nc: r2(nc), np: r2(np) };
}

/** Compras y gastos del rango (por fecha del documento), sin IGV. */
function comprasRango(f: FuentesEEFF, desde: string, hasta: string) {
  const en = (x: string) => dia(x) >= desde && dia(x) <= hasta;
  const deActivo = comprobantesActivo(f.activos);
  const esActivo = (numero: string) => deActivo.has(norm(numero).replace(/\s+/g, ""));
  const ocDeCompras = new Set(f.compras.map((c) => c.ordenCompraId).filter(Boolean));
  let mercaderia = 0,
    conIgv = 0,
    igv = 0;
  const gastos: { tipo: "COSTO" | "VENTAS" | "ADM"; texto: string; monto: number }[] = [];
  let planillaPagos = 0;
  for (const x of f.facturas) {
    if (!en(x.fecha) || esActivo(x.numero)) continue;
    if (x.ocId && ocDeCompras.has(x.ocId)) continue;
    if (x.tipoGasto === "PLANILLA") {
      planillaPagos += Number(x.total) || 0;
      continue;
    }
    const b = baseCompra(x);
    conIgv += Number(x.total) || 0;
    igv += x.igv > 0 ? Number(x.igv) || 0 : 0;
    if (x.esGastoTesoreria) {
      const t = x.tipoGasto ?? "SIN_TIPO";
      gastos.push({ tipo: TIPO_ER[t], texto: RUBRO_GASTO[t], monto: b });
    } else if (/^OS/i.test(x.ocNumero ?? "")) gastos.push({ tipo: "COSTO", texto: "Servicios de terceros (órdenes de servicio)", monto: b });
    else mercaderia += b;
  }
  for (const c of f.compras) {
    if (!en(c.fecha) || esActivo(c.numero)) continue;
    const b = baseCompra(c);
    conIgv += Number(c.total) || 0;
    igv += c.igv > 0 ? Number(c.igv) || 0 : 0;
    if (c.ordenServicioId) gastos.push({ tipo: "COSTO", texto: "Servicios de terceros (órdenes de servicio)", monto: b });
    else mercaderia += b;
  }
  return { mercaderia: r2(mercaderia), conIgv: r2(conIgv), igv: r2(igv), gastos, planillaPagos: r2(planillaPagos) };
}

/** Depreciación de los activos en el rango (meses cerrados, método lineal de lib/activos.ts). */
export function depreciacionRango(activos: Activo[], desde: string, hasta: string): number {
  const antes = diaAnterior(desde);
  return r2(activos.reduce((a, x) => a + Math.max(0, depreciacion(x, hasta).acumulada - depreciacion(x, antes).acumulada), 0));
}

export function estadoResultados(f: FuentesEEFF, desde: string, hasta: string): EstadoResultados {
  const anio = Number(desde.slice(0, 4));
  const datos = datosDelAnio(anio, f.datos);
  const v = ventasRango(f, desde, hasta);
  const c = comprasRango(f, desde, hasta);

  // Costo de ventas (método periódico): inventario inicial + compras − inventario final
  const invIni = desde.endsWith("-01-01") ? inventarioInicialAnio(f, anio) : inventarioAl(diaAnterior(desde), f.stock, f.kardex);
  const invFin = inventarioAl(hasta, f.stock, f.kardex);
  const costosDirectos = c.gastos.filter((g) => g.tipo === "COSTO");
  const costoMercaderia = r2(invIni + c.mercaderia - invFin);
  const detalleCosto: LineaDetalle[] = [
    { texto: "Inventario inicial", monto: invIni },
    { texto: "(+) Compras de mercadería y materiales", monto: c.mercaderia },
    { texto: "(−) Inventario final", monto: -invFin },
    { texto: "= Costo de la mercadería vendida / consumida", monto: costoMercaderia },
    ...agrupar(costosDirectos.map((g) => ({ texto: `(+) ${g.texto}`, monto: g.monto }))),
  ];
  const costoVentas = r2(costoMercaderia + suma(costosDirectos, (g) => g.monto));

  // Gastos de personal: planilla cerrada (sueldo bruto); sin acceso a la planilla, lo pagado
  const planilla = f.planilla
    ? suma(
        f.planilla.filter((h) => dia(h.fecha_cierre) >= desde && dia(h.fecha_cierre) <= hasta),
        (h) => Number(h.total_bruto) || Number(h.total_neto) || Number(h.total_pagar) || 0
      )
    : c.planillaPagos;
  const dep = depreciacionRango(f.activos, desde, hasta);
  const detalleGastosAdm = agrupar([
    ...c.gastos.filter((g) => g.tipo === "ADM").map((g) => ({ texto: g.texto, monto: g.monto })),
    { texto: "Gastos de personal (planilla)", monto: planilla },
    { texto: "Depreciación de activos", monto: dep },
  ]);
  const detalleGastosVentas = agrupar(c.gastos.filter((g) => g.tipo === "VENTAS").map((g) => ({ texto: g.texto, monto: g.monto })));
  const gastosAdministracion = suma(detalleGastosAdm, (x) => x.monto);
  const gastosVentas = suma(detalleGastosVentas, (x) => x.monto);

  const aj = datos.ajustes.filter((a) => a.fecha >= desde && a.fecha <= hasta);
  const otrosIngresos = suma(aj.filter((a) => a.tipo === "OTRO_INGRESO"), (a) => a.monto);
  const gastosFinancieros = suma(aj.filter((a) => a.tipo === "GASTO_FINANCIERO"), (a) => a.monto);
  const otrosGastos = suma(aj.filter((a) => a.tipo === "OTRO_GASTO"), (a) => a.monto);

  const utilidadBruta = r2(v.base - costoVentas);
  const utilidadOperativa = r2(utilidadBruta - gastosVentas - gastosAdministracion);
  const resultadoAntesIR = r2(utilidadOperativa + otrosIngresos - gastosFinancieros - otrosGastos);
  const ir = impuestoRenta(resultadoAntesIR, datos);
  return {
    ventas: v.base,
    detalleVentas: agrupar([
      { texto: "Facturas y boletas emitidas", monto: v.facturas },
      { texto: "Notas de pedido aprobadas (sin comprobante del sistema)", monto: v.np },
      { texto: "(−) Notas de crédito", monto: -v.nc },
    ]),
    costoVentas,
    detalleCosto,
    utilidadBruta,
    gastosVentas,
    detalleGastosVentas,
    gastosAdministracion,
    detalleGastosAdm,
    utilidadOperativa,
    otrosIngresos,
    gastosFinancieros,
    otrosGastos,
    resultadoAntesIR,
    impuestoRenta: ir,
    resultadoNeto: r2(resultadoAntesIR - ir),
    ventasConIgv: v.total,
    comprasConIgv: c.conIgv,
    igvVentas: v.igv,
    igvCompras: c.igv,
    planillaDesdePagos: !f.planilla,
  };
}

// ------------------------------------------------------------------ Estado de situación financiera

export interface LineaESF {
  cuenta: string; // PCGE
  texto: string;
  monto: number;
  origen: string; // de dónde sale la cifra
}

export interface SituacionFinanciera {
  corte: string;
  activoCorriente: LineaESF[];
  totalActivoCorriente: number;
  activoNoCorriente: LineaESF[];
  totalActivoNoCorriente: number;
  totalActivo: number;
  pasivoCorriente: LineaESF[];
  totalPasivoCorriente: number;
  pasivoNoCorriente: LineaESF[];
  totalPasivoNoCorriente: number;
  totalPasivo: number;
  patrimonio: LineaESF[];
  totalPatrimonio: number;
  diferencia: number;
  /** Valores sueltos para ratios. */
  efectivo: number;
  cxc: number;
  inventario: number;
  cxp: number;
  faltaApertura: string[];
}

/** Cuentas por cobrar al corte: ventas con IGV hasta el corte − cobros hasta el corte. */
function cxcAl(f: FuentesEEFF, corte: string): number {
  const v = ventasRango(f, "0000-01-01", corte);
  const cobrado = suma(f.cobros.filter((c) => dia(c.fecha) <= corte), (c) => c.monto);
  return r2(Math.max(0, v.total - cobrado));
}

/** Cuentas por pagar comerciales al corte: documentos emitidos hasta el corte y no pagados en esa fecha (incluye pagos a CRÉDITO). */
function cxpAl(f: FuentesEEFF, corte: string): number {
  const ocDeCompras = new Set(f.compras.map((c) => c.ordenCompraId).filter(Boolean));
  let t = 0;
  for (const x of f.facturas) {
    if (x.tipoGasto === "PLANILLA" || dia(x.fecha) > corte) continue;
    if (x.ocId && ocDeCompras.has(x.ocId)) continue;
    const pagada = x.estadoPago === "PAGADA" && fechaPagoFactura(x) <= corte && tipoFuente(x.caja) !== "CREDITO";
    if (!pagada && !(x.estadoPago === "PAGADA" && tipoFuente(x.caja) === "PRESTAMO")) t += Number(x.netoPagar ?? x.total) || 0;
  }
  for (const c of f.compras) {
    if (dia(c.fecha) > corte) continue;
    const pagada = compraPagada(c) && fechaPagoCompra(c) <= corte && tipoFuente(c.caja) !== "CREDITO";
    if (!pagada && !(compraPagada(c) && tipoFuente(c.caja) === "PRESTAMO")) t += Number(c.total) || 0;
  }
  return r2(t);
}

/** Préstamos por pagar: apertura del año (o historial) + pagos hechos con PRÉSTAMO + préstamos recibidos − amortizaciones. */
function prestamosAl(f: FuentesEEFF, corte: string, movs: MovFlujo[], ne: NoEfectivo): number {
  const anio = Number(corte.slice(0, 4));
  const ap = datosDelAnio(anio, f.datos).prestamosInicial;
  const desde = ap !== null && ap !== undefined ? `${anio}-01-01` : "0000-01-01";
  const en = (x: string) => x >= desde && x <= corte;
  const recibidos = suma(movs.filter((m) => m.actividad === "FINANCIAMIENTO" && /PRÉSTAMOS RECIBIDOS/i.test(m.rubro) && en(m.fecha)), (m) => m.monto);
  const amortizado = suma(movs.filter((m) => m.actividad === "FINANCIAMIENTO" && /AMORTIZACI/i.test(m.rubro) && en(m.fecha)), (m) => -m.monto);
  const porTerceros = suma(ne.prestamo.filter((x) => en(x.fecha)), (x) => x.monto);
  return r2(Math.max(0, (ap ?? 0) + recibidos + porTerceros - amortizado));
}

/** Primer año con datos en el ERP (para calcular resultados acumulados de años anteriores). */
function primerAnio(f: FuentesEEFF): number {
  const fechas = [...f.comprobantes.map((c) => c.fecha), ...f.notas.map((n) => n.fecha), ...f.facturas.map((x) => x.fecha), ...f.compras.map((c) => c.fecha)].map(dia).filter((x) => /^\d{4}/.test(x));
  return fechas.length ? Math.min(...fechas.map((x) => Number(x.slice(0, 4)))) : new Date().getFullYear();
}

export function resultadosAcumuladosAl(f: FuentesEEFF, anio: number): { monto: number; origen: string } {
  const d = datosDelAnio(anio, f.datos).resultadosAcumulados;
  if (d !== null && d !== undefined) return { monto: r2(d), origen: "Dato de apertura" };
  const desde = primerAnio(f);
  let t = 0;
  // Si un año anterior tiene resultados acumulados de apertura, se parte de ahí
  let inicio = desde;
  for (let a = anio - 1; a >= desde; a--) {
    const x = datosDelAnio(a, f.datos).resultadosAcumulados;
    if (x !== null && x !== undefined) {
      t = x;
      inicio = a;
      break;
    }
  }
  for (let a = inicio; a < anio; a++) t += estadoResultados(f, `${a}-01-01`, `${a}-12-31`).resultadoNeto;
  return { monto: r2(t), origen: inicio < anio ? `Calculado: resultados ${inicio}–${anio - 1} del ERP` : "Sin años anteriores en el ERP" };
}

export function situacionFinanciera(f: FuentesEEFF, corte: string): SituacionFinanciera {
  const anio = Number(corte.slice(0, 4));
  const datos = datosDelAnio(anio, f.datos);
  const { movs, noEfectivo } = movimientosEfectivo(f);
  const efectivo = efectivoAl(corte, movs, f.datos);
  const cxc = cxcAl(f, corte);
  const inventario = corte < `${anio}-01-01` ? 0 : inventarioAl(corte, f.stock, f.kardex);
  // IGV del mes de corte (los meses anteriores se asumen declarados y pagados)
  const mesCorte = `${corte.slice(0, 7)}-01`;
  const igvMes = (() => {
    const v = ventasRango(f, mesCorte, corte);
    const c = comprasRango(f, mesCorte, corte);
    return r2(v.igv - c.igv);
  })();
  const er = estadoResultados(f, `${anio}-01-01`, corte);
  const vigentes = f.activos.filter((a) => dia(a.fechaCompra) <= corte && !(a.baja?.fecha && dia(a.baja.fecha) <= corte));
  const costoAF = suma(vigentes, (a) => a.costo);
  const depAcum = suma(vigentes, (a) => depreciacion(a, corte).acumulada);
  const cxp = cxpAl(f, corte);
  const prestamos = prestamosAl(f, corte, movs, noEfectivo);
  const acumulados = resultadosAcumuladosAl(f, anio);

  const activoCorriente: LineaESF[] = [
    { cuenta: "10", texto: "Efectivo y equivalentes de efectivo", monto: efectivo, origen: datos.efectivoInicial !== null ? "Saldo de apertura + flujo de caja" : "Cajas: cobros − pagos registrados" },
    { cuenta: "12", texto: "Cuentas por cobrar comerciales", monto: cxc, origen: "Ventas con IGV − cobros (CxC)" },
    ...(datos.otrasCxC ? [{ cuenta: "14/16", texto: "Otras cuentas por cobrar", monto: r2(datos.otrasCxC), origen: "Dato de apertura" }] : []),
    { cuenta: "20", texto: "Inventarios (mercaderías y materiales)", monto: inventario, origen: "Stock × último costo (kardex)" },
    ...(igvMes < 0 ? [{ cuenta: "40111", texto: "IGV - crédito fiscal por aplicar", monto: r2(-igvMes), origen: "IGV del mes de corte" }] : []),
    ...(datos.otrosActivosCorrientes ? [{ cuenta: "18", texto: "Otros activos corrientes", monto: r2(datos.otrosActivosCorrientes), origen: "Dato de apertura" }] : []),
  ];
  const activoNoCorriente: LineaESF[] = [
    { cuenta: "33", texto: "Propiedades, planta y equipo (costo)", monto: costoAF, origen: `Registro de activos (${vigentes.length})` },
    { cuenta: "39", texto: "(−) Depreciación acumulada", monto: -depAcum, origen: "Depreciación lineal (Activos)" },
    ...(datos.otrosActivosNoCorrientes ? [{ cuenta: "34/37", texto: "Otros activos no corrientes", monto: r2(datos.otrosActivosNoCorrientes), origen: "Dato de apertura" }] : []),
  ];
  const tributos = r2(Math.max(0, igvMes) + er.impuestoRenta);
  const pasivoCorriente: LineaESF[] = [
    { cuenta: "42", texto: "Cuentas por pagar comerciales", monto: cxp, origen: "Facturas / compras por pagar (incluye pagos a CRÉDITO)" },
    { cuenta: "40", texto: "Tributos por pagar (IGV del mes + IR estimado)", monto: tributos, origen: `IGV ${corte.slice(0, 7)} + IR ${anio} estimado` },
    { cuenta: "45", texto: "Obligaciones financieras (préstamos)", monto: prestamos, origen: "Apertura + pagos con PRÉSTAMO + préstamos recibidos − amortizaciones" },
    ...(datos.otrasCxP ? [{ cuenta: "46", texto: "Otras cuentas por pagar", monto: r2(datos.otrasCxP), origen: "Dato de apertura" }] : []),
  ];
  const pasivoNoCorriente: LineaESF[] = datos.pasivoNoCorriente ? [{ cuenta: "45", texto: "Obligaciones financieras a largo plazo", monto: r2(datos.pasivoNoCorriente), origen: "Dato de apertura" }] : [];

  const tAC = suma(activoCorriente, (l) => l.monto);
  const tANC = suma(activoNoCorriente, (l) => l.monto);
  const tPC = suma(pasivoCorriente, (l) => l.monto);
  const tPNC = suma(pasivoNoCorriente, (l) => l.monto);
  const totalActivo = r2(tAC + tANC);
  const totalPasivo = r2(tPC + tPNC);
  const patrimonio: LineaESF[] = [
    { cuenta: "50", texto: "Capital social", monto: r2(datos.capitalSocial), origen: datos.capitalSocial ? "Dato de apertura" : "Falta ingresar" },
    { cuenta: "59", texto: "Resultados acumulados (años anteriores)", monto: acumulados.monto, origen: acumulados.origen },
    { cuenta: "59", texto: `Resultado del ejercicio ${anio}`, monto: er.resultadoNeto, origen: "Estado de resultados" },
  ];
  const parcial = suma(patrimonio, (l) => l.monto);
  const diferencia = r2(totalActivo - totalPasivo - parcial);
  if (Math.abs(diferencia) >= 0.01) patrimonio.push({ cuenta: "—", texto: "Diferencia por conciliar (datos de apertura faltantes)", monto: diferencia, origen: "Activo − Pasivo − Patrimonio registrado" });
  const faltaApertura: string[] = [];
  if (!datos.capitalSocial) faltaApertura.push("capital social");
  if (datos.efectivoInicial === null && !movs.some((m) => m.actividad === "APERTURA")) faltaApertura.push("saldo inicial de efectivo");
  if (datos.prestamosInicial === null) faltaApertura.push("préstamos por pagar al inicio");
  return {
    corte,
    activoCorriente,
    totalActivoCorriente: tAC,
    activoNoCorriente,
    totalActivoNoCorriente: tANC,
    totalActivo,
    pasivoCorriente,
    totalPasivoCorriente: tPC,
    pasivoNoCorriente,
    totalPasivoNoCorriente: tPNC,
    totalPasivo,
    patrimonio,
    totalPatrimonio: r2(parcial + (Math.abs(diferencia) >= 0.01 ? diferencia : 0)),
    diferencia,
    efectivo,
    cxc,
    inventario,
    cxp,
    faltaApertura,
  };
}

// ------------------------------------------------------------------ Ratios

export type Semaforo = "bueno" | "regular" | "malo" | "info" | "nd";
export type GrupoRatio = "Liquidez" | "Endeudamiento" | "Rentabilidad" | "Gestión";

export interface Ratio {
  id: string;
  grupo: GrupoRatio;
  nombre: string;
  formula: string;
  valor: number | null;
  formato: "veces" | "pct" | "dias" | "soles";
  semaforo: Semaforo;
  lectura: string;
  referencia: string;
}

const div = (a: number, b: number): number | null => (Math.abs(b) < 0.005 ? null : a / b);
const sem = (v: number | null, bueno: (x: number) => boolean, regular: (x: number) => boolean): Semaforo => (v === null ? "nd" : bueno(v) ? "bueno" : regular(v) ? "regular" : "malo");

export function formatoRatio(r: Pick<Ratio, "valor" | "formato">): string {
  if (r.valor === null || !Number.isFinite(r.valor)) return "N/D";
  const n = (x: number, d = 2) => x.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (r.formato === "pct") return `${n(r.valor * 100, 1)} %`;
  if (r.formato === "dias") return `${n(r.valor, 0)} días`;
  if (r.formato === "soles") return `S/ ${n(r.valor)}`;
  return `${n(r.valor)} veces`;
}

export function ratios(s: SituacionFinanciera, er: EstadoResultados, dias: number, invInicial: number): Ratio[] {
  const ac = s.totalActivoCorriente;
  const pc = s.totalPasivoCorriente;
  const pat = s.totalPatrimonio;
  const invProm = (invInicial + s.inventario) / 2;
  const L: Ratio[] = [];
  const add = (r: Ratio) => L.push(r);
  let v: number | null;

  v = div(ac, pc);
  add({ id: "liq", grupo: "Liquidez", nombre: "Liquidez corriente", formula: "Activo corriente ÷ Pasivo corriente", valor: v, formato: "veces", semaforo: sem(v, (x) => x >= 1.5, (x) => x >= 1), lectura: v === null ? "Sin pasivo corriente registrado." : `Por cada S/ 1 de deuda de corto plazo hay S/ ${v.toFixed(2)} de activo corriente.`, referencia: "Bueno ≥ 1.5 · Aceptable 1 a 1.5 · Riesgo < 1" });
  v = div(ac - s.inventario, pc);
  add({ id: "acida", grupo: "Liquidez", nombre: "Prueba ácida", formula: "(Activo corriente − Inventarios) ÷ Pasivo corriente", valor: v, formato: "veces", semaforo: sem(v, (x) => x >= 1, (x) => x >= 0.7), lectura: v === null ? "Sin pasivo corriente registrado." : `Sin vender inventario, se cubre ${(v * 100).toFixed(0)} % de la deuda de corto plazo.`, referencia: "Bueno ≥ 1 · Aceptable 0.7 a 1 · Riesgo < 0.7" });
  v = div(s.efectivo, pc);
  add({ id: "def", grupo: "Liquidez", nombre: "Prueba defensiva (liquidez absoluta)", formula: "Efectivo ÷ Pasivo corriente", valor: v, formato: "pct", semaforo: sem(v, (x) => x >= 0.3, (x) => x >= 0.1), lectura: v === null ? "Sin pasivo corriente registrado." : `Con el efectivo de hoy se paga el ${(v * 100).toFixed(0)} % de la deuda de corto plazo.`, referencia: "Bueno ≥ 30 % · Aceptable 10 a 30 %" });
  v = r2(ac - pc);
  add({ id: "ct", grupo: "Liquidez", nombre: "Capital de trabajo", formula: "Activo corriente − Pasivo corriente", valor: v, formato: "soles", semaforo: v > 0 ? "bueno" : v === 0 ? "regular" : "malo", lectura: v >= 0 ? "Recursos de corto plazo que quedan después de pagar las deudas de corto plazo." : "Faltan recursos de corto plazo para cubrir las deudas de corto plazo.", referencia: "Positivo = holgura para operar" });

  v = div(s.totalPasivo, s.totalActivo);
  add({ id: "end", grupo: "Endeudamiento", nombre: "Endeudamiento total", formula: "Pasivo total ÷ Activo total", valor: v, formato: "pct", semaforo: sem(v, (x) => x <= 0.5, (x) => x <= 0.7), lectura: v === null ? "Sin activos registrados." : `El ${(v * 100).toFixed(0)} % de los activos está financiado con deuda.`, referencia: "Bueno ≤ 50 % · Aceptable 50 a 70 % · Alto > 70 %" });
  v = div(s.totalPasivo, pat);
  add({ id: "apal", grupo: "Endeudamiento", nombre: "Endeudamiento patrimonial", formula: "Pasivo total ÷ Patrimonio", valor: pat <= 0 ? null : v, formato: "veces", semaforo: pat <= 0 ? "malo" : sem(v, (x) => x <= 1, (x) => x <= 2), lectura: pat <= 0 ? "Patrimonio cero o negativo: complete los datos de apertura." : `Los acreedores aportan S/ ${(v ?? 0).toFixed(2)} por cada S/ 1 de los accionistas.`, referencia: "Bueno ≤ 1 · Aceptable 1 a 2 · Alto > 2" });
  v = div(pat, s.totalActivo);
  add({ id: "aut", grupo: "Endeudamiento", nombre: "Autonomía financiera", formula: "Patrimonio ÷ Activo total", valor: v, formato: "pct", semaforo: sem(v, (x) => x >= 0.5, (x) => x >= 0.3), lectura: v === null ? "Sin activos registrados." : `El ${(v * 100).toFixed(0)} % de los activos es de los accionistas.`, referencia: "Bueno ≥ 50 % · Aceptable 30 a 50 %" });
  v = div(pc, s.totalPasivo);
  add({ id: "cp", grupo: "Endeudamiento", nombre: "Concentración de deuda a corto plazo", formula: "Pasivo corriente ÷ Pasivo total", valor: v, formato: "pct", semaforo: v === null ? "nd" : "info", lectura: v === null ? "Sin pasivos registrados." : `El ${(v * 100).toFixed(0)} % de la deuda vence en menos de un año.`, referencia: "Informativo: mientras más alto, más presión de caja" });

  v = div(er.utilidadBruta, er.ventas);
  add({ id: "mb", grupo: "Rentabilidad", nombre: "Margen bruto", formula: "Utilidad bruta ÷ Ventas netas", valor: v, formato: "pct", semaforo: sem(v, (x) => x >= 0.25, (x) => x >= 0.1), lectura: v === null ? "Sin ventas en el periodo." : `De cada S/ 100 vendidos quedan S/ ${(v * 100).toFixed(1)} después del costo de ventas.`, referencia: "Bueno ≥ 25 % · Aceptable 10 a 25 %" });
  v = div(er.utilidadOperativa, er.ventas);
  add({ id: "mo", grupo: "Rentabilidad", nombre: "Margen operativo", formula: "Utilidad operativa ÷ Ventas netas", valor: v, formato: "pct", semaforo: sem(v, (x) => x >= 0.1, (x) => x >= 0), lectura: v === null ? "Sin ventas en el periodo." : `La operación deja S/ ${(v * 100).toFixed(1)} por cada S/ 100 vendidos.`, referencia: "Bueno ≥ 10 % · Aceptable 0 a 10 %" });
  v = div(er.resultadoNeto, er.ventas);
  add({ id: "mn", grupo: "Rentabilidad", nombre: "Margen neto", formula: "Resultado neto ÷ Ventas netas", valor: v, formato: "pct", semaforo: sem(v, (x) => x >= 0.05, (x) => x >= 0), lectura: v === null ? "Sin ventas en el periodo." : `Utilidad final de S/ ${(v * 100).toFixed(1)} por cada S/ 100 vendidos.`, referencia: "Bueno ≥ 5 % · Aceptable 0 a 5 % · Pérdida < 0" });
  v = div(er.resultadoNeto, s.totalActivo);
  add({ id: "roa", grupo: "Rentabilidad", nombre: "ROA (rentabilidad del activo)", formula: "Resultado neto ÷ Activo total", valor: v, formato: "pct", semaforo: sem(v, (x) => x >= 0.05, (x) => x >= 0), lectura: v === null ? "Sin activos registrados." : `Los activos generaron ${(v * 100).toFixed(1)} % de utilidad en el periodo.`, referencia: "Bueno ≥ 5 % · Aceptable 0 a 5 %" });
  v = pat > 0 ? div(er.resultadoNeto, pat) : null;
  add({ id: "roe", grupo: "Rentabilidad", nombre: "ROE (rentabilidad del patrimonio)", formula: "Resultado neto ÷ Patrimonio", valor: v, formato: "pct", semaforo: pat <= 0 ? "nd" : sem(v, (x) => x >= 0.1, (x) => x >= 0), lectura: pat <= 0 ? "Patrimonio cero o negativo: complete los datos de apertura." : `Los accionistas ganaron ${((v ?? 0) * 100).toFixed(1)} % sobre su inversión en el periodo.`, referencia: "Bueno ≥ 10 % · Aceptable 0 a 10 %" });

  v = div(s.cxc, er.ventasConIgv);
  const diasCobro = v === null ? null : v * dias;
  add({ id: "pc", grupo: "Gestión", nombre: "Periodo promedio de cobro", formula: `Cuentas por cobrar ÷ Ventas con IGV × ${dias} días`, valor: diasCobro, formato: "dias", semaforo: sem(diasCobro, (x) => x <= 45, (x) => x <= 90), lectura: diasCobro === null ? "Sin ventas en el periodo." : `Los clientes pagan, en promedio, en ${diasCobro.toFixed(0)} días.`, referencia: "Bueno ≤ 45 días · Aceptable 45 a 90 · Lento > 90" });
  v = div(er.ventasConIgv, s.cxc);
  add({ id: "rcxc", grupo: "Gestión", nombre: "Rotación de cuentas por cobrar", formula: "Ventas con IGV ÷ Cuentas por cobrar", valor: v, formato: "veces", semaforo: v === null ? "nd" : "info", lectura: v === null ? "Sin cuentas por cobrar." : `La cartera se cobró ${v.toFixed(1)} veces en el periodo.`, referencia: "Informativo: mientras más alto, mejor" });
  const diasInv = invProm > 0 && er.costoVentas > 0 ? (invProm / er.costoVentas) * dias : null;
  add({ id: "pi", grupo: "Gestión", nombre: "Periodo promedio de inventario", formula: `Inventario promedio ÷ Costo de ventas × ${dias} días`, valor: diasInv, formato: "dias", semaforo: sem(diasInv, (x) => x <= 90, (x) => x <= 180), lectura: diasInv === null ? "Sin costo de ventas o sin inventario." : `La mercadería permanece ${diasInv.toFixed(0)} días en almacén antes de venderse.`, referencia: "Bueno ≤ 90 días · Aceptable 90 a 180 (repuestos de maquinaria rotan lento)" });
  v = div(s.cxp, er.comprasConIgv);
  const diasPago = v === null ? null : v * dias;
  add({ id: "pp", grupo: "Gestión", nombre: "Periodo promedio de pago", formula: `Cuentas por pagar ÷ Compras con IGV × ${dias} días`, valor: diasPago, formato: "dias", semaforo: diasPago === null ? "nd" : "info", lectura: diasPago === null ? "Sin compras en el periodo." : `Se paga a los proveedores, en promedio, en ${diasPago.toFixed(0)} días.`, referencia: "Informativo: conviene que sea mayor o igual al periodo de cobro" });
  const ciclo = diasCobro !== null && diasInv !== null && diasPago !== null ? diasCobro + diasInv - diasPago : null;
  add({ id: "cce", grupo: "Gestión", nombre: "Ciclo de conversión de efectivo", formula: "Días de cobro + Días de inventario − Días de pago", valor: ciclo, formato: "dias", semaforo: sem(ciclo, (x) => x <= 60, (x) => x <= 120), lectura: ciclo === null ? "Faltan datos de cobro, inventario o pago." : `Pasan ${ciclo.toFixed(0)} días desde que se paga al proveedor hasta que se cobra al cliente.`, referencia: "Bueno ≤ 60 días · Aceptable 60 a 120" });
  v = div(er.ventas, s.totalActivo);
  add({ id: "ra", grupo: "Gestión", nombre: "Rotación de activos", formula: "Ventas netas ÷ Activo total", valor: v, formato: "veces", semaforo: v === null ? "nd" : "info", lectura: v === null ? "Sin activos registrados." : `Cada S/ 1 de activos generó S/ ${v.toFixed(2)} de ventas en el periodo.`, referencia: "Informativo: mientras más alto, mejor uso de los activos" });
  return L;
}

/** Ratios al cierre del periodo: Estado de situación al corte y resultados acumulados del año hasta el corte. */
export function ratiosPeriodo(f: FuentesEEFF, p: Periodo) {
  const { hasta } = rangoPeriodo(p);
  const corte = hasta > hoy() && hoy().startsWith(String(p.anio)) ? hoy() : hasta;
  const desde = `${p.anio}-01-01`;
  const s = situacionFinanciera(f, corte);
  const er = estadoResultados(f, desde, corte);
  const dias = Math.max(1, Math.round((new Date(`${corte}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86400000) + 1);
  return { corte, dias, situacion: s, resultados: er, lista: ratios(s, er, dias, inventarioInicialAnio(f, p.anio)) };
}

/** Evolución mensual de los ratios principales (enero hasta el mes del corte). */
export function evolucionRatios(f: FuentesEEFF, anio: number, hastaMes: number): { mes: string; valores: Record<string, number | null> }[] {
  const out: { mes: string; valores: Record<string, number | null> }[] = [];
  for (let m = 1; m <= hastaMes; m++) {
    const r = ratiosPeriodo(f, { anio, mes: m });
    out.push({ mes: MESES_CORTOS[m - 1], valores: Object.fromEntries(r.lista.map((x) => [x.id, x.valor])) });
  }
  return out;
}

/** Corte del Estado de situación: fin del periodo (o hoy si el periodo aún no termina). */
export function cortePeriodo(p: Periodo): string {
  const { hasta } = rangoPeriodo(p);
  const h = hoy();
  return hasta > h && h.startsWith(String(p.anio)) ? h : hasta;
}
