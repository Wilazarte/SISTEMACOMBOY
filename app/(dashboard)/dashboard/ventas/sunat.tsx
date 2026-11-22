"use client";

// Facturación electrónica en la lista de comprobantes: estado SUNAT, envío, XML / CDR, notas y baja.

import { useEffect, useState } from "react";
import { Ban, FileCode2, FileMinus2, FileCheck2, FileText, RefreshCw, ShieldAlert, ShieldCheck, UploadCloud } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, cn, toast } from "@/components/ui";
import { soles } from "@/lib/storage";
import {
  MOTIVOS_NOTA,
  SERIE_NOTA,
  bajaSunat,
  configSunat,
  consultarNubefactFila,
  consultarSunat,
  crearNota,
  descargarSunat,
  enviarSunat,
  estadoBajaSunat,
  sunatValido,
  type ConfigSunat,
  type FilaSunat,
} from "@/lib/sunat";
import type { ComprobanteVenta, Rol } from "@/lib/types";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "Error inesperado");

/** Configuración del Edge Function: entorno, certificado y secretos que faltan. */
export function BarraSunat({ error }: { error: string }) {
  const [cfg, setCfg] = useState<ConfigSunat | null>(null);
  const [falla, setFalla] = useState("");
  useEffect(() => {
    configSunat()
      .then(setCfg)
      .catch((e) => setFalla(mensaje(e)));
  }, []);
  const problema = error || falla || (cfg && cfg.faltan.length ? `Faltan los secretos: ${cfg.faltan.join(", ")}.` : "");
  if (problema)
    return (
      <div className="flex items-start gap-2 border-b border-plomo-100 bg-amber-50 px-5 py-2 text-xs text-amber-900">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        <span>
          <b>Facturación electrónica SUNAT sin configurar:</b> {problema}
          {cfg?.errorCertificado ? ` (${cfg.errorCertificado})` : ""} Los comprobantes se emiten en el ERP y quedan como NO ENVIADOS hasta completar la configuración.
        </span>
      </div>
    );
  if (!cfg) return null;
  const vence = cfg.certificado ? new Date(cfg.certificado.vence) : null;
  const dias = vence ? Math.floor((vence.getTime() - Date.now()) / 86_400_000) : 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-plomo-100 px-5 py-2 text-xs",
        cfg.entorno === "beta" ? "bg-sky-50 text-sky-900" : "bg-emerald-50 text-emerald-900"
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <ShieldCheck size={14} /> SUNAT {cfg.entorno === "beta" ? "BETA (pruebas / homologación, sin valor legal)" : "PRODUCCIÓN"}
      </span>
      <span>{cfg.modo === "nubefact" ? "Emisión vía PSE Nubefact (firma con su certificado)" : "Envío directo a SUNAT"}</span>
      <span>RUC emisor {cfg.ruc}</span>
      {cfg.certificado && (
        <span className={cn(dias < 30 && "font-semibold text-red-700")}>
          Certificado: {cfg.certificado.titular || "—"} · vence {vence?.toLocaleDateString("es-PE")}
          {dias < 30 ? ` (¡faltan ${dias} días!)` : ""}
        </span>
      )}
      <span>Al emitir, el comprobante se envía solo a SUNAT.</span>
    </div>
  );
}

const TONO: Record<string, string> = {
  ACEPTADO: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  OBSERVADO: "bg-lime-50 text-lime-800 ring-lime-600/30",
  RECHAZADO: "bg-red-50 text-red-700 ring-red-600/20",
  EXCEPCION: "bg-amber-50 text-amber-800 ring-amber-600/30",
  ANULADO: "bg-plomo-100 text-plomo-600 ring-plomo-400/30",
  NO_ENVIADO: "bg-amber-50 text-amber-800 ring-amber-600/30",
  ENVIADO: "bg-sky-50 text-sky-800 ring-sky-600/30",
};
const ETIQUETA: Record<string, string> = {
  ACEPTADO: "SUNAT ACEPTADO",
  OBSERVADO: "SUNAT ✓ obs.",
  RECHAZADO: "SUNAT rechazado",
  EXCEPCION: "SUNAT no recibido",
  ANULADO: "SUNAT baja",
  NO_ENVIADO: "SUNAT pendiente",
  ENVIADO: "SUNAT en proceso",
};

