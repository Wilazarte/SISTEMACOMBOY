"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Combine, Inbox, Package, PackagePlus, Pencil, Search, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Tabs, Td, Textarea, cn, ejecutarAsync, toast } from "@/components/ui";
import { BotonFiltros, BotonNuevo } from "@/components/ui/BotonFiltros";
import { SolicitarProducto } from "@/components/productos/ProductoInput";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { getSesion } from "@/lib/auth";
import { UNIDADES } from "@/lib/empresa";
import { KEYS, fechaPE, r2, recargarDatos, useStore } from "@/lib/storage";
import {
  UMBRAL_SUGERENCIA,
  aprobarSolicitud,
  crearProducto,
  editarProducto,
  esAdminProductos,
  normalizarNombre,
  rechazarSolicitud,
  resolverSolicitudCon,
  similitud,
  unificarProductos,
  useCatalogo,
  type DatosProducto,
  type ProductoMaestro,
  type SolicitudProducto,
} from "@/lib/productos";
import type { StockItem } from "@/lib/types";
import type { StockLocal } from "@/lib/sucursal-modelos";

type Tab = "catalogo" | "solicitudes" | "duplicados";

/**
 * Catálogo de Productos (pestaña de VENTAS, ?tab=productos): contadores + sub-pestañas Catálogo | Solicitudes | Posibles duplicados.
 * Antes era la página /dashboard/productos (ahora redirige aquí). Solo el administrador crea, aprueba o unifica.
 */
export function CatalogoProductos() {
  const { productos, solicitudes, disponible, listo } = useCatalogo();
  const admin = esAdminProductos(getSesion()?.rol) && !getSesion()?.soloLectura;
  const [tab, setTab] = useState<Tab>("catalogo");
  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const duplicados = useMemo(() => posiblesDuplicados(productos), [productos]);
  // Campana "Producto nuevo solicitado": /dashboard/ventas?tab=productos&sub=solicitudes
  useEffect(() => {
    const sub = new URLSearchParams(window.location.search).get("sub");
    if (sub === "solicitudes" || sub === "duplicados") setTab(sub);
  }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold leading-tight tracking-tight text-fg">Catálogo de Productos</h2>
          <p className="mt-1 text-[13px] text-plomo-500">Un producto físico = un solo nombre y SKU en Taller, sedes y sucursal. Solo el administrador crea o unifica.</p>
        </div>
        {!admin && <span className="rounded-lg bg-plomo-100 px-3 py-1.5 text-xs font-semibold text-plomo-600">Consulta · para un producto nuevo use “Solicitar”</span>}
      </div>

      {listo && !disponible && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          Falta el catálogo en Supabase: ejecute supabase/migrations/20261022_unificar_productos.sql en el SQL Editor. Mientras tanto los formularios aceptan nombres libres.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Contador label="Total en catálogo" valor={productos.length} icon={<Package size={18} />} onClick={() => setTab("catalogo")} />
        <Contador label="Solicitudes pendientes" valor={pendientes.length} icon={<Inbox size={18} />} alerta={pendientes.length > 0} onClick={() => setTab("solicitudes")} />
        <Contador label="Posibles duplicados" valor={duplicados.length} icon={<Combine size={18} />} alerta={duplicados.length > 0} onClick={() => setTab("duplicados")} />
      </div>

      <Tabs<Tab>
        enLinea
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "catalogo", label: "Catálogo", icon: <Package size={16} />, count: productos.length },
          { id: "solicitudes", label: "Solicitudes", icon: <Inbox size={16} />, count: pendientes.length },
          { id: "duplicados", label: "Posibles duplicados", icon: <Combine size={16} />, count: duplicados.length },
        ]}
      />

      {tab === "catalogo" && <Catalogo productos={productos} admin={admin} />}
      {tab === "solicitudes" && <Solicitudes solicitudes={solicitudes} productos={productos} admin={admin} />}
      {tab === "duplicados" && <Duplicados pares={duplicados} admin={admin} />}
    </div>
  );
}

