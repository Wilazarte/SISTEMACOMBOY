"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, Building2, Clock, Container, Factory, FileText, ShoppingCart, Truck, Wrench } from "lucide-react";
import { useSesion } from "@/lib/auth";
import { avanceOC, useLogistica, type DatosLogistica } from "@/lib/logistica";
import { useNotificaciones } from "@/lib/notificaciones";
import { permisosPlanta } from "@/lib/permisosPlanta";
import { fechaPE, soles } from "@/lib/storage";
import { ESTADOS_OD, estadoOD, resumenEntrega } from "@/lib/ventas";
import { Barra, BotonAccion, BotonVer, Etiqueta, Panel, SinRegistro, Vacio } from "./piezas";
import { EncabezadoPlanta, MarcoPlanta, PanelLateral } from "./planta";

export const SECCIONES = ["agencias", "proveedores", "infraestructura", "transferencias", "guia-sunat", "cotizar-flete", "historial"] as const;
export type Seccion = (typeof SECCIONES)[number];

const TITULOS: Record<Seccion, string> = {
  agencias: "Agencias",
  proveedores: "Proveedores nacionales",
  infraestructura: "Infraestructura planta",
  transferencias: "Transferencias",
  "guia-sunat": "Guía SUNAT",
  "cotizar-flete": "Cotizar flete",
  historial: "Historial general",
};

const ESTADO_OC: Record<string, string> = {
  EMITIDA: "Emitida · por pagar",
  BANCARIZADA: "Pagada",
  FACTURADA: "Facturada",
  EN_GUIA: "Con guía · por recibir",
  APROBADA: "Aprobada",
  FINALIZADA: "Finalizada",
};

const ESTADO_TRASLADO: Record<string, string> = { "en-camino": "En tránsito", recibido: "Recibido", observado: "Observado" };

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#a1a1aa]";
const td = "px-3 py-2 align-top text-[13px]";

