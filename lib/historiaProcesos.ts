"use client";

// =====================================================================
// HISTORIA CLÍNICA POR PROCESO (Gestión Documentaria, Williams 2026-11-17)
// Cada proceso del ERP es una línea: todos sus documentos, en orden, con fecha, responsable, estado,
// bitácora y adjuntos. Solo LEE lo que cada módulo ya guarda (no cambia ninguna tabla ni pantalla) y
// enlaza los documentos por sus códigos:
//   Compra    REQ (Almacén) → Cotización → OC → Pago → Factura/DJ → Guía → Ingreso a almacén (V°B°)
//   Servicio  REQ tipo SERVICIO → OS → Aprobación de Gerencia → Comprobante / pago
//   Venta     NP → Aprobación → OD → Comprobante → Cobros → Alistado → Entrega al cliente
//   Producción OP → Vales de materiales → QC → Ingreso de equipo → NP / OD → Entrega
//   Gasto     GST → OC / OS → Sustento (comprobante o DJ) → Pago
//   Compra con ingreso a stock: Compra → OC / OS → Ingreso a almacén → Pago / DJ
// Los documentos de Gestión Documentaria se enlazan por su "Código en otro módulo" (referencia_externa).
// =====================================================================

import { fechaPE, getCompras, getCotizaciones, getFacturas, getGuias, getKardex, getOrdenes, getOrdenesServicio, getPendientes, getProcesados, soles } from "./storage";
import { estadoOD, getCobros, getComprobantes, getDespachos, getNotasPedido } from "./ventas";
import { equipoDeLinea, getEquipos, getMovimientos, type EquipoTerminado } from "./equipos";
import { getOrdenesProduccion, type OrdenProduccion } from "./produccion";
import { consumosDeChasis } from "./inventario";
import { codigoDesdeNumero } from "./utils/codigos";
import type { DocRef } from "@/components/doc-viewer";
import type { Compra, ComprobanteVenta, EventoHistorial, Factura, NotaPedido, OrdenCompra, OrdenDespacho, OrdenServicio, Requerimiento } from "./types";

export type TipoProceso = "COMPRA" | "SERVICIO" | "VENTA" | "PRODUCCION" | "GASTO" | "COMPRA_STOCK";

export const NOMBRE_PROCESO: Record<TipoProceso, string> = {
  COMPRA: "Compra (REQ de Almacén)",
  SERVICIO: "Servicio (REQ → OS)",
  VENTA: "Venta (NP → entrega)",
  PRODUCCION: "Producción (OP → entrega)",
  GASTO: "Gasto de Tesorería",
  COMPRA_STOCK: "Compra con ingreso a stock",
};

/** Etapas fijas de cada proceso: la línea de avance de la historia. */
export const ETAPAS: Record<TipoProceso, string[]> = {
  COMPRA: ["Requerimiento", "Cotización", "Orden de compra", "Pago", "Comprobante", "Ingreso a almacén (V°B°)"],
  SERVICIO: ["Requerimiento", "Orden de servicio", "Aprobación Gerencia", "Comprobante / pago"],
  VENTA: ["Nota de pedido", "Aprobación", "Orden de despacho", "Comprobante", "Cobro", "Entrega al cliente"],
  PRODUCCION: ["Orden de producción", "Materiales", "Control de calidad", "Ingreso a almacén", "Venta", "Entrega al cliente"],
  GASTO: ["Gasto registrado", "OC / OS", "Sustento", "Pago"],
  COMPRA_STOCK: ["Compra registrada", "OC / OS", "Ingreso a almacén", "Pago"],
};

/** Adjunto: "sb:tesoreria/…", data: URL antigua o enlace. Se abre con abrirArchivo(). */
export interface AdjuntoHistoria {
  nombre: string;
  ref: string;
}

export interface DocHistoria {
  clave: string;
  etapa: string; // una de ETAPAS[tipo]
  tipoDoc: string; // "Requerimiento", "Orden de compra"…
  codigo: string;
  fecha?: string; // ISO o YYYY-MM-DD
  estado?: string;
  responsable?: string;
  detalle: string;
  monto?: number;
  hecho: boolean; // false = etapa aún pendiente
  critico?: boolean; // anulado / observado / rechazado
  ver?: DocRef; // visor de documentos del ERP
  pdf?: () => Promise<void>; // PDF del documento (vista previa del ERP)
  adjuntos: AdjuntoHistoria[];
  bitacora: EventoHistorial[];
}

export interface HistoriaProceso {
  id: string; // código raíz
  tipo: TipoProceso;
  titulo: string;
  partes: string; // proveedor / cliente / equipo
  inicio: string;
  fin?: string;
  estado: "EN CURSO" | "CERRADO" | "ANULADO";
  etapaActual: string;
  etapasHechas: string[];
  monto?: number;
  docs: DocHistoria[];
  codigos: string[]; // todos los códigos del proceso (buscador y enlace con Gestión Documentaria)
}

