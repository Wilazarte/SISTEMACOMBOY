import { notFound } from "next/navigation";
import { prisma } from "@/lib/erp-comercial/prisma";
import { aCostosIn, includeCostos } from "@/lib/erp-comercial/costos";
import { CostosClient } from "@/components/erp-comercial/equipos/costos-client";

export const dynamic = "force-dynamic";

// La carpeta se llama [id] porque Next no permite [codigo] junto a [id] en el mismo nivel.
// Aquí el segmento es el CÓDIGO del equipo (ej. /equipos/Z20/costos); se acepta el id como respaldo.
export default async function CostosPage({ params }: { params: { id: string } }) {
  const clave = decodeURIComponent(params.id);
  const equipo = await prisma.equipo.findFirst({
    where: { OR: [{ codigo: clave }, { id: clave }] },
    select: { id: true, codigo: true, nombre: true, categoria: true, precioLista: true, costoProduccion: { include: includeCostos } },
  });
  if (!equipo) notFound();

  const inicial = aCostosIn(equipo.costoProduccion);

  return (
    <CostosClient
      equipo={{ id: equipo.id, codigo: equipo.codigo, nombre: equipo.nombre, categoria: equipo.categoria, precioLista: equipo.precioLista }}
      inicial={inicial}
    />
  );
}
