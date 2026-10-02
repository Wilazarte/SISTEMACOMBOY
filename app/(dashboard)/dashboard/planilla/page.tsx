"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Calculator, Eye, FileDown, Lock, Pencil, Plus, Power, Trash2, Upload, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Tabs, Td, cn, ejecutar, toast } from "@/components/ui";
import {
  AFP_OPTIONS,
  KEYS,
  MSG_ASISTENCIA_BLOQUEADA,
  TIPOS_SUELDO,
  cambiarEstadoTrabajador,
  eliminarTrabajador,
  fechaPE,
  guardarTrabajador,
  hoy,
  idAsistencia,
  importarAsistenciaReloj,
  normalizarPeriodo,
  r2,
  registrarDesdeAsistencia,
  soles,
  trabajadorVacio,
  useStore,
  useTrabajadores,
} from "@/lib/storage";
import { getSesion } from "@/lib/auth";
import { HORAS_DIA, HORA_TARDANZA, leerMarcaciones, resumirAsistencia, textoCsv, type AsistenciaMap } from "@/lib/asistencia";
import { CerrarSemana } from "@/components/planilla/CerrarSemana";
import { HistorialPlanilla } from "@/components/planilla/HistorialPlanilla";
import { useHistorialPlanilla } from "@/components/planilla/useHistorialPlanilla";
import type { FilaCierre } from "@/lib/historial";
import type { AsistenciaPeriodo, TipoAfp, TipoSueldo, Trabajador } from "@/lib/types";

type Tab = "trabajadores" | "planilla" | "historial";

type TrabajadorCalc = Trabajador & {
  dias: number;
  horas: number;
  tardanzas: number;
  origen?: AsistenciaPeriodo["origen_edicion"];
  valorHora: number;
  bruto: number;
  descuentoAfp: number;
  neto: number;
};

/** Excel importado en esta sesión: se muestra completo, sin filtrar por periodo ni por fechas. */
type ExcelImportado = { asistencia: AsistenciaMap; desde: string; hasta: string };

const OPC_SUELDO = (Object.keys(TIPOS_SUELDO) as TipoSueldo[]).map((k) => ({ value: k, label: TIPOS_SUELDO[k].label }));
const OPC_AFP = (Object.keys(AFP_OPTIONS) as TipoAfp[]).map((k) => ({ value: k, label: AFP_OPTIONS[k].label }));

// Datos antiguos pueden traer un tipo de sueldo / pensión que ya no existe: no romper la pantalla.
const sueldoDe = (t: Trabajador) => TIPOS_SUELDO[t.tipoSueldo as TipoSueldo] ?? TIPOS_SUELDO.DIARIO;
const afpLabel = (t: Trabajador): string => AFP_OPTIONS[t.afpTipo as TipoAfp]?.label ?? String(t.afpTipo ?? "-");
const horasTxt = (h: number) => h.toLocaleString("es-PE", { maximumFractionDigits: 2 });
// 4 decimales: 130 / 9 = 14.4444 (con 2 decimales la boleta no cuadraría al multiplicar a mano)
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
 * Pago por HORAS: 1 día = 9 h. valorHora = sueldo diario / 9; bruto = valorHora × totalHoras.
 * Si hay Excel importado se lee TODO su Map (todas las fechas, sin filtrar por periodo);
 * si no, se usa lo guardado en Supabase para el periodo (sin horas guardadas: días × 9).
 */
function calcular(t: Trabajador, asistenciaExterna?: AsistenciaMap | null, registro?: AsistenciaPeriodo): TrabajadorCalc {
  const fechas = asistenciaExterna?.get(t.id);
  const { dias, horas, tardanzas } = fechas
    ? resumirAsistencia(fechas)
    : { dias: registro?.dias ?? 0, horas: registro?.horas ?? (registro?.dias ?? 0) * HORAS_DIA, tardanzas: registro?.tardanzas ?? 0 };
  const valorHora = t.sueldo / sueldoDe(t).divisor / HORAS_DIA;
  const bruto = r2(valorHora * horas);
  const descuentoAfp = r2(bruto * ((t.afpPorcentaje || 0) / 100));
  return {
    ...t,
    dias,
    horas,
    tardanzas,
    valorHora,
    bruto,
    descuentoAfp,
    neto: r2(bruto - descuentoAfp),
    origen: fechas ? "RELOJ" : registro?.origen_edicion,
  };
}

