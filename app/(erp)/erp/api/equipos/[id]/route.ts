import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { equipoData } from "@/lib/erp-comercial/validators";

export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const b = await req.json();
  return prisma.equipo.update({ where: { id: params.id }, data: equipoData(b) });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  // borrado logico si tiene historial
  const usos = await prisma.cotizacionItem.count({ where: { equipoId: params.id } });
  if (usos) return prisma.equipo.update({ where: { id: params.id }, data: { activo: false } });
  return prisma.equipo.delete({ where: { id: params.id } });
});
