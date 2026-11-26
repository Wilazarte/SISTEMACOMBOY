import { Badge } from "@/components/erp-comercial/ui/badge";
import { COLOR_ETAPA, LABEL_ETAPA, LABEL_REGION, LABEL_TIPO } from "@/lib/erp-comercial/constants";
import { cn } from "@/lib/erp-comercial/utils";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, icon: Icon, tone = "blue" }: { label: string; value: React.ReactNode; hint?: string; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "violet" | "rose" }) {
  const tones = {
    blue: "from-blue-500/20 text-blue-300",
    green: "from-emerald-500/20 text-emerald-300",
    amber: "from-amber-500/20 text-amber-300",
    violet: "from-violet-500/20 text-violet-300",
    rose: "from-rose-500/20 text-rose-300",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4">
      <div className={cn("absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br to-transparent blur-xl", tones[tone])} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <Icon className={cn("h-5 w-5", tones[tone].split(" ")[1])} />
      </div>
    </div>
  );
}

export function EtapaBadge({ etapa }: { etapa: string }) {
  return <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-xs font-medium", COLOR_ETAPA[etapa])}>{LABEL_ETAPA[etapa] ?? etapa}</span>;
}

export function TipoBadge({ tipo }: { tipo: string }) {
  const v = tipo === "VIP" ? "warning" : tipo === "DISTRIBUIDOR" ? "default" : tipo === "MAYORISTA" ? "success" : "secondary";
  return <Badge variant={v}>{LABEL_TIPO[tipo] ?? tipo}</Badge>;
}

export function RegionBadge({ region }: { region: string }) {
  return <Badge variant="outline">{LABEL_REGION[region] ?? region}</Badge>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
