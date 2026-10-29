"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRight, Banknote, Calculator, CheckCircle2, CircleDollarSign, Download, FileText, HandCoins, Landmark, Receipt, TrendingUp, Upload, Wallet } from "lucide-react";
import { puedeVer, useSesion } from "@/lib/auth";
import { listarCajas, type Caja } from "@/lib/cajas";
import { consumosDeChasis } from "@/lib/inventario";
import { abrirPestana } from "@/lib/logistica";
import { useNotificaciones } from "@/lib/notificaciones";
import { permisosPlanta } from "@/lib/permisosPlanta";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, fechaPE, hoy, r2, soles, useStore, useTrabajadores } from "@/lib/storage";
import type { ComprobanteVenta, Factura, NotaPedido, OrdenCompra, OrdenDespacho, StockItem, ValeProduccion } from "@/lib/types";
import { npPorCobrar, saldoNP, vencimientoNP } from "@/lib/ventas";
import { ErpTable, ErpTd } from "@/components/erp/ErpTable";
import { BotonAccion, BotonVer, Etiqueta, Panel, SinRegistro } from "./piezas";
import { BarraAcciones, BarraModulos, EncabezadoPlanta, Filas, MarcoPlanta, PanelLateral, horaActual, montoCorto } from "./planta";

/** Tarjeta KPI del diseño de Finanzas: icono a la izquierda, título, monto y detalle en verde/naranja. */
function KpiFinanzas({ icono, titulo, valor, detalle, href, alerta }: { icono: React.ReactNode; titulo: string; valor: string; detalle: string; href: string; alerta?: boolean }) {
  return (
    <button type="button" onClick={() => abrirPestana(href)} className="flex items-center gap-3 rounded-xl border border-[#2a2a2a] bg-[#141414] px-4 py-4 text-left transition hover:border-[#ff6b00]">
      <span className="shrink-0 text-[#ff6b00]">{icono}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-white">{titulo}</span>
        <span className="block text-2xl font-bold text-white">{valor}</span>
        <span className={`block truncate text-[12px] font-semibold ${alerta ? "text-[#ff8a3d]" : "text-[#4ade80]"}`}>{detalle}</span>
      </span>
    </button>
  );
}

/** Libros y registros contables (botones del diseño). */
const LIBROS = [
  { label: "Libro Mayor", href: "/dashboard/contable?tab=mayor" },
  { label: "Libro Diario", href: "/dashboard/contable?tab=diario" },
  { label: "Registro Compras", href: "/dashboard/compras?tab=facturas" },
  { label: "Registro Ventas", href: "/dashboard/ventas?tab=comprobantes" },
  { label: "Libro Caja", href: "/dashboard/contable?tab=estados" },
  { label: "Balance Cuentas", href: "/dashboard/contable?tab=balance" },
  { label: "Estados Financieros", href: "/dashboard/contable?tab=eeff" },
];

