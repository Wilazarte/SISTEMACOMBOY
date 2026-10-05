"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Building2, Camera, CheckCircle2, ClipboardCheck, FileText, MapPin, PackageCheck, Save, Truck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Table, Td, Textarea, Timeline, cn, ejecutar, toast } from "@/components/ui";
import { getSesion } from "@/lib/auth";
import { FirmaPad } from "@/components/FirmaPad";
import { SEDES_STOCK as SEDES } from "@/lib/empresa";
import { pdfOrdenDespacho } from "@/lib/pdf";
import { KEYS, MAX_ARCHIVO, fechaPE, puede, r2, soles, stockDisponible, transferirStock, useRol, useStore } from "@/lib/storage";
import { disponibleEquipo, equipoDeLinea, registrarMovimiento, sedeEquipo, transferirEquipo, type EquipoTerminado } from "@/lib/equipos";
import { codigoDesdeNumero } from "@/lib/utils/codigos";
import {
  ESTADOS_OD,
  LUGARES_ENTREGA,
  cerrarDespacho,
  estadoOD,
  guardarObservacionOD,
  marcarAlistado,
  marcarODsVistas,
  origenOD,
  pendienteLinea,
  type EstadoAlmacen,
} from "@/lib/ventas";
import type { ArchivoAdjunto, LugarEntrega, OrdenDespacho, StockItem } from "@/lib/types";

const CONTADORES: { estado: EstadoAlmacen; label: string; cls: string }[] = [
  { estado: "PENDIENTE", label: "Pendiente", cls: "border-l-amber-500" },
  { estado: "PEDIDO_ALISTADO", label: "Alistado", cls: "border-l-azul-700" },
  { estado: "PEDIDO_ENTREGADO", label: "Entregado", cls: "border-l-emerald-600" },
  { estado: "DEJADO_EN_AGENCIA", label: "En agencia", cls: "border-l-corp" },
];

export const codigoOD = (o: OrdenDespacho) => codigoDesdeNumero("OD", o.numero, o.fecha);
const lugarTxt = (o: OrdenDespacho) => (o.lugar ? LUGARES_ENTREGA[o.lugar] : o.lugarEntrega || "-");

/** Órdenes de despacho: las crea Ventas al emitir; Almacén las alista y entrega. */
/**
 * vista "almacen": atiende (alistar / entregar / agencia). vista "ventas": registro y seguimiento
 * (solo lectura para Ventas; los botones de estado dependen del permiso despacho.dar).
 */
