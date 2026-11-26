import { prisma } from "@/lib/erp-comercial/prisma";
import { handler } from "@/lib/erp-comercial/api";
import { whereFiltro } from "@/lib/erp-comercial/campanas";

// POST { nombre, plantillaId?, mensaje, equipoId?, adjuntarFoto, adjuntarPdf, adjuntarVideo, regiones[], tipos[], etapas[], preview? }
export const POST = handler(async (req: Request) => {
  const b = await req.json();
  const where = whereFiltro({ regiones: b.regiones, tipos: b.tipos, etapas: b.etapas });
  const destinatarios = await prisma.cliente.findMany({ where, select: { id: true, razonSocial: true, contacto: true, telefono: true, region: true, tipoCliente: true } });
  if (b.preview) return { total: destinatarios.length, destinatarios };
  if (!b.nombre?.trim()) throw new Error("Ponle un nombre a la campaña");
  if (!b.mensaje?.trim()) throw new Error("El mensaje esta vacio");
  if (!destinatarios.length) throw new Error("No hay clientes que cumplan el filtro");
  return prisma.campana.create({
    data: {
      nombre: b.nombre,
      plantillaId: b.plantillaId || null,
      mensaje: b.mensaje,
      equipoId: b.equipoId || null,
      adjuntarFoto: Boolean(b.adjuntarFoto),
      adjuntarPdf: Boolean(b.adjuntarPdf),
      adjuntarVideo: Boolean(b.adjuntarVideo),
      filtroRegion: (b.regiones ?? []).join(","),
      filtroTipoCliente: (b.tipos ?? []).join(","),
      filtroEtapa: (b.etapas ?? []).join(","),
      envios: { create: destinatarios.map((d) => ({ clienteId: d.id })) },
    },
  });
});
