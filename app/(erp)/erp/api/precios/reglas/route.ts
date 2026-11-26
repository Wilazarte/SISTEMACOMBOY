import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { reglaData } from "@/lib/erp-comercial/validators";

export const POST = handler(async (req: Request) => prisma.reglaPrecio.create({ data: reglaData(await req.json()) }));
