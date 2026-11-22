// Edge Function validar-ruc-decolecta (Supabase, Deno).
// Recibe { ruc, cotizacion_id? }, consulta el RUC en Decolecta (padrón SUNAT) y devuelve razón social, estado,
// condición de domicilio y dirección fiscal. Si viene cotizacion_id, guarda el resultado en cotizaciones
// (ruc_validado = ACTIVO y HABIDO). Cada consulta queda en proveedor_validacion_log y cada RUC encontrado
// en ruc_validados (padrón del sistema: todos los módulos exigen un RUC de esa tabla antes de guardar).
//
// Secretos (Supabase › Edge Functions › Secrets):
//   DECOLECTA_TOKEN  token de la cuenta Decolecta (obligatorio)
//   DECOLECTA_URL    opcional, por defecto https://api.decolecta.com/v1/sunat/ruc
//   DECOLECTA_DNI_URL opcional, por defecto https://api.decolecta.com/v1/reniec/dni
//
// DNI (RENIEC): con { dni } en vez de { ruc } usa el MISMO token y devuelve nombres, apellido paterno,
// apellido materno y nombre completo. Cada DNI encontrado queda en dni_validados (si la tabla existe).
// La rama RUC no cambia.
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Dígito verificador del RUC (módulo 11). */
function rucValido(ruc: string): boolean {
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;
  const f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = f.reduce((a, w, i) => a + w * Number(ruc[i]), 0);
  const d = 11 - (s % 11);
  return (d === 10 ? 0 : d === 11 ? 1 : d) === Number(ruc[10]);
}

// Cualquier usuario con perfil puede validar: el RUC es obligatorio en todos los módulos que lo piden.
const txt = (o: Record<string, unknown>, ...k: string[]) => {
  for (const x of k) if (typeof o[x] === "string" && (o[x] as string).trim()) return (o[x] as string).trim();
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  // Quién llama: usuario con sesión y rol de la planta
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json({ error: "Inicie sesión." }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: perfil } = await admin.from("perfiles").select("usuario,rol").eq("id", u.user.id).maybeSingle();
  if (!perfil) return json({ error: "Su usuario no tiene perfil en el ERP: no puede validar RUC." }, 403);

  const body = (await req.json().catch(() => ({}))) as { ruc?: string; dni?: string; cotizacion_id?: string };
  if (body.dni !== undefined) return await consultarDni(String(body.dni), perfil.usuario, admin);
  const ruc = String(body.ruc ?? "").replace(/\D/g, "");
  if (!rucValido(ruc)) return json({ error: `RUC ${ruc || "vacío"} no es válido (11 dígitos y dígito verificador).` }, 400);

  const token = Deno.env.get("DECOLECTA_TOKEN");
  if (!token) return json({ error: "Falta el secreto DECOLECTA_TOKEN en Supabase." }, 500);
  const base = Deno.env.get("DECOLECTA_URL") ?? "https://api.decolecta.com/v1/sunat/ruc";

  let respuesta: Record<string, unknown> = {};
  let status = 0;
  try {
    const r = await fetch(`${base}?numero=${ruc}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    status = r.status;
    respuesta = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    respuesta = { error: String(e) };
  }

  const razon = txt(respuesta, "razon_social", "razonSocial", "nombre");
  const estado = txt(respuesta, "estado").toUpperCase();
  const condicion = txt(respuesta, "condicion", "condicion_domicilio").toUpperCase();
  const direccion = txt(respuesta, "direccion", "direccion_completa", "domicilio_fiscal");
  const ok = status === 200 && !!razon;
  const validado = ok && estado === "ACTIVO" && condicion === "HABIDO";

  await admin.from("proveedor_validacion_log").insert({ ruc, cotizacion_id: body.cotizacion_id ?? null, respuesta_decolecta: { status, ...respuesta }, ok, usuario: perfil.usuario });
  if (!ok) return json({ error: status === 404 ? `RUC ${ruc} no existe en SUNAT.` : `Decolecta no respondió (HTTP ${status || "sin conexión"}).`, status }, 502);

  const validado_at = new Date().toISOString();
  // Padrón del sistema. Si la tabla aún no existe (SQL pendiente) la respuesta igual sirve para esta sesión.
  const { error: errPadron } = await admin
    .from("ruc_validados")
    .upsert({ ruc, razon_social: razon, estado, condicion, direccion, validado, validado_at, usuario: perfil.usuario }, { onConflict: "ruc" });
  if (errPadron && !/does not exist|42P01|schema cache/i.test(`${errPadron.code} ${errPadron.message}`)) return json({ error: errPadron.message }, 500);

  if (body.cotizacion_id) {
    const { error } = await admin
      .from("cotizaciones")
      .update({ ruc_validado: validado, ruc_estado: estado, condicion_habido: condicion, razon_social_sunat: razon, direccion_fiscal: direccion, validado_at })
      .eq("id", body.cotizacion_id)
      .eq("ruc", ruc);
    if (error) return json({ error: error.message }, 500);
  }
  return json({ ruc, razon_social: razon, estado, condicion, direccion, validado, validado_at });
});

// ------------------------------------------------------------------ DNI (RENIEC)
// Respuesta de Decolecta: { first_name, first_last_name, second_last_name, full_name, document_number }
// (algunas versiones mandan last_name con los dos apellidos juntos).
async function consultarDni(entrada: string, usuario: string, admin: ReturnType<typeof createClient>): Promise<Response> {
  const dni = entrada.replace(/\D/g, "");
  if (!/^\d{8}$/.test(dni)) return json({ error: "El DNI debe tener 8 dígitos." }, 400);
  const token = Deno.env.get("DECOLECTA_TOKEN");
  if (!token) return json({ error: "Falta el secreto DECOLECTA_TOKEN en Supabase." }, 500);
  const base = Deno.env.get("DECOLECTA_DNI_URL") ?? "https://api.decolecta.com/v1/reniec/dni";

  let r: Record<string, unknown> = {};
  let status = 0;
  try {
    const res = await fetch(`${base}?numero=${dni}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    status = res.status;
    r = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    r = { error: String(e) };
  }

  const nombres = txt(r, "first_name", "nombres");
  let paterno = txt(r, "first_last_name", "apellido_paterno", "apellidoPaterno");
  let materno = txt(r, "second_last_name", "apellido_materno", "apellidoMaterno");
  const apellidos = txt(r, "last_name", "apellidos");
  if (!paterno && apellidos) {
    const partes = apellidos.split(/\s+/);
    paterno = partes.shift() ?? "";
    materno = materno || partes.join(" ");
  }
  const completo = txt(r, "full_name", "nombre_completo", "nombreCompleto") || [paterno, materno, nombres].filter(Boolean).join(" ");
  const ok = status === 200 && !!(nombres || completo);

  await admin.from("proveedor_validacion_log").insert({ ruc: dni, respuesta_decolecta: { tipo: "DNI", status, ...r }, ok, usuario });
  if (!ok) return json({ error: status === 404 || status === 422 ? `El DNI ${dni} no existe en RENIEC.` : `Decolecta no respondió (HTTP ${status || "sin conexión"}).`, status }, 502);

  const verificado_at = new Date().toISOString();
  const fila = { dni, nombres, apellido_paterno: paterno, apellido_materno: materno, nombre_completo: completo, verificado_at, usuario };
  const { error } = await admin.from("dni_validados").upsert(fila, { onConflict: "dni" });
  if (error && !/does not exist|42P01|schema cache/i.test(`${error.code} ${error.message}`)) return json({ error: error.message }, 500);
  return json(fila);
}
