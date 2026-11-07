"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, CandlestickChart, ClipboardList, Factory, HandCoins, Layers, LineChart, Package, ShoppingCart, TrendingUp } from "lucide-react";
import { ErpAlertList, type ErpAlerta } from "@/components/erp/ErpAlertList";
import { ErpTable, ErpTd } from "@/components/erp/ErpTable";
import { Etiqueta, Panel } from "@/components/logistica/piezas";
import { MarcoPlanta, PanelLateral, montoCorto } from "@/components/logistica/planta";
import { CintaCotizaciones, Cotizacion, CurvaAcumulada, Delta, GraficoVelas, ProfundidadFlujo, variacion, type ItemCinta, type Vela } from "./bolsa";
import { cn } from "@/components/ui";
import { useSesion } from "@/lib/auth";
import { useExpedientes } from "@/lib/expedientes";
import { ETAPAS, criticidad, useAhora, useGerencia } from "@/lib/gerencia";
import { useNotificaciones } from "@/lib/notificaciones";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, hoy, r2, soles, useStore } from "@/lib/storage";
import type { ComprobanteVenta, NotaPedido, OrdenCompra, StockItem } from "@/lib/types";
import { npPorCobrar, saldoNP, vencimientoNP } from "@/lib/ventas";

const ESTADO_OT: Record<OrdenProduccion["estado"], { label: string; tono: "verde" | "naranja" | "azul" }> = {
  EN_FABRICACION: { label: "En fabricación", tono: "azul" },
  QC_APROBADO: { label: "QC aprobado", tono: "verde" },
  ANULADA: { label: "Anulada", tono: "naranja" },
};

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];
const DIAS_SEM = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

/** Suma días a una fecha YYYY-MM-DD (calendario puro, sin zona horaria). */
const masDias = (f: string, n: number): string => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasDelMes = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate();
const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const nombreMes = (mes: string) => `${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`;
const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Hora de Lima con segundos y día de la semana, para el reloj de la terminal. */
function relojLima(ms: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  const h = +p.hour % 24;
  // Sesión abierta: lunes a sábado de 8:00 a 18:00 (horario de oficina)
  return {
    hora: `${String(h).padStart(2, "0")}:${p.minute}:${p.second}`,
    dia: DIAS_SEM[dia] ?? "",
    abierta: dia >= 1 && dia <= 6 && h >= 8 && h < 18,
  };
}

/**
 * Dashboard Gerencia estilo terminal bursátil (Wall Street): cinta de cotizaciones en movimiento con los KPIs del
 * ERP, cifras verde/rojo con flecha, velas semanales de ventas y curva acumulada del mes. Mismo marco que los demás
 * módulos (panel derecho con notificaciones, chat y reunión). Solo lectura: no hay botones ni enlaces a los módulos.
 */