/** DÍAS / TARD.: solo lectura en esta vista (se editan en Importar asistencia o el Módulo Creador). */
function CampoBloqueado({ valor, alerta }: { valor: number; alerta?: boolean }) {
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
  const puedeCerrar = !soloLectura && ["creador", "planilla", "admin"].includes(sesion?.rol ?? "");
  const [tab, setTab] = useState<Tab>("trabajadores");
  const historial = useHistorialPlanilla();

  // /dashboard/planilla?tab=historial (vuelta desde el detalle de un periodo cerrado)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "historial") setTab("historial");
  }, []);
  const asistencia = useStore<AsistenciaPeriodo[]>(KEYS.ASISTENCIA, []);
  const [periodo, setPeriodo] = useState("SEMANA 14 - ABRIL 2026");
  const [importando, setImportando] = useState(false);
  const [excel, setExcel] = useState<ExcelImportado | null>(null);
  const [boletaSel, setBoletaSel] = useState<TrabajadorCalc | null>(null);
  const [editando, setEditando] = useState<{ form: Trabajador; idOriginal?: string } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);

  const incompletos = trabajadores.filter((t) => t.activo && !t.fechaIngreso);
  // Asistencia guardada en Supabase para el periodo elegido
  const delPeriodo = useMemo(() => {
    const m = new Map<string, AsistenciaPeriodo>();
    asistencia.filter((a) => a.periodo === normalizarPeriodo(periodo)).forEach((a) => m.set(a.id, a));
    return m;
  }, [asistencia, periodo]);
  const calculados = useMemo(
    () => trabajadores.filter((t) => t.activo).map((t) => calcular(t, excel?.asistencia, delPeriodo.get(idAsistencia(periodo, t.id)))),
    [trabajadores, excel, delPeriodo, periodo]
  );
  // Copia de la planilla tal como se ve, para "Cerrar semana"
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
        origen: t.origen ?? null,
      })),
    [calculados]
  );
  const periodoCerrado = historial.lista.some((h) => h.periodo === normalizarPeriodo(periodo));
  const listaMaestro = trabajadores
    .filter((t) => verInactivos || t.activo)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

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

      // Agrupa por trabajador y por fecha (DD/MM/YYYY HH:mm:ss -> fecha + "HH:mm"); lee TODO el archivo
      const { asistencia: mapa, nombres, desde, hasta } = leerMarcaciones(filas);
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
      // La planilla se calcula con calcular(t, asistenciaMap): todas las fechas del Excel
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

  const guardar = () => {
    if (!editando) return;
    const ok = ejecutar(() => guardarTrabajador(editando.form, editando.idOriginal), editando.idOriginal ? "Trabajador actualizado" : "Trabajador registrado");
    if (ok) setEditando(null);
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
    doc.text(`Trabajador: ${t.nombre} | DNI: ${t.dni || "-"} | N°: ${t.id}`, 20, 38);
    doc.text(`Cargo: ${t.cargo} | Ingreso: ${fechaPE(t.fechaIngreso)} | ${afpLabel(t)} (${t.afpPorcentaje}%)`, 20, 44);
    doc.text(`Tipo sueldo: ${sueldoDe(t).label} ${soles(t.sueldo)} | Días: ${t.dias} | Horas: ${horasTxt(t.horas)} | Valor hora: ${valorHoraTxt(t.valorHora)} | Tardanzas: ${t.tardanzas}`, 20, 50);
    doc.line(20, 55, 190, 55);
    doc.text(`Remuneración bruta: ${soles(t.bruto)}`, 20, 65);
    doc.text(`Descuento ${afpLabel(t)} (${t.afpPorcentaje}%): - ${soles(t.descuentoAfp)}`, 20, 72);
    doc.setFont("helvetica", "bold");
    doc.text(`NETO A PAGAR: ${soles(t.neto)}`, 20, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Firma Trabajador _________________ Firma Empleador _________________", 20, 110);
    doc.save(`BOLETA_${t.id}_${t.nombre.replace(/\s+/g, "_")}.pdf`);
  };

  const importarBtn = soloLectura ? null : (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600",
        importando && "pointer-events-none opacity-60"
      )}
      title={`Guarda DÍAS, HORAS y TARD. en el periodo ${normalizarPeriodo(periodo)}`}
    >
      <Upload size={16} /> {importando ? "Importando…" : "Importar asistencia"}
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importarAsistencia} disabled={importando} />
    </label>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planilla</h1>
          <p className="text-sm text-slate-500">Maestro de trabajadores y cálculo de pago según asistencia del reloj</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditando({ form: trabajadorVacio() })} disabled={soloLectura}>
            <Plus size={16} /> Registrar trabajador
          </Button>
          {importarBtn}
        </div>
      </div>

      {incompletos.length > 0 && (
        <button
          onClick={() => setTab("trabajadores")}
          className="flex w-full items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-5 py-3 text-left text-sm text-orange-800"
        >
          <AlertTriangle size={18} /> {incompletos.length} trabajador(es) sin fecha de ingreso (creados desde el reloj). Complete sus datos.
        </button>
      )}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "trabajadores", label: "Trabajadores", icon: <Users size={16} />, count: incompletos.length },
          { id: "planilla", label: "Planilla del periodo", icon: <Calculator size={16} /> },
          { id: "historial", label: "Historial", icon: <Archive size={16} /> },
        ]}
      />

      {tab === "trabajadores" && (
        <Card>
          <CardHeader
            title="Maestro de trabajadores"
            subtitle={`${trabajadores.filter((t) => t.activo).length} activo(s) · ${trabajadores.filter((t) => !t.activo).length} inactivo(s)`}
            action={
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Mostrar inactivos
              </label>
            }
          />
          {listaMaestro.length === 0 ? (
            <div className="p-5">
              <Empty icon={<Users size={28} />} text="Aún no hay trabajadores. Regístrelos o importe la asistencia del reloj." />
            </div>
          ) : (
            <Table head={["N°", "Trabajador", "Cargo", "F. ingreso", "Tipo sueldo", "Sueldo", "Pensión", "Estado", ""]}>
              {listaMaestro.map((t) => (
                <tr key={t.id} className={cn(!t.activo && "opacity-50")}>
                  <Td className="font-mono">{t.id}</Td>
                  <Td>
                    <p className="font-semibold text-slate-900">{t.nombre}</p>
                    <p className="text-xs text-slate-500">DNI {t.dni || "-"}</p>
                  </Td>
                  <Td>{t.cargo}</Td>
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
                  <Td>{sueldoDe(t).label}</Td>
                  <Td className="text-right">{soles(t.sueldo)}</Td>
                  <Td>
                    <p>{afpLabel(t)}</p>
                    <p className="text-xs text-slate-500">{t.afpPorcentaje}%</p>
                  </Td>
                  <Td>
                    <Badge estado={t.activo ? "ACTIVO" : "INACTIVO"} />
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" disabled={soloLectura} onClick={() => setEditando({ form: { ...t }, idOriginal: t.id })} title="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={soloLectura}
                        title={t.activo ? "Dar de baja" : "Reactivar"}
                        onClick={() => ejecutar(() => cambiarEstadoTrabajador(t.id, !t.activo), t.activo ? "Trabajador dado de baja" : "Trabajador reactivado")}
                      >
                        <Power size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={soloLectura}
                        title="Eliminar"
                        onClick={() => confirm(`¿Eliminar a ${t.nombre}? Esta acción no se puede deshacer.`) && ejecutar(() => eliminarTrabajador(t.id), "Trabajador eliminado")}
                      >
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {tab === "planilla" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Periodo">
              <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="font-semibold" />
            </Field>
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
            <div className="rounded-xl bg-slate-900 p-3 text-sm text-white">
              Total neto: <b className="text-amber-400">{soles(r2(calculados.reduce((a, b) => a + b.neto, 0)))}</b>
            </div>
          </div>

          <Card>
            <CardHeader
              title={`Planilla · ${normalizarPeriodo(periodo)}`}
              subtitle={`Pago por horas: 1 día = ${HORAS_DIA} h · valor hora = sueldo diario / ${HORAS_DIA} · tardanza: entrada después de las ${HORA_TARDANZA}. DÍAS y TARD. 🔒: solo editables desde Módulo Creador / Importar Asistencia.`}
              action={
                <div className="flex flex-wrap gap-2">
                  {importarBtn}
                  {puedeCerrar && (
                    <CerrarSemana
                      periodo={normalizarPeriodo(periodo)}
                      filas={filasCierre}
                      rango={excel ? { desde: excel.desde, hasta: excel.hasta } : undefined}
                      yaCerrado={periodoCerrado}
                      onCerrado={() => setTab("historial")}
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
              <Table head={["N°", "Trabajador", "F. ingreso", "Sueldo / Tipo", "Pensión", "Días 🔒", "Horas", "Tard. 🔒", "Bruto", "Dscto", "Neto", "Boleta"]}>
                {calculados.map((t) => (
                  <tr key={t.id}>
                    <Td className="font-mono">{t.id}</Td>
                    <Td>
                      <p className="font-semibold text-slate-900">{t.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {t.dni || "-"} · {t.cargo}
                      </p>
                    </Td>
                    <Td>{t.fechaIngreso ? fechaPE(t.fechaIngreso) : <span className="text-xs font-semibold text-orange-600">Sin registrar</span>}</Td>
                    <Td>
                      {soles(t.sueldo)}
                      <p className="text-xs text-slate-500">{sueldoDe(t).label}</p>
                    </Td>
                    <Td>
                      {afpLabel(t)}
                      <p className="text-xs text-slate-500">{t.afpPorcentaje}%</p>
                    </Td>
                    <Td className="text-center">
                      <CampoBloqueado valor={t.dias} />
                      {t.origen === "CREADOR" && <p className="text-[10px] font-semibold text-violet-600" title="Corregido a mano en el Módulo Creador">CREADOR</p>}
                    </Td>
                    <Td className="text-center font-semibold">
                      {horasTxt(t.horas)}
                      <p className="text-[10px] font-normal text-slate-500">{valorHoraTxt(t.valorHora)}/h</p>
                    </Td>
                    <Td className="text-center">
                      <CampoBloqueado valor={t.tardanzas} alerta={t.tardanzas > 0} />
                    </Td>
                    <Td className="text-right">{soles(t.bruto)}</Td>
                    <Td className="text-right text-red-600">- {soles(t.descuentoAfp)}</Td>
                    <Td className="text-right font-bold">{soles(t.neto)}</Td>
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

      {/* MODAL REGISTRO / EDICIÓN */}
      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.idOriginal ? `Editar trabajador N° ${editando.idOriginal}` : "Registrar trabajador"}>
        {editando && (
          <FormTrabajador
            form={editando.form}
            onChange={(form) => setEditando({ ...editando, form })}
            onCancel={() => setEditando(null)}
            onSave={guardar}
          />
        )}
      </Modal>

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
              </p>
              <p>
                <b>Sueldo:</b> {sueldoDe(boletaSel).label} {soles(boletaSel.sueldo)} · <b>Pensión:</b> {afpLabel(boletaSel)} {boletaSel.afpPorcentaje}%
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
                      Remuneración ({boletaSel.dias} días · {horasTxt(boletaSel.horas)} h × {valorHoraTxt(boletaSel.valorHora)})
                    </td>
                    <td className="p-2 text-right">{soles(boletaSel.bruto)}</td>
                  </tr>
                  <tr className="border-t text-red-600">
                    <td className="p-2">
                      Desc. {afpLabel(boletaSel)} {boletaSel.afpPorcentaje}%
                    </td>
                    <td className="p-2 text-right">- {soles(boletaSel.descuentoAfp)}</td>
                  </tr>
                  <tr className="border-t bg-amber-100 font-bold">
                    <td className="p-2">NETO A PAGAR</td>
                    <td className="p-2 text-right">{soles(boletaSel.neto)}</td>
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

function FormTrabajador({
  form,
  onChange,
  onCancel,
  onSave,
}: {
  form: Trabajador;
  onChange: (t: Trabajador) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Trabajador>(k: K, v: Trabajador[K]) => onChange({ ...form, [k]: v });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="N° huella *">
          <Input value={form.id} onChange={(e) => set("id", e.target.value)} placeholder="Ej: 7" />
        </Field>
        <Field label="DNI">
          <Input value={form.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="8 dígitos" />
        </Field>
        <Field label="Nombre completo *" className="col-span-2">
          <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Field>
        <Field label="Cargo">
          <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
        </Field>
        <Field label="Fecha de ingreso *">
          <Input type="date" value={form.fechaIngreso} max={hoy()} onChange={(e) => set("fechaIngreso", e.target.value)} />
        </Field>
        <Field label="Tipo de sueldo *">
          <Select value={form.tipoSueldo} options={OPC_SUELDO} onChange={(e) => set("tipoSueldo", e.target.value as TipoSueldo)} />
        </Field>
        <Field label={`Sueldo ${sueldoDe(form).label.toLowerCase()} (S/) *`}>
          <Input type="number" min={0} step="0.01" value={form.sueldo} onChange={(e) => set("sueldo", Number(e.target.value))} />
        </Field>
        <Field label="Sistema de pensiones *">
          <Select
            value={form.afpTipo}
            options={OPC_AFP}
            onChange={(e) => {
              const afpTipo = e.target.value as TipoAfp;
              onChange({ ...form, afpTipo, afpPorcentaje: AFP_OPTIONS[afpTipo].porc });
            }}
          />
        </Field>
        <Field label="% descuento">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={form.afpPorcentaje}
            disabled={form.afpTipo === "SIN"}
            onChange={(e) => set("afpPorcentaje", Number(e.target.value))}
          />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.activo} onChange={(e) => set("activo", e.target.checked)} /> Trabajador activo
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="warning">
          Guardar
        </Button>
      </div>
    </form>
  );
}
