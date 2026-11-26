import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";

export const dynamic = "force-dynamic";

// Lista de conversaciones: todos los clientes, ordenados por ultimo mensaje
export const GET = handler(async () => {
  const clientes = await prisma.cliente.findMany({
    select: {
      id: true, razonSocial: true, contacto: true, telefono: true, etapa: true, tipoCliente: true, region: true,
      mensajes: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { mensajes: { where: { direccion: "IN", leido: false } } } },
    },
  });
  return clientes
    .map((c) => ({
      id: c.id, razonSocial: c.razonSocial, contacto: c.contacto, telefono: c.telefono, etapa: c.etapa,
      tipoCliente: c.tipoCliente, region: c.region,
      ultimo: c.mensajes[0] ?? null,
      noLeidos: c._count.mensajes,
    }))
    .sort((a, b) => (b.ultimo ? new Date(b.ultimo.createdAt).getTime() : 0) - (a.ultimo ? new Date(a.ultimo.createdAt).getTime() : 0));
});
