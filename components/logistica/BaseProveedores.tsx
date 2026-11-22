"use client";

import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar } from "@/components/ui";
import { FiltrosPlegables } from "@/components/ui/BotonFiltros";
import { EstadoRuc } from "@/components/EstadoRuc";
import { VerificarDni } from "@/components/VerificarDni";
import { LARGO_DOCUMENTO, MAX_DOCUMENTO, TIPOS_DOCUMENTO, avisoDniDuplicado, limpiarDocumento, nombreDesdeDni, validarDocumentoPersona, type TipoDocumento } from "@/lib/dni";
import { DatalistCatalogo, ID_LISTA_CATALOGO } from "@/components/productos/ProductoInput";
import { useSesion } from "@/lib/auth";
import { KEYS, rucValido, useStore } from "@/lib/storage";
import { OPCIONES_PROVEEDOR, eliminarProveedor, guardarProveedor, proveedorVacio, proveedoresDeProducto, puedeGestionarProveedores } from "@/lib/proveedores";
import type { OpcionProveedor, Proveedor } from "@/lib/types";
import { guardarExcel } from "@/lib/guardarArchivo";

const COLOR_OPCION: Record<OpcionProveedor, string> = {
  1: "border-emerald-300 bg-emerald-50 text-emerald-800",
  2: "border-sky-300 bg-sky-50 text-sky-800",
  3: "border-amber-300 bg-amber-50 text-amber-800",
};

function ChipProducto({ nombre, opcion }: { nombre: string; opcion: OpcionProveedor }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", COLOR_OPCION[opcion])}>
      <span>{OPCIONES_PROVEEDOR.find((o) => o.value === opcion)?.corto}</span>
      <span className="font-medium">{nombre}</span>
    </span>
  );
}

/**
 * Logística · Base de proveedores (Williams 2026-11-17). Misma base para Arequipa y Secocha, y la misma lista
 * que usan Registrar compra, OC y OS. Cada producto que vende el proveedor lleva su número de opción.
 */
