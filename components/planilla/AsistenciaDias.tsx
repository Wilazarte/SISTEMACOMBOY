"use client";

import { useMemo, useState } from "react";
import { CheckSquare, FileSpreadsheet, KeyRound, Lock, Save } from "lucide-react";
import { Button, Input, Modal, cn, toast } from "@/components/ui";
import { CLAVE_JUSTIFICAR, justificarAsistencia, sumarDias } from "@/lib/storage";
import { HORA_TARDANZA, horasReales, limpiarHora } from "@/lib/asistencia";
import { guardarExcel } from "@/lib/guardarArchivo";
import type { DiaJustificado } from "@/lib/types";

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const fechaTxt = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const diaSemana = (f: string) => DIAS_SEMANA[new Date(`${f}T12:00:00Z`).getUTCDay()];
const horasTxt = (h: number) => h.toLocaleString("es-PE", { maximumFractionDigits: 2 });

type Estado = "ASISTIO" | "JUSTIFICADO" | "FALTA" | "SIN_DETALLE";

interface FilaDia {
  fecha: string;
  dia: string;
  entrada: string;
  salida: string;
  marcas: string;
  horas: number;
  tardanza: boolean;
  estado: Estado;
  motivo: string;
}

const ESTADOS: Record<Estado, { label: string; clase: string }> = {
  ASISTIO: { label: "ASISTIÓ", clase: "bg-emerald-50 text-emerald-700" },
  JUSTIFICADO: { label: "JUSTIFICADO", clase: "bg-sky-100 text-sky-800" },
  FALTA: { label: "FALTA", clase: "bg-plomo-100 text-plomo-600" },
  SIN_DETALLE: { label: "SIN DETALLE", clase: "bg-amber-50 text-amber-700" },
};

export interface AsistenciaDiasProps {
  periodo: string;
  trabajador: { id: string; nombre: string };
  /** Marcas del reloj por día (Excel de esta sesión o lo guardado en Supabase). null = importación antigua sin detalle. */
  fechas: Map<string, string[]> | null;
  diasReloj: number;
  justificados: DiaJustificado[];
  rango: { desde: string; hasta: string } | null;
  /** Se puede justificar (no pagado, usuario con permiso, hay detalle del reloj). */
  editable: boolean;
  motivoNoEditable?: string;
  onClose: () => void;
}

/**
 * "Ver días" de la asistencia importada: tabla tipo Excel con cada día del periodo (asistió / justificado / falta).
 * Con la contraseña de edición solo se pueden AGREGAR días justificados (nunca quitar); cuentan como día asistido.
 */
