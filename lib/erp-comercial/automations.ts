// Motor de automatizaciones: mantenimiento, seguimiento de prospectos y post-venta
import { prisma } from "./prisma";
import { getConfig } from "./config";
import { enviarWhatsApp } from "./whatsapp";
import { addDays, fecha } from "./utils";

async function plantillaPorCategoria(categoria: string) {
  return prisma.plantilla.findFirst({ where: { categoria }, orderBy: { createdAt: "asc" } });
}

async function log(tipo: string, detalle: string) {
  await prisma.automatizacionLog.create({ data: { tipo, detalle } });
}

/** a) Mantenimiento: avisa los mantenimientos que vencen dentro de N dias */
export async function procesarMantenimientos() {
  const cfg = await getConfig();
  const limite = addDays(new Date(), Number(cfg.diasAvisoMantenimiento));
  const pendientes = await prisma.mantenimiento.findMany({
    where: { estado: "PENDIENTE", fechaProgramada: { lte: limite } },
    include: { cliente: { include: { vendedor: true } }, equipo: true },
  });
  const plantilla = await plantillaPorCategoria("MANTENIMIENTO");
  let enviados = 0;
  for (const m of pendientes) {
    const existe = await prisma.tarea.findFirst({ where: { refId: m.id, tipo: "MANTENIMIENTO" } });
    if (!existe) {
      await prisma.tarea.create({
        data: {
          clienteId: m.clienteId,
          tipo: "MANTENIMIENTO",
          refId: m.id,
          fechaVence: m.fechaProgramada,
          titulo: `Mantenimiento ${m.equipo.nombre}`,
          descripcion: `Programado para ${fecha(m.fechaProgramada)} - ${m.cliente.razonSocial}`,
        },
      });
    }
    if (cfg.autoEnviarMantenimiento === "true" && plantilla && m.cliente.optIn) {
      const msg = await enviarWhatsApp({
        clienteId: m.clienteId,
        origen: "AUTOMATIZACION",
        plantilla,
        vars: {
          nombre: m.cliente.contacto.split(" ")[0],
          empresa: m.cliente.razonSocial,
          equipo: m.equipo.nombre,
          fecha: fecha(m.fechaProgramada),
          vendedor: m.cliente.vendedor?.nombre,
        },
      });
      if (msg.estado !== "FALLIDO") {
        await prisma.mantenimiento.update({ where: { id: m.id }, data: { estado: "NOTIFICADO", notificadoAt: new Date() } });
        enviados++;
      }
    }
  }
  if (pendientes.length) await log("MANTENIMIENTO", `${pendientes.length} mantenimientos por vencer, ${enviados} WhatsApp enviados`);
  return { revisados: pendientes.length, enviados };
}

/** b) Seguimiento: prospectos sin contacto hace X dias -> tarea/alerta (+ WhatsApp opcional) */
export async function procesarSeguimientos() {
  const cfg = await getConfig();
  const dias = Number(cfg.diasSinContactoProspecto);
  const corte = addDays(new Date(), -dias);
  const clientes = await prisma.cliente.findMany({
    where: {
      etapa: { in: ["PROSPECTO", "COTIZADO", "NEGOCIADO"] },
      OR: [{ ultimoContacto: null, createdAt: { lte: corte } }, { ultimoContacto: { lte: corte } }],
    },
    include: { vendedor: true },
  });
  const plantilla = await plantillaPorCategoria("SEGUIMIENTO");
  let tareas = 0;
  let enviados = 0;
  for (const c of clientes) {
    const abierta = await prisma.tarea.findFirst({ where: { clienteId: c.id, tipo: "SEGUIMIENTO", completada: false } });
    if (abierta) continue;
    await prisma.tarea.create({
      data: {
        clienteId: c.id,
        tipo: "SEGUIMIENTO",
        fechaVence: new Date(),
        titulo: `Seguimiento: ${c.razonSocial}`,
        descripcion: `Sin contacto hace mas de ${dias} dias (etapa ${c.etapa})`,
      },
    });
    tareas++;
    if (cfg.autoEnviarSeguimiento === "true" && plantilla && c.optIn) {
      const msg = await enviarWhatsApp({
        clienteId: c.id,
        origen: "AUTOMATIZACION",
        plantilla,
        vars: { nombre: c.contacto.split(" ")[0], empresa: c.razonSocial, vendedor: c.vendedor?.nombre },
      });
      if (msg.estado !== "FALLIDO") enviados++;
    }
  }
  if (tareas) await log("SEGUIMIENTO", `${tareas} alertas de seguimiento creadas, ${enviados} WhatsApp enviados`);
  return { revisados: clientes.length, tareas, enviados };
}

/** c) Post-venta: N dias despues de GANADO envia encuesta de satisfaccion */
export async function procesarPostVenta() {
  const cfg = await getConfig();
  const corte = addDays(new Date(), -Number(cfg.diasPostVenta));
  const clientes = await prisma.cliente.findMany({
    where: { etapa: "GANADO", encuestaEnviada: false, fechaGanado: { lte: corte } },
    include: {
      vendedor: true,
      ventas: { include: { items: { include: { equipo: true } } }, orderBy: { fecha: "desc" }, take: 1 },
    },
  });
  const plantilla = await plantillaPorCategoria("POSTVENTA");
  let enviados = 0;
  for (const c of clientes) {
    if (cfg.autoEnviarPostVenta !== "true" || !plantilla || !c.optIn) {
      await prisma.tarea.create({
        data: { clienteId: c.id, tipo: "POSTVENTA", fechaVence: new Date(), titulo: `Encuesta post-venta: ${c.razonSocial}` },
      });
    } else {
      const equipo = c.ventas[0]?.items[0]?.equipo.nombre ?? "equipo";
      const msg = await enviarWhatsApp({
        clienteId: c.id,
        origen: "AUTOMATIZACION",
        plantilla,
        vars: { nombre: c.contacto.split(" ")[0], empresa: c.razonSocial, equipo, vendedor: c.vendedor?.nombre },
      });
      if (msg.estado === "FALLIDO") continue;
      enviados++;
    }
    await prisma.cliente.update({ where: { id: c.id }, data: { encuestaEnviada: true, etapa: "POSTVENTA" } });
  }
  if (clientes.length) await log("POSTVENTA", `${clientes.length} clientes en post-venta, ${enviados} encuestas enviadas`);
  return { revisados: clientes.length, enviados };
}

export async function ejecutarAutomatizaciones() {
  const mantenimiento = await procesarMantenimientos();
  const seguimiento = await procesarSeguimientos();
  const postventa = await procesarPostVenta();
  return { mantenimiento, seguimiento, postventa, ejecutadoEn: new Date().toISOString() };
}
