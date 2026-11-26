"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, StickyNote, CalendarClock, PhoneCall } from "lucide-react";
import { Button } from "@/components/erp-comercial/ui/button";
import { Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { api } from "@/lib/erp-comercial/api-client";
import { ETAPAS, LABEL_ETAPA } from "@/lib/erp-comercial/constants";

export function EtapaSelect({ clienteId, etapa }: { clienteId: string; etapa: string }) {
  const router = useRouter();
  return (
    <Select
      value={etapa}
      className="w-40"
      onChange={async (e) => {
        await api(`/erp/api/clientes/${clienteId}`, "PATCH", { etapa: e.target.value });
        toast.success(`Etapa: ${LABEL_ETAPA[e.target.value]}`);
        router.refresh();
      }}
    >
      {ETAPAS.map((x) => <option key={x} value={x}>{LABEL_ETAPA[x]}</option>)}
    </Select>
  );
}

export function ProximoContacto({ clienteId, valor }: { clienteId: string; valor: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <CalendarClock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          className="pl-8"
          defaultValue={valor}
          onChange={async (e) => {
            await api(`/erp/api/clientes/${clienteId}`, "PATCH", { proximoContacto: e.target.value || null });
            toast.success("Próximo contacto actualizado");
            router.refresh();
          }}
        />
      </div>
      <Button
        variant="outline"
        title="Registrar contacto hoy"
        onClick={async () => {
          await api(`/erp/api/clientes/${clienteId}`, "PATCH", { contactado: true });
          toast.success("Contacto registrado");
          router.refresh();
        }}
      >
        <PhoneCall />Contactado hoy
      </Button>
    </div>
  );
}

export function NuevaNota({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe una nota de la conversación, acuerdo, objeción…" />
      <Button
        size="sm"
        disabled={busy || !texto.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/erp/api/clientes/${clienteId}/notas`, "POST", { texto });
            setTexto("");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <StickyNote />}Agregar nota
      </Button>
    </div>
  );
}
