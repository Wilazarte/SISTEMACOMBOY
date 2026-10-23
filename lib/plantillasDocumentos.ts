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

export type TipoDocumento = "REQ" | "OT";

/** Datos que llena la plantilla (un Requerimiento ya los tiene; la Orden de Traslado los arma igual). */
export interface DocUnificado {
  numero: string;
  estado: string;
  fecha: string;
  solicitante: string;
  motivo: string;
  items: Requerimiento["items"];
  observacion?: string;
  destino?: string;
  /** Documento que atiende (REQ-SECOCHA-001) y guía de remisión (Orden de Traslado). */
  referencia?: string;
  guia?: string;
}

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
  // Producción Arequipa -> Secocha: misma plantilla, otro título y destino
  OT: {
    titulo: "ORDEN DE TRASLADO",
    datos: [
      ["Sede Origen", "{{SEDE_ORIGEN}}"],
      ["Destino", "{{DESTINO}}"],
      ["Fecha", "{{FECHA}}"],
      ["Requerimiento", "{{REFERENCIA}}"],
      ["Guía de remisión", "{{GUIA}}"],
      ["Emitido por", "{{SOLICITANTE}}"],
      ["Ítems", "{{ITEMS}}"],
      ["Motivo", "{{MOTIVO}}"],
    ],
    head: ["SKU", "Producto", "Unidad", "Cantidad", "Motivo"],
    firmas: ["Producción Arequipa", "Transportista", "Recibí conforme (Secocha)"],
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
export function bloqueDocumento(tipo: TipoDocumento, sede: string, r: DocUnificado): Bloque {
  const p = TEMPLATE_UNIFICADO[tipo];
  const v: Record<string, string> = {
    SEDE_ORIGEN: sede,
    FECHA: fechaPE(r.fecha),
    SOLICITANTE: r.solicitante,
    ITEMS: String(r.items.length),
    MOTIVO: r.motivo,
    DESTINO: r.destino || "-",
    REFERENCIA: r.referencia || "-",
    GUIA: r.guia || "-",
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
