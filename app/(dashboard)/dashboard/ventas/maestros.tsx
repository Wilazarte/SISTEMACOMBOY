"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Table, Td, cn, ejecutar, toast } from "@/components/ui";
import { puede, soles, useRol } from "@/lib/storage";
import { clienteVacio, eliminarCliente, eliminarCondicion, guardarCliente, guardarCondicion, importarClientes, saldoCliente } from "@/lib/ventas";
import type { Cliente, CondicionPago } from "@/lib/types";
import { FormCliente, useVentas } from "./comun";

// =====================================================================
// CONDICIONES DE PAGO
// =====================================================================
const condVacia = (): CondicionPago => ({ id: "", codigo: "", nombre: "", dias: 0, porcentajeInicial: 0, contraentrega: false, activo: true });

export function CondicionesPago() {
  const [rol] = useRol();
  const { condiciones } = useVentas();
  const [form, setForm] = useState<CondicionPago | null>(null);
  const habilitado = puede(rol, "venta.gestionar");
  const lista = [...condiciones].sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre));

  return (
    <Card>
      <CardHeader
        title="Condiciones de pago"
        subtitle="Se usan en notas de pedido, comprobantes y como condición por defecto de cada cliente."
        action={
          habilitado && (
            <Button variant="warning" onClick={() => setForm(condVacia())}>
              <Plus size={16} /> Nueva condición
            </Button>
          )
        }
      />
      <Table head={["Código", "Nombre", "Días", "% Inicial", "Contraentrega", "Estado", ""]} empty={lista.length === 0}>
        {lista.map((c) => (
          <tr key={c.id} className={cn("hover:bg-slate-50", !c.activo && "opacity-50")}>
            <Td className="font-mono font-semibold">{c.codigo}</Td>
            <Td>{c.nombre}</Td>
            <Td className="text-right">{c.dias}</Td>
            <Td className="text-right">{c.porcentajeInicial}%</Td>
            <Td>{c.contraentrega ? "Sí" : "No"}</Td>
            <Td>
              <Badge estado={c.activo ? "ACTIVO" : "INACTIVO"} />
            </Td>
            <Td>
              {habilitado && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setForm({ ...c })} title="Editar">
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" title="Eliminar" onClick={() => confirm(`¿Eliminar ${c.nombre}?`) && ejecutar(() => eliminarCondicion(c.id), "Condición eliminada")}>
                    <Trash2 size={14} className="text-red-600" />
                  </Button>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar condición de pago" : "Nueva condición de pago"}>
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ejecutar(() => guardarCondicion(form), "Condición guardada")) setForm(null);
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label="Código *">
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="CRED30" />
            </Field>
            <Field label="Nombre *">
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Crédito 30 días" />
            </Field>
            <Field label="Días de crédito" hint="0 = contado">
              <Input type="number" min={0} value={form.dias} onChange={(e) => setForm({ ...form, dias: parseInt(e.target.value) || 0 })} />
            </Field>
            <Field label="% inicial (adelanto)">
              <Input type="number" min={0} max={100} value={form.porcentajeInicial} onChange={(e) => setForm({ ...form, porcentajeInicial: parseFloat(e.target.value) || 0 })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.contraentrega} onChange={(e) => setForm({ ...form, contraentrega: e.target.checked })} /> Saldo contraentrega
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activa
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="warning">
                Guardar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

// =====================================================================
// CLIENTES
// =====================================================================
export function Clientes() {
  const [rol] = useRol();
  const { clientes, condiciones } = useVentas();
  const [form, setForm] = useState<Cliente | null>(null);
  const [q, setQ] = useState("");
  const habilitado = puede(rol, "venta.gestionar");
  const lista = clientes.filter((c) => !q || `${c.numDoc} ${c.razonSocial} ${c.contacto}`.toLowerCase().includes(q.toLowerCase()));

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const r = importarClientes(filas);
      toast(`Clientes: ${r.creados} nuevo(s), ${r.actualizados} actualizado(s)${r.errores.length ? ` · ${r.errores.length} con error` : ""}`, r.errores.length && !r.creados && !r.actualizados ? "error" : "ok");
      if (r.errores.length) console.warn("Errores de importación de clientes:", r.errores);
    } catch {
      toast("No se pudo leer el Excel de clientes.", "error");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Clientes"
        subtitle="Columnas para importar: Tipo Doc, Numero, Razon Social, Direccion, Telefono, Email, Contacto, Linea Credito."
        action={
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
            {habilitado && (
              <>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Upload size={16} /> Importar Excel
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importar} />
                </label>
                <Button variant="warning" onClick={() => setForm(clienteVacio())}>
                  <Plus size={16} /> Nuevo cliente
                </Button>
              </>
            )}
          </div>
        }
      />
      <Table head={["Documento", "Razón social / Nombres", "Contacto", "Cond. pago", "Línea crédito", "Saldo", "Estado", ""]} empty={lista.length === 0}>
        {lista.map((c) => {
          const saldo = saldoCliente(c.id);
          return (
            <tr key={c.id} className={cn("hover:bg-slate-50", c.estado === "INACTIVO" && "opacity-50")}>
              <Td className="font-mono">
                {c.tipoDoc} {c.numDoc}
              </Td>
              <Td>
                <p className="font-semibold text-slate-900">{c.razonSocial}</p>
                <p className="max-w-xs truncate text-xs text-slate-500">{c.direccionFiscal || "-"}</p>
              </Td>
              <Td>
                {c.contacto || "-"}
                <p className="text-xs text-slate-500">{[c.telefono, c.email].filter(Boolean).join(" · ")}</p>
              </Td>
              <Td>{condiciones.find((x) => x.id === c.condPagoId)?.nombre ?? "-"}</Td>
              <Td className="text-right">{c.lineaCredito > 0 ? soles(c.lineaCredito) : "Sin límite"}</Td>
              <Td className={cn("text-right", saldo > 0 && "font-semibold text-red-600")}>{soles(saldo)}</Td>
              <Td>
                <Badge estado={c.estado} />
              </Td>
              <Td>
                {habilitado && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setForm({ ...c, direccionesEntrega: [...c.direccionesEntrega] })} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" title="Eliminar" onClick={() => confirm(`¿Eliminar a ${c.razonSocial}?`) && ejecutar(() => eliminarCliente(c.id), "Cliente eliminado")}>
                      <Trash2 size={14} className="text-red-600" />
                    </Button>
                  </div>
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar cliente" : "Nuevo cliente"}>
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ejecutar(() => guardarCliente(form), "Cliente guardado")) setForm(null);
            }}
            className="space-y-4"
          >
            <FormCliente form={form} onChange={setForm} condiciones={condiciones} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="warning">
                Guardar cliente
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}
