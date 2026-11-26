import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pencil, Send, Mail, Phone, MapPin, User } from "lucide-react";
import { prisma } from "@/lib/erp-comercial/prisma";
import { EtapaBadge, PageHeader, RegionBadge, TipoBadge, Empty } from "@/components/erp-comercial/shared";
import { Button } from "@/components/erp-comercial/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Progress } from "@/components/erp-comercial/ui/progress";
import { ClienteForm } from "@/components/erp-comercial/clientes/cliente-form";
import { EtapaSelect, NuevaNota, ProximoContacto } from "@/components/erp-comercial/clientes/cliente-acciones";
import { COLOR_ESTADO_MSG } from "@/lib/erp-comercial/constants";
import { cn, fecha, soles } from "@/lib/erp-comercial/utils";

export const dynamic = "force-dynamic";

export default async function ClienteDetalle({ params }: { params: { id: string } }) {
  const c = await prisma.cliente.findUnique({
    where: { id: params.id },
    include: {
      vendedor: true,
      notas: { orderBy: { createdAt: "desc" } },
      cotizaciones: { include: { items: { include: { equipo: true } } }, orderBy: { createdAt: "desc" } },
      ventas: { include: { items: { include: { equipo: true } } }, orderBy: { fecha: "desc" } },
      mantenimientos: { include: { equipo: true }, orderBy: { fechaProgramada: "asc" }, where: { estado: { not: "COMPLETADO" } } },
      mensajes: { orderBy: { createdAt: "desc" }, take: 6 },
    },
  });
  if (!c) notFound();
  const vendedores = await prisma.vendedor.findMany();
  const usoCredito = c.limiteCredito ? (c.creditoUsado / c.limiteCredito) * 100 : 0;
  const totalCompras = c.ventas.reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.razonSocial}
        subtitle={`${c.tipoDocumento} ${c.documento}`}
        actions={
          <>
            <EtapaSelect clienteId={c.id} etapa={c.etapa} />
            <ClienteForm cliente={c} vendedores={vendedores} trigger={<Button variant="secondary"><Pencil />Editar</Button>} />
            <Button asChild variant="outline"><Link href={`/erp/whatsapp/ofertas?cliente=${c.id}`}><Send />Enviar oferta</Link></Button>
            <Button asChild variant="whatsapp"><Link href={`/erp/whatsapp?c=${c.id}`}><MessageCircle />Abrir chat</Link></Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Datos del cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2"><EtapaBadge etapa={c.etapa} /><TipoBadge tipo={c.tipoCliente} /><RegionBadge region={c.region} />{!c.optIn && <Badge variant="danger">Sin opt-in WA</Badge>}</div>
            <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{c.contacto}</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />+{c.telefono}</div>
            {c.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{c.email}</div>}
            {c.direccion && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{c.direccion}</div>}
            <div className="text-muted-foreground">Vendedor: <span className="text-foreground">{c.vendedor?.nombre ?? "Sin asignar"}</span></div>
            <div className="text-muted-foreground">Último contacto: <span className="text-foreground">{fecha(c.ultimoContacto, true)}</span></div>
            <div className="space-y-1.5 pt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Próximo contacto</div>
              <ProximoContacto clienteId={c.id} valor={c.proximoContacto ? c.proximoContacto.toISOString().slice(0, 10) : ""} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Crédito y compras</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="mb-1.5 flex justify-between"><span className="text-muted-foreground">Línea usada</span><span className="tabular-nums">{soles(c.creditoUsado)} / {soles(c.limiteCredito)}</span></div>
              <Progress value={usoCredito} barClassName={usoCredito > 80 ? "bg-rose-500" : usoCredito > 50 ? "bg-amber-500" : "bg-emerald-500"} />
              <div className="mt-1 text-xs text-muted-foreground">{c.diasCredito} días de crédito · disponible {soles(c.limiteCredito - c.creditoUsado)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Total compras</div><div className="text-lg font-semibold">{soles(totalCompras)}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Cotizaciones</div><div className="text-lg font-semibold">{c.cotizaciones.length}</div></div>
            </div>
            <div>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Mantenimientos próximos</div>
              {c.mantenimientos.slice(0, 4).map((m) => (
                <div key={m.id} className="flex justify-between border-b py-1.5 text-xs last:border-0"><span>{m.equipo.nombre}</span><span className={m.fechaProgramada < new Date() ? "text-rose-300" : "text-muted-foreground"}>{fecha(m.fechaProgramada)}</span></div>
              ))}
              {!c.mantenimientos.length && <div className="text-xs text-muted-foreground">Ninguno</div>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <NuevaNota clienteId={c.id} />
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {c.notas.map((n) => (
                <div key={n.id} className="rounded-lg border bg-background/40 p-2.5 text-sm">
                  <div>{n.texto}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{fecha(n.createdAt, true)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Historial de compras</CardTitle></CardHeader>
          <CardContent>
            {c.ventas.length ? (
              <Table>
                <THead><TR><TH>Fecha</TH><TH>Equipos</TH><TH className="text-right">Total</TH><TH className="text-right">Margen</TH></TR></THead>
                <TBody>
                  {c.ventas.map((v) => (
                    <TR key={v.id}>
                      <TD className="text-xs">{fecha(v.fecha)}</TD>
                      <TD className="text-xs">{v.items.map((i) => `${i.cantidad}× ${i.equipo.codigo}`).join(", ")}</TD>
                      <TD className="text-right tabular-nums">{soles(v.total)}</TD>
                      <TD className="text-right tabular-nums">{(((v.total - v.costo) / v.total) * 100).toFixed(1)}%</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <Empty>Aún no hay compras</Empty>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Cotizaciones</CardTitle>
            <Button asChild size="sm" variant="outline"><Link href={`/erp/cotizaciones?cliente=${c.id}`}>Nueva cotización</Link></Button>
          </CardHeader>
          <CardContent>
            {c.cotizaciones.length ? (
              <Table>
                <THead><TR><TH>N°</TH><TH>Fecha</TH><TH>Equipos</TH><TH className="text-right">Total</TH><TH>Estado</TH></TR></THead>
                <TBody>
                  {c.cotizaciones.map((q) => (
                    <TR key={q.id}>
                      <TD className="font-mono text-xs">#{q.numero}</TD>
                      <TD className="text-xs">{fecha(q.createdAt)}</TD>
                      <TD className="text-xs">{q.items.map((i) => `${i.cantidad}× ${i.equipo.codigo}`).join(", ")}</TD>
                      <TD className="text-right tabular-nums">{soles(q.total)}</TD>
                      <TD><Badge variant={q.estado === "ACEPTADA" ? "success" : q.estado === "RECHAZADA" ? "danger" : q.estado === "ENVIADA" ? "default" : "secondary"}>{q.estado}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <Empty>Sin cotizaciones</Empty>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Últimos mensajes WhatsApp</CardTitle>
          <Button asChild size="sm" variant="ghost"><Link href={`/erp/whatsapp?c=${c.id}`}>Ver conversación</Link></Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {c.mensajes.map((m) => (
            <div key={m.id} className={cn("flex", m.direccion === "OUT" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm", m.direccion === "OUT" ? "bg-wa-bubble" : "bg-wa-in")}>
                <div className="whitespace-pre-wrap">{m.contenido || `[${m.tipo}]`}</div>
                <div className={cn("mt-0.5 text-right text-[10px]", COLOR_ESTADO_MSG[m.estado])}>{fecha(m.createdAt, true)} · {m.estado}</div>
              </div>
            </div>
          ))}
          {!c.mensajes.length && <Empty>Sin mensajes</Empty>}
        </CardContent>
      </Card>
    </div>
  );
}
