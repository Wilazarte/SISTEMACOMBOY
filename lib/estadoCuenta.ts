// Estados de cuenta de Caja Chica, Caja General y Fondo de Reserva (Reportes › Estados de cuenta).
// Los movimientos se calculan de los documentos que ya registran de qué caja salió el dinero:
//   - facturas y gastos PAGADOS (campo caja; incluye los egresos de planilla),
//   - compras directas (caja),
//   - adelantos de sueldo (caja_nombre),
// más los movimientos manuales (saldo inicial, reposiciones) de la tabla contable, tipo MOVIMIENTO_CAJA.
// Así no hay un segundo registro que pueda descuadrarse: al pagar un gasto con Caja Chica, aparece aquí solo.
import type { Adelanto } from "./adelantos";
import type { Compra, Factura, MovimientoCajaManual } from "./types";

export const CUENTAS_CAJA = [
  { codigo: "CAJA_CHICA", nombre: "CAJA CHICA", titulo: "Caja Chica" },
  { codigo: "CAJA_GENERAL", nombre: "CAJA GENERAL", titulo: "Caja General" },
  { codigo: "FONDO_RESERVA", nombre: "FONDO DE RESERVA", titulo: "Fondo de Reserva" },
] as const;
export type CuentaCaja = (typeof CUENTAS_CAJA)[number]["nombre"];

export interface MovimientoCaja {
  id: string;
  cuenta: CuentaCaja;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  documento: string;
  proveedor: string;
  debe: number; // ingreso
  haber: number; // egreso
  origen: "GASTO" | "FACTURA" | "COMPRA" | "ADELANTO" | "MANUAL";
  saldo?: number; // saldo de su cuenta después del movimiento
}

const cuentaDe = (caja?: string | null): CuentaCaja | undefined => {
  const n = (caja ?? "").trim().toUpperCase();
  return CUENTAS_CAJA.find((c) => c.nombre === n)?.nombre;
};

/** Fecha en que se marcó pagada (historial); si no está, la del documento. */
const fechaPago = (f: Factura): string => [...f.historial].reverse().find((e) => /PAGADA/i.test(e.accion))?.fecha.slice(0, 10) ?? f.fecha;

/** Todos los movimientos de las 3 cajas, en orden de fecha, con el saldo acumulado de cada cuenta. */
export function movimientosCaja(facturas: Factura[], compras: Compra[], adelantos: Adelanto[], manuales: MovimientoCajaManual[]): MovimientoCaja[] {
  const out: MovimientoCaja[] = [];
  for (const f of facturas) {
    const cuenta = cuentaDe(f.caja);
    if (!cuenta || f.estadoPago !== "PAGADA") continue;
    out.push({
      id: `fac-${f.id}`,
      cuenta,
      fecha: fechaPago(f),
      concepto: f.tipoGasto === "PLANILLA" ? `Pago ${f.numero.replace(/^PLLA\s+/, "planilla ")}` : f.esGastoTesoreria ? f.descripcion || `Gasto ${f.numero}` : `Factura ${f.numero} · ${f.ocNumero}`,
      documento: f.esGastoTesoreria ? [f.codigo, f.comprobanteGasto === "DJ" ? f.numero : ""].filter(Boolean).join(" · ") || f.numero : f.numero,
      proveedor: f.proveedor,
      debe: 0,
      haber: f.netoPagar ?? f.total,
      origen: f.esGastoTesoreria ? "GASTO" : "FACTURA",
    });
  }
  for (const c of compras) {
    const cuenta = cuentaDe(c.caja);
    if (!cuenta) continue;
    out.push({ id: `com-${c.id}`, cuenta, fecha: c.fecha, concepto: `Compra ${c.tipoComprobante === "BOLETA" ? "boleta" : "factura"} ${c.numero}`, documento: c.numero, proveedor: c.proveedor, debe: 0, haber: c.total, origen: "COMPRA" });
  }
  for (const a of adelantos) {
    const cuenta = cuentaDe(a.caja_nombre);
    if (!cuenta || /anulad/i.test(a.estado)) continue;
    out.push({ id: `ade-${a.id}`, cuenta, fecha: a.fecha, concepto: `Adelanto de sueldo${a.motivo ? ` · ${a.motivo}` : ""}`, documento: "ADELANTO", proveedor: a.trabajador_nombre, debe: 0, haber: a.monto, origen: "ADELANTO" });
  }
  for (const m of manuales) {
    const cuenta = cuentaDe(m.cuenta);
    if (!cuenta) continue;
    out.push({
      id: `man-${m.id}`,
      cuenta,
      fecha: m.fecha,
      concepto: m.concepto,
      documento: m.documento ?? "-",
      proveedor: m.proveedor ?? "-",
      debe: m.tipo === "INGRESO" ? m.monto : 0,
      haber: m.tipo === "EGRESO" ? m.monto : 0,
      origen: "MANUAL",
    });
  }
  // Ingresos primero el mismo día (un saldo inicial no debe quedar después de los egresos de ese día)
  out.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.debe - a.debe);
  const saldos = new Map<string, number>();
  for (const m of out) {
    const s = Math.round(((saldos.get(m.cuenta) ?? 0) + m.debe - m.haber) * 100) / 100;
    saldos.set(m.cuenta, s);
    m.saldo = s;
  }
  return out;
}

/** Saldo de una cuenta hasta una fecha (exclusive) y totales del rango [desde, hasta]. */
export function resumenCuenta(movs: MovimientoCaja[], cuenta: CuentaCaja, desde: string, hasta: string) {
  const de = movs.filter((m) => m.cuenta === cuenta);
  const suma = (l: MovimientoCaja[], k: "debe" | "haber") => Math.round(l.reduce((a, m) => a + m[k], 0) * 100) / 100;
  const antes = de.filter((m) => m.fecha < desde);
  const rango = de.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const saldoInicial = Math.round((suma(antes, "debe") - suma(antes, "haber")) * 100) / 100;
  const ingresos = suma(rango, "debe");
  const egresos = suma(rango, "haber");
  return { saldoInicial, ingresos, egresos, saldoFinal: Math.round((saldoInicial + ingresos - egresos) * 100) / 100, saldoActual: de.length ? de[de.length - 1].saldo ?? 0 : 0 };
}
