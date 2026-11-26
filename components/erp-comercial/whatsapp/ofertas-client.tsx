"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Send, Loader2, CheckCircle2, XCircle, Image as ImageIcon, FileText, Video, Users } from "lucide-react";
import type { Cliente, Equipo, Plantilla, ReglaPrecio, Vendedor } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Field, Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { Progress } from "@/components/erp-comercial/ui/progress";
import { TipoBadge } from "@/components/erp-comercial/shared";
import { calcularPrecio } from "@/lib/erp-comercial/pricing";
import { renderPlantilla } from "@/lib/erp-comercial/templates";
import { LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, parseJSON, soles } from "@/lib/erp-comercial/utils";

type ClienteV = Cliente & { vendedor: Vendedor | null };

export function OfertasClient({
  equipos, clientes, plantillas, reglas, inicial,
}: { equipos: Equipo[]; clientes: ClienteV[]; plantillas: Plantilla[]; reglas: ReglaPrecio[]; inicial: { equipo?: string; cliente?: string; cantidad?: string } }) {
  const pOferta = plantillas.find((p) => p.categoria === "OFERTA");
  const [equipoId, setEquipoId] = useState(inicial.equipo ?? equipos[0]?.id ?? "");
  const [cantidad, setCantidad] = useState(Number(inicial.cantidad) || 1);
  const [plantillaId, setPlantillaId] = useState(pOferta?.id ?? "");
  const [texto, setTexto] = useState(pOferta?.contenido ?? "");
  const [adj, setAdj] = useState({ foto: true, pdf: true, video: true });
  const [sel, setSel] = useState<Set<string>>(new Set(inicial.cliente ? [inicial.cliente] : []));
  const [fRegion, setFRegion] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [progreso, setProgreso] = useState<{ total: number; hechos: number; res: Record<string, { ok: boolean; error?: string }> } | null>(null);
  const enviando = progreso !== null && progreso.hechos < progreso.total;

  const equipo = equipos.find((e) => e.id === equipoId);
  const visibles = clientes.filter((c) => (!fRegion || c.region === fRegion) && (!fTipo || c.tipoCliente === fTipo));
  const precioDe = (c: Cliente) => (equipo ? calcularPrecio(equipo, reglas, { tipoCliente: c.tipoCliente, region: c.region, cantidad }) : null);
  const primero = clientes.find((c) => sel.has(c.id)) ?? visibles[0];
  const preview = useMemo(() => {
    if (!primero) return texto;
    const p = precioDe(primero);
    return renderPlantilla(texto, {
      nombre: primero.contacto.split(" ")[0], empresa: primero.razonSocial, region: LABEL_REGION[primero.region],
      vendedor: primero.vendedor?.nombre ?? "tu asesor COMBOY", equipo: equipo?.nombre, precio: p ? soles(p.precioUnitario) : undefined,
      fecha: new Date().toLocaleDateString("es-PE"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, primero, equipo, cantidad]);
  const foto = equipo ? parseJSON<string[]>(equipo.fotos, [])[0] : undefined;

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function enviar() {
    const ids = Array.from(sel);
    if (!ids.length) return toast.error("Selecciona al menos un cliente");
    if (!equipo) return toast.error("Selecciona un equipo");
    setProgreso({ total: ids.length, hechos: 0, res: {} });
    let ok = 0;
    for (const id of ids) {
      try {
        const r = await api<{ ok: boolean; error?: string }>("/erp/api/whatsapp/oferta", "POST", {
          clienteId: id, equipoId, cantidad, texto, adjuntarFoto: adj.foto, adjuntarPdf: adj.pdf, adjuntarVideo: adj.video,
        });
        if (r.ok) ok++;
        setProgreso((p) => p && { ...p, hechos: p.hechos + 1, res: { ...p.res, [id]: r } });
      } catch (e) {
        setProgreso((p) => p && { ...p, hechos: p.hechos + 1, res: { ...p.res, [id]: { ok: false, error: (e as Error).message } } });
      }
    }
    toast.success(`Oferta enviada a ${ok} de ${ids.length} clientes`);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>1. Equipo y mensaje</CardTitle><CardDescription>El precio se calcula automáticamente para cada cliente según su tipo, región y la cantidad</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_120px_200px]">
              <Field label="Equipo">
                <Select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
                  {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
                </Select>
              </Field>
              <Field label="Cantidad"><Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))} /></Field>
              <Field label="Plantilla">
                <Select value={plantillaId} onChange={(e) => { setPlantillaId(e.target.value); const p = plantillas.find((x) => x.id === e.target.value); if (p) setTexto(p.contenido); }}>
                  <option value="">Personalizado</option>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Mensaje (variables: {nombre} {empresa} {equipo} {precio} {region} {vendedor})">
              <Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#25D366]" checked={adj.foto} onChange={(e) => setAdj({ ...adj, foto: e.target.checked })} /><ImageIcon className="h-4 w-4" />Foto</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#25D366]" checked={adj.pdf} onChange={(e) => setAdj({ ...adj, pdf: e.target.checked })} /><FileText className="h-4 w-4" />Ficha técnica PDF (con precio)</label>
              <label className={cn("flex items-center gap-2", !equipo?.videoUrl && "opacity-50")}><input type="checkbox" className="accent-[#25D366]" disabled={!equipo?.videoUrl} checked={adj.video && !!equipo?.videoUrl} onChange={(e) => setAdj({ ...adj, video: e.target.checked })} /><Video className="h-4 w-4" />Video {!equipo?.videoUrl && "(sin video)"}</label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div><CardTitle>2. Clientes</CardTitle><CardDescription>{sel.size} seleccionados</CardDescription></div>
            <div className="flex flex-wrap gap-2">
              <Select className="w-32" value={fRegion} onChange={(e) => setFRegion(e.target.value)}><option value="">Región</option>{REGIONES.map((r) => <option key={r} value={r}>{LABEL_REGION[r]}</option>)}</Select>
              <Select className="w-36" value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Tipo</option>{TIPOS_CLIENTE.map((r) => <option key={r} value={r}>{LABEL_TIPO[r]}</option>)}</Select>
              <Button size="sm" variant="outline" onClick={() => setSel(new Set(visibles.filter((c) => c.optIn).map((c) => c.id)))}><Users />Todos</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Ninguno</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {visibles.map((c) => {
              const p = precioDe(c);
              const r = progreso?.res[c.id];
              return (
                <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-accent/50", sel.has(c.id) && "border-wa/40 bg-wa/5", !c.optIn && "opacity-50")}>
                  <input type="checkbox" className="h-4 w-4 accent-[#25D366]" disabled={!c.optIn || enviando} checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.razonSocial}</div>
                    <div className="text-xs text-muted-foreground">{c.contacto} · +{c.telefono} · {LABEL_REGION[c.region]}</div>
                  </div>
                  <TipoBadge tipo={c.tipoCliente} />
                  {p && (
                    <div className="w-32 text-right">
                      <div className="text-sm font-semibold tabular-nums">{soles(p.precioUnitario)}</div>
                      <div className={cn("text-[11px] tabular-nums", p.margen < 20 ? "text-rose-300" : "text-muted-foreground")}>mg {p.margen.toFixed(1)}%</div>
                    </div>
                  )}
                  <div className="w-5">{r && (r.ok ? <CheckCircle2 className="h-5 w-5 text-wa" /> : <span title={r.error}><XCircle className="h-5 w-5 text-rose-400" /></span>)}</div>
                </label>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Vista previa</CardTitle><CardDescription>{primero ? `Para ${primero.razonSocial}` : "Selecciona un cliente"}</CardDescription></CardHeader>
          <div className="wa-pattern space-y-1.5 p-4">
            {adj.foto && foto && (
              <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-wa-bubble p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt="" className="max-h-40 rounded" />
              </div>
            )}
            <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tr-none bg-wa-bubble px-3 py-2 text-sm">{preview}</div>
            {adj.pdf && equipo && (
              <div className="ml-auto flex w-fit max-w-[85%] items-center gap-2 rounded-lg rounded-tr-none bg-wa-bubble px-3 py-2 text-sm">
                <FileText className="h-6 w-6 text-rose-300" />Ficha-{equipo.codigo}.pdf
              </div>
            )}
            {adj.video && equipo?.videoUrl && (
              <div className="ml-auto flex w-fit items-center gap-2 rounded-lg rounded-tr-none bg-wa-bubble px-3 py-2 text-sm"><Video className="h-5 w-5" />Video: {equipo.nombre}</div>
            )}
          </div>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            {progreso && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm"><span>Progreso</span><span className="tabular-nums">{progreso.hechos}/{progreso.total}</span></div>
                <Progress value={(progreso.hechos / progreso.total) * 100} barClassName="bg-wa" />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="text-wa">✓ {Object.values(progreso.res).filter((r) => r.ok).length} enviados</span>
                  <span className="text-rose-300">✗ {Object.values(progreso.res).filter((r) => !r.ok).length} fallidos</span>
                </div>
              </div>
            )}
            <Button variant="whatsapp" size="lg" className="w-full" disabled={enviando || !sel.size} onClick={enviar}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}Enviar oferta a {sel.size} cliente{sel.size === 1 ? "" : "s"}
            </Button>
            {progreso && !enviando && <Button asChild variant="outline" className="w-full"><Link href="/erp/whatsapp">Ver en bandeja</Link></Button>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
