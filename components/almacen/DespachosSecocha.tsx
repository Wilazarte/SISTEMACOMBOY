"use client";

import { useState } from "react";
import { FileText, Loader2, Truck, Wrench } from "lucide-react";
import { Button, Card, CardHeader, Table, Td, ejecutar } from "@/components/ui";
import { ModalOT } from "@/components/sucursal/Ventas";
import { Acciones, EstadoSuc } from "@/components/sucursal/comun";
import { pdfGuiaRemision } from "@/lib/pdf";
import { deSede, useSedeSecocha } from "@/lib/sedes";
import { KEYS, fechaPE, useStore } from "@/lib/storage";
import { MOTIVOS_DERIVACION, esTaller, prepararDerivacion, type Derivacion, type Traslado } from "@/lib/sucursal";

/** Pendientes primero (por despachar), luego en preparación y al final las despachadas. */
const ORDEN: Record<Derivacion["estado"], number> = { pendiente: 0, "en-preparacion": 1, convertida: 2, anulada: 3 };

/**
 * Bandeja "Despachos de Secocha" (Almacén / Taller Principal, Arequipa): cada venta que Secocha deriva llega aquí
 * al instante como Orden de Despacho PENDIENTE_DESPACHO (Realtime). Desde aquí se prepara y se emite la OT con su
 * guía de remisión; en Secocha pasa a DESPACHADO POR AREQUIPA.
 */
export function DespachosSecocha() {
  const sedes = useSedeSecocha();
  const derivaciones = deSede(useStore<Derivacion[]>(KEYS.SUC_DERIVACIONES, [], sedes.listo));
  const traslados = useStore<Traslado[]>(KEYS.SUC_TRASLADOS, [], sedes.listo);
  const [ot, setOt] = useState<Derivacion | null>(null);
  const taller = esTaller();

  if (!sedes.listo)
    return (
      <Card>
        <p className="flex items-center gap-2 p-6 text-sm text-plomo-500">
          <Loader2 size={16} className="animate-spin" /> Cargando despachos de Secocha…
        </p>
      </Card>
    );
  if (sedes.error)
    return (
      <Card>
        <p className="p-6 text-sm text-rojo">{sedes.error}</p>
      </Card>
    );

  const lista = [...derivaciones].filter((d) => d.estado !== "anulada").sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.fecha.localeCompare(a.fecha));
  const pendientes = lista.filter((d) => d.estado === "pendiente" || d.estado === "en-preparacion").length;
  const guia = (d: Derivacion) => traslados.find((t) => t.id === d.trasladoId || t.derivacionId === d.id);

  return (
    <>
      <Card>
        <CardHeader title="Despachos de Secocha" subtitle={`${pendientes} por despachar · ventas derivadas desde Secocha: prepare y emita la OT con guía de remisión`} />
        <Table head={["Orden", "Fecha", "Cliente", "Tipo", "Productos", "Estado", "Acciones"]} empty={lista.length === 0}>
          {lista.map((d) => {
            const g = guia(d);
            return (
              <tr key={d.id}>
                <Td>
                  <span className="block font-semibold text-fg">{d.numero ?? `OD-${d.ventaNumero}`}</span>
                  <span className="block text-[11px] text-plomo-500">
                    {d.ventaNumero} · {d.sucursal}
                  </span>
                </Td>
                <Td>{fechaPE(d.fecha)}</Td>
                <Td className="max-w-[200px] truncate">{d.cliente}</Td>
                <Td>
                  <span className="block">{MOTIVOS_DERIVACION[d.motivo]}</span>
                  {d.detalle && <span className="block max-w-[220px] truncate text-xs text-plomo-500">{d.detalle}</span>}
                </Td>
                <Td className="max-w-[280px]">
                  <span className="block truncate text-sm" title={d.productos.map((p) => `${p.cantidad} ${p.unidad} ${p.producto}`).join("\n")}>
                    {d.productos.map((p) => `${p.cantidad} ${p.producto}`).join(" · ")}
                  </span>
                </Td>
                <Td>
                  <EstadoSuc estado={d.estado} />
                </Td>
                <Td>
                  <Acciones>
                    {taller && d.estado === "pendiente" && (
                      <Button size="sm" variant="secondary" onClick={() => ejecutar(() => prepararDerivacion(d.id), `${d.numero ?? d.ventaNumero} en preparación`)}>
                        <Wrench size={14} /> En preparación
                      </Button>
                    )}
                    {taller && (d.estado === "pendiente" || d.estado === "en-preparacion") && (
                      <Button size="sm" onClick={() => setOt(d)}>
                        <Truck size={14} /> Emitir OT y guía
                      </Button>
                    )}
                    {g && (
                      <Button size="sm" variant="ghost" onClick={() => pdfGuiaRemision(g)}>
                        <FileText size={14} /> Guía {g.guiaRemision}
                      </Button>
                    )}
                  </Acciones>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {ot && <ModalOT derivacion={ot} onClose={() => setOt(null)} onEmitido={pdfGuiaRemision} />}
    </>
  );
}
