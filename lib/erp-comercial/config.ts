import { prisma } from "./prisma";
import { CONFIG_DEFAULTS } from "./constants";

export async function getConfig() {
  const rows = await prisma.configuracion.findMany();
  const cfg: Record<string, string> = { ...CONFIG_DEFAULTS };
  for (const r of rows) cfg[r.clave] = r.valor;
  return cfg;
}
