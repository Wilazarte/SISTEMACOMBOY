// Unifica el stock duplicado: mismo producto (nombre sin mayúsculas ni espacios extra) y misma unidad
// en sedes que son el mismo lugar (SEDE_MAP de lib/constantes.ts: Almacen Aqp, Adm Aqp, Planta Arequipa = Taller Principal Aqp).
// Ej.: BATERIA 500 U1R  Taller Principal Aqp 7 + Almacen Aqp 15  ->  una sola fila con 22.
//
// Uso (desde la raíz del repo, con la service role key de Supabase › Project Settings › API):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/unificar-inventario.mjs                -> solo muestra qué haría
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/unificar-inventario.mjs --ejecutar     -> actualiza y borra
//   --sede-destino "Almacen Aqp"   sede donde queda la fila unificada (por defecto "Taller Principal Aqp",
//                                  la sede de repuestos del sistema, que tiene casi todo el stock)
//
// Qué hace con --ejecutar, por cada grupo duplicado:
//   1) la fila con más stock queda con la suma de cantidades, el costo más reciente y la sede destino;
//   2) los movimientos de kardex y vales que apuntaban a las filas que se van pasan a apuntar a la que queda;
//   3) borra las otras filas de stock.
// Productos con el mismo nombre pero distinta unidad (PZA / UND) NO se suman: se listan para revisarlos a mano.
// Correr antes supabase/backups/backup_previo_sprint1.sql (deja almacen.csv).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SEDE_MAP = { "Almacen Aqp": "Taller Principal Aqp", "Adm Aqp": "Taller Principal Aqp", "Planta Arequipa": "Taller Principal Aqp", "Suc Secocha": "Sucursal Secocha" };
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");

const ejecutar = process.argv.includes("--ejecutar");
const i = process.argv.indexOf("--sede-destino");
const destino = i > 0 ? process.argv[i + 1] : "Taller Principal Aqp";
const sb = createClient(url, clave, { auth: { persistSession: false } });

const sedeNorm = (s) => SEDE_MAP[String(s ?? "").trim()] ?? String(s ?? "").trim();
const prodNorm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const { data: filas, error } = await sb.from("almacen").select("id,tipo,data").eq("tipo", "stock");
if (error) throw error;

// Kardex, vales, despachos… (se buscan las referencias a las filas de stock que se borran). PostgREST: máx. 1000 por consulta
const otras = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error: e } = await sb.from("almacen").select("id,tipo,data").neq("tipo", "stock").range(desde, desde + 999);
  if (e) throw e;
  otras.push(...data);
  if (data.length < 1000) break;
}

const grupos = new Map();
const porNombre = new Map();
for (const f of filas) {
  const d = f.data ?? {};
  const k = `${sedeNorm(d.sede)}|${prodNorm(d.nombre)}|${d.unidad}`;
  grupos.set(k, [...(grupos.get(k) ?? []), f]);
  const kn = `${sedeNorm(d.sede)}|${prodNorm(d.nombre)}`;
  porNombre.set(kn, new Set([...(porNombre.get(kn) ?? []), d.unidad]));
}

const duplicados = [...grupos.values()].filter((g) => g.length > 1);
console.log(`${filas.length} filas de stock · ${duplicados.length} producto(s) duplicado(s) · destino: ${destino}${ejecutar ? "" : " · SIMULACIÓN"}`);

for (const g of duplicados) {
  const orden = [...g].sort((a, b) => Number(b.data.cantidad) - Number(a.data.cantidad));
  const queda = orden[0];
  const sobran = orden.slice(1);
  const reciente = [...g].sort((a, b) => String(b.data.actualizado).localeCompare(String(a.data.actualizado)))[0];
  const total = Math.round(g.reduce((a, f) => a + Number(f.data.cantidad || 0), 0) * 100) / 100;
  console.log(`  ${queda.data.nombre} (${queda.data.unidad}): ${g.map((f) => `${f.data.sede} ${f.data.cantidad}`).join(" + ")} = ${total}`);
  if (!ejecutar) continue;

  const nueva = { ...queda.data, sede: destino, cantidad: total, costoUnit: reciente.data.costoUnit, actualizado: new Date().toISOString() };
  const up = await sb.from("almacen").update({ data: nueva }).eq("tipo", "stock").eq("id", queda.id);
  if (up.error) throw up.error;

  // Kardex, vales y demás filas de almacén que apuntan a las filas que se van
  for (const s of sobran) {
    const refs = otras.filter((r) => JSON.stringify(r.data).includes(s.id));
    for (const r of refs) {
      const data = JSON.parse(JSON.stringify(r.data).split(s.id).join(queda.id));
      const u = await sb.from("almacen").update({ data }).eq("tipo", r.tipo).eq("id", r.id);
      if (u.error) throw u.error;
      r.data = data; // por si la misma fila apunta a otra que también se va
    }
    const del = await sb.from("almacen").delete().eq("tipo", "stock").eq("id", s.id);
    if (del.error) throw del.error;
    console.log(`    borrada fila ${s.data.sede} (${refs.length} referencia(s) movidas)`);
  }
}

const distintaUnidad = [...porNombre.entries()].filter(([, u]) => u.size > 1);
if (distintaUnidad.length) {
  console.log(`\nMismo producto con distinta unidad (revisar a mano, no se suman):`);
  for (const [k, u] of distintaUnidad) console.log(`  ${k.split("|")[1]} · ${k.split("|")[0]} · ${[...u].join(" / ")}`);
}
console.log(ejecutar ? "\nListo." : "\nSimulación: nada cambió. Agregue --ejecutar para unificar.");
