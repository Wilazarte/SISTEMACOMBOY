"use client";

import { useMemo, useState } from "react";
import { TrendingDown, AlertTriangle, ArrowRightLeft, Check, ChevronDown, ChevronUp, FileSpreadsheet, Lock, Mail, MessageCircle, MessageSquareWarning, Pencil, Send, Trash2, X } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Modal, Select, Table, Td, Textarea, cn, ejecutar, toast } from "@/components/ui";
import { KEYS, fechaPE, hoy, puede, r2, soles, useStore } from "@/lib/storage";
import { etiquetaOpcion } from "@/lib/proveedores";
import { EstadoRuc } from "@/components/EstadoRuc";
import { AnalisisPrecios, useResumenPrecios } from "@/components/compras/AnalisisPrecios";
import { resumenDe, sugerirProveedor } from "@/lib/analisisPrecios";
import { puedeGestionarProveedores } from "@/lib/proveedores";
import { useSesion } from "@/lib/auth";
import {
  DIAS_VENTANA,
  aceptarLista,
  asuntoSolicitud,
  candidatos,
  cambiarCantidad,
  celularWhatsApp,
  cerrarLista,
  enlaceEnvio,
  juntando,
  lineasActivas,
  mensajeSolicitud,
  moverLinea,
  observarLista,
  productosConsolidados,
  proveedoresParaSolicitar,
  quitarLinea,
  rechazarLista,
  registrarCotizacionLista,
  registrarEnvio,
  type ListaProveedor,
  type MedioEnvio,
} from "@/lib/listasProveedor";
import type { Proveedor, Requerimiento, Rol } from "@/lib/types";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });

function estadoVisible(l: ListaProveedor): { texto: string; cls: string } {
  if (l.estado === "ABIERTA" && juntando(l)) return { texto: `Juntando REQ hasta ${fechaHora(l.corte)}`, cls: "bg-sky-100 text-sky-800" };
  if (l.estado === "ABIERTA") return { texto: "Por revisar", cls: "bg-amber-100 text-amber-800" };
  if (l.estado === "ACEPTADA") return { texto: "Aceptada · pedir cotización", cls: "bg-emerald-100 text-emerald-800" };
  if (l.estado === "SOLICITADA") return { texto: "Cotización solicitada", cls: "bg-indigo-100 text-indigo-800" };
  if (l.estado === "COTIZADA") return { texto: "Cotizada", cls: "bg-emerald-600 text-white" };
  return { texto: "Rechazada", cls: "bg-red-100 text-red-800" };
}

/**
 * Tesorería · Listas por proveedor (Williams 2026-11-26). Los REQ de Almacén se juntan por proveedor durante
 * DIAS_VENTANA días: una sola lista que se revisa, se envía por WhatsApp / correo y se cotiza con N°, fecha y precios.
 */
