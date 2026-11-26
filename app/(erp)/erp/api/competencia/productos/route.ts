import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";

export const POST = handler(async (req: Request) => {
  const b = await req.json();
  return prisma.productoCompetencia.create({
    data: {
      competidorId: b.competidorId,
      equipoId: b.equipoId,
      nombre: String(b.nombre),
      marca: String(b.marca ?? ""),
      precio: Number(b.precio ?? 0),
      fichaTecnica: typeof b.fichaTecnica === "string" ? b.fichaTecnica : JSON.stringify(b.fichaTecnica ?? {}),
      fortalezas: String(b.fortalezas ?? ""),
      debilidades: String(b.debilidades ?? ""),
    },
  });
});
