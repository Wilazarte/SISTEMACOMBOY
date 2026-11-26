"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, CheckCheck, Clock, AlertCircle, Paperclip, Send, Search, FileText, Package, X, Loader2, ExternalLink, FlaskConical, Info,
} from "lucide-react";
import type { Mensaje, Plantilla } from "@prisma/client";
import { Button } from "@/components/erp-comercial/ui/button";
import { Input, Select, Textarea } from "@/components/erp-comercial/ui/input";
import { EtapaBadge, TipoBadge } from "@/components/erp-comercial/shared";
import { api } from "@/lib/erp-comercial/api-client";
import { LABEL_REGION } from "@/lib/erp-comercial/constants";
import { cn } from "@/lib/erp-comercial/utils";
import type { PlantillaMeta } from "@/lib/erp-comercial/whatsapp";

const VARS_RE = /\{\{\s*(\w+)\s*\}\}/g;
function renderMeta(texto: string, v: Record<string, string>) {
  return texto.replace(VARS_RE, (_, k) => v[k] || `{{${k}}}`);
}

interface Chat {
  id: string; razonSocial: string; contacto: string; telefono: string; etapa: string; tipoCliente: string; region: string;
  ultimo: Mensaje | null; noLeidos: number;
}
interface Conversacion {
  cliente: { id: string; razonSocial: string; contacto: string; telefono: string; etapa: string; tipoCliente: string; region: string; vendedor: { nombre: string } | null };
  mensajes: Mensaje[];
  ventanaAbierta: boolean;
}
type EquipoL = { id: string; codigo: string; nombre: string; videoUrl: string | null };

