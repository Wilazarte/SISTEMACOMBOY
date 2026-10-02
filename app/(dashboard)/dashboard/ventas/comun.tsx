"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, UserPlus } from "lucide-react";
import { Button, Field, Input, Select, cn } from "@/components/ui";
import { UNIDADES } from "@/lib/empresa";
import { KEYS, cargarCondicionesPago, r2, soles, useStore } from "@/lib/storage";
import { LARGO_DOC, calcularLinea, lineaVacia, totalesVenta, validarDocumento } from "@/lib/ventas";
import type { Cliente, CondicionPago, LineaVenta, StockItem, TipoDocCliente } from "@/lib/types";

/** Datos de Ventas sincronizados con Supabase (tiempo real). */
export function useVentas() {
  return {
    clientes: useStore<Cliente[]>(KEYS.CLIENTES, []),
    condiciones: useStore<CondicionPago[]>(KEYS.COND_PAGO, []),
    stock: useStore<StockItem[]>(KEYS.STOCK, []),
  };
}

/**
 * Lee condiciones_pago directo de Supabase (select * order by nombre) cada vez que cambia `clave`
 * (al entrar a Ventas y al abrir la nota de pedido) y devuelve el estado para mostrar avisos.
 */
export function useCargaCondiciones(clave: unknown = 0) {
  const [estado, setEstado] = useState<{ cargando: boolean; total: number; error?: string }>({ cargando: true, total: 0 });
  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, cargando: true }));
    cargarCondicionesPago()
      .then((r) => vivo && setEstado({ cargando: false, ...r }))
      .catch((e) => vivo && setEstado({ cargando: false, total: 0, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      vivo = false;
    };
  }, [clave]);
  return estado;
}

/** Aviso bajo el select cuando no llegan condiciones (error real de Supabase o 0 filas por RLS). */
export function AvisoCondiciones({ carga, activas }: { carga: ReturnType<typeof useCargaCondiciones>; activas: number }) {
  if (carga.cargando || activas > 0) return null;
  const msg = carga.error
    ? carga.error
    : carga.total === 0
      ? "Supabase devolvió 0 condiciones para su usuario. Si la tabla tiene datos, falta la política de lectura (RLS): ejecute supabase/condiciones_pago.sql."
      : "Todas las condiciones están inactivas: active alguna en Ventas › Configuración.";
  return <span className="mt-1 block text-xs font-medium text-red-600">{msg}</span>;
}

