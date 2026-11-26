import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { equipoData } from "@/lib/erp-comercial/validators";

export const GET = handler(async () => prisma.equipo.findMany({ where: { activo: true }, orderBy: { codigo: "asc" } }));

export const POST = handler(async (req: Request) => prisma.equipo.create({ data: equipoData(await req.json()) }));
