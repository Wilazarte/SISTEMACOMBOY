"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Plus, Save, Send, FileText, Loader2 } from "lucide-react";
import type { Cliente, Equipo, ReglaPrecio } from "@prisma/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/erp-comercial/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Field, Input, Select } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { ConfirmDelete } from "@/components/erp-comercial/equipos/equipos-table";
import { calcularPrecio } from "@/lib/erp-comercial/pricing";
import { LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, soles } from "@/lib/erp-comercial/utils";

type EquipoL = Pick<Equipo, "id" | "codigo" | "nombre" | "precioLista" | "costoBase">;
type ClienteL = Pick<Cliente, "id" | "razonSocial" | "tipoCliente" | "region">;

export function PreciosClient({ equipos, clientes, reglas }: { equipos: EquipoL[]; clientes: ClienteL[]; reglas: ReglaPrecio[] }) {
  return (
    <Tabs defaultValue="calc">
      <TabsList>
        <TabsTrigger value="calc"><Calculator className="h-4 w-4" />Calculadora</TabsTrigger>
        <TabsTrigger value="TIPO_CLIENTE">Por tipo de cliente</TabsTrigger>
        <TabsTrigger value="REGION">Por región</TabsTrigger>
        <TabsTrigger value="VOLUMEN">Por volumen</TabsTrigger>
      </TabsList>
      <TabsContent value="calc"><Calculadora equipos={equipos} clientes={clientes} reglas={reglas} /></TabsContent>
      {(["TIPO_CLIENTE", "REGION", "VOLUMEN"] as const).map((t) => (
        <TabsContent key={t} value={t}><TablaReglas tipo={t} reglas={reglas.filter((r) => r.tipo === t)} equipos={equipos} /></TabsContent>
      ))}
    </Tabs>
  );
}

