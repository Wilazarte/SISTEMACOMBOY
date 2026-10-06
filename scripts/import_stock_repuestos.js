#!/usr/bin/env node
/* eslint-disable */
// =====================================================================
// Importa los saldos de repuestos (Excel "Current Balances": Nombre Único | Ubicación | Ctd) al Stock de Almacén.
//
//   node scripts/import_stock_repuestos.js ALMACEN_saldos_13.xlsx
//       -> valida, escribe el LOG (scripts/logs/) y el SQL listo para pegar en Supabase (supabase/import_stock_repuestos.sql)
//
//   node --env-file=.env.local scripts/import_stock_repuestos.js ALMACEN_saldos_13.xlsx --ejecutar
//       -> además lo carga directo en Supabase (bulk upsert por lotes). Requiere en .env.local:
//          NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (⚠ NUNCA con prefijo NEXT_PUBLIC_ ni subida a git)
//
// Opciones: --sede "Taller Principal Aqp"  (sede para la ubicación ALMACEN)
//
// Reglas (lib/reglasStock.ts, las mismas de la pantalla Stock › Importar saldos):
//   PRODUCTO trim + mayúsculas, sin duplicados (repetidos se suman) · ALMACEN -> Taller Principal Aqp
//   UNIDAD: la del nombre ("| UNIDAD" -> UND, "| ROLLO", "| PAR"); ACEITE -> LT; BALDE/LIQUIDO/SILICONA/AFLOJATODO -> UND; resto PZA
//   CANTIDAD entero (vacío -> 0) · ÚLTIMO COSTO 0 ("Sin valorizar") · VALORIZADO = cantidad × costo · ACTUALIZADO = ahora
//   Si el producto ya existe en la sede (mismo nombre y unidad) se SUMA la cantidad: no se duplica.
//   Cada producto deja un movimiento SALDO_INICIAL en el kardex; el mismo archivo no se importa dos veces.
// =====================================================================

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("xlsx");
const ts = require("typescript");

const RAIZ = path.join(__dirname, "..");