// ------------------------------------------------------------------ utilidades
const up = (s?: string | null) => (s ?? "").trim().toUpperCase();
const ultimo = (h?: EventoHistorial[]) => (h?.length ? h[h.length - 1] : undefined);
const quien = (h?: EventoHistorial[]) => (h?.[0]?.usuario as string | undefined) ?? undefined;
const conAccion = (h: EventoHistorial[] | undefined, re: RegExp) => h?.find((e) => re.test(`${e.accion} ${e.detalle ?? ""}`));
const pdfDe =
  <T>(fn: (m: typeof import("./pdf")) => (x: T) => void, x: T) =>
  async () => {
    const m = await import("./pdf");
    fn(m)(x);
  };

function cerrar(
  p: Omit<HistoriaProceso, "etapaActual" | "etapasHechas" | "fin"> & {
    fin?: string;
  },
): HistoriaProceso {
  const docs = [...p.docs].sort((a, b) => Number(!a.hecho) - Number(!b.hecho) || (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));
  const etapas = ETAPAS[p.tipo];
  const hechas = etapas.filter((e) => docs.some((d) => d.etapa === e && d.hecho));
  const pendiente = etapas.find((e) => !hechas.includes(e));
  const ultimoDoc = [...docs].reverse().find((d) => d.hecho && d.fecha);
  const estado = p.estado === "ANULADO" ? "ANULADO" : pendiente ? p.estado : "CERRADO";
  return {
    ...p,
    docs,
    estado,
    etapasHechas: hechas,
    etapaActual: estado === "ANULADO" ? "Anulado" : pendiente ? `Pendiente: ${pendiente}` : "Proceso completo",
    fin: estado === "CERRADO" ? (p.fin ?? ultimoDoc?.fecha) : p.fin,
    codigos: Array.from(new Set(p.codigos.map(up).filter(Boolean))),
  };
}

function pendienteDoc(etapa: string, detalle: string): DocHistoria {
  return {
    clave: `pend-${etapa}`,
    etapa,
    tipoDoc: etapa,
    codigo: "",
    detalle,
    hecho: false,
    adjuntos: [],
    bitacora: [],
  };
}

const adjuntoVoucher = (o: OrdenCompra): AdjuntoHistoria[] =>
  o.voucherUrl
    ? [
        {
          nombre: o.voucherNombre ?? "Baucher de pago",
          ref: /^(data:|sb:|https?:)/.test(o.voucherUrl) ? o.voucherUrl : `sb:tesoreria/${o.voucherUrl}`,
        },
      ]
    : [];

const adjuntosFactura = (f: Factura): AdjuntoHistoria[] => (f.archivos ?? []).filter((a) => a.dataUrl).map((a) => ({ nombre: `${a.tipo}: ${a.nombre}`, ref: a.dataUrl }));

function docOC(o: OrdenCompra, etapa = "Orden de compra"): DocHistoria {
  return {
    clave: `oc-${o.id}`,
    etapa,
    tipoDoc: "Orden de compra",
    codigo: o.numero,
    fecha: o.fecha,
    estado: o.estado,
    responsable: quien(o.historial),
    detalle: `${o.proveedor} (RUC ${o.ruc}) · ${o.formaPago} · ${o.items.length} ítem(s)`,
    monto: o.total,
    hecho: true,
    ver: { tipo: "OC", id: o.id },
    pdf: pdfDe((m) => m.pdfOrdenCompra, o),
    adjuntos: adjuntoVoucher(o),
    bitacora: o.historial ?? [],
  };
}

function docOS(o: OrdenServicio, etapa = "Orden de servicio"): DocHistoria {
  return {
    clave: `os-${o.id}`,
    etapa,
    tipoDoc: "Orden de servicio",
    codigo: o.numero,
    fecha: o.fecha,
    estado: o.estado,
    responsable: o.creadoPor ?? quien(o.historial),
    detalle: `${o.proveedor} (RUC ${o.ruc}) · ${o.concepto}`,
    monto: o.total,
    hecho: true,
    critico: o.estado === "ANULADA",
    pdf: pdfDe((m) => m.pdfOrdenServicio, o),
    adjuntos: o.adjunto ? [{ nombre: o.adjuntoNombre ?? "Adjunto de la OS", ref: o.adjunto }] : [],
    bitacora: o.historial ?? [],
  };
}

function docFactura(f: Factura, etapa = "Comprobante"): DocHistoria {
  const dj = f.tipo === "DECLARACION_JURADA";
  return {
    clave: `fa-${f.id}`,
    etapa,
    tipoDoc: f.esGastoTesoreria ? "Gasto / comprobante" : dj ? "Declaración jurada" : "Factura de compra",
    codigo: f.codigo ? `${f.codigo} · ${f.numero}` : f.numero,
    fecha: f.fecha,
    estado: f.estadoPago,
    responsable: f.creadoPor ?? quien(f.historial),
    detalle: `${f.proveedor}${f.ruc ? ` (${f.ruc})` : ""}${f.descripcion ? ` · ${f.descripcion}` : ""}${f.djNumero ? ` · ${f.djNumero}` : ""}`,
    monto: f.total,
    hecho: true,
    ver: { tipo: "FACTURA", id: f.id },
    pdf: dj || f.djNumero ? pdfDe((m) => m.pdfDeclaracionJurada, f) : pdfDe((m) => m.pdfFactura, f),
    adjuntos: adjuntosFactura(f),
    bitacora: f.historial ?? [],
  };
}

