"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRightLeft, Camera, Factory, Pencil, Printer, Search, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar, ejecutarAsync, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { EMPRESA } from "@/lib/empresa";
import {
  MARCAS_MOTOR,
  SEDES_EQUIPO,
  sedeEquipo,
  TIPOS_EQUIPO,
  equipoVacio,
  normalizarEquipo,
  guardarEquipo,
  transferirEquipo,
  reducirFoto,
  type DatosEquipo,
  type EquipoTerminado,
  type MarcaMotor,
  type TipoEquipo,
} from "@/lib/equipos";
import { KEYS, fechaPE, hoy, useStore } from "@/lib/storage";
import { trazabilidadEquipo } from "@/lib/trazabilidad";

const fechaHora = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
};

/**
 * Sección "Equipos terminados" de Almacén › Stock. Los equipos los ingresa Producción (QC aprobado):
 * aquí se visualizan (filtros por sede / estado), con trazabilidad, QR y transferencia de sede.
 */
export function EquiposTerminados({ puedeRegistrar, nuevo, onNuevoCerrado }: { puedeRegistrar: boolean; nuevo: boolean; onNuevoCerrado: () => void }) {
  const equipos = useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []).map(normalizarEquipo);
  useStore(KEYS.MOVIMIENTOS, []);
  useStore(KEYS.PRODUCCION, []);
  useStore(KEYS.DESPACHOS, []);
  const [q, setQ] = useState("");
  const [sedeF, setSedeF] = useState("");
  const [estadoF, setEstadoF] = useState<"" | "DISPONIBLE" | "EN_QC" | "VENDIDO">("DISPONIBLE");
  const [form, setForm] = useState<{ datos: DatosEquipo; id?: string } | null>(null);
  const [ver, setVer] = useState<string | null>(null);

  useEffect(() => {
    if (nuevo) {
      setForm({ datos: { ...equipoVacio(), supervisor_qc: getSesion()?.usuario ?? "" } });
      onNuevoCerrado();
    }
  }, [nuevo, onNuevoCerrado]);

  const t = q.trim().toUpperCase().replace(/\s+/g, "");
  const lista = equipos
    .filter((e) => (!sedeF || sedeEquipo(e) === sedeF) && (!estadoF || e.estado === estadoF))
    .filter((e) => !t || [e.codigo_chasis, e.serie_motor, e.modelo, e.id].some((v) => v.replace(/\s+/g, "").toUpperCase().includes(t)))
    .sort((a, b) => b.id.localeCompare(a.id));
  const disponibles = equipos.filter((e) => e.estado === "DISPONIBLE").length;
  const vendidos = equipos.filter((e) => e.estado === "VENDIDO").length;
  const sel = equipos.find((e) => e.id === ver) ?? null;

  return (
    <Card>
      <CardHeader
        title="Equipos terminados"
        subtitle={`${equipos.length} equipo(s) fabricados · ${disponibles} disponible(s) · ${equipos.length - disponibles - vendidos} en control de calidad · ${vendidos} vendido(s)`}
        action={
          <div className="flex flex-wrap gap-2">
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
              <Input placeholder="Buscar chasis, serie motor o modelo…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <div className="w-40">
              <Select value={sedeF} onChange={(e) => setSedeF(e.target.value)} placeholder="Todas las sedes" options={SEDES_EQUIPO.map((x) => ({ value: x, label: x }))} aria-label="Sede" />
            </div>
            <div className="w-40">
              <Select
                value={estadoF}
                onChange={(e) => setEstadoF(e.target.value as typeof estadoF)}
                placeholder="Todos los estados"
                options={[
                  { value: "DISPONIBLE", label: "Disponibles (stock)" },
                  { value: "EN_QC", label: "En QC" },
                  { value: "VENDIDO", label: "Vendidos" },
                ]}
                aria-label="Estado"
              />
            </div>
            <Link href="/dashboard/produccion" className="inline-flex items-center gap-1.5 rounded-lg border border-plomo-200 bg-white px-4 py-2 text-sm font-medium text-azul-900 hover:bg-plomo-50">
              <Factory size={16} /> Ingresan desde Producción
            </Link>
          </div>
        }
      />
      {lista.length === 0 ? (
        <div className="p-5">
          <Empty icon={<Factory size={28} />} text={equipos.length ? "Ningún equipo coincide con la búsqueda." : "Aún no hay equipos terminados registrados."} />
        </div>
      ) : (
        <Table head={["Código", "Sede", "Modelo", "Chasis / VIN", "Marca motor", "Serie motor", "Origen", "QC", "Estado", "Actualizado"]}>
          {lista.map((e) => (
            <tr key={e.id} className="cursor-pointer hover:bg-plomo-50" onClick={() => setVer(e.id)} title="Ver detalle y QR">
              <Td className="font-mono text-xs font-semibold text-azul-900">{e.id}</Td>
              <Td>{sedeEquipo(e)}</Td>
              <Td>
                <p className="font-semibold text-azul-900">{e.modelo}</p>
                <p className="text-xs text-plomo-500">{e.tipo_equipo}</p>
              </Td>
              <Td className="font-mono text-xs">{e.codigo_chasis}</Td>
              <Td>{e.marca_motor}</Td>
              <Td className="font-mono text-xs">{e.serie_motor}</Td>
              <Td>
                {e.origen === "PRODUCCION" ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200" title={e.op_id}>
                    PRODUCCIÓN
                  </span>
                ) : (
                  <span className="text-xs text-plomo-500">Manual</span>
                )}
              </Td>
              <Td>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset",
                    e.qc_aprobado ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-vino ring-red-200"
                  )}
                >
                  {e.qc_aprobado ? "QC OK" : "SIN QC"}
                </span>
              </Td>
              <Td>
                <Badge estado={e.estado} />
              </Td>
              <Td className="text-xs">{fechaHora(e.actualizado)}</Td>
            </tr>
          ))}
        </Table>
      )}

      {form && <FormEquipo inicial={form.datos} id={form.id} onClose={() => setForm(null)} />}
      {sel && (
        <DetalleEquipo
          e={sel}
          puedeEditar={puedeRegistrar && sel.origen !== "PRODUCCION" && sel.estado !== "VENDIDO"}
          puedeTransferir={puedeRegistrar && sel.estado === "DISPONIBLE"}
          onClose={() => setVer(null)}
          onEditar={() => {
            setVer(null);
            setForm({ id: sel.id, datos: { ...sel, sede: sedeEquipo(sel), fecha_qc: sel.fecha_qc ?? hoy(), supervisor_qc: sel.supervisor_qc ?? getSesion()?.usuario ?? "", observaciones_qc: sel.observaciones_qc ?? "" } });
          }}
        />
      )}
    </Card>
  );
}

