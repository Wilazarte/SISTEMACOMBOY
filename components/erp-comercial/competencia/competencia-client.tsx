"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Globe, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import type { Competidor, Equipo, ProductoCompetencia } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/erp-comercial/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/erp-comercial/ui/tabs";
import { ConfirmDelete } from "@/components/erp-comercial/equipos/equipos-table";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, parseJSON, soles } from "@/lib/erp-comercial/utils";

type Comp = Competidor & { productos: (ProductoCompetencia & { equipo: Equipo })[] };

const lista = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function CompetenciaClient({ competidores, equipos, equipoInicial }: { competidores: Comp[]; equipos: Equipo[]; equipoInicial?: string }) {
  return (
    <Tabs defaultValue={equipoInicial ? "comparativa" : "competidores"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="competidores">Competidores</TabsTrigger>
          <TabsTrigger value="comparativa">Comparativa lado a lado</TabsTrigger>
        </TabsList>
        <div className="flex gap-2">
          <ProductoForm competidores={competidores} equipos={equipos} />
          <CompetidorForm trigger={<Button><Plus />Nuevo competidor</Button>} />
        </div>
      </div>
      <TabsContent value="competidores">
        <div className="grid gap-4 lg:grid-cols-3">
          {competidores.map((c) => <CompetidorCard key={c.id} c={c} />)}
        </div>
      </TabsContent>
      <TabsContent value="comparativa">
        <Comparativa competidores={competidores} equipos={equipos} inicial={equipoInicial} />
      </TabsContent>
    </Tabs>
  );
}

function CompetidorCard({ c }: { c: Comp }) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>{c.nombre}</CardTitle>
          <CardDescription className="mt-1 flex items-center gap-2">
            {c.pais && <span>{c.pais}</span>}
            {c.web && <a href={c.web} target="_blank" className="flex items-center gap-1 text-primary hover:underline"><Globe className="h-3 w-3" />web</a>}
          </CardDescription>
        </div>
        <div className="flex">
          <CompetidorForm competidor={c} trigger={<Button size="icon" variant="ghost"><Pencil /></Button>} />
          <ConfirmDelete onConfirm={async () => { await api(`/erp/api/competencia/${c.id}`, "DELETE"); router.refresh(); }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-emerald-300"><ThumbsUp className="h-3 w-3" />Fortalezas</div>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">{lista(c.fortalezas).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-rose-300"><ThumbsDown className="h-3 w-3" />Debilidades</div>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">{lista(c.debilidades).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="border-t pt-2">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Productos ({c.productos.length})</div>
          {c.productos.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1 text-xs">
              <span>{p.nombre} <span className="text-muted-foreground">≈ {p.equipo.codigo}</span></span>
              <span className="flex items-center gap-1 tabular-nums">{soles(p.precio)}
                <ConfirmDelete onConfirm={async () => { await api(`/erp/api/competencia/productos/${p.id}`, "DELETE"); router.refresh(); }} />
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Comparativa({ competidores, equipos, inicial }: { competidores: Comp[]; equipos: Equipo[]; inicial?: string }) {
  const [equipoId, setEquipoId] = useState(inicial ?? equipos[0]?.id ?? "");
  const equipo = equipos.find((e) => e.id === equipoId);
  if (!equipo) return null;
  const rivales = competidores.flatMap((c) => c.productos.filter((p) => p.equipoId === equipoId).map((p) => ({ ...p, competidor: c })));
  const nuestraFicha = parseJSON<Record<string, string>>(equipo.fichaTecnica, {});
  const fichas = rivales.map((r) => parseJSON<Record<string, string>>(r.fichaTecnica, {}));
  const claves = Array.from(new Set([...Object.keys(nuestraFicha), ...fichas.flatMap((f) => Object.keys(f))]));
  const precios = [equipo.precioLista, ...rivales.map((r) => r.precio)];
  const minPrecio = Math.min(...precios);
  const cols = rivales.length + 1;

  return (
    <div className="space-y-3">
      <Select className="max-w-md" value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
        {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
      </Select>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `180px repeat(${cols}, minmax(200px, 1fr))` }}>
          <div className="border-b p-3" />
          <div className="border-b border-l bg-primary/10 p-3">
            <Badge>COMBOY</Badge>
            <div className="mt-1 font-semibold">{equipo.nombre}</div>
            <div className="text-xs text-muted-foreground">{equipo.marca}</div>
          </div>
          {rivales.map((r) => (
            <div key={r.id} className="border-b border-l p-3">
              <Badge variant="secondary">{r.competidor.nombre}</Badge>
              <div className="mt-1 font-semibold">{r.nombre}</div>
              <div className="text-xs text-muted-foreground">{r.marca}</div>
            </div>
          ))}

          <div className="border-b p-3 text-xs font-medium uppercase text-muted-foreground">Precio</div>
          {precios.map((p, i) => (
            <div key={i} className={cn("border-b border-l p-3", i === 0 && "bg-primary/5")}>
              <div className={cn("text-lg font-bold tabular-nums", p === minPrecio && "text-emerald-300")}>{soles(p)}</div>
              {i > 0 && <div className="text-xs text-muted-foreground">Nosotros {equipo.precioLista > p ? "+" : ""}{(((equipo.precioLista - p) / p) * 100).toFixed(1)}%</div>}
              {p === minPrecio && <div className="text-xs text-emerald-300">Más barato</div>}
            </div>
          ))}

          {claves.map((k) => (
            <div key={k} className="contents">
              <div className="border-b p-3 text-xs font-medium capitalize text-muted-foreground">{k.replace(/([A-Z])/g, " $1")}</div>
              <div className="border-b border-l bg-primary/5 p-3 text-sm">{nuestraFicha[k] ?? "—"}</div>
              {fichas.map((f, i) => <div key={i} className="border-b border-l p-3 text-sm">{f[k] ?? "—"}</div>)}
            </div>
          ))}

          <div className="border-b p-3 text-xs font-medium uppercase text-emerald-300">Fortalezas</div>
          <div className="border-b border-l bg-primary/5 p-3 text-xs text-muted-foreground">Soporte técnico nacional · repuestos en stock · garantía {nuestraFicha.garantia ?? ""}</div>
          {rivales.map((r) => <div key={r.id} className="border-b border-l p-3 text-xs"><ul className="list-inside list-disc">{lista(r.fortalezas).map((x) => <li key={x}>{x}</li>)}</ul></div>)}

          <div className="p-3 text-xs font-medium uppercase text-rose-300">Debilidades</div>
          <div className="border-l bg-primary/5 p-3 text-xs text-muted-foreground">—</div>
          {rivales.map((r) => <div key={r.id} className="border-l p-3 text-xs"><ul className="list-inside list-disc">{lista(r.debilidades).map((x) => <li key={x}>{x}</li>)}</ul></div>)}
        </div>
      </div>
      {!rivales.length && <p className="text-sm text-muted-foreground">No hay productos de competencia para este equipo. Agrega uno con “Nuevo producto”.</p>}
    </div>
  );
}

function CompetidorForm({ competidor, trigger }: { competidor?: Competidor; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: competidor?.nombre ?? "", web: competidor?.web ?? "", pais: competidor?.pais ?? "", fortalezas: competidor?.fortalezas ?? "", debilidades: competidor?.debilidades ?? "", notas: competidor?.notas ?? "" });
  async function guardar() {
    try {
      if (competidor) await api(`/erp/api/competencia/${competidor.id}`, "PUT", f);
      else await api("/erp/api/competencia", "POST", f);
      toast.success("Competidor guardado");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={competidor ? "Editar competidor" : "Nuevo competidor"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Web"><Input value={f.web} onChange={(e) => setF({ ...f, web: e.target.value })} /></Field>
          <Field label="País / origen"><Input value={f.pais} onChange={(e) => setF({ ...f, pais: e.target.value })} /></Field>
          <Field label="Fortalezas (una por línea)" className="sm:col-span-2"><Textarea value={f.fortalezas} onChange={(e) => setF({ ...f, fortalezas: e.target.value })} /></Field>
          <Field label="Debilidades (una por línea)" className="sm:col-span-2"><Textarea value={f.debilidades} onChange={(e) => setF({ ...f, debilidades: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end"><Button onClick={guardar}>Guardar</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function ProductoForm({ competidores, equipos }: { competidores: Comp[]; equipos: Equipo[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ competidorId: competidores[0]?.id ?? "", equipoId: equipos[0]?.id ?? "", nombre: "", marca: "", precio: 0, fortalezas: "", debilidades: "" });
  const [specs, setSpecs] = useState("potencia: \nvoltaje: \npeso: \ngarantia: ");
  async function guardar() {
    setBusy(true);
    try {
      const fichaTecnica = Object.fromEntries(
        specs.split("\n").map((l) => l.split(":").map((x) => x.trim())).filter(([k, v]) => k && v).map(([k, ...v]) => [k, v.join(":")]),
      );
      await api("/erp/api/competencia/productos", "POST", { ...f, fichaTecnica });
      toast.success("Producto agregado");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Plus />Nuevo producto</Button></DialogTrigger>
      <DialogContent title="Producto de la competencia" description="Vincúlalo a nuestro equipo equivalente">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Competidor"><Select value={f.competidorId} onChange={(e) => setF({ ...f, competidorId: e.target.value })}>{competidores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
          <Field label="Equivale a nuestro"><Select value={f.equipoId} onChange={(e) => setF({ ...f, equipoId: e.target.value })}>{equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo}</option>)}</Select></Field>
          <Field label="Producto"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Marca"><Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} /></Field>
          <Field label="Precio (S/)"><Input type="number" value={f.precio} onChange={(e) => setF({ ...f, precio: Number(e.target.value) })} /></Field>
          <Field label="Ficha (campo: valor por línea)" className="sm:col-span-2"><Textarea value={specs} onChange={(e) => setSpecs(e.target.value)} /></Field>
          <Field label="Fortalezas"><Textarea value={f.fortalezas} onChange={(e) => setF({ ...f, fortalezas: e.target.value })} /></Field>
          <Field label="Debilidades"><Textarea value={f.debilidades} onChange={(e) => setF({ ...f, debilidades: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end"><Button onClick={guardar} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Guardar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
