import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { calcularPrecio } from "@/lib/erp-comercial/pricing";

// POST { equipoId, cantidad, clienteId? | (tipoCliente, region) }
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const equipo = await prisma.equipo.findUniqueOrThrow({ where: { id: b.equipoId } });
  let { tipoCliente, region } = b;
  if (b.clienteId) {
    const c = await prisma.cliente.findUniqueOrThrow({ where: { id: b.clienteId } });
    tipoCliente = c.tipoCliente;
    region = c.region;
  }
  const reglas = await prisma.reglaPrecio.findMany();
  return calcularPrecio(equipo, reglas, { tipoCliente, region, cantidad: Number(b.cantidad || 1) });
});
