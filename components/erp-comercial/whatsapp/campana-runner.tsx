"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Progress } from "@/components/erp-comercial/ui/progress";
import { Ticks } from "./inbox";
import { api } from "@/lib/erp-comercial/api-client";
import { LABEL_REGION, LABEL_TIPO } from "@/lib/erp-comercial/constants";

interface Envio {
  id: string; estado: string; error: string | null; enviadoAt: string | null;
  cliente: { razonSocial: string; contacto: string; telefono: string; region: string; tipoCliente: string };
}
interface Data {
  id: string; nombre: string; mensaje: string; estado: string; createdAt: string;
  equipo: { nombre: string } | null; envios: Envio[]; stats: Record<string, number>;
}

export function CampanaRunner({ id }: { id: string }) {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const stop = useRef(false);

  const cargar = useCallback(async () => setD(await api<Data>(`/erp/api/campanas/${id}`)), [id]);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 5000); // refresca entregados/leidos que llegan por webhook
    return () => clearInterval(t);
  }, [cargar]);

  async function iniciar(reintentar = false) {
    if (!d) return;
    stop.current = false;
    setCorriendo(true);
    const pendientes = d.envios.filter((e) => e.estado === "PENDIENTE" || (reintentar && e.estado === "FALLIDO"));
    for (const e of pendientes) {
      if (stop.current) break;
      try {
        const r = await api<{ estado: string; error: string | null }>(`/erp/api/campanas/${id}/enviar`, "POST", { envioId: e.id });
        setD((prev) => prev && {
          ...prev,
          envios: prev.envios.map((x) => (x.id === e.id ? { ...x, estado: r.estado, error: r.error } : x)),
        });
      } catch (err) {
        setD((prev) => prev && { ...prev, envios: prev.envios.map((x) => (x.id === e.id ? { ...x, estado: "FALLIDO", error: (err as Error).message } : x)) });
      }
      await new Promise((r) => setTimeout(r, 350)); // ritmo seguro para no saturar la API
    }
    setCorriendo(false);
    await cargar();
    if (!stop.current) toast.success("Campaña enviada");
  }

  if (!d) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>;

  const total = d.envios.length;
  const c = (estados: string[]) => d.envios.filter((e) => estados.includes(e.estado)).length;
  const procesados = total - c(["PENDIENTE"]);
  const entregados = c(["ENTREGADO", "LEIDO"]);
  const leidos = c(["LEIDO"]);
  const fallidos = c(["FALLIDO"]);
  const enviados = c(["ENVIADO", "ENTREGADO", "LEIDO", "SIMULADO"]);

  const stat = (label: string, v: number, cls = "") => (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{v}</div>
      <div className="text-xs text-muted-foreground">{total ? ((v / total) * 100).toFixed(0) : 0}%</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{d.nombre}</CardTitle>
            <CardDescription>{d.equipo ? `Equipo: ${d.equipo.nombre} · ` : ""}{total} destinatarios</CardDescription>
          </div>
          <div className="flex gap-2">
            {corriendo ? (
              <Button variant="outline" onClick={() => { stop.current = true; }}><Pause />Pausar</Button>
            ) : c(["PENDIENTE"]) > 0 ? (
              <Button variant="whatsapp" onClick={() => iniciar()}><Play />{procesados ? "Continuar envío" : "Iniciar envío masivo"}</Button>
            ) : fallidos > 0 ? (
              <Button variant="outline" onClick={() => iniciar(true)}><RotateCcw />Reintentar fallidos</Button>
            ) : null}
            {!corriendo && (
              <Button variant="ghost" onClick={async () => { await api(`/erp/api/campanas/${id}`, "DELETE"); router.push("/erp/whatsapp/campanas"); router.refresh(); }}><Trash2 className="text-rose-400" /></Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1.5 flex justify-between text-sm"><span>{corriendo ? "Enviando…" : "Progreso"}</span><span className="tabular-nums">{procesados}/{total}</span></div>
            <Progress value={total ? (procesados / total) * 100 : 0} className="h-3" barClassName="bg-wa" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {stat("Enviados", enviados, "text-foreground")}
            {stat("Entregados", entregados, "text-slate-200")}
            {stat("Leídos", leidos, "text-sky-300")}
            {stat("Fallidos", fallidos, "text-rose-300")}
            {stat("Pendientes", c(["PENDIENTE"]), "text-muted-foreground")}
          </div>
          <div className="whitespace-pre-wrap rounded-lg bg-wa-bubble/60 p-3 text-sm">{d.mensaje}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Reporte por destinatario</CardTitle><CardDescription>Entregado/leído se actualiza vía webhook de Meta</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Cliente</TH><TH>Teléfono</TH><TH>Región</TH><TH>Tipo</TH><TH>Estado</TH><TH>Detalle</TH></TR></THead>
            <TBody>
              {d.envios.map((e) => (
                <TR key={e.id}>
                  <TD><div className="font-medium">{e.cliente.razonSocial}</div><div className="text-xs text-muted-foreground">{e.cliente.contacto}</div></TD>
                  <TD className="text-xs tabular-nums">+{e.cliente.telefono}</TD>
                  <TD className="text-xs">{LABEL_REGION[e.cliente.region]}</TD>
                  <TD className="text-xs">{LABEL_TIPO[e.cliente.tipoCliente]}</TD>
                  <TD>
                    <span className="flex items-center gap-1.5">
                      <Ticks estado={e.estado} />
                      <Badge variant={e.estado === "FALLIDO" ? "danger" : e.estado === "LEIDO" ? "default" : e.estado === "PENDIENTE" ? "secondary" : e.estado === "SIMULADO" ? "warning" : "success"}>{e.estado}</Badge>
                    </span>
                  </TD>
                  <TD className="max-w-xs truncate text-xs text-rose-300" title={e.error ?? ""}>{e.error}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
