"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, History, PackagePlus, Pencil, Search, Star, Trash2, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar, ejecutarAsync } from "@/components/ui";
import { EstadoRuc } from "@/components/EstadoRuc";
import { BotonFiltros, BotonNuevo } from "@/components/ui/BotonFiltros";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { UNIDADES } from "@/lib/empresa";
import { ProductoInput } from "@/components/productos/ProductoInput";
import { fechaPE, r2, soles } from "@/lib/storage";
import { bajoMinimo, eliminarCliente, eliminarStock, guardarCliente, guardarStock, operaSucursal, resumenCliente, solicitarReposicion, valorizado, type ClienteSuc, type StockLocal, type VentaSucursal } from "@/lib/sucursal";
import { Acciones, EstadoSuc, Indicador } from "./comun";

const contiene = (t: string, q: string) => t.toLowerCase().includes(q.trim().toLowerCase());

// =====================================================================
// 7. STOCK LOCAL: inventario físico, alerta bajo mínimo, reposición automática (REQ-SECOCHA)
// =====================================================================
export function StockLocalTab({ stock }: { stock: StockLocal[] }) {
  const { showForm, setShowForm, showFiltros, setShowFiltros } = useTogglePanel();
  const opera = operaSucursal();
  const [editar, setEditar] = useState<StockLocal | null>(null);
  const [q, setQ] = useState("");
  const [soloBajos, setSoloBajos] = useState(false);
  const bajos = stock.filter(bajoMinimo);
  const lista = useMemo(
    () => stock.filter((s) => (!q || contiene(`${s.producto} ${s.codigo ?? ""}`, q)) && (!soloBajos || bajoMinimo(s))).sort((a, b) => Number(bajoMinimo(b)) - Number(bajoMinimo(a)) || a.producto.localeCompare(b.producto, "es")),
    [stock, q, soloBajos]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador icon={<Boxes size={14} />} label="Productos" valor={String(stock.length)} detalle={`${r2(stock.reduce((a, s) => a + s.stock, 0))} unidades en sucursal`} />
        <Indicador icon={<Boxes size={14} />} label="Stock valorizado" valor={soles(valorizado(stock))} detalle="Stock × costo unitario" />
        <Indicador icon={<AlertTriangle size={14} />} label="Bajo el mínimo" valor={String(bajos.length)} alerta={bajos.length > 0} detalle={bajos.length ? "Solicite reposición al Taller" : "Todo sobre el mínimo"} />
      </div>

      {(showForm || editar) && opera && (
        <FormStock
          item={editar ?? undefined}
          onListo={() => {
            setShowForm(false);
            setEditar(null);
          }}
        />
      )}

      <Card>
        <CardHeader
          title="Stock local de la sucursal"
          subtitle="Se suma solo al confirmar la recepción de un traslado y se descuenta al entregar"
          action={
            opera ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bajos.length === 0}
                  onClick={() => void ejecutarAsync(() => solicitarReposicion(), "Reposición solicitada: REQ-SECOCHA enviado al Almacén del Taller Principal")}
                  title="Crea un REQ-SECOCHA con lo que está bajo el mínimo"
                >
                  <PackagePlus size={14} /> Solicitar reposición{bajos.length ? ` (${bajos.length})` : ""}
                </Button>
                <BotonNuevo abierto={showForm} onClick={() => (setEditar(null), setShowForm(!showForm))} label="Producto" />
              </div>
            ) : undefined
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-4 py-2">
          <BotonFiltros abierto={showFiltros} onClick={() => setShowFiltros(!showFiltros)} activos={[q, soloBajos].filter(Boolean).length} />
          {showFiltros && (
            <>
              <label className="relative min-w-[220px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código…" className="pl-9" aria-label="Buscar" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-fg-2">
                <input type="checkbox" checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} /> Solo bajo el mínimo
              </label>
            </>
          )}
        </div>
        <Table head={["Producto", "Stock", "Mínimo", "Costo unit.", "Valorizado", "Alerta", ...(opera ? ["Acciones"] : [])]} empty={lista.length === 0}>
          {lista.map((s) => {
            const bajo = bajoMinimo(s);
            return (
              <tr key={s.id} className={cn(bajo && "bg-red-500/10")}>
                <Td className="max-w-[320px]">
                  <span className="block truncate font-medium text-fg">{s.producto}</span>
                  {s.codigo && <span className="text-[11px] text-plomo-500">{s.codigo}</span>}
                </Td>
                <Td className={cn("text-right font-semibold", bajo && "text-rojo")}>
                  {s.stock} {s.unidad}
                </Td>
                <Td className="text-right">{s.minimo}</Td>
                <Td className="text-right">{soles(s.costo)}</Td>
                <Td className="text-right font-semibold">{soles(r2(s.stock * s.costo))}</Td>
                <Td>{bajo ? <Badge estado="BAJO_MINIMO" /> : <span className="text-xs text-emerald-400">OK</span>}</Td>
                {opera && (
                  <Td>
                    <Acciones>
                      <Button size="sm" variant="ghost" onClick={() => (setShowForm(false), setEditar(s))} title="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm(`¿Quitar ${s.producto} del stock local?`) && ejecutar(() => eliminarStock(s.id), "Producto quitado")} title="Quitar">
                        <Trash2 size={14} />
                      </Button>
                    </Acciones>
                  </Td>
                )}
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}

function FormStock({ item, onListo }: { item?: StockLocal; onListo: () => void }) {
  const [f, setF] = useState({
    producto: item?.producto ?? "",
    codigo: item?.codigo ?? "",
    unidad: item?.unidad ?? "UND",
    stock: String(item?.stock ?? 0),
    minimo: String(item?.minimo ?? 0),
    costo: String(item?.costo ?? 0),
    precio: String(item?.precio ?? 0),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const guardar = () =>
    ejecutar(
      () =>
        guardarStock({
          id: item?.id,
          producto: f.producto,
          codigo: f.codigo.trim() || undefined,
          unidad: f.unidad,
          stock: Number(f.stock) || 0,
          minimo: Number(f.minimo) || 0,
          costo: Number(f.costo) || 0,
          precio: Number(f.precio) || 0,
        }),
      item ? "Producto actualizado" : "Producto agregado al stock local"
    ) && onListo();
  return (
    <Card>
      <CardHeader title={item ? `Editar ${item.producto}` : "Nuevo producto en stock local"} />
      <div className="grid gap-4 p-5 md:grid-cols-7">
        <Field label="Producto *" className="md:col-span-2">
          <ProductoInput value={f.producto} modulo="Sucursal · Stock" onChange={(producto, p) => setF({ ...f, producto, ...(p ? { unidad: p.unidad } : {}) })} />
        </Field>
        <Field label="Código">
          <Input value={f.codigo} onChange={set("codigo")} />
        </Field>
        <Field label="Unidad">
          <Select value={f.unidad} onChange={set("unidad")} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
        </Field>
        <Field label="Stock">
          <Input type="number" min="0" step="any" value={f.stock} onChange={set("stock")} />
        </Field>
        <Field label="Mínimo">
          <Input type="number" min="0" step="any" value={f.minimo} onChange={set("minimo")} />
        </Field>
        <Field label="Costo unit. S/">
          <Input type="number" min="0" step="0.01" value={f.costo} onChange={set("costo")} />
        </Field>
        <Field label="Precio venta S/">
          <Input type="number" min="0" step="0.01" value={f.precio} onChange={set("precio")} />
        </Field>
        <div className="flex items-end justify-end gap-2 md:col-span-6">
          <Button variant="ghost" onClick={onListo}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </div>
      </div>
    </Card>
  );
}

// =====================================================================
// 8. CLIENTES: CRUD, historial de compras, deuda, cliente frecuente
// =====================================================================
export function ClientesTab({ clientes, ventas }: { clientes: ClienteSuc[]; ventas: VentaSucursal[] }) {
  const { showForm, setShowForm, showFiltros, setShowFiltros } = useTogglePanel();
  const opera = operaSucursal();
  const [editar, setEditar] = useState<ClienteSuc | null>(null);
  const [historial, setHistorial] = useState<ClienteSuc | null>(null);
  const [q, setQ] = useState("");
  const filas = useMemo(
    () =>
      clientes
        .filter((c) => !q || contiene(`${c.nombre} ${c.doc} ${c.telefono ?? ""}`, q))
        .map((c) => ({ c, r: resumenCliente(c, ventas) }))
        .sort((a, b) => b.r.deuda - a.r.deuda || b.r.comprado - a.r.comprado),
    [clientes, ventas, q]
  );
  const deudaTotal = r2(filas.reduce((a, f) => a + f.r.deuda, 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador icon={<Users size={14} />} label="Clientes" valor={String(clientes.length)} />
        <Indicador icon={<Star size={14} />} label="Frecuentes" valor={String(filas.filter((f) => f.r.frecuente).length)} detalle="3 compras o más" />
        <Indicador icon={<AlertTriangle size={14} />} label="Deuda por cobrar" valor={soles(deudaTotal)} alerta={deudaTotal > 0} />
      </div>

      {(showForm || editar) && opera && (
        <FormCliente
          item={editar ?? undefined}
          onListo={() => {
            setShowForm(false);
            setEditar(null);
          }}
        />
      )}

      <Card>
        <CardHeader title="Clientes de la sucursal" action={opera ? <BotonNuevo abierto={showForm} onClick={() => (setEditar(null), setShowForm(!showForm))} label="Nuevo cliente" /> : undefined} />
        <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-4 py-2">
          <BotonFiltros abierto={showFiltros} onClick={() => setShowFiltros(!showFiltros)} activos={q ? 1 : 0} />
          {showFiltros && (
            <label className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, DNI / RUC, teléfono…" className="pl-9" aria-label="Buscar" />
            </label>
          )}
        </div>
        <Table head={["Cliente", "DNI / RUC", "Compras", "Total comprado", "Deuda", "Última compra", "Acciones"]} empty={filas.length === 0}>
          {filas.map(({ c, r }) => (
            <tr key={c.id}>
              <Td className="max-w-[260px]">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <span className="truncate">{c.nombre}</span>
                  {r.frecuente && <Badge estado="FRECUENTE" />}
                </span>
                {c.telefono && <span className="text-[11px] text-plomo-500">{c.telefono}</span>}
              </Td>
              <Td>{c.doc || "-"}</Td>
              <Td className="text-right">{r.ventas.length}</Td>
              <Td className="text-right">{soles(r.comprado)}</Td>
              <Td className={cn("text-right font-semibold", r.deuda > 0 && "text-rojo")}>{soles(r.deuda)}</Td>
              <Td>{r.ultima ? fechaPE(r.ultima) : "-"}</Td>
              <Td>
                <Acciones>
                  <Button size="sm" variant="ghost" onClick={() => setHistorial(c)} title="Historial de compras">
                    <History size={14} />
                  </Button>
                  {opera && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => (setShowForm(false), setEditar(c))} title="Editar">
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm(`¿Eliminar a ${c.nombre}?`) && ejecutar(() => eliminarCliente(c.id), "Cliente eliminado")} title="Eliminar">
                        <Trash2 size={14} />
                      </Button>
                    </>
                  )}
                </Acciones>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {historial && (
        <Modal open onClose={() => setHistorial(null)} title={`Historial · ${historial.nombre}`} wide>
          <Table head={["Fecha", "Venta", "Estado", "Pago", "Total"]} empty={resumenCliente(historial, ventas).ventas.length === 0}>
            {resumenCliente(historial, ventas).ventas.map((v) => (
              <tr key={v.id}>
                <Td>{fechaPE(v.fecha)}</Td>
                <Td className="font-semibold text-fg">{v.docRef}</Td>
                <Td>
                  <EstadoSuc estado={v.estado} />
                </Td>
                <Td>{v.pagado ? <Badge estado="PAGADO" /> : <Badge estado="POR_COBRAR" />}</Td>
                <Td className="text-right font-semibold">{soles(v.total)}</Td>
              </tr>
            ))}
          </Table>
        </Modal>
      )}
    </div>
  );
}

function FormCliente({ item, onListo }: { item?: ClienteSuc; onListo: () => void }) {
  const [f, setF] = useState({ nombre: item?.nombre ?? "", doc: item?.doc ?? "", telefono: item?.telefono ?? "", direccion: item?.direccion ?? "", email: item?.email ?? "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === "doc" ? e.target.value.replace(/\D/g, "").slice(0, 11) : e.target.value });
  const guardar = () =>
    ejecutar(
      () => guardarCliente({ id: item?.id, nombre: f.nombre, doc: f.doc, telefono: f.telefono.trim() || undefined, direccion: f.direccion.trim() || undefined, email: f.email.trim() || undefined }),
      item ? "Cliente actualizado" : "Cliente registrado"
    ) && onListo();
  return (
    <Card>
      <CardHeader title={item ? `Editar ${item.nombre}` : "Nuevo cliente"} />
      <div className="grid gap-4 p-5 md:grid-cols-5">
        <Field label="Nombre / razón social *" className="md:col-span-2">
          <Input value={f.nombre} onChange={set("nombre")} />
        </Field>
        <Field label="DNI / RUC">
          <Input value={f.doc} onChange={set("doc")} inputMode="numeric" />
          <EstadoRuc ruc={f.doc} onValidado={(r) => setF((x) => (x.nombre.trim() ? x : { ...x, nombre: r.razon_social }))} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.telefono} onChange={set("telefono")} />
        </Field>
        <Field label="Correo">
          <Input value={f.email} onChange={set("email")} type="email" />
        </Field>
        <Field label="Dirección" className="md:col-span-5">
          <Input value={f.direccion} onChange={set("direccion")} />
        </Field>
        <div className="flex justify-end gap-2 md:col-span-5">
          <Button variant="ghost" onClick={onListo}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </div>
      </div>
    </Card>
  );
}
