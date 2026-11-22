"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Tags, Wand2 } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutarAsync } from "@/components/ui";
import {
  SIN_CATEGORIA,
  aplicarSugerencias,
  asignarCategoria,
  categoriaDe,
  guardarCategoria,
  sugerirCategoria,
  useCatalogo,
  type CategoriaProducto,
  type ProductoMaestro,
} from "@/lib/productos";

/** Etiqueta pequeña de la categoría de un producto (Almacén, Secocha, formularios). */
export function EtiquetaCategoria({ nombre, className }: { nombre?: string | null; className?: string }) {
  if (!nombre) return null;
  return (
    <span data-categoria={nombre} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-plomo-100 px-2 py-0.5 text-[10px] font-semibold text-plomo-600 ring-1 ring-inset ring-plomo-200", className)}>
      <Tags size={10} aria-hidden /> {nombre}
    </span>
  );
}

/** Categorías (sin repetir) de los productos de un documento (REQ, OC, traslado…). */
export const categoriasDeItems = (items: { nombre?: string; producto?: string }[] | undefined): string[] =>
  Array.from(new Set((items ?? []).map((i) => categoriaDe(i.nombre ?? i.producto ?? "")).filter(Boolean))).sort();

/** Etiquetas de las categorías de un documento (máximo 3 y "+n"). */
export function EtiquetasCategorias({ categorias }: { categorias: string[] }) {
  if (!categorias.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1" title={categorias.join(", ")}>
      {categorias.slice(0, 3).map((c) => (
        <EtiquetaCategoria key={c} nombre={c} />
      ))}
      {categorias.length > 3 && <span className="text-[10px] font-semibold text-plomo-500">+{categorias.length - 3}</span>}
    </span>
  );
}

/** ¿Alguna categoría del documento pasa el filtro? */
export const docPasaCategoria = (cats: string[], filtro: string): boolean => !filtro || (filtro === SIN_CATEGORIA ? cats.length === 0 : cats.includes(filtro));

/** Cantidad de documentos por categoría (un documento cuenta en cada categoría que tiene). */
export function contarCategoriasDocs(docs: string[][]): Map<string, number> {
  const m = new Map<string, number>();
  docs.forEach((cats) => (cats.length ? cats : [SIN_CATEGORIA]).forEach((c) => m.set(c, (m.get(c) ?? 0) + 1)));
  return m;
}

