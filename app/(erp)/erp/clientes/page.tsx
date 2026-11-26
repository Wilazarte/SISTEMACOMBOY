import { Plus } from "lucide-react";
import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { Button } from "@/components/erp-comercial/ui/button";
import { ClienteForm } from "@/components/erp-comercial/clientes/cliente-form";
import { ClientesTable } from "@/components/erp-comercial/clientes/clientes-table";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [clientes, vendedores] = await Promise.all([
    prisma.cliente.findMany({ include: { vendedor: true, ventas: { select: { total: true } } }, orderBy: { razonSocial: "asc" } }),
    prisma.vendedor.findMany({ where: { activo: true } }),
  ]);
  const rows = clientes.map(({ ventas, ...c }) => ({ ...c, totalCompras: ventas.reduce((s, v) => s + v.total, 0) }));
  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Cartera de clientes, crédito y seguimiento comercial"
        actions={<ClienteForm vendedores={vendedores} trigger={<Button><Plus />Nuevo cliente</Button>} />}
      />
      <ClientesTable clientes={rows} vendedores={vendedores} />
    </div>
  );
}
