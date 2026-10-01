"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Camera, FileText, PackageCheck, PlayCircle, Truck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { SEDES } from "@/lib/empresa";
import { pdfOrdenDespacho } from "@/lib/pdf";
import { KEYS, MAX_ARCHIVO, fechaPE, puede, r2, stockDisponible, useRol, useStore } from "@/lib/storage";
import { pendienteLinea, prepararDespacho, registrarDespacho } from "@/lib/ventas";
import type { OrdenDespacho, StockItem } from "@/lib/types";

/** Órdenes de despacho generadas al emitir facturas / boletas en Ventas. */
export function OrdenesDespacho() {
  const [rol] = useRol();
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  useStore<StockItem[]>(KEYS.STOCK, []); // se re-renderiza cuando cambia el stock
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<OrdenDespacho | null>(null);
  const [sede, setSede] = useState(SEDES[0]);
  const [cant, setCant] = useState<Record<string, number>>({});
  const [responsable, setResponsable] = useState("");
  const [guia, setGuia] = useState("");
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState<{ nombre: string; tipo: string; url: string } | undefined>();
  const fotoRef = useRef<HTMLInputElement>(null);
  const habilitado = puede(rol, "despacho.dar");
  const lista = ods.filter((o) => !filtro || o.estado === filtro);

  const abrir = (o: OrdenDespacho) => {
    setSel(o);
    setCant(Object.fromEntries(o.items.map((l) => [l.id, pendienteLinea(l)])));
    setResponsable(getSesion()?.usuario ?? "");
    setGuia("");
    setObs("");
    setFoto(undefined);
    // Sede con más stock del primer producto
    const p = o.items.find((l) => l.productoNombre);
    if (p) setSede([...SEDES].sort((a, b) => stockDisponible(b, p.productoNombre, p.unidad) - stockDisponible(a, p.productoNombre, p.unidad))[0]);
  };

  const cargarFoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("La foto debe ser una imagen (JPG, PNG o WEBP).", "error");
    if (file.size > MAX_ARCHIVO) return toast(`La foto pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    const r = new FileReader();
    r.onload = () => setFoto({ nombre: file.name, tipo: file.type, url: String(r.result) });
    r.readAsDataURL(file);
  };

  // Stock insuficiente en la sede elegida
  const faltantes = sel
    ? sel.items.filter((l) => l.productoNombre && (cant[l.id] ?? 0) > 0 && stockDisponible(sede, l.productoNombre, l.unidad) + 1e-9 < (cant[l.id] ?? 0))
    : [];

  const despachar = () => {
    if (!sel) return;
    const ok = ejecutar(
      () =>
        registrarDespacho(
          sel.id,
          { responsable, sede, guiaRemision: guia.trim(), observacion: obs.trim(), foto, lineas: sel.items.map((l) => ({ lineaId: l.id, cantidad: r2(cant[l.id] ?? 0) })) },
          rol
        ),
      "Despacho registrado: stock descontado"
    );
    if (ok) setSel(null);
  };

  return (
    <Card>
      <CardHeader
        title="Órdenes de despacho"
        subtitle="Se generan solas al emitir una factura o boleta en Ventas. Al despachar se descuenta el stock (m² o unidades)."
        action={
          <Select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Todos los estados"
            options={["PENDIENTE", "EN_PREPARACION", "DESPACHADO_PARCIAL", "DESPACHADO_TOTAL", "ANULADO"].map((s) => ({ value: s, label: s.replace("_", " ") }))}
            className="w-48"
          />
        }
      />
      {lista.length === 0 ? (
        <div className="p-5">
          <Empty icon={<Truck size={28} />} text="No hay órdenes de despacho" />
        </div>
      ) : (
        <Table head={["N° OD", "Fecha", "Comprobante", "Cliente", "Productos", "Estado", "Acciones"]}>
          {lista.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td className="font-semibold text-slate-900">{o.numero}</Td>
              <Td>{fechaPE(o.fecha)}</Td>
              <Td>{o.comprobanteNumero}</Td>
              <Td>
                <p className="font-medium text-slate-900">{o.cliente}</p>
                <p className="max-w-[220px] truncate text-xs text-slate-500">{o.lugarEntrega}</p>
              </Td>
              <Td>
                <ul className="space-y-0.5 text-xs">
                  {o.items.map((l) => (
                    <li key={l.id}>
                      {l.descripcion}
                      {l.ancho > 0 && <span className="text-slate-500"> · {l.ancho}×{l.alto} m × {l.cantidadPiezas}</span>}
                      <span className="text-slate-500">
                        {" "}
                        · {l.despachado}/{l.solicitado} {l.unidad}
                      </span>
                    </li>
                  ))}
                </ul>
              </Td>
              <Td>
                <Badge estado={o.estado} />
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" onClick={() => pdfOrdenDespacho(o)}>
                    <FileText size={14} /> PDF
                  </Button>
                  {habilitado && o.estado === "PENDIENTE" && (
                    <Button size="sm" variant="ghost" onClick={() => ejecutar(() => prepararDespacho(o.id, rol), `${o.numero} en preparación`)} title="Marcar en preparación">
                      <PlayCircle size={14} />
                    </Button>
                  )}
                  {habilitado && ["PENDIENTE", "EN_PREPARACION", "DESPACHADO_PARCIAL"].includes(o.estado) && (
                    <Button size="sm" variant="warning" onClick={() => abrir(o)}>
                      <PackageCheck size={14} /> Despachar
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={`Despachar ${sel?.numero ?? ""} · ${sel?.comprobanteNumero ?? ""}`} wide>
        {sel && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Almacén (sede) de salida">
                <Select value={sede} onChange={(e) => setSede(e.target.value)} options={SEDES.map((s) => ({ value: s, label: s }))} />
              </Field>
              <Field label="Despachado por *">
                <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
              </Field>
              <Field label="Guía de remisión (opcional)">
                <Input value={guia} onChange={(e) => setGuia(e.target.value.toUpperCase())} placeholder="T001-000123" />
              </Field>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-left">Medidas</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                  <th className="px-3 py-2 text-right">Stock en sede</th>
                  <th className="w-32 px-3 py-2 text-left">Despachar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sel.items.map((l) => {
                  const disp = l.productoNombre ? stockDisponible(sede, l.productoNombre, l.unidad) : null;
                  const falta = disp !== null && (cant[l.id] ?? 0) > disp + 1e-9;
                  return (
                    <tr key={l.id} className={cn(falta && "bg-red-50")}>
                      <td className="px-3 py-2">
                        {l.descripcion}
                        {!l.productoNombre && <span className="ml-1 text-xs text-slate-400">(servicio, no mueve stock)</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{l.ancho > 0 ? `${l.ancho} × ${l.alto} m × ${l.cantidadPiezas}` : "-"}</td>
                      <td className="px-3 py-2 text-right">
                        {pendienteLinea(l)} {l.unidad}
                      </td>
                      <td className={cn("px-3 py-2 text-right", falta ? "font-bold text-red-600" : "text-slate-600")}>{disp === null ? "-" : `${disp} ${l.unidad}`}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={pendienteLinea(l)}
                          step="any"
                          value={cant[l.id] ?? 0}
                          onChange={(e) => setCant({ ...cant, [l.id]: parseFloat(e.target.value) || 0 })}
                          className={cn("text-right", falta && "border-red-400")}
                          aria-label={`Despachar ${l.descripcion}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {faltantes.length > 0 && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white">
                <AlertTriangle size={18} className="shrink-0" />
                Stock insuficiente en {sede}: {faltantes.map((l) => `${l.descripcion} (hay ${stockDisponible(sede, l.productoNombre, l.unidad)} ${l.unidad})`).join(", ")}. Cambie de sede o
                despache una cantidad menor (despacho parcial).
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Observación">
                <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
              </Field>
              <Field label="Foto del despacho (opcional, máx. 1.5 MB)">
                <div className="flex items-center gap-3">
                  <Button type="button" variant="secondary" onClick={() => fotoRef.current?.click()}>
                    <Camera size={16} /> {foto ? "Cambiar foto" : "Adjuntar foto"}
                  </Button>
                  {foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto.url} alt="Foto del despacho" className="h-16 w-16 rounded-lg object-cover" />
                  )}
                  <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => cargarFoto(e.target.files?.[0])} />
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button variant="secondary" onClick={() => setSel(null)}>
                Cancelar
              </Button>
              <Button variant="warning" onClick={despachar} disabled={faltantes.length > 0}>
                <Truck size={16} /> Registrar despacho
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
