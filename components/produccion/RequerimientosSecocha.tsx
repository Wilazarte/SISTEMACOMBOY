"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2, Truck } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Table, Td, ejecutar, ejecutarAsync } from "@/components/ui";
import { Acciones, EstadoSuc } from "@/components/sucursal/comun";
import { pdfGuiaRemision, pdfOrdenTraslado, pdfRequerimiento } from "@/lib/pdf";
import { deSede, useSedeSecocha } from "@/lib/sedes";
import { KEYS, fechaPE, useStore } from "@/lib/storage";
import { aprobarReqSucursal, crearTraslado, esTaller, reqDeSucursal, type ReqSucursal, type Traslado } from "@/lib/sucursal";

const ORDEN: Record<ReqSucursal["estado"], number> = { enviado: 0, aprobado: 1, "en-traslado": 2, cerrado: 3 };

/**
 * Bandeja "Requerimientos Secocha" de Producción Arequipa: los REQ-SECOCHA llegan solo aquí (no a Almacén ni
 * Tesorería). [Aprobar] → APROBADO_PRODUCCION. [Emitir Orden de Traslado] → OT Arequipa → Secocha con guía de
 * remisión y PDF con el mismo TEMPLATE_UNIFICADO de Arequipa.
 */
export function RequerimientosSecocha() {
  const sedes = useSedeSecocha();
  const reqs = deSede(useStore<ReqSucursal[]>(KEYS.SUC_REQS, [], sedes.listo));
  const traslados = useStore<Traslado[]>(KEYS.SUC_TRASLADOS, [], sedes.listo);
  const [ot, setOt] = useState<ReqSucursal | null>(null);
  const produccion = esTaller();

  if (!sedes.listo)
    return (
      <Card>
        <p className="flex items-center gap-2 p-6 text-sm text-plomo-500">
          <Loader2 size={16} className="animate-spin" /> Cargando requerimientos de Secocha…
        </p>
      </Card>
    );
  if (sedes.error)
    return (
      <Card>
        <p className="p-6 text-sm text-rojo">{sedes.error}</p>
      </Card>
    );

  const sede = sedes.sedes.find((s) => s.id === sedes.actualId)?.nombre ?? "Secocha";
  const lista = [...reqs].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.numero.localeCompare(a.numero));
  const porAtender = lista.filter((r) => r.estado === "enviado" || r.estado === "aprobado").length;
  const trasladoDe = (r: ReqSucursal) => traslados.find((t) => t.id === r.trasladoId || t.reqId === r.id);

  return (
    <>
      <Card>
        <CardHeader title="Requerimientos Secocha" subtitle={`${porAtender} por atender · REQ-SECOCHA → Aprobar → Orden de Traslado Arequipa → Secocha`} />
        <Table head={["Requerimiento", "Fecha", "Solicitante", "Productos", "Estado", "Acciones"]} empty={lista.length === 0}>
          {lista.map((r) => {
            const t = trasladoDe(r);
            return (
              <tr key={r.id}>
                <Td>
                  <span className="block font-semibold text-fg">{r.numero}</span>
                  <span className="block max-w-[260px] truncate text-[11px] text-plomo-500" title={r.motivo}>
                    {r.motivo}
                  </span>
                </Td>
                <Td>{fechaPE(r.fecha)}</Td>
                <Td className="max-w-[180px] truncate">{r.automatico ? "Reposición automática" : r.solicitante || r.creadoPor}</Td>
                <Td className="max-w-[280px]">
                  <span className="block truncate text-sm" title={r.items.map((i) => `${i.cantidad} ${i.unidad} ${i.producto}`).join("\n")}>
                    {r.items.map((i) => `${i.cantidad} ${i.producto}`).join(" · ")}
                  </span>
                </Td>
                <Td>
                  <EstadoSuc estado={r.estado} />
                </Td>
                <Td>
                  <Acciones>
                    <Button size="sm" variant="ghost" onClick={() => pdfRequerimiento(reqDeSucursal(r, sede))} title="PDF del requerimiento">
                      <FileText size={14} /> REQ
                    </Button>
                    {produccion && r.estado === "enviado" && (
                      <Button size="sm" variant="secondary" onClick={() => ejecutar(() => aprobarReqSucursal(r.id), `${r.numero} aprobado por Producción`)}>
                        <CheckCircle2 size={14} /> Aprobar
                      </Button>
                    )}
                    {produccion && (r.estado === "enviado" || r.estado === "aprobado") && (
                      <span className="tip" data-tip={r.estado === "enviado" ? "Primero apruebe el requerimiento" : undefined}>
                        <Button size="sm" onClick={() => setOt(r)} disabled={r.estado !== "aprobado"}>
                          <Truck size={14} /> Emitir Orden de Traslado
                        </Button>
                      </span>
                    )}
                    {t && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => pdfOrdenTraslado(t)}>
                          <FileText size={14} /> {t.codigo}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => pdfGuiaRemision(t)}>
                          <FileText size={14} /> Guía
                        </Button>
                      </>
                    )}
                  </Acciones>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {ot && <ModalTraslado req={ot} onClose={() => setOt(null)} />}
    </>
  );
}

function ModalTraslado({ req, onClose }: { req: ReqSucursal; onClose: () => void }) {
  const [transportista, setTransportista] = useState("");
  const [placa, setPlaca] = useState("");
  const [guardando, setGuardando] = useState(false);
  const emitir = async () => {
    setGuardando(true);
    let t: Traslado | undefined;
    const ok = await ejecutarAsync(async () => {
      t = await crearTraslado({ productos: req.items, motivoTraslado: "Traslado entre establecimientos de la misma empresa", transportista, placa, reqId: req.id });
    }, `Orden de Traslado emitida para ${req.numero}`);
    setGuardando(false);
    if (ok) {
      if (t) pdfOrdenTraslado(t);
      onClose();
    }
  };
  return (
    <Modal open onClose={onClose} title={`Orden de Traslado para ${req.numero}`}>
      <div className="space-y-4">
        <p className="text-sm text-plomo-500">Arequipa - Planta Principal → Secocha · se emite la guía de remisión y el PDF con el formato de Arequipa.</p>
        <ul className="rounded-lg border border-plomo-200 p-3 text-sm text-fg-2">
          {req.items.map((p, i) => (
            <li key={i}>
              {p.cantidad} {p.unidad} · {p.producto}
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Transportista">
            <Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="Nombre / empresa" />
          </Field>
          <Field label="Placa">
            <Input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC-123" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={emitir} disabled={guardando}>
            <Truck size={15} /> {guardando ? "Emitiendo…" : "Emitir Orden de Traslado"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