export function GerenciaDashboard() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const g = useGerencia();
  const exp = useExpedientes();
  const ahora = useAhora(1000);
  const lotesActivos = exp.expedientes.filter((x) => x.estado === "ABIERTO");
  const avanceLotes = lotesActivos.length ? Math.round(lotesActivos.reduce((a, x) => a + (x.estado_avance || 0), 0) / lotesActivos.length) : 0;
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const hoyStr = hoy();

  const d = useMemo(() => {
    const mes = hoyStr.slice(0, 7);
    const mesAnt = mesAnterior(mes);
    const diaHoy = +hoyStr.slice(8, 10);
    const ayer = masDias(hoyStr, -1);

    // Ventas por día (comprobantes emitidos) y compras por día (OC emitidas)
    const ventasDia = new Map<string, number>();
    const comprobDia = new Map<string, number>();
    for (const c of comprobantes) {
      if (c.estado !== "EMITIDO" || !c.fecha) continue;
      const f = c.fecha.slice(0, 10);
      ventasDia.set(f, (ventasDia.get(f) || 0) + (c.total || 0));
      comprobDia.set(f, (comprobDia.get(f) || 0) + 1);
    }
    const comprasDia = new Map<string, number>();
    for (const o of ordenes) {
      if (!o.fecha) continue;
      const f = o.fecha.slice(0, 10);
      comprasDia.set(f, (comprasDia.get(f) || 0) + (o.total || 0));
    }
    const suma = (m: Map<string, number>, pref: string, hastaDia = 31) => r2(Array.from(m.entries()).reduce((a, [f, v]) => (f.startsWith(pref) && +f.slice(8, 10) <= hastaDia ? a + v : a), 0));
    const ultimos = (m: Map<string, number>, n: number) => Array.from({ length: n }, (_, i) => r2(m.get(masDias(hoyStr, i - n + 1)) || 0));

    const ventasMes = suma(ventasDia, mes);
    const ventasMesAntMismoTramo = suma(ventasDia, mesAnt, diaHoy);
    const comprasMes = suma(comprasDia, mes);
    const comprasMesAntMismoTramo = suma(comprasDia, mesAnt, diaHoy);
    const factHoy = r2(ventasDia.get(hoyStr) || 0);
    const factAyer = r2(ventasDia.get(ayer) || 0);
    const emitidosMes = Array.from(comprobDia.entries()).reduce((a, [f, n]) => (f.startsWith(mes) ? a + n : a), 0);

    // Curva acumulada día a día: mes actual vs mes anterior completo
    const acumulada = (pref: string, dias: number) => {
      let a = 0;
      return Array.from({ length: dias }, (_, i) => (a = r2(a + (ventasDia.get(`${pref}-${String(i + 1).padStart(2, "0")}`) || 0))));
    };
    const curvaActual = acumulada(mes, diasDelMes(mes));
    const curvaAnterior = acumulada(mesAnt, diasDelMes(mesAnt));

    // Velas: 12 semanas (lunes a domingo); apertura = ventas del 1.er día, cierre = del último día transcurrido
    const dow = (new Date(`${hoyStr}T12:00:00Z`).getUTCDay() + 6) % 7;
    const lunes = masDias(hoyStr, -dow);
    const velas: Vela[] = Array.from({ length: 12 }, (_, k) => {
      const ini = masDias(lunes, -7 * (11 - k));
      const dias = Array.from({ length: 7 }, (_, i) => masDias(ini, i)).filter((f) => f <= hoyStr);
      const vals = dias.map((f) => r2(ventasDia.get(f) || 0));
      return {
        etiqueta: fechaCorta(ini),
        rango: `${fechaCorta(ini)} – ${fechaCorta(dias[dias.length - 1] ?? ini)}`,
        apertura: vals[0] ?? 0,
        cierre: vals[vals.length - 1] ?? 0,
        maximo: Math.max(0, ...vals),
        minimo: Math.min(...vals, Infinity) === Infinity ? 0 : Math.min(...vals),
        volumen: dias.reduce((a, f) => a + (comprobDia.get(f) || 0), 0),
        total: r2(vals.reduce((a, v) => a + v, 0)),
      };
    });

    const enFabricacion = ops.filter((o) => o.estado === "EN_FABRICACION").length;
    const qcMes = ops.filter((o) => o.estado === "QC_APROBADO" && (o.qc?.fecha || o.fecha).startsWith(mes)).length;
    const qcMesAnt = ops.filter((o) => o.estado === "QC_APROBADO" && (o.qc?.fecha || o.fecha).startsWith(mesAnt) && +(o.qc?.fecha || o.fecha).slice(8, 10) <= diaHoy).length;
    const valorStock = r2(stock.reduce((a, s) => a + s.cantidad * (s.costoUnit || 0), 0));
    const conStock = stock.filter((s) => s.cantidad > 0).length;
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    const cxc = r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0));
    const vencidas = porCobrar.filter((n) => vencimientoNP(n) < hoyStr);
    const cxcVencida = r2(vencidas.reduce((a, n) => a + saldoNP(n), 0));
    const ultimasOts = [...ops].sort((a, b) => (b.creado || b.fecha).localeCompare(a.creado || a.fecha)).slice(0, 10);
    return {
      mes,
      mesAnt,
      diaHoy,
      ventasMes,
      ventasMesAntMismoTramo,
      comprasMes,
      comprasMesAntMismoTramo,
      factHoy,
      factAyer,
      emitidosMes,
      curvaActual,
      curvaAnterior,
      velas,
      sparkVentas: ultimos(ventasDia, 30),
      sparkCompras: ultimos(comprasDia, 30),
      enFabricacion,
      qcMes,
      qcMesAnt,
      valorStock,
      conStock,
      cxc,
      porCobrar: porCobrar.length,
      cxcVencidas: vencidas.length,
      cxcVencida,
      ultimasOts,
    };
  }, [comprobantes, ordenes, ops, stock, notas, hoyStr]);

  const pctVentas = variacion(d.ventasMes, d.ventasMesAntMismoTramo);
  const pctCompras = variacion(d.comprasMes, d.comprasMesAntMismoTramo);
  const pctHoy = variacion(d.factHoy, d.factAyer);
  const pctQc = variacion(d.qcMes, d.qcMesAnt);
  const cxpVencida = r2(g.cxpVencidas.reduce((a, f) => a + (f.netoPagar ?? f.total ?? 0), 0));

  // Cinta: solo cifras reales; la variación aparece cuando hay con qué comparar (ayer o el mismo tramo del mes anterior)
  const cinta: ItemCinta[] = [
    { simbolo: "VTAS.MES", valor: montoCorto(d.ventasMes), pct: pctVentas },
    { simbolo: "FACT.HOY", valor: montoCorto(d.factHoy), pct: pctHoy },
    {
      simbolo: "COMPRAS.MES",
      valor: montoCorto(d.comprasMes),
      pct: pctCompras,
    },
    { simbolo: "CXC", valor: montoCorto(d.cxc) },
    {
      simbolo: "CXC.VENC",
      valor: montoCorto(d.cxcVencida),
      alerta: d.cxcVencida > 0,
    },
    {
      simbolo: "CXP.VENC",
      valor: montoCorto(cxpVencida),
      alerta: cxpVencida > 0,
    },
    { simbolo: "STOCK.VAL", valor: montoCorto(d.valorStock) },
    {
      simbolo: "STOCK.CRIT",
      valor: `${g.stockCritico.length} ítems`,
      alerta: g.stockCritico.length > 0,
    },
    {
      simbolo: "OC.ACT",
      valor: `${g.ticker.ocActivas} · ${montoCorto(g.ticker.comprasActivas)}`,
    },
    { simbolo: "OT.FAB", valor: `${d.enFabricacion}` },
    { simbolo: "QC.MES", valor: `${d.qcMes}`, pct: pctQc },
    { simbolo: "LOTES.26W", valor: `${lotesActivos.length} · ${avanceLotes}%` },
    { simbolo: "TRANSITO", valor: `${g.ticker.enTransito}` },
    { simbolo: "PT.DISP", valor: `${g.ticker.ptDisponible}` },
  ];

  const profundidad = ETAPAS.map((e) => ({
    etiqueta: e.label,
    modulo: e.modulo,
    n: g.porEtapa[e.id],
    tono: criticidad(g.porEtapa[e.id]),
  }));
  const totalFlujo = profundidad.reduce((a, f) => a + f.n, 0);

  // Noticias (alertas críticas): stock crítico, facturas de proveedor vencidas y cobranzas vencidas (sin enlaces)
  const alertas: ErpAlerta[] = useMemo(
    () => [
      ...g.stockCritico.map((s) => ({
        clave: `st:${s.id}`,
        titulo: `Stock crítico · ${s.nombre}`,
        detalle: s.sede,
        icono: <AlertTriangle size={15} />,
        derecha: <Etiqueta>{`${s.cantidad} ${s.unidad}`}</Etiqueta>,
      })),
      ...g.cxpVencidas.map((f) => ({
        clave: `cxp:${f.id}`,
        titulo: `Factura vencida ${f.numero} · ${f.proveedor}`,
        detalle: `Venció ${fechaPE(f.fechaVencimiento)}`,
        icono: <AlertTriangle size={15} />,
        derecha: <Etiqueta>{soles(f.netoPagar ?? f.total)}</Etiqueta>,
      })),
      ...g.cxcVencidas.map((n) => ({
        clave: `cxc:${n.id}`,
        titulo: `Cobranza vencida ${n.numero} · ${n.cliente}`,
        detalle: "Nota de pedido por cobrar",
        icono: <AlertTriangle size={15} />,
        derecha: <Etiqueta>{soles(saldoNP(n))}</Etiqueta>,
      })),
    ],
    [g.stockCritico, g.cxpVencidas, g.cxcVencidas],
  );
  // Recordatorios del panel derecho sin enlace: Gerencia no entra a los módulos
  const recordatorios = g.recordatorios.map((p) => ({
    clave: p.clave,
    titulo: p.titulo,
    detalle: p.detalle,
    href: "",
  }));
  const reloj = relojLima(ahora);

  return (
    <div className="tema-bolsa">
      <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Gerencia" notifs={notifs} recordatorios={recordatorios} />}>
        {/* Cabecera de terminal: nombre, índice principal y reloj con sesión abierta/cerrada */}
        <header className="rounded-xl border border-white/[0.08] bg-black/70 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-[#facc15] text-[#facc15]">
                <Activity size={26} />
              </span>
              <div>
                <h1 className="mono text-2xl font-bold uppercase leading-tight tracking-wider text-white lg:text-3xl">
                  GERENCIA <span className="text-[#facc15]">TERMINAL</span>
                </h1>
                <p className="mono text-[11px] uppercase tracking-widest text-[#9ca3af]">COMBOY VID · Arequipa · solo lectura · PEN</p>
              </div>
            </div>
            <div className="mono text-right">
              <p className="text-[11px] uppercase tracking-widest text-[#9ca3af]">Índice ventas · {nombreMes(d.mes)}</p>
              <p className="flex items-baseline justify-end gap-3">
                <span className="text-[28px] font-bold leading-none tabular-nums text-white">{montoCorto(d.ventasMes)}</span>
                <Delta pct={pctVentas} className="text-[15px]" />
              </p>
            </div>
            <div className="mono flex items-center gap-3 text-[12px]">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded border px-2 py-1 font-bold uppercase tracking-wider",
                  reloj.abierta ? "border-[#00d97e]/50 text-[#00d97e]" : "border-[#ff3b5c]/50 text-[#ff3b5c]",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", reloj.abierta ? "bg-[#00d97e] punto-vivo" : "bg-[#ff3b5c]")} />
                {reloj.abierta ? "Sesión abierta" : "Sesión cerrada"}
              </span>
              <span className="tabular-nums text-white" suppressHydrationWarning>
                {reloj.dia} {reloj.hora} <span className="text-[#9ca3af]">LIMA</span>
              </span>
            </div>
          </div>
        </header>

        <CintaCotizaciones items={cinta} />

        {/* Cotizaciones: cada KPI como un valor de bolsa (variación contra el mismo tramo del mes anterior o contra ayer) */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Cotizacion
            icono={<TrendingUp size={13} />}
            simbolo="VTAS.MES"
            nombre="Ventas del mes"
            valor={montoCorto(d.ventasMes)}
            pct={pctVentas}
            serie={d.sparkVentas}
            detalle={`${d.emitidosMes} comprob. · vs ${montoCorto(d.ventasMesAntMismoTramo)} al día ${d.diaHoy} de ${nombreMes(d.mesAnt)}`}
          />
          <Cotizacion
            icono={<ShoppingCart size={13} />}
            simbolo="COMPRAS.MES"
            nombre="Compras del mes (OC)"
            valor={montoCorto(d.comprasMes)}
            pct={pctCompras}
            serie={d.sparkCompras}
            detalle={`${g.ticker.ocActivas} OC activas por ${montoCorto(g.ticker.comprasActivas)} · vs ${montoCorto(d.comprasMesAntMismoTramo)} mes anterior`}
          />
          <Cotizacion
            icono={<HandCoins size={13} />}
            simbolo="CXC"
            nombre="Cuentas por cobrar"
            valor={montoCorto(d.cxc)}
            alerta={d.cxcVencidas > 0}
            detalle={d.porCobrar ? `${d.porCobrar} NP · ${d.cxcVencidas} vencida(s) por ${montoCorto(d.cxcVencida)}` : "Sin cobranzas pendientes"}
          />
          <Cotizacion
            icono={<Package size={13} />}
            simbolo="STOCK.VAL"
            nombre="Stock valorizado"
            valor={montoCorto(d.valorStock)}
            alerta={g.stockCritico.length > 0}
            detalle={`${d.conStock} producto(s) con stock · ${g.stockCritico.length} crítico(s)`}
          />
          <Cotizacion icono={<Factory size={13} />} simbolo="OT.FAB" nombre="Producción" valor={`${d.enFabricacion} OT`} pct={pctQc} detalle={`En fabricación · ${d.qcMes} QC aprobado(s) este mes`} />
          <Cotizacion
            icono={<Layers size={13} />}
            simbolo="LOTES.26W"
            nombre="Lotes activos"
            valor={`${lotesActivos.length} lote(s)`}
            detalle={exp.faltaTabla ? "Expedientes 26W sin instalar" : `${avanceLotes}% de avance promedio`}
          />
        </section>

        <Panel
          titulo="Velas semanales · ventas diarias"
          icono={<CandlestickChart size={17} />}
          accion={<span className="mono text-[11px] text-[#9ca3af]">12 semanas · verde: cerró arriba de la apertura</span>}
        >
          <GraficoVelas velas={d.velas} />
        </Panel>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel titulo="Ventas acumuladas del mes" icono={<LineChart size={17} />}>
            <CurvaAcumulada actual={d.curvaActual} anterior={d.curvaAnterior} diaHoy={d.diaHoy} nombreActual={nombreMes(d.mes)} nombreAnterior={nombreMes(d.mesAnt)} />
          </Panel>
          <Panel titulo="Profundidad del flujo" icono={<Activity size={17} />} accion={<span className="mono text-[11px] text-[#9ca3af]">{totalFlujo} doc. en curso</span>}>
            <ProfundidadFlujo filas={profundidad} />
          </Panel>
        </div>

        {/* Últimas OTs como tabla de operaciones */}
        <Panel titulo="Últimas OTs" icono={<ClipboardList size={17} />}>
          <ErpTable head={["OT", "Fecha", "Equipo", "Chasis", "Estado", "Responsable"]} empty={d.ultimasOts.length === 0} vacio="Sin órdenes de trabajo registradas.">
            {d.ultimasOts.map((o) => {
              const e = ESTADO_OT[o.estado] ?? {
                label: o.estado,
                tono: "gris" as const,
              };
              return (
                <tr key={o.id}>
                  <ErpTd className="mono font-semibold text-[#facc15]">{o.id}</ErpTd>
                  <ErpTd className="mono tabular">{fechaPE(o.fecha)}</ErpTd>
                  <ErpTd>{[o.tipo_equipo, o.modelo].filter(Boolean).join(" ") || "Sin registro"}</ErpTd>
                  <ErpTd className="mono">{o.codigo_chasis || "Sin registro"}</ErpTd>
                  <ErpTd>
                    <Etiqueta tono={e.tono}>{e.label}</Etiqueta>
                  </ErpTd>
                  <ErpTd>{o.creado_por || "Sin registro"}</ErpTd>
                </tr>
              );
            })}
          </ErpTable>
        </Panel>

        {/* Alertas críticas como cable de noticias */}
        <Panel titulo="Alertas críticas · cable de noticias" icono={<AlertTriangle size={17} />}>
          <ErpAlertList items={alertas} vacio="Sin alertas críticas." max={10} />
        </Panel>
      </MarcoPlanta>
    </div>
  );
}

export default GerenciaDashboard;