function docPago(clave: string, codigo: string, b: { tipo: string; nroOperacion?: string; fecha: string; caja: string } | undefined, monto?: number): DocHistoria | null {
  if (!b) return null;
  return {
    clave: `pago-${clave}`,
    etapa: "Pago",
    tipoDoc: "Pago (bancarización)",
    codigo: b.nroOperacion ? `Op. ${b.nroOperacion}` : codigo,
    fecha: b.fecha,
    estado: "PAGADO",
    detalle: `${b.tipo} · ${b.caja}`,
    monto,
    hecho: true,
    adjuntos: [],
    bitacora: [],
  };
}

function ingresosKardex(codigo: string): DocHistoria[] {
  const c = up(codigo);
  if (!c) return [];
  const filas = getKardex().filter(
    (k) =>
      k.tipo_movimiento === "INGRESO" &&
      up(k.documento)
        .split(/\s*·\s*/)
        .includes(c),
  );
  if (!filas.length) return [];
  const f = filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return [
    {
      clave: `ing-${c}`,
      etapa: "Ingreso a almacén (V°B°)",
      tipoDoc: "Ingreso a almacén (kardex)",
      codigo: f[0].documento,
      fecha: f[0].fecha,
      estado: "INGRESADO",
      responsable: f[0].usuario,
      detalle: `${f[0].sede} · ${f.map((k) => `${k.cantidad} ${k.unidad} ${k.producto}`).join(" · ")}${f[0].motivo ? ` · ${f[0].motivo}` : ""}`,
      hecho: true,
      adjuntos: [],
      bitacora: [],
    },
  ];
}

