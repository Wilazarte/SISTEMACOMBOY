"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, FileDown, FileText, HandHelping, Laptop, Pencil, Plus, Search, Trash2, Undo2, Wrench, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar } from "@/components/ui";
import { FiltrosPlegables } from "@/components/ui/BotonFiltros";
import {
  CATEGORIAS_ACTIVO,
  CONDICIONES,
  DIAS_AVISO_MANTENIMIENTO,
  ESTADOS_ACTIVO,
  MOTIVOS_BAJA,
  SEDES_ACTIVO,
  activoVacio,
  avisoMantenimiento,
  cuadroDepreciacion,
  darDeBaja,
  depreciacion,
  eliminarActivo,
  guardarActivo,
  mantenimientosPendientes,
  nombreCategoria,
  normalizarActivo,
  puedeEditarActivos,
  registrarDevolucion,
  registrarEntrega,
  registrarMantenimiento,
  tasaCategoria,
  totalesActivos,
  type Activo,
  type DatosActivo,
  type DatosEntrega,
  type DatosMantenimiento,
} from "@/lib/activos";
import { pdfFichaEntregaActivo, pdfHojaVidaActivo } from "@/lib/pdf";
import { KEYS, enSucursal, fechaPE, hoy, soles, useStore } from "@/lib/storage";
import type { Trabajador } from "@/lib/types";
import { guardarExcel } from "@/lib/guardarArchivo";

const SEC = "Sucursal Secocha";
const sedesFormulario = (): string[] => (enSucursal() ? [SEC] : [...SEDES_ACTIVO]);

function MantBadge({ a }: { a: Activo }) {
  const m = avisoMantenimiento(a);
  if (m.estado === "SIN_PROGRAMA") return <span className="text-xs text-plomo-500">{a.estado === "BAJA" ? "-" : "Sin programa"}</span>;
  const cls =
    m.estado === "VENCIDO" ? "bg-red-50 text-vino ring-red-200" : m.estado === "PROXIMO" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200";
  const txt = m.estado === "VENCIDO" ? `Vencido hace ${-m.dias} d` : m.dias === 0 ? "Hoy" : `${fechaPE(a.proximoMantenimiento)}${m.estado === "PROXIMO" ? ` · ${m.dias} d` : ""}`;
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", cls)}>{txt}</span>;
}

function Stat({ label, valor, detalle }: { label: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-plomo-200 bg-surface px-4 py-3 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-plomo-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-fg">{valor}</p>
      {detalle && <p className="text-xs text-plomo-500">{detalle}</p>}
    </div>
  );
}

/**
 * Finanzas › Contabilidad › Activos de la empresa (Williams 2026-11-17): registro de computadoras, celulares, muebles,
 * vehículos, herramientas… con categoría, ubicación, responsable (ficha de entrega en PDF con firma y huella),
 * mantenimientos con aviso, costo de compra, depreciación lineal (cuadro por año) y baja.
 */
