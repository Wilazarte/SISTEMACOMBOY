import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { PreciosClient } from "@/components/erp-comercial/precios/precios-client";

export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const [equipos, clientes, reglas] = await Promise.all([
    prisma.equipo.findMany({ where: { activo: true }, select: { id: true, codigo: true, nombre: true, precioLista: true, costoBase: true }, orderBy: { codigo: "asc" } }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true, tipoCliente: true, region: true }, orderBy: { razonSocial: "asc" } }),
    prisma.reglaPrecio.findMany(),
  ]);
  return (
    <div>
      <PageHeader
        title="Precios · Discriminación de 2do grado"
        subtitle="Precio final = lista × (1 + % tipo cliente) × (1 + % región) × (1 + % volumen)"
      />
      <PreciosClient equipos={equipos} clientes={clientes} reglas={reglas} />
    </div>
  );
}
