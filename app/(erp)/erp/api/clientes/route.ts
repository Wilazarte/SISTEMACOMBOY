import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { clienteData } from "@/lib/erp-comercial/validators";

export const GET = handler(async () =>
  prisma.cliente.findMany({
    orderBy: { razonSocial: "asc" },
    select: { id: true, razonSocial: true, contacto: true, telefono: true, region: true, tipoCliente: true, etapa: true, optIn: true },
  }),
);

export const POST = handler(async (req: Request) => prisma.cliente.create({ data: clienteData(await req.json()) }));
