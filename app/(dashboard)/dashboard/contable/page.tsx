"use client";

import { Fragment, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FileBarChart2, Landmark, Lock, LockOpen, Scale, Sparkles } from "lucide-react";
import { Button, Card, CardHeader, Empty, Field, Select, Table, Tabs, Td, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import {
  CLASES,
  balanceComprobacion,
  cerrarMes,
  enPeriodo,
  estadosFinancieros,
  hastaPeriodo,
  libroDiario,
  libroMayor,
  reabrirMes,
  type AsientoDiario,
  type CierreMensual,
  type Filtro,
  type OrigenAsiento,
} from "@/lib/contable";
import { generarAsientosAutomaticos } from "@/lib/contable-auto";
import { KEYS, fechaPE, soles, tablaDisponible, useRol, useStore } from "@/lib/storage";

type Tab = "diario" | "mayor" | "balance" | "eeff";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

const ORIGEN: Record<OrigenAsiento, { label: string; cls: string }> = {
  NP: { label: "VENTA (NP)", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  VENTA: { label: "VENTAS", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  OC: { label: "COMPRA (OC)", cls: "bg-[#EEF2F7] text-azul-700 ring-[#C9D4E3]" },
  PLANILLA: { label: "PLANILLA", cls: "bg-red-50 text-vino ring-red-200" },
  MANUAL: { label: "MANUAL", cls: "bg-plomo-100 text-plomo-600 ring-plomo-200" },
};

const num = (n: number) => (n ? n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export default function ContablePage() {
  const [rol] = useRol();
  // re-render con cada cambio (en vivo)
  useStore(KEYS.CONTABLE_ASIENTOS, []);
  useStore(KEYS.ASIENTOS, []);
  useStore(KEYS.CONTABLE_PLAN, []);
  const cierres = useStore<CierreMensual[]>(KEYS.CONTABLE_CIERRES, []);
  const hoy = new Date();
  const [tab, setTab] = useState<Tab>("diario");
  const [filtro, setFiltro] = useState<Filtro>({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 });
  const [generando, setGenerando] = useState(false);
  const sesion = getSesion();
  const puedeGenerar = rol === "GERENCIA" && !sesion?.soloLectura;

  const todos = libroDiario();
  const delPeriodo = todos.filter((a) => enPeriodo(a, filtro));
  const acumulado = todos.filter((a) => hastaPeriodo(a, filtro));
  const anios = useMemo(() => {
    const s = new Set(todos.map((a) => Number(a.fecha.slice(0, 4))));
    s.add(hoy.getFullYear());
    return [...s].sort((a, b) => b - a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos.length]);
  const periodo = filtro.mes ? `${filtro.anio}-${String(filtro.mes).padStart(2, "0")}` : "";
  const cerrado = cierres.find((c) => c.periodo === periodo);
  const nombrePeriodo = filtro.mes ? `${MESES[filtro.mes - 1]} ${filtro.anio}` : `Año ${filtro.anio}`;

  const generar = async () => {
    setGenerando(true);
    await ejecutarAsync(async () => {
      const r = await generarAsientosAutomaticos(sesion?.usuario ?? "creador");
      const n = r.np + r.oc + r.planilla;
      toast(n ? `Asientos generados: ${r.np} venta(s) NP · ${r.oc} compra(s) OC · ${r.planilla} planilla(s)` : "No había asientos pendientes: todo está registrado.");
      if (r.omitidas.length) toast(`Omitidas: ${r.omitidas.slice(0, 3).join(" · ")}${r.omitidas.length > 3 ? "…" : ""}`, "error");
    }, "Revisión de Ventas, Compras y Planilla terminada");
    setGenerando(false);
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-light leading-tight text-azul-900 lg:text-3xl">Contable</h1>
          <p className="mt-1 text-[13px] text-plomo-600">Libro Diario, Mayor, Balance de comprobación y Estados Financieros · asientos automáticos desde Ventas, Compras y Planilla</p>
        </div>
        {puedeGenerar && (
          <Button onClick={generar} disabled={generando}>
            <Sparkles size={16} /> {generando ? "Generando…" : "Generar asientos automáticos desde Ventas / Compras / Planilla"}
          </Button>
        )}
      </div>

      {!tablaDisponible("contable") && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-vino">
          Falta la tabla <b>contable</b> en Supabase: ejecute <b>supabase/contable_tables.sql</b> en el SQL Editor. Mientras tanto se muestran solo los asientos de Ventas.
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-plomo-200 bg-white p-4 shadow-[0_4px_12px_rgba(15,36,64,0.06)] sm:grid-cols-[160px_200px_1fr]">
        <Field label="Año">
          <Select value={String(filtro.anio)} onChange={(e) => setFiltro({ ...filtro, anio: Number(e.target.value) })} options={anios.map((a) => ({ value: String(a), label: String(a) }))} />
        </Field>
        <Field label="Mes">
          <Select
            value={filtro.mes ? String(filtro.mes) : ""}
            onChange={(e) => setFiltro({ ...filtro, mes: e.target.value ? Number(e.target.value) : null })}
            placeholder="Todo el año"
            options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <Stat label="Asientos del periodo" valor={String(delPeriodo.length)} />
          <Stat label="Debe" valor={soles(delPeriodo.reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.debe, 0), 0))} />
          <Stat label="Haber" valor={soles(delPeriodo.reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.haber, 0), 0))} />
          {cerrado && (
            <span className="inline-flex items-center gap-1.5 self-center rounded-full bg-azul-900 px-3 py-1 text-xs font-semibold text-white">
              <Lock size={12} /> Mes cerrado
            </span>
          )}
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "diario", label: "Libro Diario", icon: <BookOpen size={16} />, count: delPeriodo.length },
          { id: "mayor", label: "Mayor", icon: <Landmark size={16} /> },
          { id: "balance", label: "Balance", icon: <Scale size={16} /> },
          { id: "eeff", label: "EEFF", icon: <FileBarChart2 size={16} /> },
        ]}
      />

      {tab === "diario" && <LibroDiario asientos={delPeriodo} titulo={nombrePeriodo} />}
      {tab === "mayor" && <Mayor asientos={delPeriodo} titulo={nombrePeriodo} />}
      {tab === "balance" && (
        <Balance
          asientos={acumulado}
          titulo={filtro.mes ? `al cierre de ${nombrePeriodo}` : `del año ${filtro.anio}`}
          periodo={periodo}
          cerrado={cerrado}
          cierres={cierres}
          puedeCerrar={puedeGenerar}
        />
      )}
      {tab === "eeff" && <EEFF asientos={acumulado} titulo={filtro.mes ? `Acumulado a ${nombrePeriodo}` : `Año ${filtro.anio}`} />}
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-plomo-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-plomo-500">{label}</p>
      <p className="font-semibold text-azul-900">{valor}</p>
    </div>
  );
}

