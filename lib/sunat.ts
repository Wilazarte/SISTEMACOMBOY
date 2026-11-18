"use client";

// =====================================================================
// Facturación electrónica SUNAT (SEE - del contribuyente). El XML, la firma y el envío se hacen en el
// Edge Function supabase/functions/sunat-cpe (el certificado y la clave SOL nunca llegan al navegador).
// Aquí: llamar al Edge Function, leer public.sunat_cpe (estado, XML y CDR), crear notas de crédito/débito
// y reflejar el estado SUNAT en el comprobante del ERP.
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { ErpError, KEYS, escribir, hoy, nuevoEvento, puede, r2, serieSede, uid } from "./storage";
import { anularComprobante, getComprobantes, totalesVenta } from "./ventas";
import type { ComprobanteVenta, EstadoSunat, LineaVenta, Rol } from "./types";
import { guardarArchivo } from "./guardarArchivo";

export type EstadoCpe = "PENDIENTE" | "ENVIADO" | "ACEPTADO" | "OBSERVADO" | "RECHAZADO" | "EXCEPCION" | "ANULADO";

/** Fila de public.sunat_cpe (sin el XML ni el CDR, que se piden aparte al descargar). */
export interface FilaSunat {
  id: string;
  tipo_doc: string;
  serie: string;
  numero: string;
  fecha_emision: string;
  total: number;
  estado: EstadoCpe;
  codigo: string | null;
  descripcion: string | null;
  observaciones: string[];
  hash: string | null;
  nombre_archivo: string | null;
  entorno: "beta" | "produccion";
  /** "nubefact" si lo emitió el PSE; null en envío directo. */
  pse: string | null;
  enlace_pdf: string | null;
  enlace_xml: string | null;
  enlace_cdr: string | null;
  intentos: number;
  enviado_at: string | null;
  baja_id: string | null;
  baja_estado: "EN_PROCESO" | "ACEPTADA" | "RECHAZADA" | null;
  baja_codigo: string | null;
  baja_descripcion: string | null;
  updated_at: string;
}

export interface ConfigSunat {
  modo: "nubefact" | "directo";
  entorno: "beta" | "produccion";
  ruc: string;
  certificado: { titular: string; vence: string } | null;
  errorCertificado: string;
  faltan: string[];
  algoritmo: string;
}

const COLUMNAS =
  "id,tipo_doc,serie,numero,fecha_emision,total,estado,codigo,descripcion,observaciones,hash,nombre_archivo,entorno,pse,enlace_pdf,enlace_xml,enlace_cdr,intentos,enviado_at,baja_id,baja_estado,baja_codigo,baja_descripcion,updated_at";

/** Series de notas: la nota lleva la letra del comprobante que modifica (F… factura, B… boleta). */
export const SERIE_NOTA = {
  NOTA_CREDITO: { FACTURA: "FC05", BOLETA: "BC05" },
  NOTA_DEBITO: { FACTURA: "FD05", BOLETA: "BD05" },
} as const;

/** Catálogo 09 (notas de crédito) y 10 (notas de débito): los motivos que emite el ERP. */
export const MOTIVOS_NOTA = {
  NOTA_CREDITO: [
    { codigo: "01", label: "01 · Anulación de la operación", total: true },
    { codigo: "02", label: "02 · Anulación por error en el RUC", total: true },
    { codigo: "06", label: "06 · Devolución total", total: true },
    { codigo: "09", label: "09 · Disminución en el valor", total: false },
  ],
  NOTA_DEBITO: [
    { codigo: "01", label: "01 · Intereses por mora", total: false },
    { codigo: "02", label: "02 · Aumento en el valor", total: false },
    { codigo: "03", label: "03 · Penalidades / otros conceptos", total: false },
  ],
} as const;

/** Estados SUNAT que hacen válido al comprobante. */
export const sunatValido = (e?: string | null) => e === "ACEPTADO" || e === "OBSERVADO";

