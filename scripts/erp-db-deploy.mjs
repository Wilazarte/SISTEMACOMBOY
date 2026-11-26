// Base del ERP Comercial (Prisma + PostgreSQL/Neon): valida DATABASE_URL, genera Prisma Client y aplica migraciones.
// Uso: `npm run db:deploy`. Antes era scripts/vercel-build.mjs de COMBOY-ERP; aquí no compila Next
// (el build de SISTEMACOMBOY sigue siendo `next build` y no necesita la base).
import { execSync } from "node:child_process";
import { limpiarDatabaseUrl } from "../lib/erp-comercial/db-url.mjs";

const url = limpiarDatabaseUrl(process.env.DATABASE_URL);
if (!/^postgres(ql)?:\/\//.test(url)) {
  const muestra = url ? `"${url.slice(0, 15)}..."` : "(vacia)";
  console.error(
    `\n[erp-db-deploy] ERROR: DATABASE_URL no es PostgreSQL. Valor recibido empieza con ${muestra}.\n` +
      "Pon el valor exacto de Neon, sin comillas:\n" +
      "postgresql://USUARIO:PASSWORD@HOST/neondb?sslmode=require\n"
  );
  process.exit(1);
}
console.log(`[erp-db-deploy] DATABASE_URL OK -> host ${new URL(url).host}`);

const env = { ...process.env, DATABASE_URL: url };
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx prisma generate");
run("npx prisma migrate deploy");
