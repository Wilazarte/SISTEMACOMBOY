import Link from "next/link";
import { BadgeDollarSign, Percent, FileText, MessageCircle, Wrench, Users, AlertTriangle, CheckCheck } from "lucide-react";
import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader, Kpi, Empty } from "@/components/erp-comercial/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { BarrasChart, LineaChart } from "@/components/erp-comercial/charts";
import { ETAPAS, LABEL_ETAPA, LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";
import { addDays, fecha, pct, soles } from "@/lib/erp-comercial/utils";
import { Badge } from "@/components/erp-comercial/ui/badge";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [ventas, cotItems, cotAbiertas, clientes, mensajesOut, mensajes14, mantPend, tareas] = await Promise.all([
    prisma.venta.findMany({ include: { cliente: { select: { region: true, tipoCliente: true } } } }),
    prisma.cotizacionItem.findMany({ include: { equipo: { select: { nombre: true, codigo: true } } } }),
    prisma.cotizacion.findMany({ where: { estado: { in: ["BORRADOR", "ENVIADA"] } } }),
    prisma.cliente.findMany({ select: { etapa: true } }),
    prisma.mensaje.findMany({ where: { direccion: "OUT" }, select: { estado: true } }),
    prisma.mensaje.findMany({ where: { direccion: "OUT", createdAt: { gte: addDays(new Date(), -13) } }, select: { createdAt: true } }),
    prisma.mantenimiento.findMany({
      where: { estado: { in: ["PENDIENTE", "NOTIFICADO"] }, fechaProgramada: { lte: addDays(new Date(), 30) } },
      include: { cliente: true, equipo: true },
      orderBy: { fechaProgramada: "asc" },
    }),
    prisma.tarea.findMany({ where: { completada: false }, include: { cliente: true }, orderBy: { fechaVence: "asc" }, take: 6 }),
  ]);

  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalCosto = ventas.reduce((s, v) => s + v.costo, 0);
  const margen = totalVentas ? ((totalVentas - totalCosto) / totalVentas) * 100 : 0;
  const montoAbierto = cotAbiertas.reduce((s, c) => s + c.total, 0);
  const leidos = mensajesOut.filter((m) => m.estado === "LEIDO").length;

  const agrupar = <K extends string>(keys: readonly K[], key: (v: (typeof ventas)[number]) => K, label: Record<string, string>) =>
    keys.map((k) => {
      const vs = ventas.filter((v) => key(v) === k);
      const t = vs.reduce((s, v) => s + v.total, 0);
      const c = vs.reduce((s, v) => s + v.costo, 0);
      return { nombre: label[k], ventas: Math.round(t), margen: t ? ((t - c) / t) * 100 : 0, n: vs.length };
    });
  const porRegion = agrupar(REGIONES, (v) => v.cliente.region as (typeof REGIONES)[number], LABEL_REGION);
  const porTipo = agrupar(TIPOS_CLIENTE, (v) => v.cliente.tipoCliente as (typeof TIPOS_CLIENTE)[number], LABEL_TIPO);

  const cotizadosMap = new Map<string, number>();
  for (const i of cotItems) cotizadosMap.set(i.equipo.nombre, (cotizadosMap.get(i.equipo.nombre) ?? 0) + i.cantidad);
  const masCotizados = Array.from(cotizadosMap, ([nombre, unidades]) => ({ nombre: nombre.length > 24 ? nombre.slice(0, 23) + "…" : nombre, unidades }))
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 6);

  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(new Date(), i - 13);
    const k = d.toISOString().slice(0, 10);
    return { dia: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }), k, mensajes: 0 };
  });
  for (const m of mensajes14) {
    const d = dias.find((x) => x.k === m.createdAt.toISOString().slice(0, 10));
    if (d) d.mensajes++;
  }
  const pipeline = ETAPAS.map((e) => ({ nombre: LABEL_ETAPA[e], clientes: clientes.filter((c) => c.etapa === e).length }));
  const vencidos = mantPend.filter((m) => m.fechaProgramada < new Date()).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard comercial" subtitle="Resumen de ventas, márgenes, pipeline y actividad de WhatsApp" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Ventas totales" value={soles(totalVentas)} hint={`${ventas.length} ventas cerradas`} icon={BadgeDollarSign} tone="green" />
        <Kpi label="Margen promedio" value={pct(margen)} hint={`Utilidad ${soles(totalVentas - totalCosto)}`} icon={Percent} tone="blue" />
        <Kpi label="Cotizaciones abiertas" value={cotAbiertas.length} hint={soles(montoAbierto)} icon={FileText} tone="violet" />
        <Kpi label="Clientes" value={clientes.length} hint={`${clientes.filter((c) => c.etapa === "PROSPECTO").length} prospectos`} icon={Users} tone="blue" />
        <Kpi label="Mensajes enviados" value={mensajesOut.length} hint={`${leidos} leídos`} icon={MessageCircle} tone="green" />
        <Kpi label="Mantenimientos" value={mantPend.length} hint={vencidos ? `${vencidos} vencidos` : "próximos 30 días"} icon={Wrench} tone={vencidos ? "rose" : "amber"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por región</CardTitle>
            <CardDescription>Monto vendido (S/) — el margen por región está en la tabla</CardDescription>
          </CardHeader>
          <CardContent>
            <BarrasChart data={porRegion} x="nombre" y="ventas" nombre="Ventas" formato="soles" />
            <Table className="mt-3 text-xs">
              <THead><TR><TH>Región</TH><TH className="text-right">Ventas</TH><TH className="text-right">N°</TH><TH className="text-right">Margen</TH></TR></THead>
              <TBody>
                {porRegion.map((r) => (
                  <TR key={r.nombre}><TD>{r.nombre}</TD><TD className="text-right tabular-nums">{soles(r.ventas)}</TD><TD className="text-right">{r.n}</TD><TD className="text-right tabular-nums">{r.n ? pct(r.margen) : "—"}</TD></TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas por tipo de cliente</CardTitle>
            <CardDescription>Efecto de la discriminación de precios por segmento</CardDescription>
          </CardHeader>
          <CardContent>
            <BarrasChart data={porTipo} x="nombre" y="ventas" nombre="Ventas" formato="soles" />
            <Table className="mt-3 text-xs">
              <THead><TR><TH>Tipo</TH><TH className="text-right">Ventas</TH><TH className="text-right">N°</TH><TH className="text-right">Margen</TH></TR></THead>
              <TBody>
                {porTipo.map((r) => (
                  <TR key={r.nombre}><TD>{r.nombre}</TD><TD className="text-right tabular-nums">{soles(r.ventas)}</TD><TD className="text-right">{r.n}</TD><TD className="text-right tabular-nums">{r.n ? pct(r.margen) : "—"}</TD></TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Equipos más cotizados</CardTitle><CardDescription>Unidades en cotizaciones</CardDescription></CardHeader>
          <CardContent>{masCotizados.length ? <BarrasChart data={masCotizados} x="nombre" y="unidades" nombre="Unidades" horizontal alto={240} /> : <Empty>Sin cotizaciones aún</Empty>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mensajes WhatsApp enviados</CardTitle><CardDescription>Últimos 14 días</CardDescription></CardHeader>
          <CardContent><LineaChart data={dias} x="dia" y="mensajes" nombre="Mensajes" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pipeline CRM</CardTitle><CardDescription>Clientes por etapa</CardDescription></CardHeader>
          <CardContent><BarrasChart data={pipeline} x="nombre" y="clientes" nombre="Clientes" horizontal alto={240} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Mantenimientos pendientes</CardTitle><CardDescription>Próximos 30 días</CardDescription></div>
            <Link href="/erp/automatizaciones" className="text-xs text-primary hover:underline">Ver todos</Link>
          </CardHeader>
          <CardContent>
            {mantPend.length === 0 ? <Empty>No hay mantenimientos próximos</Empty> : (
              <div className="space-y-2">
                {mantPend.slice(0, 6).map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{m.equipo.nombre}</div>
                      <div className="text-xs text-muted-foreground">{m.cliente.razonSocial}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs tabular-nums">{fecha(m.fechaProgramada)}</div>
                      {m.fechaProgramada < new Date() ? <Badge variant="danger"><AlertTriangle className="h-3 w-3" />Vencido</Badge> : m.estado === "NOTIFICADO" ? <Badge variant="success"><CheckCheck className="h-3 w-3" />Notificado</Badge> : <Badge variant="warning">Pendiente</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Tareas y alertas</CardTitle><CardDescription>Seguimiento, post-venta y mantenimiento</CardDescription></div>
            <Link href="/erp/automatizaciones" className="text-xs text-primary hover:underline">Gestionar</Link>
          </CardHeader>
          <CardContent>
            {tareas.length === 0 ? <Empty>Sin tareas pendientes 🎉</Empty> : (
              <div className="space-y-2">
                {tareas.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border bg-background/40 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{t.titulo}</div>
                      <div className="text-xs text-muted-foreground">{t.descripcion}</div>
                    </div>
                    <Badge variant={t.tipo === "SEGUIMIENTO" ? "warning" : t.tipo === "MANTENIMIENTO" ? "default" : "success"}>{t.tipo}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
