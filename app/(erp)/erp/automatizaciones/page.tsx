import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { AutoClient } from "@/components/erp-comercial/automatizaciones/auto-client";
import { getConfig } from "@/lib/erp-comercial/config";
import { addDays, diasDesde, fecha } from "@/lib/erp-comercial/utils";

export const dynamic = "force-dynamic";

export default async function AutomatizacionesPage() {
  const cfg = await getConfig();
  const corte = addDays(new Date(), -Number(cfg.diasSinContactoProspecto));
  const [mant, seg, post, tareas, logs, pSeg] = await Promise.all([
    prisma.mantenimiento.findMany({
      where: { estado: { in: ["PENDIENTE", "NOTIFICADO"] }, fechaProgramada: { lte: addDays(new Date(), 90) } },
      include: { cliente: true, equipo: true },
      orderBy: { fechaProgramada: "asc" },
    }),
    prisma.cliente.findMany({
      where: { etapa: { in: ["PROSPECTO", "COTIZADO", "NEGOCIADO"] }, OR: [{ ultimoContacto: null }, { ultimoContacto: { lte: corte } }] },
      orderBy: { ultimoContacto: "asc" },
    }),
    prisma.cliente.findMany({ where: { etapa: "GANADO", encuestaEnviada: false }, orderBy: { fechaGanado: "asc" } }),
    prisma.tarea.findMany({ where: { completada: false }, orderBy: { fechaVence: "asc" } }),
    prisma.automatizacionLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.plantilla.findFirst({ where: { categoria: "SEGUIMIENTO" } }),
  ]);
  const ahora = new Date();
  return (
    <div>
      <PageHeader title="Automatizaciones" subtitle="Mantenimiento, seguimiento de prospectos y encuestas post-venta por WhatsApp" />
      <AutoClient
        config={cfg}
        plantillaSeguimientoId={pSeg?.id}
        mantenimientos={mant.map((m) => ({ id: m.id, fecha: fecha(m.fechaProgramada), vencido: m.fechaProgramada < ahora, estado: m.estado, cliente: m.cliente.razonSocial, clienteId: m.clienteId, equipo: m.equipo.nombre }))}
        seguimientos={seg.map((s) => ({ id: s.id, razonSocial: s.razonSocial, contacto: s.contacto, etapa: s.etapa, dias: diasDesde(s.ultimoContacto) }))}
        postventa={post.map((p) => ({
          id: p.id, razonSocial: p.razonSocial, fechaGanado: fecha(p.fechaGanado), encuestaEnviada: p.encuestaEnviada,
          enviaEn: p.fechaGanado ? Number(cfg.diasPostVenta) - (diasDesde(p.fechaGanado) ?? 0) : 0,
        }))}
        tareas={tareas.map((t) => ({ id: t.id, tipo: t.tipo, titulo: t.titulo, descripcion: t.descripcion, vence: fecha(t.fechaVence), clienteId: t.clienteId }))}
        logs={logs.map((l) => ({ id: l.id, tipo: l.tipo, detalle: l.detalle, fecha: fecha(l.createdAt, true) }))}
      />
    </div>
  );
}