export function ActivosEmpresa() {
  const activos = useStore<Activo[]>(KEYS.ACTIVOS, []).map(normalizarActivo);
  const trabajadores = useStore<Trabajador[]>(KEYS.TRABAJADORES, []);
  const puede = puedeEditarActivos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sede, setSede] = useState("");
  const [estado, setEstado] = useState("VIGENTES");
  const [form, setForm] = useState<{ datos: DatosActivo; id?: string } | null>(null);
  const [ver, setVer] = useState<string | null>(null);

  const t = q.trim().toUpperCase();
  const lista = activos
    .filter((a) => (!cat || a.categoria === cat) && (!sede || a.sede === sede))
    .filter((a) => (estado === "VIGENTES" ? a.estado !== "BAJA" : !estado || a.estado === estado))
    .filter((a) => !t || [a.codigo, a.nombre, a.marca, a.modelo, a.serie, a.responsable, a.area].some((v) => v.toUpperCase().includes(t)))
    .sort((a, b) => b.codigo.localeCompare(a.codigo, "es", { numeric: true }));
  const tot = totalesActivos(activos);
  const pend = mantenimientosPendientes(activos);
  const sel = activos.find((a) => a.id === ver) ?? null;

  useEffect(() => {
    if (puede && new URLSearchParams(window.location.search).get("nuevo") === "1") setForm({ datos: activoVacio() });
  }, [puede]);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = lista.map((a) => {
      const d = depreciacion(a);
      return {
        Código: a.codigo,
        Activo: a.nombre,
        Categoría: nombreCategoria(a.categoria),
        Marca: a.marca,
        Modelo: a.modelo,
        Serie: a.serie,
        Sede: a.sede,
        Área: a.area,
        Responsable: a.responsable,
        Estado: ESTADOS_ACTIVO.find((e) => e.id === a.estado)?.nombre ?? a.estado,
        "Fecha compra": a.fechaCompra,
        Proveedor: a.proveedor,
        Comprobante: a.comprobante,
        "Costo (S/)": a.costo,
        "Tasa anual %": a.tasaAnual,
        "Dep. mensual": d.mensual,
        "Dep. acumulada": d.acumulada,
        "Valor en libros": d.valorLibros,
        "Próximo mantenimiento": a.proximoMantenimiento,
      };
    });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Activos");
    await guardarExcel(libro, `Registro-activos-${hoy()}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Activos vigentes" valor={String(tot.cantidad)} detalle={`${activos.length - tot.cantidad} de baja`} />
        <Stat label="Costo de compra" valor={soles(tot.costo)} />
        <Stat label="Depreciación acumulada" valor={soles(tot.acumulada)} />
        <Stat label="Valor en libros" valor={soles(tot.valorLibros)} />
        <Stat label="Depreciación del mes" valor={soles(tot.mensual)} detalle="Método lineal" />
      </div>

      {pend.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} /> {pend.length} activo(s) con mantenimiento vencido o en los próximos {DIAS_AVISO_MANTENIMIENTO} días
          </p>
          <ul className="mt-1 space-y-0.5">
            {pend.slice(0, 5).map(({ activo, estado: e, dias }) => (
              <li key={activo.id}>
                <button className="text-left underline-offset-2 hover:underline" onClick={() => setVer(activo.id)}>
                  {activo.codigo} · {activo.nombre} · {e === "VENCIDO" ? `vencido hace ${-dias} día(s)` : dias === 0 ? "hoy" : `en ${dias} día(s)`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader
          title="Activos de la empresa"
          subtitle="Computadoras, celulares, muebles, vehículos, herramientas… con responsable, mantenimiento y depreciación."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <FiltrosPlegables activos={[q, cat, sede, estado !== "VIGENTES" ? estado : ""].filter(Boolean).length}>
                <div className="relative w-60">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
                  <Input placeholder="Código, nombre, serie, responsable…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
                </div>
                <div className="w-48">
                  <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Todas las categorías" options={CATEGORIAS_ACTIVO.map((c) => ({ value: c.id, label: nombreCategoria(c.id) }))} aria-label="Categoría" />
                </div>
                {!enSucursal() && (
                  <div className="w-44">
                    <Select value={sede} onChange={(e) => setSede(e.target.value)} placeholder="Todas las sedes" options={SEDES_ACTIVO.map((s) => ({ value: s, label: s }))} aria-label="Sede" />
                  </div>
                )}
                <div className="w-44">
                  <Select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    placeholder="Todos (incluye bajas)"
                    options={[{ value: "VIGENTES", label: "Vigentes" }, ...ESTADOS_ACTIVO.map((e) => ({ value: e.id, label: e.nombre }))]}
                    aria-label="Estado"
                  />
                </div>
              </FiltrosPlegables>
              <Button variant="secondary" onClick={() => void exportar()} disabled={!lista.length}>
                <FileDown size={16} /> Excel
              </Button>
              {puede && (
                <Button onClick={() => setForm({ datos: activoVacio() })}>
                  <Plus size={16} /> Nuevo activo
                </Button>
              )}
            </div>
          }
        />
        {lista.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Laptop size={28} />} text={activos.length ? "Ningún activo coincide con los filtros." : "Aún no hay activos registrados. Use «Nuevo activo» para registrar el primero."} />
          </div>
        ) : (
          <Table head={["Código", "Activo", "Categoría", "Ubicación", "Responsable", "Costo", "Dep. acumulada", "Valor en libros", "Mantenimiento", "Estado"]}>
            {lista.map((a) => {
              const d = depreciacion(a);
              return (
                <tr key={a.id} className="cursor-pointer hover:bg-plomo-50" onClick={() => setVer(a.id)} title="Ver ficha del activo">
                  <Td className="whitespace-nowrap text-xs font-semibold text-fg">{a.codigo}</Td>
                  <Td>
                    <p className="font-semibold text-fg">{a.nombre}</p>
                    <p className="text-xs text-plomo-500">{[a.marca, a.modelo, a.serie && `S/N ${a.serie}`].filter(Boolean).join(" · ")}</p>
                  </Td>
                  <Td className="text-xs">{nombreCategoria(a.categoria)}</Td>
                  <Td>
                    <p>{a.sede}</p>
                    {a.area && <p className="text-xs text-plomo-500">{a.area}</p>}
                  </Td>
                  <Td>{a.responsable || <span className="text-xs text-plomo-500">Sin asignar</span>}</Td>
                  <Td className="whitespace-nowrap text-right">{soles(a.costo)}</Td>
                  <Td className="whitespace-nowrap text-right">{soles(d.acumulada)}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold">{soles(d.valorLibros)}</Td>
                  <Td>
                    <MantBadge a={a} />
                  </Td>
                  <Td>
                    <Badge estado={a.estado} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <p className="text-xs text-plomo-500">
        Depreciación lineal desde el mes en que el bien se empieza a usar, con las tasas máximas de referencia del art. 22 del Reglamento de la Ley del
        Impuesto a la Renta (cómputo 25 %, vehículos 20 %, maquinaria y demás bienes 10 %, edificaciones 5 %). Cada activo puede llevar su propia tasa: valídelas
        con el contador.
      </p>

      {form && <FormActivo inicial={form.datos} id={form.id} onClose={() => setForm(null)} onGuardado={(id) => setVer(id)} />}
      {sel && (
        <DetalleActivo
          a={sel}
          puede={puede}
          trabajadores={trabajadores}
          onClose={() => setVer(null)}
          onEditar={() => {
            const { id, ...datos } = sel;
            setForm({ datos: datos as DatosActivo, id });
            setVer(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Formulario

function FormActivo({ inicial, id, onClose, onGuardado }: { inicial: DatosActivo; id?: string; onClose: () => void; onGuardado: (id: string) => void }) {
  const [d, setD] = useState<DatosActivo>(inicial);
  const set = <K extends keyof DatosActivo>(k: K, v: DatosActivo[K]) => setD((x) => ({ ...x, [k]: v }));
  const prev = useMemo(() => depreciacion({ ...d, baja: undefined }), [d]);
  const guardar = () => {
    let nuevo = "";
    if (ejecutar(() => (nuevo = guardarActivo(d, id).id), id ? "Activo actualizado" : "Activo registrado")) {
      onClose();
      onGuardado(nuevo);
    }
  };
  return (
    <Modal open onClose={onClose} title={id ? "Editar activo" : "Nuevo activo"} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nombre del activo *" className="sm:col-span-2">
          <Input value={d.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. LAPTOP LENOVO THINKPAD E14" autoFocus />
        </Field>
        <Field label="Categoría">
          <Select
            value={d.categoria}
            onChange={(e) => setD((x) => ({ ...x, categoria: e.target.value as DatosActivo["categoria"], tasaAnual: tasaCategoria(e.target.value) }))}
            options={CATEGORIAS_ACTIVO.map((c) => ({ value: c.id, label: `${nombreCategoria(c.id)} (${c.tasa} %)` }))}
          />
        </Field>
        <Field label="Marca">
          <Input value={d.marca} onChange={(e) => set("marca", e.target.value)} />
        </Field>
        <Field label="Modelo">
          <Input value={d.modelo} onChange={(e) => set("modelo", e.target.value)} />
        </Field>
        <Field label="N° de serie / IMEI / placa">
          <Input value={d.serie} onChange={(e) => set("serie", e.target.value)} />
        </Field>
        <Field label="Ubicación (sede) *">
          <Select value={d.sede} onChange={(e) => set("sede", e.target.value)} options={sedesFormulario().map((s) => ({ value: s, label: s }))} />
        </Field>
        <Field label="Área / lugar" hint="Ej. Oficina de Tesorería, Taller de soldadura">
          <Input value={d.area} onChange={(e) => set("area", e.target.value)} />
        </Field>
        <Field label="Estado">
          <Select value={d.estado} onChange={(e) => set("estado", e.target.value as DatosActivo["estado"])} options={ESTADOS_ACTIVO.filter((x) => x.id !== "BAJA").map((x) => ({ value: x.id, label: x.nombre }))} />
        </Field>

        <p className="pt-2 text-xs font-bold uppercase tracking-wider text-plomo-500 sm:col-span-3">Compra</p>
        <Field label="Fecha de compra *">
          <Input type="date" value={d.fechaCompra} max={hoy()} onChange={(e) => set("fechaCompra", e.target.value)} />
        </Field>
        <Field label="Costo de compra S/ (sin IGV) *">
          <Input type="number" min={0} step="0.01" value={d.costo || ""} onChange={(e) => set("costo", Number(e.target.value))} />
        </Field>
        <Field label="Condición">
          <Select value={d.condicion} onChange={(e) => set("condicion", e.target.value)} options={CONDICIONES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Proveedor">
          <Input value={d.proveedor} onChange={(e) => set("proveedor", e.target.value)} />
        </Field>
        <Field label="Comprobante (factura / boleta)">
          <Input value={d.comprobante} onChange={(e) => set("comprobante", e.target.value)} placeholder="F001-00012345" />
        </Field>
        <Field label="Inicio de uso" hint="Vacío = fecha de compra">
          <Input type="date" value={d.fechaUso} min={d.fechaCompra} onChange={(e) => set("fechaUso", e.target.value)} />
        </Field>

        <p className="pt-2 text-xs font-bold uppercase tracking-wider text-plomo-500 sm:col-span-3">Depreciación y mantenimiento</p>
        <Field label="Tasa de depreciación anual %" hint="Sugerida por la categoría; la valida el contador">
          <Input type="number" min={0} max={100} step="0.01" value={d.tasaAnual} onChange={(e) => set("tasaAnual", Number(e.target.value))} />
        </Field>
        <Field label="Valor residual S/">
          <Input type="number" min={0} step="0.01" value={d.valorResidual || ""} onChange={(e) => set("valorResidual", Number(e.target.value))} />
        </Field>
        <div className="rounded-lg bg-plomo-50 px-3 py-2 text-xs text-plomo-600">
          <p>
            Vida útil: <b>{prev.vidaUtilMeses ? `${prev.vidaUtilMeses} meses` : "-"}</b> · mensual <b>{soles(prev.mensual)}</b>
          </p>
          <p>
            Hoy: acumulada <b>{soles(prev.acumulada)}</b> · en libros <b>{soles(prev.valorLibros)}</b>
          </p>
        </div>
        <Field label="Mantenimiento cada (meses)" hint="0 = sin programa">
          <Input type="number" min={0} step="1" value={d.frecuenciaMantMeses || ""} onChange={(e) => set("frecuenciaMantMeses", Number(e.target.value))} />
        </Field>
        <Field label="Próximo mantenimiento" hint="Vacío = se calcula con la frecuencia">
          <Input type="date" value={d.proximoMantenimiento} onChange={(e) => set("proximoMantenimiento", e.target.value)} />
        </Field>
        <Field label="Observaciones" className="sm:col-span-3">
          <Textarea rows={2} value={d.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar}>{id ? "Guardar cambios" : "Registrar activo"}</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Detalle

type Accion = "entrega" | "devolucion" | "mantenimiento" | "baja" | null;

function DetalleActivo({ a, puede, trabajadores, onClose, onEditar }: { a: Activo; puede: boolean; trabajadores: Trabajador[]; onClose: () => void; onEditar: () => void }) {
  const d = depreciacion(a);
  const cuadro = cuadroDepreciacion(a);
  const [accion, setAccion] = useState<Accion>(null);
  const vigente = a.estado !== "BAJA";
  const dato = (k: string, v: string) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-plomo-500">{k}</p>
      <p className="text-sm text-fg">{v || "-"}</p>
    </div>
  );
  return (
    <Modal open onClose={onClose} title={`${a.codigo} · ${a.nombre}`} wide>
      <div className="flex flex-wrap items-center gap-2">
        <Badge estado={a.estado} />
        <MantBadge a={a} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => pdfHojaVidaActivo(a)}>
            <FileText size={15} /> Hoja de vida PDF
          </Button>
          {puede && vigente && (
            <>
              <Button variant="secondary" onClick={onEditar}>
                <Pencil size={15} /> Editar
              </Button>
              <Button onClick={() => setAccion("entrega")}>
                <HandHelping size={15} /> Ficha de entrega
              </Button>
              {a.responsable && (
                <Button variant="secondary" onClick={() => setAccion("devolucion")}>
                  <Undo2 size={15} /> Devolución
                </Button>
              )}
              <Button variant="secondary" onClick={() => setAccion("mantenimiento")}>
                <Wrench size={15} /> Mantenimiento
              </Button>
              <Button variant="secondary" onClick={() => setAccion("baja")}>
                <XCircle size={15} /> Dar de baja
              </Button>
            </>
          )}
          {puede && !a.entregas.length && !a.mantenimientos.length && (
            <Button
              variant="secondary"
              onClick={() => {
                if (window.confirm(`¿Eliminar ${a.codigo}? Úselo solo si se registró por error.`) && ejecutar(() => eliminarActivo(a.id), "Activo eliminado")) onClose();
              }}
            >
              <Trash2 size={15} /> Eliminar
            </Button>
          )}
        </div>
      </div>

      {accion === "entrega" && <FormEntrega a={a} trabajadores={trabajadores} onClose={() => setAccion(null)} />}
      {accion === "devolucion" && <FormDevolucion a={a} onClose={() => setAccion(null)} />}
      {accion === "mantenimiento" && <FormMantenimiento a={a} onClose={() => setAccion(null)} />}
      {accion === "baja" && <FormBaja a={a} onClose={() => setAccion(null)} />}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {dato("Categoría", nombreCategoria(a.categoria))}
        {dato("Marca / modelo", [a.marca, a.modelo].filter(Boolean).join(" "))}
        {dato("N° de serie", a.serie)}
        {dato("Ubicación", [a.sede, a.area].filter(Boolean).join(" · "))}
        {dato("Responsable", a.responsable ? `${a.responsable}${a.responsableCargo ? ` · ${a.responsableCargo}` : ""}` : "Sin asignar")}
        {dato("Condición", a.condicion)}
        {dato("Compra", `${fechaPE(a.fechaCompra)}${a.proveedor ? ` · ${a.proveedor}` : ""}`)}
        {dato("Comprobante", a.comprobante)}
      </div>
      {a.baja && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-vino">
          De baja el {fechaPE(a.baja.fecha)}: {a.baja.motivo}
          {a.baja.detalle && ` · ${a.baja.detalle}`}
          {a.baja.valorVenta > 0 && ` · vendido en ${soles(a.baja.valorVenta)}`} ({a.baja.registradoPor})
        </p>
      )}
      {a.observaciones && <p className="mt-3 text-sm text-plomo-600">{a.observaciones}</p>}

      <h4 className="mt-5 text-sm font-semibold text-fg">Depreciación (lineal)</h4>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Costo" valor={soles(a.costo)} />
        <Stat label="Tasa / vida útil" valor={`${a.tasaAnual} %`} detalle={d.vidaUtilMeses ? `${d.vidaUtilMeses} meses · hasta ${d.fin}` : "No se deprecia"} />
        <Stat label="Mensual" valor={soles(d.mensual)} />
        <Stat label="Acumulada" valor={soles(d.acumulada)} detalle={`${d.meses} mes(es) · ${d.avance} %`} />
        <Stat label="Valor en libros" valor={soles(d.valorLibros)} />
      </div>
      {cuadro.length > 0 && (
        <div className="mt-2">
          <Table head={["Año", "Meses", "Depreciación del año", "Acumulada", "Valor en libros"]}>
            {cuadro.map((f) => (
              <tr key={f.anio} className={cn(String(f.anio) === hoy().slice(0, 4) && "bg-plomo-50 font-semibold")}>
                <Td>{f.anio}</Td>
                <Td>{f.meses}</Td>
                <Td className="text-right">{soles(f.depreciacion)}</Td>
                <Td className="text-right">{soles(f.acumulada)}</Td>
                <Td className="text-right">{soles(f.valorLibros)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <h4 className="mt-5 text-sm font-semibold text-fg">Fichas de entrega</h4>
      {a.entregas.length === 0 ? (
        <p className="mt-1 text-sm text-plomo-500">Aún no se entregó a ningún responsable.</p>
      ) : (
        <Table head={["Ficha", "Fecha", "Responsable", "Cargo", "Condición", "Devuelto", ""]}>
          {[...a.entregas].reverse().map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap text-xs font-semibold">{e.numero}</Td>
              <Td>{fechaPE(e.fecha)}</Td>
              <Td>{e.responsable}</Td>
              <Td>{e.cargo || "-"}</Td>
              <Td>{e.condicion}</Td>
              <Td>{e.devuelto ? `${fechaPE(e.devuelto)}${e.condicionDevolucion ? ` · ${e.condicionDevolucion}` : ""}` : <span className="font-semibold text-emerald-700">Vigente</span>}</Td>
              <Td>
                <Button variant="secondary" onClick={() => pdfFichaEntregaActivo(a, e)}>
                  <ArrowDownToLine size={14} /> PDF
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <h4 className="mt-5 text-sm font-semibold text-fg">Mantenimientos</h4>
      {a.mantenimientos.length === 0 ? (
        <p className="mt-1 text-sm text-plomo-500">Sin mantenimientos registrados.</p>
      ) : (
        <Table head={["Fecha", "Tipo", "Detalle", "Proveedor / técnico", "Costo"]}>
          {a.mantenimientos.map((m) => (
            <tr key={m.id}>
              <Td>{fechaPE(m.fecha)}</Td>
              <Td className="text-xs font-semibold">{m.tipo}</Td>
              <Td>{m.detalle}</Td>
              <Td>{m.proveedor || "-"}</Td>
              <Td className="text-right">{soles(m.costo)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}

function Panel({ titulo, children, onClose, onOk, ok }: { titulo: string; children: React.ReactNode; onClose: () => void; onOk: () => void; ok: string }) {
  return (
    <div className="mt-4 rounded-xl border border-plomo-200 bg-plomo-50 p-4">
      <p className="mb-3 text-sm font-semibold text-fg">{titulo}</p>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={onOk}>{ok}</Button>
      </div>
    </div>
  );
}

function FormEntrega({ a, trabajadores, onClose }: { a: Activo; trabajadores: Trabajador[]; onClose: () => void }) {
  const [d, setD] = useState<DatosEntrega>({ fecha: hoy(), responsable: "", dni: "", cargo: "", sede: a.sede, condicion: a.condicion, accesorios: "", observaciones: "" });
  const activos = trabajadores.filter((x) => x.activo !== false);
  const elegir = (nombre: string) => {
    const w = activos.find((x) => x.nombre.toUpperCase() === nombre.trim().toUpperCase());
    setD((x) => ({ ...x, responsable: nombre, ...(w ? { dni: w.dni || x.dni, cargo: w.cargo || x.cargo } : {}) }));
  };
  const ok = () => {
    let r: ReturnType<typeof registrarEntrega> | null = null;
    if (ejecutar(() => (r = registrarEntrega(a.id, d)), "Ficha de entrega registrada")) {
      onClose();
      const res = r as ReturnType<typeof registrarEntrega> | null;
      if (res) pdfFichaEntregaActivo(res.activo, res.entrega);
    }
  };
  return (
    <Panel titulo={a.responsable ? `Nueva ficha de entrega (la de ${a.responsable} quedará devuelta)` : "Ficha de entrega al responsable"} onClose={onClose} onOk={ok} ok="Registrar y ver PDF">
      <Field label="Responsable *" hint="Elija un trabajador o escriba el nombre">
        <Input list="activos-trabajadores" value={d.responsable} onChange={(e) => elegir(e.target.value)} />
        <datalist id="activos-trabajadores">
          {activos.map((w) => (
            <option key={w.id} value={w.nombre} />
          ))}
        </datalist>
      </Field>
      <Field label="DNI">
        <Input value={d.dni} inputMode="numeric" onChange={(e) => setD({ ...d, dni: e.target.value })} />
      </Field>
      <Field label="Cargo">
        <Input value={d.cargo} onChange={(e) => setD({ ...d, cargo: e.target.value })} />
      </Field>
      <Field label="Fecha de entrega">
        <Input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
      </Field>
      <Field label="Sede">
        <Select value={d.sede} onChange={(e) => setD({ ...d, sede: e.target.value })} options={sedesFormulario().map((s) => ({ value: s, label: s }))} />
      </Field>
      <Field label="Estado del bien">
        <Select value={d.condicion} onChange={(e) => setD({ ...d, condicion: e.target.value })} options={CONDICIONES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <Field label="Accesorios (uno por línea o separados por coma)" className="sm:col-span-2">
        <Textarea rows={2} value={d.accesorios} onChange={(e) => setD({ ...d, accesorios: e.target.value })} placeholder="Cargador, mouse, maletín, chip claro…" />
      </Field>
      <Field label="Observaciones">
        <Textarea rows={2} value={d.observaciones} onChange={(e) => setD({ ...d, observaciones: e.target.value })} />
      </Field>
    </Panel>
  );
}

function FormDevolucion({ a, onClose }: { a: Activo; onClose: () => void }) {
  const [fecha, setFecha] = useState(hoy());
  const [condicion, setCondicion] = useState(a.condicion);
  return (
    <Panel titulo={`Devolución de ${a.responsable}`} onClose={onClose} onOk={() => ejecutar(() => registrarDevolucion(a.id, fecha, condicion), "Devolución registrada") && onClose()} ok="Registrar devolución">
      <Field label="Fecha">
        <Input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <Field label="Estado al devolver">
        <Select value={condicion} onChange={(e) => setCondicion(e.target.value)} options={CONDICIONES.map((c) => ({ value: c, label: c }))} />
      </Field>
    </Panel>
  );
}

function FormMantenimiento({ a, onClose }: { a: Activo; onClose: () => void }) {
  const [d, setD] = useState<DatosMantenimiento>({ fecha: hoy(), tipo: "PREVENTIVO", detalle: "", proveedor: "", costo: 0, proximo: "" });
  return (
    <Panel titulo="Registrar mantenimiento realizado" onClose={onClose} onOk={() => ejecutar(() => registrarMantenimiento(a.id, d), "Mantenimiento registrado") && onClose()} ok="Registrar">
      <Field label="Fecha">
        <Input type="date" value={d.fecha} max={hoy()} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
      </Field>
      <Field label="Tipo">
        <Select value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as DatosMantenimiento["tipo"] })} options={[{ value: "PREVENTIVO", label: "Preventivo" }, { value: "CORRECTIVO", label: "Correctivo (reparación)" }]} />
      </Field>
      <Field label="Costo S/">
        <Input type="number" min={0} step="0.01" value={d.costo || ""} onChange={(e) => setD({ ...d, costo: Number(e.target.value) })} />
      </Field>
      <Field label="Trabajo realizado *" className="sm:col-span-2">
        <Input value={d.detalle} onChange={(e) => setD({ ...d, detalle: e.target.value })} placeholder="Limpieza interna, cambio de pasta térmica…" />
      </Field>
      <Field label="Proveedor / técnico">
        <Input value={d.proveedor} onChange={(e) => setD({ ...d, proveedor: e.target.value })} />
      </Field>
      <Field label="Próximo mantenimiento" hint={a.frecuenciaMantMeses ? `Vacío = en ${a.frecuenciaMantMeses} mes(es)` : "Vacío = sin programar"}>
        <Input type="date" value={d.proximo} min={d.fecha} onChange={(e) => setD({ ...d, proximo: e.target.value })} />
      </Field>
    </Panel>
  );
}

function FormBaja({ a, onClose }: { a: Activo; onClose: () => void }) {
  const [d, setD] = useState({ fecha: hoy(), motivo: "", detalle: "", valorVenta: 0 });
  return (
    <Panel titulo={`Dar de baja ${a.codigo} (no se puede deshacer)`} onClose={onClose} onOk={() => ejecutar(() => darDeBaja(a.id, d), "Activo dado de baja") && onClose()} ok="Dar de baja">
      <Field label="Fecha de baja">
        <Input type="date" value={d.fecha} min={a.fechaCompra} max={hoy()} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
      </Field>
      <Field label="Motivo *">
        <Select value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} placeholder="Elegir…" options={MOTIVOS_BAJA.map((m) => ({ value: m, label: m }))} />
      </Field>
      <Field label="Valor de venta S/" hint="Solo si se vendió">
        <Input type="number" min={0} step="0.01" value={d.valorVenta || ""} onChange={(e) => setD({ ...d, valorVenta: Number(e.target.value) })} />
      </Field>
      <Field label="Detalle" className="sm:col-span-3">
        <Textarea rows={2} value={d.detalle} onChange={(e) => setD({ ...d, detalle: e.target.value })} placeholder="Informe técnico, N° de denuncia, comprador…" />
      </Field>
    </Panel>
  );
}
