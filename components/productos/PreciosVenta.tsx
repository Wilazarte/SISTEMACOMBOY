"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Calculator, Factory, History, Package, Pencil, Search, Tag, Truck } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Tabs, Td, Textarea, cn, ejecutarAsync } from "@/components/ui";
import { fechaPE, r2, soles } from "@/lib/storage";
import { useCatalogo, normalizarNombre } from "@/lib/productos";
import {
  MODELOS_EQUIPO,
  activarPrecio,
  guardarPrecio,
  historialPrecio,
  precioDesdeCosto,
  puedeEditarPrecios,
  sinIgv,
  usePreciosVenta,
  type CostoModelo,
  type HistorialPrecio,
  type PrecioVenta,
  type TipoPrecio,
} from "@/lib/preciosVenta";

type Tab = "equipos" | "productos";

const NOMBRE_ESTADO: Record<string, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  REVISADO: "Revisada",
  VALIDADO: "Validada",
  APROBADO: "Aprobada",
  CERRADO: "Cerrada",
};
const pct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)} %`);
const fechaHora = (iso: string) => `${fechaPE(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;

/**
 * VENTAS › Precios de venta (pedido de Williams 2026-11-22).
 * Equipos: el precio se jala de Costo de Producción si la ficha del modelo está completa (aprobada o cerrada);
 * si no, se escribe a mano. Productos del catálogo: precio manual. Todo queda guardado en precios_venta
 * con historial, y la Nota de pedido / Comprobante lo propone al elegir el producto o equipo.
 */
export function PreciosVenta() {
  const { precios, costos, listo, faltaTabla, error } = usePreciosVenta();
  const { productos } = useCatalogo();
  const editar = puedeEditarPrecios();
  const [tab, setTab] = useState<Tab>("equipos");

  const equipos = precios.filter((p) => p.tipo === "EQUIPO" && p.activo);
  const conPrecio = new Set(precios.filter((p) => p.tipo === "PRODUCTO" && p.activo).map((p) => p.clave));
  const activos = productos.filter((p) => p.activo);
  const sinPrecio = activos.filter((p) => !conPrecio.has(p.nombre_normalizado)).length;
  const completas = costos.filter((c) => c.completa).length;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold leading-tight tracking-tight text-fg">Precios de venta</h2>
          <p className="mt-1 text-[13px] text-plomo-500">
            Precio guardado por equipo y producto (S/, IGV incluido). Equipos: se jala de Costo de Producción si la ficha está completa; si no, se escribe a mano.
          </p>
        </div>
        {!editar && <span className="rounded-lg bg-plomo-100 px-3 py-1.5 text-xs font-semibold text-plomo-600">Solo consulta</span>}
      </div>

      {listo && faltaTabla && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          Falta la base de precios en Supabase: ejecute supabase/migrations/20261225_precios_venta.sql en el SQL Editor.
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-vino">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Contador label="Equipos con precio" valor={`${equipos.length} / ${Math.max(MODELOS_EQUIPO.length, equipos.length)}`} icon={<Truck size={18} />} onClick={() => setTab("equipos")} />
        <Contador label="Fichas de costo completas" valor={completas} icon={<Factory size={18} />} onClick={() => setTab("equipos")} />
        <Contador label="Productos con precio" valor={conPrecio.size} icon={<Tag size={18} />} onClick={() => setTab("productos")} />
        <Contador label="Productos sin precio" valor={sinPrecio} icon={<Package size={18} />} alerta={sinPrecio > 0} onClick={() => setTab("productos")} />
      </div>

      <Tabs<Tab>
        enLinea
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "equipos", label: "Equipos (por modelo)", icon: <Truck size={16} />, count: equipos.length },
          { id: "productos", label: "Productos", icon: <Package size={16} />, count: conPrecio.size },
        ]}
      />

      {tab === "equipos" && <Equipos precios={precios} costos={costos} editar={editar && !faltaTabla} />}
      {tab === "productos" && <Productos precios={precios} editar={editar && !faltaTabla} />}
    </div>
  );
}

