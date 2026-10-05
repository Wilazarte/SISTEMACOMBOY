"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Eye, FileDown, Pencil, Plus, Upload, Users, HandCoins, History } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Tabs, Td, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import {
  AFP_OPTIONS,
  TIPOS_SUELDO,
<<<<<<< HEAD
=======
  detectarDuplicados,
  edad,
  esContratista,
  eliminarTrabajador,
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360
  fechaPE,
  guardarTrabajador,
  hoy,
  r2,
  registrarDesdeAsistencia,
  soles,
  trabajadorVacio,
  useTrabajadores,
} from "@/lib/storage";
import { getSesion } from "@/lib/auth";
<<<<<<< HEAD
import { crearAdelanto, listarAdelantos, type Adelanto } from "@/lib/adelantos";
import type { TipoAfp, TipoSueldo, Trabajador } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
=======
import { HORA_TARDANZA, aplicarAlias, leerMarcaciones, resumirAsistencia, textoCsv, type AsistenciaMap } from "@/lib/asistencia";
import { MODOS_LIQUIDACION, cambiarConfig, cambiarModo, liquidacionDe, liquidar, type ResultadoLiquidacion } from "@/lib/liquidacion";
import { CerrarSemana } from "@/components/planilla/CerrarSemana";
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
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360

type Tab = "trabajadores" | "planilla" | "historial";
type Asistencia = Map<string, { nombre: string; fechas: Map<string, string[]> }>;

type TrabajadorCalc = Trabajador & {
  dias: number;
  horas: number;
  tardanzas: number;
  bruto: number;
  adelanto: number;
  descuentoAfp: number;
  descuentoTotal: number;
  neto: number;
};

const OPC_SUELDO = (Object.keys(TIPOS_SUELDO) as TipoSueldo[]).map((k) => ({ value: k, label: TIPOS_SUELDO[k].label }));
const OPC_AFP = (Object.keys(AFP_OPTIONS) as TipoAfp[]).map((k) => ({ value: k, label: AFP_OPTIONS[k].label }));

function antiguedad(fechaIngreso: string): string {
  if (!fechaIngreso) return "-";
  const [y, m, d] = fechaIngreso.split("-").map(Number);
  const [hy, hm, hd] = hoy().split("-").map(Number);
  let meses = (hy - y) * 12 + (hm - m) - (hd < d? 1 : 0);
  if (meses < 0) meses = 0;
  const a = Math.floor(meses / 12);
  const r = meses % 12;
  if (a === 0) return r === 0? "< 1 mes" : `${r} mes${r > 1? "es" : ""}`;
  return `${a} año${a > 1? "s" : ""}${r? ` ${r} m` : ""}`;
}

function calcular(t: Trabajador, asistenciaMap: Asistencia, adelantoMonto: number = 0): TrabajadorCalc {
  let dias = 0;
  let totalHoras = 0;
  let tardanzas = 0;

  const registro = asistenciaMap.get(t.id) || [...asistenciaMap.values()].find(v => v.nombre.toUpperCase().trim() === t.nombre.toUpperCase().trim());

  if (registro) {
    registro.fechas.forEach((tiempos, fecha) => {
      const d = new Date(fecha + "T00:00:00");
      const diaSemana = d.getDay();
      if (diaSemana === 0) return;

      const horasLimpias = tiempos.map((h: string) => {
        const partes = h.trim().split(" ");
        const hora = partes.length > 1? partes[1] : partes[0];
        return hora.slice(0, 5);
      }).filter(Boolean).sort();

      if (horasLimpias.length === 0) return;
      dias += 1;

      const esSabado = diaSemana === 6;
      const horasEsperadas = esSabado? 6 : 9;
      const [h1, m1] = horasLimpias[0].split(':').map(Number);
      const [h2, m2] = horasLimpias[horasLimpias.length - 1].split(':').map(Number);
      let diff = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
      if (diff < 0) diff += 24;
      let horasDia = diff > 0? diff : horasEsperadas;
      if (horasLimpias.length === 1) horasDia = horasEsperadas;

      totalHoras += horasDia;
      if (horasLimpias[0] > "08:15") tardanzas++;
    });
  }

  let diasFinal = Math.min(Math.floor(dias), 26);
  if (dias === 0) diasFinal = 26; // si no hay asistencia, asume 26 como tenías
  const tipo = (t.tipoSueldo || "MENSUAL").toString().toUpperCase();
  const sueldoBase = Number(t.sueldo) || 0;
  let bruto = 0;

  if (tipo.includes("HORA")) bruto = r2(sueldoBase * totalHoras);
  else if (tipo.includes("MENSUAL")) bruto = r2((sueldoBase / 26) * diasFinal);
  else if (tipo.includes("SEMANAL")) bruto = r2((sueldoBase / 6) * diasFinal);
  else if (tipo.includes("QUINCENAL")) bruto = r2((sueldoBase / 13) * diasFinal);
  else bruto = r2(sueldoBase * diasFinal);

  const descuentoAfp = r2(bruto * (t.afpPorcentaje / 100));
  const descuentoTotal = r2(descuentoAfp + adelantoMonto);
  const neto = r2(bruto - descuentoTotal);

  return {...t, dias: diasFinal, horas: r2(totalHoras), tardanzas, bruto, adelanto: r2(adelantoMonto), descuentoAfp, descuentoTotal, neto };
}

