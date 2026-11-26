// Limpia DATABASE_URL de errores tipicos al pegarla en Vercel/Neon:
// comillas, espacios, prefijo "DATABASE_URL=" o el snippet "psql 'postgresql://...'".
export function limpiarDatabaseUrl(raw) {
  let u = (raw ?? "").trim();
  u = u.replace(/^DATABASE_URL\s*=\s*/i, "");
  u = u.replace(/^psql\s+/i, "");
  u = u.replace(/^['"]+|['"]+$/g, "").trim();
  return u;
}
