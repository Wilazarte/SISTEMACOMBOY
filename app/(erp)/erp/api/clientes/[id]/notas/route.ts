import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const { texto } = await req.json();
  if (!texto?.trim()) throw new Error("La nota esta vacia");
  const [nota] = await prisma.$transaction([
    prisma.nota.create({ data: { clienteId: params.id, texto: texto.trim() } }),
    prisma.cliente.update({ where: { id: params.id }, data: { ultimoContacto: new Date() } }),
  ]);
  return nota;
});
