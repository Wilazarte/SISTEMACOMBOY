import { prisma } from "./prisma";
import { calcularPrecio } from "./pricing";

export async function precioPara(equipoId: string, clienteId: string, cantidad = 1) {
  const [equipo, cliente, reglas] = await Promise.all([
    prisma.equipo.findUniqueOrThrow({ where: { id: equipoId } }),
    prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } }),
    prisma.reglaPrecio.findMany(),
  ]);
  return { equipo, cliente, resultado: calcularPrecio(equipo, reglas, { tipoCliente: cliente.tipoCliente, region: cliente.region, cantidad }) };
}
