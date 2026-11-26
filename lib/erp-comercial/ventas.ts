import { prisma } from "./prisma";
import { addMonths } from "./utils";

/** Convierte una cotizacion en venta: descuenta stock, programa mantenimientos y marca cliente GANADO */
export async function convertirCotizacionEnVenta(cotizacionId: string) {
  const cot = await prisma.cotizacion.findUniqueOrThrow({
    where: { id: cotizacionId },
    include: { items: { include: { equipo: true } }, venta: true },
  });
  if (cot.venta) return cot.venta;
  const ahora = new Date();
  return prisma.$transaction(async (tx) => {
    const venta = await tx.venta.create({
      data: {
        clienteId: cot.clienteId,
        cotizacionId: cot.id,
        total: cot.total,
        costo: cot.costo,
        fecha: ahora,
        items: {
          create: cot.items.map((i) => ({
            equipoId: i.equipoId,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            costoUnitario: i.costoUnitario,
            intervaloMantenimientoMeses: i.equipo.intervaloMantenimientoMeses,
          })),
        },
      },
      include: { items: true },
    });
    for (const it of venta.items) {
      await tx.equipo.update({ where: { id: it.equipoId }, data: { stock: { decrement: it.cantidad } } });
      if (it.intervaloMantenimientoMeses > 0) {
        // programa los proximos 4 mantenimientos
        for (let k = 1; k <= 4; k++) {
          await tx.mantenimiento.create({
            data: {
              ventaItemId: it.id,
              clienteId: cot.clienteId,
              equipoId: it.equipoId,
              fechaProgramada: addMonths(ahora, it.intervaloMantenimientoMeses * k),
            },
          });
        }
      }
    }
    await tx.cotizacion.update({ where: { id: cot.id }, data: { estado: "ACEPTADA" } });
    await tx.cliente.update({
      where: { id: cot.clienteId },
      data: { etapa: "GANADO", fechaGanado: ahora, encuestaEnviada: false },
    });
    return venta;
  });
}
