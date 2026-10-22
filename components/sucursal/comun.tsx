"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Input, cn } from "@/components/ui";
import { UNIDADES } from "@/lib/empresa";
import { ProductoInput } from "@/components/productos/ProductoInput";
import { r2, soles, uid } from "@/lib/storage";
import { buscarProducto } from "@/lib/productos";
import type { EstadoDerivacion, EstadoReqSuc, EstadoTraslado, EstadoVenta, StockLocal } from "@/lib/sucursal";

/** Estados de la sucursal -> claves de Badge (components/ui TONO_ESTADO). */
const BADGE: Record<EstadoVenta | EstadoTraslado | EstadoDerivacion | EstadoReqSuc, string> = {
  registrada: "POR_ENTREGAR",
  entregada: "ENTREGADA",
  derivada: "DERIVADA",
  cerrada: "CERRADA",
  "en-camino": "EN_CAMINO",
  recibido: "RECIBIDO",
  observado: "OBSERVADO",
  pendiente: "PENDIENTE",
  "en-preparacion": "EN_PREPARACION",
  convertida: "CONVERTIDA",
  anulada: "ANULADA",
  enviado: "ENVIADO",
  "en-traslado": "EN_TRASLADO",
  cerrado: "CERRADO",
};
export const EstadoSuc = ({ estado }: { estado: keyof typeof BADGE }) => <Badge estado={BADGE[estado] ?? estado.toUpperCase()} />;

/** Tarjeta de indicador (Caja Chica, Stock, Reportes). */
export function Indicador({ label, valor, detalle, alerta, icon }: { label: string; valor: string; detalle?: string; alerta?: boolean; icon?: ReactNode }) {
  return (
    <div className={cn("rounded-xl border bg-surface/80 p-4 shadow-card backdrop-blur-xl", alerta ? "border-red-500/50" : "border-plomo-200")}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-plomo-500">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold", alerta ? "text-rojo" : "text-fg")}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-plomo-500">{detalle}</p>}
    </div>
  );
}

/** Acciones de una fila: botones compactos. */
export function Acciones({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1">{children}</div>;
}

export interface LineaEdit {
  key: string;
  productoId?: string;
  producto: string;
  unidad: string;
  cantidad: string;
  precio: string;
}
export const lineaVacia = (): LineaEdit => ({ key: uid(), producto: "", unidad: "UND", cantidad: "1", precio: "" });

/**
 * Editor de productos (venta, requerimiento, OT). Escribir un producto del stock local lo enlaza
 * (descuenta / suma stock y trae precio y unidad); otro texto queda como servicio o producto sin stock.
 */
export function LineasEditor({ lineas, onChange, stock, conPrecio = true }: { lineas: LineaEdit[]; onChange: (l: LineaEdit[]) => void; stock: StockLocal[]; conPrecio?: boolean }) {
  const set = (key: string, cambio: Partial<LineaEdit>) => onChange(lineas.map((l) => (l.key === key ? { ...l, ...cambio } : l)));
  const elegir = (key: string, texto: string) => {
    const s = stock.find((x) => x.producto.toUpperCase() === texto.trim().toUpperCase());
    const m = buscarProducto(texto);
    set(key, s ? { producto: s.producto, productoId: s.id, unidad: s.unidad, ...(conPrecio && s.precio > 0 ? { precio: String(s.precio) } : {}) } : { producto: texto, productoId: undefined, ...(m && m.nombre_normalizado === texto ? { unidad: m.unidad } : {}) });
  };
  const total = r2(lineas.reduce((a, l) => a + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0));
  return (
    <div className="space-y-2">
      {lineas.map((l, i) => {
        const s = l.productoId ? stock.find((x) => x.id === l.productoId) : undefined;
        const falta = !!l.producto.trim() && (!s || s.stock < (Number(l.cantidad) || 0));
        return (
          <div key={l.key} className="grid grid-cols-12 items-start gap-2">
            <div className="col-span-12 sm:col-span-5">
              <ProductoInput value={l.producto} onChange={(nombre) => elegir(l.key, nombre)} placeholder={`Producto ${i + 1} (catálogo)`} ariaLabel={`Producto ${i + 1}`} modulo="Sucursal" />
              {l.producto.trim() && (
                <p className={cn("mt-0.5 text-[11px]", falta ? "text-amber-500" : "text-plomo-500")}>
                  {s ? `Stock local: ${s.stock} ${s.unidad}${falta ? " · no alcanza" : ""}` : "Sin stock local (servicio o se pide al Taller)"}
                </p>
              )}
            </div>
            <select value={l.unidad} onChange={(e) => set(l.key, { unidad: e.target.value })} className="col-span-3 h-[38px] rounded-lg border border-plomo-200 bg-surface px-2 text-sm text-fg sm:col-span-2" aria-label="Unidad">
              {UNIDADES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <Input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => set(l.key, { cantidad: e.target.value })} className="col-span-3 sm:col-span-2" aria-label="Cantidad" placeholder="Cant." />
            {conPrecio && (
              <Input type="number" min="0" step="0.01" value={l.precio} onChange={(e) => set(l.key, { precio: e.target.value })} className="col-span-4 sm:col-span-2" aria-label="Precio unitario" placeholder="Precio" />
            )}
            <button
              type="button"
              onClick={() => onChange(lineas.length > 1 ? lineas.filter((x) => x.key !== l.key) : [lineaVacia()])}
              className="col-span-2 flex h-[38px] items-center justify-center rounded-lg text-plomo-500 hover:bg-plomo-100 hover:text-rojo sm:col-span-1"
              aria-label="Quitar producto"
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      })}
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...lineas, lineaVacia()])}>
          <Plus size={14} /> Agregar producto
        </Button>
        {conPrecio && <span className="text-sm font-semibold text-fg">Total {soles(total)}</span>}
      </div>
    </div>
  );
}

/** Líneas del editor -> datos para lib/sucursal (sin las vacías). */
export const deLineas = (lineas: LineaEdit[]) =>
  lineas
    .filter((l) => l.producto.trim())
    .map((l) => ({ productoId: l.productoId, producto: l.producto.trim(), unidad: l.unidad, cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 }));
