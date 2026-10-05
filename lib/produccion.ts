"use client";

// =====================================================================
// PRODUCCIÓN: órdenes de producción (OP-2026-0001). Al aprobar el QC con la firma del supervisor,
// el equipo entra AUTOMÁTICAMENTE a Almacén como EQUIPO_TERMINADO (DISPONIBLE, origen PRODUCCION).
// Tabla almacen, tipo ORDEN_PRODUCCION.
// =====================================================================

import { ALMACEN_DEFECTO } from "./empresa";
import { ingresarEquipoProduccion, getEquipos, nuevoCodigo, type EquipoTerminado } from "./equipos";
import { ErpError, KEYS, escribir, hoy, leer } from "./storage";
import type { ArchivoAdjunto } from "./types";

export type EstadoOP = "EN_FABRICACION" | "QC_APROBADO" | "ANULADA";

export interface OrdenProduccion {
  id: string; // OP-2026-0001
  fecha: string; // YYYY-MM-DD
  tipo_equipo: string;
  modelo: string;
  marca_motor: string;
  serie_motor: string;
  codigo_chasis: string;
  color: string;
  ubicacion_sede: string; // almacén de destino
  observaciones: string;
  estado: EstadoOP;
  creado_por: string;
  creado: string;
  qc?: { supervisor: string; fecha: string; observaciones: string; firma: ArchivoAdjunto; aprobado_por: string; aprobado: string };
  equipo_id?: string;
  anulacion?: string;
}

export type DatosOP = Pick<OrdenProduccion, "fecha" | "tipo_equipo" | "modelo" | "marca_motor" | "serie_motor" | "codigo_chasis" | "color" | "ubicacion_sede" | "observaciones">;

export const opVacia = (): DatosOP => ({
  fecha: hoy(),
  tipo_equipo: "",
  modelo: "",
  marca_motor: "",
  serie_motor: "",
  codigo_chasis: "",
  color: "",
  ubicacion_sede: ALMACEN_DEFECTO,
  observaciones: "",
});

export const getOrdenesProduccion = () => leer<OrdenProduccion[]>(KEYS.PRODUCCION, []);
const norm = (s?: string) => (s ?? "").replace(/\s+/g, "").toUpperCase();

export async function crearOrdenProduccion(d: DatosOP, usuario: string): Promise<OrdenProduccion> {
  const codigo_chasis = d.codigo_chasis.trim().toUpperCase();
  if (!d.tipo_equipo.trim()) throw new ErpError("Indique el tipo de equipo (ej. REMOLCADOR ECO-MINE 3000).");
  if (!d.modelo.trim()) throw new ErpError("Indique el modelo (ej. CV-300).");
  if (!d.marca_motor.trim()) throw new ErpError("Indique la marca del motor.");
  if (!codigo_chasis) throw new ErpError("Indique el código de chasis.");
  const ops = getOrdenesProduccion();
  const opRep = ops.find((o) => o.estado !== "ANULADA" && norm(o.codigo_chasis) === norm(codigo_chasis));
  if (opRep) throw new ErpError(`El chasis ${codigo_chasis} ya está en la orden ${opRep.id}.`);
  const eqRep = getEquipos().find((e) => norm(e.codigo_chasis) === norm(codigo_chasis));
  if (eqRep) throw new ErpError(`El chasis ${codigo_chasis} ya existe en almacén (${eqRep.id}, ${eqRep.estado}).`);
  const id = await nuevoCodigo("OP", ops.map((o) => o.id));
  const op: OrdenProduccion = {
    ...d,
    id,
    tipo_equipo: d.tipo_equipo.trim().toUpperCase(),
    modelo: d.modelo.trim().toUpperCase(),
    marca_motor: d.marca_motor.trim().toUpperCase(),
    serie_motor: d.serie_motor.trim().toUpperCase(),
    codigo_chasis,
    color: d.color.trim(),
    ubicacion_sede: d.ubicacion_sede || ALMACEN_DEFECTO,
    observaciones: d.observaciones.trim(),
    estado: "EN_FABRICACION",
    creado_por: usuario,
    creado: new Date().toISOString(),
  };
  escribir(KEYS.PRODUCCION, [op, ...getOrdenesProduccion()]);
  return op;
}

/**
 * QC aprobado + firma del supervisor -> crea el EQUIPO_TERMINADO en Almacén (automático) y cierra la OP.
 * Si el equipo no se puede crear (chasis repetido), la OP no cambia.
 */
export async function aprobarQC(
  opId: string,
  qc: { supervisor: string; fecha: string; observaciones: string; firma?: ArchivoAdjunto; ubicacion_sede?: string },
  usuario: string
): Promise<{ op: OrdenProduccion; equipo: EquipoTerminado }> {
  const op = getOrdenesProduccion().find((o) => o.id === opId);
  if (!op) throw new ErpError("Orden de producción no encontrada.");
  if (op.estado !== "EN_FABRICACION") throw new ErpError(`La ${op.id} está ${op.estado}.`);
  if (!qc.supervisor.trim()) throw new ErpError("Indique el supervisor QC.");
  if (!qc.firma) throw new ErpError("Falta la firma del supervisor QC.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(qc.fecha) || qc.fecha > hoy()) throw new ErpError("Fecha de QC inválida.");
  const sede = qc.ubicacion_sede || op.ubicacion_sede || ALMACEN_DEFECTO;
  const equipo = await ingresarEquipoProduccion(
    {
      codigo_chasis: op.codigo_chasis,
      tipo_equipo: op.tipo_equipo,
      modelo: op.modelo,
      marca_motor: op.marca_motor,
      serie_motor: op.serie_motor,
      color: op.color,
      ubicacion_sede: sede,
      op_id: op.id,
      qc_supervisor: qc.supervisor.trim(),
      fecha_qc: qc.fecha,
      observaciones_qc: qc.observaciones,
    },
    usuario
  );
  const ahora = new Date().toISOString();
  const nueva: OrdenProduccion = {
    ...op,
    ubicacion_sede: sede,
    estado: "QC_APROBADO",
    equipo_id: equipo.id,
    qc: { supervisor: qc.supervisor.trim(), fecha: qc.fecha, observaciones: qc.observaciones.trim(), firma: qc.firma, aprobado_por: usuario, aprobado: ahora },
  };
  escribir(KEYS.PRODUCCION, getOrdenesProduccion().map((o) => (o.id === op.id ? nueva : o)));
  return { op: nueva, equipo };
}

export function anularOrdenProduccion(opId: string, motivo: string): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo.");
  const op = getOrdenesProduccion().find((o) => o.id === opId);
  if (!op) throw new ErpError("Orden de producción no encontrada.");
  if (op.estado !== "EN_FABRICACION") throw new ErpError(`La ${op.id} ya está ${op.estado}: no se puede anular.`);
  escribir(KEYS.PRODUCCION, getOrdenesProduccion().map((o) => (o.id === opId ? { ...o, estado: "ANULADA" as const, anulacion: motivo.trim() } : o)));
}
