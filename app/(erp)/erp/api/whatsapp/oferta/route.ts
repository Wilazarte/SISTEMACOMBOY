import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { enviarOferta } from "@/lib/erp-comercial/ofertas";

// POST { clienteId, equipoId, cantidad, plantillaId?, texto?, adjuntarFoto, adjuntarPdf, adjuntarVideo }
// Se llama una vez por cliente para poder mostrar progreso en la UI
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const plantilla = b.plantillaId ? await prisma.plantilla.findUnique({ where: { id: b.plantillaId } }) : null;
  const r = await enviarOferta({
    clienteId: b.clienteId,
    equipoId: b.equipoId,
    cantidad: Number(b.cantidad || 1),
    plantilla: b.texto ? null : plantilla,
    texto: b.texto,
    adjuntarFoto: Boolean(b.adjuntarFoto),
    adjuntarPdf: Boolean(b.adjuntarPdf),
    adjuntarVideo: Boolean(b.adjuntarVideo),
    origen: "OFERTA",
  });
  const cliente = await prisma.cliente.findUnique({ where: { id: b.clienteId } });
  if (r.ok && cliente && ["PROSPECTO"].includes(cliente.etapa)) {
    await prisma.cliente.update({ where: { id: cliente.id }, data: { etapa: "COTIZADO" } });
  }
  return { ok: r.ok, estado: r.estado, error: r.error, precioUnitario: r.precioUnitario, mensajes: r.mensajes.length };
});
