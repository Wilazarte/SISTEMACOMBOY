"use client";

import { pdfBoletaPago } from "@/lib/pdf";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, Building2, Calculator, Copy, Eye, FileDown, HandCoins, Lock, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Input, Modal, Tabs, Td, Table, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import {
  AFP_OPTIONS,
  KEYS,
  MSG_ASISTENCIA_BLOQUEADA,
  TIPOS_SUELDO,
  detectarDuplicados,
  edad,
  esContratista,
  eliminarTrabajador,
  fechaPE,
  getAliasHuellas,
  hoy,
  idAsistencia,
  importarAsistenciaReloj,
  normalizarPeriodo,
  codigoBoleta,
  r2,
  registrarDesdeAsistencia,
  soles,
  sumarDias,
  trabajadorVacio,
  unirDuplicado,
  useStore,
  vincularHuella,
  desvincularHuella,
  getTrabajadores,
  useTrabajadores,
} from "@/lib/storage";
import { getSesion } from "@/lib/auth";
import { HORA_TARDANZA, aplicarAlias, horasReales, leerMarcaciones, resumirAsistencia, textoCsv, type AsistenciaMap } from "@/lib/asistencia";
import { MODOS_LIQUIDACION, cambiarConfig, cambiarModo, liquidacionDe, liquidar, liquidarPorHora, type ResultadoLiquidacion } from "@/lib/liquidacion";
import { CerrarSemana } from "@/components/planilla/CerrarSemana";
import { AdelantosTrabajador } from "@/components/planilla/AdelantosTrabajador";
import { PagarSemanaFiltrada } from "@/components/planilla/PagarSemanaFiltrada";
import { EditarListaSemana } from "@/components/planilla/EditarListaSemana";
import { enLista, listaDe, type ListaSemana } from "@/lib/listaSemana";
import { emparejar, sinHuellas, type DetalleHuella, type NoEncontrado } from "@/lib/emparejarReloj";
import { ResultadoImportacion } from "@/components/planilla/ResultadoImportacion";
import { Contratistas } from "@/components/planilla/Contratistas";
import { ContratistasMaestro } from "@/components/planilla/ContratistasMaestro";
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
  tieneAsistencia: boolean; // tiene_asistencia_semana: horas (o días) > 0 en el reloj del periodo
  sinHorasReloj: boolean; // S/ por hora: el periodo guardado no tiene horas (edición manual o import antiguo)
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

/** Filtro por tipo de sueldo de la planilla del periodo. */
type FiltroSueldo = "TODOS" | "DIARIO" | "MENSUAL" | "POR_HORA";
const FILTROS_SUELDO: { id: FiltroSueldo; label: string; grupo: string }[] = [
  { id: "TODOS", label: "Todos", grupo: "TODOS" },
  { id: "DIARIO", label: "S/ Diario", grupo: "DIARIO" },
  { id: "MENSUAL", label: "S/ Mensual", grupo: "MENSUAL" },
  { id: "POR_HORA", label: "S/ por Hora", grupo: "POR HORA" },
];
/** Diario: sueldo por día · Por hora: sueldo por hora · Mensual: sueldo fijo del periodo (mensual, quincenal o semanal). */
const filtroDe = (t: Trabajador): Exclude<FiltroSueldo, "TODOS"> =>
  t.tipoSueldo === "POR_HORA" ? "POR_HORA" : t.tipoSueldo === "MENSUAL" || t.tipoSueldo === "QUINCENAL" || t.tipoSueldo === "SEMANAL" ? "MENSUAL" : "DIARIO";
const grupoDe = (f: FiltroSueldo) => FILTROS_SUELDO.find((x) => x.id === f)!.grupo;

