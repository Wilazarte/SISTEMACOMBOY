import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { CotizacionesTable, NuevaCotizacion } from "@/components/erp-comercial/cotizaciones/cotizaciones-client";

export const dynamic = "force-dynamic";

export default async function CotizacionesPage({ searchParams }: { searchParams: { cliente?: string } }) {
  const [cotizaciones, clientes, equipos, reglas] = await Promise.all([
    prisma.cotizacion.findMany({
      include: { cliente: { select: { id: true, razonSocial: true } }, items: { select: { cantidad: true, equipo: { select: { codigo: true } } } } },
      orderBy: { numero: "desc" },
    }),
    prisma.cliente.findMany({ select: { id: true, razonSocial: true, tipoCliente: true, region: true }, orderBy: { razonSocial: "asc" } }),
    prisma.equipo.findMany({ where: { activo: true }, select: { id: true, codigo: true, nombre: true, precioLista: true, costoBase: true, stock: true }, orderBy: { codigo: "asc" } }),
    prisma.reglaPrecio.findMany(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cotizaciones"
        subtitle="Crea, envía por WhatsApp y convierte en venta (descuenta stock y programa mantenimientos)"
        actions={<NuevaCotizacion clientes={clientes} equipos={equipos} reglas={reglas} clienteInicial={searchParams.cliente} />}
      />
      <CotizacionesTable cotizaciones={cotizaciones.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))} />
    </div>
  );
}