function Contador({ label, valor, icon, alerta, onClick }: { label: string; valor: number; icon: ReactNode; alerta?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border border-plomo-200 bg-surface p-4 text-left shadow-sm transition hover:border-blue-600">
      <span className={cn("rounded-lg p-2", alerta ? "bg-amber-500/15 text-amber-400" : "bg-blue-600/15 text-blue-400")}>{icon}</span>
      <span>
        <span className="block text-xs font-semibold uppercase tracking-wide text-plomo-500">{label}</span>
        <span className="block text-2xl font-bold text-fg">{valor}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------
function Catalogo({ productos, admin }: { productos: ProductoMaestro[]; admin: boolean }) {
  const { showForm, setShowForm, showFiltros, setShowFiltros } = useTogglePanel();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editar, setEditar] = useState<ProductoMaestro | null>(null);
  const [solicitar, setSolicitar] = useState(false);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const stockSuc = useStore<StockLocal[]>(KEYS.SUC_STOCK, []);
  const porProducto = useMemo(() => {
    const m = new Map<string, { alm: number; suc: number; sedes: Set<string> }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { alm: 0, suc: 0, sedes: new Set() }), m.get(k)!);
    stock.forEach((s) => {
      const x = get(normalizarNombre(s.nombre));
      x.alm = r2(x.alm + s.cantidad);
      x.sedes.add(s.sede);
    });
    stockSuc.forEach((s) => {
      const x = get(normalizarNombre(s.producto));
      x.suc = r2(x.suc + s.stock);
    });
    return m;
  }, [stock, stockSuc]);
  const categorias = Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean) as string[])).sort();
  const lista = productos.filter((p) => (!q || `${p.sku} ${p.nombre_normalizado} ${p.marca ?? ""}`.includes(normalizarNombre(q))) && (!cat || p.categoria === cat));
  const visibles = lista.slice(0, 200);

  return (
    <div className="space-y-4">
      {showForm && admin && <FormProducto onListo={() => setShowForm(false)} />}
      <Card>
        <CardHeader
          title="Productos del catálogo"
          subtitle={`${productos.length} producto(s) · stock de todos los almacenes con el mismo producto`}
          action={
            <div className="flex flex-wrap gap-2">
              {!admin && (
                <Button size="sm" variant="secondary" onClick={() => setSolicitar(true)}>
                  <PackagePlus size={14} /> Solicitar nuevo producto
                </Button>
              )}
              {admin && <BotonNuevo abierto={showForm} onClick={() => setShowForm(!showForm)} label="Nuevo producto" />}
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-plomo-100 px-4 py-2">
          <BotonFiltros abierto={showFiltros} onClick={() => setShowFiltros(!showFiltros)} activos={[q, cat].filter(Boolean).length} />
          {showFiltros && (
            <>
              <label className="relative min-w-[220px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-plomo-500" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU, nombre, marca…" className="pl-9" aria-label="Buscar" />
              </label>
              {categorias.length > 0 && <Select value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Categoría" options={categorias.map((c) => ({ value: c, label: c }))} className="w-48" />}
            </>
          )}
        </div>
        <Table head={["SKU", "Producto", "Unidad", "Marca", "Categoría", "Stock almacenes", "Stock sucursal", ...(admin ? ["Acciones"] : [])]} empty={visibles.length === 0}>
          {visibles.map((p) => {
            const st = porProducto.get(p.nombre_normalizado);
            return (
              <tr key={p.id} className={cn(!p.activo && "opacity-50")}>
                <Td className="font-semibold text-fg">{p.sku}</Td>
                <Td className="max-w-[360px]">
                  <span className="block truncate font-medium text-fg" title={p.nombre_normalizado}>
                    {p.nombre_normalizado}
                  </span>
                  {p.nombre_display !== p.nombre_normalizado && <span className="text-[11px] text-plomo-500">{p.nombre_display}</span>}
                </Td>
                <Td>{p.unidad}</Td>
                <Td>{p.marca || "-"}</Td>
                <Td>{p.categoria || "-"}</Td>
                <Td className="text-right" >
                  <span title={st ? Array.from(st.sedes).join(", ") : ""}>{st?.alm ?? 0}</span>
                </Td>
                <Td className="text-right">{st?.suc ?? 0}</Td>
                {admin && (
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => setEditar(p)} title="Editar">
                      <Pencil size={14} />
                    </Button>
                  </Td>
                )}
              </tr>
            );
          })}
        </Table>
        {lista.length > visibles.length && <p className="px-4 py-3 text-xs text-plomo-500">Mostrando 200 de {lista.length}: use Buscar para encontrar el resto.</p>}
      </Card>
      {editar && <ModalEditar producto={editar} onClose={() => setEditar(null)} />}
      {solicitar && <SolicitarProducto nombre="" modulo="Catálogo" onClose={() => setSolicitar(false)} />}
    </div>
  );
}

