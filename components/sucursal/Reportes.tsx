"use client";

import { useMemo } from "react";
import { ArrowRightLeft, Boxes, CalendarDays, TrendingUp, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, Table, Td } from "@/components/ui";
import { fechaPE, hoy, r2, soles } from "@/lib/storage";
import { MOTIVOS_DERIVACION, valorizado, type Derivacion, type MovCaja, type StockLocal, type VentaSucursal } from "@/lib/sucursal";
import { Indicador } from "./comun";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const menosDias = (base: string, n: number) => {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const suma = (v: VentaSucursal[]) => r2(v.reduce((a, x) => a + x.total, 0));

// =====================================================================
// 9. REPORTES: dashboard de la sucursal
// =====================================================================
export function ReportesSucursal({ ventas, derivaciones, stock, movs }: { ventas: VentaSucursal[]; derivaciones: Derivacion[]; stock: StockLocal[]; movs: MovCaja[] }) {
  const h = hoy();
  const semana = menosDias(h, 6);
  const mes = h.slice(0, 7);
  const vHoy = ventas.filter((v) => v.fecha === h);
  const vSemana = ventas.filter((v) => v.fecha >= semana && v.fecha <= h);
  const vMes = ventas.filter((v) => v.fecha.startsWith(mes));
  const derivMes = derivaciones.filter((d) => d.fecha.startsWith(mes));
  const movMes = movs.filter((m) => m.fecha.startsWith(mes));
  const ingMes = r2(movMes.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + m.monto, 0));
  const egrMes = r2(movMes.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + m.monto, 0));

  const serie = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = menosDias(h, 6 - i);
        const del = ventas.filter((v) => v.fecha === d);
        return { fecha: d, dia: `${DIAS[new Date(`${d}T12:00:00`).getDay()]} ${d.slice(8, 10)}`, total: suma(del), n: del.length };
      }),
    [ventas, h]
  );

  const top = useMemo(() => {
    const m = new Map<string, { producto: string; cantidad: number; total: number }>();
    for (const v of vMes)
      for (const l of v.lineas) {
        const k = l.producto.toUpperCase();
        const x = m.get(k) ?? { producto: l.producto, cantidad: 0, total: 0 };
        x.cantidad = r2(x.cantidad + l.cantidad);
        x.total = r2(x.total + l.subtotal);
        m.set(k, x);
      }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [vMes]);

  const porMotivo = (Object.keys(MOTIVOS_DERIVACION) as (keyof typeof MOTIVOS_DERIVACION)[]).map((k) => ({ k, n: derivMes.filter((d) => d.motivo === k).length }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icon={<TrendingUp size={14} />} label="Ventas hoy" valor={soles(suma(vHoy))} detalle={`${vHoy.length} venta(s)`} />
        <Indicador icon={<CalendarDays size={14} />} label="Últimos 7 días" valor={soles(suma(vSemana))} detalle={`${vSemana.length} venta(s)`} />
        <Indicador icon={<CalendarDays size={14} />} label="Ventas del mes" valor={soles(suma(vMes))} detalle={`${vMes.length} venta(s) · ${vMes.filter((v) => !v.pagado).length} por cobrar`} />
        <Indicador icon={<Boxes size={14} />} label="Stock valorizado" valor={soles(valorizado(stock))} detalle={`${stock.filter((s) => s.stock < s.minimo).length} bajo el mínimo`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Ventas de los últimos 7 días" subtitle={`Total ${soles(suma(vSemana))}`} />
          <div className="h-64 px-4 pb-4 pt-2" role="img" aria-label={`Ventas por día: ${serie.map((s) => `${s.dia} ${soles(s.total)}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(128,128,140,0.18)" />
                <XAxis dataKey="dia" tickLine={false} axisLine={{ stroke: "rgba(128,128,140,0.25)" }} tick={{ fill: "#8B8B95", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: "#8B8B95", fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `S/ ${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k` : `S/ ${v}`)} />
                <Tooltip
                  cursor={{ fill: "rgba(37,99,235,0.08)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof serie)[number];
                    return (
                      <div className="rounded-lg border border-plomo-200 bg-surface px-3 py-2 text-xs shadow-pop">
                        <p className="font-semibold text-fg">{fechaPE(p.fecha)}</p>
                        <p className="text-plomo-600">
                          {soles(p.total)} · {p.n} venta(s)
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 2, 2]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Caja chica vs ingresos del mes" />
          <div className="space-y-4 p-5">
            {[
              { label: "Ingresos (ventas y cobros)", valor: ingMes, color: "bg-emerald-500" },
              { label: "Egresos (gastos y movilidad)", valor: egrMes, color: "bg-red-500" },
            ].map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-fg-2">{b.label}</span>
                  <span className="font-semibold text-fg">{soles(b.valor)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-plomo-100">
                  <div className={`h-2.5 rounded-full ${b.color}`} style={{ width: `${Math.max(ingMes, egrMes) ? (b.valor / Math.max(ingMes, egrMes)) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            <p className="flex items-center gap-1.5 text-sm text-plomo-500">
              <Wallet size={14} /> Neto del mes: <span className="font-semibold text-fg">{soles(r2(ingMes - egrMes))}</span>
            </p>
            <div className="border-t border-plomo-100 pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
                <ArrowRightLeft size={14} /> Derivaciones al Taller este mes: {derivMes.length}
              </p>
              {porMotivo.map((m) => (
                <p key={m.k} className="flex justify-between text-sm text-fg-2">
                  <span>{MOTIVOS_DERIVACION[m.k]}</span>
                  <span>{m.n}</span>
                </p>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Top productos del mes" />
        <Table head={["#", "Producto", "Cantidad", "Total"]} empty={top.length === 0}>
          {top.map((t, i) => (
            <tr key={t.producto}>
              <Td>{i + 1}</Td>
              <Td className="font-medium text-fg">{t.producto}</Td>
              <Td className="text-right">{t.cantidad}</Td>
              <Td className="text-right font-semibold">{soles(t.total)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