export function BaseProveedores() {
  const { sesion } = useSesion();
  const proveedores = useStore<Proveedor[]>(KEYS.PROVEEDORES, []);
  const [form, setForm] = useState<Proveedor | null>(null);
  const [q, setQ] = useState("");
  const [producto, setProducto] = useState("");
  const [opcion, setOpcion] = useState("");
  const habilitado = puedeGestionarProveedores(sesion);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const prod = producto.trim().toUpperCase();
    return proveedores
      .filter((p) => !t || `${p.ruc} ${p.razonSocial} ${p.asesorVentas ?? ""} ${p.contacto ?? ""} ${p.correo ?? ""}`.toLowerCase().includes(t))
      .filter((p) => !prod || (p.productos ?? []).some((x) => x.nombre.includes(prod) && (!opcion || String(x.opcion) === opcion)))
      .filter((p) => prod || !opcion || (p.productos ?? []).some((x) => String(x.opcion) === opcion));
  }, [proveedores, q, producto, opcion]);

  // Con un producto buscado: ranking de proveedores por opción (1ª arriba)
  const ranking = producto.trim() ? proveedoresDeProducto(proveedores, producto) : [];

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = lista.flatMap((p) => {
      const base = { "Tipo Doc": p.tipoDoc ?? "RUC", Documento: p.ruc, "Razon Social": p.razonSocial, "Asesor de ventas": p.asesorVentas ?? "", Contacto: p.contacto ?? "", Correo: p.correo ?? "", Direccion: p.direccion ?? "", Estado: p.estado ?? "ACTIVO" };
      const prods = p.productos?.length ? p.productos : [{ nombre: "", opcion: 0 }];
      return prods.map((x) => ({ ...base, Producto: x.nombre, Opcion: x.opcion ? `${x.opcion}ª opción` : "" }));
    });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Proveedores");
    await guardarExcel(libro, "base-proveedores.xlsx");
  };

  const completos = proveedores.filter((p) => (p.productos ?? []).length > 0).length;

  return (
    <Card>
      <CardHeader
        title="Base de proveedores"
        subtitle={`Arequipa y Secocha comparten esta base. ${proveedores.length} proveedor(es), ${completos} con productos registrados. Los creados al registrar compras aparecen aquí para completar su ficha.`}
        action={
          <div className="flex flex-wrap gap-2">
            <FiltrosPlegables activos={(q ? 1 : 0) + (producto ? 1 : 0) + (opcion ? 1 : 0)}>
              <Input placeholder="RUC, razón social, asesor…" value={q} onChange={(e) => setQ(e.target.value)} className="w-52" aria-label="Buscar" autoFocus />
              <Input placeholder="Producto que vende…" value={producto} onChange={(e) => setProducto(e.target.value)} className="w-52" aria-label="Producto" list={ID_LISTA_CATALOGO} />
              <Select
                value={opcion}
                onChange={(e) => setOpcion(e.target.value)}
                aria-label="Opción"
                className="w-40"
                placeholder="Toda opción"
                options={OPCIONES_PROVEEDOR.map((o) => ({ value: String(o.value), label: o.label }))}
              />
            </FiltrosPlegables>
            <Button variant="secondary" onClick={() => void exportar()} disabled={lista.length === 0}>
              <Download size={16} /> Excel
            </Button>
            {habilitado && (
              <Button variant="warning" onClick={() => setForm(proveedorVacio())}>
                <Plus size={16} /> Nuevo proveedor
              </Button>
            )}
          </div>
        }
      />
      <DatalistCatalogo />

      {ranking.length > 0 && (
        <div className="mx-5 my-3 rounded-lg border border-plomo-200 bg-plomo-50 p-3 text-sm">
          <p className="mb-1.5 font-semibold text-fg">¿A quién comprar «{producto.trim().toUpperCase()}»?</p>
          <ol className="space-y-1">
            {ranking.map(({ proveedor: p, producto: x }) => (
              <li key={`${p.id}-${x.nombre}`} className="flex flex-wrap items-center gap-2">
                <ChipProducto nombre={x.nombre} opcion={x.opcion} />
                <span className="font-semibold text-fg">{p.razonSocial}</span>
                <span className="text-xs text-plomo-500">{[p.asesorVentas, p.contacto].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Table head={["Documento", "Razón social / Dirección", "Asesor de ventas / Contacto", "Productos que vende (opción)", "Estado", ""]} empty={lista.length === 0}>
        {lista.map((p) => (
          <tr key={p.id} className={cn("hover:bg-plomo-50", p.estado === "INACTIVO" && "opacity-50")}>
            <Td className="whitespace-nowrap font-mono">
              {p.tipoDoc && p.tipoDoc !== "RUC" && <span className="mr-1 text-xs text-plomo-500">{p.tipoDoc}</span>}
              {p.ruc}
            </Td>
            <Td>
              <p className="font-semibold text-fg">{p.razonSocial}</p>
              <p className="max-w-xs text-xs text-plomo-500">{p.direccion || "-"}</p>
            </Td>
            <Td>
              <p>{p.asesorVentas || "-"}</p>
              <p className="text-xs text-plomo-500">{[p.contacto, p.correo].filter(Boolean).join(" · ") || "-"}</p>
            </Td>
            <Td>
              {(p.productos ?? []).length === 0 ? (
                <span className="text-xs text-amber-700">Completar ficha</span>
              ) : (
                <div className="flex max-w-md flex-wrap gap-1">
                  {[...(p.productos ?? [])]
                    .sort((a, b) => a.opcion - b.opcion)
                    .map((x) => (
                      <ChipProducto key={x.nombre} nombre={x.nombre} opcion={x.opcion} />
                    ))}
                </div>
              )}
            </Td>
            <Td>{p.estado === "INACTIVO" ? "Inactivo" : "Activo"}</Td>
            <Td>
              {habilitado && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Editar"
                    onClick={() => setForm({ ...proveedorVacio(), ...p, productos: p.productos?.length ? p.productos.map((x) => ({ ...x })) : [{ nombre: "", opcion: 1 }] })}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" title="Eliminar" onClick={() => confirm(`¿Eliminar a ${p.razonSocial}?`) && ejecutar(() => eliminarProveedor(p.id), "Proveedor eliminado")}>
                    <Trash2 size={14} className="text-red-600" />
                  </Button>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar proveedor" : "Nuevo proveedor"} wide>
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ejecutar(() => guardarProveedor(form), "Proveedor guardado")) setForm(null);
            }}
            className="space-y-4"
          >
            <FormProveedor form={form} onChange={setForm} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="warning">
                Guardar proveedor
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

function FormProveedor({ form, onChange }: { form: Proveedor; onChange: (p: Proveedor) => void }) {
  const set = <K extends keyof Proveedor>(k: K, v: Proveedor[K]) => onChange({ ...form, [k]: v });
  const productos = form.productos ?? [];
  const setProd = (i: number, cambio: Partial<{ nombre: string; opcion: OpcionProveedor }>) =>
    set(
      "productos",
      productos.map((x, j) => (j === i ? { ...x, ...cambio } : x)),
    );
  const rucMal = form.ruc.length === 11 && !rucValido(form.ruc);
  const tipo: TipoDocumento = form.tipoDoc ?? "RUC";
  const errDoc = tipo !== "RUC" && form.ruc ? validarDocumentoPersona(tipo, form.ruc) : null;
  const todos = useStore<Proveedor[]>(KEYS.PROVEEDORES, []);
  const dupDni = tipo === "DNI" ? avisoDniDuplicado(form.ruc, todos.filter((p) => p.id !== form.id), (p) => p.ruc, (p) => p.razonSocial) : null;
  const setPersona = (cambio: Partial<Pick<Proveedor, "nombres" | "apellidoPaterno" | "apellidoMaterno">>) => {
    const x = { ...form, ...cambio };
    onChange({ ...x, razonSocial: [x.nombres, x.apellidoPaterno, x.apellidoMaterno].map((t) => (t ?? "").trim()).filter(Boolean).join(" ").toUpperCase() });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tipo documento *">
        <Select
          value={tipo}
          onChange={(e) => {
            const t = e.target.value as TipoDocumento;
            onChange({ ...form, tipoDoc: t, ruc: limpiarDocumento(t, form.ruc), dniVerificadoAt: undefined });
          }}
          options={TIPOS_DOCUMENTO}
        />
      </Field>
      {tipo === "RUC" ? (
        <Field label="RUC *" hint={rucMal ? "Dígito verificador inválido" : "11 dígitos · se valida en SUNAT y completa razón social y dirección"}>
          <Input
            value={form.ruc}
            inputMode="numeric"
            maxLength={11}
            onChange={(e) => set("ruc", e.target.value.replace(/\D/g, ""))}
            className={cn(form.ruc && (rucMal || form.ruc.length !== 11 ? "border-red-400" : "border-emerald-400"))}
            autoFocus={!form.id}
          />
          <EstadoRuc
            ruc={form.ruc}
            onValidado={(r) => onChange({ ...form, razonSocial: form.razonSocial.trim() || r.razon_social, direccion: (form.direccion ?? "").trim() || r.direccion })}
          />
        </Field>
      ) : (
        <Field label={`${tipo === "PASAPORTE" ? "Pasaporte" : tipo} *`} hint={dupDni ?? errDoc ?? (tipo === "DNI" ? "8 dígitos · pulse Verificar para traer nombres y apellidos de RENIEC" : LARGO_DOCUMENTO[tipo])}>
          <Input
            value={form.ruc}
            inputMode={tipo === "DNI" ? "numeric" : "text"}
            maxLength={MAX_DOCUMENTO[tipo]}
            onChange={(e) => onChange({ ...form, ruc: limpiarDocumento(tipo, e.target.value), dniVerificadoAt: undefined })}
            className={cn(form.ruc && (errDoc || dupDni ? "border-red-400" : "border-emerald-400"))}
            autoFocus={!form.id}
          />
          {tipo === "DNI" && (
            <VerificarDni
              dni={form.ruc}
              verificadoAt={form.dniVerificadoAt}
              onVerificado={(r) =>
                onChange({ ...form, nombres: r.nombres, apellidoPaterno: r.apellidoPaterno, apellidoMaterno: r.apellidoMaterno, razonSocial: nombreDesdeDni(r), dniVerificadoAt: r.verificadoAt })
              }
            />
          )}
        </Field>
      )}
      {tipo !== "RUC" && (
        <>
          <Field label="Nombres">
            <Input value={form.nombres ?? ""} onChange={(e) => setPersona({ nombres: e.target.value })} />
          </Field>
          <Field label="Apellido paterno">
            <Input value={form.apellidoPaterno ?? ""} onChange={(e) => setPersona({ apellidoPaterno: e.target.value })} />
          </Field>
          <Field label="Apellido materno">
            <Input value={form.apellidoMaterno ?? ""} onChange={(e) => setPersona({ apellidoMaterno: e.target.value })} />
          </Field>
        </>
      )}
      <Field label={tipo === "RUC" ? "Razón social *" : "Nombre completo *"}>
        <Input value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} />
      </Field>
      <Field label="Asesor de ventas">
        <Input value={form.asesorVentas ?? ""} onChange={(e) => set("asesorVentas", e.target.value)} placeholder="Nombre del vendedor que nos atiende" />
      </Field>
      <Field label="Contacto (celular / teléfono)">
        <Input value={form.contacto ?? ""} onChange={(e) => set("contacto", e.target.value)} inputMode="tel" />
      </Field>
      <Field label="Correo (opcional)">
        <Input type="email" value={form.correo ?? ""} onChange={(e) => set("correo", e.target.value)} />
      </Field>
      <Field label="Estado">
        <Select value={form.estado ?? "ACTIVO"} onChange={(e) => set("estado", e.target.value as Proveedor["estado"])} options={[{ value: "ACTIVO", label: "Activo" }, { value: "INACTIVO", label: "Inactivo" }]} />
      </Field>
      <Field label="Dirección" className="sm:col-span-2">
        <Input value={form.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} />
      </Field>

      <div className="sm:col-span-2">
        <p className="mb-1 text-sm font-medium text-slate-700">Productos que vende *</p>
        <p className="mb-2 text-xs text-plomo-500">Para cada producto indique si este proveedor es la primera, segunda o tercera opción de compra.</p>
        <div className="space-y-2">
          {productos.map((x, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_9.5rem_auto] items-center gap-2">
              <Input
                value={x.nombre}
                onChange={(e) => setProd(i, { nombre: e.target.value })}
                list={ID_LISTA_CATALOGO}
                placeholder="Producto o rubro (p. ej. PERNOS, PINTURA, NEUMÁTICOS)"
                aria-label={`Producto ${i + 1}`}
              />
              <Select
                value={String(x.opcion)}
                onChange={(e) => setProd(i, { opcion: Number(e.target.value) as OpcionProveedor })}
                aria-label={`Opción del producto ${i + 1}`}
                options={OPCIONES_PROVEEDOR.map((o) => ({ value: String(o.value), label: o.label }))}
              />
              <Button type="button" size="sm" variant="ghost" title="Quitar" onClick={() => set("productos", productos.filter((_, j) => j !== i))} disabled={productos.length === 1}>
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={() => set("productos", [...productos, { nombre: "", opcion: 1 }])}>
          <Plus size={14} /> Agregar producto
        </Button>
      </div>
    </div>
  );
}
