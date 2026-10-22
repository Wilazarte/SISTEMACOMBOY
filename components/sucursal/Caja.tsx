"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Send, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Table, Td, ejecutar, ejecutarAsync } from "@/components/ui";
import { ListaDocs, type FilaDoc } from "@/components/ui/ListaDocs";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { fechaPE, hoy, r2, soles } from "@/lib/storage";
import { CATEGORIAS_EGRESO, declararCierre, esTesoreria, operaSucursal, recibirCierre, registrarMovCaja, saldoCaja, type CategoriaCaja, type CierreCaja, type MovCaja } from "@/lib/sucursal";
import { Indicador } from "./comun";

const CATEGORIA: Record<CategoriaCaja, string> = { APERTURA: "Apertura / reposición", VENTA: "Venta", COBRO: "Cobro", GASTO_LOCAL: "Gasto local", MOVILIDAD: "Movilidad", OTRO: "Otro" };

// =====================================================================
// 6. CAJA CHICA: ingresos (ventas), egresos (gastos locales, movilidad), saldo, cierre diario -> Tesorería
// =====================================================================
export function CajaChica({ movs, cierres }: { movs: MovCaja[]; cierres: CierreCaja[] }) {
  const { showForm, setShowForm } = useTogglePanel();
  const [tipo, setTipo] = useState<"INGRESO" | "EGRESO">("EGRESO");
  const opera = operaSucursal();
  const tesoreria = esTesoreria();
  const saldo = saldoCaja(movs);
  const hoyStr = hoy();
  const deHoy = movs.filter((m) => m.fecha === hoyStr);
  const ingHoy = r2(deHoy.filter((m) => m.tipo === "INGRESO").reduce((a, m) => a + m.monto, 0));
  const egrHoy = r2(deHoy.filter((m) => m.tipo === "EGRESO").reduce((a, m) => a + m.monto, 0));
  const sinCerrar = movs.filter((m) => !m.cierreId).length;
  const ultimo = cierres[0];

  const abrir = (t: "INGRESO" | "EGRESO") => {
    setTipo(t);
    setShowForm(true);
  };
  const cerrar = () => {
    if (!confirm(`¿Declarar el cierre de caja de hoy con saldo ${soles(saldo)}? Se envía a Tesorería Principal.`)) return;
    void ejecutarAsync(() => declararCierre(), "Cierre declarado y enviado a Tesorería Principal");
  };

  const filas: FilaDoc[] = movs.map((m) => ({
    id: m.id,
    fecha: m.fecha,
    contraparte: m.concepto,
    buscar: `${m.concepto} ${CATEGORIA[m.categoria]}`,
    tipoDoc: m.tipo,
    estado: m.cierreId ? "CERRADO" : "ABIERTO",
    ref: (
      <span className="flex items-center gap-1.5">
        {m.tipo === "INGRESO" ? <ArrowUpCircle size={14} className="text-emerald-400" /> : <ArrowDownCircle size={14} className="text-rojo" />}
        {CATEGORIA[m.categoria]}
        {m.cierreId && <span className="text-[11px] text-plomo-500">· cerrado</span>}
      </span>
    ),
    total: <span className={m.tipo === "INGRESO" ? "text-emerald-400" : "text-rojo"}>{`${m.tipo === "INGRESO" ? "+" : "-"} ${soles(m.monto)}`}</span>,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icon={<Wallet size={14} />} label="Saldo actual" valor={soles(saldo)} alerta={saldo < 0} detalle={`${sinCerrar} movimiento(s) sin cerrar`} />
        <Indicador icon={<ArrowUpCircle size={14} />} label="Ingresos de hoy" valor={soles(ingHoy)} />
        <Indicador icon={<ArrowDownCircle size={14} />} label="Egresos de hoy" valor={soles(egrHoy)} />
        <Indicador icon={<Lock size={14} />} label="Último cierre" valor={ultimo ? soles(ultimo.saldoFinal) : "-"} detalle={ultimo ? `${ultimo.numero} · ${fechaPE(ultimo.fecha)} · ${ultimo.estado === "recibido" ? "recibido" : "por recibir"}` : "Sin cierres"} />
      </div>

      {showForm && opera && <FormMov tipo={tipo} onListo={() => setShowForm(false)} />}

      <Card>
        <CardHeader
          title="Movimientos de caja chica"
          subtitle="Las ventas al contado y los cobros entran solos; registre aquí gastos locales y movilidad"
          action={
            opera ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => abrir("EGRESO")}>
                  <ArrowDownCircle size={14} /> Registrar egreso
                </Button>
                <Button size="sm" variant="secondary" onClick={() => abrir("INGRESO")}>
                  <ArrowUpCircle size={14} /> Ingreso / reposición
                </Button>
                <Button size="sm" onClick={cerrar} disabled={sinCerrar === 0}>
                  <Send size={14} /> Declarar cierre
                </Button>
              </div>
            ) : undefined
          }
        />
        <ListaDocs filas={filas} tipo="caja" conAcciones={false} />
      </Card>

      <Card>
        <CardHeader title="Cierres diarios enviados a Tesorería Principal" subtitle={tesoreria ? "Tesorería: marque cada cierre como recibido" : undefined} />
        <Table head={["Fecha", "Cierre", "Saldo inicial", "Ingresos", "Egresos", "Saldo final", "Estado", "Acción"]} empty={cierres.length === 0}>
          {cierres.map((c) => (
            <tr key={c.id}>
              <Td>{fechaPE(c.fecha)}</Td>
              <Td className="font-semibold text-fg">{c.numero}</Td>
              <Td className="text-right">{soles(c.saldoInicial)}</Td>
              <Td className="text-right text-emerald-400">{soles(c.ingresos)}</Td>
              <Td className="text-right text-rojo">{soles(c.egresos)}</Td>
              <Td className="text-right font-semibold">{soles(c.saldoFinal)}</Td>
              <Td>
                <Badge estado={c.estado === "recibido" ? "RECIBIDO" : "ENVIADO"} />
              </Td>
              <Td>
                {tesoreria && c.estado === "enviado" ? (
                  <Button size="sm" onClick={() => ejecutar(() => recibirCierre(c.id), `${c.numero} recibido por Tesorería`)}>
                    Recibido
                  </Button>
                ) : (
                  <span className="text-xs text-plomo-500">{c.recibidoPor ? `Recibió ${c.recibidoPor}` : "-"}</span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function FormMov({ tipo, onListo }: { tipo: "INGRESO" | "EGRESO"; onListo: () => void }) {
  const [categoria, setCategoria] = useState<CategoriaCaja>(tipo === "EGRESO" ? "GASTO_LOCAL" : "APERTURA");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const opciones = tipo === "EGRESO" ? CATEGORIAS_EGRESO : [{ value: "APERTURA" as const, label: "Apertura / reposición de caja" }, { value: "OTRO" as const, label: "Otro ingreso" }];
  return (
    <Card>
      <CardHeader title={tipo === "EGRESO" ? "Registrar egreso" : "Registrar ingreso"} />
      <div className="grid gap-4 p-5 md:grid-cols-4">
        <Field label="Categoría">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCaja)} options={opciones} />
        </Field>
        <Field label="Concepto *" className="md:col-span-2">
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={tipo === "EGRESO" ? "Taxi al banco, útiles de limpieza…" : "Fondo inicial de caja"} />
        </Field>
        <Field label="Monto S/ *">
          <Input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 md:col-span-4">
          <Button variant="ghost" onClick={onListo}>
            Cancelar
          </Button>
          <Button onClick={() => ejecutar(() => registrarMovCaja({ tipo, categoria, concepto, monto: Number(monto) }), tipo === "EGRESO" ? "Egreso registrado" : "Ingreso registrado") && onListo()}>
            Guardar
          </Button>
        </div>
      </div>
    </Card>
  );
}