export function AsistenciaDias({ periodo, trabajador, fechas, diasReloj, justificados, rango, editable, motivoNoEditable, onClose }: AsistenciaDiasProps) {
  const [clave, setClave] = useState("");
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pedirClave, setPedirClave] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const filas = useMemo<FilaDia[]>(() => {
    const just = new Map(justificados.map((j) => [j.fecha, j]));
    const set = new Set<string>([...(fechas ? fechas.keys() : []), ...just.keys()]);
    if (rango) for (let f = rango.desde; f <= rango.hasta; f = sumarDias(f, 1)) set.add(f);
    return [...set].sort().map((fecha) => {
      const marcas = fechas?.get(fecha) ?? [];
      const horas = marcas.map(limpiarHora).filter(Boolean).sort();
      const asistio = horas.length > 0;
      const j = just.get(fecha);
      return {
        fecha,
        dia: diaSemana(fecha),
        entrada: horas[0]?.slice(0, 5) ?? "",
        salida: horas.length > 1 ? horas[horas.length - 1].slice(0, 5) : "",
        marcas: horas.map((h) => h.slice(0, 5)).join("  "),
        horas: asistio ? horasReales(new Map([[fecha, marcas]])) : 0,
        tardanza: asistio && horas[0].slice(0, 5) > HORA_TARDANZA,
        estado: asistio ? "ASISTIO" : j ? "JUSTIFICADO" : fechas ? "FALTA" : "SIN_DETALLE",
        motivo: j?.motivo ?? "",
      };
    });
  }, [fechas, justificados, rango]);

  const asistidos = fechas ? filas.filter((f) => f.estado === "ASISTIO").length : diasReloj;
  const nJust = filas.filter((f) => f.estado === "JUSTIFICADO").length;
  const tardanzas = filas.filter((f) => f.tardanza).length;

  const desbloquear = () => {
    if (clave !== CLAVE_JUSTIFICAR) {
      toast("Contraseña de edición incorrecta.", "error");
      return;
    }
    setDesbloqueado(true);
    setPedirClave(false);
  };

  const cambiar = (fecha: string, v: boolean) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (v) n.add(fecha);
      else n.delete(fecha);
      return n;
    });

  const guardar = async () => {
    const lista = [...marcados].sort();
    if (!lista.length) return toast("Marque al menos un día (FALTA) para justificar.", "error");
    if (!motivo.trim()) return toast("Escriba el motivo de la justificación.", "error");
    if (!confirm(`Se agregarán ${lista.length} día(s) JUSTIFICADO(S) a ${trabajador.nombre}: ${lista.map(fechaTxt).join(", ")}.\n\nUna vez guardados no se pueden quitar. ¿Continuar?`)) return;
    setGuardando(true);
    try {
      const n = await justificarAsistencia(periodo, trabajador.id, lista, motivo, clave);
      toast(`${n} día(s) justificado(s): se pagan como días asistidos`, "ok");
      setMarcados(new Set());
      setMotivo("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const descargar = async () => {
    const XLSX = await import("xlsx");
    const aoa: (string | number)[][] = [
      [`ASISTENCIA ${periodo}`],
      [`N° ${trabajador.id} - ${trabajador.nombre}`],
      [],
      ["#", "Fecha", "Día", "Entrada", "Salida", "Marcas", "Horas", "Tardanza", "Estado", "Motivo"],
      ...filas.map((f, i) => [i + 1, fechaTxt(f.fecha), f.dia, f.entrada, f.salida, f.marcas, f.horas || "", f.tardanza ? "SÍ" : "", ESTADOS[f.estado].label, f.motivo]),
      [],
      ["", "Asistidos (reloj)", asistidos],
      ["", "Justificados", nJust],
      ["", "Total días a pagar", asistidos + nJust],
      ["", "Tardanzas", tardanzas],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 4 }, { wch: 18 }, { wch: 11 }, { wch: 9 }, { wch: 9 }, { wch: 28 }, { wch: 8 }, { wch: 9 }, { wch: 13 }, { wch: 30 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, ws, "Asistencia");
    await guardarExcel(libro, `Asistencia-${trabajador.id}-${periodo.replace(/\s+/g, "-")}.xlsx`);
  };

  const th = "border border-plomo-300 bg-plomo-100 px-2 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-plomo-700";
  const td = "border border-plomo-200 px-2 py-1 whitespace-nowrap";

  return (
    <Modal open onClose={onClose} title={`Días asistidos · ${trabajador.nombre}`} wide>
      <div className="space-y-3 text-sm" data-asistencia-dias={trabajador.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-plomo-600">
            <b>{periodo}</b> · N° {trabajador.id} · reloj: <b>{asistidos}</b> día(s){nJust > 0 && <> · justificados: <b className="text-sky-700">{nJust}</b></>} · total a pagar:{" "}
            <b className="text-emerald-700">{asistidos + nJust}</b> día(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void descargar()}>
              <FileSpreadsheet size={14} /> Descargar Excel
            </Button>
            {!desbloqueado && (
              <Button
                size="sm"
                variant="warning"
                disabled={!editable}
                title={editable ? "Agregar días justificados (pide contraseña)" : motivoNoEditable}
                onClick={() => setPedirClave(true)}
                data-editar-asistencia
              >
                <KeyRound size={14} /> Editar (justificar días)
              </Button>
            )}
          </div>
        </div>

        {!editable && motivoNoEditable && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{motivoNoEditable}</p>}

        {pedirClave && !desbloqueado && (
          <form
            className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              desbloquear();
            }}
          >
            <Lock size={16} className="text-amber-700" />
            <span className="text-xs font-semibold text-amber-900">Contraseña de edición:</span>
            <Input type="password" autoFocus value={clave} onChange={(e) => setClave(e.target.value)} className="w-40" data-clave-asistencia />
            <Button size="sm" type="submit">
              Desbloquear
            </Button>
          </form>
        )}

        {desbloqueado && (
          <div className="space-y-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900">
            <p>
              <CheckSquare size={14} className="mr-1 inline" />
              Marque los días en <b>FALTA</b> que quiere justificar. Solo se pueden <b>agregar</b> días: los ya asistidos o justificados no se pueden quitar.
              Cada día justificado se paga como día asistido.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. descanso médico, comisión de servicio)…" className="w-80" data-motivo-justificar />
              <Button size="sm" onClick={() => void guardar()} disabled={guardando || !marcados.size} data-guardar-justificados>
                <Save size={14} /> Guardar {marcados.size || ""} justificado(s)
              </Button>
            </div>
          </div>
        )}

        {!fechas && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Esta asistencia se importó antes de guardar el detalle por día. Vuelva a importar el Excel del reloj de este periodo para ver cada día y poder justificar.
          </p>
        )}

        <div className="max-h-[60vh] overflow-auto rounded border border-plomo-300">
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-0">
              <tr>
                <th className={cn(th, "w-8 text-center")}>#</th>
                {desbloqueado && <th className={cn(th, "w-10 text-center")}>✓</th>}
                <th className={th}>Fecha</th>
                <th className={th}>Día</th>
                <th className={th}>Entrada</th>
                <th className={th}>Salida</th>
                <th className={th}>Marcas</th>
                <th className={cn(th, "text-right")}>Horas</th>
                <th className={th}>Tard.</th>
                <th className={th}>Estado</th>
                <th className={th}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.fecha} className={cn(f.dia === "Domingo" && "bg-plomo-50", marcados.has(f.fecha) && "bg-sky-50")} data-dia={f.fecha} data-estado={f.estado}>
                  <td className={cn(td, "bg-plomo-100 text-center text-plomo-500")}>{i + 1}</td>
                  {desbloqueado && (
                    <td className={cn(td, "text-center")}>
                      {f.estado === "FALTA" ? (
                        <input type="checkbox" checked={marcados.has(f.fecha)} onChange={(e) => cambiar(f.fecha, e.target.checked)} aria-label={`Justificar ${fechaTxt(f.fecha)}`} />
                      ) : (
                        <Lock size={11} className="inline text-plomo-400" aria-label="No se puede quitar" />
                      )}
                    </td>
                  )}
                  <td className={td}>{fechaTxt(f.fecha)}</td>
                  <td className={td}>{f.dia}</td>
                  <td className={td}>{f.entrada}</td>
                  <td className={td}>{f.salida}</td>
                  <td className={cn(td, "text-plomo-500")}>{f.marcas}</td>
                  <td className={cn(td, "text-right")}>{f.horas ? horasTxt(f.horas) : ""}</td>
                  <td className={cn(td, f.tardanza && "font-bold text-orange-600")}>{f.tardanza ? "SÍ" : ""}</td>
                  <td className={td}>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", ESTADOS[f.estado].clase)}>{ESTADOS[f.estado].label}</span>
                  </td>
                  <td className={cn(td, "whitespace-normal text-sky-800")}>{f.motivo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-plomo-100 font-bold">
                <td className={td} colSpan={desbloqueado ? 3 : 2}>
                  Totales
                </td>
                <td className={td} colSpan={5}>
                  Asistidos {asistidos} · Justificados {nJust} · <span className="text-emerald-700">A pagar {asistidos + nJust} día(s)</span>
                </td>
                <td className={td}>{tardanzas || ""}</td>
                <td className={td} colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
}
