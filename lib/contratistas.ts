// Planilla › Contratistas / concesiones: servicios externos dados a terceros
// (asesorías, trámites, construcción, implementación de equipos/sistemas, servicios básicos...).
// Se guardan en la tabla planilla (tipo 'contratista') con la misma caché + Realtime del ERP.

import { ErpError, KEYS, escribir, hoy, leer, r2, rucValido, uid } from "./storage";
import type { ComprobanteContratista, ConcesionContratista, PagoContratista, TipoServicioContratista } from "./types";

export const TIPOS_SERVICIO: Record<TipoServicioContratista, string> = {
  ASESORIA: "Asesoría",
  GESTION_TRAMITE: "Gestión de trámite",
  CONSTRUCCION: "Construcción",
  IMPLEMENTACION_EQUIPO: "Implementación de equipos",
  SISTEMA: "Sistema / software",
  SERVICIO_BASICO: "Servicio básico",
  OTRO: "Otro",
};

export const TIPOS_COMPROBANTE: Record<ComprobanteContratista["tipo"], string> = {
  RH: "Recibo por honorarios",
  FACTURA: "Factura",
  BOLETA: "Boleta",
  OTRO: "Otro",
};

export const MEDIOS_PAGO_CONTRATISTA = ["TRANSFERENCIA", "EFECTIVO", "DEPOSITO", "YAPE", "PLIN", "CHEQUE"];

export const getConcesiones = () => leer<ConcesionContratista[]>(KEYS.CONTRATISTAS, []);

export const concesionVacia = (sede = ""): ConcesionContratista => ({
  id: "",
  razonSocial: "",
  ruc: "",
  representante: "",
  celular: "",
  tipoServicio: "ASESORIA",
  descripcion: "",
  sede,
  fecha_inicio: hoy(),
  fecha_fin: "",
  monto_total: 0,
  adelanto: 0,
  saldo: 0,
  estado: "ACTIVO",
  comprobantes: [],
  pagos: [],
  observaciones: "",
});

/** Pagado = adelanto + pagos registrados. */
export const pagado = (c: ConcesionContratista): number => r2((c.adelanto || 0) + (c.pagos ?? []).reduce((s, p) => s + p.monto, 0));
export const calcularSaldo = (c: ConcesionContratista): number => r2(Math.max(0, (c.monto_total || 0) - pagado(c)));
export const facturado = (c: ConcesionContratista): number => r2((c.comprobantes ?? []).reduce((s, x) => s + x.monto, 0));

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function actualizar(id: string, fn: (c: ConcesionContratista) => ConcesionContratista): ConcesionContratista {
  const lista = getConcesiones();
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) throw new ErpError("Concesión no encontrada.");
  const c = fn(lista[i]);
  lista[i] = { ...c, saldo: calcularSaldo(c) };
  escribir(KEYS.CONTRATISTAS, lista);
  return lista[i];
}

/** Registrar o editar (datos generales; los pagos y comprobantes tienen sus propias acciones). */
export function guardarConcesion(data: ConcesionContratista): ConcesionContratista {
  const razonSocial = data.razonSocial.trim().toUpperCase();
  const ruc = data.ruc.trim();
  const monto_total = r2(Number(data.monto_total));
  const adelanto = r2(Number(data.adelanto) || 0);
  if (!razonSocial) throw new ErpError("Ingrese la razón social o nombre del contratista.");
  if (ruc && !/^\d{11}$/.test(ruc) && !/^\d{8}$/.test(ruc)) throw new ErpError("RUC (11 dígitos) o DNI (8 dígitos) inválido.");
  if (ruc.length === 11 && !rucValido(ruc)) throw new ErpError("RUC inválido (dígito verificador).");
  if (!(data.tipoServicio in TIPOS_SERVICIO)) throw new ErpError("Seleccione el tipo de servicio.");
  if (!data.descripcion.trim()) throw new ErpError("Describa el servicio.");
  if (!FECHA.test(data.fecha_inicio)) throw new ErpError("Indique la fecha de inicio.");
  if (data.fecha_fin && (!FECHA.test(data.fecha_fin) || data.fecha_fin < data.fecha_inicio)) throw new ErpError("La fecha de fin debe ser posterior al inicio.");
  if (!(monto_total > 0)) throw new ErpError("El monto total debe ser mayor a 0.");
  if (adelanto < 0 || adelanto > monto_total) throw new ErpError("El adelanto debe estar entre 0 y el monto total.");
  const lista = getConcesiones();
  const anterior = lista.find((c) => c.id === data.id);
  if (anterior && anterior.estado !== "ACTIVO") throw new ErpError(`La concesión está ${anterior.estado}: no se edita.`);
  const c: ConcesionContratista = {
    ...(anterior ?? concesionVacia()),
    ...data,
    id: data.id || uid(),
    razonSocial,
    ruc,
    representante: data.representante.trim(),
    celular: data.celular.trim(),
    descripcion: data.descripcion.trim(),
    observaciones: data.observaciones.trim(),
    monto_total,
    adelanto,
    comprobantes: anterior?.comprobantes ?? [],
    pagos: anterior?.pagos ?? [],
    created_at: anterior?.created_at ?? new Date().toISOString(),
  };
  if (pagado(c) > monto_total + 0.005) throw new ErpError("Lo ya pagado supera el nuevo monto total.");
  c.saldo = calcularSaldo(c);
  if (anterior) lista[lista.findIndex((x) => x.id === c.id)] = c;
  else lista.unshift(c);
  escribir(KEYS.CONTRATISTAS, lista);
  return c;
}

