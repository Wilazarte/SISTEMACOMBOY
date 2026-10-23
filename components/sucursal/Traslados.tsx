"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Truck } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Textarea, ejecutar, ejecutarAsync } from "@/components/ui";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { BotonNuevo } from "@/components/ui/BotonFiltros";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { RequerimientoForm } from "@/components/requerimientos/RequerimientoForm";
import { getSesion, nombreDe } from "@/lib/auth";
import { pdfGuiaRemision, pdfRequerimiento } from "@/lib/pdf";
import {
  DESTINO_REQ_SUCURSAL,
  confirmarRecepcion,
  crearReqSucursal,
  crearTraslado,
  esTaller,
  getSucursal,
  numeroProbableSuc,
  reqDeSucursal,
  observarTraslado,
  operaSucursal,
  type ReqSucursal,
  type StockLocal,
  type Traslado,
} from "@/lib/sucursal";
import { Acciones, EstadoSuc, LineasEditor, deLineas, lineaVacia, type LineaEdit } from "./comun";

// =====================================================================
// 4. REQUERIMIENTOS: REQ-SECOCHA-001 -> Almacén del Taller Principal (Arequipa) (Cotización -> OC) -> OT con guía -> Secocha
// =====================================================================
export function Requerimientos({ reqs, stock }: { reqs: ReqSucursal[]; stock: StockLocal[] }) {
  const { showForm, setShowForm } = useTogglePanel();
  const opera = operaSucursal();
  const taller = esTaller();
  const [ot, setOt] = useState<ReqSucursal | null>(null);

  const filas: FilaDoc[] = reqs.map((r) => ({
    id: r.id,
    fecha: r.fecha,
    contraparte: r.automatico ? "Reposición automática" : r.solicitante || r.creadoPor,
    buscar: `${r.numero} ${r.motivo} ${r.items.map((i) => i.producto).join(" ")}`,
    estado: r.estado,
    ref: (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-fg">{r.numero}</span>
        <span>
          <EstadoSuc estado={r.estado} />
        </span>
        <span className="max-w-[320px] truncate text-[11px] text-plomo-500" title={r.motivo}>
          {r.motivo}
        </span>
      </div>
    ),
    total: `${r.items.length} ítem(s)`,
    acciones: (
      <Acciones>
        <Button size="sm" variant="ghost" onClick={() => pdfRequerimiento(reqDeSucursal(r))} title="PDF (mismo formato que Arequipa)">
          <FileText size={14} /> PDF
        </Button>
        {taller && (r.estado === "enviado" || r.estado === "aprobado") ? (
          <Button size="sm" onClick={() => setOt(r)} title="Emitir la Orden de Traslado hacia Secocha">
            <Truck size={14} /> Crear OT
          </Button>
        ) : (
          <span className="text-xs text-plomo-500">
            {r.estado === "cerrado" ? "Recibido en Secocha" : r.estado === "en-traslado" ? "Ver Traslados" : r.estado === "aprobado" ? "Aprobado por Producción" : "En Producción Arequipa"}
          </span>
        )}
      </Acciones>
    ),
  }));

  return (
    <div className="space-y-4">
      {showForm && opera && <FormReq numeroProbable={numeroProbableSuc(reqs)} onListo={() => setShowForm(false)} />}
      <Card>
        <CardHeader
          title="Requerimientos de la sucursal"
          subtitle={`${reqs.filter((r) => r.estado !== "cerrado").length} en curso · Requerimiento → Producción Arequipa (aprobar) → Orden de Traslado con guía → Secocha`}
          action={opera ? <BotonNuevo abierto={showForm} onClick={() => setShowForm(!showForm)} label="Nuevo requerimiento" /> : undefined}
        />
        <ListaDocs filas={filas} tipo="requerimientos" />
      </Card>
      {ot && <ModalNuevaOT req={ot} stock={stock} onClose={() => setOt(null)} />}
    </div>
  );
}

