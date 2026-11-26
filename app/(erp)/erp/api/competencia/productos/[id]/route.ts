import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";

export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.productoCompetencia.delete({ where: { id: params.id } }));
