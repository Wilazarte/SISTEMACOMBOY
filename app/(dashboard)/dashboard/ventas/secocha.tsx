"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Loader2 } from "lucide-react";
import { Button, Card, CardHeader, Table, Td, ejecutarAsync } from "@/components/ui";
import { Acciones, EstadoSuc } from "@/components/sucursal/comun";
import { getSesion } from "@/lib/auth";
import { pdfRequerimiento } from "@/lib/pdf";
import { deSede, useSedeSecocha, type EstadoSedes } from "@/lib/sedes";
import { KEYS, fechaPE, puede, useRol, useStore } from "@/lib/storage";
import { MOTIVOS_DERIVACION, reqDeSucursal, type Derivacion, type ProductoTraslado, type ReqSucursal } from "@/lib/sucursal";
import { aceptarSecocha } from "@/lib/ventas";

/** REQ-SECOCHA (enviado) y ventas derivadas (pendiente / en preparación) que Ventas Arequipa aún no acepta. */
const porAceptarReq = (r: ReqSucursal) => r.estado === "enviado" || r.estado === "aprobado";
const porAceptarDer = (d: Derivacion) => d.estado === "pendiente" || d.estado === "en-preparacion";

export interface DatosSecocha {
  sedes: EstadoSedes;
  reqs: ReqSucursal[];
  derivaciones: Derivacion[];
  pendientes: number;
}

/** Requerimientos y derivaciones de Secocha en vivo (Realtime de la tabla sucursal) y cuántos faltan aceptar. */
export function useSecocha(): DatosSecocha {
  const sedes = useSedeSecocha();
  const reqs = deSede(useStore<ReqSucursal[]>(KEYS.SUC_REQS, [], sedes.listo));
  const derivaciones = deSede(useStore<Derivacion[]>(KEYS.SUC_DERIVACIONES, [], sedes.listo));
  return { sedes, reqs, derivaciones, pendientes: reqs.filter(porAceptarReq).length + derivaciones.filter(porAceptarDer).length };
}

interface Fila {
  tipo: "REQ" | "DERIVACION";
  id: string;
  numero: string;
  detalle: string;
  fecha: string;
  quien: string;
  productos: ProductoTraslado[];
  estado: ReqSucursal["estado"] | Derivacion["estado"];
  npNumero?: string;
  porAceptar: boolean;
  req?: ReqSucursal;
}

/**
 * Bandeja "Requerimientos de Secocha" de Ventas Arequipa: los REQ-SECOCHA y las ventas derivadas llegan aquí
 * (no a Producción ni a Tesorería). [Aceptar] crea la Nota de Pedido PENDIENTE_COSTEO para poner los costos.
 */
export function RequerimientosSecocha({ datos, onIrNotas }: { datos: DatosSecocha; onIrNotas: () => void }) {
  const [rol] = useRol();
  const habilitado = puede(rol, "venta.gestionar");
  const [aceptando, setAceptando] = useState<string | null>(null);
  const { sedes, reqs, derivaciones } = datos;

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
  const filas: Fila[] = [
    ...reqs.map(
      (r): Fila => ({
        tipo: "REQ",
        id: r.id,
        numero: r.numero,
        detalle: r.motivo,
        fecha: r.fecha,
        quien: r.automatico ? "Reposición automática" : r.solicitante || r.creadoPor,
        productos: r.items,
        estado: r.estado,
        npNumero: r.npNumero,
        porAceptar: porAceptarReq(r),
        req: r,
      })
    ),
    ...derivaciones
      .filter((d) => d.estado !== "anulada")
      .map(
        (d): Fila => ({
          tipo: "DERIVACION",
          id: d.id,
          numero: d.numero ?? `OD-${d.ventaNumero}`,
          detalle: `Venta ${d.ventaNumero} · ${MOTIVOS_DERIVACION[d.motivo]}${d.detalle ? ` · ${d.detalle}` : ""}`,
          fecha: d.fecha,
          quien: d.cliente,
          productos: d.productos,
          estado: d.estado,
          npNumero: d.npNumero,
          porAceptar: porAceptarDer(d),
        })
      ),
  ].sort((a, b) => Number(b.porAceptar) - Number(a.porAceptar) || b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));

  const aceptar = async (f: Fila) => {
    setAceptando(f.id);
    const ok = await ejecutarAsync(() => aceptarSecocha(f.tipo, f.id, getSesion()?.usuario ?? "", rol), `${f.numero} aceptado: nota de pedido creada (pendiente de costeo)`);
    setAceptando(null);
    if (ok) onIrNotas();
  };

  return (
    <Card>
      <CardHeader
        title="Requerimientos de Secocha"
        subtitle={`${datos.pendientes} por aceptar · Aceptar → Nota de Pedido (costos) → Aprobar → Orden de Despacho → OT + guía → Traslado a Secocha`}
      />
      <Table head={["Documento", "Fecha", "Solicitante / cliente", "Productos", "Estado", "Acciones"]} empty={filas.length === 0}>
        {filas.map((f) => (
          <tr key={`${f.tipo}:${f.id}`}>
            <Td>
              <span className="block font-semibold text-fg">{f.numero}</span>
              <span className="block max-w-[240px] truncate text-[11px] text-plomo-500" title={f.detalle}>
                {f.tipo === "REQ" ? "Requerimiento" : "Derivación"} · {f.detalle}
              </span>
            </Td>
            <Td>{fechaPE(f.fecha)}</Td>
            <Td className="max-w-[200px] truncate">{f.quien}</Td>
            <Td className="max-w-[220px]">
              <span className="block truncate text-sm" title={f.productos.map((p) => `${p.cantidad} ${p.unidad} ${p.producto}`).join("\n")}>
                {f.productos.map((p) => `${p.cantidad} ${p.producto}`).join(" · ")}
              </span>
            </Td>
            <Td>
              <EstadoSuc estado={f.estado} />
            </Td>
            <Td>
              <Acciones>
                {f.req && (
                  <Button size="sm" variant="ghost" onClick={() => pdfRequerimiento(reqDeSucursal(f.req!, sede))} title="PDF del requerimiento" aria-label="PDF del requerimiento">
                    <FileText size={14} />
                  </Button>
                )}
                {habilitado && f.porAceptar && (
                  <Button size="sm" variant="success" onClick={() => aceptar(f)} disabled={aceptando !== null}>
                    <CheckCircle2 size={14} /> {aceptando === f.id ? "Aceptando…" : "Aceptar"}
                  </Button>
                )}
                {f.npNumero && (
                  <Button size="sm" variant="ghost" onClick={onIrNotas} title="Ver en Notas de pedido">
                    <ClipboardList size={14} /> {f.npNumero}
                  </Button>
                )}
              </Acciones>
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