/** Selector de categoría para el formulario de un producto (lista oficial; conserva una categoría antigua que ya no está). */
export function SelectCategoria({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { categorias } = useCatalogo();
  const activas = categorias.filter((c) => c.activo);
  const opciones = activas.map((c) => ({ value: c.nombre, label: c.nombre }));
  if (value && !activas.some((c) => c.nombre === value)) opciones.unshift({ value, label: `${value} (fuera de la lista)` });
  return <Select value={value} onChange={(e) => onChange(e.target.value)} placeholder="Sin categoría" options={opciones} className={className} aria-label="Categoría" />;
}

/** Filtro por categoría: Todas · Sin categoría · cada categoría con su cantidad. */
export function FiltroCategoria({ value, onChange, conteo, className }: { value: string; onChange: (v: string) => void; conteo?: Map<string, number>; className?: string }) {
  const { categorias } = useCatalogo();
  const nombres = Array.from(new Set([...categorias.filter((c) => c.activo).map((c) => c.nombre), ...Array.from(conteo?.keys() ?? []).filter((k) => k && k !== SIN_CATEGORIA)]));
  const n = (k: string) => (conteo ? ` (${conteo.get(k) ?? 0})` : "");
  const opciones = [
    { value: SIN_CATEGORIA, label: `Sin categoría${n(SIN_CATEGORIA)}` },
    ...nombres.filter((k) => !conteo || (conteo.get(k) ?? 0) > 0 || k === value).map((k) => ({ value: k, label: `${k}${n(k)}` })),
  ];
  return <Select value={value} onChange={(e) => onChange(e.target.value)} placeholder="Todas las categorías" options={opciones} className={cn("w-56", className)} aria-label="Filtrar por categoría" />;
}

/** ¿La categoría del ítem pasa el filtro? ("" = todas). */
export const pasaCategoria = (categoria: string | null | undefined, filtro: string): boolean => !filtro || (filtro === SIN_CATEGORIA ? !categoria : categoria === filtro);

/** Cantidad por categoría (para el filtro). */
export function contarCategorias(cats: (string | null | undefined)[]): Map<string, number> {
  const m = new Map<string, number>();
  cats.forEach((c) => m.set(c || SIN_CATEGORIA, (m.get(c || SIN_CATEGORIA) ?? 0) + 1));
  return m;
}

// =====================================================================
// Pestaña "Categorías" del Catálogo de Productos
// =====================================================================
export function GestionCategorias({ productos, admin }: { productos: ProductoMaestro[]; admin: boolean }) {
  const { categorias, categoriasEnBD } = useCatalogo();
  const [editar, setEditar] = useState<CategoriaProducto | "nueva" | null>(null);
  const conteo = useMemo(() => contarCategorias(productos.map((p) => p.categoria?.trim())), [productos]);
  const fuera = Array.from(conteo.keys()).filter((k) => k !== SIN_CATEGORIA && !categorias.some((c) => c.nombre === k));

  return (
    <div className="space-y-4">
      {!categoriasEnBD && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          Lista base de categorías. Para editarla y asignar categorías a los productos existentes, ejecute supabase/migrations/20261203_categorias_productos.sql en el SQL Editor de Supabase.
        </div>
      )}
      <RevisarSinCategoria productos={productos} admin={admin} />
      <Card>
        <CardHeader
          title="Categorías de almacén"
          subtitle={`${categorias.filter((c) => c.activo).length} activas · las palabras clave sirven para sugerir la categoría por el nombre del producto`}
          action={
            admin && categoriasEnBD ? (
              <Button size="sm" onClick={() => setEditar("nueva")}>
                <Plus size={14} /> Nueva categoría
              </Button>
            ) : undefined
          }
        />
        <Table head={["Categoría", "Productos", "Palabras clave", "Estado", ...(admin && categoriasEnBD ? ["Acciones"] : [])]} empty={categorias.length === 0}>
          {categorias.map((c) => (
            <tr key={c.id ?? c.nombre} className={cn(!c.activo && "opacity-50")}>
              <Td className="max-w-[260px]">
                <span className="block font-semibold text-fg">{c.nombre}</span>
                {c.descripcion && <span className="block truncate text-[11px] text-plomo-500">{c.descripcion}</span>}
              </Td>
              <Td className="text-right font-semibold">{conteo.get(c.nombre) ?? 0}</Td>
              <Td className="max-w-[420px]">
                <span className="line-clamp-2 text-[11px] text-plomo-500" title={c.palabras.join(", ")}>
                  {c.palabras.join(", ") || "-"}
                </span>
              </Td>
              <Td>{c.activo ? <span className="text-xs font-semibold text-emerald-700">Activa</span> : <span className="text-xs text-plomo-500">Inactiva</span>}</Td>
              {admin && categoriasEnBD && (
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => setEditar(c)} title="Editar">
                    <Pencil size={14} />
                  </Button>
                </Td>
              )}
            </tr>
          ))}
          {fuera.map((k) => (
            <tr key={`fuera-${k}`}>
              <Td>
                <span className="block font-semibold text-fg">{k}</span>
                <span className="block text-[11px] text-amber-700">Escrita a mano, fuera de la lista: reasigne esos productos</span>
              </Td>
              <Td className="text-right font-semibold">{conteo.get(k) ?? 0}</Td>
              <Td>-</Td>
              <Td>-</Td>
              {admin && categoriasEnBD && <Td>{null}</Td>}
            </tr>
          ))}
        </Table>
      </Card>
      {editar && <ModalCategoria categoria={editar === "nueva" ? undefined : editar} onClose={() => setEditar(null)} siguienteOrden={Math.max(0, ...categorias.filter((c) => c.orden < 990).map((c) => c.orden)) + 10} />}
    </div>
  );
}

