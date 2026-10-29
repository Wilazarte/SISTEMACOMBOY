"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, BookOpen, CircleDollarSign, FileText, HandCoins, Landmark, Receipt, Users, Wallet } from "lucide-react";
import { useSesion } from "@/lib/auth";
import { listarCajas, type Caja } from "@/lib/cajas";
import { useNotificaciones } from "@/lib/notificaciones";
import { permisosPlanta } from "@/lib/permisosPlanta";
import { KEYS, fechaPE, hoy, r2, soles, useStore } from "@/lib/storage";
import type { ComprobanteVenta, Factura, NotaPedido, OrdenCompra, OrdenDespacho } from "@/lib/types";
import { npPorCobrar, saldoNP, vencimientoNP } from "@/lib/ventas";
import { BotonAccion, Etiqueta, Kpi, Panel } from "./piezas";
import { EncabezadoPlanta, Filas, MarcoPlanta, PanelLateral, horaActual, montoCorto } from "./planta";
import { AccesosRapidos } from "./AccesosRapidos";

/** Home de Finanzas de la planta: Tesorería, CxC, CxP, IGV del mes y facturación. Solo lectura. */
export function FinanzasHome() {
  const { sesion } = useSesion();
  const notifs = useNotificaciones(sesion);
  const permisos = permisosPlanta(sesion);
  const facturas = useStore<Factura[]>(KEYS.FACTURAS, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
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
    const cxpVencidas = porPagar.filter((f) => f.fechaVencimiento && f.fechaVencimiento.slice(0, 10) < hoyStr).length;
    const porCobrar = notas.filter((n) => npPorCobrar(n) && saldoNP(n) > 0);
    const cxc = r2(porCobrar.reduce((a, n) => a + saldoNP(n), 0));
    const cxcVencidas = porCobrar.filter((n) => vencimientoNP(n) < hoyStr).length;
    const emitidosMes = comprobantes.filter((c) => c.estado === "EMITIDO" && c.fecha.startsWith(mes));
    const igvVentas = r2(emitidosMes.reduce((a, c) => a + (c.igv || 0), 0));
    const igvCompras = r2(facturas.filter((f) => f.fecha.startsWith(mes)).reduce((a, f) => a + (f.igv || 0), 0));
    const ocPorPagar = ordenes.filter((o) => o.estado === "EMITIDA");
    const fletesMes = ods.filter((o) => o.lugar === "ENVIO_AGENCIA" && (o.costoEnvio ?? 0) > 0 && o.fecha.startsWith(mes));
    const ultimosEmitidos = [...comprobantes.filter((c) => c.estado === "EMITIDO")].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero)).slice(0, 5);
    const ultimasRecibidas = [...facturas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
    return { porPagar, cxp, cxpVencidas, porCobrar, cxc, cxcVencidas, igvVentas, igvCompras, ocPorPagar, fletesMes, ultimosEmitidos, ultimasRecibidas, mes };
  }, [facturas, ordenes, notas, comprobantes, ods]);

  useEffect(() => setSync(horaActual()), [d]);

  const igvPagar = r2(d.igvVentas - d.igvCompras);
  const saldoCajas = r2(cajas.reduce((a, c) => a + (c.saldo_actual || 0), 0));
  const nombreMes = new Date(`${d.mes}-15T12:00:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric" });

  const recordatorios = [
    ...d.ocPorPagar.map((o) => ({ clave: `oc:${o.id}`, titulo: `Pagar ${o.proveedor} · ${o.numero}`, detalle: `${soles(o.total)} · OC emitida, falta bancarizar / pagar`, href: "/dashboard/compras?tab=ordenes" })),
    ...d.porPagar.slice(0, 5).map((f) => ({ clave: `f:${f.id}`, titulo: `Factura ${f.numero} · ${f.proveedor}`, detalle: f.fechaVencimiento ? `Vence ${fechaPE(f.fechaVencimiento)}` : "Por pagar", href: "/dashboard/compras?tab=facturas" })),
  ];

  return (
    <MarcoPlanta lateral={<PanelLateral sesion={sesion} modulo="Finanzas" notifs={notifs} recordatorios={recordatorios} />}>
      <EncabezadoPlanta
        icono={<CircleDollarSign size={30} />}
        titulo="Comboy Vid Finanzas Planta"
        subtitulo="Tesorería · Pagos · Planilla · Facturación · Contabilidad · Arequipa · Perú"
        accion={<span className="text-[12px] text-[#a1a1aa]">Actualizado: Hoy {sync}</span>}
      />

      <div id="cuentas" className="grid scroll-mt-24 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icono={<Wallet size={18} />} titulo="Saldo en cajas" valor={montoCorto(saldoCajas)} detalle={`${cajas.length} caja(s) · saldo registrado`} href="/dashboard/compras?tab=registrar" />
        <Kpi icono={<HandCoins size={18} />} titulo="CxC" valor={montoCorto(d.cxc)} detalle={`${d.porCobrar.length} pendiente(s)${d.cxcVencidas ? ` · ${d.cxcVencidas} vencida(s)` : ""}`} href="/dashboard/ventas?tab=cobrar" />
        <Kpi icono={<Banknote size={18} />} titulo="CxP" valor={montoCorto(d.cxp)} detalle={`${d.porPagar.length} factura(s) por pagar${d.cxpVencidas ? ` · ${d.cxpVencidas} vencida(s)` : ""}`} href="/dashboard/compras?tab=facturas" />
        <Kpi icono={<Receipt size={18} />} titulo="IGV del mes" valor={montoCorto(igvPagar)} detalle={`Ventas ${soles(d.igvVentas)} − Compras ${soles(d.igvCompras)} (estimado)`} href="/dashboard/contable" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Pago a proveedores" icono={<Banknote size={17} />}>
          <Filas
            vacio="No hay OC ni facturas por pagar."
            items={[
              ...d.ocPorPagar.map((o) => ({ clave: o.id, titulo: `${o.proveedor} · ${o.numero}`, detalle: "OC emitida, falta bancarizar / pagar", derecha: <Etiqueta>{soles(o.total)}</Etiqueta>, href: "/dashboard/compras?tab=ordenes" })),
              ...d.porPagar.map((f) => ({
                clave: f.id,
                titulo: `${f.proveedor} · ${f.numero}`,
                detalle: f.fechaVencimiento ? `Factura · vence ${fechaPE(f.fechaVencimiento)}` : "Factura por pagar",
                derecha: <Etiqueta>{soles(f.netoPagar ?? f.total)}</Etiqueta>,
                href: "/dashboard/compras?tab=facturas",
              })),
            ]}
          />
        </Panel>
        <Panel titulo="Tesorería" icono={<Landmark size={17} />}>
          <Filas
            vacio="Sin cajas registradas."
            items={cajas.map((c) => ({ clave: c.id, titulo: c.nombre, detalle: c.tipo, derecha: <span className="whitespace-nowrap font-semibold text-[#fdba74]">{soles(c.saldo_actual)}</span>, href: "/dashboard/compras?tab=registrar" }))}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <BotonAccion href="/dashboard/compras?tab=registrar" lleno>
              Registrar gasto / compra
            </BotonAccion>
            <BotonAccion href="/dashboard/compras?tab=planilla" icono={<Users size={15} />}>
              Planilla
            </BotonAccion>
            <BotonAccion href="/dashboard/compras?tab=ordenes">Órdenes OC / OS</BotonAccion>
            <BotonAccion href="/dashboard/contable" icono={<BookOpen size={15} />}>
              Contabilidad
            </BotonAccion>
          </div>
        </Panel>
      </div>

      <div id="facturacion" className="grid scroll-mt-24 gap-4 lg:grid-cols-2">
        <Panel titulo={permisos.canEmitFactura ? "Facturación emitida" : "Facturación emitida · solo lectura"} icono={<FileText size={17} />}>
          <Filas
            vacio="Aún no hay comprobantes emitidos."
            items={d.ultimosEmitidos.map((c) => ({ clave: c.id, titulo: `${c.numero} · ${c.cliente}`, detalle: fechaPE(c.fecha), derecha: <Etiqueta tono="verde">{soles(c.total)}</Etiqueta>, href: "/dashboard/ventas?tab=comprobantes" }))}
          />
        </Panel>
        <Panel titulo="Facturas recibidas" icono={<Receipt size={17} />}>
          <Filas
            vacio="Aún no hay facturas de proveedores."
            items={d.ultimasRecibidas.map((f) => ({
              clave: f.id,
              titulo: `${f.numero} · ${f.proveedor}`,
              detalle: `${fechaPE(f.fecha)}${f.ocNumero ? ` · ${f.ocNumero}` : ""}`,
              derecha: <Etiqueta tono={f.estadoPago === "PAGADA" ? "verde" : "naranja"}>{f.estadoPago === "PAGADA" ? "Pagada" : "Por pagar"}</Etiqueta>,
              href: "/dashboard/compras?tab=facturas",
            }))}
          />
        </Panel>
      </div>

      <div id="fletes" className="scroll-mt-24">
      <Panel titulo={`Fletes de agencia · ${nombreMes}`} icono={<HandCoins size={17} />}>
        <Filas
          vacio="Sin fletes registrados este mes."
          items={d.fletesMes.map((o) => ({ clave: o.id, titulo: `${o.numero} · ${o.agenciaNombre ?? "Agencia"}`, detalle: `${o.cliente}${o.guiaNro ? ` · guía ${o.guiaNro}` : ""}`, derecha: <Etiqueta>{soles(o.costoEnvio ?? 0)}</Etiqueta>, href: "/logistica/cotizar-flete" }))}
        />
      </Panel>
      </div>

      <AccesosRapidos sesion={sesion} actual="finanzas" />
    </MarcoPlanta>
  );
}

export default FinanzasHome;