// ------------------------------------------------------------------ COMPRA / SERVICIO desde un REQ
function historiaReq(r: Requerimiento): HistoriaProceso {
  const servicio = r.tipo === "SERVICIO";
  const tipo: TipoProceso = servicio ? "SERVICIO" : "COMPRA";
  const docs: DocHistoria[] = [];
  const codigos = [r.numero];
  docs.push({
    clave: `req-${r.id}`,
    etapa: "Requerimiento",
    tipoDoc: r.origen === "SUCURSAL" ? "Requerimiento de Secocha" : "Requerimiento de Almacén",
    codigo: r.numero,
    fecha: r.fecha,
    estado: r.estado,
    responsable: r.creadoPor ?? r.solicitante,
    detalle: `${r.sede} · ${r.motivo} · ${r.items.length} ítem(s)`,
    hecho: true,
    critico: r.estado === "OBSERVADO",
    ver: { tipo: "REQ", id: r.id },
    pdf: pdfDe((m) => m.pdfRequerimiento, r),
    adjuntos: [],
    bitacora: r.historial ?? [],
  });

  const cotis = getCotizaciones().filter((c) => c.reqId === r.id || up(c.reqNumero) === up(r.numero));
  cotis.forEach((c) => {
    codigos.push(c.numero);
    docs.push({
      clave: `cot-${c.id}`,
      etapa: "Cotización",
      tipoDoc: "Cotización del proveedor",
      codigo: c.numero,
      fecha: c.fechaEmision,
      estado: c.estado,
      responsable: quien(c.historial),
      detalle: `${c.proveedor} (RUC ${c.ruc})`,
      monto: c.total,
      hecho: true,
      ver: { tipo: "COTI", id: c.id },
      pdf: pdfDe((m) => m.pdfCotizacion, c),
      adjuntos: [],
      bitacora: c.historial ?? [],
    });
  });

  const ocs = getOrdenes().filter((o) => o.reqId === r.id || (!!o.reqNumero && up(o.reqNumero) === up(r.numero)));
  const facturas = getFacturas().filter((f) => f.reqId === r.id || ocs.some((o) => o.id === f.ocId));
  const guias = getGuias().filter((g) => ocs.some((o) => o.id === g.ocId));
  ocs.forEach((o) => {
    codigos.push(o.numero);
    docs.push(docOC(o));
    const f = facturas.find((x) => x.ocId === o.id);
    const pago = docPago(o.id, o.numero, o.bancarizacion ?? f?.bancarizacion, o.total);
    if (pago) docs.push(pago);
    const ing = ingresosKardex(o.numero);
    if (ing.length) docs.push(...ing);
    else if (o.vistoBueno)
      docs.push({
        clave: `vb-${o.id}`,
        etapa: "Ingreso a almacén (V°B°)",
        tipoDoc: "V°B° de ingreso",
        codigo: o.numero,
        fecha: o.vistoBueno.fecha,
        estado: "CONFORME",
        responsable: o.vistoBueno.recibidoPor,
        detalle: o.vistoBueno.observaciones || "Ingreso conforme",
        hecho: true,
        pdf: pdfDe(
          (m) => (x: OrdenCompra) =>
            m.pdfActaIngreso(
              x,
              f,
              guias.find((g) => g.ocId === x.id),
            ),
          o,
        ),
        adjuntos: [],
        bitacora: [],
      });
    else if (o.ingresadaAlmacen) {
      const e = conAccion(o.historial, /ingreso a almac/i);
      docs.push({
        clave: `vb-${o.id}`,
        etapa: "Ingreso a almacén (V°B°)",
        tipoDoc: "Ingreso a almacén",
        codigo: o.numero,
        fecha: e?.fecha,
        estado: "INGRESADO",
        responsable: e?.usuario,
        detalle: e?.detalle ?? "Ingreso registrado",
        hecho: true,
        adjuntos: [],
        bitacora: [],
      });
    }
  });
  facturas.forEach((f) => {
    codigos.push(f.numero, f.codigo ?? "", f.djNumero ?? "");
    docs.push(docFactura(f));
  });
  guias.forEach((g) => {
    codigos.push(g.numero);
    docs.push({
      clave: `gr-${g.id}`,
      etapa: "Ingreso a almacén (V°B°)",
      tipoDoc: "Guía de remisión",
      codigo: g.numero,
      fecha: g.fecha,
      estado: g.estado,
      responsable: quien(g.historial),
      detalle: `${g.ocNumero} · ${g.facturaNumero}`,
      hecho: g.estado === "CONFORME",
      critico: g.estado === "OBSERVADA",
      ver: { tipo: "GUIA", id: g.id },
      adjuntos: g.archivoDataUrl ? [{ nombre: g.archivoNombre || "Guía", ref: g.archivoDataUrl }] : [],
      bitacora: g.historial ?? [],
    });
  });

  const oss = getOrdenesServicio().filter((o) => o.reqId === r.id || (!!o.reqNumero && up(o.reqNumero) === up(r.numero)));
  oss.forEach((o) => {
    codigos.push(o.numero);
    docs.push(docOS(o));
    if (o.estado === "APROBADA") {
      const e = conAccion(o.historial, /aprob/i);
      docs.push({
        clave: `osap-${o.id}`,
        etapa: "Aprobación Gerencia",
        tipoDoc: "Aprobación de la OS",
        codigo: o.numero,
        fecha: e?.fecha,
        estado: "APROBADA",
        responsable: o.aprobadoPor ?? e?.usuario,
        detalle: e?.detalle ?? "Aprobada por Gerencia",
        hecho: true,
        adjuntos: [],
        bitacora: [],
      });
    }
    const f = getFacturas().find((x) => x.ocId === o.id || (!!o.gastoId && x.id === o.gastoId));
    if (f && !facturas.includes(f)) {
      codigos.push(f.numero, f.codigo ?? "");
      docs.push(docFactura(f, "Comprobante / pago"));
    }
  });

  // Etapas aún pendientes: se muestran en gris para ver qué falta
  ETAPAS[tipo].forEach((e) => {
    if (!docs.some((d) => d.etapa === e)) docs.push(pendienteDoc(e, servicio && e === "Orden de servicio" ? "Logística debe emitir la OS" : `Falta: ${e.toLowerCase()}`));
  });
  const anulado = oss.length > 0 && oss.every((o) => o.estado === "ANULADA");
  return cerrar({
    id: r.numero,
    tipo,
    titulo: `${servicio ? "Servicio" : "Compra"} · ${r.numero}`,
    partes: [r.sede, ...new Set([...ocs.map((o) => o.proveedor), ...oss.map((o) => o.proveedor)])].filter(Boolean).join(" · "),
    inicio: r.fecha,
    estado: anulado ? "ANULADO" : "EN CURSO",
    fin: r.estado === "FINALIZADO" ? ultimo(r.historial)?.fecha : undefined,
    monto: ocs.reduce((s, o) => s + o.total, 0) + oss.filter((o) => o.estado !== "ANULADA").reduce((s, o) => s + o.total, 0) || undefined,
    docs,
    codigos,
  });
}

// ------------------------------------------------------------------ VENTA desde una NP
function docComprobante(c: ComprobanteVenta): DocHistoria {
  return {
    clave: `cv-${c.id}`,
    etapa: "Comprobante",
    tipoDoc: c.tipo === "NOTA_CREDITO" ? "Nota de crédito" : c.tipo === "NOTA_DEBITO" ? "Nota de débito" : c.tipo === "BOLETA" ? "Boleta de venta" : "Factura de venta",
    codigo: c.numero || "(borrador)",
    fecha: c.fecha,
    estado: `${c.estado} · SUNAT ${c.estadoSunat ?? "-"}`,
    responsable: c.vendedor,
    detalle: `${c.cliente} · ${c.formaPago}${c.saldo > 0 ? ` · saldo ${soles(c.saldo)}` : ""}`,
    monto: c.total,
    hecho: c.estado === "EMITIDO",
    critico: c.estado === "ANULADO" || c.estadoSunat === "RECHAZADO",
    pdf: pdfDe((m) => m.pdfComprobanteVenta, c),
    adjuntos: [],
    bitacora: c.historial ?? [],
  };
}