async function invocar<T>(accion: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createClient().functions.invoke("sunat-cpe", { body: { accion, ...body } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    if (cuerpo?.error) throw new ErpError(cuerpo.error);
    throw new ErpError(
      /not found|404|Failed to send/i.test(error.message) ? "Falta desplegar la Edge Function sunat-cpe en Supabase." : error.message
    );
  }
  return data as T;
}

export const configSunat = () => invocar<ConfigSunat>("config");

/** Lista de estados SUNAT (por id de comprobante), con suscripción en vivo. */
export function useSunat(): { filas: Record<string, FilaSunat>; cargando: boolean; error: string; recargar: () => void } {
  const [filas, setFilas] = useState<Record<string, FilaSunat>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const recargar = useCallback(async () => {
    try {
      const sb = createClient();
      const todas: FilaSunat[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error: e } = await sb.from("sunat_cpe").select(COLUMNAS).order("updated_at", { ascending: false }).range(desde, desde + 999);
        if (e) throw e;
        todas.push(...((data ?? []) as unknown as FilaSunat[]));
        if (!data || data.length < 1000) break;
      }
      setFilas(Object.fromEntries(todas.map((f) => [f.id, f])));
      setError("");
    } catch (e) {
      const m = (e as Error).message ?? String(e);
      setError(/sunat_cpe/.test(m) && /exist|schema cache/i.test(m) ? "Falta correr la migración 20261125_sunat_cpe.sql en Supabase." : m);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void recargar();
    let canal: ReturnType<ReturnType<typeof createClient>["channel"]> | undefined;
    try {
      const sb = createClient();
      canal = sb
        .channel("erp-sunat-cpe")
        .on("postgres_changes", { event: "*", schema: "public", table: "sunat_cpe" }, () => void recargar())
        .subscribe();
      return () => {
        if (canal) void sb.removeChannel(canal);
      };
    } catch {
      return undefined;
    }
  }, [recargar]);
  return { filas, cargando, error, recargar: () => void recargar() };
}

/** Copia el estado SUNAT en el comprobante del ERP (para el PDF, el QR con el hash y los filtros). */
function reflejar(id: string, f: Pick<FilaSunat, "estado" | "hash" | "codigo" | "descripcion" | "entorno">): ComprobanteVenta | undefined {
  const estadoSunat: EstadoSunat = f.estado === "PENDIENTE" ? "NO_ENVIADO" : f.estado;
  let actualizado: ComprobanteVenta | undefined;
  const lista = getComprobantes().map((c) => {
    if (c.id !== id) return c;
    actualizado = {
      ...c,
      estadoSunat,
      sunat: { hash: f.hash ?? "", codigo: f.codigo ?? "", descripcion: f.descripcion ?? "", entorno: f.entorno, fecha: new Date().toISOString() },
    };
    return actualizado;
  });
  if (actualizado) escribir(KEYS.COMPROBANTES, lista);
  return actualizado;
}

/** Respuesta del Edge Function emitir-comprobante (Nubefact). */
interface RespuestaEmision {
  ok: boolean;
  aceptada: boolean;
  codigo: string;
  descripcion: string;
  observaciones: string[];
  hash: string;
  enlacePdf: string;
  enlaceXml: string;
  enlaceCdr: string;
  numero: string;
  error?: string;
}

/** Resultado de enviarSunat: lo que leen las pantallas (estado, código y descripción) + el PDF de Nubefact. */
export type ResultadoEnvio = Pick<FilaSunat, "estado" | "codigo" | "descripcion"> & { numero: string; enlacePdf: string };

/**
 * Envía el comprobante a SUNAT vía Nubefact (Edge Function emitir-comprobante) con los datos de la fila.
 * OK: queda ACEPTADO y se guardan el número y el PDF de Nubefact en el comprobante.
 * Error: se lanza el mensaje real del Edge Function y el comprobante sigue "SUNAT pendiente".
 */
export async function enviarSunat(c: ComprobanteVenta, rol: Rol): Promise<ResultadoEnvio> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede enviar comprobantes a SUNAT.");
  if (c.estado !== "EMITIDO") throw new ErpError("Solo se envían comprobantes EMITIDOS.");
  const referencia = c.ref ? getComprobantes().find((x) => x.id === c.ref!.id) : undefined;
  if ((c.tipo === "NOTA_CREDITO" || c.tipo === "NOTA_DEBITO") && !referencia) throw new ErpError(`No se encontró ${c.ref?.numero ?? "el comprobante"} que modifica la nota.`);
  const { data, error } = await createClient().functions.invoke("emitir-comprobante", { body: { comprobante: c, ...(referencia ? { referencia } : {}) } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    console.error("emitir-comprobante", c.numero, cuerpo ?? error);
    throw new ErpError(cuerpo?.error ?? (cuerpo ? JSON.stringify(cuerpo) : error.message));
  }
  const r = data as RespuestaEmision;
  if (!r?.ok) throw new ErpError(r?.error ?? "Nubefact no devolvió una respuesta válida.");
  let actualizado: ComprobanteVenta | undefined;
  const lista = getComprobantes().map((x) => {
    if (x.id !== c.id) return x;
    actualizado = {
      ...x,
      estadoSunat: "ACEPTADO",
      sunat: {
        hash: r.hash ?? "",
        codigo: r.codigo ?? "",
        descripcion: r.descripcion ?? "",
        entorno: "beta",
        fecha: new Date().toISOString(),
        numero: r.numero ?? "",
        enlacePdf: r.enlacePdf ?? "",
        enlaceXml: r.enlaceXml ?? "",
        enlaceCdr: r.enlaceCdr ?? "",
      },
    };
    return actualizado;
  });
  if (actualizado) escribir(KEYS.COMPROBANTES, lista);
  trasAceptar(c, "ACEPTADO", rol);
  return { estado: "ACEPTADO", codigo: r.codigo ?? "", descripcion: r.descripcion ?? "", numero: r.numero ?? "", enlacePdf: r.enlacePdf ?? "" };
}

/**
 * Consulta en Nubefact un comprobante ya enviado y guarda en la fila los enlaces actualizados
 * (el XML / CDR llegan cuando SUNAT responde; en boletas, con el resumen diario). No emite nada nuevo:
 * con { consultar: true } el Edge Function solo consulta (y la versión anterior, al ver que ya existe, también consulta).
 */
export async function consultarNubefactFila(c: ComprobanteVenta, rol: Rol): Promise<ComprobanteVenta> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede consultar comprobantes en SUNAT.");
  if (!c.sunat?.enlacePdf) throw new ErpError(`${c.numero} aún no se envió a Nubefact: use Enviar SUNAT.`);
  const referencia = c.ref ? getComprobantes().find((x) => x.id === c.ref!.id) : undefined;
  const { data, error } = await createClient().functions.invoke("emitir-comprobante", {
    body: { comprobante: c, ...(referencia ? { referencia } : {}), consultar: true },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    console.error("consultar Nubefact", c.numero, cuerpo ?? error);
    throw new ErpError(cuerpo?.error ?? (cuerpo ? JSON.stringify(cuerpo) : error.message));
  }
  const r = data as RespuestaEmision;
  if (!r?.ok) throw new ErpError(r?.error ?? "Nubefact no devolvió una respuesta válida.");
  let actualizado: ComprobanteVenta | undefined;
  const lista = getComprobantes().map((x) => {
    if (x.id !== c.id || !x.sunat) return x;
    const s = x.sunat;
    actualizado = {
      ...x,
      sunat: {
        ...s,
        hash: r.hash || s.hash,
        codigo: r.codigo || s.codigo,
        descripcion: r.descripcion || s.descripcion,
        fecha: new Date().toISOString(),
        enlacePdf: r.enlacePdf || s.enlacePdf,
        enlaceXml: r.enlaceXml || s.enlaceXml,
        enlaceCdr: r.enlaceCdr || s.enlaceCdr,
      },
    };
    return actualizado;
  });
  if (!actualizado) throw new ErpError(`No se encontró ${c.numero}.`);
  escribir(KEYS.COMPROBANTES, lista);
  return actualizado;
}

/** Nota de crédito que anula la operación: al ser aceptada, el comprobante original se anula en el ERP. */
function trasAceptar(c: ComprobanteVenta, estado: EstadoCpe, rol: Rol): void {
  const f = { estado };
  // Nota de crédito que anula la operación: al ser aceptada, el comprobante original se anula en el ERP
  if (sunatValido(f.estado) && c.tipo === "NOTA_CREDITO" && c.ref && ["01", "02", "06"].includes(c.motivoCodigo ?? "")) {
    const orig = getComprobantes().find((x) => x.id === c.ref!.id);
    if (orig && orig.estado === "EMITIDO") {
      try {
        anularComprobante(orig.id, `Nota de crédito ${c.numero} (motivo ${c.motivoCodigo}) aceptada por SUNAT`, rol, { porSunat: true });
      } catch (e) {
        throw new ErpError(`SUNAT aceptó ${c.numero}, pero ${orig.numero} no se pudo anular en el ERP: ${(e as Error).message}`);
      }
    }
  }
}

/** Vuelve a consultar el estado (PSE: siempre; envío directo: solo producción). */
export async function consultarSunat(c: ComprobanteVenta, rol: Rol): Promise<FilaSunat> {
  const f = await invocar<FilaSunat>("consultar", { id: c.id });
  reflejar(c.id, f);
  trasAceptar(c, f.estado, rol);
  return f;
}

/** Anulación ante SUNAT (PSE: facturas y boletas; envío directo: facturas y sus notas). Si SUNAT la acepta, el comprobante se anula en el ERP. */
export async function bajaSunat(c: ComprobanteVenta, motivo: string, rol: Rol): Promise<FilaSunat> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede anular comprobantes.");
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la baja.");
  const f = await invocar<FilaSunat>("baja", { id: c.id, motivo: motivo.trim() });
  if (f.baja_estado === "ACEPTADA") {
    reflejar(c.id, f);
    if (c.estado === "EMITIDO") anularComprobante(c.id, `Comunicación de baja ${f.baja_id} aceptada por SUNAT: ${motivo.trim()}`, rol, { porSunat: true });
  }
  return f;
}