/** Mismo formulario que Arequipa (RequerimientoForm): Secocha solo cambia la sede y el destino. */
function FormReq({ numeroProbable, onListo }: { numeroProbable: string; onListo: () => void }) {
  const sesion = getSesion();
  return (
    <RequerimientoForm
      sedeOrigen={getSucursal().nombre}
      destino={DESTINO_REQ_SUCURSAL}
      numeroProbable={numeroProbable}
      solicitanteInicial={sesion ? nombreDe(sesion) : ""}
      modulo="Secocha · Requerimiento"
      textoEnviar="Enviar a Producción Arequipa"
      mensajeOk={`Requerimiento enviado al ${DESTINO_REQ_SUCURSAL}`}
      onEnviar={(d) =>
        crearReqSucursal(
          d.items.map((i) => ({ producto: i.nombre, cantidad: i.cantidad, unidad: i.unidad, marca: i.marca, caracteristica: i.caracteristica })),
          d.motivo,
          false,
          { solicitante: d.solicitante, fecha: d.fecha }
        )
      }
      onCreado={onListo}
      onCancelar={onListo}
    />
  );
}

// =====================================================================
// 5. TRASLADOS / GUÍA DE REMISIÓN: OT entrantes desde Almacén Taller Principal
// =====================================================================
export function Traslados({ traslados, stock, reqs }: { traslados: Traslado[]; stock: StockLocal[]; reqs: ReqSucursal[] }) {
  const { showForm, setShowForm } = useTogglePanel();
  const opera = operaSucursal();
  const taller = esTaller();
  const [recibir, setRecibir] = useState<Traslado | null>(null);
  const [observar, setObservar] = useState<Traslado | null>(null);
  const enCamino = traslados.filter((t) => t.estado === "en-camino").length;

  const filas: FilaDoc[] = traslados.map((t) => ({
    id: t.id,
    fecha: t.fechaEnvio,
    subFecha: t.fechaRecepcion ? `Recibido ${t.fechaRecepcion.split("-").reverse().join("/")}` : undefined,
    contraparte: "Almacén Taller Principal",
    buscar: `${t.codigo} ${t.guiaRemision} ${t.reqNumero ?? ""} ${t.ventaNumero ?? ""} ${t.productos.map((p) => p.producto).join(" ")}`,
    estado: t.estado,
    ref: (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-fg">{t.codigo}</span>
        <span className="text-[11px] text-plomo-500">
          Guía {t.guiaRemision}
          {t.reqNumero ? ` · ${t.reqNumero}` : ""}
          {t.ventaNumero ? ` · ${t.ventaNumero}` : ""}
        </span>
        <span>
          <EstadoSuc estado={t.estado} />
        </span>
        {t.observacion && (
          <span className="max-w-[300px] truncate text-[11px] text-rojo" title={t.observacion.detalle}>
            {t.observacion.tipo === "FALTANTE" ? "Faltante" : "Dañado"}: {t.observacion.detalle}
          </span>
        )}
      </div>
    ),
    total: <span title={t.productos.map((p) => `${p.cantidad} ${p.unidad} ${p.producto}`).join("\n")}>{t.productos.length} ítem(s)</span>,
    acciones: (
      <Acciones>
        <Button size="sm" variant="ghost" onClick={() => pdfGuiaRemision(t)}>
          <FileText size={14} /> Ver Guía PDF
        </Button>
        {opera && t.estado !== "recibido" && (
          <Button size="sm" onClick={() => setRecibir(t)}>
            <CheckCircle2 size={14} /> Confirmar recepción
          </Button>
        )}
        {opera && t.estado === "en-camino" && (
          <Button size="sm" variant="danger" onClick={() => setObservar(t)}>
            <AlertTriangle size={14} /> Observar
          </Button>
        )}
      </Acciones>
    ),
  }));

  return (
    <div className="space-y-4">
      {showForm && taller && <FormOT stock={stock} reqs={reqs} onListo={() => setShowForm(false)} />}
      <Card>
        <CardHeader
          title="Traslados entrantes (OT / Guía de remisión)"
          subtitle={`${enCamino} en camino · al confirmar la recepción se actualiza el stock local y se cierra el requerimiento`}
          action={taller ? <BotonNuevo abierto={showForm} onClick={() => setShowForm(!showForm)} label="Nueva OT (Taller)" /> : undefined}
        />
        <ListaDocs filas={filas} tipo="traslados" />
      </Card>
      {recibir && <ModalRecepcion traslado={recibir} onClose={() => setRecibir(null)} />}
      {observar && <ModalObservar traslado={observar} onClose={() => setObservar(null)} />}
    </div>
  );
}