/** Finanzas Planta (diseño 4 de Williams): Tesorería, bancarización, planilla, pagos, costeo, libros y facturación. Solo lectura. */
export function FinanzasHome() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const permisos = permisosPlanta(sesion);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const trabajadores = useTrabajadores();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [sync, setSync] = useState("");

  useEffect(() => {
    void listarCajas().then(setCajas);
  }, []);

  const d = useMemo(() => {
    const hoyStr = hoy();
    const mes = hoyStr.slice(0, 7);
    const porPagar = facturas.filter((f) => f.estadoPago === "POR_PAGAR").sort((a, b) => (a.fechaVencimiento || a.fecha).localeCompare(b.fechaVencimiento || b.fecha));
    const cxp = r2(porPagar.reduce((a, f) => a + (f.netoPagar ?? f.total), 0));
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    const cxc = r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0));
    const cxcVencidas = porCobrar.filter((n) => vencimientoNP(n) < hoyStr).length;
    const emitidosMes = comprobantes.filter((c) => c.estado === "EMITIDO" && c.fecha.startsWith(mes));
    const recibidasMes = facturas.filter((f) => f.fecha.startsWith(mes));
    const igvVentas = r2(emitidosMes.reduce((a, c) => a + (c.igv || 0), 0));
    const igvCompras = r2(recibidasMes.reduce((a, f) => a + (f.igv || 0), 0));
    // Utilidad estimada del mes: ventas sin IGV − compras sin IGV (no incluye planilla ni gastos)
    const utilidad = r2(emitidosMes.reduce((a, c) => a + (c.base || 0), 0) - recibidasMes.reduce((a, f) => a + (f.subtotal || 0), 0));
    const ocPorPagar = ordenes.filter((o) => o.estado === "EMITIDA");
    const bancarizadasMes = ordenes.filter((o) => o.estado === "BANCARIZADA" && o.fecha.startsWith(mes)).length;
    const fletesMes = ods.filter((o) => o.lugar === "ENVIO_AGENCIA" && (o.costoEnvio ?? 0) > 0 && o.fecha.startsWith(mes));
    const totalFletes = r2(fletesMes.reduce((a, o) => a + (o.costoEnvio ?? 0), 0));
    const ultimosEmitidos = [...comprobantes.filter((c) => c.estado === "EMITIDO")].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero)).slice(0, 4);
    const ultimasRecibidas = [...facturas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4);
    // Costeo: costo de MP de las últimas OP (vales del chasis × último costo del almacén)
    const costoDe = new Map(stock.map((s) => [s.id, s.costoUnit || 0]));
    const costeo = [...ops]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 4)
      .map((o) => ({ o, costo: r2(consumosDeChasis(o.codigo_chasis, o.id, vales).reduce((a, v) => a + v.cantidad * (costoDe.get(v.stock_id) ?? 0), 0)) }));
    const compras = [
      ...ordenes.map((o) => ({ clave: `oc:${o.id}`, fecha: o.fecha, proveedor: o.proveedor, doc: `${o.numero}${o.reqNumero ? ` · ${o.reqNumero}` : ""}`, total: o.total, href: "/dashboard/compras?tab=ordenes" })),
      ...facturas.map((f) => ({ clave: `f:${f.id}`, fecha: f.fecha, proveedor: f.proveedor, doc: `Factura ${f.numero}${f.ocNumero ? ` · ${f.ocNumero}` : ""}`, total: f.netoPagar ?? f.total, href: "/dashboard/compras?tab=facturas" })),
    ]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 8);
    return { porPagar, cxp, porCobrar, cxc, cxcVencidas, igvVentas, igvCompras, utilidad, ocPorPagar, bancarizadasMes, fletesMes, totalFletes, ultimosEmitidos, ultimasRecibidas, costeo, compras };
  }, [facturas, ordenes, notas, comprobantes, ods, ops, vales, stock]);

  useEffect(() => setSync(horaActual()), [d]);

  const igvPagar = r2(d.igvVentas - d.igvCompras);
  const saldoCajas = r2(cajas.reduce((a, c) => a + (c.saldo_actual || 0), 0));
  const activos = trabajadores.filter((t) => t.activo && !t.esContratista);
  const obreros = activos.filter((t) => t.tipoSueldo !== "MENSUAL").length;
  const empleados = activos.filter((t) => t.tipoSueldo === "MENSUAL").length;
  const libros = LIBROS.filter((l) => !sesion || puedeVer(sesion, l.href.split("?")[0]));

  const recordatorios = [
    ...d.ocPorPagar.map((o) => ({ clave: `oc:${o.id}`, titulo: `Pagar ${o.proveedor} · ${o.numero}`, detalle: `${soles(o.total)} · OC emitida, falta bancarizar / pagar`, href: "/dashboard/compras?tab=ordenes" })),
    ...d.porPagar.slice(0, 5).map((f) => ({ clave: `f:${f.id}`, titulo: `Factura ${f.numero} · ${f.proveedor}`, detalle: f.fechaVencimiento ? `Vence ${fechaPE(f.fechaVencimiento)}` : "Por pagar", href: "/dashboard/compras?tab=facturas" })),
  ];

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Finanzas" notifs={notifs} recordatorios={recordatorios} />}>
      <EncabezadoPlanta
        icono={<CircleDollarSign size={30} />}
        titulo="Comboy Vid Finanzas Planta"
        subtitulo={`Tesorería · Pagos · Planilla · Facturación · Contabilidad · Actualizado: Hoy ${sync}`}
        accion={
          <div className="flex gap-2">
            <BotonAccion href="/dashboard/compras" lleno>
              Tesorería
            </BotonAccion>
            <BotonAccion href="/dashboard/contable">Contabilidad Completa</BotonAccion>
          </div>
        }
      />

      <div id="cuentas" className="grid scroll-mt-24 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiFinanzas icono={<Wallet size={34} />} titulo="Flujo Caja" valor={montoCorto(saldoCajas)} detalle={`${cajas.length} caja(s) · saldo actual`} href="/dashboard/compras?tab=registrar" />
        <KpiFinanzas icono={<HandCoins size={34} />} titulo="CxC" valor={montoCorto(d.cxc)} detalle={`Pendientes ${d.porCobrar.length}${d.cxcVencidas ? ` · ${d.cxcVencidas} vencidas` : ""}`} href="/dashboard/ventas?tab=cobrar" />
        <KpiFinanzas icono={<Banknote size={34} />} titulo="CxP" valor={montoCorto(d.cxp)} detalle={`Pendientes ${d.porPagar.length}`} href="/dashboard/compras?tab=facturas" />
        <KpiFinanzas icono={<Receipt size={34} />} titulo="IGV a Pagar" valor={montoCorto(igvPagar)} detalle="Vence según cronograma SUNAT" href="/dashboard/contable" alerta />
        <KpiFinanzas icono={<TrendingUp size={34} />} titulo="Utilidad Mes" valor={montoCorto(d.utilidad)} detalle="Estimada: ventas − compras" href="/dashboard/contable?tab=eeff" alerta={d.utilidad < 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <Panel titulo="Bancarización" icono={<Landmark size={17} />}>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-white">
              <FileText size={16} className="text-[#ff6b00]" /> Vouchers del mes: {d.bancarizadasMes} OC bancarizada(s)
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <BotonAccion href="/dashboard/compras?tab=ordenes" icono={<Upload size={15} />}>
                Subir Bancarización
              </BotonAccion>
              <Etiqueta tono={d.ocPorPagar.length ? "naranja" : "verde"}>{d.ocPorPagar.length ? `${d.ocPorPagar.length} OC por bancarizar` : "Todo bancarizado"}</Etiqueta>
            </div>
          </Panel>

          <Panel titulo="Pago proveedores" icono={<Banknote size={17} />}>
            <Filas
              max={4}
              vacio="No hay OC ni facturas por pagar."
              items={[
                ...d.ocPorPagar.map((o) => ({ clave: o.id, titulo: `Pagar ${o.proveedor} · ${o.numero}`, derecha: <Etiqueta>{soles(o.total)}</Etiqueta>, href: "/dashboard/compras?tab=ordenes" })),
                ...d.porPagar.map((f) => ({ clave: f.id, titulo: `${f.proveedor} · ${f.numero}`, detalle: f.fechaVencimiento ? `Vence ${fechaPE(f.fechaVencimiento)}` : undefined, derecha: <Etiqueta>{soles(f.netoPagar ?? f.total)}</Etiqueta>, href: "/dashboard/compras?tab=facturas" })),
              ]}
            />
            <div id="fletes" className="mt-2 flex scroll-mt-24 items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1c1c1c] px-3 py-2">
              <span className="text-[13px] font-semibold text-white">Liquidar Flete Marvisur · Grael · Shalom ({d.fletesMes.length})</span>
              <span className="flex items-center gap-2">
                <span className="font-bold text-white">{soles(d.totalFletes)}</span>
                <BotonAccion href="/logistica/cotizar-flete" lleno>
                  Liquidar
                </BotonAccion>
              </span>
            </div>
          </Panel>

          <Panel titulo="Costeo y rentabilidad" icono={<Calculator size={17} />}>
            <Filas
              max={4}
              vacio="Sin órdenes de producción."
              items={d.costeo.map(({ o, costo }) => ({ clave: o.id, titulo: `Costo ${o.tipo_equipo} ${o.modelo}`, detalle: `${o.id} · material (MP)`, derecha: <Etiqueta>{soles(costo)}</Etiqueta>, href: "/dashboard/produccion" }))}
            />
            <SinRegistro>Plasma, torno, soldadura y margen por equipo: sin registro (el ERP aún no guarda horas ni precio de venta por chasis).</SinRegistro>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel titulo="Pago planilla · AUTO" icono={<Banknote size={17} />}>
            <ol className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white">
              {["Subir Asistencia", "Sistema Calcula Automático", "Planilla Lista / Pagar"].map((p, i) => (
                <Fragment key={p}>
                  {i > 0 && <ArrowRight size={16} className="text-[#ff6b00]" aria-hidden />}
                  <li className="flex items-center gap-2 rounded-full border border-[#2a2a2a] bg-[#1c1c1c] px-3 py-1">
                    {i < 2 ? <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#ff6b00] text-[12px] text-[#ff6b00]">{i + 1}</span> : <CheckCircle2 size={20} className="text-[#ff6b00]" />}
                    {p}
                  </li>
                </Fragment>
              ))}
            </ol>
            <p className="mt-3 text-[14px] font-bold uppercase text-white">Importar asistencia</p>
            <p className="text-[13px] text-[#d4d4d8]">Subir reporte de control de asistencia: el sistema calcula horas extra, tardanzas y faltas.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <BotonAccion href="/dashboard/compras?tab=planilla" lleno icono={<Upload size={15} />}>
                Subir Reporte Asistencia
              </BotonAccion>
              <BotonAccion href="/dashboard/compras?tab=planilla" icono={<Download size={15} />}>
                Plantilla Excel/CSV
              </BotonAccion>
              <BotonAccion href="/dashboard/compras?tab=planilla" icono={<FileText size={15} />}>
                Generar Boletas de Pago
              </BotonAccion>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-[#2a2a2a] bg-[#1c1c1c] p-3">
              <div>
                <p className="text-[14px] font-bold text-white">Obreros</p>
                <p className="text-[12px] text-[#a1a1aa]">Pago diario, semanal, quincenal o por hora</p>
                <p className="text-2xl font-bold text-[#ff6b00]">{obreros}</p>
              </div>
              <div>
                <p className="text-[14px] font-bold text-white">Empleados admin</p>
                <p className="text-[12px] text-[#a1a1aa]">Sueldo mensual</p>
                <p className="text-2xl font-bold text-white">{empleados}</p>
              </div>
            </div>
          </Panel>

          <Panel titulo="Libros y balance" icono={<FileText size={17} />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {libros.map((l) => (
                <BotonAccion key={l.label} href={l.href}>
                  {l.label}
                </BotonAccion>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] text-[#d4d4d8]">Balance General: Activo · Pasivo · Patrimonio · Estado de Ganancias y Pérdidas</span>
              <BotonAccion href="/dashboard/contable?tab=balance" lleno>
                Generar Balance
              </BotonAccion>
            </div>
          </Panel>

          <Panel id="facturacion" titulo={permisos.canEmitFactura ? "Facturación" : "Facturación · solo lectura"} icono={<Receipt size={17} />} className="scroll-mt-24">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[13px] font-bold text-white">Facturas emitidas</p>
                <Filas max={4} vacio="Aún no hay comprobantes emitidos." items={d.ultimosEmitidos.map((c) => ({ clave: c.id, titulo: `${c.numero} · ${c.cliente}`, derecha: <Etiqueta tono="verde">{soles(c.total)}</Etiqueta>, href: "/dashboard/ventas?tab=comprobantes" }))} />
              </div>
              <div>
                <p className="mb-1 text-[13px] font-bold text-white">Facturas recibidas</p>
                <Filas max={4} vacio="Aún no hay facturas de proveedores." items={d.ultimasRecibidas.map((f) => ({ clave: f.id, titulo: `${f.numero} · ${f.proveedor}`, derecha: <Etiqueta tono={f.estadoPago === "PAGADA" ? "verde" : "naranja"}>{f.estadoPago === "PAGADA" ? "Pagada" : "Por pagar"}</Etiqueta>, href: "/dashboard/compras?tab=facturas" }))} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[#2a2a2a] bg-[#1c1c1c] p-3">
              <div>
                <p className="text-[12px] font-semibold text-[#a1a1aa]">IGV Ventas</p>
                <p className="text-xl font-bold text-[#4ade80]">{soles(d.igvVentas)}</p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#a1a1aa]">IGV Compras</p>
                <p className="text-xl font-bold text-[#60a5fa]">{soles(d.igvCompras)}</p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[#a1a1aa]">IGV a Pagar</p>
                <p className="text-xl font-bold text-[#ff8a3d]">{soles(igvPagar)}</p>
              </div>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-white">PDT 621</span>
                <BotonAccion href="/dashboard/contable" lleno>
                  Generar PDT
                </BotonAccion>
              </span>
            </div>
          </Panel>
        </div>
      </div>

      <BarraAcciones
        acciones={[
          { label: "Pagar Planilla", href: "/dashboard/compras?tab=planilla", tono: "lleno" },
          { label: "Pagar Proveedor", href: "/dashboard/compras?tab=facturas" },
          { label: "Liquidar Flete", href: "/logistica/cotizar-flete" },
          { label: "Subir Voucher", href: "/dashboard/compras?tab=ordenes" },
          { label: "Generar PDT", href: "/dashboard/contable" },
          { label: "Generar Balance", href: "/dashboard/contable?tab=balance" },
          { label: "Subir Asistencia", href: "/dashboard/compras?tab=planilla" },
        ]}
      />

      <Panel titulo="Tesorería / Compras" icono={<Wallet size={17} />} accion={<BotonVer href="/dashboard/compras?tab=ordenes">Ver todo</BotonVer>}>
        <ErpTable head={["Fecha", "Proveedor", "Doc. referencia", "Total", "Acciones"]} empty={d.compras.length === 0} vacio="Aún no hay compras registradas.">
          {d.compras.map((c) => (
            <tr key={c.clave}>
              <ErpTd>{fechaPE(c.fecha)}</ErpTd>
              <ErpTd className="font-semibold text-white">{c.proveedor}</ErpTd>
              <ErpTd>{c.doc}</ErpTd>
              <ErpTd className="text-right font-semibold text-[#ffb27a]">{soles(c.total)}</ErpTd>
              <ErpTd>
                <BotonVer href={c.href}>Ver</BotonVer>
              </ErpTd>
            </tr>
          ))}
        </ErpTable>
      </Panel>

      <BarraModulos sesion={sesion} actual="finanzas" />
    </MarcoPlanta>
  );
}

export default FinanzasHome;