function hora(d: string | Date) {
  const x = new Date(d);
  const hoy = new Date().toDateString() === x.toDateString();
  return hoy ? x.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : x.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

export function Ticks({ estado }: { estado: string }) {
  if (estado === "LEIDO") return <CheckCheck className="h-3.5 w-3.5 text-sky-400" />;
  if (estado === "ENTREGADO") return <CheckCheck className="h-3.5 w-3.5 text-slate-400" />;
  if (estado === "ENVIADO") return <Check className="h-3.5 w-3.5 text-slate-400" />;
  if (estado === "SIMULADO") return <span title="Modo simulación"><FlaskConical className="h-3.5 w-3.5 text-amber-300" /></span>;
  if (estado === "FALLIDO") return <AlertCircle className="h-3.5 w-3.5 text-rose-400" />;
  return <Clock className="h-3.5 w-3.5 text-slate-400" />;
}

export function Inbox({ inicial, plantillas, equipos, simulacion }: { inicial?: string; plantillas: Plantilla[]; equipos: EquipoL[]; simulacion: boolean }) {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activo, setActivo] = useState<string | undefined>(inicial);
  const [conv, setConv] = useState<Conversacion | null>(null);
  const [q, setQ] = useState("");
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<null | "equipo" | "plantilla">(null);
  const [eq, setEq] = useState({ equipoId: equipos[0]?.id ?? "", foto: true, pdf: true, video: false, plantillaId: plantillas.find((p) => p.categoria === "OFERTA")?.id ?? "" });
  const finRef = useRef<HTMLDivElement>(null);
  const ultimoLen = useRef(0);
  // Plantillas aprobadas en Meta (fuera de ventana 24h o tras error 131047)
  const [tplsMeta, setTplsMeta] = useState<PlantillaMeta[] | null>(null);
  const [tplsError, setTplsError] = useState<string | null>(null);
  const [tplSel, setTplSel] = useState("");
  const [tplVals, setTplVals] = useState<Record<string, string>>({});
  const [forzarPlantilla, setForzarPlantilla] = useState(false);
  const modoPlantilla = !!conv && !simulacion && (!conv.ventanaAbierta || forzarPlantilla);
  const nombreCliente = conv ? conv.cliente.contacto || conv.cliente.razonSocial : "";
  const tplActual = tplsMeta?.find((t) => `${t.name}|${t.idioma}` === tplSel);

  useEffect(() => { setForzarPlantilla(false); }, [activo]);

  useEffect(() => {
    if (!modoPlantilla || tplsMeta) return;
    api<PlantillaMeta[]>("/erp/api/whatsapp/templates")
      .then((r) => { setTplsMeta(r); setTplsError(null); })
      .catch((e) => setTplsError((e as Error).message));
  }, [modoPlantilla, tplsMeta]);

  function elegirPlantilla(key: string) {
    setTplSel(key);
    const t = tplsMeta?.find((x) => `${x.name}|${x.idioma}` === key);
    // {{1}} (o la primera variable) = nombre del cliente
    setTplVals(t?.variables.length ? { [t.variables[0]]: nombreCliente } : {});
  }

  useEffect(() => {
    // al cambiar de chat, recalcula {{1}} con el nombre del nuevo cliente
    if (tplActual?.variables.length) setTplVals((v) => ({ ...v, [tplActual.variables[0]]: nombreCliente }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreCliente]);

  const cargarChats = useCallback(async () => {
    try {
      setChats(await api<Chat[]>("/erp/api/whatsapp/chats"));
    } catch { /* silencioso en polling */ }
  }, []);
  const cargarConv = useCallback(async (id: string) => {
    try {
      setConv(await api<Conversacion>(`/erp/api/whatsapp/chats/${id}`));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    cargarChats();
    const t = setInterval(cargarChats, 5000);
    return () => clearInterval(t);
  }, [cargarChats]);

  useEffect(() => {
    if (!activo) return;
    cargarConv(activo);
    const t = setInterval(() => cargarConv(activo), 4000);
    return () => clearInterval(t);
  }, [activo, cargarConv]);

  useEffect(() => {
    if (conv && conv.mensajes.length !== ultimoLen.current) {
      ultimoLen.current = conv.mensajes.length;
      finRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conv]);

  async function enviar(body: Record<string, unknown>, okMsg = "Enviado") {
    if (!activo) return;
    setSending(true);
    try {
      await api("/erp/api/whatsapp/send", "POST", { clienteId: activo, ...body });
      toast.success(okMsg);
      setTexto("");
      setPanel(null);
      await Promise.all([cargarConv(activo), cargarChats()]);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      await cargarConv(activo);
    } finally {
      setSending(false);
    }
  }

  async function subirArchivo(files: FileList | null) {
    if (!files?.length || !activo) return;
    const file = files[0];
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const { urls } = await api<{ urls: string[] }>("/erp/api/upload", "POST", fd);
      const tipo = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
      setSending(false);
      await enviar({ texto: texto || undefined, media: { tipo, url: urls[0], filename: file.name } }, "Archivo enviado");
    } catch (e) {
      toast.error((e as Error).message);
      setSending(false);
    }
  }

  const filtrados = chats.filter((c) => !q || `${c.razonSocial} ${c.contacto} ${c.telefono}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-xl border bg-wa-panel shadow-2xl">
      {/* Lista de chats */}
      <div className={cn("flex w-full flex-col border-r border-white/5 md:w-80 lg:w-96", activo && "hidden md:flex")}>
        <div className="space-y-2 border-b border-white/5 bg-[#202c33] p-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Chats</div>
            {simulacion && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">Modo simulación</span>}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="border-0 bg-[#111b21] pl-8" placeholder="Buscar cliente o número" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtrados.map((c) => (
            <button
              key={c.id}
              onClick={() => { setActivo(c.id); ultimoLen.current = 0; router.replace(`/erp/whatsapp?c=${c.id}`, { scroll: false }); }}
              className={cn("flex w-full items-center gap-3 border-b border-white/5 px-3 py-3 text-left transition-colors hover:bg-[#202c33]", activo === c.id && "bg-[#2a3942]")}
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-800 text-sm font-bold">
                {c.razonSocial.split(" ").slice(0, 2).map((w) => w[0]).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.razonSocial}</span>
                  {c.ultimo && <span className={cn("shrink-0 text-[11px]", c.noLeidos ? "text-wa" : "text-muted-foreground")}>{hora(c.ultimo.createdAt)}</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                    {c.ultimo?.direccion === "OUT" && <Ticks estado={c.ultimo.estado} />}
                    <span className="truncate">{c.ultimo ? c.ultimo.contenido || `[${c.ultimo.tipo}]` : `+${c.telefono}`}</span>
                  </span>
                  {c.noLeidos > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-wa px-1.5 text-[11px] font-bold text-black">{c.noLeidos}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversacion */}
      <div className={cn("flex min-w-0 flex-1 flex-col", !activo && "hidden md:flex")}>
        {!conv || !activo ? (
          <div className="wa-pattern grid flex-1 place-items-center text-center text-sm text-muted-foreground">
            <div>
              <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-wa/10"><Send className="h-7 w-7 text-wa" /></div>
              <div className="text-base font-medium text-foreground">COMBOY WhatsApp Business</div>
              <div>Selecciona un chat para empezar a conversar</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-white/5 bg-[#202c33] px-4 py-2.5">
              <button className="md:hidden" onClick={() => setActivo(undefined)}><X className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{conv.cliente.razonSocial}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  +{conv.cliente.telefono} · {conv.cliente.contacto} · {LABEL_REGION[conv.cliente.region]}
                </div>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex"><TipoBadge tipo={conv.cliente.tipoCliente} /><EtapaBadge etapa={conv.cliente.etapa} /></div>
              <Button asChild size="sm" variant="ghost"><Link href={`/erp/clientes/${conv.cliente.id}`}><ExternalLink />Ficha</Link></Button>
            </div>

            <div className="wa-pattern flex-1 space-y-1.5 overflow-y-auto px-4 py-4 md:px-12">
              {conv.mensajes.map((m) => (
                <div key={m.id} className={cn("flex", m.direccion === "OUT" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[78%] rounded-lg px-2.5 py-1.5 text-sm shadow", m.direccion === "OUT" ? "rounded-tr-none bg-wa-bubble" : "rounded-tl-none bg-wa-in")}>
                    {m.tipo === "image" && m.mediaUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.mediaUrl} alt="" className="mb-1 max-h-64 rounded-md" />
                    )}
                    {m.tipo === "video" && m.mediaUrl && <video src={m.mediaUrl} controls className="mb-1 max-h-64 rounded-md" />}
                    {m.tipo === "document" && m.mediaUrl && (
                      <a href={m.mediaUrl} target="_blank" className="mb-1 flex items-center gap-2 rounded-md bg-black/20 px-3 py-2.5 hover:bg-black/30">
                        <FileText className="h-8 w-8 text-rose-300" />
                        <div><div className="font-medium">{m.mediaNombre ?? "Documento"}</div><div className="text-[11px] text-white/60">PDF</div></div>
                      </a>
                    )}
                    {m.contenido && <div className="whitespace-pre-wrap break-words">{m.contenido}</div>}
                    {m.error && <div className="mt-1 text-[11px] text-rose-300">⚠ {m.error}</div>}
                    {m.direccion === "OUT" && m.error?.startsWith("131047") && !simulacion && (
                      <button onClick={() => setForzarPlantilla(true)} className="mt-1 rounded bg-wa/20 px-2 py-0.5 text-[11px] font-medium text-wa hover:bg-wa/30">
                        Enviar plantilla
                      </button>
                    )}
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-white/50">
                      {m.origen !== "MANUAL" && m.origen !== "WEBHOOK" && <span className="mr-1 rounded bg-white/10 px-1">{m.origen.toLowerCase()}</span>}
                      {new Date(m.createdAt).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {m.direccion === "OUT" && <Ticks estado={m.estado} />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            {modoPlantilla && (
              <div className="space-y-2 border-t border-white/5 bg-amber-500/10 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-amber-200">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {conv.ventanaAbierta
                    ? "Meta rechazó el mensaje por estar fuera de la ventana de 24h (131047). Envía una plantilla aprobada."
                    : "Fuera de la ventana de 24h: el cliente no te ha escrito en las últimas 24h. Solo se pueden enviar plantillas aprobadas en Meta."}
                  {forzarPlantilla && conv.ventanaAbierta && (
                    <button className="ml-auto underline" onClick={() => setForzarPlantilla(false)}>Volver a texto libre</button>
                  )}
                </div>
                {tplsError ? (
                  <div className="text-rose-300">No se pudieron cargar las plantillas: {tplsError}</div>
                ) : !tplsMeta ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando plantillas aprobadas…</div>
                ) : tplsMeta.length === 0 ? (
                  <div className="text-amber-200">No tienes plantillas aprobadas en Meta. Créalas en WhatsApp Manager › Plantillas de mensajes.</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="space-y-2">
                      <Select value={tplSel} onChange={(e) => elegirPlantilla(e.target.value)}>
                        <option value="">Selecciona una plantilla…</option>
                        {tplsMeta.map((t) => (
                          <option key={`${t.name}|${t.idioma}`} value={`${t.name}|${t.idioma}`}>{t.name} ({t.idioma} · {t.categoria.toLowerCase()})</option>
                        ))}
                      </Select>
                      {tplActual && tplActual.variables.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {tplActual.variables.map((k, i) => (
                            <label key={k} className="flex items-center gap-1.5">
                              <span className="font-mono text-muted-foreground">{`{{${k}}}`}</span>
                              <Input
                                className="h-8 w-44 border-0 bg-[#2a3942]"
                                placeholder={i === 0 ? "Nombre del cliente" : `Valor ${k}`}
                                value={tplVals[k] ?? ""}
                                onChange={(e) => setTplVals({ ...tplVals, [k]: e.target.value })}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                      {tplActual && (
                        <div className="whitespace-pre-wrap rounded-md bg-wa-bubble px-2.5 py-1.5 text-sm text-foreground">{renderMeta(tplActual.cuerpo, tplVals) || `[${tplActual.name}]`}</div>
                      )}
                    </div>
                    <Button
                      size="sm" variant="whatsapp" className="self-start"
                      disabled={sending || !tplActual || tplActual.variables.some((k) => !tplVals[k]?.trim())}
                      onClick={() => tplActual && enviar(
                        { metaTemplate: { name: tplActual.name, idioma: tplActual.idioma, cuerpo: tplActual.cuerpo, valores: tplVals } },
                        "Plantilla enviada",
                      ).then(() => setForzarPlantilla(false))}
                    >
                      {sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar plantilla
                    </Button>
                  </div>
                )}
              </div>
            )}

            {panel === "equipo" && (
              <div className="grid gap-2 border-t border-white/5 bg-[#202c33] p-3 sm:grid-cols-[1fr_auto_auto]">
                <Select value={eq.equipoId} onChange={(e) => setEq({ ...eq, equipoId: e.target.value })}>
                  {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
                </Select>
                <Select value={eq.plantillaId} onChange={(e) => setEq({ ...eq, plantillaId: e.target.value })}>
                  <option value="">Sin texto</option>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>Texto: {p.nombre}</option>)}
                </Select>
                <div className="flex items-center gap-3 text-sm">
                  {(["foto", "pdf", "video"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1.5 capitalize">
                      <input type="checkbox" className="accent-[#25D366]" checked={eq[k]} onChange={(e) => setEq({ ...eq, [k]: e.target.checked })} />
                      {k === "pdf" ? "Ficha PDF" : k}
                    </label>
                  ))}
                  <Button
                    size="sm" variant="whatsapp" disabled={sending}
                    onClick={() => enviar({ equipoId: eq.equipoId, plantillaId: eq.plantillaId || undefined, adjuntos: { foto: eq.foto, pdf: eq.pdf, video: eq.video } }, "Material del equipo enviado")}
                  >
                    {sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar
                  </Button>
                </div>
                {eq.video && !equipos.find((e) => e.id === eq.equipoId)?.videoUrl && <p className="text-xs text-amber-300 sm:col-span-3">Este equipo no tiene video cargado.</p>}
              </div>
            )}
            {panel === "plantilla" && (
              <div className="flex flex-wrap gap-2 border-t border-white/5 bg-[#202c33] p-3">
                {plantillas.map((p) => (
                  <button key={p.id} onClick={() => { setTexto(p.contenido); setPanel(null); }} className="rounded-full border border-white/10 px-3 py-1 text-xs hover:bg-white/5">
                    {p.nombre}
                  </button>
                ))}
                <span className="w-full text-[11px] text-muted-foreground">Las variables {"{nombre} {empresa} {vendedor} {region} {fecha}"} se reemplazan al enviar.</span>
              </div>
            )}

            <div className="flex items-end gap-2 border-t border-white/5 bg-[#202c33] px-3 py-2.5">
              <Button size="icon" variant="ghost" disabled={modoPlantilla} title="Enviar material de equipo (foto, ficha PDF, video)" onClick={() => setPanel(panel === "equipo" ? null : "equipo")}><Package className={panel === "equipo" ? "text-wa" : ""} /></Button>
              <Button size="icon" variant="ghost" disabled={modoPlantilla} title="Plantillas" onClick={() => setPanel(panel === "plantilla" ? null : "plantilla")}><FileText className={panel === "plantilla" ? "text-wa" : ""} /></Button>
              <label className={cn("inline-flex h-9 w-9 items-center justify-center rounded-md", modoPlantilla ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-accent")} title="Adjuntar foto, video o PDF">
                <Paperclip className="h-4 w-4" />
                <input type="file" hidden disabled={modoPlantilla} accept="image/jpeg,image/png,video/mp4,application/pdf" onChange={(e) => { subirArchivo(e.target.files); e.target.value = ""; }} />
              </label>
              <Textarea
                rows={1}
                disabled={modoPlantilla}
                className="max-h-36 min-h-[40px] flex-1 resize-none border-0 bg-[#2a3942] disabled:opacity-50"
                placeholder={modoPlantilla ? "Texto libre deshabilitado fuera de la ventana de 24h — usa una plantilla" : "Escribe un mensaje"}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (texto.trim() && !modoPlantilla) enviar({ texto });
                  }
                }}
              />
              <Button size="icon" variant="whatsapp" className="rounded-full" disabled={sending || modoPlantilla || !texto.trim()} onClick={() => enviar({ texto })}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
