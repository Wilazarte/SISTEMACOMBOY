"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, MessageCircle, GripVertical } from "lucide-react";
import { ETAPAS, LABEL_ETAPA, LABEL_REGION } from "@/lib/erp-comercial/constants";
import { TipoBadge } from "@/components/erp-comercial/shared";
import { api } from "@/lib/erp-comercial/api-client";
import { cn, soles } from "@/lib/erp-comercial/utils";

export interface KanbanCard {
  id: string;
  razonSocial: string;
  contacto: string;
  tipoCliente: string;
  region: string;
  etapa: string;
  vendedor: string | null;
  montoAbierto: number;
  diasSinContacto: number | null;
  proximoContacto: string | null;
}

const BORDE: Record<string, string> = {
  PROSPECTO: "border-t-sky-500", COTIZADO: "border-t-indigo-500", NEGOCIADO: "border-t-amber-500",
  GANADO: "border-t-emerald-500", PERDIDO: "border-t-rose-500", POSTVENTA: "border-t-fuchsia-500",
};

export function Kanban({ cards: inicial, diasAlerta }: { cards: KanbanCard[]; diasAlerta: number }) {
  const router = useRouter();
  const [cards, setCards] = useState(inicial);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => setCards(inicial), [inicial]);

  async function mover(id: string, etapa: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.etapa === etapa) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, etapa } : c)));
    try {
      await api(`/erp/api/clientes/${id}`, "PATCH", { etapa });
      toast.success(`${card.razonSocial} → ${LABEL_ETAPA[etapa]}`, {
        description: etapa === "GANADO" ? "Se enviará la encuesta post-venta automáticamente" : undefined,
      });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setCards(inicial);
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ETAPAS.map((etapa) => {
        const col = cards.filter((c) => c.etapa === etapa);
        const total = col.reduce((s, c) => s + c.montoAbierto, 0);
        return (
          <div
            key={etapa}
            onDragOver={(e) => { e.preventDefault(); setOver(etapa); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); mover(e.dataTransfer.getData("id"), etapa); }}
            className={cn("flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-card/60 transition-colors", BORDE[etapa], over === etapa && "bg-primary/10 ring-1 ring-primary")}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="font-semibold">{LABEL_ETAPA[etapa]} <span className="ml-1 text-xs text-muted-foreground">{col.length}</span></div>
              {total > 0 && <div className="text-xs tabular-nums text-muted-foreground">{soles(total)}</div>}
            </div>
            <div className="flex min-h-[200px] flex-1 flex-col gap-2 px-2 pb-2">
              {col.map((c) => {
                const alerta = ["PROSPECTO", "COTIZADO", "NEGOCIADO"].includes(c.etapa) && (c.diasSinContacto ?? 999) >= diasAlerta;
                return (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("id", c.id)}
                    className={cn("group cursor-grab rounded-lg border bg-background/80 p-3 text-sm shadow-sm active:cursor-grabbing", alerta && "border-amber-500/50")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/erp/clientes/${c.id}`} className="font-medium leading-tight hover:text-primary">{c.razonSocial}</Link>
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{c.contacto} · {LABEL_REGION[c.region]}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <TipoBadge tipo={c.tipoCliente} />
                      {c.montoAbierto > 0 && <span className="text-xs font-medium tabular-nums">{soles(c.montoAbierto)}</span>}
                    </div>
                    {(alerta || c.proximoContacto) && (
                      <div className="mt-2 space-y-1 text-xs">
                        {alerta && <div className="flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3 w-3" />{c.diasSinContacto === null ? "Nunca contactado" : `${c.diasSinContacto} días sin contacto`}</div>}
                        {c.proximoContacto && <div className="flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3 w-3" />Próx: {c.proximoContacto}</div>}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                      <span className="text-[11px] text-muted-foreground">{c.vendedor ?? "Sin vendedor"}</span>
                      <Link href={`/erp/whatsapp?c=${c.id}`} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-wa hover:bg-wa/10"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
