import Link from "next/link";
import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader, Empty } from "@/components/erp-comercial/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Progress } from "@/components/erp-comercial/ui/progress";
import { CampanaForm } from "@/components/erp-comercial/whatsapp/campana-form";
import { fecha } from "@/lib/erp-comercial/utils";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  const [campanas, plantillas, equipos] = await Promise.all([
    prisma.campana.findMany({ include: { envios: { select: { estado: true } }, equipo: true }, orderBy: { createdAt: "desc" } }),
    prisma.plantilla.findMany({ orderBy: { nombre: "asc" } }),
    prisma.equipo.findMany({ where: { activo: true }, orderBy: { codigo: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Campañas masivas" subtitle="Envío segmentado por región y tipo de cliente, con reporte de entregados y leídos" />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <CampanaForm plantillas={plantillas} equipos={equipos} />
        <Card>
          <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {campanas.length === 0 && <Empty>Aún no hay campañas</Empty>}
            {campanas.map((c) => {
              const total = c.envios.length;
              const n = (e: string[]) => c.envios.filter((x) => e.includes(x.estado)).length;
              const enviados = n(["ENVIADO", "ENTREGADO", "LEIDO", "SIMULADO"]);
              return (
                <Link key={c.id} href={`/erp/whatsapp/campanas/${c.id}`} className="block rounded-lg border bg-background/40 p-3 transition-colors hover:bg-accent/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.nombre}</span>
                    <Badge variant={c.estado === "COMPLETADA" ? "success" : c.estado === "ENVIANDO" ? "warning" : "secondary"}>{c.estado}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{fecha(c.createdAt, true)}{c.equipo && ` · ${c.equipo.codigo}`}</div>
                  <Progress className="mt-2 h-1.5" value={total ? (enviados / total) * 100 : 0} barClassName="bg-wa" />
                  <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                    <span>{total} dest.</span><span>{enviados} enviados</span><span>{n(["ENTREGADO", "LEIDO"])} entregados</span><span className="text-sky-300">{n(["LEIDO"])} leídos</span>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
