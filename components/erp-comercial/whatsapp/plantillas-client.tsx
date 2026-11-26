"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import type { Plantilla } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/erp-comercial/ui/card";
import { Button } from "@/components/erp-comercial/ui/button";
import { Badge } from "@/components/erp-comercial/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/erp-comercial/ui/dialog";
import { ConfirmDelete } from "@/components/erp-comercial/equipos/equipos-table";
import { CATEGORIAS_PLANTILLA } from "@/lib/erp-comercial/constants";
import { renderPlantilla, VARIABLES_DISPONIBLES } from "@/lib/erp-comercial/templates";
import { api } from "@/lib/erp-comercial/api-client";

const EJEMPLO = { nombre: "Jorge", empresa: "Ferreteria El Constructor SAC", equipo: "Grupo Electrogeno 7.5 kVA", precio: "S/ 7,402.20", vendedor: "Carlos Mendoza", fecha: "15 nov 2026", region: "Lima" };

export function PlantillasClient({ plantillas }: { plantillas: Plantilla[] }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><PlantillaForm trigger={<Button><Plus />Nueva plantilla</Button>} /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plantillas.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle>{p.nombre}</CardTitle>
                <div className="flex gap-1.5"><Badge variant="secondary">{p.categoria}</Badge>{p.metaTemplateName && <Badge variant="success">Meta: {p.metaTemplateName}</Badge>}</div>
              </div>
              <div className="flex">
                <PlantillaForm plantilla={p} trigger={<Button size="icon" variant="ghost"><Pencil /></Button>} />
                <ConfirmDelete onConfirm={async () => { await api(`/erp/api/plantillas/${p.id}`, "DELETE"); router.refresh(); }} />
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="wa-pattern h-full rounded-lg p-3">
                <div className="ml-auto w-fit whitespace-pre-wrap rounded-lg rounded-tr-none bg-wa-bubble px-3 py-2 text-sm">{renderPlantilla(p.contenido, EJEMPLO)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlantillaForm({ plantilla, trigger }: { plantilla?: Plantilla; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: plantilla?.nombre ?? "", categoria: plantilla?.categoria ?? "OFERTA", contenido: plantilla?.contenido ?? "", metaTemplateName: plantilla?.metaTemplateName ?? "", idioma: plantilla?.idioma ?? "es" });
  async function guardar() {
    try {
      if (plantilla) await api(`/erp/api/plantillas/${plantilla.id}`, "PUT", f);
      else await api("/erp/api/plantillas", "POST", f);
      toast.success("Plantilla guardada");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={plantilla ? "Editar plantilla" : "Nueva plantilla"} className="max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          <Field label="Categoría"><Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{CATEGORIAS_PLANTILLA.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Contenido" className="sm:col-span-2"><Textarea rows={7} value={f.contenido} onChange={(e) => setF({ ...f, contenido: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-1.5 sm:col-span-2">
            {VARIABLES_DISPONIBLES.map((v) => (
              <button key={v} type="button" onClick={() => setF({ ...f, contenido: f.contenido + `{${v}}` })} className="rounded border px-2 py-0.5 font-mono text-xs hover:bg-accent">{`{${v}}`}</button>
            ))}
          </div>
          <Field label="Nombre plantilla aprobada en Meta (opcional)"><Input value={f.metaTemplateName} onChange={(e) => setF({ ...f, metaTemplateName: e.target.value })} placeholder="oferta_equipo_v1" /></Field>
          <Field label="Idioma Meta"><Input value={f.idioma} onChange={(e) => setF({ ...f, idioma: e.target.value })} placeholder="es / es_PE" /></Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Para escribir a clientes fuera de la ventana de 24h, Meta exige una plantilla aprobada. Si indicas su nombre, las variables se envían en orden como {"{{1}}, {{2}}…"}.
          </p>
        </div>
        <div className="flex justify-end"><Button onClick={guardar}>Guardar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
