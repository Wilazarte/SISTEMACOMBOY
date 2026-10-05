"use client";

import { useMemo, useState } from "react";
import { Briefcase, Pencil, Plus, Power, Trash2, UserCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, cn, ejecutar } from "@/components/ui";
import { SEDES } from "@/lib/empresa";
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

/** Estado mostrado: INACTIVO (dado de baja), FINALIZADO (pasó la fecha de fin) o ACTIVO. */
const estadoDe = (t: Trabajador) => (!t.activo ? "INACTIVO" : t.fechaFinContrato && t.fechaFinContrato < hoy() ? "FINALIZADO" : "ACTIVO");

/**
 * Contratistas del maestro de trabajadores (esContratista, cargo "Contratista" o pago POR CONTRATO).
 * No entran a la planilla del periodo.
 */
export function ContratistasMaestro({ trabajadores, soloLectura }: { trabajadores: Trabajador[]; soloLectura: boolean }) {
  const [form, setForm] = useState<{ datos: DatosContratista; idOriginal?: string } | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const todos = useMemo(() => trabajadores.filter(esContratista), [trabajadores]);
  const lista = todos
    .filter((t) => verInactivos || t.activo)
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  const activos = todos.filter((t) => t.activo);

  const guardar = () =>
    form && ejecutar(() => guardarContratista(form.datos, form.idOriginal), form.idOriginal ? "Contratista actualizado" : "Contratista registrado") && setForm(null);

  return (
    <Card>
      <CardHeader
        title="Contratistas"
        subtitle={`${activos.length} activo(s) · contratado ${soles(r2(activos.reduce((s, t) => s + t.sueldo, 0)))} · no entran a la planilla del periodo`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} className="h-4 w-4 accent-red-600" /> Mostrar inactivos
            </label>
            {!soloLectura && (
              <Button variant="warning" onClick={() => setForm({ datos: vacio() })} className="px-5 py-2.5">
                <Plus size={18} /> Registrar contratista
              </Button>
            )}
          </div>
        }
      />
      {lista.length === 0 ? (
        <div className="p-5">
          <Empty icon={<Briefcase size={28} />} text={todos.length ? "No hay contratistas activos." : "Aún no hay contratistas. Use “Registrar contratista” o ponga cargo “Contratista” en la ficha de un trabajador."} />
        </div>
      ) : (
        <Table head={["N°", "Nombre del contratista", "Empresa / Servicio", "Sede", "Monto contratado", "Inicio / Fin", "Estado", "Acciones"]}>
          {lista.map((t) => {
            const estado = estadoDe(t);
            return (
              <tr key={t.id} className={cn("hover:bg-slate-50", !t.activo && "bg-slate-100 text-slate-400")}>
                <Td className="font-mono">{t.id}</Td>
                <Td>
                  <p className={cn("font-semibold", t.activo ? "text-slate-900" : "text-slate-500")}>{t.nombre}</p>
                  <p className="text-xs text-slate-500">{t.ruc ? `RUC ${t.ruc}` : t.dni ? `DNI ${t.dni}` : "Sin documento"}</p>
                </Td>
                <Td>
                  <p className="font-medium">{t.empresa || "-"}</p>
                  <p className="text-xs text-slate-500">{t.tipoServicio ? SERVICIOS_CONTRATISTA[t.tipoServicio] : "Sin servicio"}</p>
                </Td>
                <Td>{t.sede || "-"}</Td>
                <Td className="text-right">
                  <b>{soles(t.sueldo)}</b>
                  {t.formaPagoContrato && <p className="text-xs text-slate-500">{t.formaPagoContrato}</p>}
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
                  {!soloLectura && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setForm({ datos: desde(t), idOriginal: t.id })} title="Editar">
                        <Pencil size={14} /> Editar
                      </Button>
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
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      {form && <FormContratista datos={form.datos} editando={!!form.idOriginal} onChange={(datos) => setForm({ ...form, datos })} onCancel={() => setForm(null)} onSave={guardar} />}
    </Card>
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
