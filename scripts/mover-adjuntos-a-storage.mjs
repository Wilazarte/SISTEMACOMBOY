// Mueve los adjuntos guardados en base64 dentro de data (guías, fotos de despacho) al bucket privado
// "tesoreria" y deja en su lugar la referencia "sb:tesoreria/<ruta>" que entiende el ERP (lib/storage.ts urlArchivo).
//
// Uso (desde la raíz del repo, con la service role key de Supabase › Project Settings › API):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/mover-adjuntos-a-storage.mjs                 -> solo muestra qué haría
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/mover-adjuntos-a-storage.mjs --aplicar       -> sube y actualiza
//   ... --incluir-almacen   también mueve las fotos de despacho (ver nota)
//
// Nota: hoy la policy bauchers_leer solo deja leer el bucket a creador, gerencia y tesorería. Si se mueven las
// fotos de despacho, el usuario de Almacén deja de verlas hasta que se le dé lectura en Storage.
// Correr antes supabase/backups/backup_previo_sprint1.sql (deja compras.csv y almacen.csv).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");

const aplicar = process.argv.includes("--aplicar");
const tablas = [["compras", "guia"], ...(process.argv.includes("--incluir-almacen") ? [["almacen", "despacho"]] : [])];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf", "image/webp": "webp" };
const sb = createClient(url, clave, { auth: { persistSession: false } });

/** Recorre data y reemplaza cada base64 por su ruta en Storage. */
async function mover(valor, base, cuenta) {
  if (typeof valor === "string") {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(valor);
    if (!m) return valor;
    const ext = EXT[m[1]] ?? "bin";
    const ruta = `${base}/${cuenta.n++}.${ext}`;
    const bytes = Buffer.from(m[2], "base64");
    cuenta.bytes += valor.length;
    if (!aplicar) return valor;
    const { error } = await sb.storage.from("tesoreria").upload(ruta, bytes, { contentType: m[1], upsert: true });
    if (error) throw new Error(`${ruta}: ${error.message}`);
    return `sb:tesoreria/${ruta}`;
  }
  if (Array.isArray(valor)) return Promise.all(valor.map((v) => mover(v, base, cuenta)));
  if (valor && typeof valor === "object") {
    const r = {};
    for (const [k, v] of Object.entries(valor)) r[k] = await mover(v, base, cuenta);
    return r;
  }
  return valor;
}

for (const [tabla, tipo] of tablas) {
  const { data: filas, error } = await sb.from(tabla).select("id,tipo,data").eq("tipo", tipo);
  if (error) throw error;
  for (const f of filas) {
    const cuenta = { n: 0, bytes: 0 };
    const nueva = await mover(f.data, `migrado/${tabla}/${tipo}/${f.id}`, cuenta);
    if (!cuenta.n) continue;
    console.log(`${aplicar ? "Movido" : "Movería"} ${tabla}/${tipo}/${f.id}: ${cuenta.n} archivo(s), ${(cuenta.bytes / 1024).toFixed(0)} kB`);
    if (aplicar) {
      const { error: e } = await sb.from(tabla).update({ data: nueva }).eq("tipo", tipo).eq("id", f.id);
      if (e) throw e;
    }
  }
}
console.log(aplicar ? "Listo." : "Simulación: nada cambió. Agregue --aplicar para mover.");