function docsDespacho(od: OrdenDespacho): DocHistoria[] {
  const codigo = codigoDesdeNumero("OD", od.numero, od.fecha);
  const est = estadoOD(od);
  const out: DocHistoria[] = [
    {
      clave: `od-${od.id}`,
      etapa: "Orden de despacho",
      tipoDoc: "Orden de despacho",
      codigo,
      fecha: od.fecha,
      estado: est,
      responsable: od.creadoPor,
      detalle: `${od.cliente} · ${od.lugarEntrega || od.lugar || ""}${od.agenciaNombre ? ` · ${od.agenciaNombre}` : ""}`,
      hecho: true,
      critico: est === "ANULADO",
      pdf: pdfDe((m) => m.pdfOrdenDespacho, od),
      adjuntos: [],
      bitacora: od.historial ?? [],
    },
  ];
  od.despachos.forEach((m, i) =>
    out.push({
      clave: `odm-${od.id}-${i}`,
      etapa: "Entrega al cliente",
      tipoDoc: "Salida de almacén",
      codigo: m.guiaRemision || codigo,
      fecha: m.fecha,
      estado: "DESPACHADO",
      responsable: m.responsable,
      detalle: `${m.sede}${m.observacion ? ` · ${m.observacion}` : ""}`,
      hecho: true,
      adjuntos: m.foto ? [{ nombre: m.foto.nombre || "Foto del despacho", ref: m.foto.url }] : [],
      bitacora: [],
    }),
  );
  if (est === "PEDIDO_ENTREGADO" || est === "DEJADO_EN_AGENCIA") {
    const e = conAccion(od.historial, /entreg|agencia/i) ?? ultimo(od.historial);
    const adj: AdjuntoHistoria[] = [];
    if (od.firmaCliente?.url)
      adj.push({
        nombre: `Firma del cliente${od.recibidoPor ? ` (${od.recibidoPor})` : ""}`,
        ref: od.firmaCliente.url,
      });
    if (od.fotoGuia?.url)
      adj.push({
        nombre: `Guía de la agencia${od.guiaNro ? ` ${od.guiaNro}` : ""}`,
        ref: od.fotoGuia.url,
      });
    out.push({
      clave: `ent-${od.id}`,
      etapa: "Entrega al cliente",
      tipoDoc: est === "DEJADO_EN_AGENCIA" ? "Dejado en agencia" : "Entregado al cliente",
      codigo,
      fecha: e?.fecha ?? od.actualizado,
      estado: est,
      responsable: od.atendidoPor ?? e?.usuario,
      detalle: est === "DEJADO_EN_AGENCIA" ? `${od.agenciaNombre ?? "Agencia"} · guía ${od.guiaNro || "-"}` : `Recibió ${od.recibidoPor || od.encargadoNombre || od.cliente}`,
      hecho: true,
      adjuntos: adj,
      bitacora: [],
    });
  } else if (est === "PEDIDO_ALISTADO") {
    const e = conAccion(od.historial, /alist/i);
    out.push({
      clave: `ali-${od.id}`,
      etapa: "Orden de despacho",
      tipoDoc: "Pedido alistado",
      codigo,
      fecha: e?.fecha,
      estado: est,
      responsable: od.atendidoPor ?? e?.usuario,
      detalle: "Almacén alistó el pedido",
      hecho: true,
      adjuntos: [],
      bitacora: [],
    });
  }
  return out;
}

