import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { ejecutarAutomatizaciones, procesarMantenimientos, procesarPostVenta, procesarSeguimientos } from "@/lib/erp-comercial/automations";
import { CONFIG_DEFAULTS } from "@/lib/erp-comercial/constants";

// POST { tipo?: "MANTENIMIENTO" | "SEGUIMIENTO" | "POSTVENTA" } -> ejecuta ahora
// Tambien puede llamarse desde un cron externo: curl -X POST https://TU_DOMINIO/api/automatizaciones
export const POST = handler(async (req: Request) => {
  const b = await req.json().catch(() => ({}));
  if (b.tipo === "MANTENIMIENTO") return procesarMantenimientos();
  if (b.tipo === "SEGUIMIENTO") return procesarSeguimientos();
  if (b.tipo === "POSTVENTA") return procesarPostVenta();
  return ejecutarAutomatizaciones();
});

// PUT { clave: valor, ... } -> guarda configuracion
export const PUT = handler(async (req: Request) => {
  const b: Record<string, unknown> = await req.json();
  for (const [clave, valor] of Object.entries(b)) {
    if (!(clave in CONFIG_DEFAULTS)) continue;
    await prisma.configuracion.upsert({ where: { clave }, create: { clave, valor: String(valor) }, update: { valor: String(valor) } });
  }
  return { ok: true };
});
