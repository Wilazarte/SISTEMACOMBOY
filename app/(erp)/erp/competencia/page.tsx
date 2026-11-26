import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { CompetenciaClient } from "@/components/erp-comercial/competencia/competencia-client";

export const dynamic = "force-dynamic";

export default async function CompetenciaPage({ searchParams }: { searchParams: { equipo?: string } }) {
  const [competidores, equipos] = await Promise.all([
    prisma.competidor.findMany({ include: { productos: { include: { equipo: true } } }, orderBy: { nombre: "asc" } }),
    prisma.equipo.findMany({ where: { activo: true }, orderBy: { codigo: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Competencia" subtitle="Inteligencia competitiva: precios, fichas técnicas, fortalezas y debilidades" />
      <CompetenciaClient competidores={competidores} equipos={equipos} equipoInicial={searchParams.equipo} />
    </div>
  );
}
