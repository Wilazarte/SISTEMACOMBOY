"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Factory, Gauge, HandCoins, Layers, Package, ShoppingCart, TrendingUp } from "lucide-react";
import { ErpAlertList, type ErpAlerta } from "@/components/erp/ErpAlertList";
import { ErpStatsCard } from "@/components/erp/ErpStatsCard";
import { ErpTable, ErpTd } from "@/components/erp/ErpTable";
import { Etiqueta, Panel } from "@/components/logistica/piezas";
import { EncabezadoPlanta, MarcoPlanta, PanelLateral, horaActual, montoCorto } from "@/components/logistica/planta";
import { useSesion } from "@/lib/auth";
import { useExpedientes } from "@/lib/expedientes";
import { useGerencia } from "@/lib/gerencia";
import { useNotificaciones } from "@/lib/notificaciones";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, hoy, r2, soles, useStore } from "@/lib/storage";
import type { ComprobanteVenta, NotaPedido, StockItem } from "@/lib/types";
import { npPorCobrar, saldoNP, vencimientoNP } from "@/lib/ventas";

const ESTADO_OT: Record<OrdenProduccion["estado"], { label: string; tono: "verde" | "naranja" | "azul" }> = {
  EN_FABRICACION: { label: "En fabricación", tono: "azul" },
  QC_APROBADO: { label: "QC aprobado", tono: "verde" },
  ANULADA: { label: "Anulada", tono: "naranja" },
};

/**
 * Dashboard Gerencia: mismo marco que Almacén / Finanzas / Producción (título, contenido al centro y panel
 * derecho con notificaciones, chat y reunión grupal). Solo lectura: KPIs, últimas OTs y alertas críticas con
 * datos reales de Supabase; sin accesos a los módulos operativos.
 */
