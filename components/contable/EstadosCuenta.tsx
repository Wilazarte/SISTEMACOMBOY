"use client";

import { FiltrosPlegables } from "@/components/ui/BotonFiltros";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileDown, FileSpreadsheet, Plus, Trash2, Wallet } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { listarAdelantos, type Adelanto } from "@/lib/adelantos";
import { datosCaja } from "@/lib/cajas";
import { CUENTAS_CAJA, movimientosCaja, resumenCuenta, type CuentaCaja } from "@/lib/estadoCuenta";
import { pdfEstadoCuenta } from "@/lib/pdf";
import { KEYS, eliminarMovimientoCaja, fechaPE, hoy, registrarMovimientoCaja, soles, useStore } from "@/lib/storage";
import type { Compra, Factura, MovimientoCajaManual } from "@/lib/types";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Reportes › Estados de cuenta: Caja Chica, Caja General y Fondo de Reserva.
 * Los egresos salen solos de los gastos / facturas pagados, compras y adelantos con esa caja (lib/estadoCuenta.ts);
 * aquí solo se registran a mano los ingresos (saldo inicial, reposición) y ajustes.
 */
export function EstadosCuenta({ anio, mes, onVerDiario }: { anio: number; mes: number | null; onVerDiario: () => void }) {
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const compras = useStore<Compra[]>(KEYS.COMPRAS, []);
  const manuales = useStore<MovimientoCajaManual[]>(KEYS.MOV_CAJA, []);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [cuenta, setCuenta] = useState<CuentaCaja | "">("");
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const sesion = getSesion();
  const puedeRegistrar = !sesion?.soloLectura && ["creador", "tesoreria"].includes(sesion?.rol ?? "");

  useEffect(() => {
    listarAdelantos()
      .then(setAdelantos)
      .catch(() => setAdelantos([])); // sin permiso a adelantos: el estado de cuenta sale sin ellos
  }, []);

  const movs = useMemo(() => movimientosCaja(facturas, compras, adelantos, manuales), [facturas, compras, adelantos, manuales]);
  const desde = mes ? `${anio}-${String(mes).padStart(2, "0")}-01` : `${anio}-01-01`;
  const hasta = mes ? `${anio}-${String(mes).padStart(2, "0")}-31` : `${anio}-12-31`;
  const periodo = mes ? `${MESES[mes - 1]} ${anio}` : `Año ${anio}`;
  const lista = movs.filter(
    (m) =>
      m.fecha >= desde &&
      m.fecha <= hasta &&
      (!cuenta || m.cuenta === cuenta) &&
      (!q.trim() || `${m.concepto} ${m.documento} ${m.proveedor}`.toLowerCase().includes(q.trim().toLowerCase()))
  );

  const exportarPDF = () => {
    if (!cuenta) return toast("Elija una cuenta para el PDF (cada estado de cuenta es de una caja).", "error");
    const r = resumenCuenta(movs, cuenta, desde, hasta);
    pdfEstadoCuenta({ cuenta, periodo, ...r, movimientos: lista, descripcion: datosCaja(cuenta)?.descripcion, cuentasBancarias: datosCaja(cuenta)?.cuentas.map((b): [string, string] => [`${b.banco} ${b.monedaNombre}`, `N° ${b.numero} · CCI ${b.cci}`]) });
  };
  // xlsx se carga solo al exportar (no pesa en la pantalla)
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const filas = lista.map((m) => ({ Fecha: fechaPE(m.fecha), Cuenta: m.cuenta, Concepto: m.concepto, "Doc. referencia": m.documento, Proveedor: m.proveedor, Debe: m.debe || "", Haber: m.haber || "", Saldo: m.saldo ?? 0 }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Estado de cuenta");
    XLSX.writeFile(libro, `Estado-cuenta-${(cuenta || "3-cajas").replace(/\s+/g, "-")}-${periodo.replace(/\s+/g, "-")}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {CUENTAS_CAJA.map((c) => {
          const r = resumenCuenta(movs, c.nombre, desde, hasta);
          return (
            <button
              key={c.codigo}
              type="button"
              onClick={() => setCuenta(cuenta === c.nombre ? "" : c.nombre)}
              className={cn("rounded-xl border bg-surface/80 p-4 text-left shadow-card transition", cuenta === c.nombre ? "border-[#2a7bff] ring-2 ring-[#2a7bff]/40" : "border-plomo-200 hover:border-plomo-500/40")}
            >
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-plomo-500">
                <Wallet size={14} /> {c.titulo}
              </p>
              <p className={cn("mt-1 text-2xl font-bold", r.saldoActual < 0 ? "text-red-600" : "text-fg")}>{soles(r.saldoActual)}</p>
              <p className="text-[11px] text-plomo-500">{datosCaja(c.nombre)?.descripcion}</p>
              {datosCaja(c.nombre)?.cuentas.map((b) => (
                <p key={b.numero} className="text-[11px] text-plomo-500">
                  {b.monedaNombre} N° {b.numero} · CCI {b.cci}
                </p>
              ))}
              <p className="mt-1 text-xs text-plomo-500">
                {periodo}: ingresos <span className="font-semibold text-emerald-600">{soles(r.ingresos)}</span> · egresos <span className="font-semibold text-red-600">{soles(r.egresos)}</span>
              </p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={`Estado de cuenta · ${cuenta || "las 3 cajas"} · ${periodo}`}
          subtitle="Egresos automáticos desde gastos, facturas, compras y adelantos pagados con la caja. Saldo = saldo de la cuenta después de cada movimiento."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <FiltrosPlegables activos={[cuenta, q].filter(Boolean).length}>
                <Select
                  value={cuenta}
                  onChange={(e) => setCuenta(e.target.value as CuentaCaja | "")}
                  placeholder="Todas las cuentas"
                  options={CUENTAS_CAJA.map((c) => ({ value: c.nombre, label: c.titulo }))}
                  className="w-44"
                />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar concepto, doc., proveedor…" className="w-56" aria-label="Buscar" />
              </FiltrosPlegables>
              <Button variant="secondary" onClick={exportarPDF} title={cuenta ? "" : "Elija una cuenta"}>
                <FileDown size={15} /> Generar PDF estado de cuenta
              </Button>
              <Button variant="secondary" onClick={exportarExcel}>
                <FileSpreadsheet size={15} /> Exportar Excel
              </Button>
              <Button variant="ghost" onClick={onVerDiario}>
                <BookOpen size={15} /> Ver Libro Diario
              </Button>
              {puedeRegistrar && (
                <Button onClick={() => setNuevo(true)}>
                  <Plus size={15} /> Ingreso / ajuste
                </Button>
              )}
            </div>
          }
        />
        <Table head={["Fecha", "Concepto", "Doc. referencia", "Proveedor", "Debe (ingreso)", "Haber (egreso)", "Saldo", ""]} empty={lista.length === 0}>
          {cuenta && (
            <tr className="bg-plomo-50">
              <Td>{fechaPE(desde)}</Td>
              <Td className="font-semibold text-fg">SALDO INICIAL</Td>
              <Td>-</Td>
              <Td>-</Td>
              <Td>{null}</Td>
              <Td>{null}</Td>
              <Td className="text-right font-semibold">{soles(resumenCuenta(movs, cuenta, desde, hasta).saldoInicial)}</Td>
              <Td>{null}</Td>
            </tr>
          )}
          {lista.map((m) => (
            <tr key={m.id}>
              <Td className="whitespace-nowrap">{fechaPE(m.fecha)}</Td>
              <Td className="max-w-[320px]">
                <span className="block truncate" title={m.concepto}>
                  {m.concepto}
                </span>
                {!cuenta && <span className="text-[11px] text-plomo-500">{m.cuenta}</span>}
              </Td>
              <Td className="whitespace-nowrap">{m.documento}</Td>
              <Td className="max-w-[220px] truncate">{m.proveedor}</Td>
              <Td className="text-right text-emerald-700">{m.debe ? soles(m.debe) : ""}</Td>
              <Td className="text-right text-red-600">{m.haber ? soles(m.haber) : ""}</Td>
              <Td className={cn("text-right font-semibold", (m.saldo ?? 0) < 0 && "text-red-600")}>{soles(m.saldo ?? 0)}</Td>
              <Td>
                {m.origen === "MANUAL" && puedeRegistrar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Eliminar movimiento manual"
                    onClick={() => confirm("¿Eliminar este movimiento manual?") && ejecutar(() => eliminarMovimientoCaja(m.id.replace(/^man-/, "")), "Movimiento eliminado")}
                  >
                    <Trash2 size={14} className="text-red-600" />
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {nuevo && <NuevoMovimiento cuentaInicial={cuenta || "CAJA CHICA"} onClose={() => setNuevo(false)} />}
    </div>
  );
}

function NuevoMovimiento({ cuentaInicial, onClose }: { cuentaInicial: CuentaCaja; onClose: () => void }) {
  const [d, setD] = useState({ cuenta: cuentaInicial as string, fecha: hoy(), tipo: "INGRESO" as "INGRESO" | "EGRESO", concepto: "", documento: "", proveedor: "", monto: 0 });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal open onClose={onClose} title="Ingreso / ajuste de caja">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cuenta">
          <Select value={d.cuenta} onChange={(e) => set("cuenta", e.target.value)} options={CUENTAS_CAJA.map((c) => ({ value: c.nombre, label: c.titulo }))} />
        </Field>
        <Field label="Tipo">
          <Select
            value={d.tipo}
            onChange={(e) => set("tipo", e.target.value as "INGRESO" | "EGRESO")}
            options={[
              { value: "INGRESO", label: "Ingreso (saldo inicial, reposición, inyección de accionistas)" },
              { value: "EGRESO", label: "Egreso / ajuste" },
            ]}
          />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={d.fecha} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
        <Field label="Monto (S/)">
          <Input type="number" min={0} step="0.01" value={d.monto || ""} onChange={(e) => set("monto", parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Concepto" className="sm:col-span-2">
          <Input value={d.concepto} onChange={(e) => set("concepto", e.target.value)} placeholder={d.cuenta === "FONDO DE RESERVA" ? "Ej: Inyección de accionistas / Saldo inicial octubre" : "Ej: Saldo inicial octubre / Reposición de caja chica"} />
        </Field>
        <Field label="Doc. referencia (opcional)">
          <Input value={d.documento} onChange={(e) => set("documento", e.target.value)} />
        </Field>
        <Field label="Proveedor / de quién (opcional)">
          <Input value={d.proveedor} onChange={(e) => set("proveedor", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => ejecutar(() => void registrarMovimientoCaja(d), "Movimiento registrado") && onClose()}>Guardar</Button>
      </div>
    </Modal>
  );
}