export function agregarComprobante(id: string, comp: ComprobanteContratista): void {
  const numero = comp.numero.trim().toUpperCase();
  const monto = r2(Number(comp.monto));
  if (!(comp.tipo in TIPOS_COMPROBANTE)) throw new ErpError("Seleccione el tipo de comprobante.");
  if (!numero) throw new ErpError("Ingrese el número del comprobante (ej. E001-123).");
  if (!(monto > 0)) throw new ErpError("El monto del comprobante debe ser mayor a 0.");
  if (!FECHA.test(comp.fecha)) throw new ErpError("Indique la fecha del comprobante.");
  actualizar(id, (c) => {
    if (c.estado === "ANULADO") throw new ErpError("La concesión está anulada.");
    if (c.comprobantes.some((x) => x.tipo === comp.tipo && x.numero === numero)) throw new ErpError(`El comprobante ${numero} ya está registrado.`);
    if (facturado(c) + monto > c.monto_total + 0.005) throw new ErpError("Los comprobantes superarían el monto total de la concesión.");
    return { ...c, comprobantes: [...c.comprobantes, { tipo: comp.tipo, numero, monto, fecha: comp.fecha }] };
  });
}

export function quitarComprobante(id: string, indice: number): void {
  actualizar(id, (c) => {
    if (c.estado !== "ACTIVO") throw new ErpError(`La concesión está ${c.estado}.`);
    return { ...c, comprobantes: c.comprobantes.filter((_, i) => i !== indice) };
  });
}

export function registrarPago(id: string, pago: PagoContratista): ConcesionContratista {
  const monto = r2(Number(pago.monto));
  if (!(monto > 0)) throw new ErpError("El monto del pago debe ser mayor a 0.");
  if (!FECHA.test(pago.fecha)) throw new ErpError("Indique la fecha del pago.");
  return actualizar(id, (c) => {
    if (c.estado !== "ACTIVO") throw new ErpError(`La concesión está ${c.estado}: no admite pagos.`);
    if (monto > calcularSaldo(c) + 0.005) throw new ErpError(`El pago supera el saldo (S/ ${calcularSaldo(c).toFixed(2)}).`);
    return { ...c, pagos: [...(c.pagos ?? []), { fecha: pago.fecha, monto, medio: pago.medio || "TRANSFERENCIA", nota: pago.nota?.trim() || undefined }] };
  });
}

/** Paga todo el saldo y deja la concesión FINALIZADA. */
export function liquidarConcesion(id: string, medio: string, fecha = hoy()): ConcesionContratista {
  const c = getConcesiones().find((x) => x.id === id);
  if (!c) throw new ErpError("Concesión no encontrada.");
  if (c.estado !== "ACTIVO") throw new ErpError(`La concesión está ${c.estado}.`);
  const saldo = calcularSaldo(c);
  if (saldo > 0) registrarPago(id, { fecha, monto: saldo, medio, nota: "Liquidación del saldo" });
  return actualizar(id, (x) => ({ ...x, estado: "FINALIZADO", fecha_fin: x.fecha_fin || fecha }));
}

export function anularConcesion(id: string, motivo: string): void {
  if (!motivo.trim()) throw new ErpError("Indique el motivo de la anulación.");
  actualizar(id, (c) => {
    if (c.estado === "ANULADO") throw new ErpError("Ya está anulada.");
    return { ...c, estado: "ANULADO", observaciones: `${c.observaciones ? `${c.observaciones}\n` : ""}ANULADA (${hoy()}): ${motivo.trim()}` };
  });
}

export function eliminarConcesion(id: string): void {
  const c = getConcesiones().find((x) => x.id === id);
  if (!c) throw new ErpError("Concesión no encontrada.");
  if (pagado(c) > 0 || c.comprobantes.length) throw new ErpError("Tiene pagos o comprobantes: anúlela en lugar de eliminarla.");
  escribir(KEYS.CONTRATISTAS, getConcesiones().filter((x) => x.id !== id));
}