export function OrdenesDespacho({ vista = "almacen" }: { vista?: "almacen" | "ventas" }) {
  const [rol] = useRol();
  const ods = useStore<OrdenDespacho[]>(KEYS.DESPACHOS, []);
  useStore<StockItem[]>(KEYS.STOCK, []); // se re-renderiza cuando cambia el stock
  const [estado, setEstado] = useState<EstadoAlmacen | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [lugar, setLugar] = useState<LugarEntrega | "">("");
  const [selId, setSelId] = useState<string | null>(null);
  const habilitado = puede(rol, "despacho.dar");

  // Al abrir la pestaña, Almacén "ve" las órdenes nuevas (se apaga la campana)
  useEffect(() => {
    if (vista === "almacen" && habilitado && !getSesion()?.soloLectura) {
      try {
        marcarODsVistas(rol);
      } catch {
        /* sin permiso de escritura: la campana sigue */
      }
    }
  }, [vista, habilitado, rol, ods.length]);

  const lista = ods.filter(
    (o) => (!estado || estadoOD(o) === estado) && (!desde || o.fecha >= desde) && (!hasta || o.fecha <= hasta) && (!lugar || o.lugar === lugar)
  );
  const sel = ods.find((o) => o.id === selId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CONTADORES.map((c) => {
          const n = ods.filter((o) => estadoOD(o) === c.estado).length;
          return (
            <button
              key={c.estado}
              onClick={() => setEstado(estado === c.estado ? "" : c.estado)}
              className={cn(
                "rounded-xl border border-l-4 border-plomo-200 bg-white p-4 text-left shadow-[0_4px_12px_rgba(15,36,64,0.06)] transition hover:bg-plomo-50",
                c.cls,
                estado === c.estado && "ring-2 ring-azul-900"
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-plomo-500">{c.label}</p>
              <p className="mt-1 font-serif text-3xl text-azul-900">{n}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={vista === "ventas" ? "Registro y seguimiento de despachos" : "Órdenes de despacho"}
          subtitle={
            vista === "ventas"
              ? "Cada nota de pedido aprobada genera su orden de despacho. Aquí se ve en qué estado la tiene Almacén."
              : "Las genera Ventas al aprobar la nota de pedido. Almacén alista, entrega (con firma) o deja en agencia."
          }
        />
        <div className="grid gap-3 border-b border-plomo-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Estado">
            <Select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoAlmacen | "")}
              placeholder="Todos"
              options={(Object.keys(ESTADOS_OD) as EstadoAlmacen[]).map((k) => ({ value: k, label: ESTADOS_OD[k] }))}
            />
          </Field>
          <Field label="Desde">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Field>
          <Field label="Sede / lugar de entrega">
            <Select
              value={lugar}
              onChange={(e) => setLugar(e.target.value as LugarEntrega | "")}
              placeholder="Todas"
              options={(Object.keys(LUGARES_ENTREGA) as LugarEntrega[]).map((k) => ({ value: k, label: LUGARES_ENTREGA[k] }))}
            />
          </Field>
        </div>
        {lista.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Truck size={28} />} text="No hay órdenes de despacho" />
          </div>
        ) : (
          <Table head={["Código", "Fecha", "Cliente", "Venta origen", "Lugar entrega", "Encargado / quien recoge", "Estado", ...(vista === "ventas" ? ["Seguimiento"] : []), "Acciones"]}>
            {lista.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-plomo-50" onClick={() => setSelId(o.id)}>
                <Td className="font-mono font-semibold text-azul-900">
                  {codigoOD(o)}
                  {o.vistoAlmacen === false && <span className="ml-2 rounded-full bg-corp px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">NUEVA</span>}
                  <p className="font-sans text-xs font-normal text-plomo-500">{o.numero}</p>
                </Td>
                <Td>{fechaPE(o.fecha)}</Td>
                <Td>
                  <p className="font-medium text-azul-900">{o.cliente}</p>
                  {o.clienteDoc && <p className="text-xs text-plomo-500">{o.clienteDoc}</p>}
                </Td>
                <Td>{origenOD(o)}</Td>
                <Td>
                  <p className="font-medium">{lugarTxt(o)}</p>
                  {o.lugar === "ENVIO_AGENCIA" && (
                    <p className="text-xs text-plomo-500">
                      {o.agenciaNombre} · guía {o.guiaNro}
                    </p>
                  )}
                  {o.clienteDireccionEntrega && <p className="max-w-[220px] truncate text-xs text-plomo-500" title={o.clienteDireccionEntrega}>{o.clienteDireccionEntrega}</p>}
                </Td>
                <Td>
                  {o.lugar === "ENTREGA_ENCARGADO" ? (
                    <span className="inline-flex flex-col rounded-lg bg-[#EEF2F7] px-2.5 py-1 text-xs font-semibold text-azul-900 ring-1 ring-inset ring-[#C9D4E3]">
                      Encargado: {o.encargadoNombre} - DNI {o.encargadoDni}
                      {o.encargadoTelefono && <span className="font-normal text-plomo-600">Tel. {o.encargadoTelefono}</span>}
                    </span>
                  ) : (
                    <span className="text-plomo-500">-</span>
                  )}
                </Td>
                <Td>
                  <Badge estado={estadoOD(o)} />
                </Td>
                {vista === "ventas" && (
                  <Td>
                    <Seguimiento od={o} />
                  </Td>
                )}
                <Td>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => setSelId(o.id)}>
                      <ClipboardCheck size={14} /> Ver
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => pdfOrdenDespacho(o)} title="PDF">
                      <FileText size={14} />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {sel && <DetalleOD od={sel} habilitado={habilitado} onClose={() => setSelId(null)} />}
    </div>
  );
}

type Modo = null | "ENTREGADO" | "AGENCIA";

function DetalleOD({ od, habilitado, onClose }: { od: OrdenDespacho; habilitado: boolean; onClose: () => void }) {
  const [rol] = useRol();
  const usuario = getSesion()?.usuario ?? "";
  const e = estadoOD(od);
  const abierta = e === "PENDIENTE" || e === "PEDIDO_ALISTADO";
  const [obs, setObs] = useState(od.observacion ?? "");
  const [modo, setModo] = useState<Modo>(null);
  useStore<EquipoTerminado[]>(KEYS.EQUIPOS, []); // en vivo: equipos terminados
  /** Disponible en la sede: equipos terminados por chasis + sede + DISPONIBLE; repuestos por stock. */
  const dispLinea = (l: OrdenDespacho["items"][number], s: string): number | null => {
    const eq = equipoDeLinea(l);
    if (eq) return disponibleEquipo(eq.codigo_chasis, s);
    return l.productoNombre ? stockDisponible(s, l.productoNombre, l.unidad) : null;
  };
  /** Ubicación real: sede del equipo (si está DISPONIBLE) o sedes con stock del repuesto. */
  const ubicacionLinea = (l: OrdenDespacho["items"][number]): string => {
    const eq = equipoDeLinea(l);
    if (eq) return eq.estado === "DISPONIBLE" ? sedeEquipo(eq) : `${sedeEquipo(eq)} (${eq.estado})`;
    if (!l.productoNombre) return l.ubicacion ?? "-";
    const sedes = SEDES.filter((x) => stockDisponible(x, l.productoNombre, l.unidad) > 0);
    return sedes.length ? sedes.join(", ") : "Sin stock";
  };
  /** Otra sede con stock suficiente para lo que falta entregar de la línea. */
  const otraSede = (l: OrdenDespacho["items"][number]): string | null => {
    const eq = equipoDeLinea(l);
    if (eq) return eq.estado === "DISPONIBLE" && sedeEquipo(eq) !== sede ? sedeEquipo(eq) : null;
    if (!l.productoNombre) return null;
    const falta = cant[l.id] ?? pendienteLinea(l);
    return SEDES.find((x) => x !== sede && stockDisponible(x, l.productoNombre, l.unidad) + 1e-9 >= falta) ?? null;
  };
  const transferir = (l: OrdenDespacho["items"][number]) => {
    const de = otraSede(l);
    if (!de) return;
    const eq = equipoDeLinea(l);
    ejecutar(() => {
      if (eq) transferirEquipo(eq.codigo_chasis, sede, usuario, od.numero);
      else {
        const cantidad = r2(cant[l.id] ?? pendienteLinea(l));
        transferirStock(l.productoNombre, l.unidad, cantidad, de, sede);
        registrarMovimiento({ tipo: "TRANSFERENCIA", producto: l.productoNombre, cantidad, de_sede: de, a_sede: sede, od: od.numero, usuario });
      }
    }, `${eq ? `Equipo ${eq.codigo_chasis}` : l.descripcion}: transferido de ${de} a ${sede}`);
  };
  const [sede, setSede] = useState(() => {
    const p = od.items.find((l) => l.productoNombre || equipoDeLinea(l));
    if (!p) return SEDES[0];
    const eq = equipoDeLinea(p);
    if (eq && sedeEquipo(eq)) return sedeEquipo(eq); // la sede real del equipo, aunque no esté en la lista
    return [...SEDES].sort((a, b) => (dispLinea(p, b) ?? 0) - (dispLinea(p, a) ?? 0))[0];
  });
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries(od.items.map((l) => [l.id, pendienteLinea(l)])));
  // Si recoge un encargado del cliente, ya se sabe quién recibe
  const [recibidoPor, setRecibidoPor] = useState(od.lugar === "ENTREGA_ENCARGADO" ? `${od.encargadoNombre ?? ""} DNI ${od.encargadoDni ?? ""}`.trim() : "");
  const [firma, setFirma] = useState<ArchivoAdjunto | undefined>();
  const [guia, setGuia] = useState(od.guiaNro ?? "");
  const [foto, setFoto] = useState<ArchivoAdjunto | undefined>();
  const fotoRef = useRef<HTMLInputElement>(null);

  const conPendiente = od.items.some((l) => pendienteLinea(l) > 0);
  const faltantes = modo
    ? od.items.filter((l) => {
        const d = dispLinea(l, sede);
        return d !== null && (cant[l.id] ?? 0) > 0 && d + 1e-9 < (cant[l.id] ?? 0);
      })
    : [];

  const cargarFoto = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("La foto debe ser una imagen (JPG, PNG o WEBP).", "error");
    if (file.size > MAX_ARCHIVO) return toast(`La foto pesa ${(file.size / 1048576).toFixed(1)} MB. Máximo 1.5 MB.`, "error");
    const r = new FileReader();
    r.onload = () => setFoto({ nombre: file.name, tipo: file.type, url: String(r.result) });
    r.readAsDataURL(file);
  };

  const cerrar = () => {
    if (!modo) return;
    const final = modo === "ENTREGADO" ? "PEDIDO_ENTREGADO" : "DEJADO_EN_AGENCIA";
    let parcial = false;
    const ok = ejecutar(() => {
      const r = cerrarDespacho(
        od.id,
        final,
        {
          mov: { responsable: usuario, sede, guiaRemision: modo === "AGENCIA" ? guia.trim() : "", observacion: obs.trim(), lineas: od.items.map((l) => ({ lineaId: l.id, cantidad: r2(cant[l.id] ?? 0) })) },
          observacion: obs,
          firmaCliente: modo === "ENTREGADO" ? firma : undefined,
          recibidoPor: modo === "ENTREGADO" ? recibidoPor : undefined,
          fotoGuia: modo === "AGENCIA" ? foto : undefined,
          guiaNro: modo === "AGENCIA" ? guia : undefined,
        },
        rol
      );
      parcial = r.estado === "PEDIDO_ALISTADO";
    }, modo === "ENTREGADO" ? `${codigoOD(od)}: pedido entregado` : `${codigoOD(od)}: dejado en agencia`);
    if (ok) {
      if (parcial) toast("Entrega parcial registrada: la orden sigue ALISTADA hasta completar.", "ok");
      setModo(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${codigoOD(od)} · ${od.cliente}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge estado={e} />
          <span className="text-plomo-600">
            {fechaPE(od.fecha)} · Venta {origenOD(od)}
            {od.vendedor ? ` · Vendedor ${od.vendedor}` : ""}
            {od.atendidoPor ? ` · Atendido por ${od.atendidoPor}` : ""}
          </span>
          <Button size="sm" variant="secondary" onClick={() => pdfOrdenDespacho(od)} className="ml-auto">
            <FileText size={14} /> PDF
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-plomo-200">
          <table className="w-full text-sm">
            <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Nombre repuesto / equipo</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-left">Ubicación</th>
                {modo && <th className="px-3 py-2 text-right">Stock en {sede}</th>}
                {modo && <th className="w-28 px-3 py-2 text-left">Entregar</th>}
              </tr>
            </thead>
            <tbody className="bg-white [&>tr]:border-b [&>tr]:border-plomo-100">
              {od.items.map((l) => {
                const disp = dispLinea(l, sede);
                const falta = !!modo && disp !== null && (cant[l.id] ?? 0) > disp + 1e-9;
                return (
                  <tr key={l.id} className={cn(falta && "bg-red-50")}>
                    <td className="px-3 py-2 font-mono text-xs">{equipoDeLinea(l)?.id || l.codigo || "-"}</td>
                    <td className="px-3 py-2">
                      {l.descripcion}
                      {l.ancho > 0 && <span className="text-xs text-plomo-500"> · {l.ancho}×{l.alto} m × {l.cantidadPiezas}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.solicitado} {l.unidad}
                      {l.despachado > 0 && <p className="text-xs text-plomo-500">entregado {l.despachado}</p>}
                    </td>
                    <td className="px-3 py-2 text-plomo-600">
                      {ubicacionLinea(l)}
                      {equipoDeLinea(l) && <p className="font-mono text-[11px] text-plomo-500">Chasis {equipoDeLinea(l)!.codigo_chasis}</p>}
                    </td>
                    {modo && (
                      <td className={cn("px-3 py-2 text-right", falta ? "font-bold text-red-600" : "text-plomo-600")}>
                        {disp === null ? "-" : `${disp} ${l.unidad}`}
                        {falta && habilitado && otraSede(l) && (
                          <Button size="sm" variant="secondary" className="mt-1" onClick={() => transferir(l)}>
                            <ArrowRightLeft size={12} /> Transferir desde {otraSede(l)}
                          </Button>
                        )}
                      </td>
                    )}
                    {modo && (
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={pendienteLinea(l)}
                          step="any"
                          value={cant[l.id] ?? 0}
                          onChange={(ev) => setCant({ ...cant, [l.id]: parseFloat(ev.target.value) || 0 })}
                          className={cn("text-right", falta && "border-red-400")}
                          aria-label={`Entregar ${l.descripcion}`}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-plomo-200 p-4 text-sm">
            <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">
              <MapPin size={14} /> Lugar de entrega
            </p>
            <p className="font-semibold text-azul-900">{lugarTxt(od)}</p>
            {od.lugar === "ENVIO_AGENCIA" && (
              <ul className="mt-1 space-y-0.5 text-plomo-600">
                <li>Agencia: {od.agenciaNombre}</li>
                <li>N° guía: {od.guiaNro}</li>
                {od.costoEnvio ? <li>Costo envío: {soles(od.costoEnvio)}</li> : null}
                {od.direccionDestino && <li>Destino: {od.direccionDestino}</li>}
              </ul>
            )}
            {od.lugar === "ENTREGA_ENCARGADO" && (
              <ul className="mt-1 space-y-0.5 text-plomo-600">
                <li>Recoge: {od.encargadoNombre}</li>
                <li>DNI: {od.encargadoDni}</li>
                {od.encargadoTelefono && <li>Teléfono: {od.encargadoTelefono}</li>}
              </ul>
            )}
            {od.lugar !== "ENVIO_AGENCIA" && od.lugar !== "ENTREGA_ENCARGADO" && (od.clienteDireccionEntrega || od.direccionDestino) && (
              <p className="text-plomo-600">{od.clienteDireccionEntrega || od.direccionDestino}</p>
            )}
            {od.recibidoPor && <p className="mt-2 text-plomo-600">Recibió: {od.recibidoPor}</p>}
            {od.firmaCliente && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={od.firmaCliente.url} alt="Firma del cliente" className="mt-2 h-16 rounded border border-plomo-200 bg-white" />
            )}
            {od.fotoGuia && (
              <a href={od.fotoGuia.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-azul-700 underline">
                <Camera size={12} /> Foto de la guía
              </a>
            )}
          </div>
          <Field label="Observación de Almacén">
            <Textarea value={obs} onChange={(ev) => setObs(ev.target.value)} disabled={!habilitado} className="min-h-[110px]" />
          </Field>
        </div>

        {modo && (
          <div className="space-y-3 rounded-xl border-2 border-azul-900 p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-azul-900">
              {modo === "ENTREGADO" ? "Marcar entregado: salida de almacén y firma del cliente" : "Dejado en agencia: salida de almacén y guía"}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Almacén (sede) de salida">
                <Select value={sede} onChange={(ev) => setSede(ev.target.value)} options={Array.from(new Set([...SEDES, sede])).map((x) => ({ value: x, label: x }))} />
              </Field>
              {modo === "ENTREGADO" ? (
                <Field label="Recibido por (cliente) *" className="md:col-span-2">
                  <Input value={recibidoPor} onChange={(ev) => setRecibidoPor(ev.target.value)} placeholder="Nombre y DNI de quien recibe" />
                </Field>
              ) : (
                <>
                  <Field label="N° guía agencia">
                    <Input value={guia} onChange={(ev) => setGuia(ev.target.value.toUpperCase())} />
                  </Field>
                  <Field label="Foto de la guía (opcional)">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => fotoRef.current?.click()}>
                        <Camera size={14} /> {foto ? "Cambiar" : "Adjuntar"}
                      </Button>
                      {foto && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={foto.url} alt="Foto de la guía" className="h-10 w-10 rounded object-cover" />
                      )}
                      <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(ev) => cargarFoto(ev.target.files?.[0])} />
                    </div>
                  </Field>
                </>
              )}
            </div>
            {modo === "ENTREGADO" && <FirmaPad onChange={setFirma} />}
            {faltantes.length > 0 && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-vino px-4 py-3 text-sm font-medium text-white">
                <AlertTriangle size={18} className="shrink-0" />
                Stock insuficiente en {sede}: {faltantes.map((l) => `${l.descripcion} (hay ${dispLinea(l, sede) ?? 0} ${l.unidad}${equipoDeLinea(l) ? ` · el equipo está en ${ubicacionLinea(l)}` : ""})`).join(", ")}. Cambie de sede o entregue
                menos (entrega parcial).
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModo(null)}>
                Cancelar
              </Button>
              <Button onClick={cerrar} disabled={faltantes.length > 0}>
                <CheckCircle2 size={16} /> Confirmar {modo === "ENTREGADO" ? "entrega" : "dejado en agencia"}
              </Button>
            </div>
          </div>
        )}

        {habilitado && !modo && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-plomo-100 pt-4">
            <Button variant="secondary" onClick={() => ejecutar(() => guardarObservacionOD(od.id, obs, usuario, rol), "Observación guardada")}>
              <Save size={16} /> Guardar observación
            </Button>
            {e === "PENDIENTE" && (
              <Button variant="success" onClick={() => ejecutar(() => marcarAlistado(od.id, usuario, obs, rol), `${codigoOD(od)}: pedido alistado`)}>
                <PackageCheck size={16} /> Marcar pedido alistado
              </Button>
            )}
            {abierta && (
              <>
                <Button onClick={() => setModo("ENTREGADO")}>
                  <CheckCircle2 size={16} /> Marcar entregado
                </Button>
                <Button variant="danger" onClick={() => setModo("AGENCIA")}>
                  <Building2 size={16} /> Marcar dejado en agencia
                </Button>
              </>
            )}
          </div>
        )}
        <Seguimiento od={od} grande />
        <div className="rounded-xl border border-plomo-200 p-4">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-plomo-500">Historial de la orden</p>
          <Timeline eventos={od.historial} />
        </div>
        {!habilitado && abierta && <p className="text-right text-xs text-plomo-500">Solo Almacén cambia el estado de la orden.</p>}
        {abierta && !conPendiente && <p className="text-right text-xs text-plomo-500">Todo el pedido ya salió de almacén.</p>}
      </div>
    </Modal>
  );
}


/** Pasos del despacho: Pendiente → Alistado → Entregado / En agencia. */
function Seguimiento({ od, grande }: { od: OrdenDespacho; grande?: boolean }) {
  const e = estadoOD(od);
  if (e === "ANULADO") return <Badge estado="ANULADO" />;
  const final: EstadoAlmacen = e === "DEJADO_EN_AGENCIA" ? "DEJADO_EN_AGENCIA" : "PEDIDO_ENTREGADO";
  const pasos: EstadoAlmacen[] = ["PENDIENTE", "PEDIDO_ALISTADO", final];
  const actual = pasos.indexOf(e);
  const fecha = (k: EstadoAlmacen) => {
    const acc = { PENDIENTE: /generada/i, PEDIDO_ALISTADO: /alistado|preparación/i, PEDIDO_ENTREGADO: /entregado|despachado total/i, DEJADO_EN_AGENCIA: /agencia/i, ANULADO: /anulad/i }[k];
    const ev = [...od.historial].reverse().find((h) => acc.test(h.accion));
    return ev ? new Date(ev.fecha).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  };
  return (
    <ol className={cn("flex items-start", grande ? "gap-0 rounded-xl border border-plomo-200 p-4" : "gap-0")} aria-label="Seguimiento del despacho">
      {pasos.map((k, i) => {
        const hecho = i <= actual;
        return (
          <li key={k} className={cn("flex flex-1 items-start", i < pasos.length - 1 && "min-w-[70px]")}>
            <div className="flex flex-col items-center text-center">
              <span
                className={cn(
                  "flex items-center justify-center rounded-full font-bold",
                  grande ? "h-8 w-8 text-sm" : "h-5 w-5 text-[10px]",
                  hecho ? (i === actual ? "bg-corp text-white" : "bg-azul-900 text-white") : "border-2 border-plomo-200 bg-white text-plomo-500"
                )}
              >
                {hecho ? "✓" : i + 1}
              </span>
              <span className={cn("mt-1 whitespace-nowrap", grande ? "text-xs" : "text-[10px]", hecho ? "font-semibold text-azul-900" : "text-plomo-500")}>{ESTADOS_OD[k]}</span>
              {grande && hecho && <span className="text-[10px] text-plomo-500">{fecha(k)}</span>}
            </div>
            {i < pasos.length - 1 && <span className={cn("mt-2.5 h-0.5 flex-1", grande && "mt-4", i < actual ? "bg-azul-900" : "bg-plomo-200")} />}
          </li>
        );
      })}
    </ol>
  );
}
