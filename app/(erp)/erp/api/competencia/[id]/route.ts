import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { competidorData } from "@/lib/erp-comercial/validators";

export const PUT = handler(async (req: Request, { params }: Ctx) =>
  prisma.competidor.update({ where: { id: params.id }, data: competidorData(await req.json()) }),
);
export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.competidor.delete({ where: { id: params.id } }));
