"use client";

// Ventas › Guías de Remisión (remitente, serie T005): emitir, Enviar SUNAT, Consultar y PDF · XML · CDR.

import { useState } from "react";
import { FilePlus2, Plus, RefreshCw, Send, Trash2, UploadCloud } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Textarea, cn, toast } from "@/components/ui";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { getSesion } from "@/lib/auth";
import { UNIDADES } from "@/lib/empresa";
import {
  MOTIVOS_TRASLADO,
  SERIE_GUIA,
  consultarGuiaSunat,
  crearGuia,
  enviarGuiaSunat,
  guiaVacia,
  lineaGuiaVacia,
  motivoLabel,
  type DatosGuia,
} from "@/lib/guias";
import { KEYS, previewNumero, puede, useRol, useStore } from "@/lib/storage";
import type { ComprobanteVenta, GuiaRemision } from "@/lib/types";
import { ArchivosSunat } from "./archivosSunat";
import { SelectorCliente, useVentas } from "./comun";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

const TONO: Record<string, string> = {
  ACEPTADO: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  OBSERVADO: "bg-lime-50 text-lime-800 ring-lime-600/30",
  RECHAZADO: "bg-red-50 text-red-700 ring-red-600/20",
  NO_ENVIADO: "bg-amber-50 text-amber-800 ring-amber-600/30",
  ENVIADO: "bg-sky-50 text-sky-800 ring-sky-600/30",
};
const ETIQUETA: Record<string, string> = {
  ACEPTADO: "SUNAT ACEPTADO",
  OBSERVADO: "SUNAT ✓ obs.",
  RECHAZADO: "SUNAT rechazado",
  NO_ENVIADO: "SUNAT pendiente",
  ENVIADO: "SUNAT en proceso",
};

function ChipSunat({ g }: { g: GuiaRemision }) {
  const e = g.estadoSunat ?? "NO_ENVIADO";
  return (
    <span
      title={[g.sunat?.codigo, g.sunat?.descripcion].filter(Boolean).join(" ") || "Aún no se envía a SUNAT"}
      className={cn("ml-1.5 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ring-1 ring-inset", TONO[e] ?? TONO.NO_ENVIADO)}
    >
      {ETIQUETA[e] ?? e}
    </span>
  );
}

function AccionesGuia({ g, habilitado }: { g: GuiaRemision; habilitado: boolean }) {
  const [rol] = useRol();
  const [ocupado, setOcupado] = useState<"" | "enviar" | "consultar">("");
  const correr = async (que: "enviar" | "consultar") => {
    setOcupado(que);
    try {
      const x = que === "enviar" ? await enviarGuiaSunat(g, rol) : await consultarGuiaSunat(g, rol);
      const s = x.sunat;
      if (x.estadoSunat === "ACEPTADO") {
        const faltan = [!s?.enlaceXml && "XML", !s?.enlaceCdr && "CDR"].filter(Boolean).join(" y ");
        toast(faltan ? `${g.numero}: aceptada por SUNAT. Aún falta el ${faltan}: vuelva a consultar.` : `${g.numero}: aceptada por SUNAT.`, "ok");
      } else if (x.estadoSunat === "RECHAZADO") toast(`${g.numero}: rechazada por SUNAT. ${s?.codigo ?? ""} ${s?.descripcion ?? ""}`.trim(), "error");
      else toast(`${g.numero}: SUNAT aún la procesa. Use Consultar en unos minutos.`, "ok");
    } catch (e) {
      toast(`${g.numero}: ${mensaje(e)}`, "error");
    } finally {
      setOcupado("");
    }
  };
  if (!habilitado || g.estado !== "EMITIDA") return null;
  const enviada = g.estadoSunat === "ENVIADO" || g.estadoSunat === "ACEPTADO" || g.estadoSunat === "OBSERVADO" || !!g.sunat?.enlacePdf;
  return (
    <>
      {(g.estadoSunat === "NO_ENVIADO" || g.estadoSunat === "RECHAZADO") && (
        <Button size="sm" variant="warning" onClick={() => void correr("enviar")} disabled={!!ocupado} title="Enviar a SUNAT">
          <UploadCloud size={14} /> {ocupado === "enviar" ? "Enviando…" : g.estadoSunat === "RECHAZADO" ? "Reenviar SUNAT" : "Enviar SUNAT"}
        </Button>
      )}
      {enviada && (
        <Button size="sm" variant="secondary" onClick={() => void correr("consultar")} disabled={!!ocupado} title="Consultar en Nubefact y traer el PDF / XML / CDR actualizados">
          <RefreshCw size={14} /> {ocupado === "consultar" ? "Consultando…" : "Consultar"}
        </Button>
      )}
    </>
  );
}

