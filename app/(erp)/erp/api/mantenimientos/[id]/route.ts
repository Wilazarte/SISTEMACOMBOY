import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { enviarWhatsApp } from "@/lib/erp-comercial/whatsapp";
import { fecha } from "@/lib/erp-comercial/utils";

// PATCH { accion: "completar" | "notificar" }
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { accion } = await req.json();
  const m = await prisma.mantenimiento.findUniqueOrThrow({ where: { id: params.id }, include: { cliente: { include: { vendedor: true } }, equipo: true } });
  if (accion === "completar") {
    await prisma.tarea.updateMany({ where: { refId: m.id }, data: { completada: true } });
    return prisma.mantenimiento.update({ where: { id: m.id }, data: { estado: "COMPLETADO", completadoAt: new Date() } });
  }
  if (accion === "notificar") {
    const plantilla = await prisma.plantilla.findFirst({ where: { categoria: "MANTENIMIENTO" } });
    const msg = await enviarWhatsApp({
      clienteId: m.clienteId, origen: "AUTOMATIZACION", plantilla,
      texto: plantilla ? undefined : `Hola ${m.cliente.contacto}, tu ${m.equipo.nombre} necesita mantenimiento`,
      vars: { nombre: m.cliente.contacto.split(" ")[0], empresa: m.cliente.razonSocial, equipo: m.equipo.nombre, fecha: fecha(m.fechaProgramada), vendedor: m.cliente.vendedor?.nombre },
    });
    if (msg.estado === "FALLIDO") throw new Error(msg.error || "No se pudo enviar");
    return prisma.mantenimiento.update({ where: { id: m.id }, data: { estado: "NOTIFICADO", notificadoAt: new Date() } });
  }
  throw new Error("Accion invalida");
});