export function ListasProveedor({ rol, onIrCotizaciones }: { rol: Rol; onIrCotizaciones: () => void }) {
  const listas = useStore<ListaProveedor[]>(KEYS.LISTAS_PROVEEDOR, []);
  const proveedores = useStore<Proveedor[]>(KEYS.PROVEEDORES, []);
  const [verTodas, setVerTodas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [editar, setEditar] = useState<ListaProveedor | null>(null);
  const [obs, setObs] = useState<{ lista: ListaProveedor; tipo: "OBSERVAR" | "RECHAZAR" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviar, setEnviar] = useState<ListaProveedor | null>(null);
  const [cotizar, setCotizar] = useState<ListaProveedor | null>(null);
  const revisa = puede(rol, "req.revisar");
  const { sesion } = useSesion();
  const { resumen } = useResumenPrecios();
  const [verPrecios, setVerPrecios] = useState(false);
  // La sugerencia de proveedor se muestra recién con el REQ aceptado (Williams 2026-11-27)
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const aceptados = new Set(procesados.filter((r) => r.estado !== "OBSERVADO").map((r) => r.id));
  const cotiza = puede(rol, "coti.crear");

  const orden: Record<string, number> = { ABIERTA: 0, ACEPTADA: 1, SOLICITADA: 2, COTIZADA: 3, RECHAZADA: 4 };
  const visibles = useMemo(
    () =>
      listas
        .filter((l) => verTodas || l.estado === "ABIERTA" || l.estado === "ACEPTADA" || l.estado === "SOLICITADA")
        // Primero lo que no tiene proveedor (hay que asignarlo), luego por estado y lo más reciente arriba
        .sort((a, b) => (a.proveedorId ? 1 : 0) - (b.proveedorId ? 1 : 0) || orden[a.estado] - orden[b.estado] || b.inicio.localeCompare(a.inicio)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listas, verTodas],
  );
  // Con datos frescos: el modal trabaja sobre la lista guardada, no sobre la copia de cuando se abrió
  const fresca = (l: ListaProveedor | null) => (l ? listas.find((x) => x.id === l.id) ?? null : null);

  return (
    <div className="space-y-4">
      {verPrecios && <AnalisisPrecios puedeLlenar={puedeGestionarProveedores(sesion)} />}
      <Card>
        <CardHeader
          title={`Listas por proveedor (${visibles.length})`}
          subtitle={`El proveedor sugerido por precio se muestra al aceptar el REQ. Los REQ de Almacén se juntan solos por proveedor durante ${DIAS_VENTANA} días (según Logística › Base de proveedores: gana el proveedor con más repuestos; si empatan, la mejor opción). Revise la lista, pida cotización por WhatsApp o correo y registre la cotización solo con N°, fecha y precios.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-plomo-600">
                <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} /> Ver también cotizadas y rechazadas
              </label>
              <Button size="sm" variant="secondary" onClick={() => setVerPrecios((v) => !v)}>
                <TrendingDown size={14} /> {verPrecios ? "Ocultar análisis de precios" : "Análisis de precios"}
              </Button>
            </div>
          }
        />
        {visibles.length === 0 ? (
          <p className="px-5 py-6 text-sm text-plomo-500">No hay listas por revisar. Se crean solas cuando Almacén emite un REQ.</p>
        ) : (
          <div className="divide-y divide-plomo-100">
            {visibles.map((l) => {
              const est = estadoVisible(l);
              const activas = lineasActivas(l);
              const reqs = [...new Set(activas.map((x) => x.reqNumero))];
              const prov = proveedores.find((p) => p.id === l.proveedorId);
              const sinProv = !l.proveedorId;
              const expandida = abierta === l.id;
              const editable = l.estado !== "COTIZADA" && l.estado !== "RECHAZADA";
              return (
                <div key={l.id} className={cn("px-5 py-3", sinProv && "bg-amber-50/60")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">
                        {l.numero} · {sinProv ? <span className="text-amber-700">Sin proveedor en la base</span> : l.proveedor}
                        <span className={cn("ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold", est.cls)}>{est.texto}</span>
                      </p>
                      <p className="text-xs text-plomo-500">
                        {productosConsolidados(l).length} producto(s) · {reqs.length} REQ: {reqs.join(", ") || "-"}
                        {prov && ` · ${[prov.ruc, prov.asesorVentas, prov.contacto].filter(Boolean).join(" · ")}`}
                      </p>
                      {sinProv && <p className="text-xs text-amber-700">Ningún proveedor de la base vende estos productos: use Editar › Mover para asignarlos, o complete la ficha del proveedor en Logística.</p>}
                      {l.envios.length > 0 && (
                        <p className="text-xs text-indigo-700">Solicitada a: {[...new Set(l.envios.map((e) => e.proveedor))].join(", ")}</p>
                      )}
                      {l.cotizaciones.length > 0 && (
                        <p className="text-xs text-emerald-700">
                          Cotizaciones: {l.cotizaciones.map((c) => `${c.proveedor} N° ${c.numero} (${soles(c.total)})`).join(" · ")}
                        </p>
                      )}
                      {l.observacion && <p className="text-xs text-red-700">Observación: {l.observacion}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setAbierta(expandida ? null : l.id)} title="Ver productos">
                        {expandida ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Ver
                      </Button>
                      {revisa && editable && (
                        <Button size="sm" variant="secondary" onClick={() => setEditar(l)}>
                          <Pencil size={14} /> Editar
                        </Button>
                      )}
                      {revisa && l.estado === "ABIERTA" && juntando(l) && (
                        <Button size="sm" variant="ghost" title="Dejar de juntar REQ nuevos" onClick={() => ejecutar(() => cerrarLista(l.id, rol), `${l.numero} cerrada`)}>
                          <Lock size={14} /> Cerrar
                        </Button>
                      )}
                      {revisa && l.estado === "ABIERTA" && !sinProv && (
                        <Button size="sm" variant="success" onClick={() => ejecutar(() => aceptarLista(l.id, rol), `${l.numero} aceptada`)}>
                          <Check size={14} /> Aceptar
                        </Button>
                      )}
                      {revisa && l.estado === "ABIERTA" && (
                        <Button size="sm" variant="secondary" onClick={() => { setMotivo(""); setObs({ lista: l, tipo: "OBSERVAR" }); }}>
                          <MessageSquareWarning size={14} /> Observar
                        </Button>
                      )}
                      {revisa && editable && l.estado !== "COTIZADA" && (
                        <Button size="sm" variant="danger" onClick={() => { setMotivo(""); setObs({ lista: l, tipo: "RECHAZAR" }); }}>
                          <X size={14} /> Rechazar
                        </Button>
                      )}
                      {revisa && !sinProv && l.estado !== "RECHAZADA" && (
                        <Button size="sm" onClick={() => setEnviar(l)}>
                          <Send size={14} /> Pedir cotización
                        </Button>
                      )}
                      {cotiza && !sinProv && (l.estado === "ACEPTADA" || l.estado === "SOLICITADA" || l.estado === "COTIZADA") && (
                        <Button size="sm" variant="success" onClick={() => setCotizar(l)}>
                          <FileSpreadsheet size={14} /> Registrar cotización
                        </Button>
                      )}
                    </div>
                  </div>
                  {expandida && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-plomo-100">
                      <Table head={["Producto", "Cant.", "Und.", "Marca", "REQ", "Opción", "Precio más bajo (sugerido)", "Otros proveedores"]}>
                        {l.lineas.map((x) => {
                          const otros = candidatos(x, proveedores).filter((c) => c.proveedor.id !== l.proveedorId);
                          return (
                            <tr key={x.id} className={cn(x.rechazada && "line-through opacity-50")}>
                              <Td className="font-medium">
                                {x.nombre}
                                {x.sku && <span className="ml-1 text-[11px] text-plomo-500">{x.sku}</span>}
                              </Td>
                              <Td>
                                {x.cantidad}
                                {x.cantidadEditada && <span className="ml-1 text-[11px] text-amber-700" title="Cantidad editada por Tesorería">✎</span>}
                              </Td>
                              <Td>{x.unidad}</Td>
                              <Td>{x.marca || "-"}</Td>
                              <Td>{x.reqNumero}</Td>
                              <Td>{x.opcion ? etiquetaOpcion(x.opcion) : "-"}</Td>
                              <Td className="text-xs">
                                {(() => {
                                  if (l.estado === "ABIERTA" && !aceptados.has(x.reqId)) return <span className="text-plomo-500">Se muestra al aceptar el REQ</span>;
                                  const sug = sugerirProveedor(resumen, x);
                                  if (!sug) return <span className="text-plomo-500">Sin historial</span>;
                                  const esEste = sug.proveedorId === l.proveedorId;
                                  return (
                                    <span title={sug.motivo} className={esEste ? "text-emerald-700" : "text-amber-700"}>
                                      {esEste ? "✓ " : "⚠ "}
                                      {sug.proveedor} · {soles(sug.precio)}
                                    </span>
                                  );
                                })()}
                              </Td>
                              <Td className="text-xs text-plomo-500">{otros.map((c) => `${c.proveedor.razonSocial} (${c.opcion}ª)`).join(", ") || "-"}</Td>
                            </tr>
                          );
                        })}
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {fresca(editar) && <EditarLista lista={fresca(editar)!} proveedores={proveedores} rol={rol} onClose={() => setEditar(null)} />}
      {fresca(enviar) && <PedirCotizacion lista={fresca(enviar)!} proveedores={proveedores} rol={rol} onClose={() => setEnviar(null)} />}
      {fresca(cotizar) && (
        <RegistrarCotizacionLista
          lista={fresca(cotizar)!}
          proveedores={proveedores}
          rol={rol}
          onClose={() => setCotizar(null)}
          onListo={() => {
            setCotizar(null);
            onIrCotizaciones();
          }}
        />
      )}

      <Modal open={!!obs} onClose={() => setObs(null)} title={`${obs?.tipo === "RECHAZAR" ? "Rechazar" : "Observar"} ${obs?.lista.numero ?? ""}`}>
        {obs && (
          <>
            <div className={cn("mb-3 flex gap-2 rounded-lg p-3 text-sm", obs.tipo === "RECHAZAR" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800")}>
              <AlertTriangle size={18} className="shrink-0" />
              {obs.tipo === "RECHAZAR"
                ? "Los productos de esta lista quedan rechazados. Un REQ que tenga todos sus productos rechazados se elimina; si tiene productos en otras listas, sigue con esos."
                : `Los REQ ${[...new Set(lineasActivas(obs.lista).map((x) => x.reqNumero))].join(", ")} vuelven a Almacén con esta observación. Al corregirlos y reenviarlos se vuelven a juntar.`}
            </div>
            <Field label="Motivo *">
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setObs(null)}>
                Cancelar
              </Button>
              <Button
                variant={obs.tipo === "RECHAZAR" ? "danger" : "warning"}
                onClick={() => {
                  const l = obs.lista;
                  const ok =
                    obs.tipo === "RECHAZAR"
                      ? ejecutar(() => {
                          const elim = rechazarLista(l.id, motivo, rol);
                          if (elim.length) window.setTimeout(() => toast(`REQ eliminados (todos sus productos rechazados): ${elim.join(", ")}`), 400);
                        }, `${l.numero} rechazada`)
                      : ejecutar(() => void observarLista(l.id, motivo, rol), `${l.numero}: REQ observados`);
                  if (ok) setObs(null);
                }}
              >
                {obs.tipo === "RECHAZAR" ? "Rechazar lista" : "Enviar observación"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------
// Editar: cantidades, quitar y mover productos a otro proveedor
// ---------------------------------------------------------------------
function EditarLista({ lista, proveedores, rol, onClose }: { lista: ListaProveedor; proveedores: Proveedor[]; rol: Rol; onClose: () => void }) {
  const { resumen: todo } = useResumenPrecios();
  const procesados = useStore<Requerimiento[]>(KEYS.REQS_PROCESADOS, []);
  const aceptados = new Set(procesados.filter((r) => r.estado !== "OBSERVADO").map((r) => r.id));
  const [cant, setCant] = useState<Record<string, string>>({});
  const [mover, setMover] = useState<Record<string, string>>({});
  const activos = proveedores.filter((p) => p.estado !== "INACTIVO" && p.id !== lista.proveedorId).sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
  return (
    <Modal open onClose={onClose} title={`Editar ${lista.numero} · ${lista.proveedor}`} wide>
      <p className="mb-3 text-xs text-plomo-500">Cambie cantidades, quite productos o páselos a otro proveedor (van a la lista abierta de ese proveedor o a una nueva).</p>
      <div className="space-y-2">
        {lineasActivas(lista).map((x) => {
          // Precios y sugerencia solo con el REQ aceptado
          const resumen = lista.estado !== "ABIERTA" || aceptados.has(x.reqId) ? todo : [];
          const precios = resumenDe(resumen, x)?.proveedores ?? [];
          const precioDe = (id: string) => precios.find((p) => p.proveedorId === id);
          const etiquetaPrecio = (id: string) => {
            const p = precioDe(id);
            return p ? ` · ${soles(p.ultimo)}${p === precios[0] ? " (más barato)" : ""}` : "";
          };
          const sug = sugerirProveedor(resumen, x);
          const cands = candidatos(x, proveedores)
            .filter((c) => c.proveedor.id !== lista.proveedorId)
            .sort((a, b) => (precioDe(a.proveedor.id)?.ultimo ?? Infinity) - (precioDe(b.proveedor.id)?.ultimo ?? Infinity));
          const idsCand = new Set(cands.map((c) => c.proveedor.id));
          return (
            <div key={x.id} className="grid items-end gap-2 rounded-lg border border-plomo-100 p-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto_minmax(0,14rem)_auto_auto]">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{x.nombre}</p>
                <p className="text-[11px] text-plomo-500">
                  {x.reqNumero} · {x.unidad}
                  {x.marca && ` · ${x.marca}`}
                </p>
                {sug && (
                  <p className={cn("text-[11px]", sug.proveedorId === lista.proveedorId ? "text-emerald-700" : "text-amber-700")} title={sug.motivo}>
                    Sugerido por precio: {sug.proveedor} · {soles(sug.precio)}
                  </p>
                )}
              </div>
              <Field label="Cantidad">
                <Input type="number" min={0} step="0.01" value={cant[x.id] ?? String(x.cantidad)} onChange={(e) => setCant((c) => ({ ...c, [x.id]: e.target.value }))} />
              </Field>
              <Button
                size="sm"
                variant="secondary"
                disabled={(cant[x.id] ?? String(x.cantidad)) === String(x.cantidad)}
                onClick={() => ejecutar(() => cambiarCantidad(lista.id, x.id, parseFloat(cant[x.id] ?? "0"), rol), "Cantidad actualizada")}
              >
                <Check size={14} />
              </Button>
              <Field label="Mover a proveedor">
                <Select
                  value={mover[x.id] ?? ""}
                  onChange={(e) => setMover((m) => ({ ...m, [x.id]: e.target.value }))}
                  placeholder="Elegir…"
                  options={[
                    ...cands.map((c) => ({ value: c.proveedor.id, label: `${c.proveedor.razonSocial} (${c.opcion}ª opción)${etiquetaPrecio(c.proveedor.id)}` })),
                    ...activos.filter((p) => !idsCand.has(p.id)).map((p) => ({ value: p.id, label: `${p.razonSocial} (no lo tiene registrado)${etiquetaPrecio(p.id)}` })),
                  ]}
                />
              </Field>
              <Button size="sm" variant="secondary" disabled={!mover[x.id]} onClick={() => ejecutar(() => void moverLinea(lista.id, x.id, mover[x.id], rol), "Producto movido")} title="Mover">
                <ArrowRightLeft size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Quitar de la lista"
                onClick={() =>
                  confirm(`¿Quitar ${x.nombre} de la lista?`) &&
                  ejecutar(() => {
                    const elim = quitarLinea(lista.id, x.id, rol);
                    if (elim.length) window.setTimeout(() => toast(`${elim.join(", ")} eliminado: ya no le quedan productos`), 400);
                  }, "Producto quitado")
                }
              >
                <Trash2 size={14} className="text-red-600" />
              </Button>
            </div>
          );
        })}
        {lineasActivas(lista).length === 0 && <p className="text-sm text-plomo-500">La lista ya no tiene productos.</p>}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Listo
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Pedir cotización por WhatsApp / correo a uno o varios proveedores
// ---------------------------------------------------------------------
function PedirCotizacion({ lista, proveedores, rol, onClose }: { lista: ListaProveedor; proveedores: Proveedor[]; rol: Rol; onClose: () => void }) {
  const opciones = proveedoresParaSolicitar(lista, proveedores);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(opciones.filter((o) => o.principal).map((o) => o.proveedor.id)));
  const [textos, setTextos] = useState<Record<string, string>>({});
  const total = productosConsolidados(lista).length;
  const enviar = (prov: Proveedor, medio: MedioEnvio) => {
    const texto = textos[prov.id] ?? mensajeSolicitud(lista, prov);
    if (medio === "WHATSAPP" && !celularWhatsApp(prov.contacto)) toast(`${prov.razonSocial} no tiene celular en la base: elija el chat en WhatsApp.`, "error");
    if (medio !== "WHATSAPP" && !prov.correo) toast(`${prov.razonSocial} no tiene correo en la base: escríbalo en el correo.`, "error");
    const url = enlaceEnvio(medio, prov, texto, asuntoSolicitud(lista));
    if (medio === "CORREO") window.location.href = url;
    else window.open(url, "_blank", "noopener");
    ejecutar(() => registrarEnvio(lista.id, prov, medio, rol), `Solicitud anotada: ${prov.razonSocial}`);
  };
  return (
    <Modal open onClose={onClose} title={`Pedir cotización · ${lista.numero}`} wide>
      <p className="mb-3 text-xs text-plomo-500">
        Marque a quién pedir cotización (puede ser más de un proveedor para comparar). Cada botón abre WhatsApp o el correo con el mensaje listo; revise y pulse Enviar allí.
        La lista se acepta y queda como “Cotización solicitada”.
      </p>
      <div className="space-y-3">
        {opciones.map(({ proveedor: p, cubre, principal }) => {
          const marcado = marcados.has(p.id);
          return (
            <div key={p.id} className={cn("rounded-lg border p-3", marcado ? "border-azul-900/40" : "border-plomo-100")}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={marcado}
                  onChange={() =>
                    setMarcados((m) => {
                      const n = new Set(m);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="font-semibold text-fg">{p.razonSocial}</span>
                  {principal && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Proveedor de la lista</span>}
                  <span className="block text-xs text-plomo-500">
                    Vende {cubre} de {total} producto(s) · {[p.asesorVentas, p.contacto || "sin celular", p.correo || "sin correo"].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
              {marcado && (
                <div className="mt-2 space-y-2">
                  <Textarea rows={7} value={textos[p.id] ?? mensajeSolicitud(lista, p)} onChange={(e) => setTextos((t) => ({ ...t, [p.id]: e.target.value }))} aria-label={`Mensaje para ${p.razonSocial}`} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={() => enviar(p, "WHATSAPP")}>
                      <MessageCircle size={14} /> WhatsApp
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => enviar(p, "CORREO")}>
                      <Mail size={14} /> Correo (Outlook / programa de correo)
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => enviar(p, "GMAIL")}>
                      <Mail size={14} /> Gmail
                    </Button>
                  </div>
                  {lista.envios.some((e) => e.proveedorId === p.id) && (
                    <p className="text-[11px] text-indigo-700">
                      Ya solicitada: {lista.envios.filter((e) => e.proveedorId === p.id).map((e) => `${e.medio === "WHATSAPP" ? "WhatsApp" : e.medio === "GMAIL" ? "Gmail" : "correo"} ${fechaHora(e.fecha)}`).join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Registrar la cotización recibida: N°, fecha y precios (el proveedor sale de la base)
// ---------------------------------------------------------------------
function RegistrarCotizacionLista({ lista, proveedores, rol, onClose, onListo }: { lista: ListaProveedor; proveedores: Proveedor[]; rol: Rol; onClose: () => void; onListo: () => void }) {
  const { resumen } = useResumenPrecios();
  const idsPosibles = [...new Set([lista.proveedorId, ...lista.envios.map((e) => e.proveedorId)])].filter(Boolean);
  const posibles = idsPosibles.map((id) => proveedores.find((p) => p.id === id)).filter((p): p is Proveedor => !!p);
  const yaCotizaron = new Set(lista.cotizaciones.map((c) => c.proveedorId));
  const [provId, setProvId] = useState(posibles.find((p) => !yaCotizaron.has(p.id))?.id ?? posibles[0]?.id ?? "");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoy());
  // Un precio por producto (el mismo producto de varios REQ va en una línea, como se le pidió al proveedor)
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const prov = posibles.find((p) => p.id === provId);
  const productos = productosConsolidados(lista);
  const num = (clave: string) => parseFloat(precios[clave] ?? "") || 0;
  const total = r2(productos.reduce((a, x) => a + num(x.clave) * x.cantidad, 0));
  const guardar = () => {
    const porLinea = Object.fromEntries(productos.flatMap((g) => g.lineas.map((x) => [x.id, num(g.clave)])));
    const ok = ejecutar(() => {
      const reg = registrarCotizacionLista(lista.id, provId, { numero, fecha, precios: porLinea }, rol);
      window.setTimeout(() => toast(`Se guardó una cotización por REQ (${reg.cotizacionIds.length}). Genere la OC desde Cotizaciones.`), 400);
    }, "Cotización registrada");
    if (ok) onListo();
  };
  return (
    <Modal open onClose={onClose} title={`Registrar cotización · ${lista.numero}`} wide>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Proveedor que cotizó" className="md:col-span-3">
          <Select value={provId} onChange={(e) => setProvId(e.target.value)} options={posibles.map((p) => ({ value: p.id, label: `${p.razonSocial}${yaCotizaron.has(p.id) ? " (ya registró una)" : ""}` }))} />
        </Field>
        {prov && (
          <div className="grid gap-1 rounded-lg bg-plomo-50 p-3 text-xs text-plomo-600 md:col-span-3 md:grid-cols-4">
            <span>
              <b className="text-fg">RUC:</b> {prov.ruc}
              <EstadoRuc ruc={prov.ruc} />
            </span>
            <span>
              <b className="text-fg">Asesor:</b> {prov.asesorVentas || "-"}
            </span>
            <span>
              <b className="text-fg">Contacto:</b> {prov.contacto || "-"}
            </span>
            <span>
              <b className="text-fg">Correo:</b> {prov.correo || "-"}
            </span>
          </div>
        )}
        <Field label="N° de cotización *">
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. COT-000123" autoFocus />
        </Field>
        <Field label="Fecha *">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 overflow-x-auto">
        <Table head={["Producto", "REQ", "Cant.", "Und.", "Último precio", "P. Unit. (inc. IGV)", "Importe"]}>
          {productos.map((x) => {
            const ref = resumenDe(resumen, { nombre: x.nombre, unidad: x.unidad, productoId: x.lineas[0]?.productoId });
            const deEste = ref?.proveedores.find((p) => p.proveedorId === provId);
            const mejor = ref?.proveedores[0];
            const escrito = num(x.clave);
            return (
            <tr key={x.clave}>
              <Td className="font-medium">
                {x.nombre}
                {x.marca && <span className="ml-1 text-xs text-plomo-500">({x.marca})</span>}
              </Td>
              <Td className="text-xs">{x.reqs.join(", ")}</Td>
              <Td>{x.cantidad}</Td>
              <Td>{x.unidad}</Td>
              <Td className="text-[11px] text-plomo-500">
                {deEste && <p>Este proveedor: {soles(deEste.ultimo)}</p>}
                {mejor && mejor !== deEste && <p>Más bajo: {soles(mejor.ultimo)} ({mejor.proveedor})</p>}
                {!ref && "-"}
                {mejor && escrito > 0 && escrito > mejor.ultimo && <p className="font-semibold text-red-700">▲ {Math.round(((escrito - mejor.ultimo) / mejor.ultimo) * 100)}% sobre el más bajo</p>}
              </Td>
              <Td>
                <Input type="number" min={0} step="0.01" value={precios[x.clave] ?? ""} onChange={(e) => setPrecios((p) => ({ ...p, [x.clave]: e.target.value }))} className="w-32 text-right" aria-label={`Precio ${x.nombre}`} />
              </Td>
              <Td className="text-right">{soles(r2(num(x.clave) * x.cantidad))}</Td>
            </tr>
            );
          })}
        </Table>
      </div>
      <p className="mt-2 text-right text-xs text-plomo-500">Precios CON IGV. Deje en blanco lo que el proveedor no cotizó. Fecha de la lista: {fechaPE(lista.inicio)}.</p>
      <p className="mt-1 text-right text-sm font-semibold text-fg">Total: {soles(total)}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={!prov}>
          <FileSpreadsheet size={15} /> Guardar cotización
        </Button>
      </div>
    </Modal>
  );
}
