import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fichasTecnicas } from "../lib/erp-comercial/data/fichas";

const prisma = new PrismaClient();
const DIA = 86_400_000;
const hace = (d: number) => new Date(Date.now() - d * DIA);
const en = (d: number) => new Date(Date.now() + d * DIA);

function fotoSVG(nombre: string, color: string, icono: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <text x="400" y="290" font-size="160" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif">${icono}</text>
  <text x="400" y="420" font-size="40" fill="#fff" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${nombre}</text>
  <text x="400" y="470" font-size="22" fill="#cbd5e1" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">COMBOY · Foto referencial</text>
</svg>`;
}

async function main() {
  console.log("Limpiando base de datos...");
  await prisma.$transaction([
    prisma.material.deleteMany(), prisma.manoObra.deleteMany(), prisma.servicio.deleteMany(), prisma.costoProduccion.deleteMany(),
    prisma.campanaEnvio.deleteMany(), prisma.campana.deleteMany(), prisma.mensaje.deleteMany(),
    prisma.tarea.deleteMany(), prisma.mantenimiento.deleteMany(), prisma.ventaItem.deleteMany(), prisma.venta.deleteMany(),
    prisma.cotizacionItem.deleteMany(), prisma.cotizacion.deleteMany(), prisma.nota.deleteMany(),
    prisma.productoCompetencia.deleteMany(), prisma.competidor.deleteMany(), prisma.reglaPrecio.deleteMany(),
    prisma.cliente.deleteMany(), prisma.vendedor.deleteMany(), prisma.equipo.deleteMany(), prisma.plantilla.deleteMany(),
    prisma.configuracion.deleteMany(), prisma.automatizacionLog.deleteMany(),
  ]);

  // ---------- Fotos referenciales ----------
  const dir = path.join(process.cwd(), "public", "uploads", "seed");
  mkdirSync(dir, { recursive: true });

  // ---------- Vendedores ----------
  const v1 = await prisma.vendedor.create({ data: { nombre: "Carlos Mendoza", email: "carlos@comboy.pe", telefono: "51911111111" } });
  const v2 = await prisma.vendedor.create({ data: { nombre: "Lucia Paredes", email: "lucia@comboy.pe", telefono: "51922222222" } });

  // ---------- Equipos (fuente: fichas técnicas en src/data/fichas.ts) ----------
  const extra: Record<string, { codigo: string; nombre: string; precioLista: number; descripcion: string; color: string; icono: string }> = {
    "elc-4000-plus-400": { codigo: "ELC-4000-PLUS-400", nombre: "Remolcador Eléctrico ELC-4000 Plus 400", precioLista: 21500, descripcion: "", color: "#1d4ed8", icono: "🚜" },
    "coche-minero-z20": { codigo: "Z20", nombre: "Coche Minero Z20", precioLista: 3800, descripcion: "", color: "#b45309", icono: "⛏️" },
    "eco-mine-3500-pro-1": { codigo: "ECO-MINE-3500-PRO", nombre: "Remolcador ECO-MINE 3500 PRO V1", precioLista: 19000, descripcion: "Versión con Tracción 3x2 reforzada", color: "#0f766e", icono: "🚜" },
  };

  const equipos: Awaited<ReturnType<typeof prisma.equipo.create>>[] = [];
  for (const f of fichasTecnicas) {
    const e = extra[f.id];
    if (!e) continue;
    const file = `${e.codigo.toLowerCase()}.svg`;
    writeFileSync(path.join(dir, file), fotoSVG(e.nombre, e.color, e.icono));
    equipos.push(
      await prisma.equipo.create({
        data: {
          codigo: e.codigo, nombre: e.nombre, marca: "", categoria: f.categoria, descripcion: e.descripcion,
          fichaTecnica: JSON.stringify({ modelo: f.modelo, fichaPdf: f.pdf }), fotos: JSON.stringify([`/uploads/seed/${file}`]),
          stock: 0, costoBase: 0, precioLista: e.precioLista, intervaloMantenimientoMeses: 3,
        },
      }),
    );
  }
  const byCodigo = (c: string) => equipos.find((e) => e.codigo === c)!;
  const elc = byCodigo("ELC-4000-PLUS-400"), z20 = byCodigo("Z20"), eco = byCodigo("ECO-MINE-3500-PRO");

  // ---------- Reglas de precio (discriminacion 2do grado) ----------
  await prisma.reglaPrecio.createMany({
    data: [
      { tipo: "TIPO_CLIENTE", tipoCliente: "DISTRIBUIDOR", porcentaje: -22, descripcion: "Canal distribucion" },
      { tipo: "TIPO_CLIENTE", tipoCliente: "MAYORISTA", porcentaje: -15, descripcion: "Compra mayorista" },
      { tipo: "TIPO_CLIENTE", tipoCliente: "RETAIL", porcentaje: 0, descripcion: "Precio publico" },
      { tipo: "TIPO_CLIENTE", tipoCliente: "VIP", porcentaje: -10, descripcion: "Cliente estrategico" },
      { tipo: "TIPO_CLIENTE", tipoCliente: "DISTRIBUIDOR", equipoId: eco.id, porcentaje: -18, descripcion: "ECO-MINE: margen protegido" },
      { tipo: "REGION", region: "LIMA", porcentaje: 0, descripcion: "Base Lima" },
      { tipo: "REGION", region: "AREQUIPA", porcentaje: 3, descripcion: "Flete sur" },
      { tipo: "REGION", region: "NORTE", porcentaje: 4, descripcion: "Flete norte" },
      { tipo: "REGION", region: "SUR", porcentaje: 5, descripcion: "Flete sur extremo" },
      { tipo: "REGION", region: "SELVA", porcentaje: 8, descripcion: "Flete fluvial / aereo" },
      { tipo: "VOLUMEN", minCantidad: 1, maxCantidad: 4, porcentaje: 0, descripcion: "Unitario" },
      { tipo: "VOLUMEN", minCantidad: 5, maxCantidad: 9, porcentaje: -3, descripcion: "5 a 9 unidades" },
      { tipo: "VOLUMEN", minCantidad: 10, maxCantidad: 24, porcentaje: -6, descripcion: "10 a 24 unidades" },
      { tipo: "VOLUMEN", minCantidad: 25, maxCantidad: null, porcentaje: -10, descripcion: "25+ unidades" },
    ],
  });

  // ---------- Clientes ----------
  const c1 = await prisma.cliente.create({ data: { tipoDocumento: "RUC", documento: "20512345678", razonSocial: "Ferreteria El Constructor SAC", contacto: "Jorge Ramirez", telefono: "51987654321", email: "compras@elconstructor.pe", region: "LIMA", tipoCliente: "DISTRIBUIDOR", vendedorId: v1.id, limiteCredito: 50000, creditoUsado: 12000, diasCredito: 30, etapa: "NEGOCIADO", ultimoContacto: hace(2), proximoContacto: en(1), createdAt: hace(40) } });
  const c2 = await prisma.cliente.create({ data: { tipoDocumento: "RUC", documento: "20498765432", razonSocial: "Agroindustrias del Sur EIRL", contacto: "Maria Quispe", telefono: "51976543210", email: "mquispe@agrosur.pe", region: "AREQUIPA", tipoCliente: "MAYORISTA", vendedorId: v2.id, limiteCredito: 30000, diasCredito: 45, etapa: "GANADO", ultimoContacto: hace(3), fechaGanado: hace(3), createdAt: hace(60) } });
  const c3 = await prisma.cliente.create({ data: { tipoDocumento: "RUC", documento: "20601122334", razonSocial: "Constructora Norte Andina SA", contacto: "Luis Torres", telefono: "51965432109", email: "ltorres@norteandina.com", region: "NORTE", tipoCliente: "VIP", vendedorId: v1.id, limiteCredito: 120000, creditoUsado: 45000, diasCredito: 60, etapa: "COTIZADO", ultimoContacto: hace(5), proximoContacto: en(2), createdAt: hace(25) } });
  const c4 = await prisma.cliente.create({ data: { tipoDocumento: "DNI", documento: "45678912", razonSocial: "Taller Mecanico Rosa Huaman", contacto: "Rosa Huaman", telefono: "51954321098", email: "rosa.taller@gmail.com", region: "SUR", tipoCliente: "RETAIL", vendedorId: v2.id, etapa: "PROSPECTO", ultimoContacto: hace(12), createdAt: hace(15) } });
  const c5 = await prisma.cliente.create({ data: { tipoDocumento: "RUC", documento: "20455667788", razonSocial: "Maderera Amazonica SRL", contacto: "Pedro Sangama", telefono: "51943210987", email: "ventas@madereraamazonica.pe", region: "SELVA", tipoCliente: "MAYORISTA", vendedorId: v1.id, limiteCredito: 20000, diasCredito: 30, etapa: "POSTVENTA", ultimoContacto: hace(20), fechaGanado: hace(85), encuestaEnviada: true, createdAt: hace(150) } });

  await prisma.nota.createMany({
    data: [
      { clienteId: c1.id, texto: "Interesado en 4 remolcadores ELC-4000 Plus 400 para su red de clientes mineros. Pide 60 dias de credito.", createdAt: hace(6) },
      { clienteId: c1.id, texto: "Se negocio 22% de descuento por canal. Espera confirmacion de gerencia.", createdAt: hace(2) },
      { clienteId: c3.id, texto: "Proyecto minero en Cajamarca, requiere remolcadores ECO-MINE y coches mineros Z20.", createdAt: hace(5) },
      { clienteId: c4.id, texto: "Contacto por Facebook, pregunto por el coche minero Z20.", createdAt: hace(12) },
    ],
  });

  // ---------- Cotizaciones y ventas ----------
  let num = 1001;
  async function cotizar(clienteId: string, tipo: string, region: string, items: { e: (typeof equipos)[number]; q: number }[], estado: string, dias: number) {
    const reglas = await prisma.reglaPrecio.findMany();
    const { calcularPrecio } = await import("../lib/erp-comercial/pricing");
    const lines = items.map(({ e, q }) => {
      const r = calcularPrecio(e, reglas, { tipoCliente: tipo, region, cantidad: q });
      return { equipoId: e.id, cantidad: q, precioLista: e.precioLista, precioUnitario: r.precioUnitario, costoUnitario: e.costoBase, subtotal: r.subtotal };
    });
    const total = lines.reduce((s, l) => s + l.subtotal, 0);
    const costo = lines.reduce((s, l) => s + l.costoUnitario * l.cantidad, 0);
    return prisma.cotizacion.create({ data: { numero: num++, clienteId, estado, subtotal: total, total, costo, createdAt: hace(dias), items: { create: lines } }, include: { items: true } });
  }
  await cotizar(c1.id, "DISTRIBUIDOR", "LIMA", [{ e: elc, q: 4 }], "ENVIADA", 6);
  await cotizar(c3.id, "VIP", "NORTE", [{ e: eco, q: 2 }, { e: z20, q: 8 }], "ENVIADA", 5);
  const cv = await cotizar(c2.id, "MAYORISTA", "AREQUIPA", [{ e: z20, q: 12 }, { e: elc, q: 1 }], "ACEPTADA", 8);
  const cv2 = await cotizar(c5.id, "MAYORISTA", "SELVA", [{ e: eco, q: 1 }, { e: z20, q: 5 }], "ACEPTADA", 90);
  await cotizar(c4.id, "RETAIL", "SUR", [{ e: z20, q: 1 }], "BORRADOR", 1);

  async function vender(cot: Awaited<ReturnType<typeof cotizar>>, clienteId: string, dias: number) {
    const venta = await prisma.venta.create({
      data: {
        clienteId, cotizacionId: cot.id, total: cot.total, costo: cot.costo, fecha: hace(dias),
        items: { create: cot.items.map((i) => ({ equipoId: i.equipoId, cantidad: i.cantidad, precioUnitario: i.precioUnitario, costoUnitario: i.costoUnitario, intervaloMantenimientoMeses: equipos.find((e) => e.id === i.equipoId)!.intervaloMantenimientoMeses })) },
      },
      include: { items: true },
    });
    for (const it of venta.items) {
      for (let k = 1; k <= 4; k++) {
        const fechaProg = new Date(hace(dias).getTime());
        fechaProg.setMonth(fechaProg.getMonth() + it.intervaloMantenimientoMeses * k);
        await prisma.mantenimiento.create({
          data: { ventaItemId: it.id, clienteId, equipoId: it.equipoId, fechaProgramada: fechaProg, estado: fechaProg < hace(10) ? "COMPLETADO" : "PENDIENTE", completadoAt: fechaProg < hace(10) ? fechaProg : null },
        });
      }
    }
  }
  await vender(cv, c2.id, 3);
  await vender(cv2, c5.id, 85); // el mantenimiento de 3 meses vence en ~5 dias

  // ---------- Competencia ----------
  const k1 = await prisma.competidor.create({ data: { nombre: "Promart Pro / Truper", web: "https://www.truper.com", pais: "Mexico", fortalezas: "Precio agresivo\nRed de tiendas a nivel nacional\nMarca reconocida", debilidades: "Poco soporte tecnico\nRepuestos limitados en provincia\nGarantia corta" } });
  const k2 = await prisma.competidor.create({ data: { nombre: "Honda Power Equipment", web: "https://www.honda.com.pe", pais: "Japon", fortalezas: "Calidad premium\nDurabilidad comprobada\nValor de reventa", debilidades: "Precio 40-60% mayor\nPlazos de importacion largos" } });
  const k3 = await prisma.competidor.create({ data: { nombre: "Importadora China Generica", web: null, pais: "China", fortalezas: "Precio muy bajo\nDisponibilidad inmediata", debilidades: "Sin servicio post-venta\nCalidad irregular\nSin certificaciones" } });
  // Productos de competencia: pendientes de cargar para los equipos actuales (remolcadores y coche minero).
  void [k1, k2, k3];

  // ---------- Plantillas WhatsApp ----------
  await prisma.plantilla.createMany({
    data: [
      { nombre: "Bienvenida", categoria: "BIENVENIDA", contenido: "¡Hola {nombre}! 👋 Bienvenido a *COMBOY*. Soy {vendedor}, tu asesor comercial. Estoy aqui para ayudarte con remolcadores electricos, coches mineros y mas. ¿En que te puedo ayudar hoy?" },
      { nombre: "Cotizacion", categoria: "COTIZACION", contenido: "Hola {nombre}, te comparto la cotizacion solicitada para *{empresa}*:\n\n🔧 {equipo}\n💰 Precio: *{precio}* + IGV\n\nVigencia: 7 dias. Quedo atento a tus comentarios. — {vendedor}" },
      { nombre: "Oferta", categoria: "OFERTA", contenido: "🔥 *OFERTA ESPECIAL* para {empresa}\n\nHola {nombre}, tenemos un precio exclusivo para ti:\n\n✅ {equipo}\n💰 *{precio}* + IGV\n🚚 Envio a {region}\n\nStock limitado. ¡Responde este mensaje para separarlo!" },
      { nombre: "Post-venta", categoria: "POSTVENTA", contenido: "Hola {nombre} 😊 Gracias por confiar en COMBOY. ¿Como te va con tu {equipo}?\n\nCalificanos del 1 al 5 respondiendo a este mensaje:\n⭐ 1 - Malo\n⭐⭐⭐⭐⭐ 5 - Excelente\n\nTu opinion nos ayuda a mejorar." },
      { nombre: "Mantenimiento", categoria: "MANTENIMIENTO", contenido: "Hola {nombre}, tu {equipo} necesita mantenimiento 🛠️ (programado: {fecha}).\n\nUn mantenimiento a tiempo prolonga la vida util y protege tu garantia. ¿Agendamos la visita tecnica? — {vendedor}" },
      { nombre: "Seguimiento", categoria: "SEGUIMIENTO", contenido: "Hola {nombre}, soy {vendedor} de COMBOY. Queria saber si pudiste revisar nuestra propuesta para {empresa}. ¿Tienes alguna duda que pueda resolver?" },
    ],
  });

  // ---------- Conversaciones de ejemplo ----------
  await prisma.mensaje.createMany({
    data: [
      { clienteId: c1.id, direccion: "OUT", contenido: "Hola Jorge, te envio la cotizacion de los 4 remolcadores ELC-4000 Plus 400.", estado: "LEIDO", origen: "MANUAL", createdAt: hace(6) },
      { clienteId: c1.id, direccion: "IN", contenido: "Gracias Carlos. ¿Pueden mejorar el precio si pagamos al contado?", estado: "RECIBIDO", leido: true, origen: "WEBHOOK", createdAt: hace(5) },
      { clienteId: c1.id, direccion: "OUT", contenido: "Te puedo aplicar el descuento por volumen adicional. Lo confirmo con gerencia hoy.", estado: "ENTREGADO", origen: "MANUAL", createdAt: hace(2) },
      { clienteId: c1.id, direccion: "IN", contenido: "Perfecto, quedo atento 👍", estado: "RECIBIDO", leido: false, origen: "WEBHOOK", createdAt: hace(1) },
      { clienteId: c2.id, direccion: "OUT", contenido: "¡Maria, gracias por tu compra! Los coches mineros Z20 salen hoy a Arequipa 🚚", estado: "LEIDO", origen: "MANUAL", createdAt: hace(3) },
      { clienteId: c3.id, direccion: "IN", contenido: "Buenos dias, necesitamos ficha tecnica del remolcador ECO-MINE 3500 PRO", estado: "RECIBIDO", leido: false, origen: "WEBHOOK", createdAt: hace(0.2) },
    ],
  });

  await prisma.tarea.create({ data: { clienteId: c4.id, tipo: "SEGUIMIENTO", titulo: "Seguimiento: Taller Mecanico Rosa Huaman", descripcion: "Sin contacto hace mas de 7 dias (etapa PROSPECTO)", fechaVence: hace(1) } });

  console.log(`✅ Seed completado: ${equipos.length} equipos, 5 clientes, 3 competidores, 6 plantillas, 2 ventas`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
