// =====================================================================
// Plantilla única de documentos por sede · ERP COMBOY VID
// REQ-ALM (Arequipa / Taller) y REQ-SECOCHA salen con el MISMO diseño (el de Arequipa: membrete, logo,
// tabla, footer y firmas de lib/pdf.ts › construir). Lo único que cambia entre sedes es {{SEDE_ORIGEN}}
// (y el número del documento). lib/pdf.ts › generarDocumento(tipo, sede, doc) arma el PDF.
// =====================================================================

import type { Bloque } from "./pdf";
import { fechaPE } from "./storage";
import type { Requerimiento } from "./types";

/** Sede del ERP: Planta Principal (Arequipa). */
export const SEDE_PLANTA_PRINCIPAL = "Arequipa - Planta Principal";

export type TipoDocumento = "REQ";

interface Plantilla {
  titulo: string;
  /** Datos de cabecera: los valores {{VARIABLE}} se reemplazan al generar. */
  datos: [string, string][];
  head: string[];
  firmas: string[];
}

/** TEMPLATE_UNIFICADO: una sola plantilla por tipo de documento para todas las sedes. */
export const TEMPLATE_UNIFICADO: Record<TipoDocumento, Plantilla> = {
  REQ: {
    titulo: "REQUERIMIENTO DE ALMACÉN",
    datos: [
      ["Sede Origen", "{{SEDE_ORIGEN}}"],
      ["Fecha", "{{FECHA}}"],
      ["Solicitante", "{{SOLICITANTE}}"],
      ["Ítems", "{{ITEMS}}"],
      ["Motivo", "{{MOTIVO}}"],
    ],
    head: ["SKU", "Producto", "Unidad", "Cantidad", "Motivo"],
    firmas: ["Solicitante", "Jefe de Almacén", "Tesorería"],
  },
};

const rellenar = (t: string, v: Record<string, string>): string => t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? "");

/**
 * Sede de origen del requerimiento: Secocha (lo emitió el módulo Secocha) o la Planta Principal
 * con el área que lo pidió (Taller Principal Aqp, Adm Aqp…).
 */
export function sedeOrigenReq(r: Requerimiento): string {
  if (r.origen === "SUCURSAL") return r.sede;
  return r.sede && r.sede !== SEDE_PLANTA_PRINCIPAL ? `${SEDE_PLANTA_PRINCIPAL} · ${r.sede}` : SEDE_PLANTA_PRINCIPAL;
}

/** Bloque del PDF con TEMPLATE_UNIFICADO (mismo diseño para cualquier sede). */
export function bloqueDocumento(tipo: TipoDocumento, sede: string, r: Requerimiento): Bloque {
  const p = TEMPLATE_UNIFICADO[tipo];
  const v: Record<string, string> = {
    SEDE_ORIGEN: sede,
    FECHA: fechaPE(r.fecha),
    SOLICITANTE: r.solicitante,
    ITEMS: String(r.items.length),
    MOTIVO: r.motivo,
  };
  return {
    titulo: p.titulo,
    numero: r.numero,
    estado: r.estado,
    datos: p.datos.map(([k, t]) => [k, rellenar(t, v)]),
    head: p.head,
    body: r.items.map((i) => [i.sku || "-", i.marca && !i.nombre.toUpperCase().includes(i.marca.toUpperCase()) ? `${i.nombre} · ${i.marca}` : i.nombre, i.unidad, i.cantidad, i.caracteristica || r.motivo]),
    alinearDerecha: [3],
    notas: r.observacion ? [`Observación de Tesorería: ${r.observacion}`] : undefined,
    firmas: p.firmas,
  };
}
