"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Cliente, Vendedor } from "@prisma/client";
import { Button } from "@/components/erp-comercial/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/erp-comercial/ui/dialog";
import { Field, Input, Select } from "@/components/erp-comercial/ui/input";
import { api } from "@/lib/erp-comercial/api-client";
import { ETAPAS, LABEL_ETAPA, LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";

export function ClienteForm({ cliente, vendedores, trigger }: { cliente?: Cliente; vendedores: Vendedor[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    tipoDocumento: cliente?.tipoDocumento ?? "RUC", documento: cliente?.documento ?? "", razonSocial: cliente?.razonSocial ?? "",
    contacto: cliente?.contacto ?? "", telefono: cliente?.telefono ?? "51", email: cliente?.email ?? "", direccion: cliente?.direccion ?? "",
    region: cliente?.region ?? "LIMA", tipoCliente: cliente?.tipoCliente ?? "RETAIL", vendedorId: cliente?.vendedorId ?? vendedores[0]?.id ?? "",
    limiteCredito: cliente?.limiteCredito ?? 0, creditoUsado: cliente?.creditoUsado ?? 0, diasCredito: cliente?.diasCredito ?? 0,
    etapa: cliente?.etapa ?? "PROSPECTO", optIn: cliente?.optIn ?? true,
    proximoContacto: cliente?.proximoContacto ? new Date(cliente.proximoContacto).toISOString().slice(0, 10) : "",
  });
  const set = (k: keyof typeof f, v: string | number | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function guardar() {
    setSaving(true);
    try {
      if (cliente) await api(`/erp/api/clientes/${cliente.id}`, "PUT", f);
      else await api("/erp/api/clientes", "POST", f);
      toast.success(cliente ? "Cliente actualizado" : "Cliente creado");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={cliente ? "Editar cliente" : "Nuevo cliente"} className="max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Documento">
            <Select value={f.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value)}><option>RUC</option><option>DNI</option></Select>
          </Field>
          <Field label={f.tipoDocumento === "RUC" ? "RUC (11 dígitos)" : "DNI (8 dígitos)"} className="sm:col-span-2">
            <Input value={f.documento} maxLength={f.tipoDocumento === "RUC" ? 11 : 8} onChange={(e) => set("documento", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Razón social / Nombre" className="sm:col-span-3"><Input value={f.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} /></Field>
          <Field label="Contacto"><Input value={f.contacto} onChange={(e) => set("contacto", e.target.value)} /></Field>
          <Field label="WhatsApp (51 + número)"><Input value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="51987654321" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Región"><Select value={f.region} onChange={(e) => set("region", e.target.value)}>{REGIONES.map((r) => <option key={r} value={r}>{LABEL_REGION[r]}</option>)}</Select></Field>
          <Field label="Tipo de cliente"><Select value={f.tipoCliente} onChange={(e) => set("tipoCliente", e.target.value)}>{TIPOS_CLIENTE.map((r) => <option key={r} value={r}>{LABEL_TIPO[r]}</option>)}</Select></Field>
          <Field label="Vendedor">
            <Select value={f.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}>
              <option value="">Sin asignar</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Línea de crédito (S/)"><Input type="number" value={f.limiteCredito} onChange={(e) => set("limiteCredito", Number(e.target.value))} /></Field>
          <Field label="Crédito usado (S/)"><Input type="number" value={f.creditoUsado} onChange={(e) => set("creditoUsado", Number(e.target.value))} /></Field>
          <Field label="Días de crédito"><Input type="number" value={f.diasCredito} onChange={(e) => set("diasCredito", Number(e.target.value))} /></Field>
          <Field label="Etapa CRM"><Select value={f.etapa} onChange={(e) => set("etapa", e.target.value)}>{ETAPAS.map((r) => <option key={r} value={r}>{LABEL_ETAPA[r]}</option>)}</Select></Field>
          <Field label="Próximo contacto"><Input type="date" value={f.proximoContacto} onChange={(e) => set("proximoContacto", e.target.value)} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={f.optIn} onChange={(e) => set("optIn", e.target.checked)} className="h-4 w-4 accent-[#25D366]" />
            Acepta recibir WhatsApp
          </label>
          <Field label="Dirección" className="sm:col-span-3"><Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving && <Loader2 className="animate-spin" />}Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