function Contador({ label, valor, icon, alerta, onClick }: { label: string; valor: ReactNode; icon: ReactNode; alerta?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border border-plomo-200 bg-surface p-4 text-left shadow-sm transition hover:border-blue-600">
      <span className={cn("rounded-lg p-2", alerta ? "bg-amber-500/15 text-amber-500" : "bg-blue-600/15 text-blue-500")}>{icon}</span>
      <span>
        <span className="block text-xs font-semibold uppercase tracking-wide text-plomo-500">{label}</span>
        <span className="block text-2xl font-bold text-fg">{valor}</span>
      </span>
    </button>
  );
}

function Origen({ p }: { p?: PrecioVenta }) {
  if (!p) return <span className="text-xs font-semibold text-amber-700">Sin precio</span>;
  return p.origen === "COSTO_PRODUCCION" ? (
    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700" title={`Costo ${soles(p.costo_unitario ?? 0)} · margen ${pct(p.margen)}`}>
      Costo de Producción {p.hoja_costo ? `· ${p.hoja_costo}` : ""}
    </span>
  ) : (
    <span className="rounded-full bg-plomo-100 px-2 py-0.5 text-[11px] font-semibold text-plomo-600">Manual</span>
  );
}

// ---------------------------------------------------------------------
// Equipos por modelo
// ---------------------------------------------------------------------

interface Edicion {
  tipo: TipoPrecio;
  nombre: string;
  unidad: string;
  producto_id?: string | null;
  sku?: string | null;
  actual?: PrecioVenta;
  costo?: CostoModelo;
  modo: "costo" | "manual";
}

