"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Trophy, XCircle, Send, Search } from "lucide-react";
import type { Cliente, Equipo, ReglaPrecio } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Field, Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/erp-comercial/ui/dialog";
import { ConfirmDelete } from "@/components/erp-comercial/equipos/equipos-table";
import { calcularPrecio } from "@/lib/erp-comercial/pricing";
import { LABEL_REGION, LABEL_TIPO } from "@/lib/erp-comercial/constants";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, fecha, soles } from "@/lib/erp-comercial/utils";

type EquipoL = Pick<Equipo, "id" | "codigo" | "nombre" | "precioLista" | "costoBase" | "stock">;
type ClienteL = Pick<Cliente, "id" | "razonSocial" | "tipoCliente" | "region">;
export interface CotRow {
  id: string; numero: number; estado: string; total: number; costo: number; createdAt: string;
  cliente: { id: string; razonSocial: string };
  items: { cantidad: number; equipo: { codigo: string } }[];
}

export function NuevaCotizacion({ clientes, equipos, reglas, clienteInicial }: { clientes: ClienteL[]; equipos: EquipoL[]; reglas: ReglaPrecio[]; clienteInicial?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(clienteInicial));
  const [clienteId, setClienteId] = useState(clienteInicial ?? clientes[0]?.id ?? "");
  const [items, setItems] = useState([{ equipoId: equipos[0]?.id ?? "", cantidad: 1 }]);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const cliente = clientes.find((c) => c.id === clienteId);

  const lineas = useMemo(
    () =>
      items.map((it) => {
        const e = equipos.find((x) => x.id === it.equipoId);
        return e && cliente ? { e, r: calcularPrecio(e, reglas, { tipoCliente: cliente.tipoCliente, region: cliente.region, cantidad: it.cantidad }) } : null;
      }),
    [items, equipos, cliente, reglas],
  );
  const total = lineas.reduce((s, l) => s + (l?.r.subtotal ?? 0), 0);
  const costo = lineas.reduce((s, l) => s + (l?.r.costoTotal ?? 0), 0);
  const margen = total ? ((total - costo) / total) * 100 : 0;

  async function crear() {
    setBusy(true);
    try {
      await api("/erp/api/cotizaciones", "POST", { clienteId, items, notas });
      toast.success("Cotización creada");
      setOpen(false);
      setItems([{ equipoId: equipos[0]?.id ?? "", cantidad: 1 }]);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Nueva cotización</Button></DialogTrigger>
      <DialogContent title="Nueva cotización" description="Los precios se calculan automáticamente según tipo de cliente, región y volumen" className="max-w-3xl">
        <Field label="Cliente">
          <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial} — {LABEL_TIPO[c.tipoCliente]} / {LABEL_REGION[c.region]}</option>)}
          </Select>
        </Field>
        <div className="space-y-2">
          {items.map((it, i) => {
            const l = lineas[i];
            return (
              <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-lg border bg-background/40 p-2">
                <Select className="col-span-6" value={it.equipoId} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, equipoId: e.target.value } : x)))}>
                  {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
                </Select>
                <Input className="col-span-2" type="number" min={1} value={it.cantidad} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, cantidad: Math.max(1, Number(e.target.value)) } : x)))} />
                <div className="col-span-3 text-right text-sm">
                  <div className="font-medium tabular-nums">{soles(l?.r.subtotal)}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{soles(l?.r.precioUnitario)} c/u · {l?.r.descuentoTotal.toFixed(1)}%</div>
                </div>
                <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setItems((s) => s.filter((_, j) => j !== i))} disabled={items.length === 1}><Trash2 /></Button>
              </div>
            );
          })}
          <Button size="sm" variant="ghost" onClick={() => setItems((s) => [...s, { equipoId: equipos[0]?.id ?? "", cantidad: 1 }])}><Plus />Agregar equipo</Button>
        </div>
        <Field label="Notas / condiciones"><Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Forma de pago, plazo de entrega, garantía…" /></Field>
        <div className="flex items-center justify-between rounded-lg border bg-primary/5 px-4 py-3">
          <div className="text-sm text-muted-foreground">Margen: <span className={cn("font-semibold", margen < 20 ? "text-rose-300" : "text-emerald-300")}>{margen.toFixed(1)}%</span></div>
          <div className="text-xl font-bold tabular-nums">{soles(total)}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={crear} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Crear cotización</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CotizacionesTable({ cotizaciones }: { cotizaciones: CotRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const filtradas = cotizaciones.filter(
    (c) => (!q || `${c.numero} ${c.cliente.razonSocial}`.toLowerCase().includes(q.toLowerCase())) && (!estado || c.estado === estado),
  );

  async function accion(id: string, a: "ganar" | "rechazar" | "enviar") {
    setBusy(id + a);
    try {
      await api(`/erp/api/cotizaciones/${id}`, "PATCH", { accion: a });
      toast.success(a === "ganar" ? "¡Venta registrada! Mantenimientos programados" : a === "enviar" ? "Cotización enviada por WhatsApp" : "Cotización rechazada");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function eliminar(id: string) {
    await api(`/erp/api/cotizaciones/${id}`, "DELETE");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div><CardTitle>Cotizaciones</CardTitle><CardDescription>{filtradas.length} registros</CardDescription></div>
        <div className="flex gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="w-56 pl-8" placeholder="N° o cliente" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-36" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option><option>BORRADOR</option><option>ENVIADA</option><option>ACEPTADA</option><option>RECHAZADA</option>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <THead><TR><TH>N°</TH><TH>Fecha</TH><TH>Cliente</TH><TH>Equipos</TH><TH className="text-right">Total</TH><TH className="text-right">Margen</TH><TH>Estado</TH><TH /></TR></THead>
          <TBody>
            {filtradas.map((c) => {
              const abierta = c.estado === "BORRADOR" || c.estado === "ENVIADA";
              const m = c.total ? ((c.total - c.costo) / c.total) * 100 : 0;
              return (
                <TR key={c.id}>
                  <TD className="font-mono text-xs">#{c.numero}</TD>
                  <TD className="text-xs">{fecha(c.createdAt)}</TD>
                  <TD><Link href={`/erp/clientes/${c.cliente.id}`} className="hover:text-primary">{c.cliente.razonSocial}</Link></TD>
                  <TD className="text-xs text-muted-foreground">{c.items.map((i) => `${i.cantidad}× ${i.equipo.codigo}`).join(", ")}</TD>
                  <TD className="text-right font-medium tabular-nums">{soles(c.total)}</TD>
                  <TD className={cn("text-right tabular-nums", m < 20 && "text-rose-300")}>{m.toFixed(1)}%</TD>
                  <TD><Badge variant={c.estado === "ACEPTADA" ? "success" : c.estado === "RECHAZADA" ? "danger" : c.estado === "ENVIADA" ? "default" : "secondary"}>{c.estado}</Badge></TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {abierta && (
                        <>
                          <Button size="sm" variant="ghost" title="Enviar por WhatsApp con fichas PDF" disabled={!!busy} onClick={() => accion(c.id, "enviar")}>{busy === c.id + "enviar" ? <Loader2 className="animate-spin" /> : <Send className="text-wa" />}</Button>
                          <Button size="sm" variant="ghost" title="Marcar ganada (genera venta)" disabled={!!busy} onClick={() => accion(c.id, "ganar")}>{busy === c.id + "ganar" ? <Loader2 className="animate-spin" /> : <Trophy className="text-emerald-400" />}</Button>
                          <Button size="sm" variant="ghost" title="Rechazada" disabled={!!busy} onClick={() => accion(c.id, "rechazar")}><XCircle className="text-rose-400" /></Button>
                        </>
                      )}
                      {c.estado !== "ACEPTADA" && <ConfirmDelete onConfirm={() => eliminar(c.id)} />}
                    </div>
                  </TD>
                </TR>
              );
            })}
            {!filtradas.length && <TR><TD colSpan={8} className="py-8 text-center text-muted-foreground">Sin cotizaciones</TD></TR>}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
