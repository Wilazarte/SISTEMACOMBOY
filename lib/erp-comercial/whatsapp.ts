// Integracion WhatsApp Cloud API (Meta)
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { normalizarTelefono } from "./utils";
import { renderPlantilla, variablesUsadas, type Vars } from "./templates";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

export function waConfigurado() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);
}

function baseUrl() {
  return `https://graph.facebook.com/${API_VERSION}/${process.env.PHONE_NUMBER_ID}`;
}

/** Codigo de Meta: mensaje fuera de la ventana de 24h (solo se permiten plantillas aprobadas) */
export const ERROR_VENTANA = 131047;
export const MSG_VENTANA = `${ERROR_VENTANA}: Fuera de la ventana de 24h. Envía una plantilla aprobada.`;

export class WaApiError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

async function graphUrl(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code: number | undefined = json?.error?.code;
    const msg = json?.error?.error_data?.details || json?.error?.message || `HTTP ${res.status}`;
    throw new WaApiError(`WhatsApp API${code ? ` (${code})` : ""}: ${msg}`, code);
  }
  return json;
}

function graph(pathname: string, init: RequestInit) {
  return graphUrl(`${baseUrl()}${pathname}`, init);
}

export interface PlantillaMeta {
  name: string;
  idioma: string;
  categoria: string;
  cuerpo: string;
  /** variables del cuerpo en orden: "1","2"... o nombres si la plantilla usa parametros con nombre */
  variables: string[];
}

/** Variables {{1}} / {{nombre}} de un texto de plantilla de Meta, sin repetir y en orden */
export function variablesMeta(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];
}

export function renderMeta(texto: string, valores: Record<string, string>) {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => valores[k] ?? `{{${k}}}`);
}

/** Lista las plantillas APROBADAS de la cuenta de WhatsApp Business (requiere WHATSAPP_BUSINESS_ACCOUNT_ID) */
export async function listarPlantillasMeta(): Promise<PlantillaMeta[]> {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) throw new Error("Falta WHATSAPP_BUSINESS_ACCOUNT_ID en .env (Meta > WhatsApp Manager > ID de la cuenta)");
  const out: PlantillaMeta[] = [];
  let url: string | undefined =
    `https://graph.facebook.com/${API_VERSION}/${waba}/message_templates?fields=name,language,status,category,components&limit=100`;
  while (url) {
    const json = await graphUrl(url);
    for (const t of json.data ?? []) {
      if (t.status !== "APPROVED") continue;
      const cuerpo: string = t.components?.find((c: { type: string }) => c.type === "BODY")?.text ?? "";
      out.push({ name: t.name, idioma: t.language, categoria: t.category, cuerpo, variables: variablesMeta(cuerpo) });
    }
    url = json.paging?.next;
  }
  return out;
}

/** Sube un archivo a Meta y devuelve el media id (funciona aun si el servidor no es publico) */
export async function subirMedia(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  const json = await graph("/media", { method: "POST", body: form });
  return json.id as string;
}

async function enviarPayload(payload: Record<string, unknown>): Promise<string> {
  const json = await graph("/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
  });
  return json.messages?.[0]?.id as string;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp4": "video/mp4", ".3gp": "video/3gpp", ".pdf": "application/pdf",
};

export type TipoMedia = "image" | "video" | "document";

export interface MediaInput {
  tipo: TipoMedia;
  url: string; // URL para mostrar en la bandeja (relativa o absoluta)
  buffer?: Buffer; // si se provee, se sube directo
  mime?: string;
  filename?: string;
}

