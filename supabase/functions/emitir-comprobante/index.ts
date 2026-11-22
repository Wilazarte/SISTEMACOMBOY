// Edge Function emitir-comprobante (Supabase, Deno): envía un comprobante del ERP a Nubefact (PSE).
//
// POST (con la sesión del usuario: supabase.functions.invoke la manda sola)
//   { comprobante: { id } }  (se acepta el objeto completo, pero SOLO se usa su id: el comprobante y el que
//   modifica la nota se leen de public.ventas con el service role; el resultado queda en public.sunat_cpe)
//   - consultar:   true = no emite, solo consulta en Nubefact el estado y los enlaces (XML / CDR) actualizados
//   { guia: GuiaErp, consultar? }: Guía de Remisión Remitente (generar_guia / consultar_guia), ver ./guia.ts
//   También se acepta el ComprobanteErp directo en el cuerpo (sin envolver en { comprobante }).
//
// Respuestas: 200 -> RespuestaPse de Nubefact (ok, aceptada, codigo, enlacePdf, ...)
//             422 -> { error } dato a corregir (validación del ERP o rechazo de validación de Nubefact)
//             401/403 sesión o rol; 500 configuración o conexión
//
// Secretos: NUBEFACT_RUTA, NUBEFACT_TOKEN y opcional NUBEFACT_SERIES (ver ../sunat-cpe/nubefact.ts).
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { bajarEnlace, consultarNubefact, diferenciaQr, estadoPse, generarNubefact, operacionNubefact, type RespuestaPse } from "../sunat-cpe/nubefact.ts";
import { emisor, entorno, nubefact } from "../sunat-cpe/config.ts";
import { armarDocumento, ErrorCpe, nombreArchivo, type ComprobanteErp, type DocumentoCpe } from "../sunat-cpe/documento.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { jsonConsultaGuia, jsonGuia, serieYNumero, type GuiaErp } from "./guia.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Mismos roles que la función sunat-cpe. */
const ROLES = ["creador", "soporte", "tesoreria", "logistica", "ventas"];