function historiaNP(np: NotaPedido): HistoriaProceso {
  const docs: DocHistoria[] = [];
  const codigos = [np.numero, np.origenId ?? ""];
  docs.push({
    clave: `np-${np.id}`,
    etapa: "Nota de pedido",
    tipoDoc: np.origen === "SECOCHA" ? `Nota de pedido (Secocha ${np.origenId ?? ""})` : "Nota de pedido",
    codigo: np.numero,
    fecha: np.fecha,
    estado: np.estado,
    responsable: np.vendedor,
    detalle: `${np.cliente} (${np.clienteDoc}) · ${np.condPagoNombre}${np.lugarObra ? ` · ${np.lugarObra}` : ""}`,
    monto: np.total,
    hecho: true,
    critico: np.estado === "ANULADA",
    pdf: pdfDe((m) => m.pdfNotaPedido, np),
    adjuntos: [],
    bitacora: np.historial ?? [],
  });
  if (np.estado === "APROBADA" || np.estado === "FACTURADA") {
    const e = conAccion(np.historial, /aprob/i);
    docs.push({
      clave: `npap-${np.id}`,
      etapa: "Aprobación",
      tipoDoc: "Aprobación de la NP",
      codigo: np.numero,
      fecha: e?.fecha ?? np.fecha,
      estado: "APROBADA",
      responsable: e?.usuario,
      detalle: e?.detalle ?? "Nota de pedido aprobada",
      hecho: true,
      adjuntos: [],
      bitacora: [],
    });
  }
  const ods = getDespachos().filter((o) => o.npId === np.id || o.id === np.odId);
  const comps = getComprobantes().filter((c) => c.npId === np.id || ods.some((o) => o.comprobanteId && o.comprobanteId === c.id) || c.id === np.comprobanteId);
  const notas = getComprobantes().filter((c) => c.ref && comps.some((x) => x.id === c.ref!.id));
  [...comps, ...notas].forEach((c) => {
    codigos.push(c.numero);
    docs.push(docComprobante(c));
  });
  if (np.comprobanteExterno) {
    const ce = np.comprobanteExterno;
    codigos.push(ce.numero);
    docs.push({
      clave: `cex-${np.id}`,
      etapa: "Comprobante",
      tipoDoc: `${ce.tipo} (sistema externo)`,
      codigo: ce.numero,
      fecha: ce.fecha,
      estado: "EMITIDO",
      responsable: ce.registradoPor,
      detalle: "Comprobante emitido fuera del ERP",
      hecho: true,
      adjuntos: [],
      bitacora: [],
    });
  }
  getCobros()
    .filter((c) => c.npId === np.id || comps.some((x) => x.id === c.comprobanteId))
    .forEach((c) =>
      docs.push({
        clave: `cob-${c.id}`,
        etapa: "Cobro",
        tipoDoc: "Cobro",
        codigo: c.referencia ? `Op. ${c.referencia}` : c.comprobanteNumero || np.numero,
        fecha: c.fecha,
        estado: "COBRADO",
        responsable: c.usuario,
        detalle: `${c.medio} · ${c.cuenta}${c.observacion ? ` · ${c.observacion}` : ""}`,
        monto: c.monto,
        hecho: true,
        adjuntos: [],
        bitacora: [],
      }),
    );
  ods.forEach((o) => {
    codigos.push(o.numero, codigoDesdeNumero("OD", o.numero, o.fecha), o.guiaNro ?? "", o.trasladoCodigo ?? "");
    docs.push(...docsDespacho(o));
  });
  ETAPAS.VENTA.forEach((e) => {
    if (!docs.some((d) => d.etapa === e)) docs.push(pendienteDoc(e, `Falta: ${e.toLowerCase()}`));
  });
  return cerrar({
    id: np.numero,
    tipo: "VENTA",
    titulo: `Venta · ${np.numero}`,
    partes: np.cliente,
    inicio: np.fecha,
    estado: np.estado === "ANULADA" ? "ANULADO" : "EN CURSO",
    monto: np.total,
    docs,
    codigos,
  });
}

