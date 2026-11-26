import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { competidorData } from "@/lib/erp-comercial/validators";

export const POST = handler(async (req: Request) => prisma.competidor.create({ data: competidorData(await req.json()) }));