function Calculadora({ equipos, clientes, reglas }: { equipos: EquipoL[]; clientes: ClienteL[]; reglas: ReglaPrecio[] }) {
  const router = useRouter();
  const [equipoId, setEquipoId] = useState(equipos[0]?.id ?? "");
  const [clienteId, setClienteId] = useState("");
  const [tipo, setTipo] = useState<string>("RETAIL");
  const [region, setRegion] = useState<string>("LIMA");
  const [cantidad, setCantidad] = useState(1);
  const [busy, setBusy] = useState(false);
  const cliente = clientes.find((c) => c.id === clienteId);
  const t = cliente?.tipoCliente ?? tipo;
  const r = cliente?.region ?? region;
  const equipo = equipos.find((e) => e.id === equipoId);
  const res = useMemo(() => (equipo ? calcularPrecio(equipo, reglas, { tipoCliente: t, region: r, cantidad }) : null), [equipo, reglas, t, r, cantidad]);

  async function cotizar() {
    if (!cliente) return toast.error("Selecciona un cliente");
    setBusy(true);
    try {
      await api("/erp/api/cotizaciones", "POST", { clienteId, items: [{ equipoId, cantidad }] });
      toast.success("Cotización creada");
      router.push("/erp/cotizaciones");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const linea = (label: string, pctv: number, desc?: string | null) => (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}{desc && <span className="ml-1 text-xs">({desc})</span>}</span>
      <span className={cn("tabular-nums font-medium", pctv < 0 ? "text-emerald-300" : pctv > 0 ? "text-amber-300" : "")}>{pctv > 0 ? "+" : ""}{pctv}%</span>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Parámetros</CardTitle><CardDescription>Equipo + cliente + región + cantidad</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Equipo">
            <Select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
              {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Cliente (opcional: toma su tipo y región)">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">— Simular sin cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de cliente">
              <Select value={t} disabled={!!cliente} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_CLIENTE.map((x) => <option key={x} value={x}>{LABEL_TIPO[x]}</option>)}
              </Select>
            </Field>
            <Field label="Región">
              <Select value={r} disabled={!!cliente} onChange={(e) => setRegion(e.target.value)}>
                {REGIONES.map((x) => <option key={x} value={x}>{LABEL_REGION[x]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Cantidad"><Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} /></Field>
        </CardContent>
      </Card>
      {res && equipo && (
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Resultado</CardTitle><CardDescription>{equipo.nombre}</CardDescription></CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border bg-background/40 px-4">
              <div className="flex items-center justify-between py-2 text-sm"><span className="text-muted-foreground">Precio lista</span><span className="tabular-nums">{soles(res.precioLista)}</span></div>
              {linea(`Tipo: ${LABEL_TIPO[t]}`, res.ajusteTipo, res.reglaTipo?.equipoId ? "regla específica" : res.reglaTipo?.descripcion)}
              {linea(`Región: ${LABEL_REGION[r]}`, res.ajusteRegion, res.reglaRegion?.descripcion)}
              {linea(`Volumen: ${cantidad} und.`, res.ajusteVolumen, res.reglaVolumen?.descripcion)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-primary/10 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Precio unitario final</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{soles(res.precioUnitario)}</div>
                <div className="text-xs text-muted-foreground">{res.descuentoTotal.toFixed(1)}% vs lista</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total ({res.cantidad} und.)</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{soles(res.subtotal)}</div>
                <div className="text-xs text-muted-foreground">Costo {soles(res.costoTotal)}</div>
              </div>
              <div className={cn("rounded-lg border p-4", res.margen < 20 ? "bg-rose-500/10" : "bg-emerald-500/10")}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Margen automático</div>
                <div className={cn("mt-1 text-2xl font-bold tabular-nums", res.margen < 20 ? "text-rose-300" : "text-emerald-300")}>{res.margen.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">Utilidad {soles(res.utilidad)} · markup {res.markup.toFixed(0)}%</div>
              </div>
            </div>
            {res.margen < 20 && <p className="mt-3 text-sm text-rose-300">⚠ Margen por debajo del 20%: revisa las reglas de descuento.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={cotizar} disabled={!cliente || busy}>{busy ? <Loader2 className="animate-spin" /> : <FileText />}Crear cotización</Button>
              <Button asChild variant="whatsapp" disabled={!cliente}>
                <Link href={`/erp/whatsapp/ofertas?equipo=${equipoId}${clienteId ? `&cliente=${clienteId}` : ""}&cantidad=${cantidad}`}><Send />Enviar por WhatsApp</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Draft = { id?: string; equipoId: string; tipoCliente: string; region: string; minCantidad: string; maxCantidad: string; porcentaje: string; descripcion: string };

function TablaReglas({ tipo, reglas, equipos }: { tipo: "TIPO_CLIENTE" | "REGION" | "VOLUMEN"; reglas: ReglaPrecio[]; equipos: EquipoL[] }) {
  const router = useRouter();
  const vacio: Draft = { equipoId: "", tipoCliente: "RETAIL", region: "LIMA", minCantidad: "1", maxCantidad: "", porcentaje: "0", descripcion: "" };
  const [draft, setDraft] = useState<Draft | null>(null);
  const ordenadas = [...reglas].sort((a, b) => (a.equipoId ? 1 : 0) - (b.equipoId ? 1 : 0) || (a.minCantidad ?? 0) - (b.minCantidad ?? 0));

  async function guardar() {
    if (!draft) return;
    try {
      const body = { ...draft, tipo };
      if (draft.id) await api(`/erp/api/precios/reglas/${draft.id}`, "PUT", body);
      else await api("/erp/api/precios/reglas", "POST", body);
      toast.success("Regla guardada");
      setDraft(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function eliminar(id: string) {
    await api(`/erp/api/precios/reglas/${id}`, "DELETE");
    toast.success("Regla eliminada");
    router.refresh();
  }

  const titulo = { TIPO_CLIENTE: "Descuentos por tipo de cliente", REGION: "Ajustes por región (flete / mercado)", VOLUMEN: "Descuentos por volumen" }[tipo];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{titulo}</CardTitle>
          <CardDescription>% negativo = descuento, positivo = recargo. Las reglas por equipo reemplazan a la general.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setDraft(vacio)}><Plus />Nueva regla</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              <TH>Alcance</TH>
              {tipo === "TIPO_CLIENTE" && <TH>Tipo cliente</TH>}
              {tipo === "REGION" && <TH>Región</TH>}
              {tipo === "VOLUMEN" && <TH>Rango cantidad</TH>}
              <TH className="text-right">%</TH><TH>Descripción</TH><TH />
            </TR>
          </THead>
          <TBody>
            {draft && (
              <TR className="bg-primary/5">
                <TD>
                  <Select value={draft.equipoId} onChange={(e) => setDraft({ ...draft, equipoId: e.target.value })}>
                    <option value="">Todos los equipos</option>
                    {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo}</option>)}
                  </Select>
                </TD>
                {tipo === "TIPO_CLIENTE" && <TD><Select value={draft.tipoCliente} onChange={(e) => setDraft({ ...draft, tipoCliente: e.target.value })}>{TIPOS_CLIENTE.map((x) => <option key={x} value={x}>{LABEL_TIPO[x]}</option>)}</Select></TD>}
                {tipo === "REGION" && <TD><Select value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })}>{REGIONES.map((x) => <option key={x} value={x}>{LABEL_REGION[x]}</option>)}</Select></TD>}
                {tipo === "VOLUMEN" && (
                  <TD><div className="flex items-center gap-1"><Input className="w-20" type="number" value={draft.minCantidad} onChange={(e) => setDraft({ ...draft, minCantidad: e.target.value })} />a<Input className="w-20" type="number" placeholder="∞" value={draft.maxCantidad} onChange={(e) => setDraft({ ...draft, maxCantidad: e.target.value })} /></div></TD>
                )}
                <TD><Input className="ml-auto w-24 text-right" type="number" step="0.5" value={draft.porcentaje} onChange={(e) => setDraft({ ...draft, porcentaje: e.target.value })} /></TD>
                <TD><Input value={draft.descripcion} onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })} /></TD>
                <TD><div className="flex gap-1"><Button size="sm" onClick={guardar}><Save />Guardar</Button><Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button></div></TD>
              </TR>
            )}
            {ordenadas.map((r) => (
              <TR key={r.id}>
                <TD>{r.equipoId ? <Badge variant="warning">{equipos.find((e) => e.id === r.equipoId)?.codigo ?? "Equipo"}</Badge> : <Badge variant="secondary">General</Badge>}</TD>
                {tipo === "TIPO_CLIENTE" && <TD>{LABEL_TIPO[r.tipoCliente ?? ""]}</TD>}
                {tipo === "REGION" && <TD>{LABEL_REGION[r.region ?? ""]}</TD>}
                {tipo === "VOLUMEN" && <TD className="tabular-nums">{r.minCantidad} {r.maxCantidad ? `a ${r.maxCantidad}` : "o más"} und.</TD>}
                <TD className={cn("text-right font-semibold tabular-nums", r.porcentaje < 0 ? "text-emerald-300" : r.porcentaje > 0 ? "text-amber-300" : "")}>{r.porcentaje > 0 ? "+" : ""}{r.porcentaje}%</TD>
                <TD className="text-muted-foreground">{r.descripcion}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ id: r.id, equipoId: r.equipoId ?? "", tipoCliente: r.tipoCliente ?? "RETAIL", region: r.region ?? "LIMA", minCantidad: String(r.minCantidad ?? 1), maxCantidad: r.maxCantidad ? String(r.maxCantidad) : "", porcentaje: String(r.porcentaje), descripcion: r.descripcion ?? "" })}>Editar</Button>
                    <ConfirmDelete onConfirm={() => eliminar(r.id)} />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