/** Carga lib/reglasStock.ts (fuente única de las reglas) sin compilar el proyecto. */
function cargarReglas() {
  const src = fs.readFileSync(path.join(RAIZ, "lib", "reglasStock.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  return mod.exports;
}

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--sede");
const ejecutar = args.includes("--ejecutar");
const iSede = args.indexOf("--sede");
const sede = iSede >= 0 ? args[iSede + 1] : undefined;
if (!archivo || !fs.existsSync(archivo)) {
  console.error("Uso: node scripts/import_stock_repuestos.js <archivo.xlsx> [--sede \"Taller Principal Aqp\"] [--ejecutar]");
  process.exit(1);
}

const { prepararSaldos, SEDE_POR_DEFECTO } = cargarReglas();
const nombreArchivo = path.basename(archivo).replace(/^[0-9a-f]{8}-/, ""); // quita el prefijo de subida (fd2fadef-)
const DOCUMENTO = `IMPORT ${nombreArchivo}`;
const wb = XLSX.readFile(archivo);
const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const plan = prepararSaldos(filas, sede || SEDE_POR_DEFECTO);
const ahora = new Date().toISOString();

// ---------------------------------------------------------------- LOG
const r = plan.resumen;
const log = [
  `IMPORTACIÓN DE SALDOS DE ALMACÉN · ${nombreArchivo} · ${ahora}`,
  `Documento kardex: ${DOCUMENTO}`,
  `Filas leídas: ${r.filas} · Productos: ${r.productos} · Con stock: ${r.conStock} · En 0: ${r.enCero} · Avisos: ${r.avisos} · Errores: ${r.errores}`,
  `Unidades: ${Object.entries(r.unidades).map(([u, n]) => `${u} ${n}`).join(" · ")}`,
  `Sedes: ${[...new Set(plan.productos.map((p) => p.sede))].join(", ")}`,
  `Total unidades en stock: ${plan.productos.reduce((a, p) => a + p.cantidad, 0)}`,
  "",
  "FILA\tNIVEL\tPRODUCTO\tDETALLE",
  ...plan.log.map((l) => `${l.fila}\t${l.nivel}\t${l.producto}\t${l.mensaje}`),
];
const dirLog = path.join(RAIZ, "scripts", "logs");
fs.mkdirSync(dirLog, { recursive: true });
const archivoLog = path.join(dirLog, `import_stock_repuestos_${nombreArchivo.replace(/\.[^.]+$/, "")}.log`);
fs.writeFileSync(archivoLog, log.join("\n") + "\n");

// ---------------------------------------------------------------- SQL
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const valores = plan.productos.map((p) => `    (${q(p.sede)}, ${q(p.nombre)}, ${q(p.unidad)}, ${p.cantidad}, ${p.fila})`).join(",\n");
const sql = `-- =====================================================================
-- Saldos de almacén: ${nombreArchivo} (${r.productos} productos) — generado por scripts/import_stock_repuestos.js
-- Pegar en Supabase → SQL Editor → Run. Se puede ejecutar varias veces: si ya se importó, no hace nada.
-- Producto existente en la sede (mismo nombre y unidad) -> SUMA la cantidad y conserva su costo.
-- Producto nuevo -> costo 0 ("Sin valorizar"). Kardex: SALDO_INICIAL con documento ${q(DOCUMENTO)}.
-- =====================================================================
do $$
declare
  r record;
  ex record;
  sid text;
  saldo numeric;
  ahora text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  nuevos int := 0;
  sumados int := 0;
begin
  if exists (select 1 from public.almacen where tipo = 'KARDEX' and data ->> 'tipo_movimiento' = 'SALDO_INICIAL' and data ->> 'documento' = ${q(DOCUMENTO)}) then
    raise notice 'El archivo ya fue importado (${DOCUMENTO}): no se hace nada.';
    return;
  end if;
  for r in select * from (values
${valores}
  ) as v(sede, nombre, unidad, cantidad, fila) loop
    select id::text as id, data into ex from public.almacen
     where tipo = 'stock' and data ->> 'sede' = r.sede and upper(regexp_replace(btrim(data ->> 'nombre'), '\\s+', ' ', 'g')) = r.nombre and data ->> 'unidad' = r.unidad
     limit 1;
    if found then
      sid := ex.id;
      saldo := coalesce((ex.data ->> 'cantidad')::numeric, 0) + r.cantidad;
      update public.almacen set data = data || jsonb_build_object('cantidad', saldo, 'actualizado', ahora) where tipo = 'stock' and id::text = sid;
      sumados := sumados + 1;
    else
      sid := 'REP-' || substr(md5(r.sede || '|' || r.nombre || '|' || r.unidad), 1, 16);
      saldo := r.cantidad;
      insert into public.almacen (tipo, id, data)
      values ('stock', sid, jsonb_build_object('id', sid, 'sede', r.sede, 'nombre', r.nombre, 'unidad', r.unidad, 'cantidad', r.cantidad, 'costoUnit', 0, 'actualizado', ahora))
      on conflict (tipo, id) do update set data = excluded.data;
      nuevos := nuevos + 1;
    end if;
    insert into public.almacen (tipo, id, data)
    values ('KARDEX', gen_random_uuid()::text, jsonb_build_object(
      'fecha', ahora, 'sede', r.sede, 'stock_id', sid, 'producto', r.nombre, 'unidad', r.unidad, 'tipo_movimiento', 'SALDO_INICIAL',
      'documento', ${q(DOCUMENTO)}, 'cantidad', r.cantidad, 'saldo', saldo, 'usuario', 'importacion'));
  end loop;
  raise notice 'Saldos importados: % nuevos · % sumados a productos existentes', nuevos, sumados;
end $$;

-- Verificación
select data ->> 'sede' as sede, count(*) as productos, sum((data ->> 'cantidad')::numeric) as unidades
  from public.almacen where tipo = 'stock' group by 1 order by 1;
`;
const archivoSql = path.join(RAIZ, "supabase", "import_stock_repuestos.sql");
fs.writeFileSync(archivoSql, sql);

console.log(log.slice(0, 6).join("\n"));
console.log(`\nLog: ${path.relative(RAIZ, archivoLog)}\nSQL: ${path.relative(RAIZ, archivoSql)}`);

// ---------------------------------------------------------------- Carga directa (--ejecutar)
if (!ejecutar) {
  console.log("\nPara cargar: pegue el SQL en Supabase → SQL Editor, o vuelva a ejecutar con --ejecutar (requiere SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(0);
}

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (use: node --env-file=.env.local …).");
    process.exit(1);
  }
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const errores = [];
  const { data: ya } = await sb.from("almacen").select("id").eq("tipo", "KARDEX").eq("data->>tipo_movimiento", "SALDO_INICIAL").eq("data->>documento", DOCUMENTO).limit(1);
  if (ya && ya.length) {
    console.log(`\nEl archivo ya fue importado (${DOCUMENTO}): no se hace nada.`);
    return;
  }
  const { data: existentes, error: eLeer } = await sb.from("almacen").select("id, data").eq("tipo", "stock");
  if (eLeer) throw eLeer;
  const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
  const porClave = new Map((existentes || []).map((f) => [`${f.data.sede}|${norm(f.data.nombre)}|${f.data.unidad}`, f]));
  const stock = [];
  const kardex = [];
  let nuevos = 0;
  let sumados = 0;
  for (const p of plan.productos) {
    const ex = porClave.get(`${p.sede}|${p.nombre}|${p.unidad}`);
    const id = ex ? String(ex.id) : "REP-" + crypto.createHash("md5").update(`${p.sede}|${p.nombre}|${p.unidad}`).digest("hex").slice(0, 16);
    const saldo = (ex ? Number(ex.data.cantidad) || 0 : 0) + p.cantidad;
    const data = ex ? { ...ex.data, id, cantidad: saldo, actualizado: ahora } : { id, sede: p.sede, nombre: p.nombre, unidad: p.unidad, cantidad: p.cantidad, costoUnit: 0, actualizado: ahora };
    ex ? sumados++ : nuevos++;
    stock.push({ tipo: "stock", id, data });
    kardex.push({ tipo: "KARDEX", id: crypto.randomUUID(), data: { fecha: ahora, sede: p.sede, stock_id: id, producto: p.nombre, unidad: p.unidad, tipo_movimiento: "SALDO_INICIAL", documento: DOCUMENTO, cantidad: p.cantidad, saldo, usuario: "importacion" } });
  }
  for (const [tabla, filas_] of [["stock", stock], ["kardex", kardex]]) {
    for (let i = 0; i < filas_.length; i += 100) {
      const lote = filas_.slice(i, i + 100);
      const { error } = await sb.from("almacen").upsert(lote, { onConflict: "tipo,id" });
      if (error) errores.push(`${tabla} lote ${i / 100 + 1}: ${error.message}`);
    }
  }
  const fin = [`\nCARGA EN SUPABASE (${new Date().toISOString()}): ${nuevos} nuevos · ${sumados} sumados · ${errores.length} error(es)`, ...errores];
  fs.appendFileSync(archivoLog, fin.join("\n") + "\n");
  console.log(fin.join("\n"));
  if (errores.length) process.exit(1);
})().catch((e) => {
  fs.appendFileSync(archivoLog, `\nERROR: ${e.message}\n`);
  console.error("ERROR:", e.message);
  process.exit(1);
});
