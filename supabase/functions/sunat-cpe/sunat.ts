// Servicios web SOAP de SUNAT (SEE - del contribuyente): sendBill, sendSummary, getStatus y getStatusCdr.
// El XML firmado viaja en un ZIP (RUC-TIPO-SERIE-NUMERO.zip con el .xml del mismo nombre) en base64.
// La respuesta (CDR) es otro ZIP con R-RUC-TIPO-SERIE-NUMERO.xml (ApplicationResponse).

import { unzipSync, zipSync, strToU8, strFromU8 } from "npm:fflate@0.8.3";
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1/base64";

export const ENDPOINTS = {
  beta: { bill: "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService", consulta: "" },
  produccion: {
    bill: "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService",
    consulta: "https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService",
  },
} as const;
export type Entorno = keyof typeof ENDPOINTS;

/** SUNAT_URL_BILL permite apuntar a otro servicio (pruebas locales u OSE con la misma interfaz). */
const urlBill = (e: Entorno) => (typeof Deno !== "undefined" && Deno.env.get("SUNAT_URL_BILL")?.trim()) || ENDPOINTS[e].bill;

export interface CredencialesSol {
  ruc: string;
  usuario: string; // usuario SOL secundario (en beta: MODDATOS)
  clave: string; // en beta: moddatos
}

export interface Cdr {
  /** 0 = aceptado; 2000-3999 = rechazado; 4000+ = aceptado con observaciones. */
  codigo: string;
  descripcion: string;
  observaciones: string[];
  /** ZIP del CDR en base64 (se guarda tal cual: es la constancia legal). */
  zipBase64: string;
  xml: string;
}

export interface RespuestaSunat {
  ok: boolean;
  cdr?: Cdr;
  ticket?: string;
  /** Excepción SOAP (0100-1999: no recibido, se puede reenviar; 2000-3999: rechazo). */
  faultCodigo?: string;
  faultMensaje?: string;
  /** getStatus: 0 procesado, 98 en proceso, 99 procesado con errores. */
  statusCode?: string;
}

export const zipXml = (nombre: string, xml: string) => encodeBase64(zipSync({ [`${nombre}.xml`]: strToU8(xml) }, { level: 6 }));

export function leerCdr(zipBase64: string): Cdr {
  const archivos = unzipSync(decodeBase64(zipBase64));
  const nombre = Object.keys(archivos).find((n) => n.toLowerCase().endsWith(".xml"));
  if (!nombre) throw new Error("El CDR de SUNAT no trae XML.");
  const xml = strFromU8(archivos[nombre]);
  const tag = (t: string) => new RegExp(`<(?:[\\w-]+:)?${t}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${t}>`).exec(xml)?.[1]?.trim() ?? "";
  const respuesta = /<(?:[\w-]+:)?DocumentResponse>[\s\S]*?<\/(?:[\w-]+:)?DocumentResponse>/.exec(xml)?.[0] ?? xml;
  const codigo = /<(?:[\w-]+:)?ResponseCode[^>]*>([^<]*)</.exec(respuesta)?.[1]?.trim() ?? tag("ResponseCode");
  const descripcion = /<(?:[\w-]+:)?Description[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Description>/.exec(respuesta)?.[1]?.trim() ?? "";
  const observaciones = [...xml.matchAll(/<(?:[\w-]+:)?Note[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Note>/g)].map((m) => desescapar(m[1].trim()));
  return { codigo, descripcion: desescapar(descripcion), observaciones, zipBase64, xml };
}

const desescapar = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sobre(cred: CredencialesSol, cuerpo: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" ` +
    `xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<soapenv:Header><wsse:Security><wsse:UsernameToken>` +
    `<wsse:Username>${escXml(cred.ruc + cred.usuario)}</wsse:Username><wsse:Password>${escXml(cred.clave)}</wsse:Password>` +
    `</wsse:UsernameToken></wsse:Security></soapenv:Header>` +
    `<soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`
  );
}

async function llamar(url: string, cred: CredencialesSol, cuerpo: string): Promise<string> {
  let ultimo: unknown;
  // Reintento ante cortes de red (SUNAT suele responder lento en horas punta)
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
        body: sobre(cred, cuerpo),
        signal: AbortSignal.timeout(60_000),
      });
      const texto = await r.text();
      if (!texto.includes("Envelope")) throw new Error(`SUNAT respondió HTTP ${r.status} sin SOAP: ${texto.slice(0, 200)}`);
      return texto;
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1)));
    }
  }
  throw new Error(`No se pudo conectar con SUNAT: ${(ultimo as Error)?.message ?? ultimo}`);
}

