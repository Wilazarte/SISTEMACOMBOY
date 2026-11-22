"use client";

// =====================================================================
// Guías de Remisión Remitente electrónicas (Ventas, serie T005; Secocha T002).
// Se emiten en el ERP con su correlativo y se envían a SUNAT vía Nubefact con el Edge Function
// emitir-comprobante ({ guia }). Nubefact procesa la guía de forma asíncrona: al enviar queda
// "SUNAT en proceso" y con Consultar se trae el estado y los enlaces PDF / XML / CDR.
// =====================================================================

import { createClient } from "./supabase/client";
import { ErpError, KEYS, escribir, hoy, leer, nuevoEvento, puede, serieSede, siguienteNumero, uid } from "./storage";
import type { DatosSunatPse, EstadoSunat, GuiaRemision, ItemGuia, Rol } from "./types";

export const SERIE_GUIA = "T005" as const;

/** Catálogo 20 (motivos de traslado) que emite el ERP. */
export const MOTIVOS_TRASLADO: { codigo: string; label: string }[] = [
  { codigo: "01", label: "01 · Venta" },
  { codigo: "14", label: "14 · Venta sujeta a confirmación del comprador" },
  { codigo: "02", label: "02 · Compra" },
  { codigo: "04", label: "04 · Traslado entre establecimientos de la misma empresa" },
  { codigo: "13", label: "13 · Otros" },
];
export const motivoLabel = (c: string) => MOTIVOS_TRASLADO.find((m) => m.codigo === c)?.label ?? c;

/** Punto de partida por defecto: domicilio fiscal (Ficha RUC, Paucarpata - Arequipa). */
export const PARTIDA_DEFECTO = { ubigeo: "040112", direccion: "EL NAZARENO MZ. A LT. 25, PAUCARPATA, AREQUIPA" };

export const getGuiasRemision = () => leer<GuiaRemision[]>(KEYS.GUIAS_REMISION, []);

export type DatosGuia = Omit<GuiaRemision, "id" | "serie" | "numero" | "estado" | "estadoSunat" | "sunat" | "vendedor" | "historial">;

export const lineaGuiaVacia = (): ItemGuia => ({ id: uid(), descripcion: "", unidad: "UND", cantidad: 1 });

const UBIGEO = /^\d{6}$/;
const PLACA = /^[A-Z0-9]{6,8}$/;

/** Validaciones de SUNAT para la GRE remitente, antes de gastar un correlativo. */
export function validarGuia(d: DatosGuia): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErpError("Fecha de emisión inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fechaTraslado) || d.fechaTraslado < d.fecha) throw new ErpError("La fecha de traslado no puede ser anterior a la emisión.");
  if (!d.cliente.trim()) throw new ErpError("Seleccione el destinatario.");
  const [tipoDoc, num] = d.clienteDoc.trim().split(/\s+/);
  if (!["RUC", "DNI", "CE"].includes(tipoDoc ?? "") || !num) throw new ErpError(`Documento del destinatario inválido: "${d.clienteDoc}".`);
  if (!MOTIVOS_TRASLADO.some((m) => m.codigo === d.motivoTraslado)) throw new ErpError("Seleccione el motivo de traslado.");
  if (!UBIGEO.test(d.partidaUbigeo)) throw new ErpError("Ubigeo del punto de partida: 6 dígitos (INEI).");
  if (!UBIGEO.test(d.llegadaUbigeo)) throw new ErpError("Ubigeo del punto de llegada: 6 dígitos (INEI).");
  if (d.partidaDireccion.trim().length < 3) throw new ErpError("Indique la dirección del punto de partida.");
  if (d.llegadaDireccion.trim().length < 3) throw new ErpError("Indique la dirección del punto de llegada.");
  if (!(d.pesoKg > 0)) throw new ErpError("Indique el peso bruto total (kg).");
  if (!(d.bultos >= 1) || !Number.isInteger(d.bultos)) throw new ErpError("Indique el número de bultos (entero, mínimo 1).");
  if (d.modalidad === "01") {
    if (!/^(10|15|16|17|20)\d{9}$/.test(d.transportistaRuc)) throw new ErpError("Transporte público: RUC del transportista inválido (11 dígitos).");
    if (d.transportistaNombre.trim().length < 2) throw new ErpError("Transporte público: indique la razón social del transportista.");
  } else {
    if (!PLACA.test(d.placa)) throw new ErpError("Transporte privado: placa del vehículo inválida (sin guion, p. ej. ABC123).");
    if (!/^\d{8}$/.test(d.conductorDni)) throw new ErpError("Transporte privado: DNI del conductor (8 dígitos).");
    if (!d.conductorNombres.trim() || !d.conductorApellidos.trim()) throw new ErpError("Transporte privado: nombres y apellidos del conductor.");
    if (d.conductorLicencia.trim().length < 5) throw new ErpError("Transporte privado: N° de licencia del conductor.");
  }
  if (d.placa && !PLACA.test(d.placa)) throw new ErpError("Placa inválida (sin guion, p. ej. ABC123).");
  const items = d.items.filter((l) => l.descripcion.trim());
  if (!items.length) throw new ErpError("Agregue al menos un producto a la guía.");
  if (items.some((l) => !(l.cantidad > 0))) throw new ErpError("Cada producto debe tener cantidad mayor a 0.");
}

