import { prisma } from "@/lib/erp-comercial/prisma";
import { Inbox } from "@/components/erp-comercial/whatsapp/inbox";
import { waConfigurado } from "@/lib/erp-comercial/whatsapp";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage({ searchParams }: { searchParams: { c?: string } }) {
  const [plantillas, equipos] = await Promise.all([
    prisma.plantilla.findMany({ orderBy: { nombre: "asc" } }),
    prisma.equipo.findMany({ where: { activo: true }, select: { id: true, codigo: true, nombre: true, videoUrl: true }, orderBy: { codigo: "asc" } }),
  ]);
  return (
    <div>
      <div className="no-print mb-3">
        <h1 className="text-2xl font-bold tracking-tight">Bandeja WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Conversaciones vinculadas a cada cliente · se actualiza automáticamente</p>
      </div>
      <Inbox inicial={searchParams.c} plantillas={plantillas} equipos={equipos} simulacion={!waConfigurado()} />
    </div>
  );
}
