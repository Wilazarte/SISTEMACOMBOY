"use client";

import { useState, type ReactNode } from "react";
import { Briefcase, HeartPulse, History, Power, Save, Trash2, User, UserCheck, X } from "lucide-react";
import { Badge, Button, Field, Input, Modal, Select, Textarea, cn, ejecutar, toast } from "@/components/ui";
import { SEDES } from "@/lib/empresa";
import { historialPagosTrabajador, type PagoTrabajador } from "@/lib/historial";
import { AFP_OPTIONS, ESTADOS_CIVILES, TIPOS_SUELDO, cambiarEstadoTrabajador, edad, eliminarTrabajador, fechaPE, guardarTrabajador, hoy, soles } from "@/lib/storage";
import type { EstadoCivil, TipoAfp, TipoSueldo, Trabajador } from "@/lib/types";

const OPC_SUELDO = (Object.keys(TIPOS_SUELDO) as TipoSueldo[]).map((k) => ({ value: k, label: TIPOS_SUELDO[k].label.toUpperCase() }));
const OPC_AFP = (Object.keys(AFP_OPTIONS) as TipoAfp[]).map((k) => ({ value: k, label: AFP_OPTIONS[k].label }));

function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
        {icono} {titulo}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * Ficha del trabajador: datos laborales, personales y contacto de emergencia.
 * Acciones: guardar, dar de baja (fecha + motivo) / reactivar, eliminar definitivo (doble confirmación) e historial de pagos.
 */
