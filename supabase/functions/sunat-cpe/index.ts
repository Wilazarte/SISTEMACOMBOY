// Edge Function sunat-cpe (Supabase, Deno): facturación electrónica SEE - del contribuyente.
//
// POST { accion, id, motivo? } con la sesión del usuario (Authorization: Bearer <jwt>):
//   config     -> entorno (beta/producción), certificado (titular, vencimiento) y si falta algún secreto
//   enviar     -> arma el XML UBL 2.1 del comprobante (ventas, tipo 'comprobante'), lo firma, lo envía con
//                 sendBill y guarda XML + CDR en public.sunat_cpe. Idempotente: si ya fue aceptado no reenvía.
//   consultar  -> recupera el CDR con getStatusCdr (solo producción)
//   baja       -> comunicación de baja (RA) de una factura o sus notas aceptadas; guarda el ticket y consulta
//   estado_baja-> vuelve a consultar el ticket de la baja
//
// Secretos: ver config.ts. SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { armarDocumento, ErrorCpe, nombreArchivo, TIPO_CPE, type ComprobanteErp } from "./documento.ts";
import { xmlBaja, xmlComprobante } from "./ubl.ts";
import { firmarXml, leerPfx, type Certificado } from "./firma.ts";
import { estadoDeCodigo, getStatus, getStatusCdr, sendBill, sendSummary, type RespuestaSunat } from "./sunat.ts";
import { algoritmoFirma, certificadoConfigurado, credenciales, emisor, entorno } from "./config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Roles que emiten comprobantes de venta (mismos que escriben en public.ventas, más el perfil Ventas). */
const ROLES = ["creador", "soporte", "tesoreria", "logistica", "ventas"];

let certCache: Certificado | undefined;
function certificado(): Certificado {
  if (!certCache) {
    const { pfx, clave } = certificadoConfigurado();
    certCache = leerPfx(pfx, clave);
  }
  return certCache;
}

const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

