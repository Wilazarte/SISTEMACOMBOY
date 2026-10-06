"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, ClipboardCheck, Factory, Plus } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, Textarea, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import { FirmaPad } from "@/components/FirmaPad";
import { getSesion } from "@/lib/auth";
import { ALMACENES, ALMACEN_DEFECTO } from "@/lib/empresa";
import { MARCAS_MOTOR, TIPOS_EQUIPO } from "@/lib/equipos";
import { anularOrdenProduccion, aprobarQC, crearOrdenProduccion, opVacia, type DatosOP, type OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, hoy, puede, useRol, useStore } from "@/lib/storage";
import type { ArchivoAdjunto } from "@/lib/types";

/** PRODUCCIÓN: órdenes de producción; el QC aprobado (con firma) ingresa el equipo a Almacén automáticamente. */
export default function ProduccionPage() {
  const [rol] = useRol();
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const [form, setForm] = useState<DatosOP | null>(null);
  const [qcDe, setQcDe] = useState<OrdenProduccion | null>(null);
  const [filtro, setFiltro] = useState("");
  const habilitado = puede(rol, "req.crear") && !getSesion()?.soloLectura; // Almacén / producción y creador
  const lista = [...ops].filter((o) => !filtro || o.estado === filtro).sort((a, b) => b.id.localeCompare(a.id));
  const enFab = ops.filter((o) => o.estado === "EN_FABRICACION").length;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-light leading-tight text-azul-900 lg:text-3xl">Producción</h1>
          <p className="mt-1 text-[13px] text-plomo-600">Orden de producción → control de calidad firmado → ingreso automático a Almacén (equipo terminado DISPONIBLE)</p>
        </div>
        {habilitado && (
          <Button onClick={() => setForm(opVacia())}>
            <Plus size={16} /> Nueva orden de producción
          </Button>
        )}
      </div>

      <Card>
        <CardHeader
          title="Órdenes de producción"
          subtitle={`${ops.length} orden(es) · ${enFab} en fabricación`}
          action={
            <div className="w-48">
              <Select
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Todos los estados"
                options={[
                  { value: "EN_FABRICACION", label: "En fabricación" },
                  { value: "QC_APROBADO", label: "QC aprobado" },
                  { value: "ANULADA", label: "Anuladas" },
                ]}
              />
            </div>
          }
        />
        {lista.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Factory size={28} />} text="No hay órdenes de producción." />
          </div>
        ) : (
          <Table head={["OP", "Fecha", "Equipo", "Chasis", "Motor", "Almacén destino", "Estado", "QC / equipo", "Acciones"]}>
            {lista.map((o) => (
              <tr key={o.id} className="hover:bg-plomo-50">
                <Td className="font-mono text-xs font-semibold text-azul-900">{o.id}</Td>
                <Td>{fechaPE(o.fecha)}</Td>
                <Td>
                  <p className="font-semibold text-azul-900">{o.modelo}</p>
                  <p className="text-xs text-plomo-500">{o.tipo_equipo}</p>
                </Td>
                <Td className="font-mono text-xs">{o.codigo_chasis}</Td>
                <Td className="text-xs">
                  {o.marca_motor}
                  {o.serie_motor && <p className="font-mono text-plomo-500">{o.serie_motor}</p>}
                </Td>
                <Td>{o.ubicacion_sede}</Td>
                <Td>
                  <Badge estado={o.estado} />
                </Td>
                <Td className="text-xs">
                  {o.qc ? (
                    <>
                      <p>
                        {o.qc.supervisor} · {fechaPE(o.qc.fecha)}
                      </p>
                      <Link href="/dashboard/almacen" className="font-mono font-semibold text-corp hover:underline">
                        {o.equipo_id}
                      </Link>
                    </>
                  ) : (
                    "-"
                  )}
                </Td>
                <Td>
                  {habilitado && o.estado === "EN_FABRICACION" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="success" onClick={() => setQcDe(o)}>
                        <ClipboardCheck size={14} /> QC y firma
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Anular"
                        onClick={() => {
                          const m = prompt(`Motivo para anular ${o.id}:`);
                          if (m !== null) ejecutar(() => anularOrdenProduccion(o.id, m), `${o.id} anulada`);
                        }}
                      >
                        <Ban size={14} className="text-red-600" />
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {form && <FormOP inicial={form} onClose={() => setForm(null)} />}
      {qcDe && <ModalQC op={qcDe} supervisores={Array.from(new Set(ops.map((o) => o.qc?.supervisor).filter(Boolean) as string[]))} onClose={() => setQcDe(null)} />}
    </div>
  );
}

function FormOP({ inicial, onClose }: { inicial: DatosOP; onClose: () => void }) {
  const [d, setD] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const set = <K extends keyof DatosOP>(k: K, v: DatosOP[K]) => setD((x) => ({ ...x, [k]: v }));
  const guardar = async () => {
    setEnviando(true);
    const ok = await ejecutarAsync(async () => {
      const op = await crearOrdenProduccion(d, getSesion()?.usuario ?? "");
      toast(`${op.id} creada · chasis ${op.codigo_chasis}`);
    }, "Orden de producción registrada");
    setEnviando(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title="Nueva orden de producción" wide>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Tipo de equipo *" className="md:col-span-2">
          <Input value={d.tipo_equipo} list="tipos-equipo" onChange={(e) => set("tipo_equipo", e.target.value.toUpperCase())} placeholder="Ej: REMOLCADOR ECO-MINE 3000" />
          <datalist id="tipos-equipo">
            {TIPOS_EQUIPO.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Modelo *">
          <Input value={d.modelo} onChange={(e) => set("modelo", e.target.value.toUpperCase())} placeholder="Ej: CV-300" />
        </Field>
        <Field label="Marca de motor *">
          <Input value={d.marca_motor} list="marcas-motor" onChange={(e) => set("marca_motor", e.target.value.toUpperCase())} placeholder="Ej: RONCO, KUBOTA" />
          <datalist id="marcas-motor">
            {MARCAS_MOTOR.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Serie de motor">
          <Input value={d.serie_motor} onChange={(e) => set("serie_motor", e.target.value.toUpperCase())} className="font-mono" />
        </Field>
        <Field label="Código de chasis * (único)">
          <Input value={d.codigo_chasis} onChange={(e) => set("codigo_chasis", e.target.value.toUpperCase())} placeholder="Ej: WH174MN-2 260380186" className="font-mono" />
        </Field>
        <Field label="Color">
          <Input value={d.color} onChange={(e) => set("color", e.target.value)} />
        </Field>
        <Field label="Almacén de destino *">
          <Select value={d.ubicacion_sede} onChange={(e) => set("ubicacion_sede", e.target.value)} options={ALMACENES.map((a) => ({ value: a, label: a }))} />
        </Field>
        <Field label="Fecha">
          <Input type="date" value={d.fecha} max={hoy()} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
        <Field label="Observaciones" className="md:col-span-3">
          <Textarea value={d.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-plomo-100 pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={enviando}>
          <Factory size={16} /> Registrar orden
        </Button>
      </div>
    </Modal>
  );
}

function ModalQC({ op, supervisores, onClose }: { op: OrdenProduccion; supervisores: string[]; onClose: () => void }) {
  const [supervisor, setSupervisor] = useState(supervisores[0] ?? "");
  const [fecha, setFecha] = useState(hoy());
  const [obs, setObs] = useState("");
  const [sede, setSede] = useState(op.ubicacion_sede || ALMACEN_DEFECTO);
  const [firma, setFirma] = useState<ArchivoAdjunto | undefined>();
  const [enviando, setEnviando] = useState(false);
  const aprobar = async () => {
    setEnviando(true);
    const ok = await ejecutarAsync(async () => {
      const r = await aprobarQC(op.id, { supervisor, fecha, observaciones: obs, firma, ubicacion_sede: sede }, getSesion()?.usuario ?? "");
      toast(`${r.equipo.id} ingresó a ${r.equipo.ubicacion_sede} como DISPONIBLE (chasis ${r.equipo.codigo_chasis})`);
    }, `${op.id}: QC aprobado`);
    setEnviando(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Control de calidad · ${op.id}`} wide>
      <div className="space-y-4">
        <p className="text-sm text-plomo-600">
          {op.tipo_equipo} {op.modelo} · chasis <b className="font-mono">{op.codigo_chasis}</b>. Al aprobar, el equipo ingresa automáticamente a Almacén como <b>DISPONIBLE</b>.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Supervisor QC *">
            <Input value={supervisor} list="supervisores-qc-op" onChange={(e) => setSupervisor(e.target.value)} placeholder="Ej: Williams" />
            <datalist id="supervisores-qc-op">
              {supervisores.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Fecha QC *">
            <Input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Almacén de ingreso *">
            <Select value={sede} onChange={(e) => setSede(e.target.value)} options={ALMACENES.map((a) => ({ value: a, label: a }))} />
          </Field>
          <Field label="Observaciones QC" className="md:col-span-3">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>
        <FirmaPad onChange={setFirma} titulo="Firma del supervisor QC" archivo="firma-qc.png" />
        <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={aprobar} disabled={enviando || !supervisor.trim() || !firma}>
            <CheckCircle2 size={16} /> Aprobar QC e ingresar a almacén
          </Button>
        </div>
      </div>
    </Modal>
  );
}
