"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar, toast } from "@/components/ui";
import { puede, soles, useRol } from "@/lib/storage";
import { MEDIOS_PAGO, TIPOS_CONDICION, clienteVacio, eliminarCliente, eliminarCondicion, guardarCliente, guardarCondicion, importarClientes, saldoCliente } from "@/lib/ventas";
import type { Cliente, CondicionPago } from "@/lib/types";
import { FormCliente, useVentas } from "./comun";

// =====================================================================
// CONFIGURACIÓN · CONDICIONES DE PAGO (tabla public.condiciones_pago)
// =====================================================================
export const condVacia = (tipo: CondicionPago["tipo"] = "CONTADO"): CondicionPago => ({
  id: "",
  codigo: "",
  nombre: "",
  tipo,
  dias: tipo === "CREDITO" ? 30 : 0,
  porcentajeInicial: 0,
  contraentrega: false,
  activo: true,
});

/** Formulario de una condición (Configuración y "+" de la nota de pedido). */
export function FormCondicion({ form, onChange, onCancel, onSave }: { form: CondicionPago; onChange: (c: CondicionPago) => void; onCancel: () => void; onSave: () => void }) {
  const set = <K extends keyof CondicionPago>(k: K, v: CondicionPago[K]) => onChange({ ...form, [k]: v });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <Field label="Tipo *" className="sm:col-span-2">
        <Select
          value={form.tipo}
          onChange={(e) => {
            const tipo = e.target.value as CondicionPago["tipo"];
            onChange({ ...form, tipo, dias: tipo === "CONTADO" ? 0 : tipo === "CREDITO" && form.dias < 1 ? 30 : form.dias, medio: tipo === "CONTADO" ? form.medio : undefined });
          }}
          options={(Object.keys(TIPOS_CONDICION) as CondicionPago["tipo"][]).map((t) => ({ value: t, label: TIPOS_CONDICION[t] }))}
        />
      </Field>
      <Field label="Código *">
        <Input value={form.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} placeholder={form.tipo === "CREDITO" ? "CRED90" : "BBVA"} />
      </Field>
      <Field label="Nombre *">
        <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder={form.tipo === "CREDITO" ? "Crédito 90 días" : "Transferencia BBVA"} />
      </Field>
      {form.tipo === "CONTADO" ? (
        <Field label="Medio de pago">
          <Select value={form.medio ?? ""} onChange={(e) => set("medio", e.target.value || undefined)} placeholder="—" options={MEDIOS_PAGO.map((m) => ({ value: m, label: m }))} />
        </Field>
      ) : (
        <Field label={form.tipo === "CREDITO" ? "Días de crédito *" : "Días por defecto"} hint="En la nota de pedido se pueden cambiar; el vencimiento se calcula solo.">
          <Input type="number" min={form.tipo === "CREDITO" ? 1 : 0} max={365} value={form.dias} onChange={(e) => set("dias", parseInt(e.target.value) || 0)} />
        </Field>
      )}
      <Field label="% inicial (adelanto)">
        <Input type="number" min={0} max={100} value={form.porcentajeInicial} onChange={(e) => set("porcentajeInicial", parseFloat(e.target.value) || 0)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.contraentrega} onChange={(e) => set("contraentrega", e.target.checked)} /> Saldo contraentrega
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.activo} onChange={(e) => set("activo", e.target.checked)} /> Activa
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="warning">
          Guardar
        </Button>
      </div>
    </form>
  );
}

export function CondicionesPago() {
  const [rol] = useRol();
  const { condiciones } = useVentas();
  const [form, setForm] = useState<CondicionPago | null>(null);
  const habilitado = puede(rol, "venta.gestionar");

  return (
    <Card>
      <CardHeader
        title="Configuración · Condiciones de pago"
        subtitle="Se usan en notas de pedido, comprobantes y como condición por defecto de cada cliente. Crédito y personalizado piden días y calculan el vencimiento."
        action={
          habilitado && (
            <Button variant="warning" onClick={() => setForm(condVacia())}>
              <Plus size={16} /> Nueva condición
            </Button>
          )
        }
      />
      <Table head={["Código", "Nombre", "Tipo", "Medio / Días", "% Inicial", "Contraentrega", "Estado", ""]} empty={condiciones.length === 0}>
        {condiciones.map((c) => (
          <tr key={c.id} className={cn("hover:bg-slate-50", !c.activo && "opacity-50")}>
            <Td className="font-mono font-semibold">{c.codigo}</Td>
            <Td>{c.nombre}</Td>
            <Td>{TIPOS_CONDICION[c.tipo]}</Td>
            <Td>{c.tipo === "CONTADO" ? c.medio || "-" : `${c.dias} días`}</Td>
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
          <FormCondicion
            form={form}
            onChange={setForm}
            onCancel={() => setForm(null)}
            onSave={() => ejecutar(() => guardarCondicion(form), "Condición guardada") && setForm(null)}
          />
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