export function GuiasRemision() {
  const [rol] = useRol();
  const guias = useStore<GuiaRemision[]>(KEYS.GUIAS_REMISION, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const { clientes } = useVentas();
  const [form, setForm] = useState<DatosGuia | null>(null);
  const [guardando, setGuardando] = useState(false);
  const habilitado = puede(rol, "venta.gestionar");
  const vendedor = getSesion()?.usuario ?? "";

  const set = <K extends keyof DatosGuia>(k: K, v: DatosGuia[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const elegirCliente = (id: string) => {
    const c = clientes.find((x) => x.id === id);
    if (!form) return;
    setForm({
      ...form,
      clienteId: id,
      cliente: c?.razonSocial ?? "",
      clienteDoc: c ? `${c.tipoDoc} ${c.numDoc}` : "",
      llegadaDireccion: form.llegadaDireccion || c?.direccionesEntrega?.[0] || c?.direccionFiscal || "",
    });
  };

  const elegirComprobante = (id: string) => {
    if (!form) return;
    const c = comprobantes.find((x) => x.id === id);
    if (!c) return setForm({ ...form, comprobanteId: undefined, comprobanteNumero: undefined });
    setForm({
      ...form,
      comprobanteId: c.id,
      comprobanteNumero: c.numero,
      clienteId: c.clienteId,
      cliente: c.cliente,
      clienteDoc: c.clienteDoc,
      llegadaDireccion: form.llegadaDireccion || c.lugarEntrega || "",
      items: c.items.map((l) => ({
        ...lineaGuiaVacia(),
        descripcion: [l.productoNombre, l.descripcion].filter((x) => x && x.trim()).join(" - "),
        unidad: l.unidad || "UND",
        cantidad: l.cantidad,
      })),
    });
  };

  const guardar = async (enviar: boolean) => {
    if (!form) return;
    setGuardando(true);
    try {
      const g = await crearGuia(form, vendedor, rol);
      setForm(null);
      toast(`Guía ${g.numero} emitida${enviar ? ": enviando a SUNAT…" : ""}`, "ok");
      if (enviar) {
        try {
          const x = await enviarGuiaSunat(g, rol);
          toast(
            x.estadoSunat === "ACEPTADO" ? `${g.numero}: aceptada por SUNAT.` : `${g.numero}: enviada. SUNAT la procesa: use Consultar en unos minutos.`,
            "ok"
          );
        } catch (e) {
          toast(`${g.numero} quedó emitida pero no se envió a SUNAT: ${mensaje(e)}`, "error");
        }
      }
    } catch (e) {
      toast(mensaje(e), "error");
    } finally {
      setGuardando(false);
    }
  };

  const comprobantesEmitidos = comprobantes.filter((c) => c.estado === "EMITIDO" && (c.tipo === "FACTURA" || c.tipo === "BOLETA"));

  return (
    <Card>
      <CardHeader
        title="Guías de Remisión"
        subtitle="Guía de remisión remitente electrónica (serie T005): se envía a SUNAT vía Nubefact; con Consultar se traen el PDF, XML y CDR."
        action={
          habilitado && (
            <Button variant="warning" onClick={() => setForm(guiaVacia())}>
              <FilePlus2 size={16} /> Nueva guía
            </Button>
          )
        }
      />
      <ListaDocs
        tipo="ventas"
        filas={guias.map(
          (g): FilaDoc => ({
            id: g.id,
            fecha: g.fecha,
            contraparte: g.cliente,
            ref: (
              <>
                <span className="font-semibold text-fg">{g.numero}</span>
                <ChipSunat g={g} />
                {g.comprobanteNumero && <span className="ml-1.5 text-xs text-plomo-500">{g.comprobanteNumero}</span>}
                <p className="text-[11px] text-plomo-500">
                  {motivoLabel(g.motivoTraslado)} · {g.modalidad === "01" ? `Público: ${g.transportistaNombre}` : `Privado: ${g.placa}`}
                </p>
              </>
            ),
            total: (
              <span className="text-sm">
                {g.pesoKg} kg · {g.bultos} bulto{g.bultos === 1 ? "" : "s"}
              </span>
            ),
            acciones: (
              <div className="flex flex-wrap gap-1">
                <ArchivosSunat c={g} />
                <AccionesGuia g={g} habilitado={habilitado} />
              </div>
            ),
            buscar: `${g.numero} ${g.cliente} ${g.clienteDoc} ${g.comprobanteNumero ?? ""} ${g.placa} ${g.transportistaNombre}`,
            tipoDoc: "GUIA",
            estado: g.estado,
          })
        )}
      />

      <Modal open={!!form} onClose={() => setForm(null)} title="Nueva guía de remisión" wide>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Serie / número" hint="Correlativo automático al emitir">
                <Input value={previewNumero(SERIE_GUIA)} disabled />
              </Field>
              <Field label="Fecha emisión">
                <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
              </Field>
              <Field label="Fecha de traslado *">
                <Input type="date" value={form.fechaTraslado} onChange={(e) => set("fechaTraslado", e.target.value)} />
              </Field>
              <Field label="Motivo de traslado *">
                <Select value={form.motivoTraslado} onChange={(e) => set("motivoTraslado", e.target.value)} options={MOTIVOS_TRASLADO.map((m) => ({ value: m.codigo, label: m.label }))} />
              </Field>
              <Field label="Comprobante relacionado" hint="Copia destinatario y productos" className="md:col-span-2">
                <Select
                  value={form.comprobanteId ?? ""}
                  onChange={(e) => elegirComprobante(e.target.value)}
                  placeholder="Sin comprobante"
                  options={comprobantesEmitidos.map((c) => ({ value: c.id, label: `${c.numero} · ${c.cliente}` }))}
                />
              </Field>
              <Field label="Destinatario *" className="md:col-span-2">
                <SelectorCliente clientes={clientes} value={form.clienteId} onChange={elegirCliente} />
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Partida · ubigeo *" hint="6 dígitos INEI">
                <Input value={form.partidaUbigeo} maxLength={6} onChange={(e) => set("partidaUbigeo", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Punto de partida *" className="md:col-span-3">
                <Input value={form.partidaDireccion} onChange={(e) => set("partidaDireccion", e.target.value)} />
              </Field>
              <Field label="Llegada · ubigeo *" hint="6 dígitos INEI">
                <Input value={form.llegadaUbigeo} maxLength={6} onChange={(e) => set("llegadaUbigeo", e.target.value.replace(/\D/g, ""))} placeholder="040101" />
              </Field>
              <Field label="Punto de llegada *" className="md:col-span-3">
                <Input value={form.llegadaDireccion} onChange={(e) => set("llegadaDireccion", e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Modalidad de transporte *">
                <Select
                  value={form.modalidad}
                  onChange={(e) => set("modalidad", e.target.value as "01" | "02")}
                  options={[
                    { value: "02", label: "Privado (vehículo propio)" },
                    { value: "01", label: "Público (empresa transportista)" },
                  ]}
                />
              </Field>
              <Field label={form.modalidad === "02" ? "Placa *" : "Placa"} hint="Sin guion">
                <Input value={form.placa} onChange={(e) => set("placa", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ABC123" />
              </Field>
              <Field label="Peso bruto total (kg) *">
                <Input type="number" min={0} step="0.01" value={form.pesoKg || ""} onChange={(e) => set("pesoKg", parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="N° de bultos *">
                <Input type="number" min={1} step={1} value={form.bultos || ""} onChange={(e) => set("bultos", parseInt(e.target.value, 10) || 0)} />
              </Field>
              {form.modalidad === "01" ? (
                <>
                  <Field label="RUC del transportista *">
                    <Input value={form.transportistaRuc} maxLength={11} onChange={(e) => set("transportistaRuc", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                  <Field label="Transportista (razón social) *" className="md:col-span-3">
                    <Input value={form.transportistaNombre} onChange={(e) => set("transportistaNombre", e.target.value)} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="DNI del conductor *">
                    <Input value={form.conductorDni} maxLength={8} onChange={(e) => set("conductorDni", e.target.value.replace(/\D/g, ""))} />
                  </Field>
                  <Field label="Nombres del conductor *">
                    <Input value={form.conductorNombres} onChange={(e) => set("conductorNombres", e.target.value)} />
                  </Field>
                  <Field label="Apellidos del conductor *">
                    <Input value={form.conductorApellidos} onChange={(e) => set("conductorApellidos", e.target.value)} />
                  </Field>
                  <Field label="N° de licencia *">
                    <Input value={form.conductorLicencia} onChange={(e) => set("conductorLicencia", e.target.value.toUpperCase())} />
                  </Field>
                </>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-plomo-500">Productos de la guía</p>
              <div className="space-y-2">
                {form.items.map((l, i) => (
                  <div key={l.id} className="grid grid-cols-[1fr_7rem_6rem_auto] items-center gap-2">
                    <Input
                      value={l.descripcion}
                      placeholder={`Producto ${i + 1}`}
                      onChange={(e) => set("items", form.items.map((x) => (x.id === l.id ? { ...x, descripcion: e.target.value } : x)))}
                    />
                    <Select
                      value={l.unidad}
                      onChange={(e) => set("items", form.items.map((x) => (x.id === l.id ? { ...x, unidad: e.target.value } : x)))}
                      options={UNIDADES.map((u) => ({ value: u, label: u }))}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.cantidad || ""}
                      onChange={(e) => set("items", form.items.map((x) => (x.id === l.id ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x)))}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Quitar"
                      disabled={form.items.length === 1}
                      onClick={() => set("items", form.items.filter((x) => x.id !== l.id))}
                    >
                      <Trash2 size={14} className="text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => set("items", [...form.items, lineaGuiaVacia()])}>
                <Plus size={14} /> Agregar producto
              </Button>
            </div>

            <Field label="Observaciones">
              <Textarea value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} />
            </Field>

            <div className="flex flex-wrap justify-end gap-2 border-t border-plomo-100 pt-4">
              <Button variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={() => void guardar(false)} disabled={guardando}>
                Emitir sin enviar
              </Button>
              <Button variant="warning" onClick={() => void guardar(true)} disabled={guardando}>
                <Send size={16} /> {guardando ? "Emitiendo…" : "Emitir y enviar a SUNAT"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
