import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { OfertasClient } from "@/components/erp-comercial/whatsapp/ofertas-client";

export const dynamic = "force-dynamic";

export default async function OfertasPage({ searchParams }: { searchParams: { equipo?: string; cliente?: string; cantidad?: string } }) {
  const [equipos, clientes, plantillas, reglas] = await Promise.all([
    prisma.equipo.findMany({ where: { activo: true }, orderBy: { codigo: "asc" } }),
    prisma.cliente.findMany({ include: { vendedor: true }, orderBy: { razonSocial: "asc" } }),
    prisma.plantilla.findMany({ orderBy: { nombre: "asc" } }),
    prisma.reglaPrecio.findMany(),
  ]);
  return (
    <div>
      <PageHeader title="Enviar ofertas por WhatsApp" subtitle="Cliente(s) + equipo + precio calculado + foto + ficha PDF + video → 1 click" />
      <OfertasClient equipos={equipos} clientes={clientes} plantillas={plantillas} reglas={reglas} inicial={searchParams} />
    </div>
  );
}