function leerFault(xml: string): { codigo: string; mensaje: string } | null {
  if (!/<(?:[\w-]+:)?Fault[\s>]/.test(xml)) return null;
  const fc = /<faultcode[^>]*>([^<]*)<\/faultcode>/.exec(xml)?.[1] ?? "";
  const fs = /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/.exec(xml)?.[1] ?? "";
  // faultcode "soap-env:Client.0111" o "env:Client" con el código en faultstring
  const codigo = /(\d{4})/.exec(fc)?.[1] ?? /(\d{4})/.exec(fs)?.[1] ?? fc;
  return { codigo, mensaje: desescapar(fs) };
}

const etiqueta = (xml: string, t: string) => new RegExp(`<(?:[\\w-]+:)?${t}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${t}>`).exec(xml)?.[1]?.trim();

/** Factura, boleta, nota de crédito / débito: respuesta inmediata con CDR. */
export async function sendBill(entorno: Entorno, cred: CredencialesSol, nombre: string, xmlFirmado: string): Promise<RespuestaSunat> {
  const zip = zipXml(nombre, xmlFirmado);
  const resp = await llamar(
    urlBill(entorno),
    cred,
    `<ser:sendBill><fileName>${nombre}.zip</fileName><contentFile>${zip}</contentFile></ser:sendBill>`
  );
  const f = leerFault(resp);
  if (f) return { ok: false, faultCodigo: f.codigo, faultMensaje: f.mensaje };
  const app = etiqueta(resp, "applicationResponse");
  if (!app) return { ok: false, faultCodigo: "SIN_CDR", faultMensaje: "SUNAT no devolvió la constancia (CDR)." };
  return { ok: true, cdr: leerCdr(app) };
}

/** Comunicación de baja / resumen diario: devuelve un ticket que se consulta con getStatus. */
export async function sendSummary(entorno: Entorno, cred: CredencialesSol, nombre: string, xmlFirmado: string): Promise<RespuestaSunat> {
  const zip = zipXml(nombre, xmlFirmado);
  const resp = await llamar(
    urlBill(entorno),
    cred,
    `<ser:sendSummary><fileName>${nombre}.zip</fileName><contentFile>${zip}</contentFile></ser:sendSummary>`
  );
  const f = leerFault(resp);
  if (f) return { ok: false, faultCodigo: f.codigo, faultMensaje: f.mensaje };
  const ticket = etiqueta(resp, "ticket");
  return ticket ? { ok: true, ticket } : { ok: false, faultCodigo: "SIN_TICKET", faultMensaje: "SUNAT no devolvió el ticket." };
}

export async function getStatus(entorno: Entorno, cred: CredencialesSol, ticket: string): Promise<RespuestaSunat> {
  const resp = await llamar(urlBill(entorno), cred, `<ser:getStatus><ticket>${escXml(ticket)}</ticket></ser:getStatus>`);
  const f = leerFault(resp);
  if (f) return { ok: false, faultCodigo: f.codigo, faultMensaje: f.mensaje };
  const statusCode = etiqueta(resp, "statusCode") ?? "";
  const content = etiqueta(resp, "content");
  if (statusCode === "98") return { ok: true, statusCode };
  if (!content) return { ok: false, statusCode, faultCodigo: statusCode, faultMensaje: "SUNAT no devolvió el CDR del ticket." };
  return { ok: true, statusCode, cdr: leerCdr(content) };
}

/** Recupera el CDR de un comprobante ya enviado (solo producción: el servicio de consulta no existe en beta). */
export async function getStatusCdr(cred: CredencialesSol, codigoTipo: string, serie: string, correlativo: string): Promise<RespuestaSunat> {
  const url = ENDPOINTS.produccion.consulta;
  const resp = await llamar(
    url,
    cred,
    `<ser:getStatusCdr><rucComprobante>${cred.ruc}</rucComprobante><tipoComprobante>${codigoTipo}</tipoComprobante>` +
      `<serieComprobante>${serie}</serieComprobante><numeroComprobante>${Number(correlativo)}</numeroComprobante></ser:getStatusCdr>`
  );
  const f = leerFault(resp);
  if (f) return { ok: false, faultCodigo: f.codigo, faultMensaje: f.mensaje };
  const statusCode = etiqueta(resp, "statusCode") ?? "";
  const content = etiqueta(resp, "content");
  if (!content) return { ok: false, statusCode, faultCodigo: statusCode, faultMensaje: etiqueta(resp, "statusMessage") ?? "Sin CDR" };
  return { ok: true, statusCode, cdr: leerCdr(content) };
}

/** Estado del ERP según el código de respuesta de SUNAT. */
export function estadoDeCodigo(codigo: string): "ACEPTADO" | "OBSERVADO" | "RECHAZADO" | "EXCEPCION" {
  const n = Number(codigo);
  if (n === 0) return "ACEPTADO";
  if (n >= 4000) return "OBSERVADO";
  if (n >= 2000 && n < 4000) return "RECHAZADO";
  return "EXCEPCION"; // 0100-1999 u otro: no fue recibido, se puede reenviar
}