function Tabla({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead className="border-b border-[#2a3445]">
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2a3445]">{children}</tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Secciones

function Compras({ d }: { d: DatosLogistica }) {
  return (
    <Panel titulo="Compras nacionales Perú" icono={<ShoppingCart size={17} />} accion={<BotonVer href="/logistica/compras">Ver Detalle</BotonVer>}>
      {d.ocActivas.length === 0 ? (
        <Vacio>No hay órdenes de compra en curso.</Vacio>
      ) : (
        <Tabla head={["OC N°", "Proveedor", "Monto", "Estado", "Avance", ""]}>
          {d.ocActivas.slice(0, 8).map((o) => (
            <tr key={o.id}>
              <td className={`${td} font-semibold text-white`}>{o.numero}</td>
              <td className={td}>
                <span className="block font-semibold text-[#93c5fd]">{o.proveedor}</span>
                <span className="block text-[11px] text-[#a1a1aa]">{o.items.map((i) => i.nombre).filter(Boolean).slice(0, 2).join(" · ") || o.reqNumero}</span>
              </td>
              <td className={`${td} whitespace-nowrap font-semibold text-[#60a5fa]`}>{soles(o.total)}</td>
              <td className={td}>
                <Etiqueta tono={o.estado === "BANCARIZADA" || o.estado === "APROBADA" ? "verde" : "naranja"}>{ESTADO_OC[o.estado] ?? o.estado}</Etiqueta>
              </td>
              <td className={`${td} w-40`}>
                <span className="mb-1 block text-right text-[11px] font-semibold text-[#93c5fd]">{avanceOC(o)}%</span>
                <Barra pct={avanceOC(o)} />
                {o.lugarEntrega && <span className="mt-1 block truncate text-[11px] text-[#a1a1aa]">Entrega: {o.lugarEntrega}</span>}
              </td>
              <td className={td}>
                <BotonVer href="/dashboard/compras?tab=ordenes">Ver</BotonVer>
              </td>
            </tr>
          ))}
        </Tabla>
      )}
    </Panel>
  );
}

function Ventas({ d }: { d: DatosLogistica }) {
  const { sesion } = useSesion();
  const permisos = permisosPlanta(sesion);
  return (
    <Panel titulo="Ventas nacionales" icono={<Truck size={17} />} accion={<BotonVer href="/logistica/agencias">Ver Agencias</BotonVer>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-white">Producto terminado disponible</p>
          {d.ptPorTipo.length === 0 ? (
            <Vacio>Sin equipos con QC aprobado en almacén.</Vacio>
          ) : (
            <ul className="space-y-1.5">
              {d.ptPorTipo.map(([tipo, n]) => (
                <li key={tipo} className="flex items-center justify-between rounded-lg bg-[#212a3a] px-3 py-2 text-[13px]">
                  <span className="font-semibold text-white">{tipo}</span>
                  <Etiqueta tono="verde">{n} disponible(s)</Etiqueta>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {d.agencias.slice(0, 3).map((a) => (
              <div key={a.id} className="rounded-lg border border-[#2a3445] bg-[#212a3a] px-2 py-2 text-center">
                <span className="block text-[14px] font-bold text-white">{a.nombre}</span>
                <span className="block text-[11px] text-[#a1a1aa]">{a.detalle}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {permisos.canEmitFactura && (
            <div className="grid grid-cols-2 gap-2">
              <BotonAccion href="/dashboard/ventas?tab=notas" lleno>
                Cotizar Venta
              </BotonAccion>
              <BotonAccion href="/dashboard/ventas?tab=comprobantes">Generar Comprobante</BotonAccion>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <BotonAccion href="/logistica/cotizar-flete">Cotizar Envío</BotonAccion>
            {permisos.canEmitGuia && <BotonAccion href="/logistica/guia-sunat">Generar Guía SUNAT</BotonAccion>}
            <BotonAccion href="/logistica/agencias">Rastrear Tracking Agencia</BotonAccion>
            <BotonAccion href="/logistica/cotizar-flete">Liquidar Flete</BotonAccion>
          </div>
          <p className="text-[12px] text-[#a1a1aa]">
            {d.odsPorDespachar.length} orden(es) de despacho por agencia pendientes de salir · {d.odsTransito.length} en agencia (últimos días)
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Agencias({ d, completo }: { d: DatosLogistica; completo?: boolean }) {
  return (
    <Panel titulo="Agencias de transporte" icono={<Building2 size={17} />} accion={<BotonVer href="/dashboard/almacen?tab=despacho">Órdenes de despacho</BotonVer>}>
      <div className="grid gap-3 md:grid-cols-3">
        {d.agencias.map((a) => (
          <div key={a.id} className="rounded-lg border border-[#2a3445] bg-[#212a3a] p-3">
            <p className="text-[16px] font-bold text-white">{a.nombre}</p>
            {a.detalle && <p className="text-[12px] text-[#a1a1aa]">{a.detalle}</p>}
            <dl className="mt-2 grid grid-cols-2 gap-1 text-[12px]">
              <dt className="text-[#a1a1aa]">Envíos</dt>
              <dd className="text-right font-semibold text-white">{a.envios}</dd>
              <dt className="text-[#a1a1aa]">En tránsito</dt>
              <dd className="text-right font-semibold text-[#93c5fd]">{a.enTransito}</dd>
              <dt className="text-[#a1a1aa]">Flete total</dt>
              <dd className="text-right font-semibold text-white">{soles(a.flete)}</dd>
            </dl>
            {a.ultimo && (
              <p className="mt-2 truncate text-[11px] text-[#a1a1aa]">
                Último: {a.ultimo.numero} · {a.ultimo.cliente}
                {a.ultimo.guiaNro ? ` · guía ${a.ultimo.guiaNro}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
      {completo && (
        <div className="mt-4">
          <p className="mb-2 text-[13px] font-semibold text-white">Envíos por agencia (órdenes de despacho)</p>
          {d.odsAgencia.length === 0 ? (
            <Vacio>Aún no hay órdenes de despacho con envío por agencia.</Vacio>
          ) : (
            <Tabla head={["OD", "Fecha", "Cliente", "Agencia / guía", "Flete", "Estado"]}>
              {[...d.odsAgencia]
                .sort((a, b) => (b.actualizado || b.fecha).localeCompare(a.actualizado || a.fecha))
                .slice(0, 30)
                .map((o) => (
                  <tr key={o.id}>
                    <td className={`${td} font-semibold text-white`}>{o.numero}</td>
                    <td className={td}>{fechaPE(o.fecha)}</td>
                    <td className={td}>{o.cliente}</td>
                    <td className={td}>{resumenEntrega(o)}</td>
                    <td className={td}>{o.costoEnvio ? soles(o.costoEnvio) : "-"}</td>
                    <td className={td}>
                      <Etiqueta tono={estadoOD(o) === "DEJADO_EN_AGENCIA" ? "naranja" : estadoOD(o) === "PEDIDO_ENTREGADO" ? "verde" : "gris"}>{ESTADOS_OD[estadoOD(o)]}</Etiqueta>
                    </td>
                  </tr>
                ))}
            </Tabla>
          )}
          <div className="mt-3">
            <SinRegistro>El ERP aún no guarda el tracking de las agencias (código tipo MV-ARQ-…): el seguimiento se ve por el N° de guía de cada OD.</SinRegistro>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Proveedores({ d, completo }: { d: DatosLogistica; completo?: boolean }) {
  const lista = completo ? d.proveedores : d.proveedores.slice(0, 6);
  return (
    <Panel titulo="Proveedores nacionales" icono={<Factory size={17} />} accion={<BotonVer href="/logistica/proveedores">Ver Proveedores</BotonVer>}>
      {lista.length === 0 ? (
        <Vacio>Aún no hay órdenes de compra a proveedores.</Vacio>
      ) : completo ? (
        <Tabla head={["Proveedor", "RUC", "OC", "En curso", "Total comprado", "Última OC"]}>
          {lista.map((p) => (
            <tr key={p.ruc || p.proveedor}>
              <td className={`${td} font-semibold text-white`}>{p.proveedor}</td>
              <td className={td}>{p.ruc || "-"}</td>
              <td className={td}>{p.ocs}</td>
              <td className={td}>{p.activas ? <Etiqueta>{p.activas}</Etiqueta> : "-"}</td>
              <td className={`${td} font-semibold text-[#60a5fa]`}>{soles(p.total)}</td>
              <td className={td}>
                {p.ultima.numero} · {fechaPE(p.ultima.fecha)}
              </td>
            </tr>
          ))}
        </Tabla>
      ) : (
        <ul className="space-y-1.5 text-[13px]">
          {lista.map((p) => (
            <li key={p.ruc || p.proveedor} className="flex justify-between gap-3">
              <span className="truncate">
                <span className="text-[#2a7bff]">• </span>
                <span className="font-semibold text-white">{p.proveedor}</span> <span className="text-[#a1a1aa]">· {p.ocs} OC</span>
              </span>
              <span className="whitespace-nowrap font-semibold text-[#93c5fd]">{soles(p.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const ESTACIONES = [
  { nombre: "Plasma CNC", detalle: "Corte de planchas" },
  { nombre: "Torno", detalle: "Mecanizado de ejes / bujes" },
  { nombre: "Soldadura", detalle: "Unión de chasis" },
];

function Infraestructura({ d }: { d: DatosLogistica }) {
  return (
    <Panel titulo="Infraestructura planta" icono={<Wrench size={17} />} accion={<BotonVer href="/logistica/produccion">Ver Producción</BotonVer>}>
      <div className="grid gap-2 sm:grid-cols-3">
        {ESTACIONES.map((e) => (
          <div key={e.nombre} className="rounded-lg border border-[#2a3445] bg-[#212a3a] p-3">
            <p className="text-[14px] font-bold text-white">{e.nombre}</p>
            <p className="text-[12px] text-[#a1a1aa]">{e.detalle}</p>
            <p className="mt-1 text-[11px] italic text-[#71717a]">Estado / OEE / mantenimiento: sin registro</p>
          </div>
        ))}
      </div>
      <p className="mb-2 mt-4 text-[13px] font-semibold text-white">Órdenes de producción en fabricación</p>
      {d.opsActivas.length === 0 ? (
        <Vacio>No hay órdenes de producción en fabricación.</Vacio>
      ) : (
        <ul className="space-y-1.5 text-[13px]">
          {d.opsActivas.map((o) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-[#212a3a] px-3 py-2">
              <span>
                <span className="font-semibold text-white">{o.id}</span> · {o.tipo_equipo} {o.modelo} · chasis {o.codigo_chasis || "-"}
              </span>
              <span className="text-[#a1a1aa]">{fechaPE(o.fecha)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <SinRegistro>El ERP aún no registra el estado de las máquinas (operativo, OEE, mantenimiento programado). Cuando se agregue, aparecerá aquí.</SinRegistro>
      </div>
    </Panel>
  );
}

function Transferencias({ d, completo }: { d: DatosLogistica; completo?: boolean }) {
  const lista = completo ? d.traslados : d.traslados.filter((t) => t.estado === "en-camino").slice(0, 4);
  return (
    <Panel titulo="Transferencias" icono={<ArrowLeftRight size={17} />} accion={<BotonVer href="/logistica/transferencias">Ver Transferencias</BotonVer>}>
      {lista.length === 0 ? (
        <Vacio>{completo ? "Aún no hay traslados Planta → Sucursal." : "No hay traslados en tránsito."}</Vacio>
      ) : (
        <Tabla head={["Traslado", "Destino", "Envío", "Guía remisión", "Transportista", "Estado"]}>
          {lista.map((t) => (
            <tr key={t.id}>
              <td className={`${td} font-semibold text-white`}>{t.codigo}</td>
              <td className={td}>Planta → {t.destino}</td>
              <td className={td}>{fechaPE(t.fechaEnvio)}</td>
              <td className={td}>{t.guiaRemision || "-"}</td>
              <td className={td}>{[t.transportista, t.placa].filter(Boolean).join(" · ") || "-"}</td>
              <td className={td}>
                <Etiqueta tono={t.estado === "recibido" ? "verde" : t.estado === "observado" ? "gris" : "naranja"}>{ESTADO_TRASLADO[t.estado] ?? t.estado}</Etiqueta>
              </td>
            </tr>
          ))}
        </Tabla>
      )}
    </Panel>
  );
}

function GuiaSunat({ d }: { d: DatosLogistica }) {
  return (
    <Panel titulo="Guías de remisión" icono={<FileText size={17} />} accion={<BotonAccion href="/dashboard/almacen?tab=despacho" lleno>Nueva Guía SUNAT</BotonAccion>}>
      <p className="mb-3 text-[12px] text-[#a1a1aa]">Las guías se emiten desde Almacén › Órdenes de despacho (formato actual, sin cambios). Aquí se listan las ya registradas.</p>
      {d.guiasRemision.length === 0 ? (
        <Vacio>Aún no hay guías de remisión registradas.</Vacio>
      ) : (
        <Tabla head={["Guía", "Documento", "Destino", "Fecha", "Estado"]}>
          {d.guiasRemision.slice(0, 40).map((g) => (
            <tr key={g.id + g.numero}>
              <td className={`${td} font-semibold text-white`}>{g.numero}</td>
              <td className={td}>{g.origen}</td>
              <td className={td}>{g.destino}</td>
              <td className={td}>{fechaPE(g.fecha)}</td>
              <td className={td}>
                <Etiqueta tono="gris">{g.estado.replace(/_/g, " ")}</Etiqueta>
              </td>
            </tr>
          ))}
        </Tabla>
      )}
    </Panel>
  );
}

function CotizarFlete({ d }: { d: DatosLogistica }) {
  const destinos = Object.values(
    d.odsAgencia
      .filter((o) => (o.costoEnvio ?? 0) > 0)
      .reduce<Record<string, { agencia: string; destino: string; n: number; total: number; ultimo: string }>>((acc, o) => {
        const destino = (o.direccionDestino || "Sin destino").trim();
        const k = `${o.agenciaNombre}|${destino}`;
        const x = (acc[k] ??= { agencia: o.agenciaNombre ?? "-", destino, n: 0, total: 0, ultimo: o.fecha });
        x.n++;
        x.total += o.costoEnvio ?? 0;
        if (o.fecha > x.ultimo) x.ultimo = o.fecha;
        return acc;
      }, {})
  ).sort((a, b) => b.n - a.n);
  return (
    <Panel titulo="Cotizar flete" icono={<Container size={17} />} accion={<BotonAccion href="/dashboard/ventas?tab=notas" lleno>Nueva venta con envío</BotonAccion>}>
      <p className="mb-3 text-[12px] text-[#a1a1aa]">Referencia de fletes pagados por agencia y destino (costo de envío registrado en las órdenes de despacho).</p>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {d.agencias.slice(0, 3).map((a) => (
          <div key={a.id} className="rounded-lg border border-[#2a3445] bg-[#212a3a] p-3 text-center">
            <p className="font-bold text-white">{a.nombre}</p>
            <p className="text-[12px] text-[#a1a1aa]">Flete promedio</p>
            <p className="text-lg font-bold text-[#60a5fa]">{a.fletePromedio ? soles(a.fletePromedio) : "-"}</p>
          </div>
        ))}
      </div>
      {destinos.length === 0 ? (
        <Vacio>Aún no hay fletes registrados.</Vacio>
      ) : (
        <Tabla head={["Agencia", "Destino", "Envíos", "Flete promedio", "Último"]}>
          {destinos.map((x) => (
            <tr key={x.agencia + x.destino}>
              <td className={`${td} font-semibold text-white`}>{x.agencia}</td>
              <td className={td}>{x.destino}</td>
              <td className={td}>{x.n}</td>
              <td className={`${td} font-semibold text-[#60a5fa]`}>{soles(x.total / x.n)}</td>
              <td className={td}>{fechaPE(x.ultimo)}</td>
            </tr>
          ))}
        </Tabla>
      )}
    </Panel>
  );
}

function Historial({ d }: { d: DatosLogistica }) {
  return (
    <Panel titulo="Historial general" icono={<Clock size={17} />}>
      {d.historial.length === 0 ? (
        <Vacio>Sin movimientos registrados.</Vacio>
      ) : (
        <Tabla head={["Fecha", "Documento", "Acción", "Detalle", ""]}>
          {d.historial.slice(0, 100).map((h, i) => (
            <tr key={`${h.doc}-${h.fecha}-${i}`}>
              <td className={`${td} whitespace-nowrap`}>{fechaPE(h.fecha)}</td>
              <td className={`${td} font-semibold text-white`}>{h.doc}</td>
              <td className={td}>{h.accion}</td>
              <td className={`${td} text-[#a1a1aa]`}>{h.detalle}</td>
              <td className={td}>
                <BotonVer href={h.href}>Ver</BotonVer>
              </td>
            </tr>
          ))}
        </Tabla>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ Panel derecho

export function LogisticaDetalle({ solo }: { solo?: Seccion }) {
  const { sesion } = useSesion();
  const d = useLogistica();
  const notifs = useNotificaciones(sesion);

  const accionesRapidas = (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold uppercase text-white">
          Acciones rápidas <BotonVer href="/logistica/ventas">VENTAS</BotonVer>
        </h2>
        <BotonVer href="/logistica">Ver Detalle</BotonVer>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <BotonAccion href="/logistica/guia-sunat" lleno icono={<FileText size={17} />}>
          Nueva Guía SUNAT
        </BotonAccion>
        <BotonAccion href="/logistica/cotizar-flete" lleno icono={<Building2 size={17} />}>
          Cotizar Flete Agencia
        </BotonAccion>
        <BotonAccion href="/logistica/transferencias" lleno icono={<ArrowLeftRight size={17} />}>
          Transferencia Planta-Sucursal vía Agencia
        </BotonAccion>
        <BotonAccion href="/logistica/historial" icono={<Clock size={17} />}>
          Historial General
        </BotonAccion>
      </div>
    </section>
  );

  // Diseño 3: encabezado de la planta, acciones rápidas, secciones y panel derecho con pestañas
  return (
    <MarcoPlanta
      lateral={
        solo ? undefined : (
          <PanelLateral sesion={sesion} modulo="Logística" notifs={notifs} recordatorios={d.pendientes.map((p) => ({ clave: p.clave, titulo: p.titulo, detalle: p.detalle, href: p.href }))} />
        )
      }
    >
      <Link href="/logistica" className="inline-flex items-center gap-1 text-[12px] text-[#a1a1aa] hover:text-[#93c5fd]">
        <ArrowLeft size={13} /> Logística Planta
      </Link>
      <EncabezadoPlanta
        icono={<Truck size={30} />}
        titulo={solo ? TITULOS[solo] : "LOGISTICA"}
        subtitulo="Compras y Ventas Nacionales · Sin Flota · Marvisur · Grael · Shalom · Arequipa - Perú"
      />

      {solo ? (
        <>
          {solo === "agencias" && <Agencias d={d} completo />}
          {solo === "proveedores" && <Proveedores d={d} completo />}
          {solo === "infraestructura" && <Infraestructura d={d} />}
          {solo === "transferencias" && <Transferencias d={d} completo />}
          {solo === "guia-sunat" && <GuiaSunat d={d} />}
          {solo === "cotizar-flete" && <CotizarFlete d={d} />}
          {solo === "historial" && <Historial d={d} />}
        </>
      ) : (
        <>
          {accionesRapidas}
          <Compras d={d} />
          <Ventas d={d} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Proveedores d={d} />
            <Infraestructura d={d} />
          </div>
          <Transferencias d={d} />
        </>
      )}
    </MarcoPlanta>
  );
}

export default LogisticaDetalle;