// ---------------------------------------------------------------- Líneas
export function LineasEditor({ items, onChange, stock }: { items: LineaVenta[]; onChange: (l: LineaVenta[]) => void; stock: StockItem[] }) {
  // Productos de Almacén (nombre + unidad), sin repetir por sede
  const productos = useMemo(() => {
    const m = new Map<string, { nombre: string; unidad: string; cantidad: number }>();
    stock.forEach((s) => {
      const k = `${s.nombre}|${s.unidad}`;
      const p = m.get(k);
      m.set(k, { nombre: s.nombre, unidad: s.unidad, cantidad: r2((p?.cantidad ?? 0) + s.cantidad) });
    });
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [stock]);

  const set = (id: string, cambios: Partial<LineaVenta>) => onChange(items.map((l) => (l.id === id ? calcularLinea({ ...l, ...cambios }) : l)));
  const elegirProducto = (id: string, nombre: string) => {
    const p = productos.find((x) => x.nombre === nombre.trim().toUpperCase());
    const actual = items.find((l) => l.id === id);
    set(id, p ? { productoNombre: p.nombre, unidad: p.unidad, descripcion: actual?.descripcion || p.nombre } : { productoNombre: nombre });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-8 px-2 py-2 text-left">#</th>
              <th className="w-48 px-2 py-2 text-left">Producto (Almacén)</th>
              <th className="px-2 py-2 text-left">Descripción *</th>
              <th className="w-20 px-2 py-2 text-left">Und.</th>
              <th className="w-20 px-2 py-2 text-left">Ancho m</th>
              <th className="w-20 px-2 py-2 text-left">Alto m</th>
              <th className="w-20 px-2 py-2 text-left">Cant. *</th>
              <th className="w-16 px-2 py-2 text-right">m²</th>
              <th className="w-28 px-2 py-2 text-left">Precio *</th>
              <th className="w-28 px-2 py-2 text-right">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((l, k) => (
              <tr key={l.id}>
                <td className="px-2 py-1.5 text-slate-400">{k + 1}</td>
                <td className="px-2 py-1.5">
                  <Input value={l.productoNombre} list="productos-almacen" placeholder="Buscar…" onChange={(e) => elegirProducto(l.id, e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input value={l.descripcion} onChange={(e) => set(l.id, { descripcion: e.target.value })} placeholder="Vidrio templado incoloro 8mm / Instalación" />
                </td>
                <td className="px-2 py-1.5">
                  <Select value={l.unidad} onChange={(e) => set(l.id, { unidad: e.target.value })} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
                </td>
                {(["ancho", "alto", "cantidad"] as const).map((c) => (
                  <td key={c} className="px-2 py-1.5">
                    <Input type="number" min={0} step="any" value={l[c] || ""} onChange={(e) => set(l.id, { [c]: parseFloat(e.target.value) || 0 })} className="text-right" aria-label={c} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono text-slate-600">{l.m2 > 0 ? l.m2.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} step="0.01" value={l.precio || ""} onChange={(e) => set(l.id, { precio: parseFloat(e.target.value) || 0 })} className="text-right" title={l.m2 > 0 ? "Precio por m²" : "Precio por unidad"} aria-label="precio" />
                </td>
                <td className="px-2 py-1.5 text-right font-medium">{soles(l.total)}</td>
                <td className="px-2 py-1.5">
                  <button onClick={() => onChange(items.length > 1 ? items.filter((x) => x.id !== l.id) : [lineaVacia()])} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Quitar línea">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="productos-almacen">
          {productos.map((p) => (
            <option key={`${p.nombre}|${p.unidad}`} value={p.nombre}>{`${p.unidad} · stock ${p.cantidad}`}</option>
          ))}
        </datalist>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={() => onChange([...items, lineaVacia()])}>
          <Plus size={14} /> Agregar línea
        </Button>
        <p className="text-xs text-slate-500">Con medidas: m² = ancho × alto × cantidad y precio por m². Sin medidas (ej. instalación): precio por unidad.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Totales
export function TotalesVenta({ items, conIgv, descuento }: { items: LineaVenta[]; conIgv: boolean; descuento: number }) {
  const t = totalesVenta(items, conIgv, descuento);
  return (
    <dl className="ml-auto w-72 space-y-1 text-sm">
      <div className="flex justify-between text-slate-600">
        <dt>Subtotal</dt>
        <dd>{soles(t.bruto)}</dd>
      </div>
      {t.descuento > 0 && (
        <div className="flex justify-between text-red-600">
          <dt>Descuento</dt>
          <dd>- {soles(t.descuento)}</dd>
        </div>
      )}
      <div className="flex justify-between text-slate-600">
        <dt>{conIgv ? "Base imponible" : "Base (sin IGV)"}</dt>
        <dd>{soles(t.base)}</dd>
      </div>
      <div className="flex justify-between text-slate-600">
        <dt>IGV 18%</dt>
        <dd>{soles(t.igv)}</dd>
      </div>
      <div className="flex justify-between rounded-lg bg-slate-900 px-3 py-2 font-bold text-white">
        <dt>TOTAL</dt>
        <dd className="text-amber-400">{soles(t.total)}</dd>
      </div>
    </dl>
  );
}

// ---------------------------------------------------------------- Cliente
/** Buscador de cliente por RUC/DNI o nombre + botón de registro rápido. */
export function SelectorCliente({
  clientes,
  value,
  onChange,
  onNuevo,
  soloRuc,
}: {
  clientes: Cliente[];
  value: string;
  onChange: (id: string) => void;
  onNuevo?: () => void;
  soloRuc?: boolean;
}) {
  const [q, setQ] = useState("");
  const lista = clientes
    .filter((c) => c.estado === "ACTIVO" && (!soloRuc || c.tipoDoc === "RUC"))
    .filter((c) => !q || `${c.numDoc} ${c.razonSocial}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);
  const sel = clientes.find((c) => c.id === value);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar RUC / DNI / nombre…" className="pl-8" />
        </div>
        {onNuevo && (
          <Button type="button" variant="secondary" onClick={onNuevo} title="Registro rápido de cliente">
            <UserPlus size={16} />
          </Button>
        )}
      </div>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={lista.length ? "Seleccione cliente…" : soloRuc ? "Sin clientes con RUC" : "Sin coincidencias"}
        options={[...(sel && !lista.includes(sel) ? [sel] : []), ...lista].map((c) => ({ value: c.id, label: `${c.tipoDoc} ${c.numDoc} · ${c.razonSocial}` }))}
      />
    </div>
  );
}

/** Formulario de cliente (completo o rápido). */
export function FormCliente({
  form,
  onChange,
  condiciones,
  rapido,
}: {
  form: Cliente;
  onChange: (c: Cliente) => void;
  condiciones: CondicionPago[];
  rapido?: boolean;
}) {
  const set = <K extends keyof Cliente>(k: K, v: Cliente[K]) => onChange({ ...form, [k]: v });
  const errDoc = form.numDoc ? validarDocumento(form.tipoDoc, form.numDoc.trim().toUpperCase()) : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tipo doc. *">
        <Select value={form.tipoDoc} onChange={(e) => set("tipoDoc", e.target.value as TipoDocCliente)} options={(["RUC", "DNI", "CE"] as const).map((t) => ({ value: t, label: t }))} />
      </Field>
      <Field label="Número *" hint={errDoc ?? `${LARGO_DOC[form.tipoDoc]} · Autocompletado SUNAT no disponible: ingrese los datos manualmente.`}>
        <Input
          value={form.numDoc}
          inputMode={form.tipoDoc === "CE" ? "text" : "numeric"}
          maxLength={form.tipoDoc === "RUC" ? 11 : form.tipoDoc === "DNI" ? 8 : 12}
          onChange={(e) => set("numDoc", form.tipoDoc === "CE" ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
          className={cn(form.numDoc && (errDoc ? "border-red-400" : "border-emerald-400"))}
        />
      </Field>
      <Field label={form.tipoDoc === "RUC" ? "Razón social *" : "Nombres y apellidos *"} className="sm:col-span-2">
        <Input value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} />
      </Field>
      <Field label="Dirección fiscal" className="sm:col-span-2">
        <Input value={form.direccionFiscal} onChange={(e) => set("direccionFiscal", e.target.value)} />
      </Field>
      <Field label="Teléfono">
        <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
      </Field>
      <Field label="Email">
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      {!rapido && (
        <>
          <Field label="Contacto">
            <Input value={form.contacto} onChange={(e) => set("contacto", e.target.value)} />
          </Field>
          <Field label="Condición de pago por defecto">
            <Select
              value={form.condPagoId}
              onChange={(e) => set("condPagoId", e.target.value)}
              placeholder="(ninguna)"
              options={condiciones.filter((c) => c.activo).map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </Field>
          <Field label="Línea de crédito S/" hint="0 = sin límite">
            <Input type="number" min={0} step="0.01" value={form.lineaCredito || ""} onChange={(e) => set("lineaCredito", parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Estado">
            <Select value={form.estado} onChange={(e) => set("estado", e.target.value as Cliente["estado"])} options={[{ value: "ACTIVO", label: "Activo" }, { value: "INACTIVO", label: "Inactivo" }]} />
          </Field>
          <Field label="Direcciones de obra / entrega (una por línea)" className="sm:col-span-2">
            <textarea
              value={form.direccionesEntrega.join("\n")}
              onChange={(e) => set("direccionesEntrega", e.target.value.split("\n"))}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </Field>
        </>
      )}
    </div>
  );
}

export const CUENTAS_COBRO = ["Caja principal", "BCP Soles", "Interbank Soles", "BBVA Soles", "Yape / Plin"];
