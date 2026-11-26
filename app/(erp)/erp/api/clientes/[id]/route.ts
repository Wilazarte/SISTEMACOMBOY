import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { ETAPAS } from "@/lib/erp-comercial/constants";
import { clienteData } from "@/lib/erp-comercial/validators";

export const PUT = handler(async (req: Request, { params }: Ctx) =>
  prisma.cliente.update({ where: { id: params.id }, data: clienteData(await req.json()) }),
);

// PATCH { etapa } (kanban) | { proximoContacto } | { contactado: true }
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const b = await req.json();
  const data: Record<string, unknown> = {};
  if (b.etapa) {
    if (!ETAPAS.includes(b.etapa)) throw new Error("Etapa invalida");
    data.etapa = b.etapa;
    if (b.etapa === "GANADO") {
      data.fechaGanado = new Date();
      data.encuestaEnviada = false;
    }
  }
  if ("proximoContacto" in b) data.proximoContacto = b.proximoContacto ? new Date(b.proximoContacto) : null;
  if (b.contactado) data.ultimoContacto = new Date();
  return prisma.cliente.update({ where: { id: params.id }, data });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.cliente.delete({ where: { id: params.id } }));
