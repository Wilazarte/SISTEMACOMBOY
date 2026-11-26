import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { enviarOferta } from "@/lib/erp-comercial/ofertas";

// POST { envioId } -> envia a un destinatario (la UI itera para mostrar progreso en vivo)
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const { envioId } = await req.json();
  const envio = await prisma.campanaEnvio.findUniqueOrThrow({ where: { id: envioId }, include: { campana: { include: { plantilla: true } } } });
  if (envio.campanaId !== params.id) throw new Error("Envio no pertenece a la campaña");
  if (envio.estado !== "PENDIENTE" && envio.estado !== "FALLIDO") return envio;
  const c = envio.campana;
  if (c.estado === "BORRADOR") await prisma.campana.update({ where: { id: c.id }, data: { estado: "ENVIANDO" } });

  const plantillaMeta = c.plantilla && c.plantilla.contenido === c.mensaje ? c.plantilla : null;
  const r = await enviarOferta({
    clienteId: envio.clienteId,
    equipoId: c.equipoId,
    plantilla: plantillaMeta,
    texto: plantillaMeta ? undefined : c.mensaje,
    adjuntarFoto: c.adjuntarFoto,
    adjuntarPdf: c.adjuntarPdf,
    adjuntarVideo: c.adjuntarVideo,
    origen: "CAMPANA",
  });
  const actualizado = await prisma.campanaEnvio.update({
    where: { id: envio.id },
    data: { estado: r.estado, error: r.error ?? null, enviadoAt: new Date(), mensajeId: r.principal?.id ?? null },
  });
  const pendientes = await prisma.campanaEnvio.count({ where: { campanaId: c.id, estado: "PENDIENTE" } });
  if (!pendientes) await prisma.campana.update({ where: { id: c.id }, data: { estado: "COMPLETADA" } });
  return actualizado;
});
