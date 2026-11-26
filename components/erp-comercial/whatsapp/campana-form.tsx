"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Megaphone, Users } from "lucide-react";
import type { Equipo, Plantilla } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Field, Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { Button } from "@/components/erp-comercial/ui/button";
import { ETAPAS, LABEL_ETAPA, LABEL_REGION, LABEL_TIPO, REGIONES, TIPOS_CLIENTE } from "@/lib/erp-comercial/constants";
import { api } from "@/lib/erp-comercial/api-client";
import { cn } from "@/lib/erp-comercial/utils";

function Chips({ opciones, labels, valor, onChange }: { opciones: readonly string[]; labels: Record<string, string>; valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const on = valor.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? valor.filter((x) => x !== o) : [...valor, o])}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors", on ? "border-wa/50 bg-wa/15 text-wa" : "text-muted-foreground hover:bg-accent")}
          >
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}

export function CampanaForm({ plantillas, equipos }: { plantillas: Plantilla[]; equipos: Equipo[] }) {
  const router = useRouter();
  const p0 = plantillas.find((p) => p.categoria === "OFERTA") ?? plantillas[0];
  const [f, setF] = useState({ nombre: "", plantillaId: p0?.id ?? "", mensaje: p0?.contenido ?? "", equipoId: "", adjuntarFoto: false, adjuntarPdf: false, adjuntarVideo: false });
  const [regiones, setRegiones] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [etapas, setEtapas] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await api<{ total: number }>("/erp/api/campanas", "POST", { preview: true, regiones, tipos, etapas });
      setTotal(r.total);
    }, 250);
    return () => clearTimeout(t);
  }, [regiones, tipos, etapas]);

  async function crear() {
    setBusy(true);
    try {
      const c = await api<{ id: string }>("/erp/api/campanas", "POST", { ...f, regiones, tipos, etapas });
      toast.success("Campaña creada");
      router.push(`/erp/whatsapp/campanas/${c.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" />Nueva campaña</CardTitle><CardDescription>Mensaje masivo segmentado con variables personalizadas por cliente</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de la campaña"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Oferta Noviembre - Generadores" /></Field>
          <Field label="Plantilla">
            <Select value={f.plantillaId} onChange={(e) => { const p = plantillas.find((x) => x.id === e.target.value); setF({ ...f, plantillaId: e.target.value, mensaje: p?.contenido ?? f.mensaje }); }}>
              <option value="">Personalizado</option>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.metaTemplateName ? " (Meta ✓)" : ""}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Mensaje · {nombre} {empresa} {precio} {equipo} {region} {vendedor}">
          <Textarea rows={5} value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Equipo en oferta (para {precio}, foto, PDF y video)">
            <Select value={f.equipoId} onChange={(e) => setF({ ...f, equipoId: e.target.value })}>
              <option value="">— Ninguno —</option>
              {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
            </Select>
          </Field>
          <div className={cn("flex items-end gap-3 pb-2 text-sm", !f.equipoId && "pointer-events-none opacity-40")}>
            {(["adjuntarFoto", "adjuntarPdf", "adjuntarVideo"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[#25D366]" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
                {k === "adjuntarFoto" ? "Foto" : k === "adjuntarPdf" ? "PDF" : "Video"}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-lg border bg-background/40 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Segmentación (vacío = todos)</div>
          <div><div className="mb-1 text-xs text-muted-foreground">Región</div><Chips opciones={REGIONES} labels={LABEL_REGION} valor={regiones} onChange={setRegiones} /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Tipo de cliente</div><Chips opciones={TIPOS_CLIENTE} labels={LABEL_TIPO} valor={tipos} onChange={setTipos} /></div>
          <div><div className="mb-1 text-xs text-muted-foreground">Etapa CRM</div><Chips opciones={ETAPAS} labels={LABEL_ETAPA} valor={etapas} onChange={setEtapas} /></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-wa" /><span className="font-semibold tabular-nums">{total ?? "…"}</span> destinatarios (con opt-in)</div>
          <Button variant="whatsapp" onClick={crear} disabled={busy || !total}>{busy && <Loader2 className="animate-spin" />}Crear campaña</Button>
        </div>
      </CardContent>
    </Card>
  );
}
