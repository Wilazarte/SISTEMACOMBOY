"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { CheckCircle2, FileUp, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Field, Input, Modal, Select, Textarea, ejecutarAsync, toast } from "@/components/ui";
import { ALMACENES, ALMACEN_DEFECTO } from "@/lib/empresa";
import {
  BANCOS_PE,
  CHECKLIST_QC,
  MEDIOS_PAGO,
  RECURSOS_MAQUINA,
  TIPOS_ARCHIVO_COTI,
  TIPOS_COMPROBANTE_COMPRA,
  ZONAS_PT,
  aceptarProduccion,
  bomDe,
  costoBomLote,
  docsDe,
  guardarBom,
  useExpedientes,
  actaEntregaCompleta,
  cerrarExpediente,
  cotizacionApta,
  disponibleDe,
  generarOC,
  registrarComprobante,
  registrarCotizacion,
  registrarHoras,
  registrarPago,
  registrarTransporte,
  reportarAvance,
  solicitarComprobante,
  validarRucDecolecta,
  validarStock,
  type CotizacionExp,
  type DatosCotizacion,
  type Expediente,
  type LineaBom,
  type LineaMaterial,
  type UnidadPT,
  type OrdenCompraExp,
  type RespuestaRuc,
} from "@/lib/expedientes";
import { MOTIVOS_RETIRO, requiereChasis, type MotivoRetiro } from "@/lib/inventario";
import { IGV, getStock, hoy, r2, rucValido, soles } from "@/lib/storage";
import { Boton, Dato } from "./comun";

const opciones = (l: readonly string[]) => l.map((v) => ({ value: v, label: v }));
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

function Pie({ onClose, ocupado, texto }: { onClose: () => void; ocupado: boolean; texto: string }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <Boton onClick={onClose}>Cancelar</Boton>
      <Boton type="submit" lleno disabled={ocupado}>
        {ocupado ? "Guardando…" : texto}
      </Boton>
    </div>
  );
}

function useEnvio(onClose: () => void) {
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    const bien = await ejecutarAsync(fn, ok);
    setOcupado(false);
    if (bien) onClose();
  };
  return { ocupado, enviar };
}

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;

