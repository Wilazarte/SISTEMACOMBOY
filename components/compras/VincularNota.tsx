"use client";

import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { Button, Field, Input, Select, cn, ejecutarAsync, toast } from "@/components/ui";
import { aplicarNotaAGasto, fechaPE, getFacturas, mismoComprobante, parseFechaPE, soles, subirComprobanteGasto } from "@/lib/storage";
import type { FacturaLeida } from "@/lib/parseFactura";
import type { Rol } from "@/lib/types";

/** DD/MM/AAAA mientras se escribe. */
const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/**
 * Nota de crédito / débito escaneada: se vincula al gasto del comprobante original (Facturas) y le resta
 * (crédito) o suma (débito) su monto. Es una acción aparte del formulario de gasto: se aplica con su botón.
 */
export function VincularNota({
  datos,
  archivo,
  nombreArchivo,
  rol,
  onListo,
}: {
  datos: FacturaLeida;
  archivo: Blob;
  nombreArchivo: string;
  rol: Rol;
  onListo: () => void;
}) {
  const tipo = datos.tipoElectronico === "NOTA_DEBITO" ? "DEBITO" : "CREDITO";
  const nombre = tipo === "CREDITO" ? "Nota de crédito" : "Nota de débito";
  // Gastos del mismo proveedor (por RUC); si la nota no trae RUC legible, todos. Los más recientes primero.
  const gastos = useMemo(() => {
    const todos = getFacturas().filter((f) => f.esGastoTesoreria);
    const delRuc = datos.ruc ? todos.filter((f) => f.ruc === datos.ruc) : [];
    return (delRuc.length ? delRuc : todos).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 300);
  }, [datos.ruc]);
  const sugerido = datos.referencia ? gastos.find((g) => mismoComprobante(g.numero, datos.referencia as string)) : undefined;
  const [gastoId, setGastoId] = useState(sugerido?.id ?? "");
  const [numero, setNumero] = useState(datos.numero ?? "");
  const [fechaTxt, setFechaTxt] = useState(datos.fecha ? fechaPE(datos.fecha) : "");
  const [monto, setMonto] = useState(datos.total ?? 0);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const gasto = gastos.find((g) => g.id === gastoId);
  const usd = gasto?.moneda === "USD" && !!gasto.tipoCambio;
  const montoSoles = usd ? Math.round(monto * (gasto?.tipoCambio ?? 0) * 100) / 100 : monto;
  const nuevoTotal = gasto ? Math.round((gasto.total + (tipo === "CREDITO" ? -1 : 1) * montoSoles) * 100) / 100 : 0;

  const aplicar = async () => {
    setGuardando(true);
    await ejecutarAsync(
      async () => {
        if (!gasto) throw new Error("Elija el gasto de la factura original.");
        const fecha = parseFechaPE(fechaTxt);
        if (!fecha) throw new Error("Fecha de la nota inválida. Use DD/MM/AAAA.");
        let adjunto;
        try {
          const { ref } = await subirComprobanteGasto(archivo);
          adjunto = { tipo: "FACTURA" as const, nombre: nombreArchivo, mime: archivo.type, dataUrl: ref };
        } catch {
          /* la nota se aplica igual, sin su archivo */
        }
        aplicarNotaAGasto(gasto.id, { tipo, numero, fecha, monto, motivo, archivo: adjunto, ruc: datos.ruc }, rol);
      },
      `${nombre} ${numero} vinculada a ${gasto?.numero ?? ""}: total ${gasto ? soles(gasto.total) : ""} → ${soles(nuevoTotal)}`
    ).then((ok) => ok && onListo());
    setGuardando(false);
  };

  return (
    <div className="mt-3 rounded-lg border border-plomo-200 bg-surface p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Link2 size={15} className="text-corp" /> Vincular {nombre.toLowerCase()} a la factura original
      </p>
      <p className="mt-0.5 text-xs text-plomo-500">
        {tipo === "CREDITO" ? "Resta" : "Suma"} su monto al gasto elegido (total, IGV, detracción y neto a pagar). No se registra como gasto nuevo.
        {datos.referencia && !sugerido && ` No se encontró el gasto ${datos.referencia}: elíjalo de la lista.`}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Gasto / factura original *" className="md:col-span-4">
          <Select
            value={gastoId}
            onChange={(e) => setGastoId(e.target.value)}
            placeholder={gastos.length ? "Elija el comprobante que modifica…" : "No hay gastos registrados"}
            options={gastos.map((g) => ({
              value: g.id,
              label: `${g.numero} · ${g.proveedor} · ${fechaPE(g.fecha)} · ${soles(g.total)}${g.moneda === "USD" ? ` (US$ ${(g.totalUsd ?? 0).toFixed(2)})` : ""}${g.estadoPago === "PAGADA" ? " · PAGADO" : ""}`,
            }))}
            className={cn(!gastoId && "!border-amber-400 !bg-amber-50 !text-amber-950")}
          />
        </Field>
        <Field label={`N° ${nombre.toLowerCase()} *`}>
          <Input value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="FC01-45" />
        </Field>
        <Field label="Fecha de emisión *" hint="DD/MM/AAAA">
          <Input value={fechaTxt} inputMode="numeric" maxLength={10} onChange={(e) => setFechaTxt(mascara(e.target.value))} />
        </Field>
        <Field label={`Monto ${usd ? "(US$)" : "(S/)"} *`} hint={usd ? `= ${soles(montoSoles)} con T.C. ${gasto?.tipoCambio?.toFixed(3)}` : "Con IGV incluido"}>
          <Input type="number" min={0} step="0.01" value={monto || ""} onChange={(e) => setMonto(parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Motivo">
          <Input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: devolución, descuento" />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-plomo-600">
          {gasto ? (
            <>
              Total del gasto {soles(gasto.total)} → <b className={nuevoTotal < 0 ? "text-red-600" : "text-fg"}>{soles(nuevoTotal)}</b>
              {gasto.estadoPago === "PAGADA" && (tipo === "CREDITO" ? " · ya pagado: queda saldo a favor por cobrar al proveedor" : " · ya pagado: queda saldo por pagar")}
            </>
          ) : (
            "Elija el gasto para ver el nuevo total."
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onListo} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={aplicar} disabled={guardando || !gasto || !(monto > 0) || nuevoTotal < 0}>
            <Link2 size={14} /> {guardando ? "Aplicando…" : `Vincular y aplicar ${nombre.toLowerCase()}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
