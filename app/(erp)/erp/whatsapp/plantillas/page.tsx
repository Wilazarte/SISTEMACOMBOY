import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { PlantillasClient } from "@/components/erp-comercial/whatsapp/plantillas-client";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const plantillas = await prisma.plantilla.findMany({ orderBy: { categoria: "asc" } });
  return (
    <div>
      <PageHeader title="Plantillas de mensajes" subtitle="Bienvenida, Cotización, Oferta, Post-venta, Mantenimiento y Seguimiento" />
      <PlantillasClient plantillas={plantillas} />
    </div>
  );
}
