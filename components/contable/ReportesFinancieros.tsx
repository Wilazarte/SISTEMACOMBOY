"use client";

// Finanzas › Contabilidad: Flujo de caja, Estados financieros (Situación + Resultados) y Ratios (Williams, 2026-11-27).
// Los cálculos están en lib/estadosFinancieros.ts; aquí solo se muestran, se exportan (PDF / Excel) y se editan
// los datos de apertura que el ERP no registra (capital, saldos iniciales, gastos financieros…).

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Gauge, Plus, Settings2, Trash2, Wallet } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Textarea, cn, ejecutar } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { listarAdelantos, type Adelanto } from "@/lib/adelantos";
import type { Activo } from "@/lib/activos";
import { normalizarActivo } from "@/lib/activos";
import { listarHistorial, type HistorialPlanilla } from "@/lib/historial";
import {
  MESES,
  TIPOS_AJUSTE,
  UIT_DEFECTO,
  cortePeriodo,
  datosDelAnio,
  estadoResultados,
  evolucionRatios,
  flujoDeCaja,
  formatoRatio,
  guardarDatosEEFF,
  nombrePeriodo,
  rangoPeriodo,
  ratiosPeriodo,
  situacionFinanciera,
  type AjusteEEFF,
  type DatosEEFF,
  type EstadoResultados,
  type FuentesEEFF,
  type GrupoRatio,
  type LineaESF,
  type Periodo,
  type Ratio,
  type Semaforo,
  type SituacionFinanciera,
} from "@/lib/estadosFinancieros";
import { EMPRESA } from "@/lib/empresa";
import { guardarExcel } from "@/lib/guardarArchivo";
import { pdfReporteFinanciero, type FilaReporteFin } from "@/lib/pdf";
import { KEYS, fechaPE, hoy, soles, useStore } from "@/lib/storage";
import type { CobroVenta, Compra, ComprobanteVenta, Factura, MovimientoCajaManual, MovimientoKardex, NotaPedido, StockItem } from "@/lib/types";

// ------------------------------------------------------------------ Datos