async function leerComprobante(admin: SupabaseClient, id: string): Promise<ComprobanteErp> {
  const { data, error } = await admin.from("ventas").select("data").eq("tipo", "comprobante").eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el comprobante: ${error.message}`);
  if (!data) throw new ErrorCpe("Comprobante no encontrado (¿terminó de guardarse?). Intente de nuevo en unos segundos.");
  return data.data as ComprobanteErp;
}

async function registrar(admin: SupabaseClient, fila: Record<string, unknown>) {
  const { error } = await admin.from("sunat_cpe").upsert({ ...fila, updated_at: new Date().toISOString() });
  if (error) throw new Error(`No se pudo guardar el resultado de SUNAT: ${error.message}. ¿Se corrió la migración 20261125_sunat_cpe.sql?`);
}

async function bitacora(admin: SupabaseClient, comprobanteId: string, accion: string, usuario: string, r: { codigo?: string; mensaje?: string }) {
  await admin.from("sunat_envios").insert({ comprobante_id: comprobanteId, accion, entorno: entorno(), codigo: r.codigo ?? null, mensaje: r.mensaje ?? null, usuario });
}

/** Resultado de sendBill / getStatusCdr -> fila de sunat_cpe. */
function filaRespuesta(r: RespuestaSunat) {
  if (r.cdr) {
    const estado = estadoDeCodigo(r.cdr.codigo);
    return {
      estado,
      codigo: r.cdr.codigo,
      descripcion: r.cdr.descripcion,
      observaciones: r.cdr.observaciones,
      cdr_zip: r.cdr.zipBase64,
    };
  }
  const estado = estadoDeCodigo(r.faultCodigo ?? "");
  return { estado: estado === "ACEPTADO" ? "EXCEPCION" : estado, codigo: r.faultCodigo ?? "", descripcion: r.faultMensaje ?? "", observaciones: [] };
}

async function enviar(admin: SupabaseClient, id: string, usuario: string) {
  const { data: previo } = await admin.from("sunat_cpe").select("*").eq("id", id).maybeSingle();
  if (previo && ["ACEPTADO", "OBSERVADO"].includes(previo.estado)) return { ...previo, xml: undefined, cdr_zip: undefined, yaEnviado: true };

  const c = await leerComprobante(admin, id);
  const ref = c.ref?.id ? await leerComprobante(admin, c.ref.id) : undefined;
  if (ref && (c.tipo === "NOTA_CREDITO" || c.tipo === "NOTA_DEBITO")) {
    const { data: estRef } = await admin.from("sunat_cpe").select("estado").eq("id", ref.id).maybeSingle();
    if (!estRef || !["ACEPTADO", "OBSERVADO"].includes(estRef.estado))
      throw new ErrorCpe(`Primero envíe a SUNAT el comprobante ${ref.numero}: la nota solo puede modificar un comprobante aceptado.`);
  }
  const doc = armarDocumento(c, emisor(), ref);
  const nombre = nombreArchivo(doc);
  const { xml, hash } = firmarXml(xmlComprobante(doc), certificado(), algoritmoFirma());
  const ent = entorno();
  const cred = credenciales();

  let r = await sendBill(ent, cred, nombre, xml);
  // 1033: SUNAT ya lo tiene (envío anterior sin respuesta). En producción se recupera el CDR.
  if (!r.ok && r.faultCodigo === "1033" && ent === "produccion") r = await getStatusCdr(cred, doc.codigoTipo, doc.serie, doc.correlativo);

  const fila = {
    id,
    tipo_doc: doc.codigoTipo,
    serie: doc.serie,
    numero: doc.id,
    fecha_emision: doc.fechaEmision,
    cliente_doc: `${doc.cliente.tipoDoc}-${doc.cliente.numDoc}`,
    total: doc.total,
    igv: doc.igv,
    hash,
    nombre_archivo: nombre,
    xml,
    entorno: ent,
    intentos: (previo?.intentos ?? 0) + 1,
    enviado_por: usuario,
    enviado_at: new Date().toISOString(),
    ...filaRespuesta(r),
  };
  await registrar(admin, fila);
  await bitacora(admin, id, "enviar", usuario, { codigo: fila.codigo, mensaje: fila.descripcion });
  return { ...fila, xml: undefined, cdr_zip: undefined };
}

async function consultar(admin: SupabaseClient, id: string, usuario: string) {
  const { data: f } = await admin.from("sunat_cpe").select("*").eq("id", id).maybeSingle();
  if (!f) throw new ErrorCpe("Este comprobante aún no se envió a SUNAT.");
  if (entorno() !== "produccion") throw new ErrorCpe("La consulta de CDR solo existe en producción (en beta vuelva a enviar).");
  const [serie, correlativo] = String(f.numero).split("-");
  const r = await getStatusCdr(credenciales(), f.tipo_doc, serie, correlativo);
  if (!r.cdr) throw new ErrorCpe(`SUNAT: ${r.faultCodigo ?? ""} ${r.faultMensaje ?? "sin CDR"}`.trim());
  const fila = { ...f, ...filaRespuesta(r) };
  await registrar(admin, fila);
  await bitacora(admin, id, "consultar", usuario, { codigo: fila.codigo, mensaje: fila.descripcion });
  return { ...fila, xml: undefined, cdr_zip: undefined };
}

async function consultarTicket(admin: SupabaseClient, f: Record<string, unknown>, usuario: string, esperas: number) {
  let r: RespuestaSunat = { ok: true, statusCode: "98" };
  for (let i = 0; i < esperas && r.ok && r.statusCode === "98"; i++) {
    if (i > 0) await new Promise((ok) => setTimeout(ok, 2500));
    r = await getStatus(entorno(), credenciales(), String(f.baja_ticket));
  }
  let baja_estado: string;
  let baja_codigo = "";
  let baja_descripcion = "";
  let baja_cdr_zip: string | undefined;
  if (r.ok && r.statusCode === "98") baja_estado = "EN_PROCESO";
  else if (r.cdr) {
    const e = estadoDeCodigo(r.cdr.codigo);
    baja_estado = e === "ACEPTADO" || e === "OBSERVADO" ? "ACEPTADA" : "RECHAZADA";
    baja_codigo = r.cdr.codigo;
    baja_descripcion = r.cdr.descripcion;
    baja_cdr_zip = r.cdr.zipBase64;
  } else {
    baja_estado = "RECHAZADA";
    baja_codigo = r.faultCodigo ?? r.statusCode ?? "";
    baja_descripcion = r.faultMensaje ?? "";
  }
  const fila = {
    ...f,
    baja_estado,
    baja_codigo,
    baja_descripcion,
    ...(baja_cdr_zip ? { baja_cdr_zip } : {}),
    ...(baja_estado === "ACEPTADA" ? { estado: "ANULADO" } : {}),
  };
  await registrar(admin, fila);
  await bitacora(admin, String(f.id), "estado_baja", usuario, { codigo: baja_codigo, mensaje: `${baja_estado} ${baja_descripcion}` });
  return { ...fila, xml: undefined, cdr_zip: undefined, baja_xml: undefined, baja_cdr_zip: undefined };
}

async function baja(admin: SupabaseClient, id: string, motivo: string, usuario: string) {
  if (!motivo.trim()) throw new ErrorCpe("Indique el motivo de la baja.");
  const { data: f } = await admin.from("sunat_cpe").select("*").eq("id", id).maybeSingle();
  if (!f || !["ACEPTADO", "OBSERVADO"].includes(f.estado)) throw new ErrorCpe("Solo se da de baja un comprobante aceptado por SUNAT.");
  if (f.tipo_doc === TIPO_CPE.BOLETA || String(f.serie).startsWith("B"))
    throw new ErrorCpe("Las boletas (y sus notas) no se anulan con comunicación de baja: emita una nota de crédito por anulación (motivo 01).");
  if (f.baja_estado === "EN_PROCESO" || f.baja_estado === "ACEPTADA") return consultarTicket(admin, f, usuario, 1);

  const hoy = hoyLima();
  const yyyymmdd = hoy.replaceAll("-", "");
  const { count } = await admin.from("sunat_cpe").select("id", { count: "exact", head: true }).like("baja_id", `RA-${yyyymmdd}-%`);
  const raId = `RA-${yyyymmdd}-${(count ?? 0) + 1}`;
  const [serie, correlativo] = String(f.numero).split("-");
  const em = emisor();
  const { xml } = firmarXml(
    xmlBaja(em, raId, f.fecha_emision, hoy, [{ codigoTipo: f.tipo_doc, serie, correlativo, motivo: motivo.trim().toUpperCase() }]),
    certificado(),
    algoritmoFirma()
  );
  const r = await sendSummary(entorno(), credenciales(), `${em.ruc}-${raId}`, xml);
  if (!r.ok || !r.ticket) {
    await bitacora(admin, id, "baja", usuario, { codigo: r.faultCodigo, mensaje: r.faultMensaje });
    throw new ErrorCpe(`SUNAT rechazó la comunicación de baja: ${r.faultCodigo ?? ""} ${r.faultMensaje ?? ""}`.trim());
  }
  const fila = { ...f, baja_id: raId, baja_ticket: r.ticket, baja_motivo: motivo.trim(), baja_xml: xml, baja_estado: "EN_PROCESO" };
  await registrar(admin, fila);
  await bitacora(admin, id, "baja", usuario, { codigo: "TICKET", mensaje: `${raId} ticket ${r.ticket}` });
  return consultarTicket(admin, fila, usuario, 4);
}

function config() {
  const faltan: string[] = [];
  let cert: { titular: string; vence: string } | null = null;
  let errorCert = "";
  try {
    const c = certificado();
    cert = { titular: c.titular, vence: c.vence };
  } catch (e) {
    errorCert = (e as Error).message;
    faltan.push("SUNAT_CERT_PFX / SUNAT_CERT_CLAVE");
  }
  try {
    credenciales();
  } catch {
    faltan.push("SUNAT_SOL_USUARIO / SUNAT_SOL_CLAVE");
  }
  return { entorno: entorno(), ruc: emisor().ruc, certificado: cert, errorCertificado: errorCert, faltan, algoritmo: algoritmoFirma() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const usuarioCli = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await usuarioCli.auth.getUser();
  if (!u?.user) return json({ error: "Inicie sesión." }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: perfil } = await admin.from("perfiles").select("usuario,rol").eq("id", u.user.id).maybeSingle();
  const rol = String(perfil?.rol ?? "").toLowerCase();
  if (!ROLES.includes(rol)) return json({ error: "Su usuario no puede emitir comprobantes electrónicos." }, 403);

  let body: { accion?: string; id?: string; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }
  const usuario = String(perfil?.usuario ?? u.user.email ?? u.user.id);
  try {
    switch (body.accion) {
      case "config":
        return json(config());
      case "enviar":
        if (!body.id) return json({ error: "Falta el id del comprobante." }, 400);
        return json(await enviar(admin, body.id, usuario));
      case "consultar":
        if (!body.id) return json({ error: "Falta el id del comprobante." }, 400);
        return json(await consultar(admin, body.id, usuario));
      case "baja":
        if (!body.id) return json({ error: "Falta el id del comprobante." }, 400);
        return json(await baja(admin, body.id, body.motivo ?? "", usuario));
      case "estado_baja": {
        const { data: f } = await admin.from("sunat_cpe").select("*").eq("id", body.id ?? "").maybeSingle();
        if (!f?.baja_ticket) return json({ error: "Este comprobante no tiene comunicación de baja." }, 400);
        return json(await consultarTicket(admin, f, usuario, 1));
      }
      default:
        return json({ error: "Acción inválida." }, 400);
    }
  } catch (e) {
    // ErrorCpe = dato a corregir en el ERP (422); el resto, configuración o conexión (500)
    const msg = (e as Error).message ?? String(e);
    return json({ error: msg }, e instanceof ErrorCpe ? 422 : 500);
  }
});
