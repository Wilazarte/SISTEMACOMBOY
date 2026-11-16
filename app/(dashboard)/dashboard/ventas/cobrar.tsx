"use client";

import { BotonFiltros } from "@/components/ui/BotonFiltros";
import { useState } from "react";
import { BarChart3, FileCheck2, FileSpreadsheet, FileText, Lock, Pencil, Trash2, Wallet, X } from "lucide-react";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar } from "@/components/ui";
import { esSoporte, getSesion } from "@/lib/auth";
import { KEYS, fechaPE, hoy, puede, r2, soles, useRol, useStore } from "@/lib/storage";
import {
  TIPOS_COMPROBANTE_EXTERNO,
  filasCxC,
  registrarCobro,
  registrarCobroNP,
  registrarComprobanteExterno,
  editarCobro,
  eliminarCobro,
  reporteDeuda,
  ventaActualizada,
  type AgruparDeuda,
  type EstadoCxC,
  type FilaCxC,
} from "@/lib/ventas";
import type { CobroVenta, ComprobanteExterno, ComprobanteVenta, NotaPedido, TipoComprobanteExterno } from "@/lib/types";
import { CUENTAS_COBRO, medioCobro } from "./comun";
import { pdfNotaPedidoActualizada } from "@/lib/pdf";

const filtrosVacios = {
  buscar: "",
  cliente: "",
  vendedor: "",
  equipo: "",
  desde: "",
  hasta: "",
  porVencimiento: false,
  estado: "" as "" | EstadoCxC,
  origen: "" as "" | FilaCxC["origen"],
  externo: "" as "" | "SI" | "NO",
};

const AGRUPAR: Record<AgruparDeuda, string> = { cliente: "Cliente", vendedor: "Vendedor", mes: "Mes de emisión", equipo: "Equipo / producto" };

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const mesLabel = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

