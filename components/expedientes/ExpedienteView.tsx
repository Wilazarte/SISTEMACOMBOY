"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, FileText, Printer, ShieldCheck } from "lucide-react";
import { abrirDoc } from "@/components/doc-viewer";
import { toast } from "@/components/ui";
import { useSesion } from "@/lib/auth";
import {
  FASES,
  NOMBRE_PERFIL,
  RESPONSABLE,
  TITULO_FASE,
  abrirArchivoExp,
  buscarExpediente,
  cotizacionApta,
  costos,
  docsDe,
  documentos,
  puedeActuar,
  resumen,
  sincronizarCierre,
  useExpedientes,
  type CotizacionExp,
  type Fase,
  type OrdenCompraExp,
} from "@/lib/expedientes";
import type { OrdenProduccion } from "@/lib/produccion";
import { KEYS, soles, useStore } from "@/lib/storage";
import type { Requerimiento, StockItem, ValeProduccion } from "@/lib/types";
import { Avance, AvisoSql, Boton, ChipDoc, ChipFase, Dato, Seccion, pct } from "./comun";
import {
  FormActaCompleta,
  FormAvance,
  FormCierre,
  FormComprobante,
  FormCotizacion,
  FormFase2,
  FormFase3,
  FormHoras,
  FormOC,
  FormPago,
  FormSolicitarComprobante,
  FormTransporte,
  TarjetaProveedor,
  revalidar,
} from "./FormulariosFase";

type Abierto =
  | { f: "2" | "3" | "avance" | "horas" | "coti" | "comprobante-pedido" | "transporte" | "7" | "8" }
  | { f: "oc"; c: CotizacionExp }
  | { f: "pago" | "factura"; oc: OrdenCompraExp };

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });

/** Expediente 26W-001: timeline de 8 fases, acciones por rol, 15 documentos con validaciones, costos e historial. */
export function ExpedienteView({ codigo }: { codigo: string }) {
  const { sesion } = useSesion();
  const s = useExpedientes();
  const ops = useStore<OrdenProduccion[]>(KEYS.PRODUCCION, []);
  const stock = useStore<StockItem[]>(KEYS.STOCK, []);
  const vales = useStore<ValeProduccion[]>(KEYS.VALES_PRODUCCION, []);
  const reqsP = useStore<Requerimiento[]>(KEYS.REQS_PENDIENTES, []);
  const reqsH = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const [abierto, setAbierto] = useState<Abierto | null>(null);

  const x = useMemo(() => buscarExpediente(codigo), [s, codigo]); // eslint-disable-line react-hooks/exhaustive-deps
  const calc = useMemo(() => {
    if (!x) return null;
    const d = docsDe(x, s);
    return { d, r: resumen(x, d), c: costos(x, d, stock, vales), docs: documentos(x, d) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, s, ops, stock, vales, reqsP, reqsH]);

  // Historial de visitas (navegación rápida): últimos 8 expedientes abiertos en esta PC
  useEffect(() => {
    if (!x) return;
    try {
      const h = JSON.parse(localStorage.getItem("erp-expedientes-recientes") ?? "[]") as string[];
      localStorage.setItem("erp-expedientes-recientes", JSON.stringify([x.codigo_expediente, ...h.filter((c) => c !== x.codigo_expediente)].slice(0, 8)));
    } catch {
      /* sin almacenamiento local: no pasa nada */
    }
  }, [x]);

  // El QC se firma en Producción: cuando llega, se cierra el expediente
  useEffect(() => {
    if (x && calc && x.estado === "ABIERTO" && x.datos.cierre && calc.d.op?.estado === "QC_APROBADO" && puedeActuar(sesion, 8)) void sincronizarCierre(x)?.catch((e) => toast((e as Error).message, "error"));
  }, [x, calc, sesion]);

  if (s.faltaTabla) return <AvisoSql />;
  if (!s.listo) return <p className="text-[13px] text-[#a1a1aa]">Cargando expediente…</p>;
  if (!x || !calc) return <p className="text-[14px] text-[#FFB27A]">No existe el expediente {decodeURIComponent(codigo)}. <Link href="/erp/lotes" className="underline">Volver al tablero</Link></p>;

  const { d, r, c, docs } = calc;
  const D = x.datos;
  const puede = (f: Fase) => x.estado === "ABIERTO" && puedeActuar(sesion, f);
  const alertas = docs.flatMap((doc) => doc.alertas.map((a) => `${doc.n}. ${doc.titulo}: ${a}`));

  const accionesFase = (n: Fase) => {
    const est = r.fases[n];
    if (!puede(n)) return null;
    const b: React.ReactNode[] = [];
    if (n === 2 && est === "PENDIENTE") b.push(<Boton key="2" lleno onClick={() => setAbierto({ f: "2" })}>Aceptar y pedir materiales</Boton>);
    if (n === 3 && est === "PENDIENTE") b.push(<Boton key="3" lleno onClick={() => setAbierto({ f: "3" })}>Validar stock</Boton>);
    if (n === 4 && est === "PENDIENTE") b.push(<Boton key="4" lleno onClick={() => setAbierto({ f: "coti" })}>Subir cotización</Boton>);
    if (n === 5 && (est === "PENDIENTE" || est === "HECHA")) {
      d.ocs.filter((o) => !o.bancarizacion).forEach((o) => b.push(<Boton key={o.id} lleno onClick={() => setAbierto({ f: "pago", oc: o })}>Pagar {o.codigo_oc}</Boton>));
      if (d.ocs.some((o) => !o.comprobante) && !D.comprobanteSolicitado) b.push(<Boton key="sc" onClick={() => setAbierto({ f: "comprobante-pedido" })}>Pedir comprobante a Logística</Boton>);
    }
    if (n === 6 && est !== "NO_APLICA" && est !== "BLOQUEADA") {
      d.ocs.filter((o) => !o.comprobante).forEach((o) => b.push(<Boton key={`f${o.id}`} onClick={() => setAbierto({ f: "factura", oc: o })}>Factura de {o.codigo_oc}</Boton>));
      if (est === "PENDIENTE") b.push(<Boton key="6" lleno onClick={() => setAbierto({ f: "transporte" })}>Registrar transporte</Boton>);
    }
    if (n === 7 && est === "PENDIENTE") b.push(<Boton key="7" lleno onClick={() => setAbierto({ f: "7" })}>Acta de entrega completa</Boton>);
    if (n === 8 && D.ruta) {
      b.push(<Boton key="av" onClick={() => setAbierto({ f: "avance" })}>Reportar avance</Boton>, <Boton key="h" onClick={() => setAbierto({ f: "horas" })}>Registrar horas</Boton>);
      if (est === "PENDIENTE" && !D.cierre) b.push(<Boton key="8" lleno onClick={() => setAbierto({ f: "8" })}>Acta de entrega PT</Boton>);
    }
    return b.length ? <div className="mt-2 flex flex-wrap gap-2">{b}</div> : null;
  };

  return (
    <div className="space-y-5 text-[#e5e7eb] print:text-black">
      <nav className="text-[12px] text-[#a1a1aa] print:hidden" aria-label="Ruta">
        <Link href="/erp/lotes" className="hover:text-white">
          Expedientes
        </Link>{" "}
        › <span className="text-white">{x.codigo_expediente}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[#FF6D00]/50 bg-[#1A1A1A] p-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#a1a1aa]">Código de seguimiento</p>
          <h1 className="text-5xl font-black leading-none text-[#FF6D00]">{x.codigo_expediente}</h1>
          <p className="mt-1 text-[15px] font-semibold text-white">
            {D.producto}
            {x.op_id ? ` · ${x.op_id}` : ""}
            {x.lote ? ` · lote ${x.lote}` : ""}
            {x.almacen_destino ? ` · destino ${x.almacen_destino}` : ""}
          </p>
          <p className="text-[13px] text-[#d4d4d8]">
            Cliente {D.legal.cliente || "—"} · contrato {D.legal.contrato || "—"} · garantía {D.legal.garantiaMeses} meses · prioridad {D.prioridad} · plazo {x.plazo ?? "—"}
            {r.diasPlazo !== null && x.estado === "ABIERTO" && <b className={r.vencido ? " text-[#FFB27A]" : " text-[#86efac]"}> ({r.vencido ? `${-r.diasPlazo} día(s) de retraso` : `faltan ${r.diasPlazo} día(s)`})</b>}
          </p>
          {x.is_demo && <p className="mt-1 text-[12px] font-bold text-[#fcd34d]">DATOS DE PRUEBA (is_demo)</p>}
        </div>
        <div className="w-full max-w-xs space-y-2">
          <p className="text-[12px] uppercase text-[#a1a1aa]">
            {x.estado} · fase {r.actual ?? "—"}
          </p>
          <Avance pct={r.avance} />
          <div className="flex gap-2 print:hidden">
            <Boton onClick={() => window.print()}>
              <Printer size={14} /> Imprimir expediente
            </Boton>
          </div>
        </div>
      </header>

      {x.es_lote_mixto && calc.d.detalles.length > 0 && (
        <Seccion titulo={`Equipos del lote mixto · ${calc.d.detalles.reduce((a, e) => a + e.cantidad, 0)} unidad(es)`}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] uppercase text-[#a1a1aa]">
                <th className="py-1">Tipo de equipo</th>
                <th className="py-1">Marca motor</th>
                <th className="py-1">Modelo</th>
                <th className="py-1 text-right">Cantidad</th>
                <th className="py-1 text-right">Costo BOM</th>
                <th className="py-1 pl-3">Chasis / serie (fase 8)</th>
              </tr>
            </thead>
            <tbody>
              {calc.d.detalles.map((e) => (
                <tr key={e.id} className="border-t border-[#333333]">
                  <td className="py-1.5 text-white">{e.tipo_equipo}</td>
                  <td className="py-1.5">{e.marca_motor}</td>
                  <td className="py-1.5 font-semibold text-white">{e.modelo}</td>
                  <td className="py-1.5 text-right">{e.cantidad}</td>
                  <td className="py-1.5 text-right">{e.costo_bom ? soles(e.costo_bom) : "—"}</td>
                  <td className="py-1.5 pl-3 text-[12px] text-[#d4d4d8]">{e.unidades.length ? e.unidades.map((u) => `${u.chasis} / ${u.serie}`).join(" · ") : "Pendiente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      {alertas.length > 0 && (
        <Seccion titulo={`Alertas de auditoría (${alertas.length})`}>
          <ul className="space-y-1 text-[13px] text-[#fcd34d]">
            {alertas.map((a) => (
              <li key={a} className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {a}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="Flujo · 8 fases">
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {FASES.map((n) => (
            <li key={n} className={`rounded-lg border p-3 ${r.actual === n ? "border-[#FF6D00] bg-[#FF6D00]/5" : "border-[#333333] bg-[#222222]"}`}>
              <p className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-white">
                  <span className="mr-1 text-[#FF6D00]">{String(n).padStart(2, "0")}</span> {TITULO_FASE[n]}
                </span>
                <ChipFase estado={r.fases[n]} />
              </p>
              <p className="text-[11px] text-[#a1a1aa]">{NOMBRE_PERFIL[RESPONSABLE[n]]}</p>
              {accionesFase(n)}
            </li>
          ))}
        </ol>
      </Seccion>

      {D.ruta === 2 && (
        <Seccion titulo="Cotizaciones y órdenes de compra">
          {d.cotizaciones.length === 0 && <p className="text-[13px] text-[#a1a1aa]">Sin cotizaciones. Logística sube la del proveedor (fase 4).</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {d.cotizaciones.map((q) => {
              const oc = d.ocs.find((o) => o.cotizacion_id === q.id);
              return (
                <div key={q.id} className="space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-white">
                    Cotización {q.nro_cotizacion ?? "s/n"} · {Number(q.total).toFixed(2)} {q.moneda}
                    {cotizacionApta(q) ? <span className="text-[#86efac]">RUC validado</span> : <span className="text-[#FFB27A]">{q.ruc_validado ? `${q.ruc_estado} / ${q.condicion_habido}` : "RUC sin validar"}</span>}
                  </p>
                  <TarjetaProveedor c={q} />
                  <div className="flex flex-wrap gap-2">
                    {q.archivo_url && (
                      <Boton onClick={() => void abrirArchivoExp(q.archivo_url!).catch((e) => toast((e as Error).message, "error"))}>
                        <FileText size={14} /> Ver archivo
                      </Boton>
                    )}
                    {puede(4) && !q.ruc_validado && (
                      <Boton onClick={() => void revalidar(q)}>
                        <ShieldCheck size={14} /> Validar RUC con Decolecta
                      </Boton>
                    )}
                    {puede(4) && !oc && (
                      <Boton lleno disabled={!cotizacionApta(q)} title={cotizacionApta(q) ? undefined : "RUC no validado, no ACTIVO o no HABIDO"} onClick={() => setAbierto({ f: "oc", c: q })}>
                        Generar OC
                      </Boton>
                    )}
                    {oc && (
                      <span className="text-[13px] text-[#d4d4d8]">
                        {oc.codigo_oc} · {oc.estado} · motivo: {oc.motivo_sustentado}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {puede(4) && d.cotizaciones.length > 0 && (
            <div className="mt-3">
              <Boton onClick={() => setAbierto({ f: "coti" })}>Subir otra cotización</Boton>
            </div>
          )}
        </Seccion>
      )}

      <Seccion titulo="Expediente · documentos">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase text-[#a1a1aa]">
              <tr>
                <th className="py-1.5">#</th>
                <th>Documento</th>
                <th>N°</th>
                <th>Estado</th>
                <th>Detalle</th>
                <th className="print:hidden" />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.n} className="border-t border-white/5 align-top">
                  <td className="py-1.5 font-bold text-[#FF6D00]">{doc.n}</td>
                  <td className="font-semibold text-white">{doc.titulo}</td>
                  <td className="font-mono text-[12px]">{doc.numero}</td>
                  <td>
                    <ChipDoc estado={doc.estado} />
                  </td>
                  <td className="text-[#d4d4d8]">
                    {doc.detalle}
                    {doc.alertas.map((a) => (
                      <span key={a} className="block text-[12px] text-[#fcd34d]">
                        {a}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap print:hidden">
                    {doc.reqId && (
                      <button type="button" className="text-[#FFB27A] hover:underline" onClick={() => abrirDoc({ tipo: "REQ", id: doc.reqId! })}>
                        Ver
                      </button>
                    )}
                    {doc.archivo && (
                      <button type="button" className="inline-flex items-center gap-1 text-[#FFB27A] hover:underline" onClick={() => void abrirArchivoExp(doc.archivo!).catch((e) => toast((e as Error).message, "error"))}>
                        Archivo <ExternalLink size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion titulo="Costo en vivo (sin IGV)">
          <Dato k="Materiales entregados (vales)" v={soles(c.materiales)} />
          <Dato k="Flete" v={soles(c.flete)} />
          <Dato k="Mano de obra" v={soles(c.manoObra)} />
          <Dato k="Horas máquina" v={soles(c.maquina)} />
          <Dato k="Costo real" v={<b className="text-[#FF9A4D]">{soles(c.real)}</b>} />
          <Dato k="Costo estimado" v={soles(c.presupuesto)} />
          <Dato k="Variación" v={pct(c.variacion)} />
          <Dato k="Margen bruto" v={<span className={c.alertaMargen ? "text-[#fcd34d]" : undefined}>{pct(c.margen)}</span>} />
          <p className="mt-2 text-[11px] text-[#a1a1aa]">Compras OC del expediente: {soles(c.comprasOC)} (entran al costo cuando Almacén entrega el material con vale).</p>
        </Seccion>
        <Seccion titulo="Horas por recurso">
          {c.porRecurso.length === 0 ? (
            <p className="text-[13px] text-[#a1a1aa]">Sin horas registradas.</p>
          ) : (
            c.porRecurso.map((h) => <Dato key={`${h.tipo}${h.recurso}`} k={`${h.recurso} · ${h.horas} h`} v={`${soles(h.costo)} (${soles(h.horas ? h.costo / h.horas : 0)}/h)`} />)
          )}
          <h3 className="mt-3 text-[12px] font-bold uppercase text-[#FF9A4D]">Reportes de avance</h3>
          {D.avances.length === 0 ? <p className="text-[13px] text-[#a1a1aa]">Sin reportes.</p> : [...D.avances].reverse().slice(0, 5).map((a) => <Dato key={a.fecha} k={`${fechaHora(a.fecha)} · ${a.usuario}`} v={`${a.porcentaje} % · ${a.nota}`} />)}
        </Seccion>
        <Seccion titulo="Historial (auditoría)">
          <ol className="max-h-80 space-y-1.5 overflow-y-auto text-[12px]">
            {[...D.historial].reverse().map((h, i) => (
              <li key={i} className="border-b border-white/5 pb-1">
                <span className="text-[#a1a1aa]">
                  {fechaHora(h.fecha)} · {h.usuario} ({NOMBRE_PERFIL[h.perfil] ?? h.perfil}){h.fase ? ` · fase ${h.fase}` : ""}
                </span>
                <span className="block text-white">{h.accion}</span>
                {h.detalle && <span className="block text-[#d4d4d8]">{h.detalle}</span>}
              </li>
            ))}
          </ol>
        </Seccion>
      </div>

      {abierto?.f === "2" && <FormFase2 x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "3" && <FormFase3 x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "avance" && <FormAvance x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "horas" && <FormHoras x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "coti" && <FormCotizacion x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "oc" && <FormOC x={x} c={abierto.c} onClose={() => setAbierto(null)} />}
      {abierto?.f === "pago" && <FormPago x={x} oc={abierto.oc} onClose={() => setAbierto(null)} />}
      {abierto?.f === "comprobante-pedido" && <FormSolicitarComprobante x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "factura" && <FormComprobante x={x} oc={abierto.oc} onClose={() => setAbierto(null)} />}
      {abierto?.f === "transporte" && <FormTransporte x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "7" && <FormActaCompleta x={x} onClose={() => setAbierto(null)} />}
      {abierto?.f === "8" && <FormCierre x={x} onClose={() => setAbierto(null)} />}
    </div>
  );
}

export default ExpedienteView;