export default function PlanillaPage() {
<<<<<<< HEAD
  const trabajadores = useTrabajadores();
  const soloLectura =!!getSesion()?.soloLectura;
=======
  const maestro = useTrabajadores();
  // Contratistas: mismo maestro, pero fuera de la lista de operarios y de la planilla del periodo
  const trabajadores = useMemo(() => maestro.filter((t) => !esContratista(t)), [maestro]);
  const nContratistas = maestro.length - trabajadores.length;
  const sesion = getSesion();
  const soloLectura = !!sesion?.soloLectura; // Gerencia: ver sin editar
  const puedeEditar = !soloLectura && ["creador", "planilla", "admin"].includes(sesion?.rol ?? "");
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360
  const [tab, setTab] = useState<Tab>("trabajadores");
  const [asistencia, setAsistencia] = useState<Asistencia>(new Map());
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [periodo, setPeriodo] = useState(() => {
    const hoyDate = new Date();
    const hoyPeru = new Date(hoyDate.toLocaleString("en-US", { timeZone: "America/Lima" }));
    const mes = hoyPeru.toLocaleString('es-PE', { month: 'long', timeZone: 'America/Lima' }).toUpperCase();
    const anio = hoyPeru.getFullYear();
    const semana = Math.ceil(hoyPeru.getDate() / 6);
    return `SEMANA ${semana} - ${mes} ${anio}`;
  });
  const [boletaSel, setBoletaSel] = useState<TrabajadorCalc | null>(null);
  const [editando, setEditando] = useState<{ form: Trabajador; idOriginal?: string } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);

<<<<<<< HEAD
  const supabase = useMemo(() => createClient(), []);

const cargarAdelantos = useCallback(async () => {
  try {
    const lista = await listarAdelantos();
    setAdelantos(lista.filter(a => a.estado === "PENDIENTE"));
  } catch {}
}, []);

const cargarHistorial = useCallback(async () => {
  setCargandoHist(true);
  const { data } = await supabase.from("planilla_historial").select("*").order("fecha_cierre", { ascending: false });
  setHistorial(data || []);
  setCargandoHist(false);
}, [supabase]);
  useEffect(() => { void cargarAdelantos(); }, [cargarAdelantos]);
  useEffect(() => { if (tab === "historial") void cargarHistorial(); }, [tab, cargarHistorial]);

  const adelantosMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of adelantos) {
      const nombreKey = a.trabajador_nombre?.toUpperCase().trim();
      const dniKey = a.dni?.trim();
      const t = trabajadores.find(w => w.nombre.toUpperCase().trim() === nombreKey || w.dni === dniKey);
      if (t) m[t.id] = (m[t.id] || 0) + a.monto;
      else {
        if (nombreKey) m[nombreKey] = (m[nombreKey] || 0) + a.monto;
        if (dniKey) m[dniKey] = (m[dniKey] || 0) + a.monto;
      }
    }