export function CuentasPorCobrar() {
  const [rol] = useRol();
  const notas = useStore<NotaPedido[]>(KEYS.NOTAS_PEDIDO, []);
  const comprobantes = useStore<ComprobanteVenta[]>(KEYS.COMPROBANTES, []);
  const cobros = useStore<CobroVenta[]>(KEYS.COBROS, []);
  const [f, setF] = useState(filtrosVacios);
  const { showFiltros, setShowFiltros } = useTogglePanel();
  const [reporte, setReporte] = useState<AgruparDeuda | null>(null);
  const [sel, setSel] = useState<FilaCxC | null>(null);
  const [corregir, setCorregir] = useState<{ cobro: CobroVenta; eliminar: boolean } | null>(null);
  // Editar / eliminar cobros: solo SOPORTE y con PIN
  const soporte = esSoporte(getSesion());
  const [externo, setExterno] = useState<FilaCxC | null>(null);
  const [datos, setDatos] = useState({ monto: 0, cuenta: CUENTAS_COBRO[0], referencia: "", fecha: hoy(), observacion: "" });
  const habilitado = puede(rol, "venta.cobrar");
  const puedeReferir = habilitado || puede(rol, "venta.gestionar");

  // Saldos de las notas de pedido aprobadas + comprobantes del sistema emitidos a crédito o con saldo
  const todas = filasCxC(notas, comprobantes);
  const unicos = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  const clientes = unicos(todas.map((x) => x.cliente));
  const vendedores = unicos(todas.map((x) => x.vendedor));
  const equipos = unicos(todas.flatMap((x) => x.items.map((i) => i.nombre)));
  const texto = f.buscar.trim().toLowerCase();
  const cxc = todas
    .filter(
      (x) =>
        (!f.estado || x.estado === f.estado) &&
        (!f.origen || x.origen === f.origen) &&
        (!f.cliente || x.cliente === f.cliente) &&
        (!f.vendedor || x.vendedor === f.vendedor) &&
        (!f.equipo || x.items.some((i) => i.nombre === f.equipo)) &&
        (!f.desde || (f.porVencimiento ? x.vencimiento : x.fecha) >= f.desde) &&
        (!f.hasta || (f.porVencimiento ? x.vencimiento : x.fecha) <= f.hasta) &&
        (f.externo === "" || (f.externo === "SI") === !!x.externo) &&
        (!texto ||
          [x.documento, x.cliente, x.clienteDoc, x.vendedor, x.detalle, x.externo?.numero ?? "", ...x.items.map((i) => i.nombre)].join(" ").toLowerCase().includes(texto))
    )
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  const activos = Object.entries(f).filter(([k, v]) => k !== "porVencimiento" && v !== "").length;
  // Los indicadores siguen a los filtros (deuda del cliente, vendedor o periodo elegido)
  const totalSaldo = r2(cxc.reduce((a, x) => a + x.saldo, 0));
  const vencido = r2(cxc.filter((x) => x.estado === "VENCIDO").reduce((a, x) => a + x.saldo, 0));
  const sinComprobante = cxc.filter((x) => x.origen === "NP" && !x.externo).length;
  const grupos = reporte ? reporteDeuda(cxc, reporte) : [];

  // xlsx se carga solo al exportar
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const libro = XLSX.utils.book_new();
    const detalle = cxc.map((x) => ({
      Documento: x.documento,
      "Comprobante externo": x.externo ? `${TIPOS_COMPROBANTE_EXTERNO[x.externo.tipo]} ${x.externo.numero}` : "",
      Cliente: x.cliente,
      "RUC / DNI": x.clienteDoc,
      Vendedor: x.vendedor,
      Emisión: fechaPE(x.fecha),
      Vencimiento: fechaPE(x.vencimiento),
      "Días vencido": x.diasVencido || "",
      Total: x.total,
      Pagado: x.pagado,
      Saldo: x.saldo,
      Estado: x.estado,
      "Productos / equipos": x.items.map((i) => i.nombre).join(", "),
    }));
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle), "Cuentas por cobrar");
    if (reporte)
      XLSX.utils.book_append_sheet(
        libro,
        XLSX.utils.json_to_sheet(grupos.map((g) => ({ [AGRUPAR[reporte]]: g.grupo, Documentos: g.documentos, Total: g.total, Pagado: g.pagado, Saldo: g.saldo, Vencido: g.vencido }))),
        `Deuda por ${AGRUPAR[reporte].toLowerCase()}`.slice(0, 31)
      );
    XLSX.writeFile(libro, `Cuentas-por-cobrar-${hoy()}.xlsx`);
  };

  // Nota de pedido actualizada: adelantos con fecha y N° de operación, total pagado y saldo
  const verActualizada = (f: FilaCxC) => {
    const v = ventaActualizada(f, notas, comprobantes, cobros);
    pdfNotaPedidoActualizada({
      ...v,
      pagos: v.pagos.map((c) => ({ fecha: c.fecha, monto: c.monto, cuenta: c.cuenta, referencia: c.referencia, observacion: c.observacion ?? "", documento: c.npId ? c.npNumero ?? "" : c.comprobanteNumero })),
    });
  };

  const abrir = (f: FilaCxC) => {
    setDatos({ monto: f.saldo, cuenta: CUENTAS_COBRO[0], referencia: "", fecha: hoy(), observacion: "" });
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
              <BotonFiltros abierto={showFiltros} onClick={() => setShowFiltros(!showFiltros)} activos={activos} />
              <Button size="sm" variant={reporte ? "warning" : "secondary"} onClick={() => setReporte(reporte ? null : "cliente")}>
                {reporte ? <X size={14} /> : <BarChart3 size={14} />} {reporte ? "Cerrar reporte" : "Reporte de deuda"}
              </Button>
              <Button size="sm" variant="secondary" onClick={exportarExcel} disabled={cxc.length === 0}>
                <FileSpreadsheet size={14} /> Excel
              </Button>
            </div>
          }
        />
        {showFiltros && (
          <div className="grid gap-3 border-b border-plomo-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Buscar" className="lg:col-span-2">
              <Input value={f.buscar} placeholder="N° NP / comprobante, cliente, RUC, vendedor, producto…" onChange={(e) => setF({ ...f, buscar: e.target.value })} autoFocus />
            </Field>
            <Field label="Cliente">
              <Select value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} placeholder="Todos" options={clientes} />
            </Field>
            <Field label="Vendedor">
              <Select value={f.vendedor} onChange={(e) => setF({ ...f, vendedor: e.target.value })} placeholder="Todos" options={vendedores} />
            </Field>
            <Field label="Equipo / producto">
              <Select value={f.equipo} onChange={(e) => setF({ ...f, equipo: e.target.value })} placeholder="Todos" options={equipos} />
            </Field>
            <Field label={f.porVencimiento ? "Vence desde" : "Emitido desde"}>
              <Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
            </Field>
            <Field label={f.porVencimiento ? "Vence hasta" : "Emitido hasta"}>
              <Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
            </Field>
            <Field label="Fechas por">
              <Select
                value={f.porVencimiento ? "VENCE" : "EMISION"}
                onChange={(e) => setF({ ...f, porVencimiento: e.target.value === "VENCE" })}
                options={[
                  { value: "EMISION", label: "Fecha de emisión" },
                  { value: "VENCE", label: "Fecha de vencimiento" },
                ]}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={f.estado}
                onChange={(e) => setF({ ...f, estado: e.target.value as "" | EstadoCxC })}
                placeholder="Todos"
                options={[
                  { value: "PENDIENTE", label: "Pendiente" },
                  { value: "VENCIDO", label: "Vencido" },
                  { value: "PAGADO", label: "Pagado" },
                ]}
              />
            </Field>
            <Field label="Documento">
              <Select
                value={f.origen}
                onChange={(e) => setF({ ...f, origen: e.target.value as "" | FilaCxC["origen"] })}
                placeholder="Todos"
                options={[
                  { value: "NP", label: "Notas de pedido" },
                  { value: "COMPROBANTE", label: "Comprobantes del sistema" },
                ]}
              />
            </Field>
            <Field label="Comprobante externo">
              <Select
                value={f.externo}
                onChange={(e) => setF({ ...f, externo: e.target.value as "" | "SI" | "NO" })}
                placeholder="Todos"
                options={[
                  { value: "SI", label: "Referido" },
                  { value: "NO", label: "Sin referir" },
                ]}
              />
            </Field>
            <div className="flex items-end">
              <Button size="sm" variant="ghost" onClick={() => setF(filtrosVacios)} disabled={activos === 0}>
                <X size={14} /> Limpiar filtros
              </Button>
            </div>
          </div>
        )}
        {reporte && (
          <div className="border-b border-plomo-100 px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">Reporte de deuda por</span>
              {(Object.keys(AGRUPAR) as AgruparDeuda[]).map((k) => (
                <Button key={k} size="sm" variant={reporte === k ? "warning" : "ghost"} onClick={() => setReporte(k)}>
                  {AGRUPAR[k]}
                </Button>
              ))}
              <span className="ml-auto text-xs text-plomo-500">
                {cxc.length} documento(s){activos ? " filtrados" : ""}
                {reporte === "equipo" && " · el saldo de cada documento se reparte según el importe de cada producto"}
              </span>
            </div>
            <Table compacto head={[AGRUPAR[reporte], "Documentos", "Total", "Pagado", "Saldo", "Vencido", "% de la deuda"]} empty={grupos.length === 0}>
              {grupos.map((g) => (
                <tr key={g.grupo}>
                  <Td className="max-w-[22rem] whitespace-normal font-semibold text-fg">{reporte === "mes" ? mesLabel(g.grupo) : g.grupo}</Td>
                  <Td className="text-center">{g.documentos}</Td>
                  <Td className="text-right">{soles(g.total)}</Td>
                  <Td className="text-right text-emerald-700">{soles(g.pagado)}</Td>
                  <Td className="text-right font-semibold">{soles(g.saldo)}</Td>
                  <Td className={cn("text-right", g.vencido > 0 && "font-semibold text-red-600")}>{soles(g.vencido)}</Td>
                  <Td className="text-right">{totalSaldo > 0 ? `${((g.saldo / totalSaldo) * 100).toFixed(1)} %` : "-"}</Td>
                </tr>
              ))}
              {grupos.length > 1 && (
                <tr className="font-semibold">
                  <Td className="text-fg">Total</Td>
                  <Td className="text-center">{cxc.length}</Td>
                  <Td className="text-right">{soles(r2(grupos.reduce((a, g) => a + g.total, 0)))}</Td>
                  <Td className="text-right text-emerald-700">{soles(r2(grupos.reduce((a, g) => a + g.pagado, 0)))}</Td>
                  <Td className="text-right">{soles(totalSaldo)}</Td>
                  <Td className="text-right text-red-600">{soles(vencido)}</Td>
                  <Td className="text-right">100 %</Td>
                </tr>
              )}
            </Table>
          </div>
        )}
        {/* Compacta: entra completa en pantalla sin deslizar (fechas y días en una columna, acciones con íconos) */}
        <Table compacto head={["Documento", "Comprobante externo", "Cliente", "Emisión / Vence", "Total", "Pagado", "Saldo", "Estado", ""]} empty={cxc.length === 0}>
          {cxc.map((f) => (
            <tr key={`${f.origen}-${f.id}`} className="hover:bg-plomo-50">
              <Td className="font-semibold text-fg">
                {f.documento}
                <p className="max-w-[11rem] truncate text-xs font-normal text-plomo-500" title={f.detalle}>
                  {f.detalle}
                </p>
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
              <Td className="max-w-[14rem] whitespace-normal">
                {f.cliente}
                <p className="text-xs text-plomo-500">{f.clienteDoc}</p>
              </Td>
              <Td>
                {fechaPE(f.fecha)}
                <p className={cn("text-xs", f.estado === "VENCIDO" ? "font-semibold text-red-600" : "text-plomo-500")}>
                  Vence {fechaPE(f.vencimiento)}
                  {f.diasVencido > 0 && ` · ${f.diasVencido} d`}
                </p>
              </Td>
              <Td className="text-right">{soles(f.total)}</Td>
              <Td className="text-right text-emerald-700">{soles(f.pagado)}</Td>
              <Td className="text-right font-semibold">{soles(f.saldo)}</Td>
              <Td>
                <Badge estado={f.estado} />
              </Td>
              <Td>
                <div className="flex gap-1">
                  <span className="tip" data-tip="Ver nota de pedido actualizada (adelantos y saldo)">
                    <Button size="sm" variant="secondary" onClick={() => verActualizada(f)} aria-label="Ver nota de pedido actualizada">
                      <FileText size={14} />
                    </Button>
                  </span>
                  {habilitado && f.saldo > 0 && (
                    <span className="tip" data-tip="Registrar cobro">
                      <Button size="sm" variant="warning" onClick={() => abrir(f)} aria-label="Registrar cobro">
                        <Wallet size={14} />
                      </Button>
                    </span>
                  )}
                  {puedeReferir && (
                    <span className="tip" data-tip={f.externo ? "Ver / cambiar comprobante externo" : "Referir comprobante externo"}>
                      <Button size="sm" variant="ghost" onClick={() => setExterno(f)} aria-label="Comprobante externo">
                        <FileCheck2 size={14} />
                      </Button>
                    </span>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Cobros registrados" />
        <Table compacto head={["Fecha", "Documento", "Comprobante", "Cliente", "Monto", "Caja / Banco", "Referencia", "Observación", "Usuario", ...(soporte ? [""] : [])]} empty={cobros.length === 0}>
          {cobros.slice(0, 100).map((c) => (
            <tr key={c.id}>
              <Td>{fechaPE(c.fecha)}</Td>
              <Td className="font-semibold">{c.npId ? c.npNumero : c.comprobanteNumero}</Td>
              <Td>{c.npId ? c.comprobanteNumero || "-" : "-"}</Td>
              <Td>{c.cliente}</Td>
              <Td className="text-right font-semibold text-emerald-700">{soles(c.monto)}</Td>
              <Td>{c.cuenta}</Td>
              <Td>{c.referencia || "-"}</Td>
              <Td className="text-xs">
                <span className="block max-w-[12rem] truncate" title={c.observacion}>
                  {c.observacion || "-"}
                </span>
              </Td>
              <Td>
                {c.usuario}
                {c.editadoPor && <p className="text-xs text-amber-600">Editado por {c.editadoPor}</p>}
              </Td>
              {soporte && (
                <Td>
                  <div className="flex gap-1">
                    <span className="tip" data-tip="Editar cobro (SOPORTE · PIN)">
                      <Button size="sm" variant="ghost" onClick={() => setCorregir({ cobro: c, eliminar: false })} aria-label="Editar cobro">
                        <Pencil size={14} />
                      </Button>
                    </span>
                    <span className="tip" data-tip="Eliminar cobro (SOPORTE · PIN)">
                      <Button size="sm" variant="ghost" onClick={() => setCorregir({ cobro: c, eliminar: true })} aria-label="Eliminar cobro">
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </span>
                  </div>
                </Td>
              )}
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
              <Field label="Observación (opcional)" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={datos.observacion}
                  placeholder="Ej: depósito en efectivo del cliente, pago parcial acordado con Gerencia…"
                  onChange={(e) => setDatos({ ...datos, observacion: e.target.value })}
                />
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

      {soporte && <ModalCorregirCobro corregir={corregir} onClose={() => setCorregir(null)} />}

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

/** SOPORTE: editar (monto, fecha, caja/banco, N° operación, observación) o eliminar un cobro, validado con PIN. */
function ModalCorregirCobro({ corregir, onClose }: { corregir: { cobro: CobroVenta; eliminar: boolean } | null; onClose: () => void }) {
  const [rol] = useRol();
  const [form, setForm] = useState({ monto: 0, fecha: "", cuenta: "", referencia: "", observacion: "" });
  const [pin, setPin] = useState("");
  const [abiertoPara, setAbiertoPara] = useState("");
  const clave = corregir ? `${corregir.cobro.id}-${corregir.eliminar}` : "";
  if (clave !== abiertoPara) {
    setAbiertoPara(clave);
    setPin("");
    if (corregir) {
      const c = corregir.cobro;
      setForm({ monto: c.monto, fecha: c.fecha, cuenta: c.cuenta, referencia: c.referencia, observacion: c.observacion ?? "" });
    }
  }
  if (!corregir) return null;
  const { cobro: c, eliminar } = corregir;
  const doc = c.npId ? c.npNumero : c.comprobanteNumero;
  const cuentas = CUENTAS_COBRO.includes(form.cuenta) || !form.cuenta ? CUENTAS_COBRO : [form.cuenta, ...CUENTAS_COBRO];
  const guardar = () => {
    const ok = eliminar
      ? ejecutar(() => eliminarCobro(c.id, pin, rol), "Cobro eliminado")
      : ejecutar(() => editarCobro(c.id, { ...form, medio: medioCobro(form.cuenta) }, pin, rol), "Cobro actualizado");
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${eliminar ? "Eliminar" : "Editar"} cobro · ${doc ?? ""}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-plomo-600">
          {c.cliente} · {fechaPE(c.fecha)} · <b>{soles(c.monto)}</b> · {c.cuenta} · ref. {c.referencia || "-"}
        </p>
        {eliminar ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            El monto de este cobro vuelve al saldo por cobrar de {doc} y se registra el asiento de reversa. No se puede deshacer.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monto S/">
              <Input type="number" min={0} step="0.01" value={form.monto || ""} onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })} autoFocus />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Caja / Banco">
              <Select value={form.cuenta} onChange={(e) => setForm({ ...form, cuenta: e.target.value })} options={cuentas.map((x) => ({ value: x, label: x }))} />
            </Field>
            <Field label="N° operación / referencia">
              <Input value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} />
            </Field>
            <Field label="Observación" className="sm:col-span-2">
              <Textarea rows={2} value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="PIN de validación (SOPORTE) *">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            placeholder="••••••"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoFocus={eliminar}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant={eliminar ? "danger" : "warning"} disabled={!pin}>
            <Lock size={14} /> {eliminar ? "Eliminar cobro" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
