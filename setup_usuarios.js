#!/usr/bin/env node
// =====================================================================
// ERP COMBOY VID — Crea los 5 usuarios en Supabase Auth y sus perfiles.
//
// Uso (una sola vez, desde la raíz del proyecto):
//   1. Agregar en .env.local:  SUPABASE_SERVICE_ROLE_KEY=<clave>
//      (Supabase → Project Settings → API Keys → service_role / secret)
//   2. node setup_usuarios.js
//
// - Si un usuario ya existe, no se toca su contraseña.
// - Los perfiles se crean/actualizan igual que la sección 9 de
//   supabase_tables.sql (ejecutar ese SQL antes, para que existan las tablas).
// - Se puede ejecutar varias veces sin duplicar nada.
//
// ⚠ La service role key salta todas las políticas RLS: nunca la ponga con
//   prefijo NEXT_PUBLIC_, ni en el código, ni la suba a git.
// =====================================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const PASSWORD = process.env.SETUP_PASSWORD || "Comboy2024*";
const DOMINIO = "comboyvid.local";

// Mismos datos que la sección 9 de supabase_tables.sql
const PERFILES = [
  { usuario: "creador", rol: "creador", nombre: "Creador (administrador)", modulos: ["*"], solo_lectura: false },
  { usuario: "tesoreria", rol: "tesoreria", nombre: "Tesorería / Compras", modulos: ["/dashboard/compras", "/dashboard/tesoreria"], solo_lectura: false },
  { usuario: "almacen", rol: "almacen", nombre: "Almacén", modulos: ["/dashboard/almacen"], solo_lectura: false },
  { usuario: "planilla", rol: "planilla", nombre: "Planilla", modulos: ["/dashboard/planilla"], solo_lectura: false },
  { usuario: "gerencia", rol: "gerencia", nombre: "Gerencia (solo lectura)", modulos: ["*"], solo_lectura: true },
];

/** Lee .env.local / .env sin dependencias (las variables ya definidas en el sistema tienen prioridad). */
function cargarEnv() {
  for (const archivo of [".env.local", ".env"]) {
    const ruta = path.join(__dirname, archivo);
    if (!fs.existsSync(ruta)) continue;
    for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linea);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

function salir(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Todos los usuarios de Auth (paginado). */
async function listarUsuarios(sb) {
  const todos = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    todos.push(...data.users);
    if (data.users.length < 1000) return todos;
  }
}

async function main() {
  cargarEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) salir("Falta NEXT_PUBLIC_SUPABASE_URL (copie .env.example como .env.local).");
  if (!key) salir("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (Supabase → Project Settings → API Keys → service_role / secret).");
  if (key.startsWith("sb_publishable_")) salir("SUPABASE_SERVICE_ROLE_KEY tiene la publishable key: use la service_role / secret key.");

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log(`Supabase: ${url}\n\n1) Usuarios de Auth`);
  let existentes;
  try {
    existentes = await listarUsuarios(sb);
  } catch (e) {
    salir(`No se pudo listar usuarios (¿la clave es la service_role / secret?): ${e.message}`);
  }
  const porEmail = new Map(existentes.map((u) => [String(u.email).toLowerCase(), u]));

  const ids = {};
  let creados = 0;
  for (const p of PERFILES) {
    const email = `${p.usuario}@${DOMINIO}`;
    const previo = porEmail.get(email);
    if (previo) {
      ids[p.usuario] = previo.id;
      console.log(`   = ${email} ya existe (no se cambia su contraseña)`);
      continue;
    }
    const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) salir(`No se pudo crear ${email}: ${error.message}`);
    ids[p.usuario] = data.user.id;
    creados++;
    console.log(`   + ${email} creado`);
  }

  console.log("\n2) Perfiles (public.perfiles)");
  const filas = PERFILES.map((p) => ({ id: ids[p.usuario], ...p }));
  const { error } = await sb.from("perfiles").upsert(filas, { onConflict: "id" });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST204" || /schema cache|does not exist/i.test(error.message))
      salir(`La tabla perfiles no existe o está incompleta: ejecute supabase_tables.sql en el SQL Editor y vuelva a correr este script.\n  (${error.message})`);
    salir(`No se pudieron guardar los perfiles: ${error.message}`);
  }
  PERFILES.forEach((p) => console.log(`   ✓ ${p.usuario.padEnd(9)} ${p.rol.padEnd(9)} ${p.modulos.join(", ")}${p.solo_lectura ? " (solo lectura)" : ""}`));

  console.log(`\n✔ Listo: ${creados} usuario(s) nuevo(s), ${PERFILES.length} perfiles al día.`);
  if (creados > 0) {
    console.log(`  Contraseña inicial de los usuarios nuevos: ${PASSWORD}`);
    console.log("  ⚠ Es la misma para todos: cámbiela en Supabase → Authentication → Users antes de usar el ERP en producción.");
  }
}

main().catch((e) => salir(e.message || String(e)));