function OrigenBadge({ a }: { a: AsientoDiario }) {
  const o = ORIGEN[a.origen.tipo];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset", a.revierte ? "bg-plomo-100 text-plomo-600 ring-plomo-200" : o.cls)}>{a.revierte ? "ANULACIÓN" : o.label}</span>;
}

function LibroDiario({ asientos, titulo }: { asientos: AsientoDiario[]; titulo: string }) {
  const debe = asientos.reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.debe, 0), 0);
  const haber = asientos.reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.haber, 0), 0);
  return (
    <Card>
      <CardHeader title={`Libro Diario · ${titulo}`} subtitle="Formato 5.1: un asiento por operación (fecha, glosa, cuentas PCGE, debe y haber)." />
      {asientos.length === 0 ? (
        <div className="p-5">
          <Empty icon={<BookOpen size={28} />} text="No hay asientos en este periodo." />
        </div>
      ) : (
        <Table head={["N°", "Fecha", "Cuenta", "Denominación", "Debe", "Haber"]}>
          {asientos.map((a, i) => (
            <Fragment key={a.id}>
              <tr className="border-t-2 border-t-plomo-200 bg-plomo-50">
                <td className="px-4 py-2 font-mono text-xs text-plomo-500">{String(i + 1).padStart(4, "0")}</td>
                <td className="whitespace-nowrap px-4 py-2 text-plomo-600">{fechaPE(a.fecha)}</td>
                <td className="px-4 py-2" colSpan={4}>
                  <span className="mr-2 font-medium text-azul-900">{a.glosa}</span>
                  <OrigenBadge a={a} />
                </td>
              </tr>
              {a.lineas.map((l, j) => (
                <tr key={j}>
                  <td />
                  <td />
                  <Td className={cn("font-mono", l.haber > 0 && "pl-10")}>{l.cuenta}</Td>
                  <Td className={cn(l.haber > 0 && "pl-10")}>{l.nombre}</Td>
                  <Td className="text-right">{num(l.debe)}</Td>
                  <Td className="text-right">{num(l.haber)}</Td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="bg-azul-900 font-bold text-white">
            <td className="px-4 py-2.5" colSpan={4}>
              TOTALES
            </td>
            <td className="px-4 py-2.5 text-right">{num(debe)}</td>
            <td className="px-4 py-2.5 text-right">{num(haber)}</td>
          </tr>
        </Table>
      )}
    </Card>
  );
}

function Mayor({ asientos, titulo }: { asientos: AsientoDiario[]; titulo: string }) {
  const cuentas = libroMayor(asientos);
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title={`Libro Mayor · ${titulo}`} subtitle="Movimientos por cuenta. Haga clic en una cuenta para ver su detalle." />
      {cuentas.length === 0 ? (
        <div className="p-5">
          <Empty icon={<Landmark size={28} />} text="Sin movimientos en este periodo." />
        </div>
      ) : (
        <Table head={["Cuenta", "Denominación", "Debe", "Haber", "Saldo"]}>
          {cuentas.map((c) => (
            <Fragment key={c.cuenta}>
              <tr className="cursor-pointer hover:bg-plomo-50" onClick={() => setAbierta(abierta === c.cuenta ? null : c.cuenta)}>
                <Td className="font-mono font-semibold text-azul-900">
                  <span className="inline-flex items-center gap-1">
                    {abierta === c.cuenta ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {c.cuenta}
                  </span>
                </Td>
                <Td>{c.nombre}</Td>
                <Td className="text-right">{num(c.debe)}</Td>
                <Td className="text-right">{num(c.haber)}</Td>
                <Td className={cn("text-right font-semibold", c.saldo < 0 ? "text-vino" : "text-azul-900")}>
                  {num(Math.abs(c.saldo))} {c.saldo > 0 ? "D" : c.saldo < 0 ? "A" : ""}
                </Td>
              </tr>
              {abierta === c.cuenta &&
                c.movimientos.map((m, i) => (
                  <tr key={i} className="bg-plomo-50 text-xs">
                    <Td className="pl-10 text-plomo-500">{fechaPE(m.fecha)}</Td>
                    <td className="max-w-[420px] px-4 py-2.5 text-plomo-600">
                      {m.glosa} <span className="text-plomo-500">({m.origen})</span>
                    </td>
                    <Td className="text-right">{num(m.debe)}</Td>
                    <Td className="text-right">{num(m.haber)}</Td>
                    <Td className="text-right">{num(Math.abs(m.saldo))} {m.saldo > 0 ? "D" : m.saldo < 0 ? "A" : ""}</Td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Balance({
  asientos,
  titulo,
  periodo,
  cerrado,
  cierres,
  puedeCerrar,
}: {
  asientos: AsientoDiario[];
  titulo: string;
  periodo: string;
  cerrado?: CierreMensual;
  cierres: CierreMensual[];
  puedeCerrar: boolean;
}) {
  const { cuentas, totales } = balanceComprobacion(asientos);
  const cuadrado = Math.abs(totales.debe - totales.haber) < 0.01;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`Balance de comprobación ${titulo}`}
          subtitle={cuadrado ? "Sumas iguales: el Diario cuadra." : "⚠ Las sumas no cuadran: revise los asientos."}
          action={
            puedeCerrar && periodo ? (
              cerrado ? (
                <Button variant="secondary" onClick={() => confirm(`¿Reabrir ${periodo}?`) && ejecutar(() => reabrirMes(periodo), `${periodo} reabierto`)}>
                  <LockOpen size={16} /> Reabrir {periodo}
                </Button>
              ) : (
                <Button onClick={() => ejecutar(() => cerrarMes(periodo, getSesion()?.usuario ?? ""), `Mes ${periodo} cerrado`)}>
                  <Lock size={16} /> Cerrar mes {periodo}
                </Button>
              )
            ) : undefined
          }
        />
        {cuentas.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Scale size={28} />} text="Sin movimientos." />
          </div>
        ) : (
          <Table head={["Cuenta", "Denominación", "Sumas debe", "Sumas haber", "Saldo deudor", "Saldo acreedor"]}>
            {cuentas.map((c) => (
              <tr key={c.cuenta}>
                <Td className="font-mono font-semibold text-azul-900">{c.cuenta}</Td>
                <Td>{c.nombre}</Td>
                <Td className="text-right">{num(c.debe)}</Td>
                <Td className="text-right">{num(c.haber)}</Td>
                <Td className="text-right">{num(c.deudor)}</Td>
                <Td className="text-right">{num(c.acreedor)}</Td>
              </tr>
            ))}
            <tr className="bg-azul-900 font-bold text-white">
              <td className="px-4 py-2.5" colSpan={2}>
                TOTALES
              </td>
              <td className="px-4 py-2.5 text-right">{num(totales.debe)}</td>
              <td className="px-4 py-2.5 text-right">{num(totales.haber)}</td>
              <td className="px-4 py-2.5 text-right">{num(totales.deudor)}</td>
              <td className="px-4 py-2.5 text-right">{num(totales.acreedor)}</td>
            </tr>
          </Table>
        )}
      </Card>
      {cierres.length > 0 && (
        <Card>
          <CardHeader title="Cierres mensuales" subtitle="Totales guardados al cerrar cada mes." />
          <Table head={["Periodo", "Cerrado el", "Por", "Asientos", "Debe", "Haber", "Resultado del mes"]}>
            {[...cierres].sort((a, b) => b.periodo.localeCompare(a.periodo)).map((c) => (
              <tr key={c.id}>
                <Td className="font-semibold text-azul-900">{c.periodo}</Td>
                <Td>{new Date(c.fecha).toLocaleString("es-PE")}</Td>
                <Td>{c.usuario}</Td>
                <Td className="text-right">{c.asientos}</Td>
                <Td className="text-right">{soles(c.totalDebe)}</Td>
                <Td className="text-right">{soles(c.totalHaber)}</Td>
                <Td className={cn("text-right font-semibold", c.resultado < 0 ? "text-vino" : "text-emerald-700")}>{soles(c.resultado)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function EEFF({ asientos, titulo }: { asientos: AsientoDiario[]; titulo: string }) {
  const { resultados: r, situacion: s } = estadosFinancieros(asientos);
  const Linea = ({ c, nombre, monto, fuerte }: { c?: string; nombre: string; monto: number; fuerte?: boolean }) => (
    <div className={cn("flex justify-between gap-3 border-b border-plomo-100 py-1.5 text-sm", fuerte && "border-t-2 border-t-azul-900 font-bold text-azul-900")}>
      <span>
        {c && <span className="mr-2 font-mono text-xs text-plomo-500">{c}</span>}
        {nombre}
      </span>
      <span className={cn(monto < 0 && "text-vino")}>{soles(monto)}</span>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title={`Estado de resultados · ${titulo}`} subtitle="Ingresos (clase 7) menos gastos por naturaleza (clase 6)." />
        <div className="space-y-1 p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Ingresos</p>
          {r.ingresos.map((c) => (
            <Linea key={c.cuenta} c={c.cuenta} nombre={c.nombre} monto={c.monto} />
          ))}
          <Linea nombre="Total ingresos" monto={r.totalIngresos} fuerte />
          <p className="pt-3 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Gastos y costos</p>
          {r.gastos.map((c) => (
            <Linea key={c.cuenta} c={c.cuenta} nombre={c.nombre} monto={c.monto} />
          ))}
          <Linea nombre="Total gastos" monto={r.totalGastos} fuerte />
          <div className={cn("mt-4 flex justify-between rounded-lg px-4 py-3 font-bold text-white", r.resultado >= 0 ? "bg-azul-900" : "bg-vino")}>
            <span>{r.resultado >= 0 ? "UTILIDAD DEL PERIODO" : "PÉRDIDA DEL PERIODO"}</span>
            <span>{soles(r.resultado)}</span>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title={`Estado de situación financiera · ${titulo}`} subtitle="Activo = Pasivo + Patrimonio (incluye el resultado del periodo)." />
        <div className="space-y-1 p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Activo</p>
          {s.activo.map((c) => (
            <Linea key={c.cuenta} c={c.cuenta} nombre={c.nombre} monto={c.monto} />
          ))}
          <Linea nombre="Total activo" monto={s.totalActivo} fuerte />
          <p className="pt-3 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Pasivo</p>
          {s.pasivo.map((c) => (
            <Linea key={c.cuenta} c={c.cuenta} nombre={`${c.nombre}${c.monto < 0 ? " (saldo a favor)" : ""}`} monto={c.monto} />
          ))}
          <Linea nombre="Total pasivo" monto={s.totalPasivo} fuerte />
          <p className="pt-3 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Patrimonio</p>
          {s.patrimonio.map((c) => (
            <Linea key={c.cuenta} c={c.cuenta} nombre={c.nombre} monto={c.monto} />
          ))}
          <Linea nombre="Resultado del periodo" monto={s.resultado} />
          <Linea nombre="Total patrimonio" monto={s.totalPatrimonio} fuerte />
          <div className="mt-4 flex justify-between rounded-lg bg-azul-900 px-4 py-3 font-bold text-white">
            <span>PASIVO + PATRIMONIO</span>
            <span>{soles(s.totalPasivo + s.totalPatrimonio)}</span>
          </div>
          {Math.abs(s.totalActivo - (s.totalPasivo + s.totalPatrimonio)) > 0.01 && <p className="text-xs text-vino">⚠ No cuadra con el total activo.</p>}
          <p className="pt-2 text-[11px] text-plomo-500">Clases PCGE: {Object.entries(CLASES).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
        </div>
      </Card>
    </div>
  );
}
