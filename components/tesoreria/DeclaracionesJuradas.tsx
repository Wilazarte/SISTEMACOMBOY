"use client";

import { useEffect, useState } from "react";
import { Check, Download, Eye, FileText, Pencil, Printer, Send } from "lucide-react";
import { Badge, Button, Modal, ejecutar } from "@/components/ui";
import { EditarGasto } from "@/components/compras/EditarGasto";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { getSesion } from "@/lib/auth";
import { imprimirDeclaracionJurada, pdfDeclaracionJurada, urlDeclaracionJurada } from "@/lib/pdf";
import { cambiarEstadoDJ, esDeclaracionJurada, fechaPE, permisoEditarGasto, soles } from "@/lib/storage";
import type { Factura, Rol } from "@/lib/types";

const estadoDJ = (f: Factura) => f.djEstado ?? "PENDIENTE";

/**
 * Pestaña "Declaraciones juradas" de Tesorería / Compras: los gastos sin comprobante (DJ-0001…) con
 * vista previa del PDF, descarga, impresión, edición y envío a aprobar. Son los mismos gastos de Facturas:
 * no hay una tabla aparte (la DJ vive en compras, tipo factura, con comprobante DJ).
 */
export function DeclaracionesJuradas({ facturas, rol }: { facturas: Factura[]; rol: Rol }) {
  const sesion = getSesion();
  const [ver, setVer] = useState<Factura | null>(null);
  const [editar, setEditar] = useState<Factura | null>(null);
  const djs = facturas.filter(esDeclaracionJurada).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
  // El modal muestra siempre la versión al día (tras enviar / aprobar / editar)
  const actual = ver ? djs.find((d) => d.id === ver.id) ?? ver : null;

  const filas = djs.map(
    (f): FilaDoc => {
      const p = permisoEditarGasto(f, sesion);
      return {
        id: f.id,
        fecha: f.fecha,
        contraparte: f.proveedor,
        ref: (
          <>
            <span className="font-semibold text-fg">{f.numero}</span>
            {f.codigo && <span className="ml-1.5 text-xs text-plomo-500">{f.codigo}</span>}
            <span className="ml-2 inline-block align-middle">
              <Badge estado={estadoDJ(f)} />
            </span>
          </>
        ),
        extra: (
          <span className="block truncate" title={f.descripcion}>
            {f.descripcion || "-"}
          </span>
        ),
        total: soles(f.total),
        buscar: `${f.numero} ${f.codigo ?? ""} ${f.descripcion ?? ""} ${f.ruc}`,
        tipoDoc: f.ocId ? "DJ con OC" : "DJ",
        estado: estadoDJ(f),
        acciones: (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setVer(f)} title="Ver" aria-label="Ver">
              <Eye size={15} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => pdfDeclaracionJurada(f)} title="PDF (descargar)" aria-label="PDF">
              <FileText size={15} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => imprimirDeclaracionJurada(f)} title="Imprimir" aria-label="Imprimir">
              <Printer size={15} />
            </Button>
            <span className="tip" data-tip={p.ok ? "Editar" : p.motivo}>
              <Button size="sm" variant="ghost" disabled={!p.ok} onClick={() => setEditar(f)} aria-label="Editar">
                <Pencil size={15} />
              </Button>
            </span>
          </div>
        ),
      };
    }
  );

  return (
    <>
      <ListaDocs tipo="declaraciones" extra="Concepto" filas={filas} />
      {actual && <VerDJ dj={actual} rol={rol} onClose={() => setVer(null)} />}
      {editar && <EditarGasto gasto={editar} rol={rol} onClose={() => setEditar(null)} />}
    </>
  );
}

function VerDJ({ dj, rol, onClose }: { dj: Factura; rol: Rol; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const sesion = getSesion();
  const estado = estadoDJ(dj);
  const puedeAprobar = !sesion?.soloLectura && sesion?.rol === "creador";

  // Vista previa: el PDF se arma en el navegador y se muestra en un iframe
  useEffect(() => {
    const u = urlDeclaracionJurada(dj);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [dj]);

  return (
    <Modal open onClose={onClose} title={`Declaración jurada ${dj.numero}`} wide>
      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        {url ? <iframe src={url} title={dj.numero} className="h-[60vh] w-full rounded-lg border border-plomo-200" /> : <div className="h-[60vh] rounded-lg bg-plomo-100" />}
        <div className="space-y-3 text-sm">
          <dl className="space-y-2">
            {(
              [
                ["Fecha", fechaPE(dj.fecha)],
                ["Proveedor", `${dj.proveedor}${dj.ruc ? ` (${dj.ruc})` : ""}`],
                ["Concepto", dj.descripcion ?? "-"],
                ["Importe", soles(dj.total)],
                ["Código de gasto", dj.codigo ?? "-"],
                ["Pago", dj.estadoPago === "PAGADA" ? `Pagada${dj.caja ? ` · ${dj.caja}` : ""}` : "Por pagar"],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium uppercase tracking-wide text-plomo-500">{k}</dt>
                <dd className="text-fg">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-plomo-500">Estado</dt>
              <dd>
                <Badge estado={estado} />
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="secondary" onClick={() => url && window.open(url, "_blank")}>
              <Eye size={15} /> Visualizar PDF
            </Button>
            <Button variant="secondary" onClick={() => pdfDeclaracionJurada(dj)}>
              <Download size={15} /> Descargar PDF
            </Button>
            {estado === "PENDIENTE" && !sesion?.soloLectura && (
              <Button onClick={() => ejecutar(() => void cambiarEstadoDJ(dj.id, "ENVIADA", rol), `${dj.numero} enviada a aprobar`)}>
                <Send size={15} /> Enviar a aprobar
              </Button>
            )}
            {estado !== "APROBADA" && puedeAprobar && (
              <Button variant="success" onClick={() => ejecutar(() => void cambiarEstadoDJ(dj.id, "APROBADA", rol), `${dj.numero} aprobada`)}>
                <Check size={15} /> Aprobar
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
