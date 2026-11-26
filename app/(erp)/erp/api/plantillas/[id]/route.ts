import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";

export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const b = await req.json();
  return prisma.plantilla.update({
    where: { id: params.id },
    data: { nombre: b.nombre, categoria: b.categoria, contenido: b.contenido, metaTemplateName: b.metaTemplateName || null, idioma: b.idioma || "es" },
  });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.plantilla.delete({ where: { id: params.id } }));
