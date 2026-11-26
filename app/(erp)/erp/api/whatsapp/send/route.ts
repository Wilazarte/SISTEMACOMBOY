import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { enviarWhatsApp, type TipoMedia } from "@/lib/erp-comercial/whatsapp";
import { enviarOferta } from "@/lib/erp-comercial/ofertas";

// POST { clienteId, texto?, plantillaId?, equipoId?, adjuntos?: {foto,pdf,video}, media?: {tipo, url, filename} }
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  if (!b.clienteId) throw new Error("Falta clienteId");

  // Plantilla aprobada en Meta: { metaTemplate: { name, idioma, cuerpo, valores: { "1": "Juan" } } }
  if (b.metaTemplate?.name) {
    const msg = await enviarWhatsApp({ clienteId: b.clienteId, metaTemplate: b.metaTemplate });
    if (msg.estado === "FALLIDO") throw new Error(msg.error || "Error al enviar");
    return msg;
  }

  // Adjuntar material de un equipo (foto / ficha PDF / video) o usar plantilla con variables
  if (b.equipoId || b.plantillaId || /\{\w+\}/.test(b.texto ?? "")) {
    const plantilla = b.plantillaId ? await prisma.plantilla.findUnique({ where: { id: b.plantillaId } }) : null;
    const r = await enviarOferta({
      clienteId: b.clienteId,
      equipoId: b.equipoId || null,
      plantilla: b.texto ? null : plantilla,
      texto: b.texto,
      adjuntarFoto: b.adjuntos?.foto,
      adjuntarPdf: b.adjuntos?.pdf,
      adjuntarVideo: b.adjuntos?.video,
      origen: "MANUAL",
    });
    if (!r.ok) throw new Error(r.error || "Error al enviar");
    return r;
  }

  // Archivo subido (imagen/video/pdf)
  if (b.media?.url) {
    const msg = await enviarWhatsApp({
      clienteId: b.clienteId,
      texto: b.texto,
      media: { tipo: b.media.tipo as TipoMedia, url: b.media.url, filename: b.media.filename },
    });
    if (msg.estado === "FALLIDO") throw new Error(msg.error || "Error al enviar");
    return msg;
  }

  if (!b.texto?.trim()) throw new Error("Mensaje vacio");
  const msg = await enviarWhatsApp({ clienteId: b.clienteId, texto: b.texto });
  if (msg.estado === "FALLIDO") throw new Error(msg.error || "Error al enviar");
  return msg;
});