/** El comprobante tal como está guardado en public.ventas (espera unos segundos si el ERP aún lo está guardando). */
async function leerComprobante(admin: SupabaseClient, id: string): Promise<ComprobanteErp | undefined> {
  for (let i = 0; i < 4; i++) {
    const { data, error } = await admin.from("ventas").select("data").eq("tipo", "comprobante").eq("id", id).maybeSingle();
    if (error) throw new Error(`No se pudo leer el comprobante: ${error.message}`);
    if (data) return { ...(data.data as ComprobanteErp), id };
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return undefined;
}

/**
 * Guarda la respuesta del PSE en public.sunat_cpe (estado real, hash, enlaces y copia del XML / CDR) y en la
 * bitácora public.sunat_envios. Es la constancia que se conserva para SUNAT (no depende del navegador).
 */
async function registrarPse(
  admin: SupabaseClient,
  id: string,
  doc: DocumentoCpe,
  r: RespuestaPse,
  usuario: string,
  previo: { intentos?: number } | null,
  accion: "enviar" | "consultar"
): Promise<{ estado: string; entorno: string }> {
  const estado = estadoPse(r);
  const ent = entorno();
  const xml = await bajarEnlace(r.enlaceXml);
  const cdr = await bajarEnlace(r.enlaceCdr);
  const ahora = new Date().toISOString();
  const fila = {
    id,
    tipo_doc: doc.codigoTipo,
    serie: doc.serie,
    numero: doc.id,
    fecha_emision: doc.fechaEmision,
    cliente_doc: `${doc.cliente.tipoDoc}-${doc.cliente.numDoc}`,
    total: doc.total,
    igv: doc.igv,
    estado,
    codigo: r.codigo || (r.aceptada ? "0" : null),
    descripcion: r.descripcion || (estado === "ENVIADO" ? "Recibido por Nubefact, en espera de SUNAT" : null),
    observaciones: r.observaciones,
    hash: r.hash || null,
    nombre_archivo: nombreArchivo(doc),
    entorno: ent,
    pse: "nubefact",
    enlace_pdf: r.enlacePdf || null,
    enlace_xml: r.enlaceXml || null,
    enlace_cdr: r.enlaceCdr || null,
    ...(xml ? { xml: new TextDecoder().decode(xml) } : {}),
    ...(cdr ? { cdr_zip: encodeBase64(cdr) } : {}),
    intentos: (previo?.intentos ?? 0) + (accion === "enviar" ? 1 : 0),
    ...(accion === "enviar" ? { enviado_por: usuario, enviado_at: ahora } : {}),
    updated_at: ahora,
  };
  const { error } = await admin.from("sunat_cpe").upsert(fila);
  // Sin la tabla (migración pendiente) el envío ya se hizo: no se pierde, solo se avisa en el log
  if (error) console.error("sunat_cpe", doc.id, error.message);
  await admin.from("sunat_envios").insert({ comprobante_id: id, accion, entorno: ent, codigo: fila.codigo, mensaje: `${estado} ${fila.descripcion ?? ""}`.trim(), usuario });
  return { estado, entorno: ent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // Sesión y rol: sin esto cualquiera con la anon key podría emitir comprobantes a nombre de la empresa
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const usuarioCli = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await usuarioCli.auth.getUser();
  if (!u?.user) return json({ error: "Inicie sesión." }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", u.user.id).maybeSingle();
  if (!ROLES.includes(String(perfil?.rol ?? "").toLowerCase())) return json({ error: "Su usuario no puede emitir comprobantes electrónicos." }, 403);

  let body: { comprobante?: ComprobanteErp; referencia?: ComprobanteErp; guia?: GuiaErp; consultar?: boolean } & Partial<ComprobanteErp>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido: se esperaba JSON." }, 400);
  }
  // Solo se usa el id: el contenido se lee del servidor (ver más abajo)
  const comprobante = (body.comprobante ?? body) as ComprobanteErp;

  try {
    const nf = nubefact(); // valida que existan NUBEFACT_RUTA / NUBEFACT_TOKEN (mensaje claro si faltan)

    // Guía de Remisión Remitente: { guia } emite (generar_guia); { guia, consultar: true } solo consulta (consultar_guia)
    if (body.guia) {
      const g = body.guia;
      const { serie, correlativo } = serieYNumero(g);
      const numero = `${serie}-${correlativo}`;
      let r = await operacionNubefact(nf.ruta, nf.token, body.consultar === true ? jsonConsultaGuia(g) : jsonGuia(g));
      if (body.consultar !== true && !r.ok && /exist|registrad|duplicad/i.test(r.error ?? "")) r = await operacionNubefact(nf.ruta, nf.token, jsonConsultaGuia(g));
      if (!r.ok) return json({ ...r, error: `Nubefact: ${r.error ?? "error"}` }, 422);
      return json({ ...r, numero });
    }

    // Homologación: lo que viaja a SUNAT es SIEMPRE lo guardado en public.ventas (no lo que manda el navegador).
    // Así el XML, el PDF y la contabilidad dicen lo mismo y nadie puede emitir un comprobante que no está en el ERP.
    if (!comprobante?.id) return json({ error: "Falta el id del comprobante." }, 400);
    const guardado = await leerComprobante(admin, comprobante.id);
    if (!guardado) return json({ error: `${comprobante.numero ?? "El comprobante"} aún no termina de guardarse en el servidor. Intente de nuevo en unos segundos.` }, 422);
    const refId = guardado.ref?.id;
    const refGuardada = refId ? await leerComprobante(admin, refId) : undefined;
    if (refId && !refGuardada) return json({ error: `No se encontró en el servidor ${guardado.ref?.numero ?? "el comprobante"} que modifica la nota.` }, 422);

    const doc = armarDocumento(guardado, emisor(), refGuardada);
    const usuario = u.user.email ?? u.user.id;
    const { data: previo } = await admin.from("sunat_cpe").select("estado,intentos,enlace_pdf,enlace_xml,enlace_cdr,hash,codigo,descripcion,entorno").eq("id", guardado.id).maybeSingle();

    // { consultar: true }: solo consulta el estado en Nubefact (trae el XML / CDR cuando SUNAT ya respondió), no emite
    if (body.consultar === true) {
      const q = await consultarNubefact(nf.ruta, nf.token, doc.codigoTipo, doc.serie, doc.correlativo);
      if (!q.ok) return json({ ...q, error: `Nubefact: ${q.error ?? "error"}` }, 422);
      const fila = await registrarPse(admin, guardado.id, doc, q, usuario, previo, "consultar");
      return json({ ...q, numero: doc.id, estado: fila.estado, entorno: fila.entorno });
    }

    // Un comprobante ya aceptado no se vuelve a emitir (evita duplicados ante SUNAT)
    if (previo && ["ACEPTADO", "OBSERVADO", "ANULADO"].includes(previo.estado))
      return json({
        ok: true,
        aceptada: previo.estado !== "ANULADO",
        codigo: previo.codigo ?? "",
        descripcion: previo.descripcion ?? "",
        observaciones: [],
        hash: previo.hash ?? "",
        enlacePdf: previo.enlace_pdf ?? "",
        enlaceXml: previo.enlace_xml ?? "",
        enlaceCdr: previo.enlace_cdr ?? "",
        numero: doc.id,
        estado: previo.estado,
        entorno: previo.entorno,
        yaEnviado: true,
      });

    // Nota: el comprobante que modifica debe estar aceptado por SUNAT
    if (refGuardada) {
      const { data: estRef } = await admin.from("sunat_cpe").select("estado").eq("id", refGuardada.id).maybeSingle();
      if (estRef && !["ACEPTADO", "OBSERVADO"].includes(estRef.estado))
        return json({ error: `${refGuardada.numero} está ${estRef.estado} en SUNAT: la nota solo modifica comprobantes aceptados.` }, 422);
    }

    let r = await generarNubefact(nf.ruta, nf.token, doc);
    // Reintento de algo ya registrado en Nubefact: se consulta, pero solo se acepta si es ESTE comprobante
    if (!r.ok && /exist|registrad|duplicad/i.test(r.error ?? "")) {
      r = await consultarNubefact(nf.ruta, nf.token, doc.codigoTipo, doc.serie, doc.correlativo);
      const dif = r.ok ? diferenciaQr(r, doc) : "";
      if (dif) {
        await admin.from("sunat_envios").insert({ comprobante_id: guardado.id, accion: "enviar", entorno: entorno(), codigo: "DUPLICADO", mensaje: dif, usuario });
        return json({ error: `El número ${doc.id} ya está registrado en Nubefact con OTRO comprobante (${dif}). Revise las series antes de volver a enviar.` }, 422);
      }
    }
    if (!r.ok) {
      await admin.from("sunat_envios").insert({ comprobante_id: guardado.id, accion: "enviar", entorno: entorno(), codigo: r.errorCodigo ?? "", mensaje: r.error ?? "", usuario });
      return json({ ...r, error: `Nubefact: ${r.error ?? "error"}` }, 422);
    }
    const fila = await registrarPse(admin, guardado.id, doc, r, usuario, previo, "enviar");
    return json({ ...r, numero: doc.id, estado: fila.estado, entorno: fila.entorno });
  } catch (e) {
    // ErrorCpe = dato a corregir en el ERP (422); el resto, configuración o conexión (500)
    const msg = (e as Error).message ?? String(e);
    return json({ ok: false, error: msg }, e instanceof ErrorCpe ? 422 : 500);
  }
});