// ------------------------------------------------------------------ PRODUCCIÓN desde una OP
function historiaOP(op: OrdenProduccion, equipos: EquipoTerminado[]): HistoriaProceso {
  const docs: DocHistoria[] = [];
  const codigos = [op.id, op.codigo_chasis];
  docs.push({
    clave: `op-${op.id}`,
    etapa: "Orden de producción",
    tipoDoc: "Orden de producción",
    codigo: op.id,
    fecha: op.creado || op.fecha,
    estado: op.estado,
    responsable: op.creado_por,
    detalle: `${op.tipo_equipo} ${op.modelo} · chasis ${op.codigo_chasis || "-"} · motor ${op.marca_motor} ${op.serie_motor}`,
    hecho: true,
    critico: !!op.anulacion,
    adjuntos: [],
    bitacora: [],
  });
  consumosDeChasis(op.codigo_chasis, op.id).forEach((v) => {
    codigos.push(v.id);
    docs.push({
      clave: `vpi-${v.id}`,
      etapa: "Materiales",
      tipoDoc: "Vale de producción",
      codigo: v.id,
      fecha: v.fecha,
      estado: "ENTREGADO",
      responsable: v.usuario,
      detalle: `${v.cantidad} ${v.unidad} ${v.producto} · ${v.motivo} · autoriza ${v.autoriza}`,
      hecho: true,
      adjuntos: [],
      bitacora: [],
    });
  });
  if (op.qc)
    docs.push({
      clave: `qc-${op.id}`,
      etapa: "Control de calidad",
      tipoDoc: "V°B° de calidad (QC)",
      codigo: op.id,
      fecha: op.qc.aprobado || op.qc.fecha,
      estado: "APROBADO",
      responsable: op.qc.supervisor,
      detalle: `${op.qc.observaciones || "Sin observaciones"} · aprobó ${op.qc.aprobado_por}`,
      hecho: true,
      adjuntos: op.qc.firma?.url ? [{ nombre: "Firma del supervisor QC", ref: op.qc.firma.url }] : [],
      bitacora: [],
    });
  const e = equipos.find((x) => x.op_id === op.id || x.id === op.equipo_id);
  if (e) {
    codigos.push(e.id);
    const ing = getMovimientos().find((m) => m.tipo === "INGRESO" && (m.equipo_id === e.id || up(m.chasis) === up(e.codigo_chasis)));
    docs.push({
      clave: `eq-${e.id}`,
      etapa: "Ingreso a almacén",
      tipoDoc: "Equipo terminado",
      codigo: e.id,
      fecha: ing?.fecha ?? e.fecha_ingreso ?? e.fecha_fabricacion,
      estado: e.estado,
      responsable: e.creado_por,
      detalle: `${e.tipo_equipo} ${e.modelo} · ${e.sede}`,
      hecho: true,
      adjuntos: (e.fotos ?? []).map((f, i) => ({
        nombre: f.nombre || `Foto ${i + 1}`,
        ref: f.url,
      })),
      bitacora: [],
    });
    const od = getDespachos().find((o) => o.estado !== "ANULADO" && o.items.some((l) => equipoDeLinea(l, [e])));
    if (od) {
      const np = getNotasPedido().find((n) => n.id === od.npId);
      if (np) {
        codigos.push(np.numero);
        docs.push({
          clave: `np-${np.id}`,
          etapa: "Venta",
          tipoDoc: "Nota de pedido",
          codigo: np.numero,
          fecha: np.fecha,
          estado: np.estado,
          responsable: np.vendedor,
          detalle: np.cliente,
          monto: np.total,
          hecho: true,
          pdf: pdfDe((m) => m.pdfNotaPedido, np),
          adjuntos: [],
          bitacora: np.historial ?? [],
        });
      }
      codigos.push(od.numero, codigoDesdeNumero("OD", od.numero, od.fecha));
      const d = docsDespacho(od).map((x) => (x.etapa === "Orden de despacho" ? { ...x, etapa: "Venta" } : x));
      docs.push(...d);
    }
    if (e.estado === "VENDIDO" && !docs.some((d) => d.etapa === "Entrega al cliente"))
      docs.push({
        clave: `sal-${e.id}`,
        etapa: "Entrega al cliente",
        tipoDoc: "Salida del equipo",
        codigo: e.vendido_od ?? e.id,
        fecha: e.fecha_salida,
        estado: "VENDIDO",
        detalle: `Cliente ${e.cliente ?? "-"}`,
        hecho: true,
        adjuntos: [],
        bitacora: [],
      });
  }
  ETAPAS.PRODUCCION.forEach((x) => {
    if (!docs.some((d) => d.etapa === x)) docs.push(pendienteDoc(x, x === "Materiales" ? "Sin vales de producción registrados" : `Falta: ${x.toLowerCase()}`));
  });
  return cerrar({
    id: op.id,
    tipo: "PRODUCCION",
    titulo: `Producción · ${op.id}`,
    partes: `${op.tipo_equipo} ${op.modelo}`.trim(),
    inicio: op.fecha,
    estado: op.anulacion ? "ANULADO" : "EN CURSO",
    docs,
    codigos,
  });
}

// ------------------------------------------------------------------ GASTO de Tesorería
function historiaGasto(f: Factura): HistoriaProceso {
  const id = f.codigo || f.numero;
  const docs: DocHistoria[] = [{ ...docFactura(f, "Gasto registrado"), tipoDoc: "Gasto registrado" }];
  const codigos = [id, f.numero, f.djNumero ?? "", f.cotizacionProveedor ?? ""];
  if (f.comprobanteGasto && f.comprobanteGasto !== "SIN_COMPROBANTE")
    docs.push({
      ...docFactura(f, "Sustento"),
      clave: `sus-${f.id}`,
      tipoDoc: `Comprobante ${f.comprobanteGasto}`,
    });
  if (f.djNumero)
    docs.push({
      ...docFactura(f, "Sustento"),
      clave: `dj-${f.id}`,
      tipoDoc: "Declaración jurada",
      codigo: f.djNumero,
      estado: f.djEstado ?? "PENDIENTE",
    });
  getOrdenes()
    .filter((o) => o.gastoId === f.id || (!!f.ocId && o.id === f.ocId))
    .forEach((o) => {
      codigos.push(o.numero);
      docs.push(docOC(o, "OC / OS"));
    });
  getOrdenesServicio()
    .filter((o) => o.gastoId === f.id)
    .forEach((o) => {
      codigos.push(o.numero);
      docs.push(docOS(o, "OC / OS"));
    });
  const pago = docPago(f.id, id, f.bancarizacion, f.netoPagar ?? f.total);
  if (pago) docs.push(pago);
  else if (f.estadoPago === "PAGADA")
    docs.push({
      clave: `pg-${f.id}`,
      etapa: "Pago",
      tipoDoc: "Pago",
      codigo: id,
      estado: "PAGADA",
      detalle: f.caja ?? "Pagado",
      hecho: true,
      adjuntos: [],
      bitacora: [],
    });
  ETAPAS.GASTO.forEach((e) => {
    if (!docs.some((d) => d.etapa === e)) docs.push(pendienteDoc(e, e === "OC / OS" ? "Sin OC ni OS (opcional en gastos)" : `Falta: ${e.toLowerCase()}`));
  });
  return cerrar({
    id,
    tipo: "GASTO",
    titulo: `Gasto · ${id}`,
    partes: f.proveedor,
    inicio: f.fecha,
    estado: "EN CURSO",
    monto: f.total,
    docs,
    codigos,
  });
}

