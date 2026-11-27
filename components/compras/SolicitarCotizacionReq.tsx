"use client";

// Formulario de confirmación de "Solicitar cotización" (Tesorería › Aceptados · por cotizar) · Williams 2026-11-27.
// Se elige el proveedor (el sugerido arriba), se revisa asesor, WhatsApp, productos y mensaje, y al confirmar
// se abre WhatsApp con la lista lista para enviar. Se puede repetir con otro proveedor para comparar.

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, Send } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, cn, ejecutar, toast } from "@/components/ui";
import { fechaPE } from "@/lib/storage";
import { useResumenPrecios } from "@/components/compras/AnalisisPrecios";
import { celularWhatsApp } from "@/lib/listasProveedor";
import { abrirEnlaceExterno, copiarTexto } from "@/lib/abrirExterno";
import { actualizarContactoProveedor, enlaceWhatsApp, itemsDelProveedor, mensajeSolicitudReq, proveedoresParaReq, registrarSolicitudReq } from "@/lib/solicitudCotizacion";
import type { Requerimiento, Rol } from "@/lib/types";

export function SolicitarCotizacionReq({ req, rol, onClose }: { req: Requerimiento; rol: Rol; onClose: () => void }) {
  const { resumen, proveedores } = useResumenPrecios();
  const { sugeridos, otros } = useMemo(() => proveedoresParaReq(req, proveedores, resumen), [req, proveedores, resumen]);
  const ya = new Set((req.solicitudesCotizacion ?? []).map((s) => s.proveedorId));

  const [provId, setProvId] = useState(() => (sugeridos.find((o) => !ya.has(o.proveedor.id)) ?? sugeridos[0])?.proveedor.id ?? "");
  const prov = proveedores.find((p) => p.id === provId);
  const [asesor, setAsesor] = useState(prov?.asesorVentas ?? "");
  const [celular, setCelular] = useState(prov?.contacto ?? "");
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(itemsDelProveedor(req, prov, resumen)));
  const [texto, setTexto] = useState<string | null>(null); // null = mensaje automático
  const [guardarFicha, setGuardarFicha] = useState(true);
  const [confirmo, setConfirmo] = useState(false);
  /** Paso 2: solicitud anotada; se muestra el mensaje con los botones para abrir o copiar. */
  const [enviado, setEnviado] = useState<{ url: string; texto: string; numero: string; proveedor: string; abierto: boolean } | null>(null);

  const elegirProveedor = (id: string) => {
    const p = proveedores.find((x) => x.id === id);
    setProvId(id);
    setAsesor(p?.asesorVentas ?? "");
    setCelular(p?.contacto ?? "");
    setElegidos(new Set(itemsDelProveedor(req, p, resumen)));
    setTexto(null);
    setConfirmo(false);
  };

  const items = req.items.filter((i) => elegidos.has(i.id));
  const mensaje = texto ?? mensajeSolicitudReq(req, items, asesor);
  const celValido = !!celularWhatsApp(celular);
  const contactoCambio = !!prov && (celular.trim() !== (prov.contacto ?? "").trim() || asesor.trim().toUpperCase() !== (prov.asesorVentas ?? "").trim().toUpperCase());
  const listo = !!prov && celValido && items.length > 0 && mensaje.trim().length > 0 && confirmo;

  const enviar = async () => {
    if (!prov) return;
    const url = enlaceWhatsApp(celular, mensaje);
    const ok = ejecutar(() => {
      if (contactoCambio && guardarFicha) actualizarContactoProveedor(prov.id, asesor, celular);
      registrarSolicitudReq(req.id, prov, asesor, celular, items.map((i) => i.nombre), rol);
    }, `Solicitud anotada en ${req.numero}`);
    if (!ok) return;
    const abierto = await abrirEnlaceExterno(url);
    setEnviado({ url, texto: mensaje, numero: celularWhatsApp(celular), proveedor: prov.razonSocial, abierto });
  };

  const copiar = async (t: string, que: string) => {
    const ok = await copiarTexto(t);
    toast(ok ? `${que} copiado` : "No se pudo copiar", ok ? undefined : "error");
  };

  if (enviado) {
    const siguiente = sugeridos.find((o) => o.proveedor.id !== provId && !ya.has(o.proveedor.id));
    return (
      <Modal open onClose={onClose} title={`Solicitud de cotización · ${req.numero}`} wide>
        <div className={cn("mb-3 rounded-lg p-3 text-sm", enviado.abierto ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
          {enviado.abierto ? (
            <>Se abrió WhatsApp con el mensaje para <b>{enviado.proveedor}</b> (+{enviado.numero}). Revise y pulse <b>Enviar</b> en WhatsApp.</>
          ) : (
            <>No se pudo abrir WhatsApp automáticamente en este equipo. Pulse <b>Abrir WhatsApp</b> o copie el mensaje y péguelo en el chat de +{enviado.numero}.</>
          )}
        </div>
        <Field label="Mensaje enviado">
          <Textarea rows={10} readOnly value={enviado.texto} />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() =>
              void abrirEnlaceExterno(enviado.url).then((ok) => {
                if (!ok) void copiar(enviado.texto, "No se pudo abrir WhatsApp: mensaje");
              })
            }
          >
            <ExternalLink size={14} /> Abrir WhatsApp
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void abrirEnlaceExterno(`https://web.whatsapp.com/send?phone=${enviado.numero}&text=${encodeURIComponent(enviado.texto)}`)}>
            <MessageCircle size={14} /> WhatsApp Web
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void copiar(enviado.texto, "Mensaje")}>
            <Copy size={14} /> Copiar mensaje
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void copiar(`+${enviado.numero}`, "Número")}>
            <Copy size={14} /> Copiar número
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {siguiente && (
            <Button variant="secondary" onClick={() => { setEnviado(null); elegirProveedor(siguiente.proveedor.id); }}>
              Pedir también a {siguiente.proveedor.razonSocial}
            </Button>
          )}
          <Button onClick={onClose}>Listo</Button>
        </div>
      </Modal>
    );
  }

  const opcionesProv = [
    ...sugeridos.map((o) => ({
      value: o.proveedor.id,
      label: `★ ${o.proveedor.razonSocial} · vende ${o.cubre} de ${req.items.length}${o.masBarato ? ` · más barato en ${o.masBarato}` : ""}${ya.has(o.proveedor.id) ? " · ya solicitado" : ""}`,
    })),
    ...otros.map((p) => ({ value: p.id, label: `${p.razonSocial}${ya.has(p.id) ? " · ya solicitado" : ""}` })),
  ];

  return (
    <Modal open onClose={onClose} title={`Solicitar cotización · ${req.numero}`} wide>
      <p className="mb-3 text-xs text-plomo-500">
        Confirme los datos. Al pulsar <b>Confirmar y enviar</b> se abre WhatsApp con la lista de productos para el asesor de ventas; allí pulse Enviar. La solicitud queda anotada en el {req.numero}.
      </p>

      {(req.solicitudesCotizacion ?? []).length > 0 && (
        <div className="mb-3 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">
          Ya solicitado:{" "}
          {req.solicitudesCotizacion!.map((s) => `${s.proveedor} (${fechaPE(s.fecha.slice(0, 10))})`).join(" · ")}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Proveedor *" className="md:col-span-3" hint="★ = vende estos productos en su ficha o dio el precio más bajo.">
          <Select value={provId} onChange={(e) => elegirProveedor(e.target.value)} placeholder="Elegir proveedor…" options={opcionesProv} />
        </Field>
        {prov && (
          <>
            <Field label="Asesor de ventas">
              <Input value={asesor} onChange={(e) => { setAsesor(e.target.value); setConfirmo(false); }} placeholder="Nombre del asesor" />
            </Field>
            <Field label="WhatsApp del asesor *" hint={celular && !celValido ? "Número no válido (9 dígitos que empiezan en 9, o con código de país)." : `RUC ${prov.ruc}`}>
              <Input value={celular} onChange={(e) => { setCelular(e.target.value); setConfirmo(false); }} placeholder="9XX XXX XXX" inputMode="tel" />
            </Field>
            <div className="flex items-end pb-1">
              {contactoCambio && (
                <label className="flex items-center gap-2 text-xs text-plomo-600">
                  <input type="checkbox" checked={guardarFicha} onChange={(e) => setGuardarFicha(e.target.checked)} />
                  Guardar asesor y celular en la ficha del proveedor
                </label>
              )}
            </div>
          </>
        )}
      </div>

      {prov && (
        <>
          <p className="mb-1 mt-4 text-xs font-semibold uppercase text-plomo-500">Productos a cotizar ({items.length} de {req.items.length})</p>
          <div className="divide-y divide-plomo-100 rounded-lg border border-plomo-100">
            {req.items.map((i) => (
              <label key={i.id} className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={elegidos.has(i.id)}
                  onChange={() => {
                    setElegidos((s) => {
                      const n = new Set(s);
                      if (n.has(i.id)) n.delete(i.id);
                      else n.add(i.id);
                      return n;
                    });
                    setTexto(null);
                    setConfirmo(false);
                  }}
                />
                <span className="min-w-0">
                  <span className="font-medium text-fg">{i.nombre}</span>
                  <span className="block text-xs text-plomo-500">
                    {i.cantidad} {i.unidad}
                    {i.marca ? ` · marca ${i.marca}` : ""}
                    {i.caracteristica ? ` · ${i.caracteristica}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <Field label="Mensaje (puede editarlo)" className="mt-4">
            <Textarea rows={9} value={mensaje} onChange={(e) => { setTexto(e.target.value); setConfirmo(false); }} />
          </Field>
          {texto !== null && (
            <button type="button" className="mt-1 text-xs text-azul-900 underline" onClick={() => setTexto(null)}>
              Volver al mensaje automático
            </button>
          )}

          <label className={cn("mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm", confirmo ? "border-emerald-300 bg-emerald-50" : "border-plomo-100")}>
            <input type="checkbox" className="mt-1" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} disabled={!celValido || items.length === 0} />
            <span>
              Confirmo enviar la solicitud de <b>{items.length} producto(s)</b> a <b>{asesor.trim() || "el asesor"}</b> de <b>{prov.razonSocial}</b>
              {celValido ? ` al WhatsApp +${celularWhatsApp(celular)}` : " (falta un WhatsApp válido)"}.
            </span>
          </label>
        </>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="success" disabled={!listo} onClick={() => void enviar()}>
          {confirmo ? <Send size={15} /> : <Check size={15} />} Confirmar y enviar por WhatsApp
        </Button>
      </div>
    </Modal>
  );
}

/** Línea corta bajo el REQ: a quién ya se pidió cotización. */
export function SolicitudesEnviadas({ req }: { req: Requerimiento }) {
  const s = req.solicitudesCotizacion ?? [];
  if (!s.length) return null;
  return (
    <p className="text-[11px] text-azul-900">
      <MessageCircle size={11} className="mr-1 inline" />
      Cotización solicitada a {s.map((x) => `${x.proveedor} (${fechaPE(x.fecha.slice(0, 10))})`).join(", ")}
    </p>
  );
}
