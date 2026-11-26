import { normalizarTelefono } from "./utils";
import { ETAPAS, REGIONES, TIPOS_CLIENTE } from "./constants";

type B = Record<string, unknown>;

export function equipoData(b: B) {
  if (!b.codigo || !b.nombre) throw new Error("Codigo y nombre son obligatorios");
  return {
    codigo: String(b.codigo).trim(),
    nombre: String(b.nombre).trim(),
    marca: String(b.marca ?? ""),
    categoria: String(b.categoria ?? ""),
    descripcion: String(b.descripcion ?? ""),
    fichaTecnica: typeof b.fichaTecnica === "string" ? b.fichaTecnica : JSON.stringify(b.fichaTecnica ?? {}),
    fotos: typeof b.fotos === "string" ? b.fotos : JSON.stringify(b.fotos ?? []),
    videoUrl: b.videoUrl ? String(b.videoUrl) : null,
    stock: Number(b.stock ?? 0),
    costoBase: Number(b.costoBase ?? 0),
    precioLista: Number(b.precioLista ?? 0),
    intervaloMantenimientoMeses: Number(b.intervaloMantenimientoMeses ?? 3),
  };
}

export function reglaData(b: B) {
  const tipo = String(b.tipo);
  if (!["TIPO_CLIENTE", "REGION", "VOLUMEN"].includes(tipo)) throw new Error("Tipo de regla invalido");
  const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
  return {
    tipo,
    equipoId: b.equipoId ? String(b.equipoId) : null,
    tipoCliente: tipo === "TIPO_CLIENTE" ? String(b.tipoCliente) : null,
    region: tipo === "REGION" ? String(b.region) : null,
    minCantidad: tipo === "VOLUMEN" ? num(b.minCantidad) ?? 1 : null,
    maxCantidad: tipo === "VOLUMEN" ? num(b.maxCantidad) : null,
    porcentaje: Number(b.porcentaje ?? 0),
    descripcion: b.descripcion ? String(b.descripcion) : null,
  };
}

export function clienteData(b: B) {
  const region = String(b.region);
  const tipoCliente = String(b.tipoCliente);
  if (!REGIONES.includes(region as never)) throw new Error("Region invalida");
  if (!TIPOS_CLIENTE.includes(tipoCliente as never)) throw new Error("Tipo de cliente invalido");
  const doc = String(b.documento ?? "").trim();
  const tipoDocumento = String(b.tipoDocumento ?? "RUC");
  if (tipoDocumento === "RUC" && !/^\d{11}$/.test(doc)) throw new Error("El RUC debe tener 11 digitos");
  if (tipoDocumento === "DNI" && !/^\d{8}$/.test(doc)) throw new Error("El DNI debe tener 8 digitos");
  if (!b.razonSocial) throw new Error("La razon social es obligatoria");
  const telefono = normalizarTelefono(String(b.telefono ?? ""));
  if (telefono.length < 10) throw new Error("Telefono WhatsApp invalido (ej: 51987654321)");
  const etapa = b.etapa ? String(b.etapa) : undefined;
  if (etapa && !ETAPAS.includes(etapa as never)) throw new Error("Etapa invalida");
  return {
    tipoDocumento,
    documento: doc,
    razonSocial: String(b.razonSocial).trim(),
    contacto: String(b.contacto ?? "").trim(),
    telefono,
    email: b.email ? String(b.email) : null,
    direccion: b.direccion ? String(b.direccion) : null,
    region,
    tipoCliente,
    vendedorId: b.vendedorId ? String(b.vendedorId) : null,
    limiteCredito: Number(b.limiteCredito ?? 0),
    creditoUsado: Number(b.creditoUsado ?? 0),
    diasCredito: Number(b.diasCredito ?? 0),
    proximoContacto: b.proximoContacto ? new Date(String(b.proximoContacto)) : null,
    optIn: b.optIn === undefined ? true : Boolean(b.optIn),
    ...(etapa ? { etapa } : {}),
  };
}

export function competidorData(b: B) {
  if (!b.nombre) throw new Error("El nombre es obligatorio");
  return {
    nombre: String(b.nombre).trim(),
    web: b.web ? String(b.web) : null,
    pais: b.pais ? String(b.pais) : null,
    fortalezas: String(b.fortalezas ?? ""),
    debilidades: String(b.debilidades ?? ""),
    notas: b.notas ? String(b.notas) : null,
  };
}
