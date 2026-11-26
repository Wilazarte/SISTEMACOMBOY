import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const b = await req.json();
  return prisma.tarea.update({ where: { id: params.id }, data: { completada: Boolean(b.completada) } });
});
