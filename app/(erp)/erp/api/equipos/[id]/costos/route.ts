import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { includeCostos, parseCostos, prorratear, totalesCostos } from "@/lib/erp-comercial/costos";

// [id] = id del equipo

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  return prisma.costoProduccion.findUnique({ where: { equipoId: params.id }, include: includeCostos });
});

// Reemplaza todo el costeo del equipo (cabecera + filas) en una transacción.
export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const c = parseCostos(await req.json());
  const equipo = await prisma.equipo.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!equipo) throw new Error("Equipo no encontrado");

  return prisma.$transaction(async (tx) => {
    const cab = await tx.costoProduccion.upsert({
      where: { equipoId: params.id },
      create: { equipoId: params.id, diasFabricacion: c.diasFabricacion },
      update: { diasFabricacion: c.diasFabricacion },
    });
    const costoProduccionId = cab.id;
    await tx.material.deleteMany({ where: { costoProduccionId } });
    await tx.manoObra.deleteMany({ where: { costoProduccionId } });
    await tx.servicio.deleteMany({ where: { costoProduccionId } });
    await tx.material.createMany({ data: c.materiales.map((m, orden) => ({ ...m, orden, costoProduccionId })) });
    await tx.manoObra.createMany({ data: c.manoObra.map((m, orden) => ({ ...m, orden, costoProduccionId })) });
    await tx.servicio.createMany({
      data: c.servicios.map((x, orden) => ({
        ...x,
        orden,
        costoProduccionId,
        diasFabricacion: c.diasFabricacion,
        prorrateo: prorratear(x.costoMensual, c.diasFabricacion),
      })),
    });
    // El costo de producción pasa a ser el costo base del equipo (lo usan cotizaciones y precios).
    await tx.equipo.update({ where: { id: params.id }, data: { costoBase: totalesCostos(c).total } });
    return tx.costoProduccion.findUnique({ where: { id: costoProduccionId }, include: includeCostos });
  });
});
