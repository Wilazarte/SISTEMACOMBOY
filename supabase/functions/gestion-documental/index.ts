// Edge Function gestion-documental (Supabase, Deno): único camino a los archivos de la Gestión Documentaria.
//
// El bucket "gestion-documental" es PRIVADO y no tiene políticas para usuarios: nadie baja un archivo con un
// enlace. Esta función, con el service role, es la única que lo lee y escribe, y SIEMPRE pide permiso a la base
// antes (las funciones gd_* validan el nivel y escriben audit_log en la misma transacción).
//
// POST con la sesión del usuario (Authorization: Bearer <jwt>):
//   multipart  accion=subir          archivo, datos (JSON), hash_cliente  -> FLUJO 1 (código, hash, v1.0, En Revision)
//   multipart  accion=nueva_version  archivo, document_id, tipo_cambio (menor|mayor), motivo, hash_cliente -> FLUJO 3
//   JSON       { accion: "ver", document_id, version? }                    -> vista previa (registra VER)
//   JSON       { accion: "descargar", document_id, version?, confirmaciones } -> FLUJO 4 (registra DESCARGAR, límite 5/h)
//   JSON       { accion: "verificar", document_id }                        -> recalcula el SHA-256 de todas las versiones
//
// Cada vez que entrega un archivo recalcula su SHA-256: si no coincide con el registrado, ALERTA DE INTEGRIDAD
// (audit_log + aviso a Gerencia y al dueño). Los PDF salen con marca de agua (usuario + fecha + IP).
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase. Sin secretos adicionales.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, degrees, rgb } from "npm:pdf-lib@1.17.1";

const BUCKET = "gestion-documental";
const MAX_BYTES = 25 * 1024 * 1024;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gd-dispositivo",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-gd-version, x-gd-hash, x-gd-integridad, x-gd-marca, x-gd-nombre, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MODULOS = ["Almacen", "Tesoreria", "Produccion", "Ventas", "Gerencia", "Logistica"];
const CATEGORIAS = ["Plano", "Politica", "Estrategia Comercial", "Contrato", "Requerimiento", "Cotizacion", "Factura"];
const ROLES = ["Gerencia", "Ingenieria", "Produccion", "Almacen", "Tesoreria", "Ventas", "Logistica", "Secocha"];
const PERMISOS = ["Sin Acceso", "Solo Lectura", "Lectura y Descarga", "Edicion", "Aprobacion", "Control Total"];