async function resolverMedia(m: MediaInput): Promise<{ id?: string; link?: string }> {
  if (m.buffer) {
    return { id: await subirMedia(m.buffer, m.mime || "application/octet-stream", m.filename || "archivo") };
  }
  if (/^https?:\/\//i.test(m.url)) return { link: m.url };
  // archivo local dentro de /public
  const rel = m.url.split("?")[0].replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", rel);
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  return { id: await subirMedia(buffer, m.mime || MIME[ext] || "application/octet-stream", m.filename || path.basename(filePath)) };
}

export interface EnviarOpts {
  clienteId: string;
  texto?: string;
  media?: MediaInput;
  origen?: "MANUAL" | "OFERTA" | "CAMPANA" | "AUTOMATIZACION";
  /** Si la plantilla tiene metaTemplateName, se envia como template aprobado (fuera de ventana 24h) */
  plantilla?: { contenido: string; metaTemplateName: string | null; idioma: string } | null;
  vars?: Vars;
  /** Plantilla aprobada en Meta enviada directamente por nombre (valores = variables del cuerpo) */
  metaTemplate?: { name: string; idioma: string; cuerpo?: string; valores: Record<string, string> };
}

/** Registra y envia un mensaje. Nunca lanza: devuelve el Mensaje con estado FALLIDO si hay error. */
export async function enviarWhatsApp(o: EnviarOpts) {
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: o.clienteId } });
  const to = normalizarTelefono(cliente.telefono);
  const usaTemplate = Boolean(o.plantilla?.metaTemplateName) && !o.media;
  const mt = o.metaTemplate;
  const texto =
    o.texto ??
    (mt ? (mt.cuerpo ? renderMeta(mt.cuerpo, mt.valores) : `[plantilla ${mt.name}]`) : o.plantilla ? renderPlantilla(o.plantilla.contenido, o.vars || {}) : "");

  const msg = await prisma.mensaje.create({
    data: {
      clienteId: cliente.id,
      direccion: "OUT",
      tipo: o.media ? o.media.tipo : usaTemplate || mt ? "template" : "text",
      contenido: texto,
      mediaUrl: o.media?.url,
      mediaNombre: o.media?.filename,
      origen: o.origen || "MANUAL",
      estado: "PENDIENTE",
    },
  });

  try {
    let waId: string;
    if (!waConfigurado()) {
      waId = `sim_${msg.id}`;
      await new Promise((r) => setTimeout(r, 120)); // simula latencia
    } else if (mt) {
      const claves = mt.cuerpo ? variablesMeta(mt.cuerpo) : Object.keys(mt.valores);
      const params = claves.map((k) => ({
        type: "text",
        text: mt.valores[k] || "-",
        ...(/^\d+$/.test(k) ? {} : { parameter_name: k }),
      }));
      waId = await enviarPayload({
        to,
        type: "template",
        template: { name: mt.name, language: { code: mt.idioma }, components: params.length ? [{ type: "body", parameters: params }] : [] },
      });
    } else if (o.media) {
      const src = await resolverMedia(o.media);
      const body: Record<string, unknown> = { ...src };
      if (texto) body.caption = texto;
      if (o.media.tipo === "document") body.filename = o.media.filename || "documento.pdf";
      waId = await enviarPayload({ to, type: o.media.tipo, [o.media.tipo]: body });
    } else if (usaTemplate && o.plantilla) {
      const params = variablesUsadas(o.plantilla.contenido).map((k) => ({ type: "text", text: String(o.vars?.[k] ?? "-") }));
      waId = await enviarPayload({
        to,
        type: "template",
        template: {
          name: o.plantilla.metaTemplateName,
          language: { code: o.plantilla.idioma || "es" },
          components: params.length ? [{ type: "body", parameters: params }] : [],
        },
      });
    } else {
      waId = await enviarPayload({ to, type: "text", text: { preview_url: true, body: texto } });
    }
    console.log(`[WA] Enviado a ${to} (${waConfigurado() ? "REAL" : "SIMULADO"}) id=${waId}`);
    const actualizado = await prisma.mensaje.update({
      where: { id: msg.id },
      data: { waMessageId: waId, estado: waConfigurado() ? "ENVIADO" : "SIMULADO" },
    });
    await prisma.cliente.update({ where: { id: cliente.id }, data: { ultimoContacto: new Date() } });
    return actualizado;
  } catch (e) {
    const fueraVentana = e instanceof WaApiError && e.code === ERROR_VENTANA;
    const error = fueraVentana ? MSG_VENTANA : e instanceof Error ? e.message : String(e);
    console.error(`[WA] Envio FALLIDO a ${to}:`, e instanceof Error ? e.message : e);
    return prisma.mensaje.update({ where: { id: msg.id }, data: { estado: "FALLIDO", error } });
  }
}