/** Productos sin categoría con la sugerida por su nombre: el administrador revisa, cambia y aplica. */
function RevisarSinCategoria({ productos, admin }: { productos: ProductoMaestro[]; admin: boolean }) {
  const { categorias, categoriasEnBD } = useCatalogo();
  const sin = useMemo(() => productos.filter((p) => !p.categoria?.trim()).map((p) => ({ p, sugerida: sugerirCategoria(p.nombre_normalizado, categorias) ?? "" })), [productos, categorias]);
  const [elegida, setElegida] = useState<Record<string, string>>({});
  const [mostrar, setMostrar] = useState(50);
  const cat = (id: string, sugerida: string) => elegida[id] ?? sugerida;
  const listos = sin.filter((x) => cat(x.p.id, x.sugerida));
  const puede = admin && categoriasEnBD;

  if (!sin.length)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
        <Check size={16} /> Todos los productos del catálogo tienen categoría.
      </div>
    );

  return (
    <Card>
      <CardHeader
        title={`Productos sin categoría (${sin.length})`}
        subtitle="Categoría sugerida por el nombre. Revísela, cámbiela si hace falta y aplique. No cambia el stock ni los nombres."
        action={
          puede ? (
            <Button size="sm" disabled={!listos.length} onClick={() => void ejecutarAsync(async () => void (await aplicarSugerencias(listos.map((x) => ({ id: x.p.id, categoria: cat(x.p.id, x.sugerida) }))), setElegida({})), `${listos.length} producto(s) categorizados`)}>
              <Wand2 size={14} /> Asignar {listos.length} con categoría elegida
            </Button>
          ) : undefined
        }
      />
      <Table head={["SKU", "Producto", "Categoría", ...(puede ? [""] : [])]} empty={false}>
        {sin.slice(0, mostrar).map(({ p, sugerida }) => (
          <tr key={p.id}>
            <Td className="font-semibold text-fg">{p.sku}</Td>
            <Td className="max-w-[360px]">
              <span className="block truncate font-medium text-fg" title={p.nombre_normalizado}>
                {p.nombre_normalizado}
              </span>
              {!sugerida && <span className="text-[11px] text-amber-700">Sin sugerencia: elija una</span>}
            </Td>
            <Td className="min-w-[200px]">
              {puede ? (
                <Select
                  value={cat(p.id, sugerida)}
                  onChange={(e) => setElegida({ ...elegida, [p.id]: e.target.value })}
                  placeholder="Elija…"
                  options={categorias.filter((c) => c.activo).map((c) => ({ value: c.nombre, label: c.nombre === sugerida ? `${c.nombre} (sugerida)` : c.nombre }))}
                  aria-label={`Categoría de ${p.nombre_normalizado}`}
                />
              ) : (
                <span className="text-xs text-plomo-500">{sugerida ? `Sugerida: ${sugerida}` : "-"}</span>
              )}
            </Td>
            {puede && (
              <Td>
                <Button size="sm" variant="secondary" disabled={!cat(p.id, sugerida)} onClick={() => void ejecutarAsync(() => asignarCategoria([p.id], cat(p.id, sugerida)), `${p.sku}: ${cat(p.id, sugerida)}`)}>
                  <Check size={14} />
                </Button>
              </Td>
            )}
          </tr>
        ))}
      </Table>
      {sin.length > mostrar && (
        <div className="px-4 py-3">
          <Button size="sm" variant="ghost" onClick={() => setMostrar(mostrar + 100)}>
            Ver más ({sin.length - mostrar} restantes)
          </Button>
        </div>
      )}
    </Card>
  );
}

function ModalCategoria({ categoria, onClose, siguienteOrden }: { categoria?: CategoriaProducto; onClose: () => void; siguienteOrden: number }) {
  const [f, setF] = useState({
    nombre: categoria?.nombre ?? "",
    descripcion: categoria?.descripcion ?? "",
    palabras: (categoria?.palabras ?? []).join(", "),
    orden: categoria?.orden ?? siguienteOrden,
    activo: categoria?.activo ?? true,
  });
  const guardar = async () => {
    const ok = await ejecutarAsync(
      () => guardarCategoria({ id: categoria?.id, nombre: f.nombre, descripcion: f.descripcion, palabras: f.palabras.split(","), orden: Number(f.orden) || 500, activo: f.activo }),
      categoria ? "Categoría actualizada" : "Categoría creada"
    );
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={categoria ? `Editar ${categoria.nombre}` : "Nueva categoría"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre *" hint={categoria ? "Al renombrarla, sus productos pasan al nombre nuevo." : undefined}>
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Lubricantes y grasas" />
        </Field>
        <Field label="Orden en la lista">
          <Input type="number" value={f.orden} onChange={(e) => setF({ ...f, orden: Number(e.target.value) })} />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </Field>
        <Field label="Palabras clave (separadas por coma)" className="sm:col-span-2" hint="Si el nombre del producto contiene una de estas palabras, se sugiere esta categoría. Ej: PERNO, TUERCA, ARANDELA">
          <Textarea value={f.palabras} onChange={(e) => setF({ ...f, palabras: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg-2 sm:col-span-2">
          <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activa (aparece en los formularios y filtros)
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!f.nombre.trim()}>
            <Check size={15} /> Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