const MESES_TXT = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** Lunes a domingo de la semana actual. */
function semanaActual(): { desde: string; hasta: string } {
  const dia = (new Date().getDay() + 6) % 7; // lunes = 0
  const desde = sumarDias(hoy(), -dia);
  return { desde, hasta: sumarDias(desde, 6) };
}
/** "Semana 14 - 01 al 07 Abril 2026" (si cruza de mes: "30 Marzo al 05 Abril 2026"). */
function etiquetaSemana(periodo: string, desde: string, hasta: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return normalizarPeriodo(periodo);
  const n = periodo.match(/SEMANA\s+(\d+)/i)?.[1];
  const [y1, m1, d1] = desde.split("-");
  const [y2, m2, d2] = hasta.split("-");
  const ini = m1 === m2 && y1 === y2 ? d1 : `${d1} ${MESES_TXT[Number(m1) - 1]}${y1 !== y2 ? ` ${y1}` : ""}`;
  return `${n ? `Semana ${n} - ` : ""}${ini} al ${d2} ${MESES_TXT[Number(m2) - 1]} ${y2}`;
}

/** Fila del historial (copia de la planilla tal como se ve) para pagar / cerrar. */
const filaCierre = (t: TrabajadorCalc): FilaCierre => ({
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
});

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
  const porHora = t.tipoSueldo === "POR_HORA";
  // S/ por hora: horas REALES del reloj (marcas), nunca días × jornada
  const reloj = fechas
    ? { ...resumirAsistencia(fechas), ...(porHora ? { horas: horasReales(fechas) } : {}) }
    : { dias: registro?.dias ?? 0, horas: registro?.horas ?? (porHora ? 0 : (registro?.dias ?? 0) * liq.horasJornada), tardanzas: registro?.tardanzas ?? 0 };
  // Por hora + modo HORAS: básico = S/ hora × horas importadas (sin jornada); extra solo manual
  const divisor = porHora ? 1 / (liq.horasJornada > 0 ? liq.horasJornada : 8) : sueldoDe(t).divisor;
  const r =
    porHora && liq.modo === "HORAS"
      ? liquidarPorHora(t.sueldo, reloj.horas, liq.ajustes[t.id])
      : liquidar(t.sueldo, divisor, reloj, liq, liq.ajustes[t.id]);
  const descuentoAfp = r2(r.bruto * ((t.afpPorcentaje || 0) / 100));
  const neto = r2(r.bruto - descuentoAfp);
  return {
    ...t,
    reloj,
    tieneAsistencia: reloj.horas > 0 || reloj.dias > 0,
    sinHorasReloj: porHora && !fechas && !!registro && (registro.horas === null || registro.horas === undefined),
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
    totalPagar: Math.max(0, r2(c.neto - total)), // nunca negativo
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
  const maestro = useTrabajadores();
  // Contratistas: mismo maestro, pero fuera de la lista de operarios y de la planilla del periodo
  const trabajadores = useMemo(() => maestro.filter((t) => !esContratista(t)), [maestro]);
  const nContratistas = maestro.length - trabajadores.length;
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
  const [filtro, setFiltro] = useState<FiltroSueldo>("DIARIO");
  const [rango, setRango] = useState(semanaActual);
  const [adelantoDe, setAdelantoDe] = useState<TrabajadorCalc | null>(null);
  const [soloAsistencia, setSoloAsistencia] = useState(true);
  const [editarLista, setEditarLista] = useState(false);
  // Huellas del reloj sin trabajador seguro (se vinculan a mano) y el último Excel, para reprocesarlo al vincular
  const [noEncontrados, setNoEncontrados] = useState<NoEncontrado[]>([]);
  const [ultimasFilas, setUltimasFilas] = useState<Record<string, unknown>[] | null>(null);
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [detalleImport, setDetalleImport] = useState<DetalleHuella[]>([]);
  const listas = useStore<ListaSemana[]>(KEYS.LISTAS_SEMANA, []);

  const liq = useMemo(() => liquidacionDe(liquidaciones, periodo), [liquidaciones, periodo]);
  const incompletos = trabajadores.filter((t) => t.activo && !t.fechaIngreso);
  const duplicados = useMemo(() => detectarDuplicados(maestro), [maestro]);
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
  const periodoCerrado = historial.lista.some((h) => h.periodo === normalizarPeriodo(periodo));
  // Pagos por tipo de sueldo ya hechos en este periodo ("SEMANA 14 - ABRIL 2026 · DIARIO")
  const gruposPagados = useMemo(() => {
    const pre = `${normalizarPeriodo(periodo)} · `;
    return new Set(historial.lista.filter((h) => h.periodo.startsWith(pre)).map((h) => h.periodo.slice(pre.length)));
  }, [historial.lista, periodo]);
  const pagado = (t: Trabajador) => periodoCerrado || gruposPagados.has("TODOS") || gruposPagados.has(grupoDe(filtroDe(t)));
  // Lista de pago de la semana: con asistencia + agregados a mano - quitados (Editar lista manual)
  const listaSem = listaDe(listas, periodo);
  const incluido = (t: TrabajadorCalc) => enLista(t.id, t.tieneAsistencia, listaSem);
  // Lo que se ve en la tabla: el tipo de sueldo filtrado y, con "Solo con asistencia", solo los de la lista
  const visibles = calculados.filter((t) => (filtro === "TODOS" || filtroDe(t) === filtro) && (!soloAsistencia || incluido(t)));
  const aPagar = visibles.filter(incluido);
  // "Pagar planilla" (cierra la semana): los de la lista que aún no se pagaron
  const filasCierre = calculados.filter((t) => incluido(t) && !pagado(t)).map(filaCierre);
  // "Pagar semana filtrada": solo los visibles y marcados en la lista que aún no se pagaron
  const filasFiltradas = aPagar.filter((t) => !pagado(t)).map(filaCierre);
  const filtroActual = FILTROS_SUELDO.find((x) => x.id === filtro)!;
  const filtroPagado = periodoCerrado || gruposPagados.has("TODOS") || gruposPagados.has(filtroActual.grupo) || (filtro === "TODOS" && gruposPagados.size > 0 && filasFiltradas.length === 0);
  const listaMaestro = trabajadores
    .filter((t) => verInactivos || t.activo)
    .filter((t) => {
      const q = buscar.trim().toUpperCase();
      return !q || t.nombre.includes(q) || t.dni.includes(q) || t.id === q || (t.cargo ?? "").toUpperCase().includes(q);
    })
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  // Totales solo de los filtrados que están en la lista de pago
  const totales = {
    basico: r2(aPagar.reduce((a, b) => a + b.liq.basico, 0)),
    extra: r2(aPagar.reduce((a, b) => a + b.liq.montoExtra, 0)),
    afp: r2(aPagar.reduce((a, b) => a + b.descuentoAfp, 0)),
    adelantos: r2(aPagar.reduce((a, b) => a + b.adelantosDescuento, 0)),
    pagar: r2(aPagar.reduce((a, b) => a + b.totalPagar, 0)),
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
      await procesarAsistencia(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true }));
    } catch (err) {
      toast(err instanceof Error && err.name !== "SyntaxError" ? err.message : "No se pudo leer el archivo de asistencia.", "error");
    } finally {
      setImportando(false);
    }
  };

  /**
   * Importa las marcaciones: une cada huella con su trabajador (alias de huellas, alias por nombre, N° de huella,
   * o por nombre con 2+ palabras en común). Las dudosas no se importan: quedan en "no encontrados" para vincular.
   */
  const procesarAsistencia = async (filas: Record<string, unknown>[]) => {
    const leidas = leerMarcaciones(filas);
    const lista = getTrabajadores(); // al día (tras "Crear nuevo" / "Vincular")
    const emp = emparejar(leidas, lista, getAliasHuellas());
    // Agrupa por trabajador y por fecha; las huellas unidas (duplicados / por nombre) se suman al trabajador
    const { asistencia: mapa, nombres, desde, hasta } = aplicarAlias(sinHuellas(leidas, emp.noEncontrados.map((x) => x.huella)), emp.alias);
    setUltimasFilas(filas);
    setNoEncontrados(emp.noEncontrados);
    setEleccion(Object.fromEntries(emp.noEncontrados.map((x) => [x.huella, x.candidatos[0]?.id ?? ""])));
    setDetalleImport(emp.detalle);
    if (mapa.size === 0) {
      if (!emp.noEncontrados.length) toast("No se encontraron marcaciones. Verifique las columnas N° / Nombre / Tiempo (DD/MM/YYYY HH:mm:ss).", "error");
      setTab("planilla");
      return;
    }
    const creados = registrarDesdeAsistencia([...nombres].map(([id, nombre]) => ({ id, nombre })));
    // DÍAS / HORAS / TARD. se guardan en Supabase con origen RELOJ (única vía además del Módulo Creador)
    const n = await importarAsistenciaReloj(
      periodo,
      [...mapa].map(([trabajador, fechas]) => {
        const r = resumirAsistencia(fechas);
        // S/ por hora: se guardan las horas reales de las marcas (los demás: pago por día)
        const porHora = lista.find((x) => x.id === trabajador)?.tipoSueldo === "POR_HORA";
        return { trabajador, ...r, ...(porHora ? { horas: horasReales(fechas) } : {}) };
      })
    );
    setExcel({ asistencia: mapa, desde, hasta });
    setRango({ desde, hasta });
    setTab("planilla");
    const unidos = emp.porNombre.length ? ` · ${emp.porNombre.length} unido(s) por nombre (${emp.porNombre.map((x) => `${x.nombre} → N° ${x.id}`).join(", ")})` : "";
    toast(
      `Asistencia del ${fechaPE(desde)} al ${fechaPE(hasta)} importada en ${normalizarPeriodo(periodo)}: ${n} trabajador(es)${creados ? ` · ${creados} nuevo(s) por completar` : ""}${unidos}${emp.noEncontrados.length ? ` · ${emp.noEncontrados.length} sin vincular` : ""}`
    );
  };

  /** "Vincular" (o "Crear nuevo"): guarda la decisión y vuelve a procesar el mismo Excel para que entre a la planilla. */
  const resolverHuella = async (x: NoEncontrado | { huella: string; nombre: string }, trabajadorId: string | null | "QUITAR") => {
    try {
      if (trabajadorId === "QUITAR") desvincularHuella(x.huella);
      else if (trabajadorId) vincularHuella(x.huella, trabajadorId);
      else registrarDesdeAsistencia([{ id: x.huella, nombre: x.nombre }]);
      if (ultimasFilas) await procesarAsistencia(ultimasFilas);
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo vincular.", "error");
    }
  };

  const descargarPDF = (t: TrabajadorCalc) =>
    ejecutarAsync(async () => {
      // Código global BOL-xxx-AAAA (uno por trabajador y periodo; al volver a descargar se reutiliza)
      const codigo = await codigoBoleta(normalizarPeriodo(periodo), t.id, t.nombre, t.totalPagar);
      pdfBoletaPago({
      periodo: normalizarPeriodo(periodo),
      id: t.id,
      nombre: t.nombre,
      dni: t.dni,
      cargo: t.cargo,
      sede: t.sede,
      fechaIngreso: t.fechaIngreso,
      pension: afpLabel(t),
      afpPorcentaje: t.afpPorcentaje,
      sueldo: `${sueldoDe(t).label} ${soles(t.sueldo)}`,
      sueldoDiario: t.liq.sueldoDiario,
      valorHora: valorHoraTxt(t.valorHora),
      modo: MODOS_LIQUIDACION[t.liq.modo].label,
      basicoDetalle: t.liq.modo === "HORAS" ? `${horasTxt(t.horas)} h` : `${t.dias} días`,
      basico: t.liq.basico,
      horasExtra: `${horasTxt(t.liq.horasExtra)} h`,
      montoExtra: t.liq.montoExtra,
      bruto: t.bruto,
      descuentoAfp: t.descuentoAfp,
      adelantos: t.adelantosDescuento,
        totalPagar: t.totalPagar,
      }, codigo);
    }, "Boleta descargada");

  const importarBtn = !puedeEditar ? null : (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-corp px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-vino-900",
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
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-light leading-tight text-azul-900 lg:text-3xl">Planilla</h1>
          <p className="mt-1 text-[13px] text-plomo-600">Trabajadores, liquidación del periodo, historial y contratistas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/planilla/adelantos"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-plomo-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-plomo-50"
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
                <span className="text-xs text-plomo-500">({d.motivo})</span>
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
          { id: "contratistas", label: "Contratistas / Concesiones", icon: <Building2 size={16} /> },
        ]}
      />

      {/* ================= TRABAJADORES ================= */}
      {tab === "trabajadores" && (
        <Card>
          <CardHeader
            title="Maestro de trabajadores"
            subtitle={`${trabajadores.filter((t) => t.activo).length} activo(s) · ${trabajadores.filter((t) => !t.activo).length} inactivo(s)${nContratistas ? ` · ${nContratistas} contratista(s) en la pestaña Contratistas / Concesiones` : ""}`}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, DNI, N°, cargo…" className="w-60" />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-plomo-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
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
                <tr key={t.id} className={cn("transition hover:bg-plomo-50", !t.activo && "bg-plomo-100 text-slate-400")}>
                  <Td className="font-mono text-base">{t.id}</Td>
                  <Td>
                    <p className={cn("font-semibold", t.activo ? "text-azul-900" : "text-plomo-500 line-through decoration-slate-300")}>{t.nombre}</p>
                    <p className="text-xs text-plomo-500">
                      DNI {t.dni || "-"}
                      {edad(t.fechaNacimiento) !== null ? ` · ${edad(t.fechaNacimiento)} años` : ""}
                      {t.celular ? ` · ${t.celular}` : ""}
                    </p>
                  </Td>
                  <Td>
                    {t.cargo}
                    {t.sede && <p className="text-xs text-plomo-500">{t.sede}</p>}
                  </Td>
                  <Td>
                    {t.fechaIngreso ? (
                      <>
                        <p>{fechaPE(t.fechaIngreso)}</p>
                        <p className="text-xs text-plomo-500">{antiguedad(t.fechaIngreso)}</p>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-orange-600">Sin registrar</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {soles(t.sueldo)}
                    <p className="text-xs text-plomo-500">{sueldoDe(t).label}</p>
                  </Td>
                  <Td>
                    <p>{afpLabel(t)}</p>
                    <p className="text-xs text-plomo-500">{t.afpPorcentaje}%</p>
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
            <label className="block rounded-xl border border-plomo-200 bg-white p-3 shadow-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Periodo</span>
              <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="font-semibold" />
              <span className="mt-2 block text-[13px] font-semibold text-azul-900" data-semana>
                {etiquetaSemana(periodo, rango.desde, rango.hasta)}
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Inicio de semana"
                  value={rango.desde}
                  max={rango.hasta || undefined}
                  onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
                  className="w-full rounded-lg border border-plomo-200 px-2 py-1.5 text-xs"
                />
                <span className="text-xs text-plomo-500">al</span>
                <input
                  type="date"
                  aria-label="Fin de semana"
                  value={rango.hasta}
                  min={rango.desde || undefined}
                  onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
                  className="w-full rounded-lg border border-plomo-200 px-2 py-1.5 text-xs"
                />
              </span>
            </label>
            <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
              Trabajadores ({filtroActual.label}): <b>{visibles.length}</b>
              {filtro !== "TODOS" && <span className="text-plomo-500"> de {calculados.length}</span>}
              <p className="text-xs text-plomo-500">
                {excel
                  ? `Excel del ${fechaPE(excel.desde)} al ${fechaPE(excel.hasta)} · ${excel.asistencia.size} trabajador(es)`
                  : delPeriodo.size
                    ? `${delPeriodo.size} con asistencia en el periodo`
                    : "Sin asistencia en este periodo"}
              </p>
            </div>
            <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
              Básico {soles(totales.basico)} · Extra {soles(totales.extra)}
              <p className="text-xs text-red-600">
                AFP − {soles(totales.afp)} · Adelantos − {soles(totales.adelantos)}
              </p>
            </div>
            <div className="rounded-xl bg-azul-900 p-3 text-sm text-white">
              Total a pagar{filtro !== "TODOS" ? ` (${filtroActual.label})` : ""}: <b className="text-xl text-white">{soles(totales.pagar)}</b>
            </div>
          </div>
          {adelantos.error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Adelantos: {adelantos.error} (la planilla se calcula sin descontarlos).</p>}
          {(noEncontrados.length > 0 || detalleImport.length > 0) && (
            <ResultadoImportacion
              detalle={detalleImport}
              noEncontrados={noEncontrados}
              trabajadores={maestro}
              eleccion={eleccion}
              setEleccion={setEleccion}
              editable={puedeEditar}
              onVincular={(x, id) => resolverHuella(x, id)}
              onCrear={(x) => resolverHuella(x, null)}
              onDesvincular={(huella) => resolverHuella({ huella, nombre: "" }, "QUITAR")}
              onCerrar={() => setDetalleImport([])}
              antiguos={
                excel
                  ? [...delPeriodo.values()]
                      .filter((a) => !excel.asistencia.has(a.trabajador) && !noEncontrados.some((x) => x.huella === a.trabajador))
                      .map((a) => ({
                        id: a.trabajador,
                        nombre: maestro.find((t) => t.id === a.trabajador)?.nombre ?? "",
                        dias: a.dias,
                        horas: a.horas ?? 0,
                        origen: a.origen_edicion ?? "-",
                      }))
                      .filter((a) => a.dias > 0 || a.horas > 0)
                  : []
              }
              onLimpiar={(ids) =>
                ejecutarAsync(
                  () => importarAsistenciaReloj(periodo, ids.map((trabajador) => ({ trabajador, dias: 0, horas: 0, tardanzas: 0 }))),
                  `${ids.length} trabajador(es) puestos en 0 en ${normalizarPeriodo(periodo)}`
                )
              }
            />
          )}

          {/* Modo de cálculo */}
          <Card>
            <div className="flex flex-wrap items-end gap-4 p-4">
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Tipo de sueldo</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de sueldo">
                  {FILTROS_SUELDO.map((f) => {
                    const n = f.id === "TODOS" ? calculados.length : calculados.filter((t) => filtroDe(t) === f.id).length;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        data-filtro={f.id}
                        aria-pressed={filtro === f.id}
                        onClick={() => setFiltro(f.id)}
                        className={cn(
                          "rounded-full border px-4 py-2 text-sm font-semibold transition",
                          filtro === f.id ? "border-[#0f2238] bg-[#0f2238] text-white" : "border-plomo-200 bg-white text-plomo-600 hover:border-[#0f2238] hover:text-[#0f2238]"
                        )}
                      >
                        {f.label} <span className={cn("ml-1 text-xs", filtro === f.id ? "text-white/70" : "text-plomo-500")}>{n}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setEditarLista(true)}
                    className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
                    title="Elegir a mano a quién se paga esta semana"
                  >
                    ✏️ Editar lista manual
                    {listaSem && (listaSem.agregados.length > 0 || listaSem.quitados.length > 0) && (
                      <span className="ml-1 text-xs font-normal">
                        (+{listaSem.agregados.length} / −{listaSem.quitados.length})
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Asistencia</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soloAsistencia}
                  data-solo-asistencia
                  onClick={() => setSoloAsistencia((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-plomo-200 bg-white py-1.5 pl-1.5 pr-4 text-sm font-semibold text-azul-900"
                  title={soloAsistencia ? "Mostrando solo los de la lista de pago (con asistencia o agregados a mano)" : "Mostrando todos los trabajadores"}
                >
                  <span className={cn("relative h-6 w-11 rounded-full transition", soloAsistencia ? "bg-emerald-600" : "bg-plomo-200")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", soloAsistencia ? "left-[22px]" : "left-0.5")} />
                  </span>
                  {soloAsistencia ? "✓ Solo con asistencia" : "Todos"}
                </button>
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Modo de cálculo</span>
                <div className="inline-flex overflow-hidden rounded-xl border border-plomo-200">
                  {(Object.keys(MODOS_LIQUIDACION) as ModoLiquidacion[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={!puedeEditar}
                      onClick={() => m !== liq.modo && ejecutar(() => cambiarModo(periodo, m), `Modo: ${MODOS_LIQUIDACION[m].label}`)}
                      className={cn(
                        "px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed",
                        liq.modo === m ? "bg-azul-900 text-white" : "bg-white text-plomo-600 hover:bg-red-50"
                      )}
                    >
                      {MODOS_LIQUIDACION[m].label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Jornada (h)</span>
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
                  className="w-20 rounded-lg border border-plomo-200 px-3 py-2.5 text-sm font-semibold"
                />
              </label>
              {liq.modo === "DIAS_HORAS" && (
                <label>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-plomo-500">Recargo h. extra (%)</span>
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
                    className="w-24 rounded-lg border border-plomo-200 px-3 py-2.5 text-sm font-semibold"
                  />
                </label>
              )}
              <p className="min-w-[240px] flex-1 text-xs text-plomo-500">
                {MODOS_LIQUIDACION[liq.modo].ayuda}. Sueldo diario = mensual / 30 (diario: el mismo); sueldo hora = diario / {liq.horasJornada}. Tardanza: entrada después de las{" "}
                {HORA_TARDANZA}. Los botones ajustan solo esta planilla: lo del reloj 🔒 no cambia.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={`Planilla · ${normalizarPeriodo(periodo)}`}
              subtitle={`${filtroActual.label} · ${visibles.length} trabajador(es)${aPagar.length !== visibles.length ? ` (${aPagar.length} en la lista de pago)` : ""} · liquidación por ${MODOS_LIQUIDACION[liq.modo].label.toLowerCase()} · ${visibles.filter((c) => c.liq.manual).length} con ajuste manual${gruposPagados.size ? ` · pagado: ${[...gruposPagados].join(", ")}` : ""}`}
              action={
                <div className="flex flex-wrap gap-2">
                  {importarBtn}
                  {puedeEditar && (
                    <PagarSemanaFiltrada
                      periodo={normalizarPeriodo(periodo)}
                      grupo={filtroActual.grupo}
                      etiqueta={filtroActual.label}
                      filas={filasFiltradas}
                      rango={rango}
                      yaPagado={filtroPagado}
                      onPagado={() => {
                        void historial.recargar();
                        void adelantos.recargar();
                      }}
                    />
                  )}
                  {puedeEditar && (
                    <CerrarSemana
                      periodo={normalizarPeriodo(periodo)}
                      filas={filasCierre}
                      rango={rango.desde && rango.hasta ? rango : undefined}
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
            {visibles.length === 0 ? (
              <div className="p-5">
                <Empty
                  icon={<Calculator size={28} />}
                  text={
                    !calculados.length
                      ? "No hay trabajadores activos."
                      : soloAsistencia
                        ? `Ningún trabajador ${filtro === "TODOS" ? "" : `con ${filtroActual.label} `}tiene asistencia en esta semana. Importe la asistencia, use "Editar lista manual" o cambie a "Todos".`
                        : `No hay trabajadores con ${filtroActual.label}.`
                  }
                />
              </div>
            ) : (
              <Table head={["", "Trabajador", "Reloj 🔒", "A liquidar", "Básico", "H. extra", "AFP / ONP", "Adelantos", "Total a pagar", "Boleta"]}>
                {visibles.map((t) => (
                  <tr key={t.id} className={cn("align-top", !incluido(t) && "bg-plomo-50 opacity-50")}>
                    <Td className="w-8 px-2 text-center text-base">
                      {!incluido(t) ? (
                        <span data-asist="fuera" className="text-slate-400" title="No incluido en la lista de pago de esta semana">
                          —
                        </span>
                      ) : t.tieneAsistencia ? (
                        <span data-asist="reloj" className="text-emerald-600" title="Con asistencia registrada esta semana">
                          ✅
                        </span>
                      ) : (
                        <span data-asist="manual" className="rounded bg-amber-100 px-1" title="Agregado manual - sin asistencia registrada esta semana">
                          ✏️
                        </span>
                      )}
                    </Td>
                    <Td>
                      <p className="font-semibold text-azul-900">
                        <span className="mr-1 font-mono text-xs text-slate-400">{t.id}</span>
                        {t.nombre}
                        {pagado(t) && !periodoCerrado && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">PAGADO</span>}
                      </p>
                      <p className="text-xs text-plomo-500">
                        {t.liq.porHora ? (
                          <>
                            {soles(t.sueldo)} por hora · horas del reloj (sin jornada)
                          </>
                        ) : (
                          <>
                            {soles(t.sueldo)} {sueldoDe(t).label.toLowerCase()} · diario {soles(t.liq.sueldoDiario)} · hora {valorHoraTxt(t.valorHora)}
                          </>
                        )}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      <div className="flex flex-wrap gap-1">
                        <CampoBloqueado valor={`${t.reloj.dias} d`} />
                        <CampoBloqueado valor={`${horasTxt(t.reloj.horas)} h`} />
                        <CampoBloqueado valor={`${t.reloj.tardanzas} tard`} alerta={t.reloj.tardanzas > 0} />
                      </div>
                      {t.sinHorasReloj && (
                        <p className="mt-1 max-w-[180px] whitespace-normal rounded bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-800" data-sin-horas>
                          Sin horas del reloj: vuelva a importar la asistencia de esta semana
                        </p>
                      )}
                    </Td>
                    <Td>
                      <LiquidacionCelda periodo={periodo} trabajadorId={t.id} liq={liq} r={t.liq} editable={puedeEditar && !pagado(t)} />
                    </Td>
                    <Td className="text-right">{soles(t.liq.basico)}</Td>
                    <Td className="text-right">{t.liq.montoExtra ? soles(t.liq.montoExtra) : <span className="text-slate-400">-</span>}</Td>
                    <Td className="text-right text-red-600">
                      - {soles(t.descuentoAfp)}
                      <p className="text-[10px] text-plomo-500">{t.afpPorcentaje}%</p>
                    </Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        data-adelanto={t.id}
                        onClick={() => setAdelantoDe(t)}
                        title={t.adelantosPendientes > 0 ? "Ver / editar adelantos" : "Registrar adelanto"}
                        className="rounded-md px-1.5 py-0.5 text-right transition hover:bg-red-50 hover:ring-1 hover:ring-red-200"
                      >
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
                        <span className="text-slate-400 underline decoration-dotted underline-offset-4">-</span>
                      )}
                      </button>
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

      {tab === "contratistas" && (
        <div className="space-y-6">
          <ContratistasMaestro trabajadores={maestro} soloLectura={!puedeEditar} />
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-azul-900">
              <Building2 size={18} className="text-corp" /> Concesiones / servicios externos
            </h2>
            <Contratistas soloLectura={!puedeEditar} />
          </div>
        </div>
      )}

      {/* FICHA DEL TRABAJADOR (registrar / editar / baja / eliminar / historial de pagos) */}
      {ficha && <FichaTrabajador inicial={ficha.form} idOriginal={ficha.idOriginal} soloLectura={!puedeEditar} onClose={() => setFicha(null)} />}

      {/* LISTA MANUAL DE PAGO DE LA SEMANA */}
      {editarLista && (
        <EditarListaSemana
          periodo={normalizarPeriodo(periodo)}
          filas={calculados.map((t) => ({
            id: t.id,
            nombre: t.nombre,
            tipo: FILTROS_SUELDO.find((x) => x.id === filtroDe(t))!.label,
            horas: t.reloj.horas,
            tieneAsistencia: t.tieneAsistencia,
            marcado: incluido(t),
            pagado: pagado(t),
          }))}
          onClose={() => setEditarLista(false)}
        />
      )}

      {/* ADELANTOS DEL TRABAJADOR (columna ADELANTOS) */}
      {adelantoDe && (
        <AdelantosTrabajador
          trabajador={adelantoDe}
          periodo={normalizarPeriodo(periodo)}
          pendientes={pendientesDe(adelantoDe, adelantos.grupos)}
          editable={puedeEditar && !pagado(adelantoDe)}
          onClose={() => setAdelantoDe(null)}
          onCambio={() => void adelantos.recargar()}
        />
      )}

      {/* MODAL BOLETA */}
      <Modal open={!!boletaSel} onClose={() => setBoletaSel(null)} title="Boleta de pago">
        {boletaSel && (
          <>
            <div className="space-y-1 border-2 border-azul-900 p-4 text-xs">
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
                <thead className="bg-azul-900 text-[11px] uppercase tracking-widest text-white">
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
