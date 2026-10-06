"use client";

// Trazabilidad de un equipo terminado:
// Producción (OP) -> QC -> Ingreso a almacén -> Transferencias -> NP -> OD -> Entregado al cliente.

import { codigoDesdeNumero } from "./utils/codigos";
import { equipoDeLinea, getMovimientos, sedeEquipo, type EquipoTerminado } from "./equipos";
import { getOrdenesProduccion } from "./produccion";
import { estadoOD, getDespachos } from "./ventas";

export interface PasoTraza {
  titulo: string;
  detalle: string;
  fecha?: string; // ISO o YYYY-MM-DD
  hecho: boolean;
}

export function trazabilidadEquipo(e: EquipoTerminado): PasoTraza[] {
  const pasos: PasoTraza[] = [];
  const op = e.op_id ? getOrdenesProduccion().find((o) => o.id === e.op_id) : undefined;
  const movs = getMovimientos()
    .filter((m) => (m.equipo_id && m.equipo_id === e.id) || (m.chasis && m.chasis.replace(/\s+/g, "").toUpperCase() === e.codigo_chasis.replace(/\s+/g, "").toUpperCase()))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (e.origen === "PRODUCCION" || op) {
    pasos.push({ titulo: `Producción ${e.op_id ?? ""}`.trim(), detalle: op ? `${op.tipo_equipo} ${op.modelo} · creada por ${op.creado_por}` : "Orden de producción", fecha: op?.creado, hecho: true });
    pasos.push({
      titulo: "QC aprobado",
      detalle: `Supervisor ${op?.qc?.supervisor ?? e.qc_supervisor ?? e.supervisor_qc ?? "-"}${op?.qc?.firma ? " · firmado" : ""}`,
      fecha: op?.qc?.aprobado ?? e.fecha_qc ?? undefined,
      hecho: true,
    });
  } else {
    pasos.push({ titulo: "Registro en almacén", detalle: `Registrado por ${e.creado_por}${e.qc_aprobado ? " · QC aprobado" : ""}`, fecha: e.fecha_fabricacion || undefined, hecho: true });
  }

  const ingreso = movs.find((m) => m.tipo === "INGRESO");
  const sedeIngreso = ingreso?.a_sede ?? (movs.find((m) => m.tipo === "TRANSFERENCIA")?.de_sede || sedeEquipo(e));
  pasos.push({ titulo: `Ingreso a almacén ${sedeIngreso}`, detalle: e.id, fecha: ingreso?.fecha ?? e.fecha_ingreso ?? e.fecha_fabricacion ?? undefined, hecho: true });

  movs
    .filter((m) => m.tipo === "TRANSFERENCIA")
    .forEach((m) => pasos.push({ titulo: `Transferencia ${m.de_sede} → ${m.a_sede}`, detalle: `${m.usuario}${m.od ? ` · para ${m.od}` : ""}`, fecha: m.fecha, hecho: true }));

  // Venta: la orden de despacho que lleva este chasis
  const od = getDespachos().find((o) => o.estado !== "ANULADO" && o.items.some((l) => equipoDeLinea(l, [e])));
  if (od?.npNumero) pasos.push({ titulo: od.npNumero, detalle: `Nota de pedido · ${od.cliente}`, fecha: od.fecha, hecho: true });
  if (od)
    pasos.push({
      titulo: codigoDesdeNumero("OD", od.numero, od.fecha),
      detalle: `Orden de despacho · ${estadoOD(od).replace(/_/g, " ")}${od.comprobanteNumero ? ` · ${od.comprobanteNumero}` : ""}`,
      fecha: od.fecha,
      hecho: true,
    });

  const salida = movs.find((m) => m.tipo === "SALIDA");
  pasos.push(
    e.estado === "VENDIDO"
      ? { titulo: `Entregado a ${e.cliente ?? salida?.a_cliente ?? od?.cliente ?? "cliente"}`, detalle: `Salida de ${salida?.de_sede ?? sedeEquipo(e)}${e.vendido_od ? ` · ${e.vendido_od}` : ""}`, fecha: e.fecha_salida ?? salida?.fecha, hecho: true }
      : { titulo: "Entrega al cliente", detalle: od ? "Pendiente de despacho" : "Disponible para la venta", hecho: false }
  );
  return pasos;
}
