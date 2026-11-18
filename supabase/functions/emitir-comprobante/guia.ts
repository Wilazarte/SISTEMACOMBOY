// Guía de Remisión Remitente electrónica (GRE) para Nubefact: operaciones generar_guia / consultar_guia.
// El ERP manda la guía (lib/types.ts › GuiaRemision); aquí se valida lo que exige SUNAT y se arma el JSON.
// La serie viaja por NUBEFACT_SERIES igual que los comprobantes (cuenta DEMO: T005=TTT1).

import { ErrorCpe, UNIDAD_SUNAT } from "../sunat-cpe/documento.ts";

export interface GuiaErp {
  id: string;
  numero: string; // T005-0001
  fecha: string;
  fechaTraslado: string;
  cliente: string;
  clienteDoc: string; // "RUC 20123456789"
  comprobanteNumero?: string;
  motivoTraslado: string;
  modalidad: "01" | "02";
  transportistaRuc: string;
  transportistaNombre: string;
  placa: string;
  conductorDni: string;
  conductorNombres: string;
  conductorApellidos: string;
  conductorLicencia: string;
  partidaUbigeo: string;
  partidaDireccion: string;
  llegadaUbigeo: string;
  llegadaDireccion: string;
  pesoKg: number;
  bultos: number;
  items: { descripcion: string; unidad: string; cantidad: number }[];
  observaciones?: string;
  estado: string;
}

/** Tipo de comprobante de Nubefact: 7 = GRE remitente. */
export const TIPO_GRE = 7;
const DOC_IDENTIDAD: Record<string, string> = { DNI: "1", CE: "4", RUC: "6" };
const MOTIVOS = ["01", "02", "04", "13", "14"];

const fechaNf = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}-${m}-${a}`;
};
const limpiar = (s: string, max: number) =>
  (s ?? "")
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function serieYNumero(g: Pick<GuiaErp, "numero">): { serie: string; correlativo: string } {
  const [serie, correlativo] = (g.numero || "").split("-");
  if (!serie || !/^T[A-Z0-9]{3}$/.test(serie)) throw new ErrorCpe(`Serie de guía inválida: "${g.numero}" (debe empezar con T).`);
  if (!/^[0-9]{1,8}$/.test(correlativo ?? "") || Number(correlativo) < 1) throw new ErrorCpe(`Correlativo de guía inválido: "${g.numero}".`);
  return { serie, correlativo };
}

/** JSON generar_guia de Nubefact (con las validaciones de SUNAT). */
export function jsonGuia(g: GuiaErp): Record<string, unknown> {
  if (g.estado !== "EMITIDA") throw new ErrorCpe("Solo se envían guías EMITIDAS.");
  const { serie, correlativo } = serieYNumero(g);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.fecha) || !/^\d{4}-\d{2}-\d{2}$/.test(g.fechaTraslado)) throw new ErrorCpe("Fechas de la guía inválidas.");
  const [tipoTxt, ...resto] = (g.clienteDoc || "").trim().split(/\s+/);
  const tipoDoc = DOC_IDENTIDAD[(tipoTxt || "").toUpperCase()];
  const numDoc = resto.join("");
  if (!tipoDoc || !numDoc) throw new ErrorCpe(`Documento del destinatario inválido: "${g.clienteDoc}".`);
  if (!MOTIVOS.includes(g.motivoTraslado)) throw new ErrorCpe(`Motivo de traslado inválido: ${g.motivoTraslado}`);
  if (!/^\d{6}$/.test(g.partidaUbigeo) || !/^\d{6}$/.test(g.llegadaUbigeo)) throw new ErrorCpe("Ubigeo de partida / llegada inválido (6 dígitos).");
  if (!(Number(g.pesoKg) > 0)) throw new ErrorCpe("Falta el peso bruto total.");
  if (!(Number(g.bultos) >= 1)) throw new ErrorCpe("Falta el número de bultos.");
  if (!g.items?.length) throw new ErrorCpe("La guía no tiene productos.");

  const publico = g.modalidad === "01";
  if (publico && !/^\d{11}$/.test(g.transportistaRuc)) throw new ErrorCpe("Transporte público: falta el RUC del transportista.");
  if (!publico && (!g.placa || !/^\d{8}$/.test(g.conductorDni) || !g.conductorLicencia))
    throw new ErrorCpe("Transporte privado: faltan la placa y los datos del conductor (DNI, licencia).");

  const cuerpo: Record<string, unknown> = {
    operacion: "generar_guia",
    tipo_de_comprobante: TIPO_GRE,
    serie,
    numero: Number(correlativo),
    cliente_tipo_de_documento: tipoDoc,
    cliente_numero_de_documento: numDoc,
    cliente_denominacion: limpiar(g.cliente, 250),
    cliente_direccion: limpiar(g.llegadaDireccion, 250),
    cliente_email: "",
    fecha_de_emision: fechaNf(g.fecha),
    observaciones: limpiar(g.observaciones ?? "", 1000),
    motivo_de_traslado: g.motivoTraslado,
    peso_bruto_total: Number(g.pesoKg),
    peso_bruto_unidad_de_medida: "KGM",
    numero_de_bultos: Number(g.bultos),
    tipo_de_transporte: g.modalidad,
    fecha_de_inicio_de_traslado: fechaNf(g.fechaTraslado),
    punto_de_partida_ubigeo: g.partidaUbigeo,
    punto_de_partida_direccion: limpiar(g.partidaDireccion, 150),
    punto_de_llegada_ubigeo: g.llegadaUbigeo,
    punto_de_llegada_direccion: limpiar(g.llegadaDireccion, 150),
    enviar_automaticamente_al_cliente: false,
    formato_de_pdf: "",
    items: g.items.map((l) => ({
      unidad_de_medida: UNIDAD_SUNAT[(l.unidad || "").toUpperCase()] ?? "NIU",
      codigo: "",
      descripcion: limpiar(l.descripcion, 250),
      cantidad: Number(l.cantidad),
    })),
  };
  if (publico) {
    cuerpo.transportista_documento_tipo = "6";
    cuerpo.transportista_documento_numero = g.transportistaRuc;
    cuerpo.transportista_denominacion = limpiar(g.transportistaNombre, 250);
  }
  if (g.placa) cuerpo.transportista_placa_numero = g.placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!publico) {
    cuerpo.conductor_documento_tipo = "1";
    cuerpo.conductor_documento_numero = g.conductorDni;
    cuerpo.conductor_nombre = limpiar(g.conductorNombres, 100);
    cuerpo.conductor_apellidos = limpiar(g.conductorApellidos, 100);
    cuerpo.conductor_denominacion = limpiar(`${g.conductorNombres} ${g.conductorApellidos}`, 200);
    cuerpo.conductor_numero_licencia = limpiar(g.conductorLicencia, 20);
  }
  // Comprobante de venta relacionado (F… factura 01, B… boleta 03)
  const [rSerie, rNum] = (g.comprobanteNumero ?? "").split("-");
  if (rSerie && rNum && /^[FB]/.test(rSerie)) {
    cuerpo.documento_relacionado = [{ tipo: rSerie.startsWith("F") ? "01" : "03", serie: rSerie, numero: Number(rNum) }];
  }
  return cuerpo;
}

export function jsonConsultaGuia(g: GuiaErp): Record<string, unknown> {
  const { serie, correlativo } = serieYNumero(g);
  return { operacion: "consultar_guia", tipo_de_comprobante: TIPO_GRE, serie, numero: Number(correlativo) };
}