/** Chip con el estado SUNAT (el detalle del CDR al pasar el mouse). */
export function EstadoSunatChip({ c, f }: { c: ComprobanteVenta; f?: FilaSunat }) {
  if (c.estado === "BORRADOR") return null;
  const estado = f ? (f.estado === "PENDIENTE" ? "NO_ENVIADO" : f.estado) : c.estadoSunat ?? "NO_ENVIADO";
  if (c.estado === "ANULADO" && !f) return null;
  const detalle = f
    ? [
        `${f.codigo ?? ""} ${f.descripcion ?? ""}`.trim(),
        ...(f.observaciones ?? []),
        f.baja_estado ? `Baja ${f.baja_id}: ${f.baja_estado} ${f.baja_descripcion ?? ""}` : "",
        f.entorno === "beta" ? "Entorno BETA (pruebas)" : "",
        f.pse ? `Emitido vía ${f.pse}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "Aún no se envía a SUNAT";
  return (
    <span
      title={detalle}
      className={cn("ml-1.5 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold ring-1 ring-inset", TONO[estado] ?? TONO.NO_ENVIADO)}
    >
      {ETIQUETA[estado] ?? estado}
      {f?.entorno === "beta" && sunatValido(f.estado) ? " · beta" : ""}
      {f?.baja_estado === "EN_PROCESO" ? " · baja en proceso" : ""}
    </span>
  );
}

/** Botones SUNAT de una fila. */
export function AccionesSunat({
  c,
  f,
  rol,
  habilitado,
  onNota,
  onBaja,
  recargar,
}: {
  c: ComprobanteVenta;
  f?: FilaSunat;
  rol: Rol;
  habilitado: boolean;
  onNota: (c: ComprobanteVenta) => void;
  onBaja: (c: ComprobanteVenta) => void;
  recargar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  if (c.estado === "BORRADOR") return null;
  const valido = sunatValido(f?.estado ?? c.estadoSunat);
  const correr = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      toast(mensaje(e), "error");
    } finally {
      setOcupado(false);
      recargar();
    }
  };
  const enviar = () =>
    correr(async () => {
      const r = await enviarSunat(c, rol);
      if (sunatValido(r.estado)) toast(`${c.numero}: ${r.descripcion || "aceptado por SUNAT"}`, "ok");
      else toast(`${c.numero}: ${r.estado} ${r.codigo ?? ""} ${r.descripcion ?? ""}`.trim(), "error");
    });
  return (
    <>
      {habilitado && f?.estado === "ENVIADO" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={ocupado}
          title="Consultar si SUNAT ya respondió"
          onClick={() =>
            correr(async () => {
              const r = await consultarSunat(c, rol);
              toast(`${c.numero}: ${r.estado} ${r.descripcion ?? ""}`.trim(), r.estado === "RECHAZADO" ? "error" : "ok");
            })
          }
        >
          <RefreshCw size={14} /> Consultar
        </Button>
      )}
      {f?.enlace_pdf && (
        <Button size="sm" variant="ghost" title="PDF emitido por el PSE" onClick={() => window.open(f.enlace_pdf!, "_blank", "noopener")}>
          <FileText size={14} /> PDF PSE
        </Button>
      )}
      {habilitado && c.estado === "EMITIDO" && !valido && f?.estado !== "ENVIADO" && (
        <Button size="sm" variant="warning" onClick={enviar} disabled={ocupado} title="Enviar a SUNAT">
          <UploadCloud size={14} /> {ocupado ? "Enviando…" : f ? "Reenviar SUNAT" : "Enviar SUNAT"}
        </Button>
      )}
      {habilitado && c.estado === "EMITIDO" && !!c.sunat?.enlacePdf && (
        <Button
          size="sm"
          variant="secondary"
          disabled={ocupado}
          title="Consultar en Nubefact y traer el XML / CDR actualizados"
          onClick={() =>
            correr(async () => {
              const x = await consultarNubefactFila(c, rol);
              const s = x.sunat!;
              const faltan = [!s.enlaceXml && "XML", !s.enlaceCdr && "CDR"].filter(Boolean).join(" y ");
              toast(
                faltan ? `${c.numero}: SUNAT aún no devuelve el ${faltan}. Vuelva a consultar más tarde.` : `${c.numero}: XML y CDR actualizados.`,
                faltan ? "error" : "ok"
              );
            })
          }
        >
          <RefreshCw size={14} /> {ocupado ? "Consultando…" : "Consultar"}
        </Button>
      )}
      {f?.nombre_archivo && (
        <Button size="sm" variant="ghost" title="Descargar XML firmado" onClick={() => correr(() => descargarSunat(c.id, "xml"))}>
          <FileCode2 size={14} /> XML
        </Button>
      )}
      {f && sunatValido(f.estado === "ANULADO" ? "ACEPTADO" : f.estado) && (
        <Button size="sm" variant="ghost" title="Descargar constancia de recepción (CDR)" onClick={() => correr(() => descargarSunat(c.id, "cdr"))}>
          <FileCheck2 size={14} /> CDR
        </Button>
      )}
      {f?.baja_estado === "ACEPTADA" && (
        <Button size="sm" variant="ghost" title="CDR de la comunicación de baja" onClick={() => correr(() => descargarSunat(c.id, "baja_cdr"))}>
          <FileCheck2 size={14} /> CDR baja
        </Button>
      )}
      {habilitado && f?.baja_estado === "EN_PROCESO" && (
        <Button
          size="sm"
          variant="ghost"
          title="Consultar la comunicación de baja"
          disabled={ocupado}
          onClick={() =>
            correr(async () => {
              const r = await estadoBajaSunat(c, rol);
              toast(`Baja ${r.baja_id}: ${r.baja_estado}${r.baja_descripcion ? ` · ${r.baja_descripcion}` : ""}`, r.baja_estado === "RECHAZADA" ? "error" : "ok");
            })
          }
        >
          <RefreshCw size={14} /> Baja
        </Button>
      )}
      {habilitado && valido && c.estado === "EMITIDO" && (c.tipo === "FACTURA" || c.tipo === "BOLETA") && (
        <Button size="sm" variant="ghost" title="Nota de crédito / débito" onClick={() => onNota(c)}>
          <FileMinus2 size={14} /> Nota
        </Button>
      )}
      {habilitado && valido && c.estado === "EMITIDO" && (c.serie.startsWith("F") || f?.pse) && !f?.baja_estado && (
        <Button size="sm" variant="ghost" title="Comunicación de baja (anular ante SUNAT)" onClick={() => onBaja(c)}>
          <Ban size={14} className="text-red-600" /> Baja
        </Button>
      )}
    </>
  );
}

/** Nota de crédito o débito sobre un comprobante aceptado. Al crearla se envía a SUNAT. */
export function ModalNota({ origen, onClose, rol, vendedor, recargar }: { origen: ComprobanteVenta | null; onClose: () => void; rol: Rol; vendedor: string; recargar: () => void }) {
  const [tipo, setTipo] = useState<"NOTA_CREDITO" | "NOTA_DEBITO">("NOTA_CREDITO");
  const [motivo, setMotivo] = useState("01");
  const [sustento, setSustento] = useState("");
  const [monto, setMonto] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setTipo("NOTA_CREDITO");
    setMotivo("01");
    setSustento("");
    setMonto(0);
  }, [origen]);
  if (!origen) return null;
  const def = MOTIVOS_NOTA[tipo].find((m) => m.codigo === motivo);
  const serie = SERIE_NOTA[tipo][origen.tipo === "BOLETA" ? "BOLETA" : "FACTURA"];
  const guardar = async () => {
    setOcupado(true);
    try {
      const nota = await crearNota({ tipo, origenId: origen.id, motivoCodigo: motivo, sustento, monto }, vendedor, rol);
      toast(`${nota.numero} emitida: enviando a SUNAT…`, "ok");
      onClose();
      try {
        const r = await enviarSunat(nota, rol);
        if (sunatValido(r.estado)) toast(`${nota.numero}: ${r.descripcion || "aceptada por SUNAT"}`, "ok");
        else toast(`${nota.numero}: ${r.estado} ${r.codigo ?? ""} ${r.descripcion ?? ""}`.trim(), "error");
      } catch (e) {
        toast(`${nota.numero} quedó emitida pero no se envió a SUNAT: ${mensaje(e)}`, "error");
      }
    } catch (e) {
      toast(mensaje(e), "error");
    } finally {
      setOcupado(false);
      recargar();
    }
  };
  return (
    <Modal open onClose={onClose} title={`Nota sobre ${origen.numero}`}>
      <div className="space-y-3">
        <p className="text-sm text-plomo-600">
          {origen.cliente} · {origen.clienteDoc} · total {soles(origen.total)}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tipo">
            <Select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as "NOTA_CREDITO" | "NOTA_DEBITO";
                setTipo(t);
                setMotivo(MOTIVOS_NOTA[t][0].codigo);
              }}
              options={[
                { value: "NOTA_CREDITO", label: "Nota de crédito" },
                { value: "NOTA_DEBITO", label: "Nota de débito" },
              ]}
            />
          </Field>
          <Field label="Serie" hint="Correlativo automático">
            <Input value={serie} disabled />
          </Field>
          <Field label="Motivo (catálogo SUNAT) *" className="md:col-span-2">
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value)} options={MOTIVOS_NOTA[tipo].map((m) => ({ value: m.codigo, label: m.label }))} />
          </Field>
          {def && !def.total && (
            <Field label="Importe S/ (IGV incluido) *">
              <Input type="number" min={0} step="0.01" value={monto || ""} onChange={(e) => setMonto(parseFloat(e.target.value) || 0)} />
            </Field>
          )}
          <Field label="Sustento *" className="md:col-span-2" hint="Se envía a SUNAT en la nota">
            <Textarea value={sustento} onChange={(e) => setSustento(e.target.value)} />
          </Field>
        </div>
        <p className="rounded-lg bg-plomo-50 px-3 py-2 text-xs text-plomo-600">
          {def?.total
            ? `La nota copia todos los ítems de ${origen.numero}. Cuando SUNAT la acepte, ${origen.numero} se anula en el ERP (asiento de reversión y su orden de despacho si aún no salió).`
            : "La nota lleva una sola línea con el sustento y el importe indicado."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="warning" onClick={guardar} disabled={ocupado}>
            <UploadCloud size={16} /> {ocupado ? "Emitiendo…" : "Emitir y enviar a SUNAT"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Anulación ante SUNAT: comunicación de baja (facturas) o, vía PSE, también boletas. */
export function ModalBaja({ c, onClose, rol, recargar }: { c: ComprobanteVenta | null; onClose: () => void; rol: Rol; recargar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => setMotivo(""), [c]);
  if (!c) return null;
  const enviar = async () => {
    setOcupado(true);
    try {
      const r = await bajaSunat(c, motivo, rol);
      toast(
        r.baja_estado === "ACEPTADA"
          ? `Baja ${r.baja_id} aceptada: ${c.numero} anulado`
          : r.baja_estado === "EN_PROCESO"
            ? `Baja ${r.baja_id} enviada: SUNAT la está procesando (consulte en unos minutos)`
            : `Baja rechazada: ${r.baja_codigo ?? ""} ${r.baja_descripcion ?? ""}`,
        r.baja_estado === "RECHAZADA" ? "error" : "ok"
      );
      onClose();
    } catch (e) {
      toast(mensaje(e), "error");
    } finally {
      setOcupado(false);
      recargar();
    }
  };
  return (
    <Modal open onClose={onClose} title={`Comunicación de baja · ${c.numero}`}>
      <p className="mb-3 text-sm text-plomo-600">
        Anula {c.numero} ante SUNAT. Úsela solo si el comprobante no fue entregado al cliente o tiene errores; si ya se entregó, emita una nota de crédito.
        Cuando SUNAT acepte la baja, el comprobante se anula también en el ERP.
      </p>
      <Field label="Motivo de la baja *">
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={enviar} disabled={ocupado}>
          <Ban size={16} /> {ocupado ? "Enviando…" : "Enviar baja a SUNAT"}
        </Button>
      </div>
    </Modal>
  );
}
