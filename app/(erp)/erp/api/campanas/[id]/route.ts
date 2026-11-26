import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const campana = await prisma.campana.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      equipo: true, plantilla: true,
      envios: { include: { cliente: { select: { razonSocial: true, contacto: true, telefono: true, region: true, tipoCliente: true } } }, orderBy: { cliente: { razonSocial: "asc" } } },
    },
  });
  const stats: Record<string, number> = {};
  for (const e of campana.envios) stats[e.estado] = (stats[e.estado] ?? 0) + 1;
  return { ...campana, stats };
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.campana.delete({ where: { id: params.id } }));
