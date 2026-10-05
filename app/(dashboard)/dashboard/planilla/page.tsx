"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, Building2, Calculator, Copy, Eye, FileDown, HandCoins, Lock, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Modal, Tabs, Td, Table, cn, ejecutar, toast } from "@/components/ui";
import {
  AFP_OPTIONS,
  KEYS,
  MSG_ASISTENCIA_BLOQUEADA,
  TIPOS_SUELDO,
  detectarDuplicados,
  edad,
  eliminarTrabajador,
  fechaPE,
  getAliasHuellas,
  hoy,
  idAsistencia,
  importarAsistenciaReloj,
  normalizarPeriodo,
  r2,
  registrarDesdeAsistencia,
  soles,
  trabajadorVacio,
  unirDuplicado,
  useStore,
  useTrabajadores,
} from "@/lib/storage";
import { getSesion } from "@/lib/auth";
import { HORA_TARDANZA, aplicarAlias, leerMarcaciones, resumirAsistencia, textoCsv, type AsistenciaMap } from "@/lib/asistencia";
import { MODOS_LIQUIDACION, cambiarConfig, cambiarModo, liquidacionDe, liquidar, type ResultadoLiquidacion } from "@/lib/liquidacion";
import { CerrarSemana } from "@/components/planilla/CerrarSemana";
import { Contratistas } from "@/components/planilla/Contratistas";
import { FichaTrabajador } from "@/components/planilla/FichaTrabajador";
import { HistorialPlanilla } from "@/components/planilla/HistorialPlanilla";
import { LiquidacionCelda } from "@/components/planilla/LiquidacionCelda";
import { useHistorialPlanilla } from "@/components/planilla/useHistorialPlanilla";
import { useAdelantosPendientes } from "@/components/planilla/useAdelantosPendientes";
import { adelantosADescontar, pendientesDe, type PendientesTrabajador } from "@/lib/adelantos";
import type { FilaCierre } from "@/lib/historial";
import type { AsistenciaPeriodo, LiquidacionPeriodo, ModoLiquidacion, TipoAfp, TipoSueldo, Trabajador } from "@/lib/types";

type Tab = "trabajadores" | "planilla" | "historial" | "contratistas";

type TrabajadorCalc = Trabajador & {
  reloj: { dias: number; horas: number; tardanzas: number }; // asistencia del reloj (bloqueada)
  liq: ResultadoLiquidacion; // días / horas a pagar y montos
  dias: number;
  horas: number;
  tardanzas: number;
  origen?: AsistenciaPeriodo["origen_edicion"] | "MANUAL";
  valorHora: number;
  bruto: number;
  descuentoAfp: number;
  neto: number;
  adelantosPendientes: number; // todos los adelantos PENDIENTES del trabajador
  adelantosDescuento: number; // los que se descuentan en este pago (caben en el neto)
  adelantoIds: string[];
  totalPagar: number; // neto - adelantosDescuento
};

/** Excel importado en esta sesión: se muestra completo, sin filtrar por periodo ni por fechas. */
type ExcelImportado = { asistencia: AsistenciaMap; desde: string; hasta: string };

// Datos antiguos pueden traer un tipo de sueldo / pensión que ya no existe: no romper la pantalla.
const sueldoDe = (t: Trabajador) => TIPOS_SUELDO[t.tipoSueldo as TipoSueldo] ?? TIPOS_SUELDO.DIARIO;
const afpLabel = (t: Trabajador): string => AFP_OPTIONS[t.afpTipo as TipoAfp]?.label ?? String(t.afpTipo ?? "-");
const horasTxt = (h: number) => h.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const valorHoraTxt = (v: number) => `S/ ${v.toFixed(4)}`;

/** Antigüedad legible desde la fecha de ingreso. */
function antiguedad(fechaIngreso: string): string {
  if (!fechaIngreso) return "-";
  const [y, m, d] = fechaIngreso.split("-").map(Number);
  const [hy, hm, hd] = hoy().split("-").map(Number);
  let meses = (hy - y) * 12 + (hm - m) - (hd < d ? 1 : 0);
  if (meses < 0) meses = 0;
  const a = Math.floor(meses / 12);
  const r = meses % 12;
  if (a === 0) return r === 0 ? "< 1 mes" : `${r} mes${r > 1 ? "es" : ""}`;
  return `${a} año${a > 1 ? "s" : ""}${r ? ` ${r} m` : ""}`;
}

