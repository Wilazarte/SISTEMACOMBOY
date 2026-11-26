import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { reglaData } from "@/lib/erp-comercial/validators";

export const PUT = handler(async (req: Request, { params }: Ctx) =>
  prisma.reglaPrecio.update({ where: { id: params.id }, data: reglaData(await req.json()) }),
);

export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.reglaPrecio.delete({ where: { id: params.id } }));
