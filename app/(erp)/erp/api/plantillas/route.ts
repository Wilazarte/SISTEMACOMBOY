import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";

export const GET = handler(async () => prisma.plantilla.findMany({ orderBy: { nombre: "asc" } }));

export const POST = handler(async (req: Request) => {
  const b = await req.json();
  if (!b.nombre || !b.contenido) throw new Error("Nombre y contenido son obligatorios");
  return prisma.plantilla.create({
    data: { nombre: b.nombre, categoria: b.categoria, contenido: b.contenido, metaTemplateName: b.metaTemplateName || null, idioma: b.idioma || "es" },
  });
});
