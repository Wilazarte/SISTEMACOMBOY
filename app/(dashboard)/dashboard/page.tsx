"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ClipboardList, PackageSearch, Receipt, ShoppingCart, TrendingUp, Warehouse } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, CardHeader, Empty, Table, Td, cn } from "@/components/ui";
import { inicioDe, puedeVer, useSesion, veDashboard } from "@/lib/auth";
import { KEYS, fechaPE, hoy, r2, soles, useStore } from "@/lib/storage";
import type { ComprobanteVenta, NotaPedido, OrdenCompra, StockItem } from "@/lib/types";

/** Stock crítico: 5 unidades o menos (el ERP aún no maneja stock mínimo por producto). */
const STOCK_CRITICO = 5;

const mesActual = () => hoy().slice(0, 7);
const ultimos7 = (): string[] => {
  const base = new Date(`${hoy()}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
};
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function DashboardHome() {
  const router = useRouter();
  const { sesion } = useSesion();
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);

  // Roles sin Dashboard (p. ej. planilla) siguen a su módulo
  useEffect(() => {
    if (sesion && !veDashboard(sesion)) router.replace(inicioDe(sesion));
  }, [sesion, router]);
  if (!sesion || !veDashboard(sesion)) return null;

  const veVentas = puedeVer(sesion, "/dashboard/ventas");
  const veCompras = puedeVer(sesion, "/dashboard/compras");
  const veAlmacen = puedeVer(sesion, "/dashboard/almacen");
  const mes = mesActual();

  const emitidos = comprobantes.filter((c) => c.estado === "EMITIDO");
  const ventasMes = emitidos.filter((c) => c.fecha.startsWith(mes));
  const totalVentasMes = r2(ventasMes.reduce((a, c) => a + c.total, 0));
  const ocMes = ordenes.filter((o) => o.fecha.startsWith(mes));
  const totalComprasMes = r2(ocMes.reduce((a, o) => a + o.total, 0));
  const criticos = stock.filter((s) => s.cantidad <= STOCK_CRITICO).sort((a, b) => a.cantidad - b.cantidad);
  const pendientes = notas.filter((n) => n.estado === "PENDIENTE");
  const ultimasNP = [...notas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero)).slice(0, 6);

  const dias = ultimos7();
  const serie = dias.map((d) => {
    const del = emitidos.filter((c) => c.fecha === d);
    return { fecha: d, dia: `${DIAS[new Date(`${d}T12:00:00`).getDay()]} ${d.slice(8, 10)}`, total: r2(del.reduce((a, c) => a + c.total, 0)), n: del.length };
  });
  const total7 = r2(serie.reduce((a, x) => a + x.total, 0));
  const nombreMes = new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric" });

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-light leading-tight text-azul-900 lg:text-3xl">Dashboard</h1>
        <p className="mt-1 text-[13px] text-plomo-600">
          Resumen de {nombreMes} · {sesion.nombre}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {veVentas && (
          <Kpi
            icon={<TrendingUp size={18} />}
            label="Ventas del mes"
            valor={soles(totalVentasMes)}
            detalle={`${ventasMes.length} comprobante(s) emitido(s)`}
            href="/dashboard/ventas"
            borde="border-l-emerald-600"
          />
        )}
        {veCompras && (
          <Kpi
            icon={<ShoppingCart size={18} />}
            label="Compras del mes"
            valor={soles(totalComprasMes)}
            detalle={`${ocMes.length} orden(es) de compra`}
            href="/dashboard/compras"
            borde="border-l-azul-700"
          />
        )}
        {veAlmacen && (
          <Kpi
            icon={<PackageSearch size={18} />}
            label="Stock crítico"
            valor={String(criticos.length)}
            detalle={criticos.length ? `Producto(s) con ${STOCK_CRITICO} o menos` : "Sin productos en nivel crítico"}
            href="/dashboard/almacen"
            borde="border-l-corp"
            alerta={criticos.length > 0}
          />
        )}
        {veVentas && (
          <Kpi
            icon={<ClipboardList size={18} />}
            label="NP pendientes"
            valor={String(pendientes.length)}
            detalle={pendientes.length ? `${soles(r2(pendientes.reduce((a, n) => a + n.total, 0)))} por aprobar` : "Ninguna por aprobar"}
            href="/dashboard/ventas"
            borde="border-l-amber-500"
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {veVentas && (
          <Card className="xl:col-span-3">
            <CardHeader title="Ventas de los últimos 7 días" subtitle={`Comprobantes emitidos (con IGV) · total ${soles(total7)}`} />
            <div className="h-72 px-4 pb-4 pt-2" role="img" aria-label={`Ventas por día: ${serie.map((s) => `${s.dia} ${soles(s.total)}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={{ stroke: "#E2E8F0" }} tick={{ fill: "#475569", fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tick={{ fill: "#64748B", fontSize: 11 }}
                    tickFormatter={(v: number) => (v >= 1000 ? `S/ ${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k` : `S/ ${v}`)}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(15,36,64,0.06)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof serie)[number];
                      return (
                        <div className="rounded-lg border border-plomo-200 bg-white px-3 py-2 text-xs shadow-[0_4px_12px_rgba(15,36,64,0.12)]">
                          <p className="font-semibold text-azul-900">{fechaPE(p.fecha)}</p>
                          <p className="text-plomo-600">
                            {soles(p.total)} · {p.n} comprobante(s)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" fill="#0F2440" radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Vista en tabla para lectores de pantalla */}
            <table className="sr-only">
              <caption>Ventas de los últimos 7 días</caption>
              <tbody>
                {serie.map((s) => (
                  <tr key={s.fecha}>
                    <td>{fechaPE(s.fecha)}</td>
                    <td>{soles(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card className={cn(veVentas ? "xl:col-span-2" : "xl:col-span-5")}>
          <CardHeader title="Accesos rápidos" />
          <div className="grid gap-3 p-6">
            {veAlmacen && <Rapido href="/dashboard/almacen" icon={<Warehouse size={18} />} titulo="Almacén" texto="Requerimientos, stock y órdenes de despacho" />}
            {veVentas && <Rapido href="/dashboard/ventas" icon={<Receipt size={18} />} titulo="Ventas" texto="Notas de pedido, comprobantes y seguimiento" />}
            {veCompras && <Rapido href="/dashboard/compras" icon={<ShoppingCart size={18} />} titulo="Tesorería / Compras" texto="Cotizaciones, órdenes de compra y facturas" />}
          </div>
          {veAlmacen && criticos.length > 0 && (
            <div className="border-t border-plomo-100 px-6 py-4">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-vino">
                <AlertTriangle size={14} /> Stock crítico
              </p>
              <ul className="space-y-1 text-sm">
                {criticos.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span className="truncate text-azul-900">
                      {s.nombre} <span className="text-xs text-plomo-500">· {s.sede}</span>
                    </span>
                    <span className="whitespace-nowrap font-semibold text-vino">
                      {s.cantidad} {s.unidad}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {veVentas && (
        <Card>
          <CardHeader
            title="Últimas notas de pedido"
            action={
              <Link href="/dashboard/ventas" className="inline-flex items-center gap-1 text-sm font-semibold text-corp hover:text-vino-900">
                Ver todas <ArrowRight size={14} />
              </Link>
            }
          />
          {ultimasNP.length === 0 ? (
            <div className="p-5">
              <Empty icon={<ClipboardList size={28} />} text="Aún no hay notas de pedido." />
            </div>
          ) : (
            <Table head={["N° NP", "Fecha", "Cliente", "Total", "Estado", "Despacho"]}>
              {ultimasNP.map((n) => (
                <tr key={n.id} className="hover:bg-plomo-50">
                  <Td className="font-semibold text-azul-900">{n.numero}</Td>
                  <Td>{fechaPE(n.fecha)}</Td>
                  <Td>
                    <p className="font-medium text-azul-900">{n.cliente}</p>
                    <p className="text-xs text-plomo-500">{n.clienteDoc}</p>
                  </Td>
                  <Td className="text-right font-semibold">{soles(n.total)}</Td>
                  <Td>
                    <Badge estado={n.estado} />
                  </Td>
                  <Td>{n.odNumero ?? "-"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

function Kpi({ icon, label, valor, detalle, href, borde, alerta }: { icon: React.ReactNode; label: string; valor: string; detalle: string; href: string; borde: string; alerta?: boolean }) {
  return (
    <Link
      href={href}
      className={cn("group rounded-xl border border-l-4 border-plomo-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,36,64,0.06)] transition hover:bg-plomo-50", borde)}
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-plomo-500">
        {icon} {label}
      </p>
      <p className={cn("mt-2 font-serif text-3xl text-azul-900", alerta && "text-vino")}>{valor}</p>
      <p className="mt-1 flex items-center justify-between text-xs text-plomo-600">
        {detalle}
        <ArrowRight size={14} className="text-plomo-500 transition group-hover:translate-x-0.5 group-hover:text-corp" />
      </p>
    </Link>
  );
}

function Rapido({ href, icon, titulo, texto }: { href: string; icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-lg border border-plomo-200 px-4 py-3 transition hover:border-azul-900 hover:bg-plomo-50">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-azul-900 text-white">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold text-azul-900">{titulo}</span>
        <span className="block text-xs text-plomo-500">{texto}</span>
      </span>
      <ArrowRight size={16} className="text-plomo-500 group-hover:text-corp" />
    </Link>
  );
}
