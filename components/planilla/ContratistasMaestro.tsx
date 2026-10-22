"use client";

import { useMemo, useState } from "react";
import { Briefcase, FileText, Pencil, Power, Trash2, UserCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, cn, ejecutar, toast } from "@/components/ui";
import QuickActions, { QA_IDS } from "@/components/tesoreria/QuickActions";
import { BotonFiltros } from "@/components/ui/BotonFiltros";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { SEDES } from "@/lib/empresa";
import { descargarRecibo, estadoContratista } from "@/components/planilla/generateReciboPDF";
import {
  FORMAS_PAGO_CONTRATISTA,
  SERVICIOS_CONTRATISTA,
  cambiarEstadoTrabajador,
  eliminarTrabajador,
  esContratista,
  fechaPE,
  guardarContratista,
  hoy,
  r2,
  rucValido,
  soles,
  type DatosContratista,
} from "@/lib/storage";
import type { ServicioContratista, Trabajador } from "@/lib/types";

const vacio = (): DatosContratista => ({
  nombre: "",
  documento: "",
  tipoServicio: "ASESORIA",
  empresa: "",
  monto: 0,
  sede: "",
  fechaInicio: hoy(),
  fechaFin: "",
  formaPago: FORMAS_PAGO_CONTRATISTA[0],
});

const desde = (t: Trabajador): DatosContratista => ({
  nombre: t.nombre,
  documento: t.ruc || t.dni || "",
  tipoServicio: t.tipoServicio ?? "OTRO",
  empresa: t.empresa ?? "",
  monto: t.sueldo,
  sede: t.sede ?? "",
  fechaInicio: t.fechaIngreso || hoy(),
  fechaFin: t.fechaFinContrato ?? "",
  formaPago: t.formaPagoContrato ?? FORMAS_PAGO_CONTRATISTA[0],
});

const estadoDe = estadoContratista;

/**
 * Contratistas del maestro de trabajadores (esContratista, cargo "Contratista" o pago POR CONTRATO).
 * No entran a la planilla del periodo.
 */