/**
 * Asistencia del reloj (Excel importado en esta sesión o lo guardado en Supabase para el periodo)
 * + liquidación del periodo (modo DÍAS / HORAS / DÍAS + HORAS y ajustes manuales).
 */
function calcular(t: Trabajador, liq: LiquidacionPeriodo, asistenciaExterna?: AsistenciaMap | null, registro?: AsistenciaPeriodo): TrabajadorCalc {
  const fechas = asistenciaExterna?.get(t.id);
  const reloj = fechas
    ? resumirAsistencia(fechas)
    : { dias: registro?.dias ?? 0, horas: registro?.horas ?? (registro?.dias ?? 0) * liq.horasJornada, tardanzas: registro?.tardanzas ?? 0 };
  const r = liquidar(t.sueldo, sueldoDe(t).divisor, reloj, liq, liq.ajustes[t.id]);
  const descuentoAfp = r2(r.bruto * ((t.afpPorcentaje || 0) / 100));
  const neto = r2(r.bruto - descuentoAfp);
  return {
    ...t,
    reloj,
    liq: r,
    dias: r.dias,
    horas: r.horas,
    tardanzas: reloj.tardanzas,
    valorHora: r.sueldoHora,
    bruto: r.bruto,
    descuentoAfp,
    neto,
    origen: r.manual ? "MANUAL" : fechas ? "RELOJ" : registro?.origen_edicion,
    adelantosPendientes: 0,
    adelantosDescuento: 0,
    adelantoIds: [],
    totalPagar: neto,
  };
}

/**
 * Sueldo - adelantos = total a pagar. Se descuentan los adelantos PENDIENTES del más antiguo al más reciente
 * mientras quepan en el neto; el que no alcanza queda pendiente para la siguiente planilla.
 */
function conAdelantos(c: TrabajadorCalc, grupos: Map<string, PendientesTrabajador>): TrabajadorCalc {
  const pendientes = pendientesDe(c, grupos);
  if (!pendientes.length) return c;
  const { descontar, total } = adelantosADescontar(pendientes, c.neto);
  return {
    ...c,
    adelantosPendientes: r2(pendientes.reduce((s, a) => s + a.monto, 0)),
    adelantosDescuento: total,
    adelantoIds: descontar.map((a) => a.id),
    totalPagar: r2(c.neto - total),
  };
}

/** Lo del reloj: solo lectura (se cambia con Importar asistencia o el Módulo Creador). */
function CampoBloqueado({ valor, alerta }: { valor: number | string; alerta?: boolean }) {
  return (
    <span className={cn("readonly-field", alerta && "text-orange-600")} title={MSG_ASISTENCIA_BLOQUEADA} aria-readonly="true" contentEditable={false}>
      <Lock size={11} aria-hidden="true" />
      {valor}
    </span>
  );
}