function Equipos({ precios, costos, editar }: { precios: PrecioVenta[]; costos: CostoModelo[]; editar: boolean }) {
  const [ed, setEd] = useState<Edicion | null>(null);
  const [hist, setHist] = useState<PrecioVenta | null>(null);
  const modelos = useMemo(() => {
    const extra = [...precios.filter((p) => p.tipo === "EQUIPO").map((p) => p.clave), ...costos.map((c) => c.modelo)].filter((m) => !MODELOS_EQUIPO.includes(m));
    return [...MODELOS_EQUIPO, ...Array.from(new Set(extra)).sort()];
  }, [precios, costos]);

  return (
    <Card>
      <CardHeader title="Equipos por modelo" subtitle="Ficha completa = hoja de Costo de Producción aprobada por Gerencia (o cerrada). Precio sugerido = costo ÷ (1 − margen) + IGV." />
      <Table head={["Modelo", "Ficha de costo", "Costo (sin IGV)", "Sugerido inc. IGV", "Precio guardado", "Origen", "Acciones"]} empty={modelos.length === 0}>
        {modelos.map((m) => {
          const p = precios.find((x) => x.tipo === "EQUIPO" && x.clave === m);
          const c = costos.find((x) => x.modelo === m);
          const sugerido = c ? precioDesdeCosto(c.costo_unitario, c.margen) : 0;
          return (
            <tr key={m} className={cn(p && !p.activo && "opacity-50")}>
              <Td className="font-semibold text-fg">{m}</Td>
              <Td>
                {c ? (
                  <span className="flex flex-col">
                    <span className="font-medium text-fg">{c.hoja}</span>
                    <span className={cn("text-[11px] font-semibold", c.completa ? "text-emerald-700" : "text-amber-700")}>
                      {c.completa ? "Completa" : "Incompleta"} · {NOMBRE_ESTADO[c.estado] ?? c.estado}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-plomo-500">Sin ficha</span>
                )}
              </Td>
              <Td className="text-right">{c ? soles(c.costo_unitario) : "—"}</Td>
              <Td className="text-right">{c?.completa && sugerido > 0 ? <span title={`Margen ${pct(c.margen)}`}>{soles(sugerido)}</span> : "—"}</Td>
              <Td className="text-right">
                {p ? (
                  <span className="flex flex-col">
                    <span className="text-base font-bold text-fg">{soles(p.precio)}</span>
                    <span className="text-[11px] text-plomo-500">sin IGV {soles(p.precio_sin_igv)}</span>
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                <span className="flex flex-col gap-0.5">
                  <Origen p={p} />
                  {p && <span className="text-[11px] text-plomo-500">{`${fechaHora(p.updated_at)} · ${p.updated_usuario ?? ""}`}</span>}
                </span>
              </Td>
              <Td>
                <div className="flex flex-nowrap gap-1.5">
                  {editar && (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={!c?.completa || !(c.costo_unitario > 0)}
                      title={!c ? "Este modelo no tiene hoja de costo: ingrese el precio a mano" : !c.completa ? `La ficha ${c.hoja} está ${NOMBRE_ESTADO[c.estado] ?? c.estado}: falta que Gerencia la apruebe` : "Calcular el precio desde el costo de producción"}
                      onClick={() => c && setEd({ tipo: "EQUIPO", nombre: m, unidad: "UND", actual: p, costo: c, modo: "costo" })}
                    >
                      <Calculator size={14} /> Jalar del costo
                    </Button>
                  )}
                  {editar && (
                    <Button size="sm" variant="secondary" onClick={() => setEd({ tipo: "EQUIPO", nombre: m, unidad: "UND", actual: p, costo: c, modo: "manual" })}>
                      <Pencil size={14} /> {p ? "Editar" : "Manual"}
                    </Button>
                  )}
                  {p && (
                    <Button size="sm" variant="ghost" onClick={() => setHist(p)} title="Historial de precios">
                      <History size={14} />
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>
      {ed && <ModalPrecio ed={ed} onClose={() => setEd(null)} />}
      {hist && <ModalHistorial precio={hist} onClose={() => setHist(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Productos del catálogo
// ---------------------------------------------------------------------

function Productos({ precios, editar }: { precios: PrecioVenta[]; editar: boolean }) {
  const { productos } = useCatalogo();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "con" | "sin">("todos");
  const [ed, setEd] = useState<Edicion | null>(null);
  const [hist, setHist] = useState<PrecioVenta | null>(null);
  const porClave = useMemo(() => new Map(precios.filter((p) => p.tipo === "PRODUCTO").map((p) => [p.clave, p])), [precios]);

  const filas = useMemo(() => {
    // Catálogo activo + precios guardados de productos que ya no están en el catálogo
    const enCatalogo = new Set(productos.map((p) => p.nombre_normalizado));
    const base = productos
      .filter((p) => p.activo)
      .map((p) => ({ clave: p.nombre_normalizado, nombre: p.nombre_normalizado, sku: p.sku, unidad: p.unidad, producto_id: p.id, categoria: p.categoria ?? "" }));
    const sueltos = precios
      .filter((p) => p.tipo === "PRODUCTO" && !enCatalogo.has(p.clave))
      .map((p) => ({ clave: p.clave, nombre: p.nombre, sku: p.sku ?? "", unidad: p.unidad, producto_id: p.producto_id ?? "", categoria: "" }));
    return [...base, ...sueltos];
  }, [productos, precios]);

  const nq = normalizarNombre(q);
  const lista = filas.filter((f) => {
    const p = porClave.get(f.clave);
    const tiene = !!p?.activo;
    return (!nq || `${f.sku} ${f.nombre} ${f.categoria}`.toUpperCase().includes(nq)) && (filtro === "todos" || (filtro === "con" ? tiene : !tiene));
  });
  const visibles = lista.slice(0, 200);

  return (
    <Card>
      <CardHeader title="Productos del catálogo" subtitle="El precio se escribe a mano (S/, IGV incluido) y queda guardado para las notas de pedido y comprobantes." />
      <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-4 py-3">
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU, nombre, categoría…" className="pl-9" aria-label="Buscar producto" />
        </label>
        <Select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as typeof filtro)}
          options={[
            { value: "todos", label: "Todos" },
            { value: "con", label: "Con precio" },
            { value: "sin", label: "Sin precio" },
          ]}
          aria-label="Filtrar por precio"
          className="w-40"
        />
      </div>
      <Table head={["SKU", "Producto", "Unidad", "Precio inc. IGV", "Origen", "Acciones"]} empty={visibles.length === 0} vacio="Sin productos con ese filtro">
        {visibles.map((f) => {
          const p = porClave.get(f.clave);
          return (
            <tr key={f.clave} className={cn(p && !p.activo && "opacity-50")}>
              <Td className="font-semibold text-fg">{f.sku || "—"}</Td>
              <Td className="max-w-[360px]">
                <span className="block truncate font-medium text-fg" title={f.nombre}>
                  {f.nombre}
                </span>
                {f.categoria && <span className="text-[11px] text-plomo-500">{f.categoria}</span>}
              </Td>
              <Td>{f.unidad}</Td>
              <Td className="text-right">
                {p?.activo ? (
                  <span className="flex flex-col">
                    <span className="font-bold text-fg">{soles(p.precio)}</span>
                    <span className="text-[11px] text-plomo-500">sin IGV {soles(p.precio_sin_igv)}</span>
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                <span className="flex flex-col gap-0.5">
                  <Origen p={p?.activo ? p : undefined} />
                  {p && <span className="text-[11px] text-plomo-500">{`${fechaHora(p.updated_at)} · ${p.updated_usuario ?? ""}`}</span>}
                </span>
              </Td>
              <Td>
                <div className="flex flex-nowrap gap-1.5">
                  {editar && (
                    <Button size="sm" variant={p?.activo ? "secondary" : "primary"} onClick={() => setEd({ tipo: "PRODUCTO", nombre: f.nombre, unidad: f.unidad, producto_id: f.producto_id || null, sku: f.sku || null, actual: p, modo: "manual" })}>
                      <Pencil size={14} /> {p?.activo ? "Editar" : "Poner precio"}
                    </Button>
                  )}
                  {p && (
                    <Button size="sm" variant="ghost" onClick={() => setHist(p)} title="Historial de precios">
                      <History size={14} />
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>
      {lista.length > visibles.length && <p className="px-4 py-3 text-xs text-plomo-500">Mostrando 200 de {lista.length}: use Buscar para encontrar el resto.</p>}
      {ed && <ModalPrecio ed={ed} onClose={() => setEd(null)} />}
      {hist && <ModalHistorial precio={hist} onClose={() => setHist(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------

function ModalPrecio({ ed, onClose }: { ed: Edicion; onClose: () => void }) {
  const desdeCosto = ed.modo === "costo" && !!ed.costo;
  const costo = ed.costo?.costo_unitario ?? 0;
  const margenInicial = desdeCosto ? (ed.actual?.origen === "COSTO_PRODUCCION" && ed.actual.margen !== null ? ed.actual.margen : ed.costo!.margen) : 0;
  const [margen, setMargen] = useState(r2(margenInicial * 100));
  const [precio, setPrecio] = useState<number>(desdeCosto ? precioDesdeCosto(costo, margenInicial) : ed.actual?.activo ? ed.actual.precio : 0);
  const [obs, setObs] = useState(ed.actual?.observacion ?? "");
  const [guardando, setGuardando] = useState(false);

  // Precio y margen enlazados cuando se jala del costo
  const cambiarMargen = (v: number) => {
    setMargen(v);
    if (desdeCosto) setPrecio(precioDesdeCosto(costo, v / 100));
  };
  const cambiarPrecio = (v: number) => {
    setPrecio(v);
    if (desdeCosto && v > 0 && costo > 0) setMargen(r2((1 - costo / sinIgv(v)) * 100));
  };
  const margenReal = costo > 0 && precio > 0 ? 1 - costo / sinIgv(precio) : null;

  const guardar = async () => {
    setGuardando(true);
    const ok = await ejecutarAsync(
      () =>
        guardarPrecio({
          tipo: ed.tipo,
          nombre: ed.nombre,
          unidad: ed.unidad,
          producto_id: ed.producto_id,
          sku: ed.sku,
          precio,
          origen: desdeCosto ? "COSTO_PRODUCCION" : "MANUAL",
          hoja_costo: ed.costo?.hoja,
          costo_unitario: costo,
          margen: margen / 100,
          observacion: obs,
        }),
      `Precio guardado: ${ed.nombre} · ${soles(precio)}`
    );
    setGuardando(false);
    if (ok) onClose();
  };
  const desactivar = async () => {
    if (!ed.actual) return;
    setGuardando(true);
    const ok = await ejecutarAsync(() => activarPrecio(ed.actual!.id, false), `${ed.nombre}: precio quitado (queda en el historial)`);
    setGuardando(false);
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} title={desdeCosto ? "Jalar precio de Costo de Producción" : ed.actual?.activo ? "Editar precio de venta" : "Poner precio de venta"}>
      <div className="space-y-4">
        <div className="rounded-xl border border-plomo-200 bg-plomo-50 px-4 py-3 text-sm">
          <p className="font-semibold text-fg">{ed.nombre}</p>
          <p className="text-xs text-plomo-500">
            {ed.tipo === "EQUIPO" ? "Equipo (por modelo)" : `Producto${ed.sku ? ` · ${ed.sku}` : ""}`} · {ed.unidad}
            {ed.actual?.activo ? ` · precio actual ${soles(ed.actual.precio)}` : " · sin precio guardado"}
          </p>
        </div>

        {desdeCosto && ed.costo && (
          <div className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm sm:grid-cols-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase text-plomo-500">Ficha de costo</span>
              <span className="font-semibold text-fg">{ed.costo.hoja}</span> <span className="text-xs text-emerald-700">{NOMBRE_ESTADO[ed.costo.estado] ?? ed.costo.estado}</span>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase text-plomo-500">Costo unitario (sin IGV)</span>
              <span className="font-semibold text-fg">{soles(costo)}</span>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase text-plomo-500">Margen de la ficha</span>
              <span className="font-semibold text-fg">{pct(ed.costo.margen)}</span>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {desdeCosto && (
            <Field label="Margen sobre el precio (%)" hint="Precio sin IGV = costo ÷ (1 − margen)">
              <Input type="number" min={0} max={95} step="0.1" value={Number.isFinite(margen) ? margen : ""} onChange={(e) => cambiarMargen(parseFloat(e.target.value) || 0)} className="text-right" />
            </Field>
          )}
          <Field label="Precio de venta S/ (IGV incluido) *" hint={precio > 0 ? `Sin IGV: ${soles(sinIgv(precio))} · IGV: ${soles(r2(precio - sinIgv(precio)))}` : undefined}>
            <Input type="number" min={0} step="0.01" value={precio || ""} onChange={(e) => cambiarPrecio(parseFloat(e.target.value) || 0)} className="text-right text-lg font-bold" autoFocus={!desdeCosto} />
          </Field>
        </div>
        {desdeCosto && margenReal !== null && margenReal < 0.2 && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <AlertTriangle size={14} /> Margen {pct(margenReal)}: por debajo del mínimo de 20 % de Costo de Producción.
          </p>
        )}
        <Field label="Observación">
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej. precio de lista 2026, incluye capacitación…" />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          {ed.actual?.activo ? (
            <Button variant="danger" size="sm" onClick={desactivar} disabled={guardando}>
              Quitar precio
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || !(precio > 0)}>
              {guardando ? "Guardando…" : "Guardar precio"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ModalHistorial({ precio, onClose }: { precio: PrecioVenta; onClose: () => void }) {
  const [filas, setFilas] = useState<HistorialPrecio[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    historialPrecio(precio.id)
      .then(setFilas)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [precio.id]);
  return (
    <Modal open onClose={onClose} title={`Historial de precios · ${precio.nombre}`} wide>
      {error && <p className="text-sm text-vino">{error}</p>}
      {!filas && !error && <p className="text-sm text-plomo-500">Cargando…</p>}
      {filas && (
        <Table head={["Fecha", "Anterior", "Nuevo", "Origen", "Costo / margen", "Usuario", "Observación"]} empty={filas.length === 0}>
          {filas.map((h) => (
            <tr key={h.id}>
              <Td className="text-xs">{fechaHora(h.created_at)}</Td>
              <Td className="text-right">{h.precio_anterior === null ? "—" : soles(h.precio_anterior)}</Td>
              <Td className="text-right font-bold text-fg">{soles(h.precio_nuevo)}</Td>
              <Td>{h.origen === "COSTO_PRODUCCION" ? `Costo de Producción${h.hoja_costo ? ` · ${h.hoja_costo}` : ""}` : "Manual"}</Td>
              <Td className="text-xs">{h.costo_unitario !== null ? `${soles(h.costo_unitario)} · ${pct(h.margen)}` : "—"}</Td>
              <Td>{h.usuario ?? "—"}</Td>
              <Td className="max-w-[240px] truncate text-xs" >{h.observacion ?? ""}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
