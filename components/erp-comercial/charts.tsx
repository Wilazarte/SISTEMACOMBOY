"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Serie unica -> un solo tono (azul validado para superficie oscura). Grid y ejes recesivos.
const SERIE = "#3987e5";
const GRID = "hsl(217 33% 16%)";
const TICK = { fill: "hsl(215 20% 62%)", fontSize: 12 };

type Fmt = "soles" | "num" | "pct";
const fmt = (v: number, f: Fmt) =>
  f === "soles"
    ? `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`
    : f === "pct"
      ? `${v.toFixed(1)}%`
      : v.toLocaleString("es-PE");
const fmtCorto = (v: number, f: Fmt) => (f === "soles" ? (v >= 1000 ? `S/ ${(v / 1000).toFixed(0)}k` : `S/ ${v}`) : f === "pct" ? `${v}%` : String(v));

function Tip({ active, payload, label, f, nombre }: { active?: boolean; payload?: { value: number }[]; label?: string; f: Fmt; nombre: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-0.5 font-medium text-foreground">{label}</div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: SERIE }} />
        {nombre}: <span className="font-semibold tabular-nums text-foreground">{fmt(payload[0].value, f)}</span>
      </div>
    </div>
  );
}

export function BarrasChart({
  data, x, y, nombre, formato = "num", horizontal = false, alto = 260,
}: { data: Record<string, string | number>[]; x: string; y: string; nombre: string; formato?: Fmt; horizontal?: boolean; alto?: number }) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCorto(v, formato)} />
          <YAxis type="category" dataKey={x} tick={TICK} axisLine={false} tickLine={false} width={150} />
          <Tooltip cursor={{ fill: "hsl(217 33% 20% / 0.4)" }} content={<Tip f={formato} nombre={nombre} />} />
          <Bar dataKey={y} fill={SERIE} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={x} tick={TICK} axisLine={false} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCorto(v, formato)} width={60} />
          <Tooltip cursor={{ fill: "hsl(217 33% 20% / 0.4)" }} content={<Tip f={formato} nombre={nombre} />} />
          <Bar dataKey={y} fill={SERIE} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function LineaChart({ data, x, y, nombre, alto = 240 }: { data: Record<string, string | number>[]; x: string; y: string; nombre: string; alto?: number }) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={x} tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
        <Tooltip cursor={{ stroke: "hsl(215 20% 40%)", strokeDasharray: "3 3" }} content={<Tip f="num" nombre={nombre} />} />
        <Line type="monotone" dataKey={y} stroke={SERIE} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "hsl(222 40% 8%)", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
