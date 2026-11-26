import { Plus } from "lucide-react";
import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { Button } from "@/components/erp-comercial/ui/button";
import { EquipoForm } from "@/components/erp-comercial/equipos/equipo-form";
import { EquiposTable } from "@/components/erp-comercial/equipos/equipos-table";
import { includeCostos, totalesCostos } from "@/lib/erp-comercial/costos";

export const dynamic = "force-dynamic";

export default async function EquiposPage() {
  const equipos = await prisma.equipo.findMany({
    where: { activo: true },
    orderBy: { codigo: "asc" },
    include: { cotizacionItems: { select: { cantidad: true } }, costoProduccion: { include: includeCostos } },
  });
  const data = equipos.map(({ cotizacionItems, costoProduccion, ...e }) => ({
    ...e,
    cotizado: cotizacionItems.reduce((s, i) => s + i.cantidad, 0),
    costoProd: costoProduccion ? totalesCostos(costoProduccion).total : null,
  }));
  return (
    <div>
      <PageHeader
        title="Equipos"
        subtitle={`${equipos.length} equipos en catálogo · fichas técnicas, fotos y videos`}
        actions={<EquipoForm trigger={<Button><Plus />Nuevo equipo</Button>} />}
      />
      <EquiposTable equipos={data} />
    </div>
  );
}
