// Edge Function emitir-comprobante (Supabase, Deno): envía un comprobante del ERP a Nubefact (PSE).
//
// POST (con la sesión del usuario: supabase.functions.invoke la manda sola)
//   { comprobante: ComprobanteErp, referencia?: ComprobanteErp }
//   - comprobante: el mismo objeto de ventas.data (tipo 'comprobante') -> ver ComprobanteErp en ../sunat-cpe/documento.ts
//   - referencia:  solo para notas de crédito / débito, el comprobante que modifican
//   - consultar:   true = no emite, solo consulta en Nubefact el estado y los enlaces (XML / CDR) actualizados
//   También se acepta el ComprobanteErp directo en el cuerpo (sin envolver en { comprobante }).
//
// Respuestas: 200 -> RespuestaPse de Nubefact (ok, aceptada, codigo, enlacePdf, ...)
//             422 -> { error } dato a corregir (validación del ERP o rechazo de validación de Nubefact)
//             401/403 sesión o rol; 500 configuración o conexión
//
// Secretos: NUBEFACT_RUTA, NUBEFACT_TOKEN y opcional NUBEFACT_SERIES (ver ../sunat-cpe/nubefact.ts).
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { armarDocumento, ErrorCpe, type ComprobanteErp } from "../sunat-cpe/documento.ts";
import { consultarNubefact, generarNubefact } from "../sunat-cpe/nubefact.ts";
import { emisor, nubefact } from "../sunat-cpe/config.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Mismos roles que la función sunat-cpe. */
const ROLES = ["creador", "soporte", "tesoreria", "logistica", "ventas"];

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

  let body: { comprobante?: ComprobanteErp; referencia?: ComprobanteErp; consultar?: boolean } & Partial<ComprobanteErp>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido: se esperaba JSON." }, 400);
  }
  const comprobante = (body.comprobante ?? body) as ComprobanteErp;
  const referencia = body.comprobante ? body.referencia : undefined;

  try {
    const nf = nubefact(); // valida que existan NUBEFACT_RUTA / NUBEFACT_TOKEN (mensaje claro si faltan)
    const doc = armarDocumento(comprobante, emisor(), referencia);
    // { consultar: true }: solo consulta el estado en Nubefact (trae el XML / CDR cuando SUNAT ya respondió), no emite
    if (body.consultar === true) {
      const q = await consultarNubefact(nf.ruta, nf.token, doc.codigoTipo, doc.serie, doc.correlativo);
      if (!q.ok) return json({ ...q, error: `Nubefact: ${q.error ?? "error"}` }, 422);
      return json({ ...q, numero: doc.id });
    }
    let r = await generarNubefact(nf.ruta, nf.token, doc);
    // Reintento de algo ya registrado en Nubefact: se consulta en vez de fallar
    if (!r.ok && /exist|registrad|duplicad/i.test(r.error ?? "")) r = await consultarNubefact(nf.ruta, nf.token, doc.codigoTipo, doc.serie, doc.correlativo);
    if (!r.ok) return json({ ...r, error: `Nubefact: ${r.error ?? "error"}` }, 422);
    return json({ ...r, numero: doc.id });
  } catch (e) {
    // ErrorCpe = dato a corregir en el ERP (422); el resto, configuración o conexión (500)
    const msg = (e as Error).message ?? String(e);
    return json({ ok: false, error: msg }, e instanceof ErrorCpe ? 422 : 500);
  }
});
