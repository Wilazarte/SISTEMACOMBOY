import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";

export const dynamic = "force-dynamic";

// Mensajes de un cliente; marca como leidos los entrantes
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const [cliente, mensajes] = await Promise.all([
    prisma.cliente.findUniqueOrThrow({ where: { id: params.id }, include: { vendedor: true } }),
    prisma.mensaje.findMany({ where: { clienteId: params.id }, orderBy: { createdAt: "asc" }, take: 500 }),
  ]);
  await prisma.mensaje.updateMany({ where: { clienteId: params.id, direccion: "IN", leido: false }, data: { leido: true } });
  // ventana de 24h: WhatsApp solo permite texto libre si el cliente escribio en las ultimas 24h
  const ultimoIn = [...mensajes].reverse().find((m) => m.direccion === "IN");
  const ventanaAbierta = ultimoIn ? Date.now() - new Date(ultimoIn.createdAt).getTime() < 24 * 3600_000 : false;
  return { cliente, mensajes, ventanaAbierta };
});