export default function PlanillaPage() {
  const trabajadores = useTrabajadores();
  const sesion = getSesion();
  const soloLectura = !!sesion?.soloLectura; // Gerencia: ver sin editar
  const puedeEditar = !soloLectura && ["creador", "planilla", "admin"].includes(sesion?.rol ?? "");
  const [tab, setTab] = useState<Tab>("trabajadores");
  const historial = useHistorialPlanilla();
  const adelantos = useAdelantosPendientes();

  // /dashboard/planilla?tab=historial (vuelta desde el detalle de un periodo cerrado)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "historial" || t === "contratistas" || t === "planilla") setTab(t);
  }, []);
  const asistencia = useStore<AsistenciaPeriodo[]>(KEYS.ASISTENCIA, []);
  const liquidaciones = useStore<LiquidacionPeriodo[]>(KEYS.LIQUIDACIONES, []);
  useStore(KEYS.HUELLAS_ALIAS, {}); // mantiene el alias de huellas al día (Realtime)
  const [periodo, setPeriodo] = useState("SEMANA 14 - ABRIL 2026");
  const [importando, setImportando] = useState(false);
  const [excel, setExcel] = useState<ExcelImportado | null>(null);
  const [boletaSel, setBoletaSel] = useState<TrabajadorCalc | null>(null);
  const [ficha, setFicha] = useState<{ form: Trabajador; idOriginal?: string } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const [buscar, setBuscar] = useState("");

  const liq = useMemo(() => liquidacionDe(liquidaciones, periodo), [liquidaciones, periodo]);
  const incompletos = trabajadores.filter((t) => t.activo && !t.fechaIngreso);
  const duplicados = useMemo(() => detectarDuplicados(trabajadores), [trabajadores]);
  // Asistencia guardada en Supabase para el periodo elegido
  const delPeriodo = useMemo(() => {
    const m = new Map<string, AsistenciaPeriodo>();
    asistencia.filter((a) => a.periodo === normalizarPeriodo(periodo)).forEach((a) => m.set(a.id, a));
    return m;
  }, [asistencia, periodo]);
  const calculados = useMemo(
    () =>
      trabajadores
        .filter((t) => t.activo)
        .map((t) => conAdelantos(calcular(t, liq, excel?.asistencia, delPeriodo.get(idAsistencia(periodo, t.id))), adelantos.grupos)),
    [trabajadores, liq, excel, delPeriodo, periodo, adelantos.grupos]
  );
  // Copia de la planilla tal como se ve, para "Pagar planilla"
  const filasCierre = useMemo<FilaCierre[]>(
    () =>
      calculados.map((t) => ({
        trabajador_id: t.id,
        nombre: t.nombre,
        dni: t.dni || null,
        cargo: t.cargo || null,
        fecha_ingreso: t.fechaIngreso || null,
        tipo_sueldo: sueldoDe(t).label,
        pension: afpLabel(t),
        afp_porcentaje: t.afpPorcentaje || 0,
        sueldo: t.sueldo,
        dias: t.dias,
        horas: t.horas,
        tardanzas: t.tardanzas,
        valor_hora: Math.round(t.valorHora * 10000) / 10000,
        bruto: t.bruto,
        descuento_afp: t.descuentoAfp,
        neto: t.neto,
        adelantos: t.adelantosDescuento,
        total_pagar: t.totalPagar,
        adelanto_ids: t.adelantoIds,
        origen: t.origen ?? null,
      })),
    [calculados]
  );
  const periodoCerrado = historial.lista.some((h) => h.periodo === normalizarPeriodo(periodo));
  const listaMaestro = trabajadores
    .filter((t) => verInactivos || t.activo)
    .filter((t) => {
      const q = buscar.trim().toUpperCase();
      return !q || t.nombre.includes(q) || t.dni.includes(q) || t.id === q || (t.cargo ?? "").toUpperCase().includes(q);
    })
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const totales = {
    basico: r2(calculados.reduce((a, b) => a + b.liq.basico, 0)),
    extra: r2(calculados.reduce((a, b) => a + b.liq.montoExtra, 0)),
    afp: r2(calculados.reduce((a, b) => a + b.descuentoAfp, 0)),
    adelantos: r2(calculados.reduce((a, b) => a + b.adelantosDescuento, 0)),
    pagar: r2(calculados.reduce((a, b) => a + b.totalPagar, 0)),
  };

  // IMPORTAR ASISTENCIA — formato del reloj: N° | Nombre | Tiempo (DD/MM/YYYY HH:mm:ss) | Estado
  const importarAsistencia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // permite volver a importar el mismo archivo
    if (!file) return;
    setImportando(true);
    try {
      const XLSX = await import("xlsx");
      // raw: el CSV se lee como texto (sin convertir "05/10/2026" a mes/día); las celdas fecha de Excel llegan como número de serie.
      // El CSV se decodifica aparte para no leer "N°" como "NÂ°".
      const datos = await file.arrayBuffer();
      const wb = /\.(csv|txt)$/i.test(file.name)
        ? XLSX.read(textoCsv(datos), { type: "string", raw: true })
        : XLSX.read(datos, { type: "array", raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });

      // Agrupa por trabajador y por fecha; las huellas unidas (duplicados) se suman al trabajador original
      const { asistencia: mapa, nombres, desde, hasta } = aplicarAlias(leerMarcaciones(filas), getAliasHuellas());
      if (mapa.size === 0) {
        toast("No se encontraron marcaciones. Verifique las columnas N° / Nombre / Tiempo (DD/MM/YYYY HH:mm:ss).", "error");
        return;
      }
      const creados = registrarDesdeAsistencia([...nombres].map(([id, nombre]) => ({ id, nombre })));
      // DÍAS / HORAS / TARD. se guardan en Supabase con origen RELOJ (única vía además del Módulo Creador)
      const n = await importarAsistenciaReloj(
        periodo,
        [...mapa].map(([trabajador, fechas]) => ({ trabajador, ...resumirAsistencia(fechas) }))
      );
      setExcel({ asistencia: mapa, desde, hasta });
      setTab("planilla");
      toast(
        `Asistencia del ${fechaPE(desde)} al ${fechaPE(hasta)} importada en ${normalizarPeriodo(periodo)}: ${n} trabajador(es)${creados ? ` · ${creados} nuevo(s) por completar` : ""}`
      );
    } catch (err) {
      toast(err instanceof Error && err.name !== "SyntaxError" ? err.message : "No se pudo leer el archivo de asistencia.", "error");
    } finally {
      setImportando(false);
    }
  };

  const descargarPDF = async (t: TrabajadorCalc) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("CV COMBOY VID E.I.R.L.", 20, 20);
    doc.setFontSize(10);
    doc.text(`BOLETA DE PAGO - ${periodo}`, 20, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Trabajador: ${t.nombre} | DNI: ${t.dni || "-"} | N°: ${t.id}${t.sede ? ` | Sede: ${t.sede}` : ""}`, 20, 38);
    doc.text(`Cargo: ${t.cargo} | Ingreso: ${fechaPE(t.fechaIngreso)} | ${afpLabel(t)} (${t.afpPorcentaje}%)`, 20, 44);
    doc.text(
      `Sueldo ${sueldoDe(t).label} ${soles(t.sueldo)} | Diario ${soles(t.liq.sueldoDiario)} | Hora ${valorHoraTxt(t.valorHora)} | Liquidación: ${MODOS_LIQUIDACION[t.liq.modo].label}`,
      20,
      50
    );
    doc.line(20, 55, 190, 55);
    doc.text(`Básico (${t.liq.modo === "HORAS" ? `${horasTxt(t.horas)} h` : `${t.dias} días`}): ${soles(t.liq.basico)}`, 20, 63);
    doc.text(`Horas extra (${horasTxt(t.liq.horasExtra)} h): ${soles(t.liq.montoExtra)}`, 20, 69);
    doc.text(`Remuneración bruta: ${soles(t.bruto)}`, 20, 75);
    doc.text(`Descuento ${afpLabel(t)} (${t.afpPorcentaje}%): - ${soles(t.descuentoAfp)}`, 20, 81);
    doc.text(`Adelantos descontados: - ${soles(t.adelantosDescuento)}`, 20, 87);
    doc.setFont("helvetica", "bold");
    doc.text(`NETO A PAGAR: ${soles(t.totalPagar)}`, 20, 97);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Firma Trabajador _________________ Firma Empleador _________________", 20, 120);
    doc.save(`BOLETA_${t.id}_${t.nombre.replace(/\s+/g, "_")}.pdf`);
  };

  const importarBtn = !puedeEditar ? null : (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600",
        importando && "pointer-events-none opacity-60"
      )}
      title={`Guarda DÍAS, HORAS y TARD. en el periodo ${normalizarPeriodo(periodo)}`}
    >
      <Upload size={16} /> {importando ? "Importando…" : "Importar asistencia"}
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importarAsistencia} disabled={importando} />
    </label>
  );

  const unir = (duplicadoId: string, originalId: string, nombre: string, original: string) => {
    if (!confirm(`¿Eliminar a ${nombre} (N° ${duplicadoId}) y unir su huella a ${original} (N° ${originalId})?\nLas próximas importaciones del reloj sumarán esa huella a ${original}.`)) return;
    ejecutar(() => unirDuplicado(duplicadoId, originalId), `${nombre} eliminado · huella ${duplicadoId} unida a ${original}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planilla</h1>
          <p className="text-sm text-slate-500">Trabajadores, liquidación del periodo, historial y contratistas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/planilla/adelantos"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <HandCoins size={16} /> Adelantos
          </Link>
          {puedeEditar && (
            <Button onClick={() => setFicha({ form: trabajadorVacio() })} className="px-4 py-2.5">
              <Plus size={16} /> Registrar trabajador
            </Button>
          )}
          {importarBtn}
        </div>
      </div>

      {duplicados.length > 0 && puedeEditar && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold">
            <Copy size={16} /> {duplicados.length} posible(s) trabajador(es) duplicado(s)
          </p>
          {duplicados.map((d) => (
            <div key={d.duplicado.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
              <span>
                <b>
                  N° {d.duplicado.id} · {d.duplicado.nombre}
                </b>
                {!d.duplicado.fechaIngreso && <span className="ml-1 text-xs text-orange-600">(sin registrar)</span>} parece el mismo que{" "}
                <b>
                  N° {d.original.id} · {d.original.nombre}
                </b>{" "}
                <span className="text-xs text-slate-500">({d.motivo})</span>
              </span>
              <span className="flex-1" />
              <Button size="sm" variant="danger" onClick={() => unir(d.duplicado.id, d.original.id, d.duplicado.nombre, d.original.nombre)}>
                <Trash2 size={14} /> Eliminar duplicado y unir huella
              </Button>
            </div>
          ))}
        </div>
      )}

      {incompletos.length > 0 && (
        <button
          onClick={() => setTab("trabajadores")}
          className="flex w-full items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-5 py-3 text-left text-sm text-orange-800"
        >
          <AlertTriangle size={18} /> {incompletos.length} trabajador(es) sin fecha de ingreso (creados desde el reloj). Complete su ficha.
        </button>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "trabajadores", label: "Trabajadores", icon: <Users size={16} />, count: incompletos.length },
          { id: "planilla", label: "Planilla del periodo", icon: <Calculator size={16} /> },
          { id: "historial", label: "Historial", icon: <Archive size={16} /> },
          { id: "contratistas", label: "Contratistas", icon: <Building2 size={16} /> },
        ]}
      />

      {/* ================= TRABAJADORES ================= */}
      {tab === "trabajadores" && (
        <Card>
          <CardHeader
            title="Maestro de trabajadores"
            subtitle={`${trabajadores.filter((t) => t.activo).length} activo(s) · ${trabajadores.filter((t) => !t.activo).length} inactivo(s)`}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, DNI, N°, cargo…" className="w-60" />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="h-4 w-4 accent-red-600" /> Mostrar inactivos
                </label>
              </div>
            }
          />
          {listaMaestro.length === 0 ? (
            <div className="p-5">
              <Empty icon={<Users size={28} />} text={trabajadores.length ? "Ningún trabajador coincide." : "Aún no hay trabajadores. Regístrelos o importe la asistencia del reloj."} />
            </div>
          ) : (
            <Table head={["N°", "Trabajador", "Cargo / sede", "F. ingreso", "Sueldo", "Pensión", "Estado", ""]}>
              {listaMaestro.map((t) => (
                <tr key={t.id} className={cn("transition hover:bg-slate-50", !t.activo && "bg-slate-100 text-slate-400")}>
                  <Td className="font-mono text-base">{t.id}</Td>
                  <Td>
                    <p className={cn("font-semibold", t.activo ? "text-slate-900" : "text-slate-500 line-through decoration-slate-300")}>{t.nombre}</p>
                    <p className="text-xs text-slate-500">
                      DNI {t.dni || "-"}
                      {edad(t.fechaNacimiento) !== null ? ` · ${edad(t.fechaNacimiento)} años` : ""}
                      {t.celular ? ` · ${t.celular}` : ""}
                    </p>
                  </Td>
                  <Td>
                    {t.cargo}
                    {t.sede && <p className="text-xs text-slate-500">{t.sede}</p>}
                  </Td>
                  <Td>
                    {t.fechaIngreso ? (
                      <>
                        <p>{fechaPE(t.fechaIngreso)}</p>
                        <p className="text-xs text-slate-500">{antiguedad(t.fechaIngreso)}</p>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-orange-600">Sin registrar</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {soles(t.sueldo)}
                    <p className="text-xs text-slate-500">{sueldoDe(t).label}</p>
                  </Td>
                  <Td>
                    <p>{afpLabel(t)}</p>
                    <p className="text-xs text-slate-500">{t.afpPorcentaje}%</p>
                  </Td>
                  <Td>
                    <Badge estado={t.activo ? "ACTIVO" : "INACTIVO"} />
                    {!t.activo && t.fechaBaja && <p className="mt-1 text-[11px] text-red-600">Baja {fechaPE(t.fechaBaja)}</p>}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="md" variant={t.activo ? "secondary" : "ghost"} onClick={() => setFicha({ form: { ...t }, idOriginal: t.id })} title="Ficha del trabajador">
                        <Pencil size={15} /> Ficha
                      </Button>
                      {puedeEditar && !t.fechaIngreso && (
                        <Button
                          size="md"
                          variant="ghost"
                          title="Eliminar (registro incompleto)"
                          onClick={() => confirm(`¿Eliminar a ${t.nombre} (N° ${t.id})? No tiene ficha completa.`) && ejecutar(() => eliminarTrabajador(t.id), "Trabajador eliminado")}
                        >
                          <Trash2 size={15} className="text-red-600" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {/* ================= PLANILLA DEL PERIODO ================= */}
      {tab === "planilla" && (
        <>
          <div className="grid gap-3 lg:grid-cols-4">
            <label className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Periodo</span>
              <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="font-semibold" />
            </label>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
              Trabajadores activos: <b>{calculados.length}</b>
              <p className="text-xs text-slate-500">
                {excel
                  ? `Excel del ${fechaPE(excel.desde)} al ${fechaPE(excel.hasta)} · ${excel.asistencia.size} trabajador(es)`
                  : delPeriodo.size
                    ? `${delPeriodo.size} con asistencia en el periodo`
                    : "Sin asistencia en este periodo"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
              Básico {soles(totales.basico)} · Extra {soles(totales.extra)}
              <p className="text-xs text-red-600">
                AFP − {soles(totales.afp)} · Adelantos − {soles(totales.adelantos)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-900 p-3 text-sm text-white">
              Total a pagar: <b className="text-xl text-amber-400">{soles(totales.pagar)}</b>
            </div>
          </div>
          {adelantos.error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Adelantos: {adelantos.error} (la planilla se calcula sin descontarlos).</p>}

          {/* Modo de cálculo */}
          <Card>
            <div className="flex flex-wrap items-end gap-4 p-4">
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Modo de cálculo</span>
                <div className="inline-flex overflow-hidden rounded-xl border border-slate-300">
                  {(Object.keys(MODOS_LIQUIDACION) as ModoLiquidacion[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={!puedeEditar}
                      onClick={() => m !== liq.modo && ejecutar(() => cambiarModo(periodo, m), `Modo: ${MODOS_LIQUIDACION[m].label}`)}
                      className={cn(
                        "px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed",
                        liq.modo === m ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-amber-50"
                      )}
                    >
                      {MODOS_LIQUIDACION[m].label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Jornada (h)</span>
                <input
                  key={liq.horasJornada}
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  defaultValue={liq.horasJornada}
                  disabled={!puedeEditar}
                  onBlur={(e) => {
                    const n = parseFloat(e.target.value);
                    if (n !== liq.horasJornada) ejecutar(() => cambiarConfig(periodo, { horasJornada: n }), `Jornada: ${n} h`);
                  }}
                  className="w-20 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                />
              </label>
              {liq.modo === "DIAS_HORAS" && (
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Recargo h. extra (%)</span>
                  <input
                    key={liq.recargoExtra}
                    type="number"
                    min={0}
                    max={200}
                    defaultValue={liq.recargoExtra}
                    disabled={!puedeEditar}
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value) || 0;
                      if (n !== liq.recargoExtra) ejecutar(() => cambiarConfig(periodo, { recargoExtra: n }), `Recargo: ${n} %`);
                    }}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                  />
                </label>
              )}
              <p className="min-w-[240px] flex-1 text-xs text-slate-500">
                {MODOS_LIQUIDACION[liq.modo].ayuda}. Sueldo diario = mensual / 30 (diario: el mismo); sueldo hora = diario / {liq.horasJornada}. Tardanza: entrada después de las{" "}
                {HORA_TARDANZA}. Los botones ajustan solo esta planilla: lo del reloj 🔒 no cambia.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Planilla · ${normalizarPeriodo(periodo)}`}
              subtitle={`Liquidación por ${MODOS_LIQUIDACION[liq.modo].label.toLowerCase()} · ${calculados.filter((c) => c.liq.manual).length} con ajuste manual`}
              action={
                <div className="flex flex-wrap gap-2">
                  {importarBtn}
                  {puedeEditar && (
                    <CerrarSemana
                      periodo={normalizarPeriodo(periodo)}
                      filas={filasCierre}
                      rango={excel ? { desde: excel.desde, hasta: excel.hasta } : undefined}
                      yaCerrado={periodoCerrado}
                      onCerrado={() => {
                        // Sin esperar a Realtime: el periodo aparece en el historial y los adelantos ya descontados salen de la planilla
                        void historial.recargar();
                        void adelantos.recargar();
                        setTab("historial");
                      }}
                    />
                  )}
                </div>
              }
            />
            {calculados.length === 0 ? (
              <div className="p-5">
                <Empty icon={<Calculator size={28} />} text="No hay trabajadores activos." />
              </div>
            ) : (
              <Table head={["Trabajador", "Reloj 🔒", "A liquidar", "Básico", "H. extra", "AFP / ONP", "Adelantos", "Total a pagar", "Boleta"]}>
                {calculados.map((t) => (
                  <tr key={t.id} className="align-top">
                    <Td>
                      <p className="font-semibold text-slate-900">
                        <span className="mr-1 font-mono text-xs text-slate-400">{t.id}</span>
                        {t.nombre}
                      </p>
                      <p className="text-xs text-slate-500">
                        {soles(t.sueldo)} {sueldoDe(t).label.toLowerCase()} · diario {soles(t.liq.sueldoDiario)} · hora {valorHoraTxt(t.valorHora)}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      <div className="flex flex-wrap gap-1">
                        <CampoBloqueado valor={`${t.reloj.dias} d`} />
                        <CampoBloqueado valor={`${horasTxt(t.reloj.horas)} h`} />
                        <CampoBloqueado valor={`${t.reloj.tardanzas} tard`} alerta={t.reloj.tardanzas > 0} />
                      </div>
                    </Td>
                    <Td>
                      <LiquidacionCelda periodo={periodo} trabajadorId={t.id} liq={liq} r={t.liq} editable={puedeEditar && !periodoCerrado} />
                    </Td>
                    <Td className="text-right">{soles(t.liq.basico)}</Td>
                    <Td className="text-right">{t.liq.montoExtra ? soles(t.liq.montoExtra) : <span className="text-slate-400">-</span>}</Td>
                    <Td className="text-right text-red-600">
                      - {soles(t.descuentoAfp)}
                      <p className="text-[10px] text-slate-500">{t.afpPorcentaje}%</p>
                    </Td>
                    <Td className="text-right">
                      {t.adelantosPendientes > 0 ? (
                        <>
                          <span className="font-semibold text-red-600">- {soles(t.adelantosDescuento)}</span>
                          {t.adelantosDescuento < t.adelantosPendientes && (
                            <p className="text-[10px] text-amber-700" title="El adelanto que no cabe en el neto queda pendiente para la siguiente planilla">
                              {soles(r2(t.adelantosPendientes - t.adelantosDescuento))} queda pendiente
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </Td>
                    <Td className="text-right text-base font-bold text-emerald-700">{soles(t.totalPagar)}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => setBoletaSel(t)} title="Ver boleta">
                          <Eye size={14} />
                        </Button>
                        <Button size="sm" variant="warning" onClick={() => descargarPDF(t)} title="Descargar PDF">
                          <FileDown size={14} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "historial" && <HistorialPlanilla lista={historial.lista} cargando={historial.cargando} error={historial.error} />}

      {tab === "contratistas" && <Contratistas soloLectura={!puedeEditar} />}

      {/* FICHA DEL TRABAJADOR (registrar / editar / baja / eliminar / historial de pagos) */}
      {ficha && <FichaTrabajador inicial={ficha.form} idOriginal={ficha.idOriginal} soloLectura={!puedeEditar} onClose={() => setFicha(null)} />}

      {/* MODAL BOLETA */}
      <Modal open={!!boletaSel} onClose={() => setBoletaSel(null)} title="Boleta de pago">
        {boletaSel && (
          <>
            <div className="space-y-1 border-2 border-slate-900 p-4 text-xs">
              <div className="flex justify-between border-b pb-2">
                <b>CV COMBOY VID - BOLETA DE PAGO {periodo}</b>
                <span>D.S. 001-98-TR</span>
              </div>
              <p className="pt-1">
                <b>Trabajador:</b> {boletaSel.nombre} · DNI: {boletaSel.dni || "-"} · N°: {boletaSel.id}
              </p>
              <p>
                <b>Cargo:</b> {boletaSel.cargo} · <b>Ingreso:</b> {fechaPE(boletaSel.fechaIngreso)}
                {boletaSel.sede ? ` · ${boletaSel.sede}` : ""}
              </p>
              <p>
                <b>Sueldo:</b> {sueldoDe(boletaSel).label} {soles(boletaSel.sueldo)} · diario {soles(boletaSel.liq.sueldoDiario)} · hora {valorHoraTxt(boletaSel.valorHora)}
              </p>
              <table className="mt-3 w-full border">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 text-left">Concepto</th>
                    <th className="p-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2">
                      Básico ({boletaSel.liq.modo === "HORAS" ? `${horasTxt(boletaSel.horas)} h` : `${boletaSel.dias} días`})
                    </td>
                    <td className="p-2 text-right">{soles(boletaSel.liq.basico)}</td>
                  </tr>
                  {boletaSel.liq.montoExtra > 0 && (
                    <tr className="border-t">
                      <td className="p-2">Horas extra ({horasTxt(boletaSel.liq.horasExtra)} h)</td>
                      <td className="p-2 text-right">{soles(boletaSel.liq.montoExtra)}</td>
                    </tr>
                  )}
                  <tr className="border-t text-red-600">
                    <td className="p-2">
                      Desc. {afpLabel(boletaSel)} {boletaSel.afpPorcentaje}%
                    </td>
                    <td className="p-2 text-right">- {soles(boletaSel.descuentoAfp)}</td>
                  </tr>
                  {boletaSel.adelantosDescuento > 0 && (
                    <tr className="border-t text-red-600">
                      <td className="p-2">Adelantos descontados ({boletaSel.adelantoIds.length})</td>
                      <td className="p-2 text-right">- {soles(boletaSel.adelantosDescuento)}</td>
                    </tr>
                  )}
                  <tr className="border-t bg-amber-100 font-bold">
                    <td className="p-2">NETO A PAGAR</td>
                    <td className="p-2 text-right">{soles(boletaSel.totalPagar)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBoletaSel(null)}>
                Cerrar
              </Button>
              <Button variant="warning" onClick={() => descargarPDF(boletaSel)}>
                <FileDown size={16} /> Descargar PDF
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