async function sha256(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const nombreSeguro = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "archivo";

/** IP real del cliente (la ponen Supabase / Cloudflare; el navegador no la elige). */
const ipDe = (req: Request) =>
  req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? ((req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null);
const dispositivoDe = (req: Request) =>
  [req.headers.get("x-gd-dispositivo"), req.headers.get("user-agent")].filter(Boolean).join(" · ").slice(0, 400) || null;

/** Marca de agua en todas las páginas: diagonal tenue + pie con usuario, fecha, IP, código y versión. */
async function marcaDeAgua(bytes: Uint8Array, lineas: { diagonal: string; pie: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const fuente = await pdf.embedFont(StandardFonts.HelveticaBold);
  const burdeos = rgb(0x80 / 255, 0x00, 0x21 / 255); // #800021
  for (const p of pdf.getPages()) {
    const { width, height } = p.getSize();
    const tam = Math.max(14, Math.min(width, height) / 22);
    for (let y = -height; y < height * 1.5; y += tam * 7) {
      p.drawText(lineas.diagonal, { x: 20, y, size: tam, font: fuente, color: burdeos, opacity: 0.13, rotate: degrees(32) });
    }
    p.drawText(lineas.pie, { x: 18, y: 10, size: 7.5, font: fuente, color: burdeos, opacity: 0.85 });
  }
  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Quién llama: se valida el JWT (no se confía en ningún dato del navegador sobre el usuario)
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json({ error: "Inicie sesión." }, 401);
  const uid = u.user.id;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ip = ipDe(req);
  const dispositivo = dispositivoDe(req);

  const tipo = req.headers.get("content-type") ?? "";
  try {
    // ------------------------------------------------------------------ SUBIR / NUEVA VERSIÓN (multipart)
    if (tipo.includes("multipart/form-data")) {
      const form = await req.formData();
      const accion = String(form.get("accion") ?? "");
      const archivo = form.get("archivo");
      if (!(archivo instanceof File)) return json({ error: "Falta el archivo." }, 400);
      if (archivo.size === 0) return json({ error: "El archivo está vacío." }, 400);
      if (archivo.size > MAX_BYTES) return json({ error: "El archivo supera 25 MB." }, 413);
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      // HASH SHA-256 calculado en el SERVIDOR sobre los bytes recibidos (el del navegador solo se compara)
      const hash = await sha256(bytes);
      const hashCliente = String(form.get("hash_cliente") ?? "");
      if (hashCliente && hashCliente !== hash) return json({ error: "El archivo llegó alterado (el hash no coincide). Vuelva a intentarlo." }, 400);

      if (accion === "subir") {
        const d = JSON.parse(String(form.get("datos") ?? "{}"));
        if (!String(d.nombre ?? "").trim()) return json({ error: "Falta el nombre." }, 400);
        if (!MODULOS.includes(d.modulo)) return json({ error: "Módulo no válido." }, 400);
        if (!CATEGORIAS.includes(d.categoria)) return json({ error: "Categoría no válida." }, 400);
        const permisos = (Array.isArray(d.permisos) ? d.permisos : []).filter((p: { rol: string; permiso: string }) => ROLES.includes(p.rol) && PERMISOS.includes(p.permiso));
        const aprobadores = (Array.isArray(d.aprobadores) ? d.aprobadores : ["Gerencia"]).filter((r: string) => ROLES.includes(r));
        const id = crypto.randomUUID();
        const ruta = `${id}/v1.0-${crypto.randomUUID()}-${nombreSeguro(archivo.name)}`;
        // upsert:false = jamás sobrescribe un archivo existente
        const { error: eSubida } = await admin.storage.from(BUCKET).upload(ruta, bytes, { contentType: archivo.type || "application/octet-stream", upsert: false });
        if (eSubida) return json({ error: `No se pudo guardar el archivo: ${eSubida.message}` }, 500);
        // AUDITORÍA: gd_registrar_documento escribe CREAR (y ENVIAR_REVISION) en audit_log
        const { data, error } = await admin.rpc("gd_registrar_documento", {
          p_id: id, p_usuario: uid, p_ip: ip, p_dispositivo: dispositivo,
          p_nombre: d.nombre, p_descripcion: d.descripcion ?? null, p_modulo: d.modulo, p_categoria: d.categoria,
          p_fecha_vencimiento: d.fecha_vencimiento || null, p_confidencial: !!d.es_confidencial, p_referencia: d.referencia_externa ?? null,
          p_archivo_url: ruta, p_hash: hash, p_archivo_nombre: archivo.name, p_archivo_tipo: archivo.type || null, p_archivo_bytes: archivo.size,
          p_permisos: permisos, p_aprobadores: aprobadores.length ? aprobadores : ["Gerencia"], p_enviar: d.enviar !== false,
        });
        if (error || !data?.ok) {
          // El archivo no quedó registrado en ningún documento: se retira para no dejar huérfanos
          await admin.storage.from(BUCKET).remove([ruta]);
          return json({ error: error?.message ?? data?.error ?? "No se pudo registrar." }, error ? 500 : 403);
        }
        return json({ ...data, hash_sha256: hash });
      }

      if (accion === "nueva_version") {
        const docId = String(form.get("document_id") ?? "");
        const motivo = String(form.get("motivo") ?? "").trim();
        if (motivo.length < 5) return json({ error: "El motivo del cambio es obligatorio." }, 400);
        const ruta = `${docId}/${Date.now()}-${crypto.randomUUID()}-${nombreSeguro(archivo.name)}`;
        const { error: eSubida } = await admin.storage.from(BUCKET).upload(ruta, bytes, { contentType: archivo.type || "application/octet-stream", upsert: false });
        if (eSubida) return json({ error: `No se pudo guardar el archivo: ${eSubida.message}` }, 500);
        // AUDITORÍA: gd_registrar_version escribe SUBIR_VERSION con hash anterior y nuevo (o ACCESO_DENEGADO)
        const { data, error } = await admin.rpc("gd_registrar_version", {
          p_doc: docId, p_usuario: uid, p_ip: ip, p_dispositivo: dispositivo, p_tipo_cambio: form.get("tipo_cambio") === "mayor" ? "mayor" : "menor",
          p_motivo: motivo, p_archivo_url: ruta, p_hash: hash, p_archivo_nombre: archivo.name, p_archivo_tipo: archivo.type || null, p_archivo_bytes: archivo.size,
        });
        if (error || !data?.ok) {
          await admin.storage.from(BUCKET).remove([ruta]);
          return json({ error: error?.message ?? data?.error ?? "No se pudo registrar." }, error ? 500 : 403);
        }
        return json({ ...data, hash_sha256: hash });
      }
      return json({ error: "Acción no válida." }, 400);
    }

    // ------------------------------------------------------------------ VER / DESCARGAR / VERIFICAR (JSON)
    const body = (await req.json().catch(() => ({}))) as { accion?: string; document_id?: string; version?: string; confirmaciones?: number };
    const docId = String(body.document_id ?? "");
    if (!docId) return json({ error: "Falta el documento." }, 400);

    if (body.accion === "ver" || body.accion === "descargar") {
      const accion = body.accion === "ver" ? "VER" : "DESCARGAR";
      // AUDITORÍA: la base registra VER / DESCARGAR (o ACCESO_DENEGADO / DESCARGA_BLOQUEADA) ANTES de entregar nada
      const { data: a, error } = await admin.rpc("gd_autorizar_archivo", {
        p_doc: docId, p_usuario: uid, p_ip: ip, p_dispositivo: dispositivo, p_accion: accion, p_version: body.version ?? null, p_confirmaciones: Number(body.confirmaciones ?? 0),
      });
      if (error) return json({ error: error.message }, 500);
      if (!a?.ok) return json(a, a?.bloqueado ? 429 : a?.confirmar ? 409 : 403);

      const { data: blob, error: eBaja } = await admin.storage.from(BUCKET).download(a.archivo_url);
      let bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      const hashReal = bytes ? await sha256(bytes) : null;
      const integro = hashReal === a.hash_sha256;
      if (!integro) {
        // AUDITORÍA: ALERTA_INTEGRIDAD (archivo modificado o borrado fuera del sistema)
        await admin.rpc("gd_registrar_integridad", { p_doc: docId, p_usuario: uid, p_ip: ip, p_dispositivo: dispositivo, p_version: a.version, p_hash_real: hashReal, p_origen: accion });
      }
      if (!bytes) return json({ error: `ALERTA DE INTEGRIDAD: el archivo de ${a.codigo} ${a.version} no está en el almacenamiento (${eBaja?.message ?? "no encontrado"}). Se avisó a Gerencia.`, integridad: "ALERTA" }, 410);

      // Marca de agua: siempre en la vista previa; en la descarga, obligatoria si es confidencial
      let marca = "no";
      const esPdf = (a.archivo_tipo ?? "").includes("pdf") || /\.pdf$/i.test(a.archivo_nombre ?? "");
      if (esPdf && (accion === "VER" || a.confidencial)) {
        const fecha = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
        const etiqueta = a.confidencial ? "CONFIDENCIAL" : accion === "VER" ? "VISTA PREVIA" : "COPIA CONTROLADA";
        try {
          bytes = await marcaDeAgua(bytes, {
            diagonal: `${etiqueta} · ${a.usuario_nombre ?? ""} · ${fecha}`,
            pie: `COMBOY VID · ${a.codigo} ${a.version} · ${etiqueta} · ${a.usuario_nombre ?? ""} · ${fecha} · IP ${ip ?? "-"} · SHA-256 ${String(a.hash_sha256).slice(0, 16)}…`,
          });
          marca = "si";
        } catch {
          marca = "no-pdf-protegido";
        }
      }
      return new Response(bytes, {
        headers: {
          ...CORS,
          "Content-Type": a.archivo_tipo || "application/octet-stream",
          "Cache-Control": "no-store",
          "x-gd-version": a.version,
          "x-gd-hash": a.hash_sha256,
          "x-gd-integridad": integro ? "OK" : "ALERTA",
          "x-gd-marca": marca,
          "x-gd-nombre": encodeURIComponent(`${a.codigo}-${a.version}-${a.archivo_nombre ?? "archivo"}`),
        },
      });
    }

    if (body.accion === "verificar") {
      // Solo Control Total, Gerencia o SOPORTE
      const [{ data: nivel }, { data: rol }] = await Promise.all([admin.rpc("gd_nivel", { p_doc: docId, p_uid: uid }), admin.rpc("gd_rol_de", { p_uid: uid })]);
      if (!(Number(nivel) >= 5 || rol === "Gerencia" || rol === "Soporte")) return json({ error: "Solo el dueño, Control Total, Gerencia o SOPORTE verifican la integridad." }, 403);
      const { data: versiones } = await admin.from("document_versions").select("version, archivo_url, hash_sha256").eq("document_id", docId).order("fecha");
      const resultado: { version: string; ok: boolean }[] = [];
      for (const v of versiones ?? []) {
        const { data: blob } = await admin.storage.from(BUCKET).download(v.archivo_url);
        const real = blob ? await sha256(new Uint8Array(await blob.arrayBuffer())) : null;
        // AUDITORÍA: VERIFICAR_INTEGRIDAD (correcto) o ALERTA_INTEGRIDAD (no coincide)
        await admin.rpc("gd_registrar_integridad", { p_doc: docId, p_usuario: uid, p_ip: ip, p_dispositivo: dispositivo, p_version: v.version, p_hash_real: real, p_origen: "VERIFICACION" });
        resultado.push({ version: v.version, ok: real === v.hash_sha256 });
      }
      return json({ ok: resultado.every((r) => r.ok), versiones: resultado });
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
