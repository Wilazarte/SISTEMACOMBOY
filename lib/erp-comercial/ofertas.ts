// Envio de ofertas: texto con precio discriminado + foto + PDF ficha + video del equipo
import type { Plantilla } from "@prisma/client";
import { prisma } from "./prisma";
import { calcularPrecio } from "./pricing";
import { renderPlantilla } from "./templates";
import { enviarWhatsApp, waConfigurado } from "./whatsapp";
import { generarFichaPDF } from "./pdf";
import { LABEL_REGION } from "./constants";
import { fecha, parseJSON, soles } from "./utils";

export interface OfertaOpts {
  clienteId: string;
  equipoId?: string | null;
  cantidad?: number;
  plantilla?: Plantilla | null;
  texto?: string; // texto libre si no hay plantilla (acepta variables)
  adjuntarFoto?: boolean;
  adjuntarPdf?: boolean;
  adjuntarVideo?: boolean;
  origen?: "MANUAL" | "OFERTA" | "CAMPANA" | "AUTOMATIZACION";
}

export async function enviarOferta(o: OfertaOpts) {
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: o.clienteId }, include: { vendedor: true } });
  const equipo = o.equipoId ? await prisma.equipo.findUnique({ where: { id: o.equipoId } }) : null;
  let precioUnitario: number | undefined;
  if (equipo) {
    const reglas = await prisma.reglaPrecio.findMany();
    precioUnitario = calcularPrecio(equipo, reglas, { tipoCliente: cliente.tipoCliente, region: cliente.region, cantidad: o.cantidad || 1 }).precioUnitario;
  }
  const vars = {
    nombre: cliente.contacto.split(" ")[0],
    empresa: cliente.razonSocial,
    region: LABEL_REGION[cliente.region] ?? cliente.region,
    vendedor: cliente.vendedor?.nombre ?? "tu asesor COMBOY",
    fecha: fecha(new Date()),
    equipo: equipo?.nombre,
    precio: precioUnitario !== undefined ? soles(precioUnitario) : undefined,
  };
  const texto = renderPlantilla(o.plantilla?.contenido ?? o.texto ?? "", vars);
  const origen = o.origen ?? "OFERTA";
  const mensajes = [];

  // 1) Foto (WhatsApp no acepta SVG: en modo real se omiten las fotos referenciales SVG)
  if (equipo && o.adjuntarFoto) {
    const fotos = parseJSON<string[]>(equipo.fotos, []);
    const foto = fotos.find((f) => !waConfigurado() || !f.toLowerCase().endsWith(".svg"));
    if (foto) mensajes.push(await enviarWhatsApp({ clienteId: cliente.id, origen, media: { tipo: "image", url: foto }, texto: equipo.nombre }));
  }
  // 2) Texto principal
  if (texto) mensajes.push(await enviarWhatsApp({ clienteId: cliente.id, origen, texto, plantilla: o.plantilla ?? null, vars }));
  // 3) PDF ficha tecnica con precio personalizado
  if (equipo && o.adjuntarPdf) {
    const buffer = await generarFichaPDF(equipo, { precio: precioUnitario });
    const filename = `Ficha-${equipo.codigo}.pdf`;
    mensajes.push(
      await enviarWhatsApp({
        clienteId: cliente.id, origen,
        media: { tipo: "document", url: `/erp/api/equipos/${equipo.id}/pdf?precio=${precioUnitario ?? ""}`, buffer, mime: "application/pdf", filename },
        texto: `Ficha técnica ${equipo.codigo}`,
      }),
    );
  }
  // 4) Video
  if (equipo && o.adjuntarVideo && equipo.videoUrl) {
    mensajes.push(await enviarWhatsApp({ clienteId: cliente.id, origen, media: { tipo: "video", url: equipo.videoUrl }, texto: `Video: ${equipo.nombre}` }));
  }

  const fallido = mensajes.find((m) => m.estado === "FALLIDO");
  return {
    ok: !fallido,
    estado: fallido ? "FALLIDO" : mensajes[0]?.estado ?? "SIMULADO",
    error: fallido?.error,
    mensajes,
    principal: mensajes.find((m) => m.tipo === "text" || m.tipo === "template") ?? mensajes[0],
    precioUnitario,
  };
}