function FormEquipo({ inicial, id, onClose }: { inicial: DatosEquipo; id?: string; onClose: () => void }) {
  const [d, setD] = useState<DatosEquipo>(inicial);
  const [guardando, setGuardando] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof DatosEquipo>(k: K, v: DatosEquipo[K]) => setD((x) => ({ ...x, [k]: v }));
  const supervisores = Array.from(new Set(useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []).map((e) => e.supervisor_qc).filter(Boolean) as string[]));

  const agregarFotos = async (files: FileList | null) => {
    if (!files) return;
    const libres = 3 - d.fotos.length;
    if (libres <= 0) return toast("Máximo 3 fotos por equipo.", "error");
    try {
      const nuevas = await Promise.all(Array.from(files).slice(0, libres).map((f) => reducirFoto(f)));
      setD((x) => ({ ...x, fotos: [...x.fotos, ...nuevas].slice(0, 3) }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const guardar = async () => {
    setGuardando(true);
    const ok = await ejecutarAsync(async () => {
      const eq = await guardarEquipo(d, getSesion()?.usuario ?? "", id);
      toast(`${eq.id} · ${eq.estado === "DISPONIBLE" ? "DISPONIBLE" : "EN QC (pendiente de supervisión)"}`);
    }, id ? "Equipo actualizado" : "Equipo terminado registrado");
    setGuardando(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={id ? `Editar equipo ${id}` : "Registrar equipo terminado"} wide>
      <div className="space-y-5">
        <p className="text-sm text-plomo-600">Un registro por equipo fabricado. La serie de motor y el código de chasis / VIN no se pueden repetir.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Tipo de equipo *">
            <Select value={d.tipo_equipo} onChange={(e) => set("tipo_equipo", e.target.value as TipoEquipo)} options={TIPOS_EQUIPO.map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Modelo *">
            <Input value={d.modelo} onChange={(e) => set("modelo", e.target.value.toUpperCase())} placeholder="Ej: CV-D500, CV-MC300" />
          </Field>
          <Field label="Marca de motor *">
            <Select value={d.marca_motor} onChange={(e) => set("marca_motor", e.target.value as MarcaMotor)} options={MARCAS_MOTOR.map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Serie de motor * (única)">
            <Input value={d.serie_motor} onChange={(e) => set("serie_motor", e.target.value.toUpperCase())} placeholder="Ej: 8X123456" className="font-mono" />
          </Field>
          <Field label="Código de chasis / VIN * (único)" className="md:col-span-2">
            <Input value={d.codigo_chasis} onChange={(e) => set("codigo_chasis", e.target.value.toUpperCase())} placeholder="Ej: COMBOY-CV-D500-2026-001" className="font-mono" />
          </Field>
          <Field label="Color *">
            <Input value={d.color} onChange={(e) => set("color", e.target.value)} placeholder="Ej: Amarillo Minero" />
          </Field>
          <Field label="Ubicación / sede *">
            <Select value={d.sede} onChange={(e) => set("sede", e.target.value)} options={SEDES_EQUIPO.map((x) => ({ value: x, label: x }))} />
          </Field>
        </div>

        <fieldset className="rounded-xl border border-plomo-200 p-4">
          <legend className="px-1 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Control de calidad</legend>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-azul-900">¿Pasó supervisión QC?</span>
            <button
              type="button"
              role="switch"
              aria-checked={d.qc_aprobado}
              aria-label="Pasó supervisión QC"
              onClick={() => set("qc_aprobado", !d.qc_aprobado)}
              className={cn("relative inline-flex h-7 w-14 items-center rounded-full transition", d.qc_aprobado ? "bg-emerald-600" : "bg-plomo-200")}
            >
              <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition", d.qc_aprobado ? "translate-x-8" : "translate-x-1")} />
            </button>
            <span className={cn("text-sm font-bold", d.qc_aprobado ? "text-emerald-700" : "text-vino")}>{d.qc_aprobado ? "Sí → DISPONIBLE" : "No → EN QC"}</span>
          </div>
          {d.qc_aprobado && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Fecha QC *">
                <Input type="date" value={d.fecha_qc ?? ""} max={hoy()} onChange={(e) => set("fecha_qc", e.target.value)} />
              </Field>
              <Field label="Supervisor QC *" className="md:col-span-2">
                <Input value={d.supervisor_qc ?? ""} list="supervisores-qc" onChange={(e) => set("supervisor_qc", e.target.value)} placeholder="Nombre del supervisor" />
                <datalist id="supervisores-qc">
                  {supervisores.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <Field label="Observaciones QC" className="md:col-span-3">
                <Textarea value={d.observaciones_qc ?? ""} onChange={(e) => set("observaciones_qc", e.target.value)} />
              </Field>
            </div>
          )}
        </fieldset>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-plomo-500">Fotos (opcional, máx. 3)</p>
          <div className="flex flex-wrap items-center gap-3">
            {d.fotos.map((f, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.nombre} className="h-20 w-28 rounded-lg border border-plomo-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setD((x) => ({ ...x, fotos: x.fotos.filter((_, j) => j !== i) }))}
                  className="absolute -right-2 -top-2 rounded-full bg-vino p-1 text-white"
                  aria-label="Quitar foto"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {d.fotos.length < 3 && (
              <Button type="button" variant="secondary" onClick={() => fotoRef.current?.click()}>
                <Camera size={16} /> Agregar foto
              </Button>
            )}
            <input ref={fotoRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => void agregarFotos(e.target.files)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-plomo-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            <Factory size={16} /> {guardando ? "Guardando…" : id ? "Guardar cambios" : "Registrar equipo"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DetalleEquipo({
  e,
  puedeEditar,
  puedeTransferir,
  onClose,
  onEditar,
}: {
  e: EquipoTerminado;
  puedeEditar: boolean;
  puedeTransferir: boolean;
  onClose: () => void;
  onEditar: () => void;
}) {
  const [destino, setDestino] = useState("");
  const pasos = trazabilidadEquipo(e);
  const [qr, setQr] = useState("");
  useEffect(() => {
    void QRCode.toDataURL(e.codigo_chasis, { errorCorrectionLevel: "M", margin: 1, width: 360, color: { dark: "#0F2440", light: "#FFFFFF" } }).then(setQr);
  }, [e.codigo_chasis]);

  const imprimir = () => {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return toast("Permita las ventanas emergentes para imprimir el QR.", "error");
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR ${esc(e.codigo_chasis)}</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;margin:24px;color:#0F2440}
      .et{border:2px solid #0F2440;border-radius:12px;padding:16px;display:inline-block;width:300px}
      .marca{font-weight:bold;font-size:20px;letter-spacing:1px}.marca b{color:#B91C1C}
      img{width:240px;height:240px}.ch{font-family:monospace;font-size:15px;font-weight:bold;margin-top:6px}
      .d{font-size:12px;color:#475569;margin-top:4px}.barra{height:5px;background:#B91C1C;margin:8px 0}</style></head>
      <body><div class="et"><div class="marca">COMBOY <b>VID</b></div><div class="barra"></div>
      <img src="${qr}" alt="QR"/><div class="ch">${esc(e.codigo_chasis)}</div>
      <div class="d">${esc(e.tipo_equipo)} · ${esc(e.modelo)} · Motor ${esc(e.marca_motor)} ${esc(e.serie_motor)}</div>
      <div class="d">${esc(e.id)} · ${esc(EMPRESA.nombreComercial)}</div></div>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const fila = (k: string, v: string) => (
    <div className="flex justify-between gap-3 border-b border-plomo-100 py-1.5 text-sm">
      <span className="text-plomo-500">{k}</span>
      <span className="text-right font-medium text-azul-900">{v}</span>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`${e.id} · ${e.modelo}`} wide>
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge estado={e.estado} />
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", e.qc_aprobado ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-vino ring-red-200")}>
              {e.qc_aprobado ? "QC APROBADO" : "SIN SUPERVISIÓN QC"}
            </span>
          </div>
          {fila("Tipo de equipo", e.tipo_equipo)}
          {fila("Modelo", e.modelo)}
          {fila("Código de chasis / VIN", e.codigo_chasis)}
          {fila("Marca de motor", e.marca_motor)}
          {fila("Serie de motor", e.serie_motor)}
          {fila("Color", e.color)}
          {fila("Ubicación / sede", sedeEquipo(e))}
          {e.vendido_od && fila("Vendido (salida de almacén)", `${e.vendido_od}${e.fecha_venta ? ` · ${fechaHora(e.fecha_venta)}` : ""}`)}
          {fila("Fabricado", fechaHora(e.fecha_fabricacion))}
          {e.qc_aprobado && fila("Fecha QC", e.fecha_qc ? fechaPE(e.fecha_qc) : "-")}
          {e.qc_aprobado && fila("Supervisor QC", e.supervisor_qc ?? "-")}
          {e.observaciones_qc && fila("Observaciones QC", e.observaciones_qc)}
          {fila("Registrado por", e.creado_por)}
          {e.fotos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {e.fotos.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.nombre} className="h-24 w-32 rounded-lg border border-plomo-200 object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-center rounded-xl border-2 border-azul-900 p-4 text-center">
          <p className="font-serif text-lg font-bold text-azul-900">
            COMBOY <span className="text-corp">VID</span>
          </p>
          <div className="my-2 h-1 w-full bg-corp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt={`QR del chasis ${e.codigo_chasis}`} className="h-52 w-52" />}
          <p className="mt-2 break-all font-mono text-sm font-bold text-azul-900">{e.codigo_chasis}</p>
          <p className="text-xs text-plomo-500">QR del código de chasis</p>
          <Button className="mt-3 w-full" onClick={imprimir} disabled={!qr}>
            <Printer size={16} /> Imprimir QR
          </Button>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-plomo-200 p-4">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Trazabilidad</p>
        <ol className="flex flex-wrap items-start gap-y-3" aria-label="Trazabilidad del equipo">
          {pasos.map((p, i) => (
            <li key={i} className="flex items-start">
              <div className="flex max-w-[170px] flex-col items-center text-center">
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", p.hecho ? (i === pasos.length - 1 ? "bg-corp text-white" : "bg-azul-900 text-white") : "border-2 border-plomo-200 bg-white text-plomo-500")}>
                  {p.hecho ? "✓" : i + 1}
                </span>
                <span className={cn("mt-1 text-xs font-semibold", p.hecho ? "text-azul-900" : "text-plomo-500")}>{p.titulo}</span>
                <span className="text-[11px] text-plomo-500">{p.detalle}</span>
                {p.fecha && <span className="text-[10px] text-plomo-500">{fechaHora(p.fecha.length === 10 ? `${p.fecha}T12:00:00` : p.fecha)}</span>}
              </div>
              {i < pasos.length - 1 && <span className={cn("mx-1 mt-3.5 h-0.5 w-8", pasos[i + 1].hecho ? "bg-azul-900" : "bg-plomo-200")} />}
            </li>
          ))}
        </ol>
      </div>
      {(puedeEditar || puedeTransferir) && (
        <div className="mt-4 flex flex-wrap items-end justify-end gap-2 border-t border-plomo-100 pt-4">
          {puedeTransferir && (
            <>
              <div className="w-48">
                <Select value={destino} onChange={(ev) => setDestino(ev.target.value)} placeholder="Transferir a…" options={SEDES_EQUIPO.filter((x) => x !== sedeEquipo(e)).map((x) => ({ value: x, label: x }))} aria-label="Transferir a" />
              </div>
              <Button
                variant="secondary"
                disabled={!destino}
                onClick={() => ejecutar(() => transferirEquipo(e.codigo_chasis, destino, getSesion()?.usuario ?? ""), `${e.id} transferido a ${destino}`) && setDestino("")}
              >
                <ArrowRightLeft size={16} /> Transferir
              </Button>
            </>
          )}
          {puedeEditar && (
            <Button variant="secondary" onClick={onEditar}>
              <Pencil size={16} /> Editar / registrar QC
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