export async function estadoBajaSunat(c: ComprobanteVenta, rol: Rol): Promise<FilaSunat> {
  const f = await invocar<FilaSunat>("estado_baja", { id: c.id });
  if (f.baja_estado === "ACEPTADA") {
    reflejar(c.id, f);
    const actual = getComprobantes().find((x) => x.id === c.id);
    if (actual?.estado === "EMITIDO") anularComprobante(c.id, `Comunicación de baja ${f.baja_id} aceptada por SUNAT`, rol, { porSunat: true });
  }
  return f;
}

// ---------------------------------------------------------------------
// Descargas (XML firmado, CDR y comunicación de baja)
// ---------------------------------------------------------------------

function bajar(nombre: string, datos: BlobPart, tipo: string) {
  // "Guardar como" para elegir la carpeta (lib/guardarArchivo)
  return guardarArchivo(nombre, new Blob([datos], { type: tipo }), { tipo });
}

const deBase64 = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

export async function descargarSunat(id: string, que: "xml" | "cdr" | "baja_cdr"): Promise<void> {
  const col = que === "xml" ? "xml" : que === "cdr" ? "cdr_zip" : "baja_cdr_zip";
  const { data, error } = await createClient().from("sunat_cpe").select(`nombre_archivo,baja_id,enlace_xml,enlace_cdr,${col}`).eq("id", id).maybeSingle();
  if (error) throw new ErpError(error.message);
  const fila = data as Record<string, string | null> | null;
  const contenido = fila?.[col];
  // PSE: si la copia aún no se guardó, se abre el enlace del PSE
  const enlace = que === "xml" ? fila?.enlace_xml : que === "cdr" ? fila?.enlace_cdr : null;
  if (!contenido && enlace) {
    window.open(enlace, "_blank", "noopener");
    return;
  }
  if (!fila || !contenido) throw new ErpError(que === "xml" ? "Aún no hay XML firmado." : "SUNAT aún no devolvió la constancia (CDR).");
  if (que === "xml") await bajar(`${fila.nombre_archivo}.xml`, contenido, "application/xml");
  else if (que === "cdr") await bajar(`R-${fila.nombre_archivo}.zip`, deBase64(contenido), "application/zip");
  else await bajar(`R-${fila.nombre_archivo?.split("-")[0]}-${fila.baja_id}.zip`, deBase64(contenido), "application/zip");
}