function ModalRecepcion({ traslado, onClose }: { traslado: Traslado; onClose: () => void }) {
  const [quien, setQuien] = useState("");
  return (
    <Modal open onClose={onClose} title={`Confirmar recepción ${traslado.codigo}`}>
      <div className="space-y-4">
        <ul className="rounded-lg border border-plomo-200 p-3 text-sm text-fg-2">
          {traslado.productos.map((p, i) => (
            <li key={i}>
              {p.cantidad} {p.unidad} · {p.producto}
            </li>
          ))}
        </ul>
        {traslado.observacion && <p className="text-xs text-rojo">Observado: {traslado.observacion.detalle}. Se suma al stock lo indicado en la guía; corrija el stock si llegó menos.</p>}
        <Field label="Recibido por *">
          <Input value={quien} onChange={(e) => setQuien(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => ejecutar(() => confirmarRecepcion(traslado.id, quien), `${traslado.codigo} recibido: stock local actualizado`) && onClose()}>
            <CheckCircle2 size={15} /> Confirmar recepción
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModalObservar({ traslado, onClose }: { traslado: Traslado; onClose: () => void }) {
  const [tipo, setTipo] = useState<"FALTANTE" | "DANADO">("FALTANTE");
  const [detalle, setDetalle] = useState("");
  return (
    <Modal open onClose={onClose} title={`Observar ${traslado.codigo}`}>
      <div className="space-y-4">
        <Field label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as "FALTANTE" | "DANADO")} options={[{ value: "FALTANTE", label: "Faltante" }, { value: "DANADO", label: "Dañado" }]} />
        </Field>
        <Field label="Detalle *">
          <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Qué falta o qué llegó dañado" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => ejecutar(() => observarTraslado(traslado.id, tipo, detalle), `${traslado.codigo} observado`) && onClose()}>
            <AlertTriangle size={15} /> Observar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Taller: OT nueva hacia la sucursal (opcionalmente atiende un REQ-SECOCHA). */
function FormOT({ stock, reqs, onListo, req }: { stock: StockLocal[]; reqs: ReqSucursal[]; onListo: () => void; req?: ReqSucursal }) {
  const desdeReq = (r?: ReqSucursal): LineaEdit[] =>
    r ? r.items.map((i) => ({ ...lineaVacia(), productoId: i.productoId, producto: i.producto, unidad: i.unidad, cantidad: String(i.cantidad) })) : [lineaVacia()];
  const [reqId, setReqId] = useState(req?.id ?? "");
  const [lineas, setLineas] = useState<LineaEdit[]>(desdeReq(req));
  const [transportista, setTransportista] = useState("");
  const [placa, setPlaca] = useState("");
  const [guardando, setGuardando] = useState(false);
  const abiertos = reqs.filter((r) => r.estado === "enviado" || r.estado === "aprobado");
  const emitir = async () => {
    setGuardando(true);
    const ok = await ejecutarAsync(
      () => crearTraslado({ productos: deLineas(lineas), motivoTraslado: "Traslado entre establecimientos de la misma empresa", transportista, placa, reqId: reqId || undefined }),
      "OT emitida con guía de remisión"
    );
    setGuardando(false);
    if (ok) onListo();
  };
  return (
    <Card>
      <CardHeader title="Nueva OT · Taller Principal → Sucursal" subtitle="Genera la OT y la guía de remisión remitente (tipo 09)" />
      <div className="grid gap-4 p-5 md:grid-cols-3">
        <Field label="Atiende requerimiento">
          <Select
            value={reqId}
            onChange={(e) => {
              setReqId(e.target.value);
              setLineas(desdeReq(abiertos.find((r) => r.id === e.target.value)));
            }}
            placeholder="— Sin requerimiento —"
            options={abiertos.map((r) => ({ value: r.id, label: `${r.numero} · ${r.items.length} ítem(s)` }))}
          />
        </Field>
        <Field label="Transportista">
          <Input value={transportista} onChange={(e) => setTransportista(e.target.value)} />
        </Field>
        <Field label="Placa">
          <Input value={placa} onChange={(e) => setPlaca(e.target.value)} />
        </Field>
        <div className="md:col-span-3">
          <LineasEditor lineas={lineas} onChange={setLineas} stock={stock} conPrecio={false} />
        </div>
        <div className="flex justify-end gap-2 md:col-span-3">
          <Button variant="ghost" onClick={onListo}>
            Cancelar
          </Button>
          <Button onClick={emitir} disabled={guardando}>
            <Truck size={15} /> {guardando ? "Emitiendo…" : "Emitir OT y guía"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ModalNuevaOT({ req, stock, onClose }: { req: ReqSucursal; stock: StockLocal[]; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`OT para ${req.numero}`} wide>
      <FormOT stock={stock} reqs={[req]} req={req} onListo={onClose} />
    </Modal>
  );
}

