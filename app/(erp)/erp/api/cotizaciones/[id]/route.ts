import { prisma } from "@/lib/erp-comercial/prisma";
import { handler, type Ctx } from "@/lib/erp-comercial/api";
import { convertirCotizacionEnVenta } from "@/lib/erp-comercial/ventas";
import { enviarWhatsApp } from "@/lib/erp-comercial/whatsapp";
import { generarFichaPDF } from "@/lib/erp-comercial/pdf";
import { soles } from "@/lib/erp-comercial/utils";
import { renderPlantilla } from "@/lib/erp-comercial/templates";

// PATCH { accion: "ganar" | "rechazar" | "enviar" }
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { accion } = await req.json();
  const cot = await prisma.cotizacion.findUniqueOrThrow({
    where: { id: params.id },
    include: { cliente: { include: { vendedor: true } }, items: { include: { equipo: true } } },
  });
  if (accion === "ganar") return convertirCotizacionEnVenta(cot.id);
  if (accion === "rechazar") {
    await prisma.cliente.update({ where: { id: cot.clienteId }, data: { etapa: "PERDIDO" } });
    return prisma.cotizacion.update({ where: { id: cot.id }, data: { estado: "RECHAZADA" } });
  }
  if (accion === "enviar") {
    const plantilla = await prisma.plantilla.findFirst({ where: { categoria: "COTIZACION" } });
    const detalle = cot.items.map((i) => `${i.cantidad} x ${i.equipo.nombre} (${soles(i.precioUnitario)} c/u)`).join("\n🔧 ");
    const vars = {
      nombre: cot.cliente.contacto.split(" ")[0], empresa: cot.cliente.razonSocial, equipo: detalle,
      precio: `${soles(cot.total)} (Cot. N° ${cot.numero})`, vendedor: cot.cliente.vendedor?.nombre ?? "COMBOY",
    };
    const texto = plantilla ? renderPlantilla(plantilla.contenido, vars) : `Cotizacion N° ${cot.numero}: ${soles(cot.total)}`;
    const msg = await enviarWhatsApp({ clienteId: cot.clienteId, texto, origen: "MANUAL" });
    for (const it of cot.items) {
      const buffer = await generarFichaPDF(it.equipo, { precio: it.precioUnitario });
      await enviarWhatsApp({
        clienteId: cot.clienteId, origen: "MANUAL",
        media: { tipo: "document", url: `/erp/api/equipos/${it.equipoId}/pdf?precio=${it.precioUnitario}`, buffer, mime: "application/pdf", filename: `Ficha-${it.equipo.codigo}.pdf` },
      });
    }
    if (msg.estado === "FALLIDO") throw new Error(msg.error || "No se pudo enviar");
    await prisma.cliente.update({ where: { id: cot.clienteId }, data: { etapa: ["PROSPECTO"].includes(cot.cliente.etapa) ? "COTIZADO" : undefined } });
    return prisma.cotizacion.update({ where: { id: cot.id }, data: { estado: cot.estado === "BORRADOR" ? "ENVIADA" : cot.estado } });
  }
  throw new Error("Accion invalida");
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => prisma.cotizacion.delete({ where: { id: params.id } }));