// ---------------------------------------------------------------------
// Notas de crédito y débito
// ---------------------------------------------------------------------

export interface DatosNota {
  tipo: "NOTA_CREDITO" | "NOTA_DEBITO";
  origenId: string;
  motivoCodigo: string;
  sustento: string;
  /** Motivos que no son por el total (NC 09, todas las ND): importe con IGV incluido. */
  monto?: number;
}

async function correlativoNota(serie: string): Promise<string> {
  const { data, error } = await createClient().rpc("siguiente_numero_cpe", { serie });
  if (error) {
    if (error.code === "42501") throw new ErpError(error.message);
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
      throw new ErpError("Falta la función siguiente_numero_cpe: corra la migración 20261125_sunat_cpe.sql en Supabase.");
    throw new ErpError(`No se pudo obtener el número: ${error.message}`);
  }
  return `${serie}-${String(Number(data)).padStart(4, "0")}`;
}

/**
 * Crea y emite la nota (queda EMITIDA con estado SUNAT NO_ENVIADO; luego se envía con enviarSunat).
 * Las notas no generan Orden de Despacho ni asiento propio: la NC por anulación / devolución total anula el
 * comprobante original en el ERP (con su asiento de reversión) cuando SUNAT la acepta.
 */
export async function crearNota(d: DatosNota, vendedor: string, rol: Rol): Promise<ComprobanteVenta> {
  if (!puede(rol, "venta.gestionar")) throw new ErpError("Su usuario no puede emitir notas de crédito ni de débito.");
  const orig = getComprobantes().find((c) => c.id === d.origenId);
  if (!orig) throw new ErpError("Comprobante de origen no encontrado.");
  if (orig.tipo !== "FACTURA" && orig.tipo !== "BOLETA") throw new ErpError("Las notas solo modifican facturas o boletas.");
  if (orig.estado !== "EMITIDO") throw new ErpError(`${orig.numero} está ${orig.estado}.`);
  if (!sunatValido(orig.estadoSunat)) throw new ErpError(`Primero envíe ${orig.numero} a SUNAT: la nota solo modifica comprobantes aceptados.`);
  const motivo = MOTIVOS_NOTA[d.tipo].find((m) => m.codigo === d.motivoCodigo);
  if (!motivo) throw new ErpError("Seleccione el motivo de la nota.");
  const sustento = d.sustento.trim();
  if (sustento.length < 3) throw new ErpError("Escriba el sustento de la nota (se envía a SUNAT).");
  if (d.tipo === "NOTA_CREDITO" && motivo.total) {
    const previa = getComprobantes().find(
      (c) => c.tipo === "NOTA_CREDITO" && c.ref?.id === orig.id && c.estado === "EMITIDO" && ["01", "02", "06"].includes(c.motivoCodigo ?? "")
    );
    if (previa) throw new ErpError(`${orig.numero} ya tiene la nota de crédito ${previa.numero} por el total.`);
  }

  let items: LineaVenta[];
  let descuento = 0;
  const conIgv = orig.conIgv;
  let preciosConIgv = true;
  if (motivo.total) {
    items = orig.items.map((l) => ({ ...l, id: uid() }));
    descuento = orig.descuento;
    preciosConIgv = orig.preciosConIgv === true;
  } else {
    const monto = r2(Number(d.monto) || 0);
    if (!(monto > 0)) throw new ErpError("Indique el importe de la nota (con IGV).");
    if (d.tipo === "NOTA_CREDITO" && monto > orig.total) throw new ErpError(`La nota de crédito no puede superar ${orig.numero} (S/ ${orig.total.toFixed(2)}).`);
    items = [{ id: uid(), productoNombre: "", descripcion: `${sustento} (${orig.numero})`, unidad: "UND", ancho: 0, alto: 0, m2: 0, cantidad: 1, precio: monto, total: monto }];
  }
  const t = totalesVenta(items, conIgv, descuento, preciosConIgv);
  const serie = serieSede(SERIE_NOTA[d.tipo][orig.tipo]); // Secocha: FC02, BC02, FD02, BD02
  const numero = await correlativoNota(serie);
  const ahora = new Date().toISOString();
  const nota: ComprobanteVenta = {
    id: uid(),
    tipo: d.tipo,
    serie,
    numero,
    fecha: hoy(),
    clienteId: orig.clienteId,
    cliente: orig.cliente,
    clienteDoc: orig.clienteDoc,
    clienteDireccion: orig.clienteDireccion,
    items,
    conIgv,
    preciosConIgv,
    descuento: t.descuento,
    base: t.base,
    igv: t.igv,
    total: t.total,
    formaPago: "CONTADO",
    condPagoId: orig.condPagoId,
    condPagoNombre: orig.condPagoNombre,
    diasCredito: 0,
    fechaVenc: hoy(),
    inicial: 0,
    cuotas: [],
    saldo: 0,
    estado: "EMITIDO",
    estadoSunat: "NO_ENVIADO",
    lugarEntrega: orig.lugarEntrega,
    vendedor,
    ref: { id: orig.id, tipo: orig.tipo, numero: orig.numero, fecha: orig.fecha },
    motivoCodigo: motivo.codigo,
    motivoDescripcion: sustento,
    historial: [{ ...nuevoEvento(rol, "Emitido", `${motivo.label} · modifica ${orig.numero} · ${sustento}`), fecha: ahora }],
  };
  escribir(KEYS.COMPROBANTES, [nota, ...getComprobantes()]);
  return nota;
}