/** Lee en vivo todo lo que usan los reportes; adelantos y planilla vienen de sus tablas (si el usuario puede verlas). */
export function useFuentesEEFF(): FuentesEEFF {
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const compras = useStore<Compra[]>(KEYS.COMPRAS, []);
  const manuales = useStore<MovimientoCajaManual[]>(KEYS.MOV_CAJA, []);
  const cobros = useStore<CobroVenta[]>(KEYS.COBROS, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const kardex = useStore<MovimientoKardex[]>(KEYS.KARDEX, []);
  const activosRaw = useStore<Activo[]>(KEYS.ACTIVOS, []);
  const datos = useStore<DatosEEFF[]>(KEYS.CONTABLE_DATOS_EEFF, []);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [planilla, setPlanilla] = useState<HistorialPlanilla[] | null>(null);
  useEffect(() => {
    listarAdelantos()
      .then(setAdelantos)
      .catch(() => setAdelantos([]));
    listarHistorial()
      .then(setPlanilla)
      .catch(() => setPlanilla(null)); // sin permiso a la planilla: se usan los pagos de planilla
  }, []);
  return useMemo(
    () => ({ facturas, compras, adelantos, manuales, cobros, notas, comprobantes, stock, kardex, activos: activosRaw.map(normalizarActivo), planilla, datos }),
    [facturas, compras, adelantos, manuales, cobros, notas, comprobantes, stock, kardex, activosRaw, planilla, datos]
  );
}

const puedeEditarDatos = () => {
  const s = getSesion();
  return !!s && !s.soloLectura && ["creador", "tesoreria"].includes(s.rol);
};

/** Formato contable: negativos entre paréntesis, cero como guion. */
export const monto = (n: number): string => {
  if (!n || Math.abs(n) < 0.005) return "-";
  const t = Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${t})` : t;
};

const datosPdf = (p: Periodo, extra: [string, string][] = []): [string, string][] => [
  ["Empresa", EMPRESA.razonSocial],
  ["RUC", EMPRESA.ruc],
  ["Periodo", nombrePeriodo(p)],
  ...extra,
  ["Moneda", "Soles (S/)"],
  ["Emitido", fechaPE(hoy())],
];

function Stat({ label, valor, tono }: { label: string; valor: string; tono?: "pos" | "neg" }) {
  return (
    <div className="rounded-xl border border-plomo-200 bg-surface/80 p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-plomo-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tono === "neg" ? "text-vino" : tono === "pos" ? "text-emerald-700" : "text-fg")}>{valor}</p>
    </div>
  );
}

function Aviso({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
      <span className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{children}</span>
      </span>
      {accion}
    </div>
  );
}

function BotonesExportar({ onPdf, onExcel, onDatos }: { onPdf: () => void; onExcel: () => void; onDatos?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={onPdf}>
        <FileDown size={15} /> PDF
      </Button>
      <Button variant="secondary" onClick={() => void onExcel()}>
        <FileSpreadsheet size={15} /> Excel
      </Button>
      {onDatos && (
        <Button variant="ghost" onClick={onDatos}>
          <Settings2 size={15} /> Datos de apertura
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Flujo de caja

export function FlujoCajaTab({ periodo }: { periodo: Periodo }) {
  const f = useFuentesEEFF();
  const fc = useMemo(() => flujoDeCaja(f, periodo), [f, periodo]);
  const [verMovs, setVerMovs] = useState(false);
  const [datosAbierto, setDatosAbierto] = useState(false);
  const ingresos = fc.movimientos.filter((m) => m.monto > 0 && m.actividad !== "APERTURA").reduce((a, m) => a + m.monto, 0);
  const egresos = fc.movimientos.filter((m) => m.monto < 0).reduce((a, m) => a - m.monto, 0);
  const conTotal = fc.columnas.length > 1;
  const titulo = `Flujo de caja · ${nombrePeriodo(periodo)}`;

  const filasPdf = (): FilaReporteFin[] =>
    fc.filas.map((r) => ({
      tipo: r.tipo === "saldo" ? "subtotal" : r.tipo,
      celdas: r.tipo === "titulo" ? [r.texto, ...fc.columnas.map(() => ""), ...(conTotal ? [""] : [])] : [r.texto, ...r.valores.map(monto), ...(conTotal ? [monto(r.total)] : [])],
    }));
  const exportarPdf = () =>
    pdfReporteFinanciero({
      titulo: "ESTADO DE FLUJO DE EFECTIVO",
      subtitulo: nombrePeriodo(periodo).toUpperCase(),
      datos: datosPdf(periodo, [["Método", "Directo (NIC 7)"]]),
      horizontal: conTotal,
      secciones: [
        { titulo: "Flujo de caja", head: ["Concepto", ...fc.columnas, ...(conTotal ? ["Total"] : [])], filas: filasPdf(), derecha: Array.from({ length: fc.columnas.length + 1 }, (_, i) => i + 1), anchos: { 0: conTotal ? 62 : 110 } },
        {
          titulo: "Movimiento por caja",
          head: ["Caja / fuente", "Ingresos", "Egresos", "Neto"],
          filas: fc.porCaja.map((c) => ({ celdas: [c.caja, monto(c.ingresos), monto(c.egresos), monto(c.neto)] })),
          derecha: [1, 2, 3],
        },
      ],
      notas: notasFlujo(fc.noEfectivo.prestamo, fc.noEfectivo.credito),
      archivo: `Flujo-de-caja-${nombrePeriodo(periodo).replace(/\s+/g, "-")}`,
    });
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const filas = fc.filas.map((r) => {
      const o: Record<string, string | number> = { Concepto: r.texto };
      fc.columnas.forEach((c, i) => (o[c] = r.tipo === "titulo" ? "" : (r.valores[i] ?? 0)));
      if (conTotal) o.Total = r.tipo === "titulo" ? "" : r.total;
      return o;
    });
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Flujo de caja");
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(fc.movimientos.map((m) => ({ Fecha: fechaPE(m.fecha), Actividad: m.actividad, Rubro: m.rubro, Concepto: m.concepto, Documento: m.documento, Tercero: m.tercero, Caja: m.caja, Ingreso: m.monto > 0 ? m.monto : "", Egreso: m.monto < 0 ? -m.monto : "" }))),
      "Movimientos"
    );
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(fc.porCaja.map((c) => ({ Caja: c.caja, Ingresos: c.ingresos, Egresos: c.egresos, Neto: c.neto }))), "Por caja");
    await guardarExcel(libro, `Flujo-de-caja-${nombrePeriodo(periodo).replace(/\s+/g, "-")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saldo inicial" valor={soles(fc.saldoInicial)} />
        <Stat label="Ingresos de efectivo" valor={soles(ingresos)} tono="pos" />
        <Stat label="Egresos de efectivo" valor={soles(egresos)} tono="neg" />
        <Stat label="Saldo final" valor={soles(fc.saldoFinal)} tono={fc.saldoFinal < 0 ? "neg" : undefined} />
      </div>
      {fc.saldoFinal < 0 && (
        <Aviso accion={puedeEditarDatos() ? <Button size="sm" variant="secondary" onClick={() => setDatosAbierto(true)}>Ingresar saldo inicial</Button> : undefined}>
          El saldo de efectivo sale negativo: falta el saldo inicial de las cajas o hay cobros sin registrar. Regístrelo en Estados de cuenta (movimiento «Saldo inicial») o en Datos de apertura.
        </Aviso>
      )}
      <Card>
        <CardHeader title={titulo} subtitle="Método directo (NIC 7): cobros y pagos reales de Caja General, Caja Chica, Fondo de Reserva y Otros. Los negativos van entre paréntesis." action={<BotonesExportar onPdf={exportarPdf} onExcel={exportarExcel} onDatos={() => setDatosAbierto(true)} />} />
        <div className="overflow-x-auto">
          <table className={cn("tabla-fija w-full text-[13px]", conTotal ? "min-w-[1500px]" : "min-w-[560px]")}>
            <thead>
              <tr className="bg-azul-900 text-left text-[11px] uppercase tracking-wider" style={{ color: "#fff" }}>
                <th className="sticky left-0 z-10 min-w-[260px] bg-azul-900 px-4 py-2.5" style={{ color: "#fff" }}>Concepto</th>
                {fc.columnas.map((c) => (
                  <th key={c} className="px-3 py-2.5 text-right" style={{ color: "#fff" }}>
                    {c}
                  </th>
                ))}
                {conTotal && <th className="px-4 py-2.5 text-right" style={{ color: "#fff" }}>Total</th>}
              </tr>
            </thead>
            <tbody>
              {fc.filas.map((r) =>
                r.tipo === "titulo" ? (
                  <tr key={r.clave} className="bg-plomo-100">
                    <td className="sticky left-0 z-10 bg-plomo-100 px-4 py-2 text-[12px] font-bold text-azul-900" colSpan={1}>
                      {r.texto}
                    </td>
                    <td colSpan={fc.columnas.length + (conTotal ? 1 : 0)} />
                  </tr>
                ) : (
                  <tr key={r.clave} className={cn("border-t border-plomo-100", r.tipo === "linea" && "bg-surface", r.tipo === "subtotal" && "bg-plomo-50 font-semibold", r.tipo === "saldo" && "bg-plomo-50", r.tipo === "total" && "bg-azul-900 font-bold text-white")}>
                    <td className={cn("sticky left-0 z-10 px-4 py-2", r.tipo === "linea" && "bg-surface pl-7", r.tipo === "subtotal" && "bg-plomo-50", r.tipo === "saldo" && "bg-plomo-50", r.tipo === "total" && "bg-azul-900")}>{r.texto}</td>
                    {r.valores.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", v < 0 && r.tipo !== "total" && "text-vino")}>
                        {monto(v)}
                      </td>
                    ))}
                    {conTotal && <td className={cn("whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums", r.total < 0 && r.tipo !== "total" && "text-vino")}>{monto(r.total)}</td>}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Movimiento por caja" subtitle={nombrePeriodo(periodo)} />
          <div className="overflow-x-auto">
            <table className="tabla-fija w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-plomo-500">
                  <th className="px-4 py-2">Caja / fuente</th>
                  <th className="px-4 py-2 text-right">Ingresos</th>
                  <th className="px-4 py-2 text-right">Egresos</th>
                  <th className="px-4 py-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {fc.porCaja.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-plomo-500">
                      Sin movimientos en el periodo.
                    </td>
                  </tr>
                )}
                {fc.porCaja.map((c) => (
                  <tr key={c.caja} className="border-t border-plomo-100">
                    <td className="px-4 py-2 font-medium text-fg">
                      <span className="inline-flex items-center gap-1.5">
                        <Wallet size={13} className="text-plomo-500" /> {c.caja}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700">{monto(c.ingresos)}</td>
                    <td className="px-4 py-2 text-right text-vino">{monto(c.egresos)}</td>
                    <td className={cn("px-4 py-2 text-right font-semibold", c.neto < 0 && "text-vino")}>{monto(c.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Pagos que no movieron efectivo" subtitle="Hechos con PRÉSTAMO (pagó un tercero) o a CRÉDITO (queda la deuda). No entran al flujo: figuran como deuda en el Estado de Situación." />
          <div className="space-y-2 p-5 text-[13px]">
            <p className="flex justify-between">
              <span>Pagados con PRÉSTAMO ({fc.noEfectivo.detalle.prestamo.length})</span>
              <b>{soles(fc.noEfectivo.prestamo)}</b>
            </p>
            <p className="flex justify-between">
              <span>Pagados a CRÉDITO ({fc.noEfectivo.detalle.credito.length})</span>
              <b>{soles(fc.noEfectivo.credito)}</b>
            </p>
            {[...fc.noEfectivo.detalle.prestamo, ...fc.noEfectivo.detalle.credito].slice(0, 8).map((x, i) => (
              <p key={i} className="flex justify-between gap-3 text-[12px] text-plomo-500">
                <span className="truncate">
                  {fechaPE(x.fecha)} · {x.documento} · {x.tercero}
                </span>
                <span>{soles(x.monto)}</span>
              </p>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <button type="button" onClick={() => setVerMovs(!verMovs)} className="flex w-full items-center justify-between px-5 py-4 text-left">
          <span className="text-[14px] font-bold uppercase tracking-wide text-fg">Detalle de movimientos ({fc.movimientos.length})</span>
          {verMovs ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {verMovs && (
          <div className="max-h-[480px] overflow-auto border-t border-plomo-100">
            <table className="tabla-fija w-full min-w-[720px] text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left uppercase tracking-wider text-plomo-500">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Rubro</th>
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2">Tercero</th>
                  <th className="px-3 py-2">Caja</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {fc.movimientos.map((m) => (
                  <tr key={m.id} className="border-t border-plomo-100">
                    <td className="whitespace-nowrap px-3 py-1.5">{fechaPE(m.fecha)}</td>
                    <td className="px-3 py-1.5">{m.rubro}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5" title={m.concepto}>
                      {m.concepto}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-1.5">{m.tercero}</td>
                    <td className="px-3 py-1.5">{m.caja}</td>
                    <td className={cn("whitespace-nowrap px-3 py-1.5 text-right font-medium", m.monto < 0 ? "text-vino" : "text-emerald-700")}>{monto(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[12px] text-plomo-500">
        Cómo se clasifica: cobros de clientes, pagos a proveedores, gastos, planilla y adelantos van a Operación; las compras cuyo comprobante figura en el registro de Activos van a Inversión; los movimientos manuales de caja con «préstamo», «aporte», «capital» o «dividendo» en el concepto van a Financiamiento, y los que dicen «saldo inicial» se toman como saldo de apertura.
      </p>
      <DatosAperturaModal open={datosAbierto} onClose={() => setDatosAbierto(false)} anio={periodo.anio} />
    </div>
  );
}

const notasFlujo = (prestamo: number, credito: number): string[] => [
  "Método directo (NIC 7). Fuente: cobros de Ventas, gastos y facturas pagados, compras directas, adelantos de sueldo y movimientos manuales de caja del ERP.",
  ...(prestamo || credito ? [`No movieron efectivo: pagos con PRÉSTAMO ${soles(prestamo)} y a CRÉDITO ${soles(credito)}; figuran como deuda en el Estado de Situación Financiera.`] : []),
  "Montos negativos entre paréntesis.",
];

// ------------------------------------------------------------------ Estados financieros

function LineaEF({ cuenta, texto, valores, tipo = "linea", origen, onClick, abierta }: { cuenta?: string; texto: string; valores: number[]; tipo?: "linea" | "subtotal" | "total" | "detalle"; origen?: string; onClick?: () => void; abierta?: boolean }) {
  return (
    <tr className={cn("border-t border-plomo-100", tipo === "subtotal" && "bg-plomo-50 font-semibold", tipo === "total" && "bg-azul-900 font-bold text-white", tipo === "detalle" && "text-[12px] text-plomo-500", onClick && "cursor-pointer hover:bg-plomo-50")} onClick={onClick}>
      <td className={cn("px-4 py-2", tipo === "detalle" && "pl-10")}>
        <span className="inline-flex items-center gap-1.5">
          {onClick && (abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
          {cuenta && <span className={cn("w-10 shrink-0 text-[11px]", tipo === "total" ? "text-white/70" : "text-plomo-500")}>{cuenta}</span>}
          <span>{texto}</span>
        </span>
        {origen && <span className="block pl-[46px] text-[11px] font-normal text-plomo-500">{origen}</span>}
      </td>
      {valores.map((v, i) => (
        <td key={i} className={cn("whitespace-nowrap px-4 py-2 text-right tabular-nums", v < 0 && tipo !== "total" && "text-vino")}>
          {monto(v)}
        </td>
      ))}
    </tr>
  );
}

function TablaEF({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabla-fija w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-plomo-500">
            {head.map((h, i) => (
              <th key={h} className={cn("px-4 py-2", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Titulo = ({ texto, cols }: { texto: string; cols: number }) => (
  <tr className="bg-plomo-100">
    <td colSpan={cols} className="px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-azul-900">
      {texto}
    </td>
  </tr>
);

type ClaveDetalle = "ventas" | "costo" | "gv" | "ga";

function filasER(): { clave?: ClaveDetalle; cuenta: string; texto: string; tipo: "linea" | "subtotal" | "total"; v: (e: EstadoResultados) => number }[] {
  return [
    { clave: "ventas", cuenta: "70", texto: "Ventas netas (ingresos de actividades ordinarias)", tipo: "linea", v: (e) => e.ventas },
    { clave: "costo", cuenta: "69", texto: "(−) Costo de ventas", tipo: "linea", v: (e) => -e.costoVentas },
    { cuenta: "", texto: "UTILIDAD BRUTA", tipo: "subtotal", v: (e) => e.utilidadBruta },
    { clave: "gv", cuenta: "95", texto: "(−) Gastos de ventas", tipo: "linea", v: (e) => -e.gastosVentas },
    { clave: "ga", cuenta: "94", texto: "(−) Gastos de administración", tipo: "linea", v: (e) => -e.gastosAdministracion },
    { cuenta: "", texto: "UTILIDAD OPERATIVA", tipo: "subtotal", v: (e) => e.utilidadOperativa },
    { cuenta: "75/77", texto: "(+) Otros ingresos", tipo: "linea", v: (e) => e.otrosIngresos },
    { cuenta: "97", texto: "(−) Gastos financieros", tipo: "linea", v: (e) => -e.gastosFinancieros },
    { cuenta: "65", texto: "(−) Otros gastos", tipo: "linea", v: (e) => -e.otrosGastos },
    { cuenta: "", texto: "RESULTADO ANTES DE IMPUESTO A LA RENTA", tipo: "subtotal", v: (e) => e.resultadoAntesIR },
    { cuenta: "88", texto: "(−) Impuesto a la renta (estimado)", tipo: "linea", v: (e) => -e.impuestoRenta },
    { cuenta: "89", texto: "RESULTADO NETO DEL EJERCICIO", tipo: "total", v: (e) => e.resultadoNeto },
  ];
}

const detalleDe = (e: EstadoResultados, c: ClaveDetalle) => (c === "ventas" ? e.detalleVentas : c === "costo" ? e.detalleCosto : c === "gv" ? e.detalleGastosVentas : e.detalleGastosAdm);

function seccionesESF(s: SituacionFinanciera): { titulo: string; lineas: LineaESF[]; total: [string, number] }[] {
  return [
    { titulo: "Activo corriente", lineas: s.activoCorriente, total: ["Total activo corriente", s.totalActivoCorriente] },
    { titulo: "Activo no corriente", lineas: s.activoNoCorriente, total: ["Total activo no corriente", s.totalActivoNoCorriente] },
    { titulo: "Pasivo corriente", lineas: s.pasivoCorriente, total: ["Total pasivo corriente", s.totalPasivoCorriente] },
    { titulo: "Pasivo no corriente", lineas: s.pasivoNoCorriente, total: ["Total pasivo no corriente", s.totalPasivoNoCorriente] },
    { titulo: "Patrimonio", lineas: s.patrimonio, total: ["Total patrimonio", s.totalPatrimonio] },
  ];
}

export function EstadosFinancierosTab({ periodo, libroDiario }: { periodo: Periodo; libroDiario: ReactNode }) {
  const [vista, setVista] = useState<"erp" | "diario">("erp");
  const f = useFuentesEEFF();
  const corte = cortePeriodo(periodo);
  const desde = rangoPeriodo(periodo).desde;
  // Resultados hasta el mismo corte del Estado de Situación (si el periodo aún no termina, hasta hoy)
  const hasta = corte;
  const er = useMemo(() => estadoResultados(f, desde, hasta), [f, desde, hasta]);
  const acum = useMemo(() => (periodo.mes ? estadoResultados(f, `${periodo.anio}-01-01`, hasta) : null), [f, periodo, hasta]);
  const s = useMemo(() => situacionFinanciera(f, corte), [f, corte]);
  const [abierta, setAbierta] = useState<ClaveDetalle | null>(null);
  const [datosAbierto, setDatosAbierto] = useState(false);
  const alCorte = corte < rangoPeriodo(periodo).hasta ? ` al ${fechaPE(corte)}` : "";
  const colsER = acum ? [`${MESES[(periodo.mes ?? 1) - 1]}${alCorte}`, `Acumulado ${periodo.anio}`] : [`Año ${periodo.anio}${alCorte}`];
  const ers = acum ? [er, acum] : [er];
  const filas = filasER();
  const nombre = nombrePeriodo(periodo);

  const exportarPdf = () => {
    const filasESF: FilaReporteFin[] = [];
    seccionesESF(s).forEach((sec, i) => {
      if (i === 0) filasESF.push({ tipo: "titulo", celdas: ["ACTIVO", "", ""] });
      if (i === 2) filasESF.push({ tipo: "total", celdas: ["TOTAL ACTIVO", "", monto(s.totalActivo)] }, { tipo: "titulo", celdas: ["PASIVO Y PATRIMONIO", "", ""] });
      filasESF.push({ tipo: "titulo", celdas: [sec.titulo, "", ""] });
      sec.lineas.forEach((l) => filasESF.push({ celdas: [`${l.cuenta}  ${l.texto}`, l.origen, monto(l.monto)] }));
      filasESF.push({ tipo: "subtotal", celdas: [sec.total[0], "", monto(sec.total[1])] });
      if (i === 3) filasESF.push({ tipo: "subtotal", celdas: ["TOTAL PASIVO", "", monto(s.totalPasivo)] });
    });
    filasESF.push({ tipo: "total", celdas: ["TOTAL PASIVO Y PATRIMONIO", "", monto(s.totalPasivo + s.totalPatrimonio)] });
    const filasERpdf: FilaReporteFin[] = [];
    filas.forEach((r) => {
      filasERpdf.push({ tipo: r.tipo, celdas: [`${r.cuenta ? `${r.cuenta}  ` : ""}${r.texto}`, ...ers.map((e) => monto(r.v(e)))] });
      if (r.clave) detalleDe(er, r.clave).forEach((d) => filasERpdf.push({ celdas: [`      ${d.texto}`, monto(d.monto), ...(acum ? [""] : [])] }));
    });
    pdfReporteFinanciero({
      titulo: "ESTADOS FINANCIEROS",
      subtitulo: nombre.toUpperCase(),
      datos: datosPdf(periodo, [["Situación al", fechaPE(corte)]]),
      secciones: [
        { titulo: `Estado de Situación Financiera al ${fechaPE(corte)}`, head: ["Rubro (PCGE)", "Origen del dato", "S/"], filas: filasESF, derecha: [2], anchos: { 0: 78, 2: 30 } },
        { titulo: `Estado de Resultados (por función) · ${nombre}`, head: ["Concepto (PCGE)", ...colsER], filas: filasERpdf, derecha: ers.map((_, i) => i + 1), anchos: { 0: 110 } },
      ],
      notas: notasEEFF(s, er),
      archivo: `Estados-financieros-${nombre.replace(/\s+/g, "-")}`,
    });
  };
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const esf: Record<string, string | number>[] = [];
    seccionesESF(s).forEach((sec) => {
      esf.push({ Cuenta: "", Rubro: sec.titulo.toUpperCase(), Origen: "", Monto: "" });
      sec.lineas.forEach((l) => esf.push({ Cuenta: l.cuenta, Rubro: l.texto, Origen: l.origen, Monto: l.monto }));
      esf.push({ Cuenta: "", Rubro: sec.total[0], Origen: "", Monto: sec.total[1] });
    });
    esf.push({ Cuenta: "", Rubro: "TOTAL ACTIVO", Origen: "", Monto: s.totalActivo }, { Cuenta: "", Rubro: "TOTAL PASIVO Y PATRIMONIO", Origen: "", Monto: r2(s.totalPasivo + s.totalPatrimonio) });
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(esf), "Situación financiera");
    const erx: Record<string, string | number>[] = [];
    filas.forEach((r) => {
      const o: Record<string, string | number> = { Cuenta: r.cuenta, Concepto: r.texto };
      colsER.forEach((c, i) => (o[c] = r.v(ers[i])));
      erx.push(o);
      if (r.clave) detalleDe(er, r.clave).forEach((d) => erx.push({ Cuenta: "", Concepto: `   ${d.texto}`, [colsER[0]]: d.monto }));
    });
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(erx), "Estado de resultados");
    await guardarExcel(libro, `Estados-financieros-${nombre.replace(/\s+/g, "-")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-plomo-200 bg-surface p-1 text-[13px] shadow-card">
          {(
            [
              ["erp", "Desde las operaciones del ERP"],
              ["diario", "Según Libro Diario"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setVista(id)} className={cn("rounded-md px-3 py-1.5 font-medium transition", vista === id ? "bg-azul-900 text-white" : "text-plomo-600 hover:bg-plomo-100")}>
              {label}
            </button>
          ))}
        </div>
        {vista === "erp" && <BotonesExportar onPdf={exportarPdf} onExcel={exportarExcel} onDatos={() => setDatosAbierto(true)} />}
      </div>
      {vista === "diario" ? (
        libroDiario
      ) : (
        <>
          {(Math.abs(s.diferencia) >= 1 || s.faltaApertura.length > 0) && (
            <Aviso accion={<Button size="sm" variant="secondary" onClick={() => setDatosAbierto(true)}>{puedeEditarDatos() ? "Completar datos de apertura" : "Ver datos de apertura"}</Button>}>
              {s.faltaApertura.length > 0 && <>Faltan datos que el ERP no registra: {s.faltaApertura.join(", ")}. </>}
              {Math.abs(s.diferencia) >= 1 && (
                <>
                  La «Diferencia por conciliar» ({soles(s.diferencia)}) es lo que falta para que Activo = Pasivo + Patrimonio; se reduce al ingresar los saldos de apertura del año.
                </>
              )}
            </Aviso>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title={`Estado de Situación Financiera al ${fechaPE(corte)}`} subtitle="Formato SMV / PCGE. Debajo de cada rubro se indica de dónde sale la cifra." />
              <TablaEF head={["Rubro", "S/"]}>
                <Titulo texto="Activo" cols={2} />
                {seccionesESF(s).map((sec, i) => (
                  <Fragment key={sec.titulo}>
                    {i === 2 && (
                      <>
                        <LineaEF texto="TOTAL ACTIVO" valores={[s.totalActivo]} tipo="total" />
                        <Titulo texto="Pasivo y patrimonio" cols={2} />
                      </>
                    )}
                    {sec.lineas.length > 0 && <tr><td colSpan={2} className="px-4 pt-3 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">{sec.titulo}</td></tr>}
                    {sec.lineas.map((l) => (
                      <LineaEF key={l.texto} cuenta={l.cuenta} texto={l.texto} valores={[l.monto]} origen={l.origen} />
                    ))}
                    {sec.lineas.length > 0 && <LineaEF texto={sec.total[0]} valores={[sec.total[1]]} tipo="subtotal" />}
                    {i === 3 && <LineaEF texto="TOTAL PASIVO" valores={[s.totalPasivo]} tipo="subtotal" />}
                  </Fragment>
                ))}
                <LineaEF texto="TOTAL PASIVO Y PATRIMONIO" valores={[r2(s.totalPasivo + s.totalPatrimonio)]} tipo="total" />
              </TablaEF>
            </Card>
            <Card>
              <CardHeader title={`Estado de Resultados · ${nombre}`} subtitle="Por función (formato SMV). Haga clic en ventas, costo o gastos para ver el detalle." />
              <TablaEF head={["Concepto", ...colsER]}>
                {filas.map((r) => (
                  <Fragment key={r.texto}>
                    <LineaEF cuenta={r.cuenta || undefined} texto={r.texto} valores={ers.map(r.v)} tipo={r.tipo} onClick={r.clave ? () => setAbierta(abierta === r.clave ? null : (r.clave ?? null)) : undefined} abierta={abierta === r.clave} />
                    {r.clave && abierta === r.clave && detalleDe(er, r.clave).map((d) => <LineaEF key={d.texto} texto={d.texto} valores={acum ? [d.monto, 0] : [d.monto]} tipo="detalle" />)}
                    {r.clave && abierta === r.clave && detalleDe(er, r.clave).length === 0 && (
                      <tr>
                        <td colSpan={ers.length + 1} className="px-10 py-2 text-[12px] text-plomo-500">
                          Sin movimientos en el periodo.
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </TablaEF>
              <p className="px-5 py-3 text-[11px] text-plomo-500">
                Costo de ventas = inventario inicial + compras − inventario final (kardex × último costo). IR estimado con el régimen {datosDelAnio(periodo.anio, f.datos).regimen === "MYPE" ? "MYPE Tributario (10 % hasta 15 UIT, 29.5 % el exceso)" : "General (29.5 %)"}; no descuenta pagos a cuenta.
                {er.planillaDesdePagos && " Gastos de personal tomados de los pagos de planilla (su usuario no puede leer la planilla cerrada)."}
              </p>
            </Card>
          </div>
        </>
      )}
      <DatosAperturaModal open={datosAbierto} onClose={() => setDatosAbierto(false)} anio={periodo.anio} />
    </div>
  );
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const notasEEFF = (s: SituacionFinanciera, er: EstadoResultados): string[] => [
  "Estados financieros gerenciales calculados con las operaciones registradas en el ERP COMBOY VID; no reemplazan los estados financieros firmados por el contador.",
  "Costo de ventas por el método periódico: inventario inicial + compras (sin IGV) − inventario final, valorizado con el último costo del kardex.",
  `Impuesto a la renta estimado sobre la utilidad antes de impuestos (${soles(er.resultadoAntesIR)}); no descuenta pagos a cuenta. IGV: solo el saldo del mes de corte.`,
  ...(Math.abs(s.diferencia) >= 0.01 ? [`Diferencia por conciliar ${soles(s.diferencia)}: corresponde a saldos de apertura (capital, efectivo, deudas) aún no ingresados.`] : []),
];

// ------------------------------------------------------------------ Ratios

const GRUPOS: GrupoRatio[] = ["Liquidez", "Endeudamiento", "Rentabilidad", "Gestión"];
const COLOR: Record<Semaforo, { borde: string; punto: string; texto: string; etiqueta: string }> = {
  bueno: { borde: "border-emerald-300", punto: "bg-emerald-500", texto: "text-emerald-700", etiqueta: "Saludable" },
  regular: { borde: "border-amber-300", punto: "bg-amber-500", texto: "text-amber-700", etiqueta: "Atención" },
  malo: { borde: "border-red-300", punto: "bg-corp", texto: "text-vino", etiqueta: "Riesgo" },
  info: { borde: "border-plomo-200", punto: "bg-azul-500", texto: "text-fg", etiqueta: "Informativo" },
  nd: { borde: "border-plomo-200", punto: "bg-plomo-300", texto: "text-plomo-500", etiqueta: "Sin datos" },
};
const EVOLUCION = ["liq", "acida", "end", "mn", "pc"];

export function RatiosTab({ periodo }: { periodo: Periodo }) {
  const f = useFuentesEEFF();
  const r = useMemo(() => ratiosPeriodo(f, periodo), [f, periodo]);
  const hastaMes = Number(r.corte.slice(5, 7));
  const [verEvol, setVerEvol] = useState(false);
  const evol = useMemo(() => (verEvol ? evolucionRatios(f, periodo.anio, hastaMes) : []), [verEvol, f, periodo.anio, hastaMes]);
  const [datosAbierto, setDatosAbierto] = useState(false);
  const titulo = `Ratios financieros al ${fechaPE(r.corte)}`;

  const exportarPdf = () =>
    pdfReporteFinanciero({
      titulo: "RATIOS FINANCIEROS",
      subtitulo: `AL ${fechaPE(r.corte)}`,
      datos: datosPdf(periodo, [["Resultados", `Acumulado ${periodo.anio} (${r.dias} días)`]]),
      secciones: GRUPOS.map((g) => ({
        titulo: `Ratios de ${g.toLowerCase()}`,
        head: ["Ratio", "Fórmula", "Valor", "Estado", "Lectura"],
        filas: r.lista.filter((x) => x.grupo === g).map((x) => ({ celdas: [x.nombre, x.formula, formatoRatio(x), COLOR[x.semaforo].etiqueta, `${x.lectura} (${x.referencia})`] })),
        derecha: [2],
        anchos: { 0: 34, 1: 44, 2: 22, 3: 18 },
      })),
      notas: [`Base: Estado de Situación al ${fechaPE(r.corte)} y Estado de Resultados acumulado del ${periodo.anio}. Los días se calculan sobre ${r.dias} días del año.`, ...notasEEFF(r.situacion, r.resultados).slice(0, 1)],
      archivo: `Ratios-financieros-${r.corte}`,
    });
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(r.lista.map((x) => ({ Grupo: x.grupo, Ratio: x.nombre, Fórmula: x.formula, Valor: x.valor === null ? "N/D" : x.formato === "pct" ? r2(x.valor * 100) : r2(x.valor), Unidad: x.formato === "pct" ? "%" : x.formato, Estado: COLOR[x.semaforo].etiqueta, Lectura: x.lectura, Referencia: x.referencia }))),
      "Ratios"
    );
    const ev = evolucionRatios(f, periodo.anio, hastaMes);
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(ev.map((e) => Object.fromEntries([["Mes", e.mes], ...r.lista.map((x) => [x.nombre, e.valores[x.id] === null ? "N/D" : x.formato === "pct" ? r2((e.valores[x.id] ?? 0) * 100) : r2(e.valores[x.id] ?? 0)])]))),
      "Evolución mensual"
    );
    await guardarExcel(libro, `Ratios-financieros-${r.corte}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={titulo} subtitle={`Estado de Situación al corte y resultados acumulados del ${periodo.anio} (${r.dias} días). Verde = saludable · ámbar = atención · rojo = riesgo.`} action={<BotonesExportar onPdf={exportarPdf} onExcel={exportarExcel} onDatos={() => setDatosAbierto(true)} />} />
        {(Math.abs(r.situacion.diferencia) >= 1 || r.situacion.faltaApertura.length > 0) && (
          <div className="px-5 pt-4">
            <Aviso>Los ratios de endeudamiento y rentabilidad sobre patrimonio dependen de los datos de apertura ({r.situacion.faltaApertura.join(", ") || "saldos iniciales"}). Mientras falten, léalos como referencia.</Aviso>
          </div>
        )}
        <div className="space-y-6 p-5">
          {GRUPOS.map((g) => (
            <section key={g}>
              <h4 className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-azul-900">
                <Gauge size={15} /> {g}
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {r.lista
                  .filter((x) => x.grupo === g)
                  .map((x) => (
                    <TarjetaRatio key={x.id} r={x} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </Card>
      <Card>
        <button type="button" onClick={() => setVerEvol(!verEvol)} className="flex w-full items-center justify-between px-5 py-4 text-left">
          <span className="text-[14px] font-bold uppercase tracking-wide text-fg">Evolución mensual {periodo.anio}</span>
          {verEvol ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {verEvol && (
          <div className="overflow-x-auto border-t border-plomo-100">
            <table className="tabla-fija w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-plomo-500">
                  <th className="px-4 py-2">Ratio</th>
                  {evol.map((e) => (
                    <th key={e.mes} className="px-3 py-2 text-right">
                      {e.mes}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.lista
                  .filter((x) => EVOLUCION.includes(x.id))
                  .map((x) => (
                    <tr key={x.id} className="border-t border-plomo-100">
                      <td className="px-4 py-2 font-medium text-fg">{x.nombre}</td>
                      {evol.map((e) => (
                        <td key={e.mes} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {formatoRatio({ valor: e.valores[x.id] ?? null, formato: x.formato }).replace(" veces", "")}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <DatosAperturaModal open={datosAbierto} onClose={() => setDatosAbierto(false)} anio={periodo.anio} />
    </div>
  );
}

function TarjetaRatio({ r }: { r: Ratio }) {
  const c = COLOR[r.semaforo];
  return (
    <div className={cn("rounded-xl border-2 bg-surface/80 p-4 shadow-card", c.borde)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-plomo-600">{r.nombre}</p>
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase", c.texto)}>
          <span className={cn("h-2 w-2 rounded-full", c.punto)} /> {c.etiqueta}
        </span>
      </div>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", c.texto)}>{formatoRatio(r)}</p>
      <p className="mt-1 text-[11px] text-plomo-500">{r.formula}</p>
      <p className="mt-2 text-[12px] text-fg">{r.lectura}</p>
      <p className="mt-1 text-[11px] text-plomo-500">{r.referencia}</p>
    </div>
  );
}

// ------------------------------------------------------------------ Datos de apertura y ajustes

const numONull = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(/,/g, "")) || 0);
const txt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function DatosAperturaModal({ open, onClose, anio: anioInicial }: { open: boolean; onClose: () => void; anio: number }) {
  const lista = useStore<DatosEEFF[]>(KEYS.CONTABLE_DATOS_EEFF, [], open);
  const [anio, setAnio] = useState(anioInicial);
  const [d, setD] = useState<DatosEEFF>(() => datosDelAnio(anioInicial, lista));
  const editable = puedeEditarDatos();
  useEffect(() => {
    if (open) setAnio(anioInicial);
  }, [open, anioInicial]);
  useEffect(() => {
    if (open) setD(datosDelAnio(anio, lista));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anio, lista.length]);
  const set = <K extends keyof DatosEEFF>(k: K, v: DatosEEFF[K]) => setD((x) => ({ ...x, [k]: v }));
  const setAjuste = (id: string, p: Partial<AjusteEEFF>) => set("ajustes", d.ajustes.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const guardar = () => {
    if (ejecutar(() => guardarDatosEEFF(d, getSesion()?.usuario ?? ""), `Datos ${d.anio} guardados`)) onClose();
  };
  const campo = (label: string, k: keyof DatosEEFF, hint?: string, nullable = false) => (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        step="0.01"
        inputMode="decimal"
        disabled={!editable}
        value={nullable ? txt(d[k] as number | null) : String((d[k] as number) || "")}
        placeholder={nullable ? "Calcular con el ERP" : "0.00"}
        onChange={(e) => set(k, (nullable ? numONull(e.target.value) : Number(e.target.value) || 0) as never)}
      />
    </Field>
  );
  const anios = [anioInicial + 1, anioInicial, anioInicial - 1, anioInicial - 2];

  return (
    <Modal open={open} onClose={onClose} title="Datos de apertura y ajustes de los estados financieros" wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Año" className="w-32">
            <Select value={String(anio)} onChange={(e) => setAnio(Number(e.target.value))} options={anios.map((a) => ({ value: String(a), label: String(a) }))} />
          </Field>
          <p className="flex-1 text-[12px] text-plomo-500">Lo que el ERP no registra. Los campos vacíos se calculan con los documentos del sistema. Si ya registró el «Saldo inicial» de las cajas en Estados de cuenta, deje vacío el efectivo inicial.</p>
        </div>
        {!editable && <Aviso>Solo Tesorería o Soporte pueden modificar estos datos. Usted los ve en modo lectura.</Aviso>}

        <section>
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-azul-900">Saldos al 1 de enero de {anio}</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campo("Efectivo inicial (todas las cajas)", "efectivoInicial", "Vacío = suma de los movimientos de caja", true)}
            {campo("Inventario inicial", "inventarioInicial", "Vacío = kardex al 31/12 del año anterior", true)}
            {campo("Préstamos por pagar", "prestamosInicial", "Vacío = pagos hechos con PRÉSTAMO", true)}
            {campo("Resultados acumulados", "resultadosAcumulados", "Vacío = utilidades de años anteriores en el ERP", true)}
            {campo("Capital social", "capitalSocial", "Según escritura / SUNARP")}
            {campo("Otras cuentas por cobrar", "otrasCxC", "Préstamos a terceros, depósitos en garantía…")}
            {campo("Otros activos corrientes", "otrosActivosCorrientes", "Gastos pagados por adelantado, etc.")}
            {campo("Otros activos no corrientes", "otrosActivosNoCorrientes", "Intangibles, inversiones…")}
            {campo("Otras cuentas por pagar", "otrasCxP", "Deudas con socios, terceros…")}
            {campo("Deudas a largo plazo", "pasivoNoCorriente", "Préstamos con vencimiento mayor a un año")}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-azul-900">Impuesto a la renta</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Régimen tributario">
              <Select
                disabled={!editable}
                value={d.regimen}
                onChange={(e) => set("regimen", e.target.value as DatosEEFF["regimen"])}
                options={[
                  { value: "GENERAL", label: "Régimen General (29.5 %)" },
                  { value: "MYPE", label: "MYPE Tributario (10 % hasta 15 UIT)" },
                ]}
              />
            </Field>
            {d.regimen === "MYPE" && (
              <Field label="Valor de la UIT" hint="Verifique el valor vigente del año">
                <Input type="number" disabled={!editable} value={String(d.uit || UIT_DEFECTO)} onChange={(e) => set("uit", Number(e.target.value) || UIT_DEFECTO)} />
              </Field>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-[12px] font-bold uppercase tracking-wider text-azul-900">Otros ingresos y gastos del año</h4>
            {editable && (
              <Button size="sm" variant="secondary" onClick={() => set("ajustes", [...d.ajustes, { id: `aj-${Date.now()}`, fecha: hoy().startsWith(String(anio)) ? hoy() : `${anio}-12-31`, tipo: "GASTO_FINANCIERO", concepto: "", monto: 0 }])}>
                <Plus size={14} /> Agregar
              </Button>
            )}
          </div>
          {d.ajustes.length === 0 && <p className="text-[12px] text-plomo-500">Sin ajustes. Ej.: intereses del préstamo, comisiones bancarias, ITF, intereses ganados.</p>}
          <div className="space-y-2">
            {d.ajustes.map((a) => (
              <div key={a.id} className="grid gap-2 rounded-lg border border-plomo-200 p-2 sm:grid-cols-[140px_1fr_1fr_120px_auto]">
                <Input type="date" disabled={!editable} value={a.fecha} onChange={(e) => setAjuste(a.id, { fecha: e.target.value })} aria-label="Fecha" />
                <Select disabled={!editable} value={a.tipo} onChange={(e) => setAjuste(a.id, { tipo: e.target.value as AjusteEEFF["tipo"] })} options={TIPOS_AJUSTE.map((t) => ({ value: t.id, label: t.nombre.split(" (")[0] }))} aria-label="Tipo" />
                <Input disabled={!editable} value={a.concepto} placeholder="Concepto" onChange={(e) => setAjuste(a.id, { concepto: e.target.value })} aria-label="Concepto" />
                <Input type="number" step="0.01" disabled={!editable} value={String(a.monto || "")} placeholder="0.00" onChange={(e) => setAjuste(a.id, { monto: Number(e.target.value) || 0 })} aria-label="Monto" />
                {editable && (
                  <Button size="sm" variant="ghost" onClick={() => set("ajustes", d.ajustes.filter((x) => x.id !== a.id))} aria-label="Quitar">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        <Field label="Notas (para el contador)">
          <Textarea disabled={!editable} value={d.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Fuente de los saldos de apertura, observaciones…" />
        </Field>
        {d.actualizado && (
          <p className="text-[11px] text-plomo-500">
            Última actualización: {new Date(d.actualizado).toLocaleString("es-PE")} · {d.usuario}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {editable && <Button onClick={guardar}>Guardar datos {d.anio}</Button>}
        </div>
      </div>
    </Modal>
  );
}
