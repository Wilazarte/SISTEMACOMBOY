"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { KEYS, fechaPE, hoy, puede, r2, soles, useRol, useStore } from "@/lib/storage";
import { estadoCxC, registrarCobro, tipoLabel, type EstadoCxC } from "@/lib/ventas";
import type { CobroVenta, ComprobanteVenta } from "@/lib/types";
import { CUENTAS_COBRO } from "./comun";

export function CuentasPorCobrar() {
  const [rol] = useRol();
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const cobros = useStore<CobroVenta[]>(KEYS.COBROS, []);
  const [filtro, setFiltro] = useState<"" | EstadoCxC>("");
  const [sel, setSel] = useState<ComprobanteVenta | null>(null);
  const [datos, setDatos] = useState({ monto: 0, cuenta: CUENTAS_COBRO[0], referencia: "", fecha: hoy() });
  const habilitado = puede(rol, "venta.cobrar");

  // Comprobantes emitidos a crédito o con saldo
  const cxc = comprobantes
    .filter((c) => c.estado === "EMITIDO" && (c.formaPago !== "CONTADO" || c.saldo > 0))
    .map((c) => ({ c, ...estadoCxC(c) }))
    .filter((x) => !filtro || x.estado === filtro)
    .sort((a, b) => a.c.fechaVenc.localeCompare(b.c.fechaVenc));
  const totalSaldo = r2(cxc.reduce((a, x) => a + x.c.saldo, 0));
  const vencido = r2(cxc.filter((x) => x.estado === "VENCIDO").reduce((a, x) => a + x.c.saldo, 0));

  const abrir = (c: ComprobanteVenta) => {
    setDatos({ monto: c.saldo, cuenta: CUENTAS_COBRO[0], referencia: "", fecha: hoy() });
    setSel(c);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-plomo-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-plomo-500">Por cobrar</p>
          <p className="text-xl font-bold text-azul-900">{soles(totalSaldo)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase text-red-700">Vencido</p>
          <p className="text-xl font-bold text-red-700">{soles(vencido)}</p>
        </div>
        <div className="rounded-xl border border-plomo-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-plomo-500">Cobrado (histórico)</p>
          <p className="text-xl font-bold text-emerald-700">{soles(r2(cobros.reduce((a, c) => a + c.monto, 0)))}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Cuentas por cobrar"
          subtitle="Comprobantes emitidos a crédito. Registre cobros parciales o totales por caja o banco."
          action={
            <Select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as "" | EstadoCxC)}
              placeholder="Todos"
              options={[
                { value: "PENDIENTE", label: "Pendiente" },
                { value: "VENCIDO", label: "Vencido" },
                { value: "PAGADO", label: "Pagado" },
              ]}
              className="w-40"
            />
          }
        />
        <Table head={["Comprobante", "Cliente", "Emisión", "Vencimiento", "Total", "Pagado", "Saldo", "Días vencido", "Estado", ""]} empty={cxc.length === 0}>
          {cxc.map(({ c, estado, diasVencido, pagado }) => (
            <tr key={c.id} className="hover:bg-plomo-50">
              <Td className="font-semibold text-azul-900">
                {c.numero}
                <p className="text-xs font-normal text-plomo-500">{tipoLabel[c.tipo]}</p>
              </Td>
              <Td>{c.cliente}</Td>
              <Td>{fechaPE(c.fecha)}</Td>
              <Td className={cn(estado === "VENCIDO" && "font-semibold text-red-600")}>{fechaPE(c.fechaVenc)}</Td>
              <Td className="text-right">{soles(c.total)}</Td>
              <Td className="text-right text-emerald-700">{soles(pagado)}</Td>
              <Td className="text-right font-semibold">{soles(c.saldo)}</Td>
              <Td className={cn("text-center", diasVencido > 0 && "font-semibold text-red-600")}>{diasVencido || "-"}</Td>
              <Td>
                <Badge estado={estado} />
              </Td>
              <Td>
                {habilitado && c.saldo > 0 && (
                  <Button size="sm" variant="warning" onClick={() => abrir(c)}>
                    <Wallet size={14} /> Registrar cobro
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Cobros registrados" />
        <Table head={["Fecha", "Comprobante", "Cliente", "Monto", "Caja / Banco", "Referencia", "Usuario"]} empty={cobros.length === 0}>
          {cobros.slice(0, 100).map((c) => (
            <tr key={c.id}>
              <Td>{fechaPE(c.fecha)}</Td>
              <Td className="font-semibold">{c.comprobanteNumero}</Td>
              <Td>{c.cliente}</Td>
              <Td className="text-right font-semibold text-emerald-700">{soles(c.monto)}</Td>
              <Td>{c.cuenta}</Td>
              <Td>{c.referencia || "-"}</Td>
              <Td>{c.usuario}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!sel} onClose={() => setSel(null)} title={`Registrar cobro · ${sel?.numero ?? ""}`}>
        {sel && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ok = ejecutar(
                () => registrarCobro(sel.id, { ...datos, medio: datos.cuenta.startsWith("Caja") ? "CAJA" : "BANCO" }, getSesion()?.usuario ?? "", rol),
                "Cobro registrado"
              );
              if (ok) setSel(null);
            }}
            className="space-y-3"
          >
            <p className="text-sm text-plomo-600">
              {sel.cliente} · Saldo <b>{soles(sel.saldo)}</b>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Monto S/ (parcial o total)">
                <Input type="number" min={0} step="0.01" value={datos.monto || ""} onChange={(e) => setDatos({ ...datos, monto: parseFloat(e.target.value) || 0 })} autoFocus />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={datos.fecha} onChange={(e) => setDatos({ ...datos, fecha: e.target.value })} />
              </Field>
              <Field label="Caja / Banco">
                <Select value={datos.cuenta} onChange={(e) => setDatos({ ...datos, cuenta: e.target.value })} options={CUENTAS_COBRO.map((c) => ({ value: c, label: c }))} />
              </Field>
              <Field label="N° operación / referencia">
                <Input value={datos.referencia} onChange={(e) => setDatos({ ...datos, referencia: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setSel(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="warning">
                Registrar cobro
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