export function GerenciaDashboard() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const g = useGerencia();
  const exp = useExpedientes();
  const lotesActivos = exp.expedientes.filter((x) => x.estado === "ABIERTO");
  const avanceLotes = lotesActivos.length ? Math.round(lotesActivos.reduce((a, x) => a + (x.estado_avance || 0), 0) / lotesActivos.length) : 0;
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const [sync, setSync] = useState("");

  const d = useMemo(() => {
    const hoyStr = hoy();
    const mes = hoyStr.slice(0, 7);
    const emitidosMes = comprobantes.filter((c) => c.estado === "EMITIDO" && c.fecha.startsWith(mes));
    const ventasMes = r2(emitidosMes.reduce((a, c) => a + (c.total || 0), 0));
    const enFabricacion = ops.filter((o) => o.estado === "EN_FABRICACION").length;
    const qcMes = ops.filter((o) => o.estado === "QC_APROBADO" && (o.qc?.fecha || o.fecha).startsWith(mes)).length;
    const valorStock = r2(stock.reduce((a, s) => a + s.cantidad * (s.costoUnit || 0), 0));
    const conStock = stock.filter((s) => s.cantidad > 0).length;
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    const cxc = r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0));
    const cxcVencidas = porCobrar.filter((n) => vencimientoNP(n) < hoyStr).length;
    const ultimasOts = [...ops].sort((a, b) => (b.creado || b.fecha).localeCompare(a.creado || a.fecha)).slice(0, 10);
    return { emitidosMes: emitidosMes.length, ventasMes, enFabricacion, qcMes, valorStock, conStock, cxc, porCobrar: porCobrar.length, cxcVencidas, ultimasOts };
  }, [comprobantes, ops, stock, notas]);

  useEffect(() => setSync(horaActual()), [d]);

  // Alertas críticas: stock crítico, facturas de proveedor vencidas y cobranzas vencidas (solo lectura, sin enlaces)
  const alertas: ErpAlerta[] = useMemo(
    () => [
      ...g.stockCritico.map((s) => ({ clave: `st:${s.id}`, titulo: `Stock crítico · ${s.nombre}`, detalle: s.sede, icono: <AlertTriangle size={15} />, derecha: <Etiqueta>{`${s.cantidad} ${s.unidad}`}</Etiqueta> })),
      ...g.cxpVencidas.map((f) => ({ clave: `cxp:${f.id}`, titulo: `Factura vencida ${f.numero} · ${f.proveedor}`, detalle: `Venció ${fechaPE(f.fechaVencimiento)}`, icono: <AlertTriangle size={15} />, derecha: <Etiqueta>{soles(f.netoPagar ?? f.total)}</Etiqueta> })),
      ...g.cxcVencidas.map((n) => ({ clave: `cxc:${n.id}`, titulo: `Cobranza vencida ${n.numero} · ${n.cliente}`, detalle: "Nota de pedido por cobrar", icono: <AlertTriangle size={15} />, derecha: <Etiqueta>{soles(saldoNP(n))}</Etiqueta> })),
    ],
    [g.stockCritico, g.cxpVencidas, g.cxcVencidas]
  );
  // Recordatorios del panel derecho sin enlace: Gerencia no entra a los módulos
  const recordatorios = g.recordatorios.map((p) => ({ clave: p.clave, titulo: p.titulo, detalle: p.detalle, href: "" }));

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Gerencia" notifs={notifs} recordatorios={recordatorios} />}>
      <EncabezadoPlanta
        icono={<Gauge size={30} />}
        titulo="GERENCIA"
        subtitulo="Visor general · solo lectura · Arequipa · Perú"
        accion={<span className="text-[13px] text-[#d4d4d8]">Actualizado: Hoy · {sync} hrs</span>}
      />

      {/* KPIs de todos los módulos (solo lectura, sin botones de acción) */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ErpStatsCard icono={<ShoppingCart size={18} />} titulo="Compras activas" valor={`${g.ticker.comprasActivas} OC`} detalle="Órdenes de compra en curso" />
        <ErpStatsCard
          icono={<Layers size={18} />}
          titulo="Lotes activos"
          valor={`${lotesActivos.length} lote(s)`}
          detalle={exp.faltaTabla ? "Expedientes 26W sin instalar" : `${avanceLotes}% de avance promedio`}
        />
        <ErpStatsCard icono={<TrendingUp size={18} />} titulo="Ventas del mes" valor={montoCorto(d.ventasMes)} detalle={d.emitidosMes ? `${d.emitidosMes} comprobante(s) emitido(s)` : "Sin registro este mes"} />
        <ErpStatsCard icono={<Factory size={18} />} titulo="Producción" valor={`${d.enFabricacion} OT`} detalle={`En fabricación · ${d.qcMes} con QC aprobado este mes`} />
        <ErpStatsCard icono={<Package size={18} />} titulo="Stock valorizado" valor={montoCorto(d.valorStock)} detalle={`${d.conStock} producto(s) con stock`} />
        <ErpStatsCard
          icono={<HandCoins size={18} />}
          titulo="Cuentas por cobrar"
          valor={montoCorto(d.cxc)}
          alerta={d.cxcVencidas > 0}
          detalle={d.porCobrar ? `${d.porCobrar} nota(s) de pedido · ${d.cxcVencidas} vencida(s)` : "Sin cobranzas pendientes"}
        />
      </section>

      {/* Últimas OTs */}
      <Panel titulo="Últimas OTs" icono={<ClipboardList size={17} />}>
        <ErpTable head={["OT", "Fecha", "Equipo", "Chasis", "Estado", "Responsable"]} empty={d.ultimasOts.length === 0} vacio="Sin órdenes de trabajo registradas.">
          {d.ultimasOts.map((o) => {
            const e = ESTADO_OT[o.estado] ?? { label: o.estado, tono: "gris" as const };
            return (
              <tr key={o.id}>
                <ErpTd className="font-semibold text-white">{o.id}</ErpTd>
                <ErpTd className="tabular">{fechaPE(o.fecha)}</ErpTd>
                <ErpTd>{[o.tipo_equipo, o.modelo].filter(Boolean).join(" ") || "Sin registro"}</ErpTd>
                <ErpTd>{o.codigo_chasis || "Sin registro"}</ErpTd>
                <ErpTd>
                  <Etiqueta tono={e.tono}>{e.label}</Etiqueta>
                </ErpTd>
                <ErpTd>{o.creado_por || "Sin registro"}</ErpTd>
              </tr>
            );
          })}
        </ErpTable>
      </Panel>

      {/* Alertas críticas */}
      <Panel titulo="Alertas críticas" icono={<AlertTriangle size={17} />}>
        <ErpAlertList items={alertas} vacio="Sin alertas críticas." max={10} />
      </Panel>
    </MarcoPlanta>
  );
}

export default GerenciaDashboard;
