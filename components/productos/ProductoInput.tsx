"use client";

import { useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, cn, ejecutarAsync } from "@/components/ui";
import { UNIDADES } from "@/lib/empresa";
import { getSesion, puedeVer } from "@/lib/auth";
import { KEYS, r2, useStore } from "@/lib/storage";
import { buscarProducto, normalizarNombre, solicitarProducto, sugerencias, useCatalogo, type ProductoMaestro } from "@/lib/productos";
import type { StockItem } from "@/lib/types";
import type { StockLocal } from "@/lib/sucursal-modelos";

/** Lista única del catálogo (una por página, en el layout): la usan todos los ProductoInput. */
export const ID_LISTA_CATALOGO = "catalogo-maestro";

/**
 * <datalist> del catálogo maestro con el stock por almacén:
 * "TEMPLE BLANCO PATO 25KG - PROD-0001 - CPP - UND (Stock almacenes: 7 · Sucursal: 2)".
 */
export function DatalistCatalogo() {
  const { productos } = useCatalogo();
  const s = getSesion();
  const veAlmacen = !!s && (puedeVer(s, "/dashboard/almacen") || puedeVer(s, "/dashboard/compras") || puedeVer(s, "/dashboard/ventas"));
  const veSuc = !!s && puedeVer(s, "/dashboard/sucursal");
  const stock = useStore<StockItem[]>(KEYS.STOCK, [], veAlmacen);
  const stockSuc = useStore<StockLocal[]>(KEYS.SUC_STOCK, [], veSuc);
  const totales = useMemo(() => {
    const alm = new Map<string, number>();
    const suc = new Map<string, number>();
    stock.forEach((x) => alm.set(normalizarNombre(x.nombre), r2((alm.get(normalizarNombre(x.nombre)) ?? 0) + x.cantidad)));
    stockSuc.forEach((x) => suc.set(normalizarNombre(x.producto), r2((suc.get(normalizarNombre(x.producto)) ?? 0) + x.stock)));
    return { alm, suc };
  }, [stock, stockSuc]);
  return (
    <datalist id={ID_LISTA_CATALOGO}>
      {productos
        .filter((p) => p.activo)
        .map((p) => {
          const st = [veAlmacen && `Stock almacenes: ${totales.alm.get(p.nombre_normalizado) ?? 0}`, veSuc && `Sucursal: ${totales.suc.get(p.nombre_normalizado) ?? 0}`].filter(Boolean).join(" · ");
          return <option key={p.id} value={p.nombre_normalizado}>{`${p.sku}${p.marca ? ` - ${p.marca}` : ""} - ${p.unidad}${st ? ` (${st})` : ""}`}</option>;
        })}
    </datalist>
  );
}

/**
 * Campo de producto de todos los formularios (Tesorería, Almacén, Ventas, Sucursal):
 * busca en el catálogo maestro y solo acepta productos de ahí. Un nombre que no existe
 * muestra "¿Quisiste decir…?" y "Solicitar nuevo producto" (lo aprueba el administrador).
 */
export function ProductoInput({
  value,
  onChange,
  placeholder = "Buscar en el catálogo…",
  libre,
  modulo,
  className,
  ariaLabel,
  listId = ID_LISTA_CATALOGO,
}: {
  value: string;
  /** Nombre oficial (si se eligió del catálogo) o el texto que se va escribiendo. */
  onChange: (nombre: string, producto?: ProductoMaestro) => void;
  placeholder?: string;
  /** Textos válidos fuera del catálogo (p. ej. chasis de un equipo en Ventas). */
  libre?: (texto: string) => boolean;
  modulo?: string;
  className?: string;
  ariaLabel?: string;
  /** Otra lista de sugerencias (Ventas: stock del almacén + equipos por chasis). */
  listId?: string;
}) {
  const { disponible } = useCatalogo();
  const [solicitar, setSolicitar] = useState(false);
  const texto = value ?? "";
  const p = texto.trim() ? buscarProducto(texto) : undefined;
  const invalido = disponible && !!texto.trim() && !p && !libre?.(texto);
  const sug = invalido ? sugerencias(texto, 2) : [];

  /** Al escribir: si ya es el nombre oficial (elegido de la lista) se fija con su producto. */
  const escribir = (t: string) => {
    const m = buscarProducto(t);
    onChange(t, m && m.nombre_normalizado === t ? m : undefined);
  };
  /** Al salir del campo: un alias o el nombre con otras mayúsculas / espacios pasa al nombre oficial. */
  const fijar = (t: string) => {
    const m = t.trim() ? buscarProducto(t) : undefined;
    if (m) onChange(m.nombre_normalizado, m);
  };

  return (
    <div className={className}>
      <Input
        list={listId}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onBlur={(e) => fijar(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? "Producto"}
        aria-invalid={invalido || undefined}
        className={cn(invalido && "border-red-500 focus:border-red-500")}
        autoComplete="off"
      />
      {p && <p className="mt-0.5 text-[11px] text-plomo-500">{`${p.sku} · ${p.unidad}${p.marca ? ` · ${p.marca}` : ""}`}</p>}
      {invalido && (
        <div className="mt-0.5 space-y-0.5 text-[11px]">
          <p className="text-rojo">No está en el catálogo maestro.</p>
          {sug.map((s) => (
            <button key={s.p.id} type="button" onClick={() => onChange(s.p.nombre_normalizado, s.p)} className="block text-left text-blue-400 hover:underline">
              ¿Quisiste decir {s.p.nombre_normalizado} ({s.p.sku})?
            </button>
          ))}
          <button type="button" onClick={() => setSolicitar(true)} className="flex items-center gap-1 text-amber-400 hover:underline">
            <PackagePlus size={12} /> Solicitar nuevo producto maestro
          </button>
        </div>
      )}
      {solicitar && <SolicitarProducto nombre={texto} modulo={modulo} onClose={() => setSolicitar(false)} />}
    </div>
  );
}

/** Pedido de producto nuevo: va a aprobación del administrador (no se crea directo). */
export function SolicitarProducto({ nombre, modulo, onClose }: { nombre: string; modulo?: string; onClose: () => void }) {
  const [f, setF] = useState({ nombre, unidad: "UND", marca: "", categoria: "", motivo: "" });
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    const ok = await ejecutarAsync(() => solicitarProducto({ ...f, modulo, usuario: getSesion()?.usuario }), "Solicitud enviada: el administrador la revisará en Catálogo de productos");
    setEnviando(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title="Solicitar nuevo producto maestro">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre *" className="sm:col-span-2" hint="Revise antes que no exista con otro nombre (marca, medida, presentación).">
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Field>
        <Field label="Unidad">
          <Select value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
        </Field>
        <Field label="Marca">
          <Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
        </Field>
        <Field label="Categoría" className="sm:col-span-2">
          <Input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Repuesto, insumo, servicio…" />
        </Field>
        <Field label="Para qué se necesita" className="sm:col-span-2">
          <Textarea value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        </Field>
        {sugerencias(f.nombre, 3).length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200 sm:col-span-2">
            Parecidos en el catálogo: {sugerencias(f.nombre, 3).map((s) => `${s.p.nombre_normalizado} (${s.p.sku})`).join(" · ")}
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            <PackagePlus size={15} /> {enviando ? "Enviando…" : "Enviar al administrador"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