// ---------------------------------------------------------------- FASE 2 · Producción acepta
export function FormFase2({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const stock = useMemo(() => getStock().sort((a, b) => a.nombre.localeCompare(b.nombre)), []);
  const s = useExpedientes();
  // Lote mixto: BOM de cada modelo × cantidad = materiales y costo estimado
  const lote = x.es_lote_mixto ? costoBomLote(docsDe(x, s).detalles, s.bom) : null;
  const [lineas, setLineas] = useState<Omit<LineaMaterial, "id">[]>(() => (lote?.materiales.length ? lote.materiales : [{ nombre: "", unidad: "UND", cantidad: 1 }]));
  const [bomDeModelo, setBomDeModelo] = useState<string | null>(null);
  const [ayudante, setAyudante] = useState("");
  const [validado, setValidado] = useState(false);
  const [obs, setObs] = useState("");
  const { ocupado, enviar } = useEnvio(onClose);
  const elegir = (i: number, id: string) => {
    const s = stock.find((x) => x.id === id);
    setLineas(lineas.map((l, j) => (j === i ? (s ? { ...l, stockId: s.id, sede: s.sede, nombre: s.nombre, unidad: s.unidad } : { ...l, stockId: undefined }) : l)));
  };
  return (
    <Modal open onClose={onClose} title={`Fase 2 · ${x.codigo_expediente} · aceptar OP y pedir materiales`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => aceptarProduccion(x, { materiales: lineas, ayudante, ayudanteValidado: validado, observaciones: obs }), "Solicitud de materiales enviada a Almacén"))} className="space-y-3">
        {lote && (
          <section className="rounded-lg border border-[#333333] bg-[#1A1A1A] p-3">
            <h3 className="mb-2 text-[12px] font-bold uppercase text-[#FF9A4D]">Equipos del lote · BOM y costo estimado</h3>
            <table className="w-full text-[13px]">
              <tbody>
                {lote.porDetalle.map((p) => (
                  <tr key={p.detalleId} className="border-b border-[#333333] last:border-0">
                    <td className="py-1.5 text-white">
                      {p.cantidad} × {p.modelo}
                    </td>
                    <td className="py-1.5 text-[#a1a1aa]">{p.sinBom ? "Sin BOM: cárguelo para calcular el costo" : `${bomDe(p.modelo, s.bom).length} material(es) por unidad${p.sinCosto.length ? ` · sin costo en stock: ${p.sinCosto.join(", ")}` : ""}`}</td>
                    <td className="py-1.5 text-right text-white">{soles(p.costo)}</td>
                    <td className="py-1.5 pl-2 text-right">
                      <Boton onClick={() => setBomDeModelo(p.modelo)}>{p.sinBom ? "Cargar BOM" : "Editar BOM"}</Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-white">
                Costo estimado del lote: <b>{soles(lote.total)}</b> <span className="text-[#a1a1aa]">(se guarda en la OP al aceptar)</span>
              </p>
              <Boton onClick={() => setLineas(lote.materiales.length ? lote.materiales : lineas)} disabled={!lote.materiales.length}>
                Llenar materiales con el BOM
              </Boton>
            </div>
          </section>
        )}
        {lineas.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_90px_90px_auto]">
            <Field label="Del stock">
              <Select value={l.stockId ?? ""} onChange={(e) => elegir(i, e.target.value)} placeholder="Material nuevo (no está en stock)" options={stock.map((s) => ({ value: s.id, label: `${s.nombre} · ${s.sede} · hay ${s.cantidad} ${s.unidad}` }))} />
            </Field>
            <Field label="Material">
              <Input value={l.nombre} disabled={!!l.stockId} onChange={(e) => setLineas(lineas.map((y, j) => (j === i ? { ...y, nombre: e.target.value } : y)))} />
            </Field>
            <Field label="Unidad">
              <Input value={l.unidad} disabled={!!l.stockId} onChange={(e) => setLineas(lineas.map((y, j) => (j === i ? { ...y, unidad: e.target.value.toUpperCase() } : y)))} />
            </Field>
            <Field label="Cantidad">
              <Input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => setLineas(lineas.map((y, j) => (j === i ? { ...y, cantidad: Number(e.target.value) } : y)))} />
            </Field>
            <button type="button" aria-label="Quitar" className="mb-2 text-[#a1a1aa] hover:text-[#FF9A4D]" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <Boton onClick={() => setLineas([...lineas, { nombre: "", unidad: "UND", cantidad: 1 }])}>
          <Plus size={14} /> Agregar material
        </Boton>
        <Grid>
          <Field label="Ayudante de ensamblaje (mano de obra)">
            <Input value={ayudante} onChange={(e) => setAyudante(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-[13px] text-white">
            <input type="checkbox" checked={validado} onChange={(e) => setValidado(e.target.checked)} /> Mano de obra validada
          </label>
        </Grid>
        <Field label="Observaciones">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        <Pie onClose={onClose} ocupado={ocupado} texto="Aceptar y enviar a Almacén" />
      </form>
      {bomDeModelo && <FormBom modelo={bomDeModelo} actual={bomDe(bomDeModelo, s.bom)} onClose={() => setBomDeModelo(null)} />}
    </Modal>
  );
}

/** BOM de un modelo: materiales y cantidad por UNA unidad (Producción). */
export function FormBom({ modelo, actual, onClose }: { modelo: string; actual: LineaBom[]; onClose: () => void }) {
  const stock = useMemo(() => getStock().sort((a, b) => a.nombre.localeCompare(b.nombre)), []);
  const [lineas, setLineas] = useState<Omit<LineaBom, "modelo">[]>(() => (actual.length ? actual.map(({ modelo: _m, ...l }) => l) : [{ material: "", unidad: "UND", cantidad: 1, stock_id: null }]));
  const { ocupado, enviar } = useEnvio(onClose);
  const set = (i: number, cambio: Partial<Omit<LineaBom, "modelo">>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  return (
    <Modal open onClose={onClose} title={`BOM · ${modelo} · materiales por unidad`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => guardarBom(modelo, lineas), `BOM de ${modelo} guardado`))} className="space-y-3">
        {lineas.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_90px_110px_auto]">
            <Field label="Del stock">
              <Select
                value={l.stock_id ?? ""}
                onChange={(e) => {
                  const it = stock.find((x) => x.id === e.target.value);
                  set(i, it ? { stock_id: it.id, material: it.nombre, unidad: it.unidad } : { stock_id: null });
                }}
                placeholder="Material sin stock"
                options={stock.map((x) => ({ value: x.id, label: `${x.nombre} · ${x.sede} · ${soles(x.costoUnit || 0)}` }))}
              />
            </Field>
            <Field label="Material">
              <Input value={l.material} disabled={!!l.stock_id} onChange={(e) => set(i, { material: e.target.value })} />
            </Field>
            <Field label="Unidad">
              <Input value={l.unidad} disabled={!!l.stock_id} onChange={(e) => set(i, { unidad: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Cant. por unidad">
              <Input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => set(i, { cantidad: Number(e.target.value) })} />
            </Field>
            <button type="button" aria-label="Quitar" className="mb-2 text-[#a1a1aa] hover:text-[#FF9A4D]" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <Boton onClick={() => setLineas([...lineas, { material: "", unidad: "UND", cantidad: 1, stock_id: null }])}>
          <Plus size={14} /> Agregar material
        </Boton>
        <Pie onClose={onClose} ocupado={ocupado} texto="Guardar BOM" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- FASE 3 · Almacén valida stock
export function FormFase3({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const mats = x.datos.solicitud?.materiales ?? [];
  const stock = useMemo(() => getStock(), []);
  const [entregas, setEntregas] = useState<Record<string, number>>(() => Object.fromEntries(mats.map((m) => [m.id, Math.min(m.cantidad, disponibleDe(m, stock).cantidad)])));
  const motivos = MOTIVOS_RETIRO.filter((m) => requiereChasis(m) && m.startsWith("PRODUCCION"));
  const [motivo, setMotivo] = useState<MotivoRetiro>(motivos[0]);
  const [recibe, setRecibe] = useState(x.datos.solicitud?.ayudante ?? "");
  const [autoriza, setAutoriza] = useState("");
  const [obs, setObs] = useState("");
  const [sede, setSede] = useState(ALMACEN_DEFECTO);
  const { ocupado, enviar } = useEnvio(onClose);
  const faltan = mats.filter((m) => (entregas[m.id] ?? 0) < m.cantidad);
  return (
    <Modal open onClose={onClose} title={`Fase 3 · ${x.codigo_expediente} · validar stock`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => validarStock(x, { entregas, motivo, recibe, autoriza, observaciones: obs, sedeReq: sede }), faltan.length ? "Entrega parcial y requerimiento enviado a Logística" : "Materiales entregados a Producción"))} className="space-y-3">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[#a1a1aa]">
            <tr>
              <th className="py-1">Material</th>
              <th>Pedido</th>
              <th>En stock</th>
              <th>Entregar</th>
            </tr>
          </thead>
          <tbody>
            {mats.map((m) => {
              const hay = disponibleDe(m, stock).cantidad;
              return (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="py-1.5 text-white">{m.nombre}</td>
                  <td>
                    {m.cantidad} {m.unidad}
                  </td>
                  <td className={hay < m.cantidad ? "text-[#FFB27A]" : "text-[#86efac]"}>{hay}</td>
                  <td className="w-28">
                    <Input type="number" min="0" max={Math.min(m.cantidad, hay)} step="any" value={entregas[m.id] ?? 0} onChange={(e) => setEntregas({ ...entregas, [m.id]: Number(e.target.value) })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={faltan.length ? "text-[13px] font-semibold text-[#FFB27A]" : "text-[13px] font-semibold text-[#86efac]"}>
          {faltan.length ? `Ruta 2 · No stock: entrega parcial y requerimiento a Logística por ${faltan.length} material(es).` : "Ruta 1 · Stock suficiente: entrega completa a Producción."}
        </p>
        <Grid>
          <Field label="Motivo del vale (va al costo del equipo)">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoRetiro)} options={opciones(motivos)} />
          </Field>
          <Field label="Recibe en Producción">
            <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} />
          </Field>
          <Field label="Autoriza">
            <Input value={autoriza} onChange={(e) => setAutoriza(e.target.value)} />
          </Field>
          {faltan.length > 0 && (
            <Field label="Sede del requerimiento">
              <Select value={sede} onChange={(e) => setSede(e.target.value)} options={opciones(ALMACENES)} />
            </Field>
          )}
        </Grid>
        <Field label={faltan.length ? "Observación de la entrega parcial (obligatoria)" : "Observaciones"}>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        <Pie onClose={onClose} ocupado={ocupado} texto={faltan.length ? "Entregar parcial y generar REQ" : "Entregar a Producción"} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Avance y horas (Producción)
export function FormAvance({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const [p, setP] = useState(String(x.datos.avances.at(-1)?.porcentaje ?? 0));
  const [nota, setNota] = useState("");
  const { ocupado, enviar } = useEnvio(onClose);
  return (
    <Modal open onClose={onClose} title={`Reporte de avance · ${x.codigo_expediente}`}>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => reportarAvance(x, num(p), nota), "Avance reportado"))} className="space-y-3">
        <Field label="Avance de fabricación %">
          <Input type="number" min="0" max="100" value={p} onChange={(e) => setP(e.target.value)} />
        </Field>
        <Field label="Qué se hizo">
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
        <Pie onClose={onClose} ocupado={ocupado} texto="Reportar" />
      </form>
    </Modal>
  );
}

export function FormHoras({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const [tipo, setTipo] = useState<"MAQUINA" | "MANO_OBRA">("MAQUINA");
  const [recurso, setRecurso] = useState<string>(RECURSOS_MAQUINA[0]);
  const [horas, setHoras] = useState("");
  const [tarifa, setTarifa] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const { ocupado, enviar } = useEnvio(onClose);
  return (
    <Modal open onClose={onClose} title={`Horas · ${x.codigo_expediente}`}>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => registrarHoras(x, { tipo, recurso, horas: num(horas), tarifa: num(tarifa), fecha }), "Horas registradas"))} className="space-y-3">
        <Grid>
          <Field label="Tipo">
            <Select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as typeof tipo;
                setTipo(t);
                setRecurso(t === "MAQUINA" ? RECURSOS_MAQUINA[0] : "");
              }}
              options={[
                { value: "MAQUINA", label: "Hora máquina" },
                { value: "MANO_OBRA", label: "Mano de obra" },
              ]}
            />
          </Field>
          <Field label={tipo === "MAQUINA" ? "Máquina" : "Trabajador / cargo"}>
            {tipo === "MAQUINA" ? <Select value={recurso} onChange={(e) => setRecurso(e.target.value)} options={opciones(RECURSOS_MAQUINA)} /> : <Input value={recurso} onChange={(e) => setRecurso(e.target.value)} />}
          </Field>
          <Field label="Horas">
            <Input type="number" min="0" step="0.25" value={horas} onChange={(e) => setHoras(e.target.value)} />
          </Field>
          <Field label="Tarifa S/ por hora">
            <Input type="number" min="0" step="0.01" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
          </Field>
          <Field label="Fecha">
            <Input type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </Grid>
        <p className="text-[12px] text-[#a1a1aa]">Costo: {soles(r2(num(horas) * num(tarifa)))}</p>
        <Pie onClose={onClose} ocupado={ocupado} texto="Registrar" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- FASE 4 · Cotización (origen de la verdad)
const cotiVacia = (): DatosCotizacion => ({
  ruc: "",
  razon_social: "",
  direccion: "",
  celular: "",
  asesor_ventas: "",
  nro_cotizacion: "",
  banco: "",
  cuenta_bancaria: "",
  cci: "",
  condicion_pago: "",
  motivo_compra: "",
  fecha_cotizacion: hoy(),
  validez_dias: 15,
  moneda: "PEN",
  subtotal: 0,
});

export function FormCotizacion({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const [d, setD] = useState<DatosCotizacion>(cotiVacia);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [sobre, setSobre] = useState(false);
  const [sunat, setSunat] = useState<RespuestaRuc | null>(null);
  const [consultando, setConsultando] = useState(false);
  const { ocupado, enviar } = useEnvio(onClose);
  const set = <K extends keyof DatosCotizacion>(k: K, v: DatosCotizacion[K]) => setD({ ...d, [k]: v });
  const tomar = (f?: File | null) => {
    if (!f) return;
    if (!TIPOS_ARCHIVO_COTI[f.type]) return toast("Formato no admitido: PDF, imagen o Excel.", "error");
    setArchivo(f);
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    tomar(e.dataTransfer.files?.[0]);
  };
  // Opción A: con el RUC, Decolecta trae razón social, dirección fiscal, estado y condición
  const consultar = async () => {
    setConsultando(true);
    try {
      const r = await validarRucDecolecta(d.ruc);
      setSunat(r);
      setD((v) => ({ ...v, razon_social: r.razon_social || v.razon_social, direccion: r.direccion || v.direccion }));
      toast(r.validado ? `RUC ${r.ruc} ACTIVO / HABIDO` : `RUC ${r.ruc}: ${r.estado} / ${r.condicion}`, r.validado ? "ok" : "error");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setConsultando(false);
    }
  };
  const sub = Number(d.subtotal) || 0;
  return (
    <Modal open onClose={onClose} title={`Fase 4 · ${x.codigo_expediente} · subir cotización del proveedor`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(async () => {
            const { aviso } = await registrarCotizacion(x, d, archivo);
            if (aviso) setTimeout(() => toast(aviso, "error"), 50);
          }, "Cotización guardada y RUC consultado en Decolecta"))} className="space-y-4">
        <label
          onDragOver={(e) => (e.preventDefault(), setSobre(true))}
          onDragLeave={() => setSobre(false)}
          onDrop={soltar}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-[13px] ${sobre ? "border-[#FF6D00] bg-[#FF6D00]/10" : "border-[#444444] bg-[#222222]"}`}
        >
          <FileUp size={26} className="text-[#FF9A4D]" />
          <span className="font-semibold text-white">{archivo ? archivo.name : "Arrastre aquí la cotización o haga clic"}</span>
          <span className="text-[#a1a1aa]">PDF, imagen o Excel · máx. 10 MB · se guarda en cotizaciones/{x.codigo_expediente}/</span>
          <input type="file" className="hidden" accept={Object.keys(TIPOS_ARCHIVO_COTI).join(",")} onChange={(e) => tomar(e.target.files?.[0])} />
        </label>

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="RUC del proveedor" hint={d.ruc && !rucValido(d.ruc.replace(/\D/g, "")) ? "RUC con dígito verificador incorrecto" : undefined}>
            <Input value={d.ruc} maxLength={11} inputMode="numeric" onChange={(e) => (set("ruc", e.target.value.replace(/\D/g, "")), setSunat(null))} />
          </Field>
          <Boton onClick={consultar} disabled={consultando || !rucValido(d.ruc)}>
            <ShieldCheck size={15} /> {consultando ? "Consultando…" : "Validar RUC con Decolecta"}
          </Boton>
        </div>
        {sunat && (
          <p className={`flex items-center gap-2 text-[13px] font-semibold ${sunat.validado ? "text-[#86efac]" : "text-[#FFB27A]"}`}>
            {sunat.validado ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {sunat.razon_social} · {sunat.estado} / {sunat.condicion}
            {!sunat.validado && " · no se podrá emitir OC"}
          </p>
        )}
        <Grid>
          <Field label="Razón social">
            <Input value={d.razon_social} onChange={(e) => set("razon_social", e.target.value)} />
          </Field>
          <Field label="Dirección">
            <Input value={d.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} />
          </Field>
          <Field label="N° de cotización">
            <Input value={d.nro_cotizacion ?? ""} onChange={(e) => set("nro_cotizacion", e.target.value)} />
          </Field>
          <Field label="Fecha de cotización">
            <Input type="date" max={hoy()} value={d.fecha_cotizacion ?? ""} onChange={(e) => set("fecha_cotizacion", e.target.value)} />
          </Field>
          <Field label="Asesor de ventas">
            <Input value={d.asesor_ventas ?? ""} onChange={(e) => set("asesor_ventas", e.target.value)} />
          </Field>
          <Field label="Celular del asesor">
            <Input value={d.celular ?? ""} inputMode="tel" onChange={(e) => set("celular", e.target.value)} />
          </Field>
          <Field label="Banco">
            <Select value={d.banco ?? ""} onChange={(e) => set("banco", e.target.value)} placeholder="Elegir" options={opciones(BANCOS_PE)} />
          </Field>
          <Field label="N° de cuenta bancaria">
            <Input value={d.cuenta_bancaria ?? ""} onChange={(e) => set("cuenta_bancaria", e.target.value)} />
          </Field>
          <Field label="CCI (20 dígitos)">
            <Input value={d.cci ?? ""} inputMode="numeric" onChange={(e) => set("cci", e.target.value)} />
          </Field>
          <Field label="Condición de pago">
            <Input value={d.condicion_pago ?? ""} onChange={(e) => set("condicion_pago", e.target.value)} placeholder="Contado, crédito 30 días…" />
          </Field>
          <Field label="Validez (días)">
            <Input type="number" min="0" value={d.validez_dias ?? ""} onChange={(e) => set("validez_dias", num(e.target.value))} />
          </Field>
          <Field label="Moneda">
            <Select value={d.moneda} onChange={(e) => set("moneda", e.target.value)} options={[{ value: "PEN", label: "Soles (S/)" }, { value: "USD", label: "Dólares (US$)" }]} />
          </Field>
          <Field label="Subtotal sin IGV">
            <Input type="number" min="0" step="0.01" value={d.subtotal || ""} onChange={(e) => set("subtotal", num(e.target.value))} />
          </Field>
          <div className="pt-6 text-[13px] text-[#d4d4d8]">
            IGV 18 %: {r2(sub * IGV).toFixed(2)} · Total: <b className="text-white">{r2(sub * (1 + IGV)).toFixed(2)}</b>
          </div>
          <Field label="Motivo de la compra" className="sm:col-span-2">
            <Input value={d.motivo_compra ?? ""} onChange={(e) => set("motivo_compra", e.target.value)} />
          </Field>
        </Grid>
        <p className="text-[12px] text-[#a1a1aa]">Al guardar, el RUC se valida otra vez con Decolecta y el resultado queda en la cotización (la app no puede marcarlo a mano).</p>
        <Pie onClose={onClose} ocupado={ocupado} texto="Guardar cotización" />
      </form>
    </Modal>
  );
}

/** Tarjeta de solo lectura con los datos que la OC hereda de la cotización. */
export function TarjetaProveedor({ c }: { c: CotizacionExp | Record<string, string | null> }) {
  const v = (k: string) => (c as Record<string, unknown>)[k] as string | null | undefined;
  return (
    <div className="rounded-lg border border-[#333333] bg-[#222222] p-3">
      <Dato k="RUC" v={v("ruc")} />
      <Dato k="Razón social" v={v("razon_social_sunat") || v("razon_social")} />
      <Dato k="Dirección" v={v("direccion_fiscal") || v("direccion")} />
      <Dato k="Asesor / celular" v={[v("asesor_ventas"), v("celular")].filter(Boolean).join(" · ")} />
      <Dato k="N° cotización" v={v("nro_cotizacion")} />
      <Dato k="Banco / cuenta" v={[v("banco"), v("cuenta_bancaria")].filter(Boolean).join(" · ")} />
      <Dato k="CCI" v={v("cci")} />
      <Dato k="Condición de pago" v={v("condicion_pago")} />
      <Dato k="SUNAT" v={[v("ruc_estado"), v("condicion_habido")].filter(Boolean).join(" / ") || "sin validar"} />
    </div>
  );
}

export function FormOC({ x, c, onClose }: { x: Expediente; c: CotizacionExp; onClose: () => void }) {
  const [motivo, setMotivo] = useState(c.motivo_compra ?? "");
  const [fecha, setFecha] = useState(hoy());
  const [plazo, setPlazo] = useState("");
  const { ocupado, enviar } = useEnvio(onClose);
  const apta = cotizacionApta(c);
  return (
    <Modal open onClose={onClose} title={`Fase 4 · ${x.codigo_expediente} · generar OC desde la cotización ${c.nro_cotizacion ?? ""}`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => generarOC(x, c.id, { motivo, fecha, plazoEntrega: plazo }), "OC generada · se avisó a Finanzas"))} className="space-y-3">
        <p className="text-[12px] text-[#a1a1aa]">Datos del proveedor heredados de la cotización (no se digitan):</p>
        <TarjetaProveedor c={c} />
        <p className="text-[13px] text-white">
          Subtotal {Number(c.subtotal).toFixed(2)} · IGV {Number(c.igv).toFixed(2)} · Total <b>{Number(c.total).toFixed(2)}</b> {c.moneda}
        </p>
        {!apta && <p className="text-[13px] font-semibold text-[#FFB27A]">{c.ruc_validado ? `Proveedor ${c.ruc_estado} / ${c.condicion_habido}: no se puede emitir OC.` : "Valide primero el RUC con Decolecta."}</p>}
        <Field label="Motivo de compra sustentado">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
        <Grid>
          <Field label="Fecha de la OC">
            <Input type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Plazo de entrega">
            <Input type="date" min={fecha} value={plazo} onChange={(e) => setPlazo(e.target.value)} />
          </Field>
        </Grid>
        <div className="mt-4 flex justify-end gap-2">
          <Boton onClick={onClose}>Cancelar</Boton>
          <Boton type="submit" lleno disabled={ocupado || !apta}>
            {ocupado ? "Guardando…" : "Generar OC"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

/** Revalidar el RUC de una cotización ya guardada. */
export async function revalidar(c: CotizacionExp): Promise<void> {
  await ejecutarAsync(() => validarRucDecolecta(c.ruc, c.id), "RUC consultado en Decolecta");
}

// ---------------------------------------------------------------- FASE 5 · Finanzas
export function FormPago({ x, oc, onClose }: { x: Expediente; oc: OrdenCompraExp; onClose: () => void }) {
  const [medio, setMedio] = useState<string>("TRANSFERENCIA DE FONDOS");
  const [banco, setBanco] = useState("");
  const [op, setOp] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [monto, setMonto] = useState(String(oc.total));
  const [voucher, setVoucher] = useState<File | null>(null);
  const { ocupado, enviar } = useEnvio(onClose);
  return (
    <Modal open onClose={onClose} title={`Fase 5 · pagar ${oc.codigo_oc} · ${x.codigo_expediente}`}>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => registrarPago(x, oc.id, { medio_pago: medio, banco, codigo_operacion: op, fecha, monto: num(monto) }, voucher), "Pago registrado · se avisó a Logística"))} className="space-y-3">
        <p className="text-[13px] text-white">
          {oc.datos_proveedor.razon_social} · Total {Number(oc.total).toFixed(2)} {oc.datos_proveedor.moneda ?? "PEN"} · CCI {oc.datos_proveedor.cci ?? "—"}
        </p>
        <Grid>
          <Field label="Medio de pago (Ley 28194)">
            <Select value={medio} onChange={(e) => setMedio(e.target.value)} options={opciones(MEDIOS_PAGO)} />
          </Field>
          <Field label="Banco">
            <Select value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Elegir" options={opciones(BANCOS_PE)} />
          </Field>
          <Field label="Código de operación">
            <Input value={op} onChange={(e) => setOp(e.target.value)} />
          </Field>
          <Field label="Fecha de pago">
            <Input type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Monto pagado">
            <Input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <Field label="Constancia / voucher">
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => setVoucher(e.target.files?.[0] ?? null)} />
          </Field>
        </Grid>
        <Pie onClose={onClose} ocupado={ocupado} texto="Registrar pago" />
      </form>
    </Modal>
  );
}

export function FormSolicitarComprobante({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const [nota, setNota] = useState("");
  const { ocupado, enviar } = useEnvio(onClose);
  return (
    <Modal open onClose={onClose} title={`Pedir comprobante a Logística · ${x.codigo_expediente}`}>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => solicitarComprobante(x, nota), "Pedido enviado a Logística"))} className="space-y-3">
        <Field label="Nota">
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Factura electrónica a nombre de la empresa…" />
        </Field>
        <Pie onClose={onClose} ocupado={ocupado} texto="Pedir comprobante" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- FASE 6 · Logística: comprobante y transporte
export function FormComprobante({ x, oc, onClose }: { x: Expediente; oc: OrdenCompraExp; onClose: () => void }) {
  const [tipo, setTipo] = useState("FACTURA");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const { ocupado, enviar } = useEnvio(onClose);
  return (
    <Modal open onClose={onClose} title={`Comprobante del proveedor · ${oc.codigo_oc}`}>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => registrarComprobante(x, oc.id, { tipo, numero, fecha }), "Comprobante registrado"))} className="space-y-3">
        <Grid>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} options={opciones(TIPOS_COMPROBANTE_COMPRA)} />
          </Field>
          <Field label="Serie y número">
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="F001-00000123" />
          </Field>
          <Field label="Fecha de emisión">
            <Input type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </Grid>
        <p className="text-[12px] text-[#a1a1aa]">La consulta del CDR en SUNAT / OSE se conectará cuando se confirme el OSE (variable OSE_PROVIDER).</p>
        <Pie onClose={onClose} ocupado={ocupado} texto="Registrar comprobante" />
      </form>
    </Modal>
  );
}

export function FormTransporte({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const [t, setT] = useState({ sinFlete: false, empresa: "", ruc: "", guiaRemitente: "", guiaTransportista: "", ticket: "", placa: "", costoFlete: 0, facturaFlete: "", fechaEntrega: hoy() });
  const { ocupado, enviar } = useEnvio(onClose);
  const set = (k: keyof typeof t, v: string | number | boolean) => setT({ ...t, [k]: v });
  return (
    <Modal open onClose={onClose} title={`Fase 6 · ${x.codigo_expediente} · transporte`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => registrarTransporte(x, t), "Transporte registrado · se avisó a Almacén y Producción"))} className="space-y-3">
        <label className="flex items-center gap-2 text-[13px] text-white">
          <input type="checkbox" checked={t.sinFlete} onChange={(e) => set("sinFlete", e.target.checked)} /> Sin flete: el proveedor entrega directo en planta
        </label>
        {!t.sinFlete && (
          <Grid>
            <Field label="Empresa de transportes">
              <Input value={t.empresa} onChange={(e) => set("empresa", e.target.value)} />
            </Field>
            <Field label="RUC del transportista" hint={t.ruc && !rucValido(t.ruc) ? "RUC con dígito verificador incorrecto" : undefined}>
              <Input value={t.ruc} maxLength={11} inputMode="numeric" onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="N° guía de remisión remitente">
              <Input value={t.guiaRemitente} onChange={(e) => set("guiaRemitente", e.target.value)} />
            </Field>
            <Field label="N° guía del transportista">
              <Input value={t.guiaTransportista} onChange={(e) => set("guiaTransportista", e.target.value)} />
            </Field>
            <Field label="N° de ticket">
              <Input value={t.ticket} onChange={(e) => set("ticket", e.target.value)} />
            </Field>
            <Field label="Placa">
              <Input value={t.placa} onChange={(e) => set("placa", e.target.value)} />
            </Field>
            <Field label="Costo del flete S/ (sin IGV)">
              <Input type="number" min="0" step="0.01" value={t.costoFlete || ""} onChange={(e) => set("costoFlete", num(e.target.value))} />
            </Field>
            <Field label="Factura del transporte">
              <Input value={t.facturaFlete} onChange={(e) => set("facturaFlete", e.target.value)} />
            </Field>
            <Field label="Fecha de entrega del transportista">
              <Input type="date" value={t.fechaEntrega} onChange={(e) => set("fechaEntrega", e.target.value)} />
            </Field>
          </Grid>
        )}
        <Pie onClose={onClose} ocupado={ocupado} texto="Registrar transporte" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- FASE 7 · Almacén recepciona
export function FormActaCompleta({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const [recibe, setRecibe] = useState(x.datos.actaParcial?.recibe ?? "");
  const [obs, setObs] = useState("");
  const { ocupado, enviar } = useEnvio(onClose);
  const faltan = (x.datos.actaParcial?.lineas ?? []).filter((l) => l.entregado < l.pedido);
  return (
    <Modal open onClose={onClose} title={`Fase 7 · ${x.codigo_expediente} · Acta de Entrega Completa`}>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => actaEntregaCompleta(x, { recibe, observaciones: obs }), "Acta completa registrada · se avisó a Producción"))} className="space-y-3">
        <p className="text-[13px] text-[#d4d4d8]">Se entrega lo que faltaba: {faltan.map((l) => `${r2(l.pedido - l.entregado)} ${l.unidad} ${l.nombre}`).join(" · ") || "—"}</p>
        <p className="text-[12px] text-[#a1a1aa]">Registre antes el ingreso al stock en Almacén › Ingresos y el retiro con vale, para que el costo entre al equipo.</p>
        <Field label="Recibe en Producción">
          <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} />
        </Field>
        <Field label="Observaciones de la recepción">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        <Pie onClose={onClose} ocupado={ocupado} texto="Registrar acta" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- FASE 8 · Producción cierra
export function FormCierre({ x, onClose }: { x: Expediente; onClose: () => void }) {
  const s = useExpedientes();
  const detalles = x.es_lote_mixto ? docsDe(x, s).detalles : [];
  // Lote mixto: una fila por unidad (chasis y N° de serie), agrupadas por equipo del lote
  const [unidades, setUnidades] = useState<UnidadPT[]>(() => detalles.flatMap((e) => Array.from({ length: e.cantidad }, (_, k) => ({ detalleId: e.id, modelo: e.modelo, chasis: e.unidades[k]?.chasis ?? "", serie: e.unidades[k]?.serie ?? "" }))));
  const setUnidad = (i: number, k: "chasis" | "serie", v: string) => setUnidades(unidades.map((u, j) => (j === i ? { ...u, [k]: v.toUpperCase() } : u)));
  const [serie, setSerie] = useState("");
  const [zona, setZona] = useState<(typeof ZONAS_PT)[number]>("A1");
  const [check, setCheck] = useState<Record<string, boolean>>(() => Object.fromEntries(CHECKLIST_QC.map((c) => [c, false])));
  const [recibe, setRecibe] = useState("");
  const [obs, setObs] = useState("");
  const { ocupado, enviar } = useEnvio(onClose);
  return (
    <Modal open onClose={onClose} title={`Fase 8 · ${x.codigo_expediente} · Acta de Entrega PT a Almacén`} wide>
      <form onSubmit={(e) => (e.preventDefault(), enviar(() => cerrarExpediente(x, { numeroSerie: serie, zona, checklist: check, recibe, observaciones: obs, unidades }), "Acta PT registrada"))} className="space-y-3">
        {x.es_lote_mixto && (
          <fieldset className="space-y-1">
            <legend className="mb-1 text-[12px] font-semibold uppercase text-[#FF9A4D]">Chasis y N° de serie por unidad ({unidades.length})</legend>
            <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {unidades.map((u, i) => (
                <div key={i} className="grid items-center gap-2 sm:grid-cols-[150px_1fr_1fr]">
                  <span className="text-[13px] text-[#d4d4d8]">
                    {u.modelo} · unidad {unidades.slice(0, i + 1).filter((v) => v.detalleId === u.detalleId).length}
                  </span>
                  <Input value={u.chasis} onChange={(e) => setUnidad(i, "chasis", e.target.value)} placeholder="Código de chasis" aria-label={`Chasis ${u.modelo} ${i + 1}`} />
                  <Input value={u.serie} onChange={(e) => setUnidad(i, "serie", e.target.value)} placeholder="N° de serie" aria-label={`Serie ${u.modelo} ${i + 1}`} />
                </div>
              ))}
            </div>
          </fieldset>
        )}
        <Grid>
          {!x.es_lote_mixto && (
            <Field label="N° de serie del equipo">
              <Input value={serie} onChange={(e) => setSerie(e.target.value)} />
            </Field>
          )}
          <Field label="Zona de almacén PT">
            <Select value={zona} onChange={(e) => setZona(e.target.value as typeof zona)} options={opciones(ZONAS_PT)} />
          </Field>
          <Field label="Recibe en Almacén">
            <Input value={recibe} onChange={(e) => setRecibe(e.target.value)} />
          </Field>
        </Grid>
        <fieldset className="grid gap-1 sm:grid-cols-2">
          <legend className="mb-1 text-[12px] font-semibold uppercase text-[#FF9A4D]">Control de calidad</legend>
          {CHECKLIST_QC.map((c) => (
            <label key={c} className="flex items-center gap-2 text-[13px] text-white">
              <input type="checkbox" checked={check[c]} onChange={(e) => setCheck({ ...check, [c]: e.target.checked })} /> {c}
            </label>
          ))}
        </fieldset>
        <Field label="Observaciones">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        <p className="text-[12px] text-[#a1a1aa]">
          {x.es_lote_mixto
            ? "Lote mixto: con todas las series y el control de calidad completo, el acta PT cierra el expediente."
            : "El QC firmado del supervisor se hace en Producción › QC: crea el equipo terminado en almacén y cierra el expediente."}
        </p>
        <Pie onClose={onClose} ocupado={ocupado} texto="Registrar acta PT" />
      </form>
    </Modal>
  );
}
