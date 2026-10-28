"use client";

import { FiltrosPlegables } from "@/components/ui/BotonFiltros";
import { useState } from "react";
import { FileCheck2, Wallet } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, cn, ejecutar } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { KEYS, fechaPE, hoy, puede, r2, soles, useRol, useStore } from "@/lib/storage";
import {
  TIPOS_COMPROBANTE_EXTERNO,
  filasCxC,
  registrarCobro,
  registrarCobroNP,
  registrarComprobanteExterno,
  type EstadoCxC,
  type FilaCxC,
} from "@/lib/ventas";
import type { CobroVenta, ComprobanteExterno, ComprobanteVenta, NotaPedido, TipoComprobanteExterno } from "@/lib/types";
import { CUENTAS_COBRO, medioCobro } from "./comun";

export function CuentasPorCobrar() {
  const [rol] = useRol();
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const cobros = useStore<CobroVenta[]>(KEYS.COBROS, []);
  const [filtro, setFiltro] = useState<"" | EstadoCxC>("");
  const [origen, setOrigen] = useState<"" | FilaCxC["origen"]>("");
  const [sel, setSel] = useState<FilaCxC | null>(null);
  const [externo, setExterno] = useState<FilaCxC | null>(null);
  const [datos, setDatos] = useState({ monto: 0, cuenta: CUENTAS_COBRO[0], referencia: "", fecha: hoy() });
  const habilitado = puede(rol, "venta.cobrar");
  const puedeReferir = habilitado || puede(rol, "venta.gestionar");

  // Saldos de las notas de pedido aprobadas + comprobantes del sistema emitidos a crédito o con saldo
  const todas = filasCxC(notas, comprobantes);
  const cxc = todas
    .filter((x) => (!filtro || x.estado === filtro) && (!origen || x.origen === origen))
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  const totalSaldo = r2(todas.reduce((a, x) => a + x.saldo, 0));
  const vencido = r2(todas.filter((x) => x.estado === "VENCIDO").reduce((a, x) => a + x.saldo, 0));
  const sinComprobante = todas.filter((x) => x.origen === "NP" && !x.externo).length;

  const abrir = (f: FilaCxC) => {
    setDatos({ monto: f.saldo, cuenta: CUENTAS_COBRO[0], referencia: "", fecha: hoy() });
    setSel(f);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-plomo-200 bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-plomo-500">Por cobrar</p>
          <p className="text-xl font-bold text-fg">{soles(totalSaldo)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase text-red-700">Vencido</p>
          <p className="text-xl font-bold text-red-700">{soles(vencido)}</p>
        </div>
        <div className="rounded-xl border border-plomo-200 bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-plomo-500">Cobrado (histórico)</p>
          <p className="text-xl font-bold text-emerald-700">{soles(r2(cobros.reduce((a, c) => a + c.monto, 0)))}</p>
        </div>
        <div className="rounded-xl border border-plomo-200 bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-plomo-500">NP sin comprobante externo</p>
          <p className={cn("text-xl font-bold", sinComprobante ? "text-amber-600" : "text-fg")}>{sinComprobante}</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Cuentas por cobrar"
          subtitle="Saldos de las notas de pedido aprobadas y de los comprobantes a crédito. Registre cobros parciales o totales y el N° del comprobante emitido en el sistema externo."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <FiltrosPlegables activos={(filtro ? 1 : 0) + (origen ? 1 : 0)}>
                <Select
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value as "" | FilaCxC["origen"])}
                  placeholder="Todos los documentos"
                  options={[
                    { value: "NP", label: "Notas de pedido" },
                    { value: "COMPROBANTE", label: "Comprobantes del sistema" },
                  ]}
                  className="w-52"
                />
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
              </FiltrosPlegables>
            </div>
          }
        />
        <Table head={["Documento", "Comprobante externo", "Cliente", "Emisión", "Vencimiento", "Total", "Pagado", "Saldo", "Días vencido", "Estado", ""]} empty={cxc.length === 0}>
          {cxc.map((f) => (
            <tr key={`${f.origen}-${f.id}`} className="hover:bg-plomo-50">
              <Td className="font-semibold text-fg">
                {f.documento}
                <p className="text-xs font-normal text-plomo-500">{f.detalle}</p>
              </Td>
              <Td>
                {f.externo ? (
                  <>
                    <span className="font-semibold text-fg">{f.externo.numero}</span>
                    <p className="text-xs text-plomo-500">
                      {TIPOS_COMPROBANTE_EXTERNO[f.externo.tipo]} · {fechaPE(f.externo.fecha)}
                    </p>
                  </>
                ) : (
                  <span className="text-xs text-plomo-500">Sin referir</span>
                )}
              </Td>
              <Td>
                {f.cliente}
                <p className="text-xs text-plomo-500">{f.clienteDoc}</p>
              </Td>
              <Td>{fechaPE(f.fecha)}</Td>
              <Td className={cn(f.estado === "VENCIDO" && "font-semibold text-red-600")}>{fechaPE(f.vencimiento)}</Td>
              <Td className="text-right">{soles(f.total)}</Td>
              <Td className="text-right text-emerald-700">{soles(f.pagado)}</Td>
              <Td className="text-right font-semibold">{soles(f.saldo)}</Td>
              <Td className={cn("text-center", f.diasVencido > 0 && "font-semibold text-red-600")}>{f.diasVencido || "-"}</Td>
              <Td>
                <Badge estado={f.estado} />
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {habilitado && f.saldo > 0 && (
                    <Button size="sm" variant="warning" onClick={() => abrir(f)}>
                      <Wallet size={14} /> Registrar cobro
                    </Button>
                  )}
                  {puedeReferir && (
                    <Button size="sm" variant="ghost" title="N° de comprobante emitido en el sistema externo" onClick={() => setExterno(f)}>
                      <FileCheck2 size={14} /> {f.externo ? "Comprobante" : "Referir comprobante"}
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Cobros registrados" />
        <Table head={["Fecha", "Documento", "Comprobante", "Cliente", "Monto", "Caja / Banco", "Referencia", "Usuario"]} empty={cobros.length === 0}>
          {cobros.slice(0, 100).map((c) => (
            <tr key={c.id}>
              <Td>{fechaPE(c.fecha)}</Td>
              <Td className="font-semibold">{c.npId ? c.npNumero : c.comprobanteNumero}</Td>
              <Td>{c.npId ? c.comprobanteNumero || "-" : "-"}</Td>
              <Td>{c.cliente}</Td>
              <Td className="text-right font-semibold text-emerald-700">{soles(c.monto)}</Td>
              <Td>{c.cuenta}</Td>
              <Td>{c.referencia || "-"}</Td>
              <Td>{c.usuario}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!sel} onClose={() => setSel(null)} title={`Registrar cobro · ${sel?.documento ?? ""}`}>
        {sel && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = { ...datos, medio: medioCobro(datos.cuenta) };
              const usuario = getSesion()?.usuario ?? "";
              const ok = ejecutar(
                () => (sel.origen === "NP" ? registrarCobroNP(sel.id, d, usuario, rol) : registrarCobro(sel.id, d, usuario, rol)),
                "Cobro registrado"
              );
              if (ok) setSel(null);
            }}
            className="space-y-3"
          >
            <p className="text-sm text-plomo-600">
              {sel.cliente} · Saldo <b>{soles(sel.saldo)}</b>
              {sel.externo && ` · ${TIPOS_COMPROBANTE_EXTERNO[sel.externo.tipo]} ${sel.externo.numero}`}
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

      <ModalComprobanteExterno
        doc={externo && { origen: externo.origen, id: externo.id, documento: externo.documento, externo: externo.externo }}
        onClose={() => setExterno(null)}
      />
    </div>
  );
}

/** Referir el N° del comprobante emitido fuera del ERP (facturador SUNAT u otro sistema) a una NP o comprobante. */
export function ModalComprobanteExterno({
  doc,
  onClose,
}: {
  doc: { origen: "NP" | "COMPROBANTE"; id: string; documento: string; externo?: ComprobanteExterno } | null;
  onClose: () => void;
}) {
  const [rol] = useRol();
  const [form, setForm] = useState<{ tipo: TipoComprobanteExterno; numero: string; fecha: string } | null>(null);
  const [abiertoPara, setAbiertoPara] = useState("");
  // Se precarga al abrir con otro documento
  const clave = doc ? `${doc.origen}-${doc.id}` : "";
  if (clave !== abiertoPara) {
    setAbiertoPara(clave);
    setForm(doc ? { tipo: doc.externo?.tipo ?? "FACTURA", numero: doc.externo?.numero ?? "", fecha: doc.externo?.fecha ?? hoy() } : null);
  }
  const usuario = getSesion()?.usuario ?? "";
  const guardar = (datos: typeof form) =>
    doc && ejecutar(() => registrarComprobanteExterno(doc.origen, doc.id, datos, usuario, rol), datos ? "Comprobante referido" : "Referencia quitada") && onClose();

  return (
    <Modal open={!!doc} onClose={onClose} title={`Comprobante externo · ${doc?.documento ?? ""}`}>
      {doc && form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar(form);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-plomo-600">
            El ERP aún no está conectado a SUNAT. Anote aquí el comprobante que emitió en el sistema externo para cuadrar ventas, cobros y balance.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tipo *">
              <Select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoComprobanteExterno })}
                options={Object.entries(TIPOS_COMPROBANTE_EXTERNO).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="N° de comprobante *">
              <Input
                value={form.numero}
                placeholder={form.tipo === "BOLETA" ? "B001-00000456" : form.tipo === "FACTURA" ? "F001-00001234" : ""}
                onChange={(e) => setForm({ ...form, numero: e.target.value.toUpperCase() })}
                autoFocus
              />
            </Field>
            <Field label="Fecha de emisión *">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
          </div>
          {doc.externo && (
            <p className="text-xs text-plomo-500">
              Referido por {doc.externo.registradoPor || "-"} el {fechaPE(doc.externo.registradoEn.slice(0, 10))}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {doc.externo && (
              <Button type="button" variant="ghost" className="mr-auto" onClick={() => confirm(`¿Quitar el comprobante ${doc.externo!.numero} de ${doc.documento}?`) && guardar(null)}>
                Quitar referencia
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="warning">
              <FileCheck2 size={16} /> Guardar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
