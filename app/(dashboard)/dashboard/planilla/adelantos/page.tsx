"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, HandCoins, Lock, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Select, Table, Td, Textarea, cn, ejecutarAsync } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { ESTADOS_ADELANTO, ESTADOS_EDITABLES, crearAdelanto, editarAdelanto, eliminarAdelanto, listarAdelantos, type Adelanto, type DatosAdelanto, type EstadoAdelanto } from "@/lib/adelantos";
import { fechaPE, hoy, r2, soles, useTrabajadores } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

const vacio = (): DatosAdelanto => ({ trabajador_nombre: "", dni: "", fecha: hoy(), monto: 0, motivo: "", estado: "PENDIENTE" });

/** Planilla › Adelantos: formulario arriba (registrar / editar) y tabla abajo. */
export default function AdelantosPage() {
  const sesion = getSesion();
  const puedeEditar = !sesion?.soloLectura && ["creador", "planilla", "admin"].includes(sesion?.rol ?? "");
  const trabajadores = useTrabajadores();
  const [lista, setLista] = useState<Adelanto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DatosAdelanto>(vacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState<"" | EstadoAdelanto>("");
  const [buscar, setBuscar] = useState("");

  const recargar = useCallback(async () => {
    try {
      setLista(await listarAdelantos());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer los adelantos.");
    } finally {
      setCargando(false);
    }
  }, []);

  // Carga inicial + tiempo real (un adelanto registrado en otra PC aparece al instante)
  useEffect(() => {
    const sb = createClient();
    const canal = sb
      .channel(`adelantos-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "adelantos" }, () => void recargar())
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") void recargar();
      });
    void recargar();
    return () => {
      void sb.removeChannel(canal);
    };
  }, [recargar]);

  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toUpperCase();
    return lista.filter((a) => (!filtro || a.estado === filtro) && (!q || a.trabajador_nombre.includes(q) || (a.dni ?? "").includes(q) || (a.motivo ?? "").toUpperCase().includes(q)));
  }, [lista, filtro, buscar]);
  const totalPendiente = r2(lista.filter((a) => a.estado === "PENDIENTE").reduce((s, a) => s + a.monto, 0));

  /** Al escribir o elegir un trabajador del maestro se completa su DNI. */
  const elegirTrabajador = (nombre: string) => {
    const t = activos.find((x) => x.nombre.toUpperCase() === nombre.trim().toUpperCase());
    setForm((f) => ({ ...f, trabajador_nombre: nombre, dni: t?.dni || f.dni }));
  };

  const limpiar = () => {
    setForm(vacio());
    setEditandoId(null);
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await ejecutarAsync(
      () => (editandoId ? editarAdelanto(editandoId, form) : crearAdelanto(form)),
      editandoId ? "Adelanto actualizado" : "Adelanto registrado"
    );
    setGuardando(false);
    if (ok) {
      limpiar();
      void recargar();
    }
  };

  const editar = (a: Adelanto) => {
    if (a.estado === "DESCONTADO") return; // ya se pagó en una planilla
    setEditandoId(a.id);
    setForm({ trabajador_nombre: a.trabajador_nombre, dni: a.dni ?? "", fecha: a.fecha, monto: a.monto, motivo: a.motivo ?? "", estado: a.estado });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminar = async (a: Adelanto) => {
    if (!confirm(`¿Eliminar el adelanto de ${a.trabajador_nombre} por ${soles(a.monto)}?`)) return;
    if (await ejecutarAsync(() => eliminarAdelanto(a.id), "Adelanto eliminado")) {
      if (editandoId === a.id) limpiar();
      void recargar();
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/planilla" className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-plomo-500 hover:text-azul-900">
            <ArrowLeft size={16} /> Planilla
          </Link>
          <h1 className="font-serif text-2xl font-light leading-tight text-azul-900 lg:text-3xl">Adelantos</h1>
          <p className="mt-1 text-[13px] text-plomo-600">Adelantos de sueldo a los trabajadores. El monto se descontará en la planilla.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
          Adelantos registrados: <b>{lista.length}</b>
        </div>
        <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
          Pendientes de descontar: <b>{lista.filter((a) => a.estado === "PENDIENTE").length}</b>
        </div>
        <div className="rounded-xl bg-azul-900 p-3 text-sm text-white">
          Total pendiente: <b className="text-white">{soles(totalPendiente)}</b>
        </div>
      </div>

      {/* FORMULARIO (registrar / editar) */}
      <Card className={cn(editandoId && "ring-2 ring-corp")}>
        <CardHeader
          title={editandoId ? "Editar adelanto" : "Registrar adelanto"}
          subtitle={puedeEditar ? (editandoId ? "Modifique los datos y presione Actualizar." : "Elija un trabajador del maestro o escriba su nombre.") : "Solo lectura: solo Planilla y Creador registran adelantos."}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <fieldset disabled={!puedeEditar || guardando} className="grid min-w-0 gap-4 p-5 md:grid-cols-4">
            <Field label="Trabajador *" className="md:col-span-2">
              <Input value={form.trabajador_nombre} onChange={(e) => elegirTrabajador(e.target.value)} list="trabajadores-adelanto" placeholder="Nombre del trabajador" />
              <datalist id="trabajadores-adelanto">
                {activos.map((t) => (
                  <option key={t.id} value={t.nombre}>
                    {t.dni ? `DNI ${t.dni}` : `N° ${t.id}`}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="DNI">
              <Input value={form.dni ?? ""} maxLength={8} inputMode="numeric" onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, "") })} placeholder="8 dígitos" />
            </Field>
            <Field label="Fecha *">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Monto (S/) *">
              <Input type="number" min={0} step="0.01" value={form.monto || ""} onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
            </Field>
            <Field label="Estado" hint="DESCONTADO lo pone el pago de la planilla">
              <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoAdelanto })} options={ESTADOS_EDITABLES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Motivo" className="md:col-span-2">
              <Textarea value={form.motivo ?? ""} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ej: pasajes, emergencia familiar…" className="min-h-[42px]" />
            </Field>
          </fieldset>
          <div className="flex justify-end gap-2 border-t border-plomo-100 px-5 py-4">
            {editandoId && (
              <Button type="button" variant="secondary" onClick={limpiar} disabled={guardando}>
                <X size={16} /> Cancelar edición
              </Button>
            )}
            <Button type="submit" variant={editandoId ? "warning" : "primary"} disabled={!puedeEditar || guardando}>
              {editandoId ? <Save size={16} /> : <Plus size={16} />} {guardando ? "Guardando…" : editandoId ? "Actualizar" : "Registrar adelanto"}
            </Button>
          </div>
        </form>
      </Card>

      {/* TABLA */}
      <Card>
        <CardHeader
          title="Adelantos"
          subtitle={`${visibles.length} de ${lista.length}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar trabajador, DNI, motivo…" className="w-56" />
              <Select value={filtro} onChange={(e) => setFiltro(e.target.value as "" | EstadoAdelanto)} placeholder="Todos los estados" options={ESTADOS_ADELANTO.map((s) => ({ value: s, label: s }))} className="w-44" />
            </div>
          }
        />
        {error ? (
          <p className="m-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : cargando ? (
          <p className="py-10 text-center text-sm text-slate-400">Cargando adelantos…</p>
        ) : visibles.length === 0 ? (
          <div className="p-5">
            <Empty icon={<HandCoins size={28} />} text={lista.length ? "Ningún adelanto coincide con el filtro." : "Aún no hay adelantos registrados."} />
          </div>
        ) : (
          <Table head={["Fecha", "Trabajador", "DNI", "Monto", "Motivo", "Estado", ...(puedeEditar ? ["Acciones"] : [])]}>
            {visibles.map((a) => (
              <tr
                key={a.id}
                className={cn(
                  "hover:bg-plomo-50",
                  a.estado === "PENDIENTE" && "bg-amber-50/40",
                  a.estado === "DESCONTADO" && "bg-emerald-50/40",
                  editandoId === a.id && "bg-amber-100",
                  a.estado === "ANULADO" && "opacity-60"
                )}
              >
                <Td>{fechaPE(a.fecha)}</Td>
                <Td className="font-semibold text-azul-900">{a.trabajador_nombre}</Td>
                <Td className="font-mono">{a.dni || "-"}</Td>
                <Td className="text-right font-semibold">{soles(a.monto)}</Td>
                <Td className="max-w-[260px]">
                  <span className="block truncate" title={a.motivo ?? ""}>
                    {a.motivo || "-"}
                  </span>
                </Td>
                <Td>
                  <Badge estado={a.estado} />
                  {a.estado === "DESCONTADO" && (
                    <p className="mt-1 text-[11px] text-emerald-700">
                      {a.planilla_periodo ? `En ${a.planilla_periodo}` : "En planilla"}
                      {a.descontado_en ? ` · ${new Date(a.descontado_en).toLocaleDateString("es-PE")}` : ""}
                    </p>
                  )}
                </Td>
                {puedeEditar && (
                  <Td>
                    {a.estado === "DESCONTADO" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-plomo-500" title="Ya se descontó en una planilla: no se puede editar ni eliminar">
                        <Lock size={13} /> Descontado
                      </span>
                    ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => editar(a)} title="Editar">
                        <Pencil size={14} /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void eliminar(a)} title="Eliminar">
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </div>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