/** Crea y emite la guía (correlativo T005). Queda "SUNAT pendiente" hasta enviarla. */
export async function crearGuia(d: DatosGuia, vendedor: string, rol: Rol): Promise<GuiaRemision> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede emitir guías de remisión.");
  validarGuia(d);
  let numero: string;
  try {
    numero = await siguienteNumero(SERIE_GUIA);
  } catch (e) {
    const m = (e as Error).message ?? "";
    if (/serie inv[aá]lida/i.test(m)) throw new ErpError("Falta habilitar la serie T005: corra la migración 20261219_serie_t005_guias.sql en Supabase.");
    throw e;
  }
  const g: GuiaRemision = {
    ...d,
    id: uid(),
    serie: serieSede(SERIE_GUIA),
    numero,
    placa: d.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    items: d.items.filter((l) => l.descripcion.trim()).map((l) => ({ ...l, descripcion: l.descripcion.trim() })),
    estado: "EMITIDA",
    estadoSunat: "NO_ENVIADO",
    vendedor,
    historial: [nuevoEvento(rol, "Emitida", `${motivoLabel(d.motivoTraslado)} · ${d.cliente}`)],
  };
  escribir(KEYS.GUIAS_REMISION, [g, ...getGuiasRemision()]);
  return g;
}

interface RespuestaPse {
  ok: boolean;
  aceptada: boolean;
  codigo: string;
  descripcion: string;
  hash: string;
  enlacePdf: string;
  enlaceXml: string;
  enlaceCdr: string;
  numero: string;
  error?: string;
}

async function invocarGuia(g: GuiaRemision, consultar: boolean): Promise<RespuestaPse> {
  const { data, error } = await createClient().functions.invoke("emitir-comprobante", { body: { guia: g, ...(consultar ? { consultar: true } : {}) } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    console.error("emitir-comprobante (guía)", g.numero, cuerpo ?? error);
    throw new ErpError(cuerpo?.error ?? (cuerpo ? JSON.stringify(cuerpo) : error.message));
  }
  const r = data as RespuestaPse;
  if (!r?.ok) throw new ErpError(r?.error ?? "Nubefact no devolvió una respuesta válida.");
  return r;
}

/** Estado según la respuesta: aceptada → ACEPTADO; código de rechazo (2xxx-3xxx) → RECHAZADO; si no, en proceso. */
function estadoDe(r: RespuestaPse): EstadoSunat {
  if (r.aceptada) return "ACEPTADO";
  if (/^[23]\d{3}$/.test(r.codigo ?? "")) return "RECHAZADO";
  return "ENVIADO";
}

function guardarRespuesta(g: GuiaRemision, r: RespuestaPse, rol: Rol, accion: string): GuiaRemision {
  let actualizada: GuiaRemision | undefined;
  const lista = getGuiasRemision().map((x) => {
    if (x.id !== g.id) return x;
    const s: Partial<DatosSunatPse> = x.sunat ?? {};
    const estadoSunat = estadoDe(r);
    actualizada = {
      ...x,
      estadoSunat,
      sunat: {
        hash: r.hash || s.hash || "",
        codigo: r.codigo || s.codigo || "",
        descripcion: r.descripcion || s.descripcion || "",
        entorno: "beta",
        fecha: new Date().toISOString(),
        numero: r.numero || s.numero || "",
        enlacePdf: r.enlacePdf || s.enlacePdf || "",
        enlaceXml: r.enlaceXml || s.enlaceXml || "",
        enlaceCdr: r.enlaceCdr || s.enlaceCdr || "",
      },
      historial: [...x.historial, nuevoEvento(rol, accion, `${estadoSunat}${r.descripcion ? ` · ${r.descripcion}` : ""}`)],
    };
    return actualizada;
  });
  if (!actualizada) throw new ErpError(`No se encontró la guía ${g.numero}.`);
  escribir(KEYS.GUIAS_REMISION, lista);
  return actualizada;
}

/** Envía la guía a SUNAT vía Nubefact. Error: mensaje real del Edge Function y la guía sigue pendiente. */
export async function enviarGuiaSunat(g: GuiaRemision, rol: Rol): Promise<GuiaRemision> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede enviar guías a SUNAT.");
  if (g.estado !== "EMITIDA") throw new ErpError("Solo se envían guías EMITIDAS.");
  return guardarRespuesta(g, await invocarGuia(g, false), rol, "Enviada a SUNAT (Nubefact)");
}

/** Consulta en Nubefact el estado de la guía y trae los enlaces PDF / XML / CDR actualizados. */
export async function consultarGuiaSunat(g: GuiaRemision, rol: Rol): Promise<GuiaRemision> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede consultar guías en SUNAT.");
  return guardarRespuesta(g, await invocarGuia(g, true), rol, "Consulta SUNAT (Nubefact)");
}

export const guiaVacia = (): DatosGuia => ({
  fecha: hoy(),
  fechaTraslado: hoy(),
  clienteId: "",
  cliente: "",
  clienteDoc: "",
  comprobanteId: undefined,
  comprobanteNumero: undefined,
  motivoTraslado: "01",
  modalidad: "02",
  transportistaRuc: "",
  transportistaNombre: "",
  placa: "",
  conductorDni: "",
  conductorNombres: "",
  conductorApellidos: "",
  conductorLicencia: "",
  partidaUbigeo: PARTIDA_DEFECTO.ubigeo,
  partidaDireccion: PARTIDA_DEFECTO.direccion,
  llegadaUbigeo: "",
  llegadaDireccion: "",
  pesoKg: 0,
  bultos: 1,
  items: [lineaGuiaVacia()],
  observaciones: "",
});
