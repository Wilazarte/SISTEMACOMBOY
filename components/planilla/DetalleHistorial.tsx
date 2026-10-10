"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, Lock } from "lucide-react";
import { Button, Card, CardHeader, Empty, Table, Td } from "@/components/ui";
import { toast } from "@/components/ui";
import { adelantosDelTrabajador, adelantosDescontadosEn } from "@/lib/adelantos";
import type { HistorialDetalle, HistorialPlanilla } from "@/lib/historial";
import { pdfBoletaPago, pdfPlanillaHistorial } from "@/lib/pdf";
import { codigoBoleta, fechaPE, soles } from "@/lib/storage";
import { useHistorialDetalle } from "./useHistorialPlanilla";

const horasTxt = (h: number) => h.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/**
 * Boleta de un periodo cerrado: montos del historial (no se recalculan) y cada adelanto descontado en ese pago.
 * Usa el mismo código BOL-xxx-AAAA si la boleta ya se emitió.
 */
async function boletaHistorial(h: HistorialPlanilla, d: HistorialDetalle): Promise<void> {
  try {
    const adelantos = d.adelantos ? adelantosDelTrabajador({ id: d.trabajador_id, nombre: d.nombre, dni: d.dni }, await adelantosDescontadosEn(h.id)) : [];
    const codigo = await codigoBoleta(h.periodo, d.trabajador_id, d.nombre, d.total_pagar);
    pdfBoletaPago(
      {
        periodo: h.periodo,
        id: d.trabajador_id,
        nombre: d.nombre,
        dni: d.dni ?? "",
        cargo: d.cargo ?? "",
        fechaIngreso: d.fecha_ingreso ?? "",
        pension: d.pension || "-",
        afpPorcentaje: d.afp_porcentaje,
        sueldo: `${d.tipo_sueldo ?? ""} ${soles(d.sueldo)}`.trim(),
        sueldoDiario: d.dias ? Math.round((d.bruto / d.dias) * 100) / 100 : 0,
        valorHora: `S/ ${d.valor_hora.toFixed(4)}`,
        modo: "Planilla cerrada",
        basicoDetalle: `${d.dias} días · ${horasTxt(d.horas)} h`,
        basico: d.bruto,
        horasExtra: "Incluidas en la remuneración básica",
        montoExtra: 0,
        bruto: d.bruto,
        descuentoAfp: d.descuento_afp,
        adelantos: d.adelantos,
        adelantosDetalle: adelantos,
        totalPagar: d.total_pagar,
      },
      codigo
    );
  } catch (e) {
    toast(e instanceof Error ? e.message : "No se pudo generar la boleta", "error");
  }
}

/** Planilla cerrada, tal como se vio al cerrar la semana (solo lectura). */
export function DetalleHistorial({ id }: { id: string }) {
  const { datos, cargando, error } = useHistorialDetalle(id);
  const volver = (
    <Link href="/dashboard/planilla?tab=historial" className="inline-flex items-center gap-1.5 text-sm font-medium text-plomo-600 hover:text-azul-900">
      <ArrowLeft size={16} /> Volver al historial
    </Link>
  );

  if (cargando) return <p className="py-16 text-center text-sm text-slate-400">Cargando periodo…</p>;
  if (error || !datos)
    return (
      <div className="w-full space-y-4">
        {volver}
        <Card>
          <div className="p-5">
            <Empty icon={<Lock size={28} />} text={error ?? "Este periodo no existe en el historial."} />
          </div>
        </Card>
      </div>
    );

  const { cabecera: h, detalle } = datos;
  return (
    <div className="w-full space-y-6">
      {volver}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-serif text-[36px] font-light leading-tight text-azul-900 lg:text-[42px]">
            <Lock size={20} className="text-slate-400" /> {h.periodo}
          </h1>
          <p className="mt-1 text-[13px] text-plomo-600">
            Cerrada el {new Date(h.fecha_cierre).toLocaleString("es-PE")}
            {h.creado_por ? ` por ${h.creado_por}` : ""}
            {h.asistencia_desde ? ` · asistencia del ${fechaPE(h.asistencia_desde)} al ${fechaPE(h.asistencia_hasta ?? h.asistencia_desde)}` : ""}
          </p>
        </div>
        <Button variant="warning" onClick={() => pdfPlanillaHistorial(h, detalle)}>
          <FileDown size={16} /> Descargar PDF
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
          Trabajadores: <b>{h.cantidad_trabajadores}</b>
        </div>
        <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
          Total horas: <b>{horasTxt(h.total_horas)}</b>
        </div>
        <div className="rounded-xl border border-plomo-200 bg-white p-3 text-sm shadow-sm">
          Total bruto: <b>{soles(h.total_bruto)}</b>
          <p className="text-xs text-red-600">Descuentos: - {soles(h.total_descuento)}</p>
        </div>
        <div className="rounded-xl bg-azul-900 p-3 text-sm text-white">
          Total pagado: <b className="text-white">{soles(h.total_pagar)}</b>
          <p className="text-xs text-slate-400">
            Neto {soles(h.total_neto)} − adelantos {soles(h.total_adelantos)}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title={`Planilla · ${h.periodo}`} subtitle="Copia permanente guardada al cerrar la semana. Solo lectura: no cambia aunque se modifique la asistencia o los trabajadores." />
        <Table head={["N°", "Trabajador", "F. ingreso", "Sueldo / Tipo", "Pensión", "Días", "Horas", "Tard.", "Bruto", "Dscto", "Neto", "Adelantos", "Total pagado", ""]} empty={detalle.length === 0}>
          {detalle.map((d) => (
            <tr key={d.id}>
              <Td className="font-mono">{d.trabajador_id}</Td>
              <Td>
                <p className="font-semibold text-azul-900">{d.nombre}</p>
                <p className="text-xs text-plomo-500">
                  {d.dni || "-"} · {d.cargo || "-"}
                </p>
              </Td>
              <Td>{d.fecha_ingreso ? fechaPE(d.fecha_ingreso) : "-"}</Td>
              <Td>
                {soles(d.sueldo)}
                <p className="text-xs text-plomo-500">{d.tipo_sueldo || "-"}</p>
              </Td>
              <Td>
                {d.pension || "-"}
                <p className="text-xs text-plomo-500">{d.afp_porcentaje}%</p>
              </Td>
              <Td className="text-center">{d.dias}</Td>
              <Td className="text-center font-semibold">
                {horasTxt(d.horas)}
                <p className="text-[10px] font-normal text-plomo-500">S/ {d.valor_hora.toFixed(4)}/h</p>
              </Td>
              <Td className="text-center">{d.tardanzas}</Td>
              <Td className="text-right">{soles(d.bruto)}</Td>
              <Td className="text-right text-red-600">- {soles(d.descuento_afp)}</Td>
              <Td className="text-right">{soles(d.neto)}</Td>
              <Td className="text-right text-red-600">{d.adelantos ? `- ${soles(d.adelantos)}` : "-"}</Td>
              <Td className="text-right font-bold">{soles(d.total_pagar)}</Td>
              <Td>
                <Button size="sm" variant="secondary" onClick={() => void boletaHistorial(h, d)} title="Boleta de pago de este periodo">
                  <FileDown size={14} /> Boleta
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
