"use client";

import type { jsPDF } from "jspdf";
import { EMPRESA } from "@/lib/empresa";
import { TIPOS_SERVICIO } from "@/lib/contratistas";
import { cargarLogo, construir } from "@/lib/pdf";
import { SERVICIOS_CONTRATISTA, fechaPE, hoy, soles } from "@/lib/storage";
import type { ConcesionContratista, Trabajador } from "@/lib/types";

export type TipoRecibo = "CONTRATISTA" | "CONCESION";

/** Estado mostrado de un contratista: INACTIVO (dado de baja), FINALIZADO (pasó la fecha de fin) o ACTIVO. */
export const estadoContratista = (t: Trabajador) => (!t.activo ? "INACTIVO" : t.fechaFinContrato && t.fechaFinContrato < hoy() ? "FINALIZADO" : "ACTIVO");

const fecha = (f?: string) => (f ? fechaPE(f) : "—");
const firmas = [EMPRESA.razonSocial, "EL CONTRATISTA"];

/**
 * Recibo de servicio (contratista del maestro) o de concesión / servicio externo,
 * con la misma plantilla de Facturas y Órdenes de Compra. Función pura: devuelve el jsPDF sin guardarlo.
 */
export function generatePDF(data: Trabajador, tipo: "CONTRATISTA"): jsPDF;
export function generatePDF(data: ConcesionContratista, tipo: "CONCESION"): jsPDF;
export function generatePDF(data: Trabajador | ConcesionContratista, tipo: TipoRecibo): jsPDF {
  if (tipo === "CONTRATISTA") {
    const t = data as Trabajador;
    const servicio = t.tipoServicio ? SERVICIOS_CONTRATISTA[t.tipoServicio] : "Sin servicio";
    return construir({
      titulo: "RECIBO DE SERVICIO",
      numero: t.id,
      estado: estadoContratista(t),
      datos: [
        ["Contratista", t.nombre],
        ["DNI / RUC", [t.dni && `DNI ${t.dni}`, t.ruc && `RUC ${t.ruc}`].filter(Boolean).join(" · ") || "-"],
        ["Empresa", t.empresa || "-"],
        ["Servicio", servicio],
        ["Sede", t.sede || "-"],
        ["Forma de pago", t.formaPagoContrato || "-"],
        ["Inicio", fecha(t.fechaIngreso)],
        ["Fin", fecha(t.fechaFinContrato)],
        ["Emitido", fechaPE(hoy())],
      ],
      head: ["Concepto", "Detalle", "Importe"],
      body: [[servicio, `${t.empresa || t.nombre} · ${fecha(t.fechaIngreso)} al ${fecha(t.fechaFinContrato)}`, soles(t.sueldo)]],
      alinearDerecha: [2],
      totales: [["MONTO CONTRATADO", soles(t.sueldo)]],
      firmas,
    });
  }

  const c = data as ConcesionContratista;
  const servicio = TIPOS_SERVICIO[c.tipoServicio] ?? c.tipoServicio;
  const pagado = (c.adelanto || 0) + (c.pagos ?? []).reduce((s, p) => s + p.monto, 0);
  return construir({
    titulo: "RECIBO DE CONCESION / SERVICIO EXTERNO",
    numero: c.codigo || c.id.slice(0, 8).toUpperCase(),
    estado: c.estado,
    datos: [
      ["Razón social", c.razonSocial],
      ["RUC / DNI", c.ruc || "-"],
      ["Representante", c.representante || "-"],
      ["Servicio", servicio],
      ["Sede", c.sede || "-"],
      ["Vigencia", `${fecha(c.fecha_inicio)} al ${fecha(c.fecha_fin)}`],
    ],
    head: ["Fecha", "Forma de pago", "Importe"],
    body: [
      ...(c.adelanto ? [[fecha(c.fecha_inicio), `Adelanto${c.cajaAdelanto ? ` · ${c.cajaAdelanto}` : ""}`, soles(c.adelanto)]] : []),
      ...(c.pagos ?? []).map((p) => [fecha(p.fecha), `${p.medio}${p.caja ? ` · ${p.caja}` : ""}${p.nota ? ` · ${p.nota}` : ""}`, soles(p.monto)]),
    ],
    alinearDerecha: [2],
    totales: [
      ["Monto", soles(c.monto_total)],
      ["Pagado", soles(pagado)],
      ["SALDO", soles(Math.max(0, c.monto_total - pagado))],
    ],
    notas: c.descripcion ? [`Servicio: ${c.descripcion}`] : [],
    firmas,
  });
}

/** Recibo-{NOMBRE}-{FECHA}.pdf */
const nombreArchivo = (nombre: string) =>
  `Recibo-${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/[^A-Za-z0-9]+/g, "_")}-${hoy()}.pdf`;

/** Descarga directa del recibo (botón PDF de la tabla). */
export async function descargarRecibo(data: Trabajador, tipo: "CONTRATISTA"): Promise<void>;
export async function descargarRecibo(data: ConcesionContratista, tipo: "CONCESION"): Promise<void>;
export async function descargarRecibo(data: Trabajador | ConcesionContratista, tipo: TipoRecibo): Promise<void> {
  await cargarLogo();
  const doc = tipo === "CONTRATISTA" ? generatePDF(data as Trabajador, tipo) : generatePDF(data as ConcesionContratista, tipo);
  const nombre = tipo === "CONTRATISTA" ? (data as Trabajador).nombre : (data as ConcesionContratista).razonSocial;
  doc.setProperties({ title: nombreArchivo(nombre).replace(/\.pdf$/, "") });
  doc.save(nombreArchivo(nombre));
}