=======
  const liq = useMemo(() => liquidacionDe(liquidaciones, periodo), [liquidaciones, periodo]);
  const incompletos = trabajadores.filter((t) => t.activo && !t.fechaIngreso);
  const duplicados = useMemo(() => detectarDuplicados(maestro), [maestro]);
  // Asistencia guardada en Supabase para el periodo elegido
  const delPeriodo = useMemo(() => {
    const m = new Map<string, AsistenciaPeriodo>();
    asistencia.filter((a) => a.periodo === normalizarPeriodo(periodo)).forEach((a) => m.set(a.id, a));
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360
    return m;
  }, [adelantos, trabajadores]);

  const incompletos = trabajadores.filter((t) => t.activo &&!t.fechaIngreso);
  const calculados = useMemo(
    () => trabajadores.filter((t) => t.activo).map((t) => {
      const monto = adelantosMap[t.id] || adelantosMap[t.nombre.toUpperCase().trim()] || (t.dni? adelantosMap[t.dni] : 0) || 0;
      return calcular(t, asistencia, monto);
    }),
    [trabajadores, asistencia, adelantosMap]
  );

  const listaMaestro = trabajadores.filter((t) => verInactivos || t.activo).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const importarAsistencia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target; const file = input.files?.[0]; input.value = ""; if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd hh:mm:ss" });
      const mapa: Asistencia = new Map();
      filas.forEach((r) => {
        const numero = String(r["Número"] || r["Numero"] || r["N°"] || r["No."] || "").trim();
        const nombre = String(r["Nombre"] || "").trim();
        const tiempo = String(r["Tiempo"] || "").trim();
        if (!numero ||!tiempo) return;
        if (!mapa.has(numero)) mapa.set(numero, { nombre, fechas: new Map() });
        const fecha = tiempo.split(" ")[0];
        const obj = mapa.get(numero)!;
        if (!obj.fechas.has(fecha)) obj.fechas.set(fecha, []);
        obj.fechas.get(fecha)!.push(tiempo);
      });
      if (mapa.size === 0) { toast("No se encontraron marcaciones.", "error"); return; }
      const creados = registrarDesdeAsistencia([...mapa].map(([id, v]) => ({ id, nombre: v.nombre })));
      setAsistencia(mapa); setTab("planilla");
      toast(`Asistencia importada: ${mapa.size} trabajador(es)${creados? ` · ${creados} nuevo(s)` : ""}`);
    } catch { toast("No se pudo leer el archivo.", "error"); }
  };

  const agregarAdelantoRapido = async (t: TrabajadorCalc) => {
    const montoStr = prompt(`Adelanto para ${t.nombre} (S/):`);
    if (!montoStr) return;
    const monto = parseFloat(montoStr);
    if (!monto || monto <= 0) { toast("Monto inválido", "error"); return; }
    const motivo = prompt("Motivo (opcional):", "Adelanto de sueldo") || "Adelanto rápido desde planilla";
    const ok = await ejecutarAsync(() => crearAdelanto({
      trabajador_nombre: t.nombre,
      dni: t.dni || "",
      fecha: hoy(),
      monto,
      motivo,
      estado: "PENDIENTE"
    }), `Adelanto de ${soles(monto)} registrado`);
    if (ok) void cargarAdelantos();
  };

  const cerrarPlanilla = async () => {
  const totalNeto = calculados.reduce((a,b)=>a+b.neto,0);
  const totalBruto = calculados.reduce((a,b)=>a+b.bruto,0);
  if(!confirm(`¿Cerrar ${periodo} por ${soles(totalNeto)}?`)) return;
  try{
    const { data: hist, error } = await supabase.from("planilla_historial").insert({
      periodo,
      fecha_cierre: new Date().toISOString(),
      total_bruto: totalBruto,
      total_neto: totalNeto,
    }).select().single();
    if(error) throw error;
    const detalles = calculados.map(c=>({
      historial_id: hist.id,
      trabajador_id: c.id,
      dias_trabajados: c.dias,
      sueldo_bruto: c.bruto,
      sueldo_neto: c.neto,
      faltas: 26 - c.dias,
    }));
    await supabase.from("planilla_historial_detalle").insert(detalles);
    toast("Planilla cerrada y guardada en Historial");
    void cargarHistorial();
  }catch(e:any){ toast("Error al cerrar: "+e.message, "error"); }
};

  const guardar = () => {
    if (!editando) return;
    const ok = ejecutar(() => guardarTrabajador(editando.form, editando.idOriginal), editando.idOriginal? "Trabajador actualizado" : "Trabajador registrado");
    if (ok) setEditando(null);
  };

  const descargarPDF = async (t: TrabajadorCalc) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("CV COMBOY VID E.I.R.L.", 20, 20);
    doc.setFontSize(10); doc.text(`BOLETA DE PAGO - ${periodo}`, 20, 27);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Trabajador: ${t.nombre} | DNI: ${t.dni || "-"} | N°: ${t.id}`, 20, 38);
    doc.text(`Cargo: ${t.cargo} | Ingreso: ${fechaPE(t.fechaIngreso)} | ${AFP_OPTIONS[t.afpTipo].label} (${t.afpPorcentaje}%) | ${t.tipoSueldo}`, 20, 44);
    doc.text(`Días: ${t.dias} (L-V 9h, Sáb 6h) | Horas: ${t.horas}h | Tardanzas: ${t.tardanzas}`, 20, 50);
    doc.line(20, 55, 190, 55);
    doc.text(`Remuneración bruta: ${soles(t.bruto)}`, 20, 65);
    doc.text(`Adelantos: - ${soles(t.adelanto)}`, 20, 72);
    doc.text(`Dscto ${AFP_OPTIONS[t.afpTipo].label}: - ${soles(t.descuentoAfp)}`, 20, 79);
    doc.setFont("helvetica", "bold"); doc.text(`NETO A PAGAR: ${soles(t.neto)}`, 20, 92);
    doc.save(`BOLETA_${t.id}_${t.nombre.replace(/\s+/g, "_")}.pdf`);
  };

  const importarBtn = soloLectura? null : (
    <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600">
      <Upload size={16} /> Importar asistencia
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importarAsistencia} />
    </label>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planilla</h1>
          <p className="text-sm text-slate-500">L-V 9h=1 día · Sábado 6h=1 día · Mensual/Diario corrige · Adelantos sin Excel</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditando({ form: trabajadorVacio() })} disabled={soloLectura}><Plus size={16} /> Registrar trabajador</Button>
          {importarBtn}
        </div>
      </div>

      {incompletos.length > 0 && (
        <button onClick={() => setTab("trabajadores")} className="flex w-full items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-5 py-3 text-left text-sm text-orange-800">
          <AlertTriangle size={18} /> {incompletos.length} trabajador(es) sin fecha de ingreso.
        </button>
      )}

<<<<<<< HEAD
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "trabajadores", label: "Trabajadores", icon: <Users size={16} />, count: incompletos.length },
        { id: "planilla", label: "Planilla del periodo", icon: <Calculator size={16} /> },
        { id: "historial", label: "Historial", icon: <History size={16} />, count: historial.length }
      ]} />
=======
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
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360

      {tab === "trabajadores" && (
        <Card>
<<<<<<< HEAD
          <CardHeader title="Maestro de trabajadores" subtitle={`${trabajadores.filter((t) => t.activo).length} activo(s) · ${adelantos.length} adelantos pendientes`} action={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Mostrar inactivos</label>} />
          <Table head={["N°", "Trabajador", "Cargo", "F. ingreso", "Sueldo", "Pensión", "Estado", ""]}>
            {listaMaestro.map((t) => (
              <tr key={t.id} className={cn(!t.activo && "opacity-50")}>
                <Td className="font-mono">{t.id}</Td>
                <Td><p className="font-semibold">{t.nombre}</p><p className="text-xs text-slate-500">DNI {t.dni || "-"} - {t.tipoSueldo}</p></Td>
                <Td>{t.cargo}</Td>
                <Td>{t.fechaIngreso? fechaPE(t.fechaIngreso) : <span className="text-xs font-semibold text-orange-600">Sin registrar</span>}</Td>
                <Td className="text-right">{soles(t.sueldo)}</Td>
                <Td>{AFP_OPTIONS[t.afpTipo].label} {t.afpPorcentaje}%</Td>
                <Td><Badge estado={t.activo? "ACTIVO" : "INACTIVO"} /></Td>
                <Td><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setEditando({ form: {...t }, idOriginal: t.id })}><Pencil size={14} /></Button></div></Td>
              </tr>
            ))}
          </Table>
=======
          <CardHeader
            title="Maestro de trabajadores"
            subtitle={`${trabajadores.filter((t) => t.activo).length} activo(s) · ${trabajadores.filter((t) => !t.activo).length} inactivo(s)${nContratistas ? ` · ${nContratistas} contratista(s) en la pestaña Contratistas / Concesiones` : ""}`}
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
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360
        </Card>
      )}

      {tab === "planilla" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Periodo"><Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="font-semibold" /></Field>
            <div className="rounded-xl border bg-white p-3 text-sm">Activos: <b>{calculados.length}</b><p className="text-xs text-slate-500">{asistencia.size? `${asistencia.size} con marcaciones` : "Sin asistencia importada"}</p></div>
            <div className="rounded-xl bg-slate-900 p-3 text-sm text-white">Total neto: <b className="text-amber-400">{soles(r2(calculados.reduce((a, b) => a + b.neto, 0)))}</b><p className="text-xs">Adelantos pendientes: {soles(adelantos.reduce((s,a)=>s+a.monto,0))}</p></div>
          </div>

          <Card>
            <CardHeader title={`Planilla · ${periodo}`} subtitle="Botón + Adelanto registra sin salir y descuenta al instante" action={
              <div className="flex gap-2">{importarBtn}<Button onClick={cerrarPlanilla} className="bg-black text-white">Cerrar Planilla</Button></div>
            } />
            <Table head={["N°", "Trabajador", "Días", "Tard.", "Bruto", "Adelantos", "Dscto", "Neto", "Acción"]}>
              {calculados.map((t) => (
                <tr key={t.id} className={cn(t.adelanto > 0 && "bg-amber-50/50")}>
                  <Td className="font-mono">{t.id}</Td>
                  <Td><p className="font-semibold text-slate-900">{t.nombre}</p><p className="text-xs text-slate-500">{t.dias} días · {t.horas}h · {t.tipoSueldo}</p></Td>
                  <Td className="text-center font-bold">{t.dias}</Td>
                  <Td className={cn("text-center", t.tardanzas > 0 && "text-orange-600 font-bold")}>{t.tardanzas}</Td>
                  <Td className="text-right">{soles(t.bruto)}</Td>
                  <Td className="text-right">
                    {t.adelanto > 0? <span className="font-bold text-amber-600">- {soles(t.adelanto)}</span> : <span className="text-slate-400">-</span>}
                    <div className="mt-1"><Button size="sm" variant="secondary" onClick={() => void agregarAdelantoRapido(t)} className="h-6 px-2 text-xs"><HandCoins size={12} /> + Adelanto</Button></div>
                  </Td>
                  <Td className="text-right text-red-600">- {soles(t.descuentoAfp)}</Td>
                  <Td className="text-right font-bold">{soles(t.neto)}</Td>
                  <Td><div className="flex gap-1"><Button size="sm" onClick={() => setBoletaSel(t)}><Eye size={14} /></Button><Button size="sm" variant="warning" onClick={() => void descargarPDF(t)}><FileDown size={14} /></Button></div></Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {tab === "historial" && (
        <Card>
          <CardHeader title={`Historial - ${historial.length} cierres`} subtitle="Guardados en planilla_historial" action={<Button size="sm" variant="secondary" onClick={cargarHistorial}>Actualizar</Button>} />
          {cargandoHist? <div className="p-6 text-sm">Cargando...</div> : (
            <div className="grid gap-2 p-4">
              {historial.length===0 && <p className="text-sm text-slate-500">Aún no hay cierres. Usa Cerrar Planilla.</p>}
              {historial.map((h:any)=>(
                <div key={h.id} className="flex justify-between items-center border rounded-lg p-4 hover:bg-gray-50">
                  <div>
                    <div className="font-bold">{h.periodo}</div>
                    <div className="text-xs text-slate-500">{h.fecha_cierre? new Date(h.fecha_cierre).toLocaleString('es-PE'): ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">S/ {Number(h.total_neto||0).toFixed(2)}</div>
                    <div className="text-xs text-slate-500">Bruto S/ {Number(h.total_bruto||0).toFixed(2)}</div>
                  </div>
                  <Link href={`/dashboard/planilla/historial/${h.id}`} className="text-xs underline">Ver detalle</Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

<<<<<<< HEAD
      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.idOriginal? `Editar N° ${editando.idOriginal}` : "Registrar trabajador"}>
        {editando && <FormTrabajador form={editando.form} onChange={(form: any) => setEditando({...editando, form })} onCancel={() => setEditando(null)} onSave={guardar} />}
      </Modal>
=======
      {tab === "contratistas" && (
        <div className="space-y-6">
          <ContratistasMaestro trabajadores={maestro} soloLectura={!puedeEditar} />
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Building2 size={18} className="text-amber-500" /> Concesiones / servicios externos
            </h2>
            <Contratistas soloLectura={!puedeEditar} />
          </div>
        </div>
      )}
>>>>>>> e59e00221a52e9104b27b8f0550560c659ba2360

      <Modal open={!!boletaSel} onClose={() => setBoletaSel(null)} title="Boleta de pago">
        {boletaSel && (
          <>
            <div className="space-y-1 border-2 border-slate-900 p-4 text-xs">
              <div className="flex justify-between border-b pb-2"><b>CV COMBOY VID - {periodo}</b></div>
              <p><b>{boletaSel.nombre}</b> · {boletaSel.dias} días (L-V 9h, Sáb 6h) · {boletaSel.horas}h · {boletaSel.tipoSueldo}</p>
              <table className="mt-3 w-full border"><tbody>
                <tr className="border-t"><td className="p-2">Bruto</td><td className="p-2 text-right">{soles(boletaSel.bruto)}</td></tr>
                <tr className="border-t text-amber-700"><td className="p-2">Adelantos</td><td className="p-2 text-right">- {soles(boletaSel.adelanto)}</td></tr>
                <tr className="border-t text-red-600"><td className="p-2">AFP {boletaSel.afpPorcentaje}%</td><td className="p-2 text-right">- {soles(boletaSel.descuentoAfp)}</td></tr>
                <tr className="border-t bg-amber-100 font-bold"><td className="p-2">NETO</td><td className="p-2 text-right">{soles(boletaSel.neto)}</td></tr>
              </tbody></table>
            </div>
            <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setBoletaSel(null)}>Cerrar</Button><Button variant="warning" onClick={() => void descargarPDF(boletaSel)}><FileDown size={16} /> PDF</Button></div>
          </>
        )}
      </Modal>
    </div>
  );
}

function FormTrabajador(props: any) {
  const { form, onChange, onCancel, onSave } = props;
  const set = (k: string, v: any) => onChange({...form, [k]: v });
  return (
    <form onSubmit={(e: any) => { e.preventDefault(); onSave(); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="N° huella *"><Input value={form.id} onChange={(e: any) => set("id", e.target.value)} /></Field>
        <Field label="DNI"><Input value={form.dni} onChange={(e: any) => set("dni", e.target.value.replace(/\D/g, "").slice(0, 8))} /></Field>
        <Field label="Nombre completo *" className="col-span-2"><Input value={form.nombre} onChange={(e: any) => set("nombre", e.target.value)} /></Field>
        <Field label="Cargo"><Input value={form.cargo} onChange={(e: any) => set("cargo", e.target.value)} /></Field>
        <Field label="Fecha ingreso *"><Input type="date" value={form.fechaIngreso} max={hoy()} onChange={(e: any) => set("fechaIngreso", e.target.value)} /></Field>
        <Field label="Tipo sueldo *"><Select value={form.tipoSueldo} options={OPC_SUELDO} onChange={(e: any) => set("tipoSueldo", e.target.value)} /></Field>
        <Field label="Sueldo (S/)"><Input type="number" value={form.sueldo} onChange={(e: any) => set("sueldo", Number(e.target.value))} /></Field>
        <Field label="AFP *"><Select value={form.afpTipo} options={OPC_AFP} onChange={(e: any) => { const afpTipo = e.target.value; onChange({...form, afpTipo, afpPorcentaje: (AFP_OPTIONS as any)[afpTipo].porc }); }} /></Field>
        <Field label="% Dscto"><Input type="number" value={form.afpPorcentaje} disabled={form.afpTipo === "SIN"} onChange={(e: any) => set("afpPorcentaje", Number(e.target.value))} /></Field>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit" variant="warning">Guardar</Button></div>
    </form>
  );
}