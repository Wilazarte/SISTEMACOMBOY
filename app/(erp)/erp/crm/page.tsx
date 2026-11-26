import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { Kanban, type KanbanCard } from "@/components/erp-comercial/crm/kanban";
import { getConfig } from "@/lib/erp-comercial/config";
import { diasDesde, fecha } from "@/lib/erp-comercial/utils";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const [clientes, cfg] = await Promise.all([
    prisma.cliente.findMany({
      include: { vendedor: true, cotizaciones: { where: { estado: { in: ["BORRADOR", "ENVIADA"] } }, select: { total: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    getConfig(),
  ]);
  const cards: KanbanCard[] = clientes.map((c) => ({
    id: c.id, razonSocial: c.razonSocial, contacto: c.contacto, tipoCliente: c.tipoCliente, region: c.region, etapa: c.etapa,
    vendedor: c.vendedor?.nombre ?? null,
    montoAbierto: c.cotizaciones.reduce((s, q) => s + q.total, 0),
    diasSinContacto: diasDesde(c.ultimoContacto),
    proximoContacto: c.proximoContacto ? fecha(c.proximoContacto) : null,
  }));
  return (
    <div>
      <PageHeader title="Pipeline CRM" subtitle={`Arrastra las tarjetas entre etapas · alerta si hay ${cfg.diasSinContactoProspecto}+ días sin contacto`} />
      <Kanban cards={cards} diasAlerta={Number(cfg.diasSinContactoProspecto)} />
    </div>
  );
}
