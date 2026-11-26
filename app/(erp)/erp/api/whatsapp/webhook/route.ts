// Webhook de WhatsApp Cloud API
// Configurar en Meta > WhatsApp > Configuracion: URL https://TU_DOMINIO/api/whatsapp/webhook
// Token de verificacion = WHATSAPP_VERIFY_TOKEN. Suscribir campo "messages".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/erp-comercial/prisma";
import { ERROR_VENTANA, MSG_VENTANA } from "@/lib/erp-comercial/whatsapp";

export const dynamic = "force-dynamic";

// Limpia comillas/espacios/saltos de linea tipicos al pegar la variable en Vercel
const limpiar = (v?: string | null) => (v ?? "").trim().replace(/^['"]+|['"]+$/g, "").trim();

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const mode = p.get("hub.mode");
  const token = limpiar(p.get("hub.verify_token"));
  const challenge = p.get("hub.challenge") ?? "";
  const VERIFY_TOKEN = limpiar(process.env.WHATSAPP_VERIFY_TOKEN) || "comboy-verify-2026";
  const ok = mode === "subscribe" && token === VERIFY_TOKEN;
  console.log("[webhook] verificacion", {
    mode, tokenRecibido: token, envDefinida: !!process.env.WHATSAPP_VERIFY_TOKEN,
    envLargo: process.env.WHATSAPP_VERIFY_TOKEN?.length ?? 0, ok,
  });
  if (ok) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

const RANGO: Record<string, number> = { PENDIENTE: 0, SIMULADO: 1, ENVIADO: 1, ENTREGADO: 2, LEIDO: 3, FALLIDO: 4 };
const MAPA: Record<string, string> = { sent: "ENVIADO", delivered: "ENTREGADO", read: "LEIDO", failed: "FALLIDO" };

type WaMsg = {
  from: string; id: string; timestamp: string; type: string;
  text?: { body: string };
  image?: { id: string; caption?: string }; video?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string }; audio?: { id: string };
  button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  location?: { latitude: number; longitude: number };
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};

        // Estados de mensajes enviados (entregado / leido / fallido)
        for (const s of v.statuses ?? []) {
          const nuevo = MAPA[s.status];
          console.log(`[webhook] status ${s.status} ${s.recipient_id ?? ""} ${s.id}`, s.errors?.length ? JSON.stringify(s.errors) : "");
          if (!nuevo) continue;
          const msg = await prisma.mensaje.findUnique({ where: { waMessageId: s.id }, include: { envio: true } });
          if (!msg) continue;
          if ((RANGO[nuevo] ?? 0) <= (RANGO[msg.estado] ?? 0) && nuevo !== "FALLIDO") continue;
          const error = s.errors?.[0]
            ? s.errors[0].code === ERROR_VENTANA ? MSG_VENTANA : `${s.errors[0].code}: ${s.errors[0].title}`
            : null;
          await prisma.mensaje.update({ where: { id: msg.id }, data: { estado: nuevo, error } });
          if (msg.envio) await prisma.campanaEnvio.update({ where: { id: msg.envio.id }, data: { estado: nuevo, error } });
        }

        // Mensajes entrantes
        const contactos: { wa_id: string; profile?: { name?: string } }[] = v.contacts ?? [];
        for (const m of (v.messages ?? []) as WaMsg[]) {
          console.log(`[webhook] mensaje IN de ${m.from} (${m.type}) ${m.text?.body?.slice(0, 60) ?? ""}`);
          if (await prisma.mensaje.findUnique({ where: { waMessageId: m.id } })) continue;
          let cliente = await prisma.cliente.findFirst({ where: { telefono: m.from } });
          if (!cliente) {
            // nuevo contacto -> prospecto automatico en el CRM
            const nombre = contactos.find((c) => c.wa_id === m.from)?.profile?.name || `WhatsApp ${m.from}`;
            cliente = await prisma.cliente.create({
              data: { tipoDocumento: "DNI", documento: `WA-${m.from}`, razonSocial: nombre, contacto: nombre, telefono: m.from, region: "LIMA", tipoCliente: "RETAIL", etapa: "PROSPECTO" },
            });
          }
          const media = m.image ?? m.video ?? m.document ?? m.audio;
          const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? "";
          const ubicacion = m.location ? `📍 Ubicacion: https://maps.google.com/?q=${m.location.latitude},${m.location.longitude}` : "";
          const contenido: string =
            m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ??
            (ubicacion || caption || (m.type !== "text" ? `[${m.type}]` : ""));
          await prisma.mensaje.create({
            data: {
              clienteId: cliente.id, direccion: "IN", origen: "WEBHOOK", estado: "RECIBIDO", waMessageId: m.id,
              tipo: ["image", "video", "document"].includes(m.type) ? m.type : "text",
              contenido,
              mediaUrl: media ? `/erp/api/whatsapp/media/${media.id}` : null,
              mediaNombre: m.document?.filename,
              createdAt: new Date(Number(m.timestamp) * 1000),
            },
          });
          // La ventana de 24h se calcula desde el ultimo mensaje IN (createdAt = hora real de Meta), ver chats/[id]
          await prisma.cliente.update({ where: { id: cliente.id }, data: { ultimoContacto: new Date(Number(m.timestamp) * 1000) } });
        }
      }
    }
  } catch (e) {
    console.error("[webhook] error", e);
  }
  // Meta exige responder 200 siempre
  return NextResponse.json({ ok: true });
}
