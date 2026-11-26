// Proxy para descargar media entrante de WhatsApp (requiere token)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return new Response("WhatsApp no configurado", { status: 404 });
  const v = process.env.WHATSAPP_API_VERSION || "v21.0";
  const meta = await fetch(`https://graph.facebook.com/${v}/${params.id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meta.ok) return new Response("Media no encontrada", { status: 404 });
  const { url, mime_type } = await meta.json();
  const file = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return new Response(file.body, { headers: { "Content-Type": mime_type || "application/octet-stream", "Cache-Control": "private, max-age=86400" } });
}
