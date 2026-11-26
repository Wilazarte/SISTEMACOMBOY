"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Upload, X, Loader2 } from "lucide-react";
import type { Equipo } from "@prisma/client";
import { Button } from "@/components/erp-comercial/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/erp-comercial/ui/dialog";
import { Field, Input, Textarea } from "@/components/erp-comercial/ui/input";
import { api } from "@/lib/erp-comercial/api-client";
import { parseJSON } from "@/lib/erp-comercial/utils";

const SPECS_SUGERIDAS = ["potencia", "voltaje", "peso", "garantia"];

export function EquipoForm({ equipo, trigger }: { equipo?: Equipo; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState({
    codigo: equipo?.codigo ?? "", nombre: equipo?.nombre ?? "", marca: equipo?.marca ?? "", categoria: equipo?.categoria ?? "",
    descripcion: equipo?.descripcion ?? "", stock: equipo?.stock ?? 0, costoBase: equipo?.costoBase ?? 0, precioLista: equipo?.precioLista ?? 0,
    intervaloMantenimientoMeses: equipo?.intervaloMantenimientoMeses ?? 3, videoUrl: equipo?.videoUrl ?? "",
  });
  const [specs, setSpecs] = useState<[string, string][]>(() => {
    const o = parseJSON<Record<string, string>>(equipo?.fichaTecnica, {});
    const e = Object.entries(o).map(([k, v]) => [k, String(v)] as [string, string]);
    return e.length ? e : SPECS_SUGERIDAS.map((k) => [k, ""]);
  });
  const [fotos, setFotos] = useState<string[]>(() => parseJSON<string[]>(equipo?.fotos, []));
  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  async function subir(files: FileList | null, tipo: "foto" | "video") {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((file) => fd.append("files", file));
      const { urls } = await api<{ urls: string[] }>("/erp/api/upload", "POST", fd);
      if (tipo === "foto") setFotos((p) => [...p, ...urls]);
      else set("videoUrl", urls[0]);
      toast.success("Archivo subido");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function guardar() {
    setSaving(true);
    try {
      const fichaTecnica = Object.fromEntries(specs.filter(([k, v]) => k.trim() && v.trim()));
      const body = { ...f, fichaTecnica, fotos };
      if (equipo) await api(`/erp/api/equipos/${equipo.id}`, "PUT", body);
      else await api("/erp/api/equipos", "POST", body);
      toast.success(equipo ? "Equipo actualizado" : "Equipo creado");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const margen = f.precioLista ? ((f.precioLista - f.costoBase) / f.precioLista) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={equipo ? `Editar ${equipo.codigo}` : "Nuevo equipo"} className="max-w-3xl">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Código"><Input value={f.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} placeholder="GE-7500" /></Field>
          <Field label="Nombre" className="sm:col-span-3"><Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} /></Field>
          <Field label="Marca"><Input value={f.marca} onChange={(e) => set("marca", e.target.value)} /></Field>
          <Field label="Categoría"><Input value={f.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Generadores" /></Field>
          <Field label="Stock"><Input type="number" value={f.stock} onChange={(e) => set("stock", Number(e.target.value))} /></Field>
          <Field label="Mant. cada (meses)"><Input type="number" min={0} value={f.intervaloMantenimientoMeses} onChange={(e) => set("intervaloMantenimientoMeses", Number(e.target.value))} /></Field>
          <Field label="Costo base (S/)"><Input type="number" step="0.01" value={f.costoBase} onChange={(e) => set("costoBase", Number(e.target.value))} /></Field>
          <Field label="Precio lista (S/)"><Input type="number" step="0.01" value={f.precioLista} onChange={(e) => set("precioLista", Number(e.target.value))} /></Field>
          <div className="flex items-end pb-2 text-sm text-muted-foreground sm:col-span-2">
            Margen lista: <span className={margen < 20 ? "ml-1 font-semibold text-rose-300" : "ml-1 font-semibold text-emerald-300"}>{margen.toFixed(1)}%</span>
          </div>
          <Field label="Descripción" className="sm:col-span-4"><Textarea value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ficha técnica</span>
            <Button size="sm" variant="ghost" onClick={() => setSpecs((s) => [...s, ["", ""]])}><Plus />Agregar campo</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {specs.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-36" placeholder="campo" value={k} onChange={(e) => setSpecs((s) => s.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
                <Input placeholder="valor" value={v} onChange={(e) => setSpecs((s) => s.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} />
                <Button size="icon" variant="ghost" onClick={() => setSpecs((s) => s.filter((_, j) => j !== i))}><Trash2 /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fotos (JPG/PNG para WhatsApp y PDF)</span>
          <div className="flex flex-wrap gap-2">
            {fotos.map((u) => (
              <div key={u} className="group relative h-20 w-24 overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setFotos((p) => p.filter((x) => x !== u))} className="absolute right-1 top-1 hidden rounded bg-black/70 p-0.5 group-hover:block"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <label className="grid h-20 w-24 cursor-pointer place-items-center rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex flex-col items-center gap-1"><Upload className="h-4 w-4" />Subir</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => subir(e.target.files, "foto")} />
            </label>
          </div>
        </div>

        <Field label="Video del equipo (URL pública MP4 o subir archivo, máx 16MB)">
          <div className="flex gap-2">
            <Input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://... o /uploads/video.mp4" />
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" />MP4
              <input type="file" accept="video/mp4,video/3gpp" hidden onChange={(e) => subir(e.target.files, "video")} />
            </label>
          </div>
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving && <Loader2 className="animate-spin" />}Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
