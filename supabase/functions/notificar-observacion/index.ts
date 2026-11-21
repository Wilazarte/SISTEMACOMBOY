// =====================================================================
// Edge Function notificar-observacion (Fase 3).
// La llama un Database Webhook de Supabase en cada INSERT de public.observaciones
// (observación de Gerencia sobre un módulo). Avisa por correo y WhatsApp a los
// usuarios asignados a ese módulo (perfiles.modulos contiene el módulo), salvo
// Gerencia y quien escribió la observación.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY, AVISOS_FROM (ej. "ERP COMBOY VID <avisos@comboyvid.com>")   -> correo (resend.com)
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (opcional)              -> WhatsApp Cloud API (Meta)
//   WEBHOOK_SECRET  -> mismo valor en la cabecera "x-webhook-secret" del Database Webhook
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
// Sin RESEND_* o WHATSAPP_* ese canal se salta (no falla).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const MODULOS: Record<string, string> = {
  "/dashboard/compras": "Tesorería / Compras",
  "/dashboard/tesoreria": "Tesorería",
  "/dashboard/almacen": "Almacén",
  "/dashboard/ventas": "Ventas",
  "/dashboard/planilla": "Planilla",
};

interface Observacion {
  id: string;
  modulo: string;
  texto: string;
  usuario: string;
  fecha: string;
}

const env = (k: string) => Deno.env.get(k) ?? "";

async function enviarCorreo(para: string, asunto: string, html: string): Promise<string> {
  if (!env("RESEND_API_KEY") || !env("AVISOS_FROM")) return "correo: sin configurar";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("AVISOS_FROM"), to: [para], subject: asunto, html }),
  });
  return r.ok ? `correo ok ${para}` : `correo ${para}: ${r.status} ${await r.text()}`;
}

async function enviarWhatsApp(telefono: string, texto: string, modulo: string, autor: string): Promise<string> {
  if (!env("WHATSAPP_TOKEN") || !env("WHATSAPP_PHONE_ID")) return "whatsapp: sin configurar";
  const numero = telefono.replace(/\D/g, "");
  // Fuera de la ventana de 24 h Meta exige una plantilla aprobada (WHATSAPP_TEMPLATE con 3 variables: módulo, autor, texto)
  const cuerpo = env("WHATSAPP_TEMPLATE")
    ? {
        messaging_product: "whatsapp",
        to: numero,
        type: "template",
        template: {
          name: env("WHATSAPP_TEMPLATE"),
          language: { code: "es" },
          components: [{ type: "body", parameters: [modulo, autor, texto.slice(0, 900)].map((t) => ({ type: "text", text: t })) }],
        },
      }
    : { messaging_product: "whatsapp", to: numero, type: "text", text: { body: `ERP COMBOY VID · Observación de Gerencia en ${modulo} (${autor}):\n${texto}` } };
  const r = await fetch(`https://graph.facebook.com/v20.0/${env("WHATSAPP_PHONE_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return r.ok ? `whatsapp ok ${numero}` : `whatsapp ${numero}: ${r.status} ${await r.text()}`;
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

Deno.serve(async (req) => {
  if (env("WEBHOOK_SECRET") && req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET"))
    return new Response("no autorizado", { status: 401 });
  const cuerpo = await req.json().catch(() => null);
  const obs = cuerpo?.record as Observacion | undefined;
  if (cuerpo?.type !== "INSERT" || !obs?.modulo) return Response.json({ ok: true, omitido: true });

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: perfiles, error } = await sb.from("perfiles").select("*");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const destinatarios = (perfiles ?? []).filter(
    (p) =>
      p.rol !== "gerencia" &&
      p.activo !== false &&
      p.usuario !== obs.usuario &&
      Array.isArray(p.modulos) &&
      p.modulos.some((m: string) => m === obs.modulo || obs.modulo.startsWith(`${m}/`))
  );
  const nombreModulo = MODULOS[obs.modulo] ?? obs.modulo;
  const asunto = `Observación de Gerencia · ${nombreModulo}`;
  const html = `<p><b>${escapar(obs.usuario)}</b> dejó una observación en <b>${escapar(nombreModulo)}</b>:</p><blockquote>${escapar(obs.texto)}</blockquote><p>Ábrala en el ERP: https://sistemacomboy.vercel.app${escapar(obs.modulo)}</p>`;

  const resultados: string[] = [];
  for (const p of destinatarios) {
    if (p.email && !String(p.email).endsWith(".local")) resultados.push(await enviarCorreo(p.email, asunto, html));
    if (p.telefono_whatsapp) resultados.push(await enviarWhatsApp(p.telefono_whatsapp, obs.texto, nombreModulo, obs.usuario));
  }
  return Response.json({ ok: true, destinatarios: destinatarios.map((p) => p.usuario), resultados });
});