// ------------------------------------------------------------------ COMPRA con ingreso a stock
function historiaCompra(c: Compra): HistoriaProceso {
  const id = c.numero;
  const docs: DocHistoria[] = [
    {
      clave: `cd-${c.id}`,
      etapa: "Compra registrada",
      tipoDoc: `Compra con ingreso a stock (${c.tipoComprobante})`,
      codigo: c.numero,
      fecha: c.fecha,
      estado: c.pago?.estado ?? "REGISTRADA",
      responsable: c.creadoPor ?? quien(c.historial),
      detalle: `${c.proveedor} (RUC ${c.ruc}) · ${c.sede} · ${c.items.length} ítem(s)${c.djNumero ? ` · ${c.djNumero}` : ""}`,
      monto: c.total,
      hecho: true,
      adjuntos: [],
      bitacora: c.historial ?? [],
    },
  ];
  const codigos = [c.numero, c.djNumero ?? ""];
  const oc = getOrdenes().find((o) => o.compraId === c.id || o.id === c.ordenCompraId);
  const os = getOrdenesServicio().find((o) => o.compraId === c.id || o.id === c.ordenServicioId);
  if (oc) {
    codigos.push(oc.numero);
    docs.push(docOC(oc, "OC / OS"));
    docs.push(
      ...ingresosKardex(oc.numero).map((d) => ({
        ...d,
        etapa: "Ingreso a almacén",
      })),
    );
  }
  if (os) {
    codigos.push(os.numero);
    docs.push(docOS(os, "OC / OS"));
  }
  if (!docs.some((d) => d.etapa === "Ingreso a almacén")) {
    const k = getKardex().find((x) => x.tipo_movimiento === "INGRESO" && up(x.documento).includes(up(c.numero)));
    if (k)
      docs.push({
        clave: `ingc-${c.id}`,
        etapa: "Ingreso a almacén",
        tipoDoc: "Ingreso a almacén (kardex)",
        codigo: k.documento,
        fecha: k.fecha,
        estado: "INGRESADO",
        responsable: k.usuario,
        detalle: c.sede,
        hecho: true,
        adjuntos: [],
        bitacora: [],
      });
  }
  const pago = docPago(c.id, c.numero, c.pago?.bancarizacion, c.total);
  if (pago) docs.push(pago);
  ETAPAS.COMPRA_STOCK.forEach((e) => {
    if (!docs.some((d) => d.etapa === e)) docs.push(pendienteDoc(e, `Falta: ${e.toLowerCase()}`));
  });
  return cerrar({
    id,
    tipo: "COMPRA_STOCK",
    titulo: `Compra · ${c.numero}`,
    partes: c.proveedor,
    inicio: c.fecha,
    estado: "EN CURSO",
    monto: c.total,
    docs,
    codigos,
  });
}

// ------------------------------------------------------------------ API
/** Todos los procesos que el usuario puede ver (lo que su rol ya puede leer de cada módulo). */
export function listarProcesos(): HistoriaProceso[] {
  const reqs = new Map<string, Requerimiento>();
  [...getPendientes(), ...getProcesados()].forEach((r) => reqs.set(r.id, r));
  const equipos = getEquipos();
  const out: HistoriaProceso[] = [
    ...[...reqs.values()].map(historiaReq),
    ...getNotasPedido().map(historiaNP),
    ...getOrdenesProduccion().map((op) => historiaOP(op, equipos)),
    ...getFacturas()
      .filter((f) => f.esGastoTesoreria && !f.reqId)
      .map(historiaGasto),
    ...getCompras().map(historiaCompra),
  ];
  return out.sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""));
}

/** Proceso que contiene un código (REQ, OC, factura, NP, OD, OP, GST…), exacto primero. */
export function buscarProceso(codigo: string, procesos: HistoriaProceso[] = listarProcesos()): HistoriaProceso | undefined {
  const c = up(codigo);
  if (!c) return undefined;
  return procesos.find((p) => up(p.id) === c) ?? procesos.find((p) => p.codigos.includes(c)) ?? procesos.find((p) => p.codigos.some((x) => x.includes(c)));
}

/** ¿El "Código en otro módulo" de un documento de Gestión Documentaria apunta a este proceso? */
export function referenciaDeProceso(referencia: string | null | undefined, p: HistoriaProceso): boolean {
  const partes = up(referencia)
    .split(/[\s,;/|]+/)
    .filter((x) => x.length >= 3);
  return partes.some((x) => p.codigos.includes(x));
}

export const duracionDias = (p: HistoriaProceso): number => {
  const a = new Date((p.inicio ?? "").slice(0, 10) + "T00:00:00").getTime();
  const b = p.fin ? new Date(p.fin.slice(0, 10) + "T00:00:00").getTime() : Date.now();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0;
};

export const fechaHistoria = (f?: string): string => {
  if (!f) return "—";
  if (f.length <= 10) return fechaPE(f);
  const d = new Date(f);
  return Number.isNaN(d.getTime())
    ? fechaPE(f)
    : d.toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      });
};