export function ContratistasMaestro({ trabajadores, soloLectura }: { trabajadores: Trabajador[]; soloLectura: boolean }) {
  const [form, setForm] = useState<{ datos: DatosContratista; idOriginal?: string } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const [buscar, setBuscar] = useState("");
  const { showFiltros, setShowFiltros } = useTogglePanel();
  const todos = useMemo(() => trabajadores.filter(esContratista), [trabajadores]);
  const lista = todos
    .filter((t) => verInactivos || t.activo)
    .filter((t) => !buscar || `${t.id} ${t.nombre} ${t.dni ?? ""} ${t.ruc ?? ""} ${t.empresa ?? ""}`.toLowerCase().includes(buscar.toLowerCase()))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  const activos = todos.filter((t) => t.activo);

  const guardar = () =>
    form && ejecutar(() => guardarContratista(form.datos, form.idOriginal), form.idOriginal ? "Contratista actualizado" : "Contratista registrado") && setForm(null);

  // Acción rápida PDF: recibo de cada contratista activo de la lista (filtrada por el buscador)
  const descargarRecibos = async () => {
    const sel = lista.filter((t) => t.activo);
    if (!sel.length) return toast("No hay contratistas activos en la lista", "error");
    if (sel.length > 1 && !confirm(`¿Descargar ${sel.length} recibos PDF (uno por contratista)?`)) return;
    for (const t of sel) await descargarRecibo(t, "CONTRATISTA");
  };

  return (
    <div>
    <QuickActions tab="planilla-contratistas" onNuevo={() => setForm({ datos: vacio() })} puedeCrear={!soloLectura} onPdf={descargarRecibos} />
    <Card id={QA_IDS.listaContratistas}>
      <CardHeader
        title="Contratistas"
        subtitle={`${activos.length} activo(s) · contratado ${soles(r2(activos.reduce((s, t) => s + t.sueldo, 0)))} · no entran a la planilla del periodo`}
      />
      {/* Filtros ocultos por defecto; Registrar: botón "Registrar Contratista" de las acciones rápidas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-4 py-2">
        <BotonFiltros abierto={showFiltros} onClick={() => setShowFiltros(!showFiltros)} activos={(buscar ? 1 : 0) + (verInactivos ? 1 : 0)} />
      </div>
      {showFiltros && (
        <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-4 py-3">
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, DNI, RUC…" className="w-60" aria-label="Buscar" />
          <label className="flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-plomo-200 bg-surface px-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="h-4 w-4 accent-red-600" /> Mostrar inactivos
          </label>
        </div>
      )}
      {lista.length === 0 ? (
        <div className="p-5">
          <Empty icon={<Briefcase size={28} />} text={buscar ? "Ningún contratista coincide." : todos.length ? "No hay contratistas activos." : "Aún no hay contratistas. Use “Registrar contratista” o ponga cargo “Contratista” en la ficha de un trabajador."} />
        </div>
      ) : (
        <Table compacto head={["N°", "Nombre del contratista", "Empresa / Servicio", "Sede", "Monto contratado", "Inicio / Fin", "Estado", "Acciones"]}>
          {lista.map((t) => {
            const estado = estadoDe(t);
            return (
              <tr key={t.id} className={cn("hover:bg-plomo-50", !t.activo && "bg-plomo-100 text-slate-400")}>
                <Td className="font-mono">{t.id}</Td>
                <Td className="whitespace-normal">
                  <p className={cn("font-semibold", t.activo ? "text-fg" : "text-plomo-500")}>{t.nombre}</p>
                  <p className="text-xs text-plomo-500">{t.ruc ? `RUC ${t.ruc}` : t.dni ? `DNI ${t.dni}` : "Sin documento"}</p>
                </Td>
                <Td className="whitespace-normal">
                  <p className="font-medium">{t.empresa || "-"}</p>
                  <p className="text-xs text-plomo-500">{t.tipoServicio ? SERVICIOS_CONTRATISTA[t.tipoServicio] : "Sin servicio"}</p>
                </Td>
                <Td>{t.sede || "-"}</Td>
                <Td className="text-right">
                  <b>{soles(t.sueldo)}</b>
                  {t.formaPagoContrato && <p className="text-xs text-plomo-500">{t.formaPagoContrato}</p>}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {t.fechaIngreso ? fechaPE(t.fechaIngreso) : "-"}
                  <br />
                  {t.fechaFinContrato ? `al ${fechaPE(t.fechaFinContrato)}` : "—"}
                </Td>
                <Td>
                  <Badge estado={estado} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    {!soloLectura && (
                      <Button size="sm" variant="secondary" onClick={() => setForm({ datos: desde(t), idOriginal: t.id })} title="Editar">
                        <Pencil size={14} /> Editar
                      </Button>
                    )}
                    <BotonPDF onClick={() => descargarRecibo(t, "CONTRATISTA")} />
                    {!soloLectura && (
                      <>
                        {t.activo ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Dar de baja"
                            onClick={() => {
                              const motivo = prompt(`Motivo de la baja de ${t.nombre}:`, "Fin del servicio");
                              if (motivo !== null) ejecutar(() => cambiarEstadoTrabajador(t.id, false, { fecha: hoy(), motivo }), `${t.nombre} dado de baja`);
                            }}
                          >
                            <Power size={14} className="text-red-600" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" title="Reactivar" onClick={() => ejecutar(() => cambiarEstadoTrabajador(t.id, true), `${t.nombre} reactivado`)}>
                            <UserCheck size={14} className="text-emerald-600" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Eliminar"
                          onClick={() => confirm(`¿Eliminar al contratista ${t.nombre}? No se puede deshacer.`) && ejecutar(() => eliminarTrabajador(t.id), "Contratista eliminado")}
                        >
                          <Trash2 size={14} className="text-red-600" />
                        </Button>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {form && <FormContratista datos={form.datos} editando={!!form.idOriginal} onChange={(datos) => setForm({ ...form, datos })} onCancel={() => setForm(null)} onSave={guardar} />}
    </Card>
    </div>
  );
}

/** Botón rojo que descarga directo el recibo en PDF. */
export function BotonPDF({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Descargar recibo PDF"
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-2.5 py-1.5 text-xs font-semibold text-white shadow-card transition hover:bg-[#B91C1C]"
    >
      <FileText size={14} /> PDF
    </button>
  );
}

function FormContratista({
  datos,
  editando,
  onChange,
  onCancel,
  onSave,
}: {
  datos: DatosContratista;
  editando: boolean;
  onChange: (d: DatosContratista) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof DatosContratista>(k: K, v: DatosContratista[K]) => onChange({ ...datos, [k]: v });
  const rucMal = datos.documento.length === 11 && !rucValido(datos.documento);
  return (
    <Modal open onClose={onCancel} title={editando ? "Editar contratista" : "Registrar contratista"} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Nombre *" className="lg:col-span-2">
          <Input value={datos.nombre} onChange={(e) => set("nombre", e.target.value)} autoFocus />
        </Field>
        <Field label="DNI / RUC" hint={rucMal ? "⚠ RUC: dígito verificador inválido" : "8 dígitos (DNI) u 11 (RUC)"}>
          <Input
            value={datos.documento}
            maxLength={11}
            inputMode="numeric"
            onChange={(e) => set("documento", e.target.value.replace(/\D/g, ""))}
            className={cn(datos.documento.length === 11 && (rucMal ? "border-red-400" : "border-emerald-400"))}
          />
        </Field>
        <Field label="Tipo de servicio *">
          <Select
            value={datos.tipoServicio}
            onChange={(e) => set("tipoServicio", e.target.value as ServicioContratista)}
            options={(Object.keys(SERVICIOS_CONTRATISTA) as ServicioContratista[]).map((k) => ({ value: k, label: SERVICIOS_CONTRATISTA[k] }))}
          />
        </Field>
        <Field label="Empresa" className="lg:col-span-2">
          <Input value={datos.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Razón social o nombre comercial" />
        </Field>
        <Field label="Monto contratado (S/) *">
          <Input type="number" min={0} step="0.01" value={datos.monto || ""} onChange={(e) => set("monto", parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Sede">
          <Select value={datos.sede} onChange={(e) => set("sede", e.target.value)} placeholder="—" options={SEDES.map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Forma de pago">
          <Select value={datos.formaPago} onChange={(e) => set("formaPago", e.target.value)} options={FORMAS_PAGO_CONTRATISTA.map((f) => ({ value: f, label: f }))} />
        </Field>
        <Field label="Fecha de inicio *">
          <Input type="date" value={datos.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} />
        </Field>
        <Field label="Fecha de fin">
          <Input type="date" value={datos.fechaFin} onChange={(e) => set("fechaFin", e.target.value)} />
        </Field>
        <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" variant="warning" className="px-6">
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