export function FichaTrabajador({
  inicial,
  idOriginal,
  soloLectura,
  onClose,
}: {
  inicial: Trabajador;
  idOriginal?: string; // undefined = trabajador nuevo
  soloLectura: boolean;
  onClose: () => void;
}) {
  const [f, setF] = useState<Trabajador>(inicial);
  const [baja, setBaja] = useState<{ fecha: string; motivo: string } | null>(null);
  const [pagos, setPagos] = useState<PagoTrabajador[] | null>(null);
  const [cargandoPagos, setCargandoPagos] = useState(false);
  const set = <K extends keyof Trabajador>(k: K, v: Trabajador[K]) => setF((x) => ({ ...x, [k]: v }));
  const nuevo = !idOriginal;
  const años = edad(f.fechaNacimiento);
  const sueldo = TIPOS_SUELDO[f.tipoSueldo] ?? TIPOS_SUELDO.DIARIO;

  const guardar = () => ejecutar(() => guardarTrabajador(f, idOriginal), nuevo ? "Trabajador registrado" : "Ficha actualizada") && onClose();

  const darDeBaja = () =>
    baja && ejecutar(() => cambiarEstadoTrabajador(idOriginal!, false, baja), `${f.nombre} dado de baja`) && onClose();

  const reactivar = () => ejecutar(() => cambiarEstadoTrabajador(idOriginal!, true), `${f.nombre} reactivado`) && onClose();

  const eliminar = () => {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE a ${f.nombre}? Se borra su ficha (el historial de planillas pagadas se conserva).`)) return;
    const escrito = prompt(`Para confirmar escriba el N° de huella del trabajador (${idOriginal}):`);
    if (escrito?.trim() !== idOriginal) {
      toast("Eliminación cancelada: el N° no coincide.", "error");
      return;
    }
    if (ejecutar(() => eliminarTrabajador(idOriginal!), "Trabajador eliminado")) onClose();
  };

  const verPagos = async () => {
    setCargandoPagos(true);
    try {
      setPagos(await historialPagosTrabajador(idOriginal!));
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo leer el historial.", "error");
    } finally {
      setCargandoPagos(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={nuevo ? "Registrar trabajador" : `Ficha del trabajador · N° ${idOriginal}`} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        className="space-y-4"
      >
        {!nuevo && (
          <div className={cn("flex flex-wrap items-center gap-3 rounded-xl px-4 py-3", f.activo ? "bg-emerald-50" : "bg-red-50")}>
            <Badge estado={f.activo ? "ACTIVO" : "INACTIVO"} />
            <span className="font-semibold text-slate-900">{f.nombre}</span>
            {!f.activo && f.fechaBaja && (
              <span className="text-sm text-red-700">
                Baja: {fechaPE(f.fechaBaja)}
                {f.motivoBaja ? ` · ${f.motivoBaja}` : ""}
              </span>
            )}
          </div>
        )}

        <fieldset disabled={soloLectura} className="min-w-0 space-y-4">
          <Seccion icono={<Briefcase size={16} className="text-amber-500" />} titulo="Datos laborales">
            <Field label="N° de huella (reloj) *">
              <Input value={f.id} onChange={(e) => set("id", e.target.value.trim())} placeholder="Ej: 15" />
            </Field>
            <Field label="Nombre completo *" className="lg:col-span-2">
              <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </Field>
            <Field label="DNI">
              <Input value={f.dni} maxLength={8} inputMode="numeric" onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Fecha de nacimiento" hint={años !== null ? `Edad: ${años} años` : undefined}>
              <Input type="date" value={f.fechaNacimiento ?? ""} onChange={(e) => set("fechaNacimiento", e.target.value || undefined)} />
            </Field>
            <Field label="Cargo">
              <Input value={f.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </Field>
            <Field label="Tipo de sueldo *">
              <Select value={f.tipoSueldo} onChange={(e) => set("tipoSueldo", e.target.value as TipoSueldo)} options={OPC_SUELDO} />
            </Field>
            <Field label={`Sueldo ${sueldo.label.toLowerCase()} (S/) *`} hint={`Diario: ${soles(f.sueldo / sueldo.divisor)}`}>
              <Input type="number" min={0} step="0.01" value={f.sueldo || ""} onChange={(e) => set("sueldo", parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Fecha de ingreso *">
              <Input type="date" value={f.fechaIngreso} onChange={(e) => set("fechaIngreso", e.target.value)} />
            </Field>
            <Field label="Sede">
              <Select value={f.sede ?? ""} onChange={(e) => set("sede", e.target.value || undefined)} placeholder="—" options={SEDES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Sistema de pensiones *">
              <Select
                value={f.afpTipo}
                onChange={(e) => {
                  const afpTipo = e.target.value as TipoAfp;
                  setF((x) => ({ ...x, afpTipo, afpPorcentaje: AFP_OPTIONS[afpTipo].porc }));
                }}
                options={OPC_AFP}
              />
            </Field>
            <Field label="% descuento">
              <Input type="number" min={0} max={100} step="0.01" value={f.afpPorcentaje} onChange={(e) => set("afpPorcentaje", parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="N° de afiliación (CUSPP)">
              <Input value={f.nroAfiliacion ?? ""} onChange={(e) => set("nroAfiliacion", e.target.value.toUpperCase() || undefined)} />
            </Field>
          </Seccion>

          <Seccion icono={<User size={16} className="text-sky-500" />} titulo="Datos personales">
            <Field label="Dirección" className="lg:col-span-2">
              <Input value={f.direccion ?? ""} onChange={(e) => set("direccion", e.target.value || undefined)} />
            </Field>
            <Field label="Celular">
              <Input value={f.celular ?? ""} inputMode="tel" onChange={(e) => set("celular", e.target.value || undefined)} placeholder="9XX XXX XXX" />
            </Field>
            <Field label="Correo">
              <Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value || undefined)} />
            </Field>
            <Field label="Estado civil">
              <Select value={f.estadoCivil ?? ""} onChange={(e) => set("estadoCivil", (e.target.value || undefined) as EstadoCivil | undefined)} placeholder="—" options={ESTADOS_CIVILES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="N° de hijos">
              <Input type="number" min={0} value={f.nroHijos ?? ""} onChange={(e) => set("nroHijos", e.target.value === "" ? undefined : parseInt(e.target.value) || 0)} />
            </Field>
          </Seccion>

          <Seccion icono={<HeartPulse size={16} className="text-red-500" />} titulo="Contacto de emergencia">
            <Field label="Nombre">
              <Input value={f.emergenciaNombre ?? ""} onChange={(e) => set("emergenciaNombre", e.target.value || undefined)} />
            </Field>
            <Field label="Parentesco">
              <Input value={f.emergenciaParentesco ?? ""} onChange={(e) => set("emergenciaParentesco", e.target.value || undefined)} placeholder="Esposa, madre…" />
            </Field>
            <Field label="Celular">
              <Input value={f.emergenciaCelular ?? ""} inputMode="tel" onChange={(e) => set("emergenciaCelular", e.target.value || undefined)} />
            </Field>
            <Field label="Observaciones médicas / alergias" className="sm:col-span-2 lg:col-span-3">
              <Textarea value={f.observacionesMedicas ?? ""} onChange={(e) => set("observacionesMedicas", e.target.value || undefined)} placeholder="Ej: alérgico a la penicilina, hipertensión…" />
            </Field>
          </Seccion>
        </fieldset>

        {/* Dar de baja */}
        {baja && (
          <div className="grid gap-3 rounded-xl border-2 border-red-200 bg-red-50 p-4 sm:grid-cols-3">
            <Field label="Fecha de baja *">
              <Input type="date" value={baja.fecha} onChange={(e) => setBaja({ ...baja, fecha: e.target.value })} />
            </Field>
            <Field label="Motivo *" className="sm:col-span-2">
              <Input value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} placeholder="Renuncia, fin de contrato, despido…" autoFocus />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" variant="secondary" onClick={() => setBaja(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={darDeBaja}>
                <Power size={16} /> Confirmar baja
              </Button>
            </div>
          </div>
        )}

        {/* Historial de pagos */}
        {pagos && (
          <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <b className="text-sm text-slate-800">Historial de pagos ({pagos.length})</b>
              <button type="button" onClick={() => setPagos(null)} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar historial">
                <X size={16} />
              </button>
            </div>
            {pagos.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Aún no tiene planillas pagadas.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Periodo</th>
                      <th className="px-3 py-2 text-right">Días</th>
                      <th className="px-3 py-2 text-right">Bruto</th>
                      <th className="px-3 py-2 text-right">AFP</th>
                      <th className="px-3 py-2 text-right">Adelantos</th>
                      <th className="px-3 py-2 text-right">Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.periodo + p.fecha_cierre} className="border-t">
                        <td className="px-3 py-2">
                          {p.periodo}
                          <p className="text-xs text-slate-400">{p.fecha_cierre ? new Date(p.fecha_cierre).toLocaleDateString("es-PE") : ""}</p>
                        </td>
                        <td className="px-3 py-2 text-right">{p.dias}</td>
                        <td className="px-3 py-2 text-right">{soles(p.bruto)}</td>
                        <td className="px-3 py-2 text-right text-red-600">- {soles(p.descuento_afp)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{p.adelantos ? `- ${soles(p.adelantos)}` : "-"}</td>
                        <td className="px-3 py-2 text-right font-semibold">{soles(p.total_pagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-2">
            {!nuevo && (
              <Button type="button" variant="secondary" onClick={verPagos} disabled={cargandoPagos}>
                <History size={16} /> {cargandoPagos ? "Cargando…" : "Ver historial de pagos"}
              </Button>
            )}
            {!nuevo && !soloLectura && f.activo && !baja && (
              <Button type="button" variant="warning" onClick={() => setBaja({ fecha: hoy(), motivo: "" })}>
                <Power size={16} /> Dar de baja
              </Button>
            )}
            {!nuevo && !soloLectura && !inicial.activo && (
              <Button type="button" variant="success" onClick={reactivar}>
                <UserCheck size={16} /> Reactivar
              </Button>
            )}
            {!nuevo && !soloLectura && (
              <Button type="button" variant="danger" onClick={eliminar}>
                <Trash2 size={16} /> Eliminar definitivo
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            {!soloLectura && (
              <Button type="submit" size="md" className="px-6">
                <Save size={16} /> Guardar
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