/** Alta (administrador): POST /api/productos -> 409 si ya existe o se parece > 80 %. */
function FormProducto({ inicial, solicitudId, onListo }: { inicial?: Partial<DatosProducto>; solicitudId?: string; onListo: () => void }) {
  const [f, setF] = useState<DatosProducto>({ nombre: inicial?.nombre ?? "", unidad: inicial?.unidad ?? "UND", marca: inicial?.marca ?? "", categoria: inicial?.categoria ?? "", descripcion: "" });
  const [aviso, setAviso] = useState<{ mensaje: string; similar: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardar = async (forzar = false) => {
    setGuardando(true);
    try {
      const r = await crearProducto(f, { forzar, solicitudId });
      if (r.ok) {
        toast(`Producto creado: ${r.producto.sku} · ${r.producto.nombre_normalizado}`);
        onListo();
      } else setAviso({ mensaje: r.mensaje, similar: r.error === "PRODUCTO_SIMILAR" });
    } finally {
      setGuardando(false);
    }
  };
  const set = (k: keyof DatosProducto) => (e: { target: { value: string } }) => {
    setAviso(null);
    setF({ ...f, [k]: e.target.value });
  };
  return (
    <Card>
      <CardHeader title="Nuevo producto maestro" subtitle={`Se guardará como: ${normalizarNombre(f.nombre) || "—"}`} />
      <div className="grid gap-4 p-5 md:grid-cols-4">
        <Field label="Nombre oficial *" className="md:col-span-2">
          <Input value={f.nombre} onChange={set("nombre")} placeholder="Temple Blanco Pato 25KG" />
        </Field>
        <Field label="Unidad">
          <Select value={f.unidad} onChange={set("unidad")} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
        </Field>
        <Field label="Marca">
          <Input value={f.marca} onChange={set("marca")} />
        </Field>
        <Field label="Categoría">
          <Input value={f.categoria} onChange={set("categoria")} placeholder="Repuesto, insumo, servicio…" />
        </Field>
        <Field label="Descripción" className="md:col-span-3">
          <Input value={f.descripcion} onChange={set("descripcion")} />
        </Field>
        {aviso && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 md:col-span-4">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{aviso.mensaje}</span>
            {aviso.similar && (
              <Button size="sm" variant="secondary" onClick={() => void guardar(true)}>
                Es otro producto: crear igual
              </Button>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 md:col-span-4">
          <Button variant="ghost" onClick={onListo}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando || !f.nombre.trim()}>
            <Check size={15} /> {guardando ? "Verificando…" : "Crear producto"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ModalEditar({ producto, onClose }: { producto: ProductoMaestro; onClose: () => void }) {
  const [f, setF] = useState({ nombre_display: producto.nombre_display, unidad: producto.unidad, marca: producto.marca ?? "", categoria: producto.categoria ?? "", descripcion: producto.descripcion ?? "", activo: producto.activo });
  const guardar = async () => {
    if (await ejecutarAsync(() => editarProducto(producto.id, { ...f, marca: f.marca || null, categoria: f.categoria || null, descripcion: f.descripcion || null }), "Producto actualizado")) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Editar ${producto.sku}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-xs text-plomo-500 sm:col-span-2">
          Nombre en el sistema: <span className="font-semibold text-fg">{producto.nombre_normalizado}</span>. No se cambia aquí: para corregirlo cree el nombre correcto y unifique este en él.
        </p>
        <Field label="Nombre para mostrar" className="sm:col-span-2">
          <Input value={f.nombre_display} onChange={(e) => setF({ ...f, nombre_display: e.target.value })} />
        </Field>
        <Field label="Unidad">
          <Select value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
        </Field>
        <Field label="Marca">
          <Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
        </Field>
        <Field label="Categoría">
          <Input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg-2">
          <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo (aparece en los formularios)
        </label>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
function Solicitudes({ solicitudes, productos, admin }: { solicitudes: SolicitudProducto[]; productos: ProductoMaestro[]; admin: boolean }) {
  const parecidos = (s: SolicitudProducto) =>
    productos
      .map((p) => ({ p, sim: similitud(s.nombre, p.nombre_normalizado) }))
      .filter((x) => x.sim >= UMBRAL_SUGERENCIA)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 2);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Solicitudes de producto nuevo" subtitle={admin ? "Apruebe (crea el producto), asígnelo a uno parecido o recháce la solicitud" : "Sus solicitudes y la respuesta del administrador"} />
        <Table head={["Fecha", "Producto pedido", "Unidad", "Pedido por", "Parecidos en catálogo", "Estado", ...(admin ? ["Acciones"] : [])]} empty={solicitudes.length === 0}>
          {solicitudes.map((s) => {
            const par = s.estado === "pendiente" ? parecidos(s) : [];
            return (
              <tr key={s.id}>
                <Td>{fechaPE(s.created_at.slice(0, 10))}</Td>
                <Td className="max-w-[280px]">
                  <span className="block truncate font-medium text-fg">{s.nombre}</span>
                  <span className="block truncate text-[11px] text-plomo-500">{[s.modulo, s.motivo].filter(Boolean).join(" · ")}</span>
                </Td>
                <Td>{s.unidad}</Td>
                <Td>{s.solicitado_usuario || "-"}</Td>
                <Td className="max-w-[260px]">
                  {par.length
                    ? par.map((x) => (
                        <span key={x.p.id} className="block truncate text-xs">
                          {x.p.nombre_normalizado} ({x.p.sku}) · {Math.round(x.sim * 100)} %
                          {admin && (
                            <button type="button" className="ml-1 text-blue-400 hover:underline" onClick={() => void ejecutarAsync(() => resolverSolicitudCon(s.id, x.p), `Asignada a ${x.p.sku}`)}>
                              usar este
                            </button>
                          )}
                        </span>
                      ))
                    : <span className="text-xs text-plomo-500">{s.respuesta ?? "-"}</span>}
                </Td>
                <Td>
                  <Badge estado={s.estado === "pendiente" ? "PENDIENTE" : s.estado === "aprobada" ? "APROBADA" : "ANULADA"} />
                </Td>
                {admin && (
                  <Td>
                    {s.estado === "pendiente" && (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => void ejecutarAsync(() => aprobarSolicitud(s.id), `${s.nombre} aprobado: ya está en el catálogo`)}>
                          <Check size={14} /> Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const motivo = prompt("Motivo del rechazo (ej. ya existe como …):") ?? "";
                            if (motivo !== null) void ejecutarAsync(() => rechazarSolicitud(s.id, motivo), "Solicitud rechazada");
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    )}
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

// ---------------------------------------------------------------------
type Par = { a: ProductoMaestro; b: ProductoMaestro; sim: number };

/** Pares de productos con nombres parecidos (misma palabra clave / medida): candidatos a unificar. */
function posiblesDuplicados(productos: ProductoMaestro[]): Par[] {
  const activos = productos.filter((p) => p.activo).slice(0, 3000);
  const out: Par[] = [];
  for (let i = 0; i < activos.length; i++)
    for (let j = i + 1; j < activos.length; j++) {
      const sim = similitud(activos[i].nombre_normalizado, activos[j].nombre_normalizado);
      if (sim >= 0.5) out.push({ a: activos[i], b: activos[j], sim });
    }
  return out.sort((x, y) => y.sim - x.sim).slice(0, 200);
}

function Duplicados({ pares, admin }: { pares: Par[]; admin: boolean }) {
  const { productos } = useCatalogo();
  const [manual, setManual] = useState<{ origen: string; destino: string }>({ origen: "", destino: "" });
  const unificar = async (origen: ProductoMaestro, destino: ProductoMaestro) => {
    if (!confirm(`¿Unificar ${origen.sku} "${origen.nombre_normalizado}" en ${destino.sku} "${destino.nombre_normalizado}"?\n\nEl stock de ${origen.sku} se suma a ${destino.sku} en cada almacén y el nombre antiguo queda como alias. No se puede deshacer.`)) return;
    const ok = await ejecutarAsync(async () => {
      const r = await unificarProductos(origen.id, destino.id);
      toast(`${r.origen} unificado en ${r.destino} · ${r.filas_stock} fila(s) de stock movidas`);
      await recargarDatos(KEYS.STOCK, KEYS.SUC_STOCK);
    }, "Productos unificados");
    if (ok) setManual({ origen: "", destino: "" });
  };
  const opciones = productos.map((p) => ({ value: p.id, label: `${p.sku} · ${p.nombre_normalizado}` }));
  const o = productos.find((p) => p.id === manual.origen);
  const d = productos.find((p) => p.id === manual.destino);
  return (
    <div className="space-y-4">
      {admin && (
        <Card>
          <CardHeader title="Unificar dos productos" subtitle="Ej: PATO TEMPLE → TEMPLE BLANCO PATO 25KG. El primero desaparece y su stock y su nombre pasan al segundo." />
          <div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto]">
            <Field label="Producto duplicado (se elimina)">
              <Select value={manual.origen} onChange={(e) => setManual({ ...manual, origen: e.target.value })} placeholder="Elija…" options={opciones} />
            </Field>
            <Field label="Producto oficial (se queda)">
              <Select value={manual.destino} onChange={(e) => setManual({ ...manual, destino: e.target.value })} placeholder="Elija…" options={opciones} />
            </Field>
            <div className="flex items-end">
              <Button disabled={!o || !d || o.id === d.id} onClick={() => o && d && void unificar(o, d)}>
                <Combine size={15} /> Unificar
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="Posibles duplicados" subtitle="Nombres parecidos en el catálogo. Revise y unifique los que son el mismo producto físico." />
        <Table head={["Producto A", "Producto B", "Parecido", ...(admin ? ["Unificar"] : [])]} empty={pares.length === 0}>
          {pares.map(({ a, b, sim }) => (
            <tr key={`${a.id}|${b.id}`}>
              <Td className="max-w-[320px]">
                <span className="block truncate">{a.nombre_normalizado}</span>
                <span className="text-[11px] text-plomo-500">{`${a.sku} · ${a.unidad}`}</span>
              </Td>
              <Td className="max-w-[320px]">
                <span className="block truncate">{b.nombre_normalizado}</span>
                <span className="text-[11px] text-plomo-500">{`${b.sku} · ${b.unidad}`}</span>
              </Td>
              <Td className="text-right">{Math.round(sim * 100)} %</Td>
              {admin && (
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => void unificar(b, a)} title={`Queda ${a.sku}`}>
                      ← Queda A
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void unificar(a, b)} title={`Queda ${b.sku}`}>
                      Queda B →
                    </Button>
                  </div>
                </Td>
              )}
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
