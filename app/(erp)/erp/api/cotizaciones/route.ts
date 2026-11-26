import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { calcularPrecio } from "@/lib/erp-comercial/pricing";

// POST { clienteId, items: [{ equipoId, cantidad }], notas? }
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: b.clienteId } });
  const items: { equipoId: string; cantidad: number }[] = (b.items ?? []).filter((i: { equipoId: string }) => i.equipoId);
  if (!items.length) throw new Error("Agrega al menos un equipo");
  const reglas = await prisma.reglaPrecio.findMany();
  const equipos = await prisma.equipo.findMany({ where: { id: { in: items.map((i) => i.equipoId) } } });
  const lineas = items.map((i) => {
    const e = equipos.find((x) => x.id === i.equipoId)!;
    const r = calcularPrecio(e, reglas, { tipoCliente: cliente.tipoCliente, region: cliente.region, cantidad: Number(i.cantidad) });
    return { equipoId: e.id, cantidad: r.cantidad, precioLista: e.precioLista, precioUnitario: r.precioUnitario, costoUnitario: e.costoBase, subtotal: r.subtotal };
  });
  const total = lineas.reduce((s, l) => s + l.subtotal, 0);
  const costo = lineas.reduce((s, l) => s + l.costoUnitario * l.cantidad, 0);
  const ultimo = await prisma.cotizacion.findFirst({ orderBy: { numero: "desc" } });
  const cot = await prisma.cotizacion.create({
    data: { numero: (ultimo?.numero ?? 1000) + 1, clienteId: cliente.id, subtotal: total, total, costo, notas: b.notas || null, items: { create: lineas } },
  });
  if (cliente.etapa === "PROSPECTO") await prisma.cliente.update({ where: { id: cliente.id }, data: { etapa: "COTIZADO" } });
  return cot;
});
