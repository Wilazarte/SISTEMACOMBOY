import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator, ClipboardList, FileDown, Images, Pencil, Printer, Send, Swords, Video } from "lucide-react";
import { prisma } from "@/lib/erp-comercial/prisma";
import { PageHeader } from "@/components/erp-comercial/shared";
import { Button } from "@/components/erp-comercial/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/erp-comercial/ui/table";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/erp-comercial/ui/tabs";
import { EquipoForm } from "@/components/erp-comercial/equipos/equipo-form";
import { CostosClient } from "@/components/erp-comercial/equipos/costos-client";
import { calcularPrecio } from "@/lib/erp-comercial/pricing";
import { aCostosIn, includeCostos, rentabilidad, totalesCostos } from "@/lib/erp-comercial/costos";
import { LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";
import { cn, parseJSON, soles } from "@/lib/erp-comercial/utils";

export const dynamic = "force-dynamic";

const TABS = ["ficha", "costos", "media"] as const;
const LABEL_FICHA: Record<string, string> = { fichaPdf: "Ficha PDF" };

export default async function EquipoDetalle({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const equipo = await prisma.equipo.findUnique({
    where: { id: params.id },
    include: { productosCompetencia: { include: { competidor: true } }, costoProduccion: { include: includeCostos } },
  });
  if (!equipo) notFound();
  const reglas = await prisma.reglaPrecio.findMany();
  const fotos = parseJSON<string[]>(equipo.fotos, []);
  const ficha = parseJSON<Record<string, string>>(equipo.fichaTecnica, {});
  const tab = TABS.includes(searchParams.tab as (typeof TABS)[number]) ? searchParams.tab! : "ficha";

  const costos = aCostosIn(equipo.costoProduccion);
  const costoProd = costos ? totalesCostos(costos).total : null;
  const r = costoProd === null ? null : rentabilidad(equipo.precioLista, costoProd);
  const tono = (v: number | null | undefined) => (v == null ? "" : v < 0 ? "text-rose-400" : "text-emerald-400");

  return (
    <div className="space-y-6">
      <PageHeader
        title={equipo.nombre}
        subtitle={[equipo.codigo, equipo.marca, equipo.categoria].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/erp/equipos/${equipo.id}/ficha`} target="_blank"><Printer />Imprimir ficha</Link></Button>
            <Button asChild variant="outline"><a href={`/erp/api/equipos/${equipo.id}/pdf`} target="_blank"><FileDown />PDF</a></Button>
            <EquipoForm equipo={equipo} trigger={<Button variant="secondary"><Pencil />Editar</Button>} />
            <Button asChild variant="whatsapp"><Link href={`/erp/whatsapp/ofertas?equipo=${equipo.id}`}><Send />Enviar oferta</Link></Button>
          </>
        }
      />

      {/* Cifras clave: se recalculan al guardar el costeo */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5">
          <div><div className="text-xs text-muted-foreground">Precio lista</div><div className="text-lg font-semibold tabular-nums">{soles(equipo.precioLista)}</div></div>
          <div><div className="text-xs text-muted-foreground">Costo prod.</div><div className="text-lg font-semibold tabular-nums">{costoProd === null ? <span className="text-muted-foreground">Sin costeo</span> : soles(costoProd)}</div></div>
          <div><div className="text-xs text-muted-foreground">Ganancia</div><div className={cn("text-lg font-semibold tabular-nums", tono(r?.ganancia))}>{r ? soles(r.ganancia) : "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Margen</div><div className={cn("text-lg font-semibold tabular-nums", tono(r?.margen))}>{r?.margen == null ? "—" : `${r.margen.toFixed(1)}%`}</div></div>
          <div><div className="text-xs text-muted-foreground">Stock</div><div className="text-lg font-semibold tabular-nums">{equipo.stock} und.</div></div>
        </CardContent>
      </Card>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="ficha"><ClipboardList className="h-4 w-4" />Ficha técnica</TabsTrigger>
          <TabsTrigger value="costos"><Calculator className="h-4 w-4" />Costos de producción</TabsTrigger>
          <TabsTrigger value="media"><Images className="h-4 w-4" />Fotos/Videos</TabsTrigger>
        </TabsList>

        {/* 1. FICHA TÉCNICA */}
        <TabsContent value="ficha" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>Ficha técnica</CardTitle></CardHeader>
              <CardContent>
                {Object.keys(ficha).length ? (
                  <dl className="divide-y text-sm">
                    {Object.entries(ficha).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-2">
                        <dt className="capitalize text-muted-foreground">{LABEL_FICHA[k] ?? k.replace(/([A-Z])/g, " $1")}</dt>
                        <dd className="text-right font-medium">
                          {String(v).toLowerCase().endsWith(".pdf") ? (
                            <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ver PDF</a>
                          ) : v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="text-sm text-muted-foreground">Sin datos de ficha técnica.</p>}
                {equipo.descripcion && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{equipo.descripcion}</p>}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
                <div><div className="text-xs text-muted-foreground">Costo base</div><div className="text-lg font-semibold">{soles(equipo.costoBase)}</div></div>
                <div><div className="text-xs text-muted-foreground">Precio lista</div><div className="text-lg font-semibold">{soles(equipo.precioLista)}</div></div>
                <div><div className="text-xs text-muted-foreground">Categoría</div><div className="font-semibold">{equipo.categoria}</div></div>
                <div><div className="text-xs text-muted-foreground">Mantenimiento</div><div className="text-lg font-semibold">cada {equipo.intervaloMantenimientoMeses} meses</div></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Matriz de precios (1 unidad)</CardTitle>
              <CardDescription>Precio final por tipo de cliente y región, con su margen. Configura las reglas en <Link href="/erp/precios" className="text-primary hover:underline">Precios</Link>.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR><TH>Tipo \ Región</TH>{REGIONES.map((rg) => <TH key={rg} className="text-right">{LABEL_REGION[rg]}</TH>)}</TR>
                </THead>
                <TBody>
                  {TIPOS_CLIENTE.map((t) => (
                    <TR key={t}>
                      <TD className="font-medium">{LABEL_TIPO[t]}</TD>
                      {REGIONES.map((rg) => {
                        const p = calcularPrecio(equipo, reglas, { tipoCliente: t, region: rg, cantidad: 1 });
                        return (
                          <TD key={rg} className="text-right tabular-nums">
                            <div className="font-medium">{soles(p.precioUnitario)}</div>
                            <div className={cn("text-xs", p.margen < 20 ? "text-rose-300" : "text-muted-foreground")}>{p.margen.toFixed(1)}% mg</div>
                          </TD>
                        );
                      })}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle className="flex items-center gap-2"><Swords className="h-4 w-4" />Competencia</CardTitle><CardDescription>Productos equivalentes</CardDescription></div>
              <Button asChild size="sm" variant="outline"><Link href={`/erp/competencia?equipo=${equipo.id}`}>Comparativa completa</Link></Button>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><TR><TH>Competidor</TH><TH>Producto</TH><TH className="text-right">Precio</TH><TH className="text-right">vs nuestro lista</TH></TR></THead>
                <TBody>
                  {equipo.productosCompetencia.map((p) => {
                    const dif = ((equipo.precioLista - p.precio) / p.precio) * 100;
                    return (
                      <TR key={p.id}>
                        <TD>{p.competidor.nombre}</TD>
                        <TD>{p.nombre} <span className="text-xs text-muted-foreground">({p.marca})</span></TD>
                        <TD className="text-right tabular-nums">{soles(p.precio)}</TD>
                        <TD className="text-right"><Badge variant={dif > 0 ? "warning" : "success"}>{dif > 0 ? "+" : ""}{dif.toFixed(1)}%</Badge></TD>
                      </TR>
                    );
                  })}
                  {!equipo.productosCompetencia.length && <TR><TD colSpan={4} className="py-6 text-center text-muted-foreground">Sin productos de competencia registrados</TD></TR>}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. COSTOS DE PRODUCCIÓN (mismo editor que /equipos/[codigo]/costos) */}
        <TabsContent value="costos">
          <CostosClient
            embedded
            equipo={{ id: equipo.id, codigo: equipo.codigo, nombre: equipo.nombre, categoria: equipo.categoria, precioLista: equipo.precioLista }}
            inicial={costos}
          />
        </TabsContent>

        {/* 3. FOTOS / VIDEOS */}
        <TabsContent value="media">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-2 sm:grid-cols-3">
                {fotos.length ? fotos.map((f, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f} src={f} alt={equipo.nombre} className={cn("w-full rounded-lg border object-cover", i === 0 ? "aspect-[4/3] sm:col-span-3" : "aspect-square")} />
                )) : <div className="grid aspect-video place-items-center rounded-lg bg-muted text-muted-foreground sm:col-span-3">Sin fotos</div>}
              </div>
              {equipo.videoUrl ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"><Video className="h-3.5 w-3.5" />Video</div>
                  <video src={equipo.videoUrl} controls className="w-full rounded-lg border" />
                </div>
              ) : <p className="mt-3 text-sm text-muted-foreground">Sin video. Agrégalo con el botón Editar.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
