"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Loader2, Wrench, UserRoundSearch, Star, Send, Check, Save, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Field, Input } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/erp-comercial/ui/tabs";
import { EtapaBadge, Empty } from "@/components/erp-comercial/shared";
import { api } from "@/lib/erp-comercial/api-client";
import { cn } from "@/lib/erp-comercial/utils";

export interface MantRow { id: string; fecha: string; vencido: boolean; estado: string; cliente: string; clienteId: string; equipo: string }
export interface SegRow { id: string; razonSocial: string; contacto: string; etapa: string; dias: number | null }
export interface PostRow { id: string; razonSocial: string; fechaGanado: string; enviaEn: number; encuestaEnviada: boolean }
export interface TareaRow { id: string; tipo: string; titulo: string; descripcion: string | null; vence: string; clienteId: string | null }
export interface LogRow { id: string; tipo: string; detalle: string; fecha: string }

export function AutoClient({
  config, mantenimientos, seguimientos, postventa, tareas, logs, plantillaSeguimientoId,
}: {
  config: Record<string, string>; mantenimientos: MantRow[]; seguimientos: SegRow[]; postventa: PostRow[]; tareas: TareaRow[]; logs: LogRow[]; plantillaSeguimientoId?: string;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState(config);
  const [busy, setBusy] = useState<string | null>(null);
  const [wa, setWa] = useState<{ conectado: boolean; modo: string; numero?: string; nombre?: string; error?: string } | null>(null);

  useEffect(() => {
    api<typeof wa>("/erp/api/whatsapp/status").then(setWa).catch(() => setWa({ conectado: false, modo: "ERROR" }));
  }, []);

  async function run(tipo?: string) {
    setBusy(tipo ?? "ALL");
    try {
      const r = await api<Record<string, unknown>>("/erp/api/automatizaciones", "POST", { tipo });
      toast.success("Automatización ejecutada", { description: JSON.stringify(r).slice(0, 160) });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function guardarCfg() {
    await api("/erp/api/automatizaciones", "PUT", cfg);
    toast.success("Configuración guardada");
    router.refresh();
  }
  async function accion(fn: () => Promise<unknown>, key: string, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (k: string, label: string) => (
    <label className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 px-3 py-2 text-sm">
      {label}
      <input type="checkbox" className="h-4 w-4 accent-[#25D366]" checked={cfg[k] === "true"} onChange={(e) => setCfg({ ...cfg, [k]: String(e.target.checked) })} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">{wa?.conectado ? <Wifi className="h-4 w-4 text-wa" /> : <WifiOff className="h-4 w-4 text-amber-300" />}Conexión WhatsApp Cloud API</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!wa ? <Loader2 className="h-4 w-4 animate-spin" /> : wa.conectado ? (
              <>
                <Badge variant="success">Conectado</Badge>
                <div>{wa.nombre} · {wa.numero}</div>
              </>
            ) : (
              <>
                <Badge variant="warning">{wa.modo === "SIMULACION" ? "Modo simulación" : "Error"}</Badge>
                <p className="text-muted-foreground">
                  {wa.error ?? "Configura WHATSAPP_TOKEN y PHONE_NUMBER_ID en el archivo .env y reinicia el servidor. Mientras tanto los mensajes se registran como SIMULADO."}
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground">Webhook: <code className="rounded bg-muted px-1">/api/whatsapp/webhook</code></p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Reglas de automatización</CardTitle><CardDescription>El motor corre solo cada AUTOMATION_INTERVAL_MINUTES (.env) o manualmente</CardDescription></div>
            <Button variant="whatsapp" onClick={() => run()} disabled={!!busy}>{busy === "ALL" ? <Loader2 className="animate-spin" /> : <Play />}Ejecutar todo ahora</Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="Avisar mantenimiento (días antes)"><Input type="number" value={cfg.diasAvisoMantenimiento} onChange={(e) => setCfg({ ...cfg, diasAvisoMantenimiento: e.target.value })} /></Field>
            <Field label="Alerta prospecto sin contacto (días)"><Input type="number" value={cfg.diasSinContactoProspecto} onChange={(e) => setCfg({ ...cfg, diasSinContactoProspecto: e.target.value })} /></Field>
            <Field label="Encuesta post-venta (días tras Ganado)"><Input type="number" value={cfg.diasPostVenta} onChange={(e) => setCfg({ ...cfg, diasPostVenta: e.target.value })} /></Field>
            {toggle("autoEnviarMantenimiento", "WhatsApp automático de mantenimiento")}
            {toggle("autoEnviarSeguimiento", "WhatsApp automático de seguimiento")}
            {toggle("autoEnviarPostVenta", "Encuesta post-venta automática")}
            <div className="sm:col-span-3"><Button size="sm" variant="outline" onClick={guardarCfg}><Save />Guardar configuración</Button></div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="mant">
        <TabsList>
          <TabsTrigger value="mant"><Wrench className="h-4 w-4" />Mantenimiento ({mantenimientos.length})</TabsTrigger>
          <TabsTrigger value="seg"><UserRoundSearch className="h-4 w-4" />Seguimiento ({seguimientos.length})</TabsTrigger>
          <TabsTrigger value="post"><Star className="h-4 w-4" />Post-venta ({postventa.length})</TabsTrigger>
          <TabsTrigger value="tareas">Tareas ({tareas.length})</TabsTrigger>
          <TabsTrigger value="log">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="mant">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle>a) Recordatorios de mantenimiento</CardTitle><CardDescription>Cada equipo vendido genera mantenimientos según su intervalo. Mensaje: “Hola {"{nombre}"}, tu {"{equipo}"} necesita mantenimiento”</CardDescription></div>
              <Button size="sm" variant="outline" onClick={() => run("MANTENIMIENTO")} disabled={!!busy}>{busy === "MANTENIMIENTO" ? <Loader2 className="animate-spin" /> : <Play />}Procesar</Button>
            </CardHeader>
            <CardContent>
              {mantenimientos.length ? (
                <Table>
                  <THead><TR><TH>Fecha</TH><TH>Cliente</TH><TH>Equipo</TH><TH>Estado</TH><TH /></TR></THead>
                  <TBody>
                    {mantenimientos.map((m) => (
                      <TR key={m.id}>
                        <TD className={cn("tabular-nums", m.vencido && "text-rose-300")}>{m.fecha}{m.vencido && " · vencido"}</TD>
                        <TD><Link className="hover:text-primary" href={`/erp/clientes/${m.clienteId}`}>{m.cliente}</Link></TD>
                        <TD>{m.equipo}</TD>
                        <TD><Badge variant={m.estado === "NOTIFICADO" ? "success" : "warning"}>{m.estado}</Badge></TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => accion(() => api(`/erp/api/mantenimientos/${m.id}`, "PATCH", { accion: "notificar" }), m.id + "n", "Recordatorio enviado")}>
                              {busy === m.id + "n" ? <Loader2 className="animate-spin" /> : <Send className="text-wa" />}WhatsApp
                            </Button>
                            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => accion(() => api(`/erp/api/mantenimientos/${m.id}`, "PATCH", { accion: "completar" }), m.id + "c", "Mantenimiento completado")}><Check />Completar</Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <Empty>No hay mantenimientos pendientes</Empty>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seg">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle>b) Alertas de seguimiento</CardTitle><CardDescription>Clientes en Prospecto/Cotizado/Negociado con {cfg.diasSinContactoProspecto}+ días sin contacto</CardDescription></div>
              <Button size="sm" variant="outline" onClick={() => run("SEGUIMIENTO")} disabled={!!busy}>{busy === "SEGUIMIENTO" ? <Loader2 className="animate-spin" /> : <Play />}Generar alertas</Button>
            </CardHeader>
            <CardContent>
              {seguimientos.length ? (
                <Table>
                  <THead><TR><TH>Cliente</TH><TH>Etapa</TH><TH>Sin contacto</TH><TH /></TR></THead>
                  <TBody>
                    {seguimientos.map((s) => (
                      <TR key={s.id}>
                        <TD><Link className="font-medium hover:text-primary" href={`/erp/clientes/${s.id}`}>{s.razonSocial}</Link><div className="text-xs text-muted-foreground">{s.contacto}</div></TD>
                        <TD><EtapaBadge etapa={s.etapa} /></TD>
                        <TD className="text-amber-300">{s.dias === null ? "Nunca" : `${s.dias} días`}</TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="whatsapp" disabled={!!busy || !plantillaSeguimientoId}
                              onClick={() => accion(() => api("/erp/api/whatsapp/send", "POST", { clienteId: s.id, plantillaId: plantillaSeguimientoId }), s.id, "Seguimiento enviado")}>
                              {busy === s.id ? <Loader2 className="animate-spin" /> : <Send />}Enviar WhatsApp
                            </Button>
                            <Button asChild size="sm" variant="ghost"><Link href={`/erp/whatsapp?c=${s.id}`}>Chat</Link></Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <Empty>Todos los prospectos están al día 👌</Empty>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="post">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle>c) Encuesta post-venta</CardTitle><CardDescription>{cfg.diasPostVenta} días después de pasar a Ganado se envía la encuesta de satisfacción</CardDescription></div>
              <Button size="sm" variant="outline" onClick={() => run("POSTVENTA")} disabled={!!busy}>{busy === "POSTVENTA" ? <Loader2 className="animate-spin" /> : <Play />}Procesar</Button>
            </CardHeader>
            <CardContent>
              {postventa.length ? (
                <Table>
                  <THead><TR><TH>Cliente</TH><TH>Ganado el</TH><TH>Encuesta</TH></TR></THead>
                  <TBody>
                    {postventa.map((p) => (
                      <TR key={p.id}>
                        <TD><Link className="hover:text-primary" href={`/erp/clientes/${p.id}`}>{p.razonSocial}</Link></TD>
                        <TD>{p.fechaGanado}</TD>
                        <TD>{p.enviaEn <= 0 ? <Badge variant="warning">Lista para enviar</Badge> : <Badge variant="secondary">En {p.enviaEn} día(s)</Badge>}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : <Empty>No hay encuestas pendientes</Empty>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tareas">
          <Card>
            <CardContent className="pt-5">
              {tareas.length ? (
                <div className="space-y-2">
                  {tareas.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-background/40 px-3 py-2 text-sm">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => accion(() => api(`/erp/api/tareas/${t.id}`, "PATCH", { completada: true }), t.id, "Tarea completada")}><Check /></Button>
                      <div className="flex-1"><div className="font-medium">{t.titulo}</div><div className="text-xs text-muted-foreground">{t.descripcion}</div></div>
                      <Badge variant={t.tipo === "SEGUIMIENTO" ? "warning" : t.tipo === "MANTENIMIENTO" ? "default" : "success"}>{t.tipo}</Badge>
                      <span className="text-xs text-muted-foreground">{t.vence}</span>
                      {t.clienteId && <Button asChild size="sm" variant="ghost"><Link href={`/erp/whatsapp?c=${t.clienteId}`}><Send className="text-wa" /></Link></Button>}
                    </div>
                  ))}
                </div>
              ) : <Empty>Sin tareas abiertas</Empty>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <CardContent className="pt-5">
              {logs.length ? (
                <Table>
                  <THead><TR><TH>Fecha</TH><TH>Tipo</TH><TH>Detalle</TH></TR></THead>
                  <TBody>{logs.map((l) => <TR key={l.id}><TD className="text-xs">{l.fecha}</TD><TD><Badge variant="secondary">{l.tipo}</Badge></TD><TD className="text-sm">{l.detalle}</TD></TR>)}</TBody>
                </Table>
              ) : <Empty>Aún no se ejecutaron automatizaciones</Empty>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
