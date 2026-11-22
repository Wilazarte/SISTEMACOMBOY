"use client";

// =====================================================================
// ACTIVOS DE LA EMPRESA (Finanzas › Activos, pedido de Williams 2026-11-17).
// Registro de computadoras, celulares, muebles, vehículos, herramientas… con categoría, ubicación (sede),
// responsable y ficha de entrega, mantenimientos con aviso, costo de compra, depreciación lineal y baja.
// Tabla contable, tipo ACTIVO_FIJO (id + data jsonb): no necesita tabla nueva.
// Sedes: Arequipa ve los activos de las dos sedes; Secocha solo los suyos (lib/storage COMPARTIDAS_ALMACEN).
// =====================================================================

import { getSesion, rolNegocio } from "./auth";
import { SEDES } from "./empresa";
import { getSedes, sedeCentral } from "./sedes";
import { ErpError, KEYS, enSucursal, escribir, getVistaSede, hoy, leer, r2, uid } from "./storage";

/**
 * Categorías con su tasa anual de depreciación de referencia (método lineal).
 * Son los porcentajes MÁXIMOS del art. 22 del Reglamento de la Ley del Impuesto a la Renta (SUNAT, Perú):
 * equipos de procesamiento de datos 25 %, vehículos 20 %, maquinaria y equipo 10 %, otros bienes 10 %,
 * edificaciones 5 %. Cada activo puede llevar otra tasa: el contador de la empresa debe validarlas.
 */
export const CATEGORIAS_ACTIVO = [
  { id: "COMPUTO", nombre: "Equipos de cómputo (PC, laptop, impresora, servidor)", tasa: 25 },
  { id: "CELULARES", nombre: "Celulares y comunicaciones (teléfono, radio, tablet)", tasa: 10 },
  { id: "MUEBLES", nombre: "Muebles y enseres (escritorio, silla, estante)", tasa: 10 },
  { id: "OFICINA", nombre: "Equipos de oficina (proyector, cámara, reloj biométrico)", tasa: 10 },
  { id: "MAQUINARIA", nombre: "Maquinaria y equipo de taller (soldadora, torno, compresora)", tasa: 10 },
  { id: "HERRAMIENTAS", nombre: "Herramientas (eléctricas y manuales mayores)", tasa: 10 },
  { id: "VEHICULOS", nombre: "Vehículos (camioneta, moto, montacargas)", tasa: 20 },
  { id: "SEGURIDAD", nombre: "Seguridad (cámaras, extintores, alarmas)", tasa: 10 },
  { id: "EDIFICACIONES", nombre: "Edificaciones e instalaciones", tasa: 5 },
  { id: "OTROS", nombre: "Otros activos", tasa: 10 },
] as const;
export type CategoriaActivo = (typeof CATEGORIAS_ACTIVO)[number]["id"];

export const nombreCategoria = (id: string): string => CATEGORIAS_ACTIVO.find((c) => c.id === id)?.nombre.split(" (")[0] ?? id;
export const tasaCategoria = (id: string): number => CATEGORIAS_ACTIVO.find((c) => c.id === id)?.tasa ?? 10;

/** Ubicaciones: la lista central de sedes (lib/empresa.ts). */
export const SEDES_ACTIVO: readonly string[] = SEDES;
const SEDE_SECOCHA = "Sucursal Secocha";
export const sedeActivoDefecto = (): string => (enSucursal() ? SEDE_SECOCHA : "Adm Aqp");
const esSecocha = (sede: string): boolean => /secocha/i.test(sede);

export type EstadoActivo = "OPERATIVO" | "EN_MANTENIMIENTO" | "MALOGRADO" | "BAJA";
export const ESTADOS_ACTIVO: { id: EstadoActivo; nombre: string }[] = [
  { id: "OPERATIVO", nombre: "Operativo" },
  { id: "EN_MANTENIMIENTO", nombre: "En mantenimiento" },
  { id: "MALOGRADO", nombre: "Malogrado" },
  { id: "BAJA", nombre: "De baja" },
];

export const CONDICIONES = ["Nuevo", "Bueno", "Regular", "Malo"] as const;

export const MOTIVOS_BAJA = ["Obsoleto / fin de vida útil", "Malogrado sin reparación", "Venta", "Robo o pérdida", "Siniestro", "Donación", "Otro"] as const;

export interface EntregaActivo {
  id: string;
  /** FE-ACT-0001-01 */
  numero: string;
  fecha: string; // YYYY-MM-DD
  responsable: string;
  dni: string;
  cargo: string;
  sede: string;
  condicion: string;
  accesorios: string;
  observaciones: string;
  entregadoPor: string;
  /** Fecha en que el responsable devolvió el activo. */
  devuelto?: string;
  condicionDevolucion?: string;
}

export interface MantenimientoActivo {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: "PREVENTIVO" | "CORRECTIVO";
  detalle: string;
  proveedor: string;
  costo: number;
  registradoPor: string;
}

export interface BajaActivo {
  fecha: string;
  motivo: string;
  detalle: string;
  /** Importe recibido si se vendió. */
  valorVenta: number;
  registradoPor: string;
}

export interface Activo {
  id: string;
  /** ACT-0001 (Arequipa) / ACT-SEC-0001 (Secocha) */
  codigo: string;
  nombre: string;
  categoria: CategoriaActivo;
  marca: string;
  modelo: string;
  serie: string;
  /** Ubicación: sede (lib/empresa.ts SEDES) y lugar dentro de la sede. */
  sede: string;
  area: string;
  estado: EstadoActivo;
  condicion: string;
  // Compra
  fechaCompra: string; // YYYY-MM-DD
  /** Costo de compra en soles, sin IGV (base de la depreciación). */
  costo: number;
  proveedor: string;
  comprobante: string;
  // Depreciación (lineal)
  /** Fecha desde la que se usa; sin dato, la de compra. */
  fechaUso: string;
  tasaAnual: number; // % por año
  valorResidual: number;
  // Responsable actual (lo fija la última ficha de entrega)
  responsable: string;
  responsableDni: string;
  responsableCargo: string;
  entregas: EntregaActivo[];
  // Mantenimiento
  /** Cada cuántos meses toca mantenimiento (0 = sin programa). */
  frecuenciaMantMeses: number;
  proximoMantenimiento: string; // YYYY-MM-DD o ""
  mantenimientos: MantenimientoActivo[];
  baja?: BajaActivo;
  observaciones: string;
  creadoPor: string;
  actualizado: string; // ISO
  sedeId?: string;
}

export type DatosActivo = Pick<
  Activo,
  | "nombre"
  | "categoria"
  | "marca"
  | "modelo"
  | "serie"
  | "sede"
  | "area"
  | "estado"
  | "condicion"
  | "fechaCompra"
  | "costo"
  | "proveedor"
  | "comprobante"
  | "fechaUso"
  | "tasaAnual"
  | "valorResidual"
  | "frecuenciaMantMeses"
  | "proximoMantenimiento"
  | "observaciones"
>;

export const activoVacio = (): DatosActivo => ({
  nombre: "",
  categoria: "COMPUTO",
  marca: "",
  modelo: "",
  serie: "",
  sede: sedeActivoDefecto(),
  area: "",
  estado: "OPERATIVO",
  condicion: "Nuevo",
  fechaCompra: hoy(),
  costo: 0,
  proveedor: "",
  comprobante: "",
  fechaUso: "",
  tasaAnual: tasaCategoria("COMPUTO"),
  valorResidual: 0,
  frecuenciaMantMeses: 0,
  proximoMantenimiento: "",
  observaciones: "",
});

/** Registros a medio llenar o creados a mano en Supabase: nunca rompen la pantalla. */
export function normalizarActivo(a: Partial<Activo> & { id: string }): Activo {
  const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const categoria = (CATEGORIAS_ACTIVO.some((c) => c.id === a.categoria) ? a.categoria : "OTROS") as CategoriaActivo;
  return {
    ...a,
    id: String(a.id),
    codigo: txt(a.codigo) || String(a.id),
    nombre: txt(a.nombre),
    categoria,
    marca: txt(a.marca),
    modelo: txt(a.modelo),
    serie: txt(a.serie),
    sede: txt(a.sede) || "Adm Aqp",
    area: txt(a.area),
    estado: (ESTADOS_ACTIVO.some((e) => e.id === a.estado) ? a.estado : "OPERATIVO") as EstadoActivo,
    condicion: txt(a.condicion) || "Bueno",
    fechaCompra: /^\d{4}-\d{2}-\d{2}/.test(txt(a.fechaCompra)) ? txt(a.fechaCompra).slice(0, 10) : hoy(),
    costo: Number(a.costo) || 0,
    proveedor: txt(a.proveedor),
    comprobante: txt(a.comprobante),
    fechaUso: /^\d{4}-\d{2}-\d{2}/.test(txt(a.fechaUso)) ? txt(a.fechaUso).slice(0, 10) : "",
    tasaAnual: a.tasaAnual === undefined || a.tasaAnual === null ? tasaCategoria(categoria) : Number(a.tasaAnual) || 0,
    valorResidual: Number(a.valorResidual) || 0,
    responsable: txt(a.responsable),
    responsableDni: txt(a.responsableDni),
    responsableCargo: txt(a.responsableCargo),
    entregas: Array.isArray(a.entregas) ? a.entregas : [],
    frecuenciaMantMeses: Number(a.frecuenciaMantMeses) || 0,
    proximoMantenimiento: /^\d{4}-\d{2}-\d{2}/.test(txt(a.proximoMantenimiento)) ? txt(a.proximoMantenimiento).slice(0, 10) : "",
    mantenimientos: Array.isArray(a.mantenimientos) ? a.mantenimientos : [],
    observaciones: txt(a.observaciones),
    creadoPor: txt(a.creadoPor),
    actualizado: txt(a.actualizado),
  };
}

export const getActivos = (): Activo[] => leer<Activo[]>(KEYS.ACTIVOS, []).map(normalizarActivo);

/** Registra, edita y da de baja activos: Finanzas (Tesorería), Soporte y el administrador de sede. */
export function puedeEditarActivos(): boolean {
  const s = getSesion();
  if (!s || s.soloLectura) return false;
  const rol = rolNegocio(s);
  return rol === "TESORERIA" || rol === "GERENCIA";
}

function exigirPermiso(): string {
  if (!puedeEditarActivos()) throw new ErpError("Su usuario no puede modificar el registro de activos.");
  const s = getSesion()!;
  return s.nombre || s.usuario;
}

// ---------------------------------------------------------------------
// Depreciación lineal
// ---------------------------------------------------------------------

/** Meses completos entre dos fechas YYYY-MM-DD, contando el mes de inicio y sin contar el mes en curso. */
const mesesEntre = (desde: string, hasta: string): number =>
  Math.max(0, (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + (Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7))));

export interface Depreciacion {
  /** Fecha desde la que se deprecia (uso o compra). */
  inicio: string;
  /** Costo menos valor residual. */
  base: number;
  mensual: number;
  anual: number;
  /** Meses ya depreciados (cerrados). */
  meses: number;
  vidaUtilMeses: number;
  acumulada: number;
  valorLibros: number;
  /** 0 a 100 */
  avance: number;
  /** Mes (YYYY-MM) en que termina de depreciarse; "" si la tasa es 0. */
  fin: string;
  terminada: boolean;
}

/**
 * Depreciación por el método lineal: cada mes se deprecia (costo − valor residual) × tasa anual / 12, desde el mes
 * en que el bien se empieza a usar. Se cuentan los meses cerrados; el mes en curso se suma al cerrar. Un activo de
 * baja deja de depreciarse en la fecha de baja.
 */
export function depreciacion(a: Pick<Activo, "costo" | "valorResidual" | "tasaAnual" | "fechaCompra" | "fechaUso" | "baja">, al: string = hoy()): Depreciacion {
  const inicio = a.fechaUso || a.fechaCompra;
  const costo = Math.max(0, Number(a.costo) || 0);
  const base = Math.max(0, r2(costo - (Number(a.valorResidual) || 0)));
  const tasa = Math.max(0, Number(a.tasaAnual) || 0);
  const anual = r2((base * tasa) / 100);
  const mensual = (base * tasa) / 1200;
  const vidaUtilMeses = tasa > 0 ? Math.ceil(1200 / tasa) : 0;
  const corte = a.baja?.fecha && a.baja.fecha < al ? a.baja.fecha : al;
  const meses = Math.min(mesesEntre(inicio, corte), vidaUtilMeses);
  const acumulada = tasa > 0 ? Math.min(base, r2(mensual * meses)) : 0;
  const terminada = tasa > 0 && meses >= vidaUtilMeses;
  let fin = "";
  if (vidaUtilMeses) {
    const m = Number(inicio.slice(0, 4)) * 12 + (Number(inicio.slice(5, 7)) - 1) + vidaUtilMeses - 1;
    fin = `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
  }
  return {
    inicio,
    base,
    mensual: r2(mensual),
    anual,
    meses,
    vidaUtilMeses,
    acumulada: terminada ? base : acumulada,
    valorLibros: r2(costo - (terminada ? base : acumulada)),
    avance: base > 0 ? Math.min(100, Math.round(((terminada ? base : acumulada) / base) * 100)) : 0,
    fin,
    terminada,
  };
}

/** Cuadro de depreciación por año (toda la vida útil): meses, depreciación del año, acumulada y valor en libros. */
export function cuadroDepreciacion(a: Pick<Activo, "costo" | "valorResidual" | "tasaAnual" | "fechaCompra" | "fechaUso" | "baja">): { anio: number; meses: number; depreciacion: number; acumulada: number; valorLibros: number }[] {
  const d = depreciacion(a, "9999-12-31");
  if (!d.vidaUtilMeses || d.base <= 0) return [];
  const costo = Number(a.costo) || 0;
  const mensual = (d.base * a.tasaAnual) / 1200;
  const filas: { anio: number; meses: number; depreciacion: number; acumulada: number; valorLibros: number }[] = [];
  let anio = Number(d.inicio.slice(0, 4));
  let mes = Number(d.inicio.slice(5, 7));
  let quedan = d.meses; // con baja, solo hasta la fecha de baja
  let acum = 0;
  while (quedan > 0) {
    const n = Math.min(quedan, 13 - mes);
    quedan -= n;
    const nuevoAcum = quedan === 0 && d.terminada ? d.base : Math.min(d.base, r2(acum + mensual * n));
    filas.push({ anio, meses: n, depreciacion: r2(nuevoAcum - acum), acumulada: nuevoAcum, valorLibros: r2(costo - nuevoAcum) });
    acum = nuevoAcum;
    anio += 1;
    mes = 1;
  }
  return filas;
}

// ---------------------------------------------------------------------
// Mantenimiento
// ---------------------------------------------------------------------

/** Días de anticipación con que se avisa un mantenimiento. */
export const DIAS_AVISO_MANTENIMIENTO = 15;

export const diasHasta = (fecha: string, desde: string = hoy()): number =>
  Math.round((new Date(`${fecha}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86400000);

export type AvisoMantenimiento = "VENCIDO" | "PROXIMO" | "AL_DIA" | "SIN_PROGRAMA";
export function avisoMantenimiento(a: Activo, al: string = hoy()): { estado: AvisoMantenimiento; dias: number } {
  if (a.estado === "BAJA" || !a.proximoMantenimiento) return { estado: "SIN_PROGRAMA", dias: 0 };
  const dias = diasHasta(a.proximoMantenimiento, al);
  return { estado: dias < 0 ? "VENCIDO" : dias <= DIAS_AVISO_MANTENIMIENTO ? "PROXIMO" : "AL_DIA", dias };
}

/** Activos con mantenimiento vencido o por vencer (los más urgentes primero). */
export const mantenimientosPendientes = (activos: Activo[] = getActivos()): { activo: Activo; estado: AvisoMantenimiento; dias: number }[] =>
  activos
    .map((activo) => ({ activo, ...avisoMantenimiento(activo) }))
    .filter((x) => x.estado === "VENCIDO" || x.estado === "PROXIMO")
    .sort((x, y) => x.dias - y.dias);

function sumarMeses(fecha: string, meses: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------

/** Siguiente código: ACT-0001 en Arequipa, ACT-SEC-0001 en Secocha. */
function siguienteCodigo(lista: Activo[]): string {
  const prefijo = enSucursal() ? "ACT-SEC-" : "ACT-";
  const n = lista.reduce((max, a) => {
    const m = a.codigo.startsWith(prefijo) ? /^(\d+)$/.exec(a.codigo.slice(prefijo.length)) : null;
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${prefijo}${String(n + 1).padStart(4, "0")}`;
}

/** Sede (multisede) de la fila según su ubicación: lo que está en Secocha es de Secocha, el resto de Arequipa. */
function conSede(a: Activo): Activo {
  const v = getVistaSede();
  if (v?.modo !== "central") return a; // Secocha: lib/storage ya marca su sede
  if (esSecocha(a.sede)) return v.secocha ? { ...a, sedeId: v.secocha } : a;
  const central = sedeCentral(getSedes())?.id;
  return central && a.sedeId && a.sedeId !== central ? { ...a, sedeId: central } : a;
}

function validar(d: DatosActivo): void {
  if (!d.nombre.trim()) throw new ErpError("Escriba el nombre del activo (ej. Laptop Lenovo ThinkPad).");
  if (!d.sede) throw new ErpError("Elija la ubicación (sede) del activo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fechaCompra)) throw new ErpError("Indique la fecha de compra.");
  if (d.fechaCompra > hoy()) throw new ErpError("La fecha de compra no puede ser futura.");
  if (!(d.costo >= 0)) throw new ErpError("El costo de compra no es válido.");
  if (d.valorResidual < 0 || d.valorResidual > d.costo) throw new ErpError("El valor residual debe estar entre 0 y el costo de compra.");
  if (d.tasaAnual < 0 || d.tasaAnual > 100) throw new ErpError("La tasa de depreciación debe estar entre 0 y 100 %.");
  if (d.fechaUso && d.fechaUso < d.fechaCompra) throw new ErpError("La fecha de inicio de uso no puede ser anterior a la compra.");
}

function reemplazar(lista: Activo[], a: Activo): void {
  const listo = conSede({ ...a, actualizado: new Date().toISOString() });
  escribir(KEYS.ACTIVOS, lista.some((x) => x.id === a.id) ? lista.map((x) => (x.id === a.id ? listo : x)) : [listo, ...lista]);
}

function buscar(id: string): { lista: Activo[]; a: Activo } {
  const lista = getActivos();
  const a = lista.find((x) => x.id === id);
  if (!a) throw new ErpError("El activo ya no existe.");
  return { lista, a };
}

export function guardarActivo(datos: DatosActivo, id?: string): Activo {
  const usuario = exigirPermiso();
  const d: DatosActivo = {
    ...datos,
    nombre: datos.nombre.trim().toUpperCase(),
    marca: datos.marca.trim().toUpperCase(),
    modelo: datos.modelo.trim().toUpperCase(),
    serie: datos.serie.trim().toUpperCase(),
    area: datos.area.trim(),
    proveedor: datos.proveedor.trim(),
    comprobante: datos.comprobante.trim().toUpperCase(),
    costo: r2(Number(datos.costo) || 0),
    valorResidual: r2(Number(datos.valorResidual) || 0),
    tasaAnual: Number(datos.tasaAnual) || 0,
    frecuenciaMantMeses: Math.max(0, Math.round(Number(datos.frecuenciaMantMeses) || 0)),
    // La baja tiene su propio formulario (fecha y motivo)
    estado: datos.estado === "BAJA" ? "OPERATIVO" : datos.estado,
  };
  validar(d);
  const lista = getActivos();
  if (d.serie) {
    const repetido = lista.find((x) => x.id !== id && x.serie === d.serie && x.estado !== "BAJA");
    if (repetido) throw new ErpError(`El N° de serie ${d.serie} ya está registrado en ${repetido.codigo} (${repetido.nombre}).`);
  }
  if (id) {
    const previo = lista.find((x) => x.id === id);
    if (!previo) throw new ErpError("El activo ya no existe.");
    const a: Activo = { ...previo, ...d, estado: previo.estado === "BAJA" ? "BAJA" : d.estado };
    reemplazar(lista, a);
    return a;
  }
  // Con programa de mantenimiento y sin fecha: el primero toca a los N meses de empezar a usarlo
  if (d.frecuenciaMantMeses && !d.proximoMantenimiento) d.proximoMantenimiento = sumarMeses(d.fechaUso || d.fechaCompra, d.frecuenciaMantMeses);
  const a: Activo = {
    ...d,
    id: uid(),
    codigo: siguienteCodigo(lista),
    responsable: "",
    responsableDni: "",
    responsableCargo: "",
    entregas: [],
    mantenimientos: [],
    creadoPor: usuario,
    actualizado: "",
  };
  reemplazar(lista, a);
  return a;
}

export type DatosEntrega = Pick<EntregaActivo, "fecha" | "responsable" | "dni" | "cargo" | "sede" | "condicion" | "accesorios" | "observaciones">;

/** Ficha de entrega: el activo pasa a un responsable (la entrega anterior, si seguía abierta, queda devuelta). */
export function registrarEntrega(id: string, d: DatosEntrega): { activo: Activo; entrega: EntregaActivo } {
  const usuario = exigirPermiso();
  const { lista, a } = buscar(id);
  if (a.estado === "BAJA") throw new ErpError("El activo está de baja: no se puede entregar.");
  if (!d.responsable.trim()) throw new ErpError("Indique a quién se entrega el activo.");
  if (d.dni && !/^\d{8,12}$/.test(d.dni.trim())) throw new ErpError("El DNI / documento del responsable no es válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErpError("Indique la fecha de entrega.");
  const entrega: EntregaActivo = {
    id: uid(),
    numero: `FE-${a.codigo}-${String(a.entregas.length + 1).padStart(2, "0")}`,
    fecha: d.fecha,
    responsable: d.responsable.trim().toUpperCase(),
    dni: d.dni.trim(),
    cargo: d.cargo.trim(),
    sede: d.sede || a.sede,
    condicion: d.condicion,
    accesorios: d.accesorios.trim(),
    observaciones: d.observaciones.trim(),
    entregadoPor: usuario,
  };
  const activo: Activo = {
    ...a,
    sede: entrega.sede,
    condicion: entrega.condicion,
    responsable: entrega.responsable,
    responsableDni: entrega.dni,
    responsableCargo: entrega.cargo,
    entregas: [...a.entregas.map((e) => (e.devuelto ? e : { ...e, devuelto: d.fecha })), entrega],
  };
  reemplazar(lista, activo);
  return { activo, entrega };
}

/** El responsable devuelve el activo: queda sin responsable (en custodia de la empresa). */
export function registrarDevolucion(id: string, fecha: string, condicion: string): Activo {
  exigirPermiso();
  const { lista, a } = buscar(id);
  if (!a.responsable) throw new ErpError("El activo no tiene responsable asignado.");
  const activo: Activo = {
    ...a,
    condicion,
    responsable: "",
    responsableDni: "",
    responsableCargo: "",
    entregas: a.entregas.map((e) => (e.devuelto ? e : { ...e, devuelto: fecha, condicionDevolucion: condicion })),
  };
  reemplazar(lista, activo);
  return activo;
}

export type DatosMantenimiento = Pick<MantenimientoActivo, "fecha" | "tipo" | "detalle" | "proveedor" | "costo"> & { proximo: string };

/** Registra un mantenimiento hecho y deja programado el siguiente (por la frecuencia o la fecha indicada). */
export function registrarMantenimiento(id: string, d: DatosMantenimiento): Activo {
  const usuario = exigirPermiso();
  const { lista, a } = buscar(id);
  if (a.estado === "BAJA") throw new ErpError("El activo está de baja.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || d.fecha > hoy()) throw new ErpError("Indique la fecha en que se hizo el mantenimiento (no futura).");
  if (!d.detalle.trim()) throw new ErpError("Describa el trabajo realizado.");
  const m: MantenimientoActivo = { id: uid(), fecha: d.fecha, tipo: d.tipo, detalle: d.detalle.trim(), proveedor: d.proveedor.trim(), costo: r2(Number(d.costo) || 0), registradoPor: usuario };
  const proximo = d.proximo || (a.frecuenciaMantMeses ? sumarMeses(d.fecha, a.frecuenciaMantMeses) : "");
  const activo: Activo = {
    ...a,
    estado: a.estado === "EN_MANTENIMIENTO" || a.estado === "MALOGRADO" ? "OPERATIVO" : a.estado,
    proximoMantenimiento: proximo,
    mantenimientos: [m, ...a.mantenimientos].sort((x, y) => y.fecha.localeCompare(x.fecha)),
  };
  reemplazar(lista, activo);
  return activo;
}

export function darDeBaja(id: string, d: Pick<BajaActivo, "fecha" | "motivo" | "detalle" | "valorVenta">): Activo {
  const usuario = exigirPermiso();
  const { lista, a } = buscar(id);
  if (a.estado === "BAJA") throw new ErpError("El activo ya está de baja.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || d.fecha > hoy() || d.fecha < a.fechaCompra) throw new ErpError("La fecha de baja debe estar entre la compra y hoy.");
  if (!d.motivo) throw new ErpError("Elija el motivo de la baja.");
  const activo: Activo = {
    ...a,
    estado: "BAJA",
    proximoMantenimiento: "",
    responsable: "",
    responsableDni: "",
    responsableCargo: "",
    entregas: a.entregas.map((e) => (e.devuelto ? e : { ...e, devuelto: d.fecha })),
    baja: { fecha: d.fecha, motivo: d.motivo, detalle: d.detalle.trim(), valorVenta: r2(Number(d.valorVenta) || 0), registradoPor: usuario },
  };
  reemplazar(lista, activo);
  return activo;
}

/** Elimina un registro creado por error (sin fichas de entrega ni mantenimientos). Lo demás se da de baja. */
export function eliminarActivo(id: string): void {
  exigirPermiso();
  const { lista, a } = buscar(id);
  if (a.entregas.length || a.mantenimientos.length) throw new ErpError("El activo ya tiene fichas de entrega o mantenimientos: dele de baja en lugar de eliminarlo.");
  escribir(KEYS.ACTIVOS, lista.filter((x) => x.id !== id));
}

/** Totales del registro (activos vigentes): costo, depreciación acumulada y valor en libros. */
export function totalesActivos(activos: Activo[], al: string = hoy()): { cantidad: number; costo: number; acumulada: number; valorLibros: number; mensual: number } {
  const vigentes = activos.filter((a) => a.estado !== "BAJA");
  const t = vigentes.reduce(
    (s, a) => {
      const d = depreciacion(a, al);
      return { costo: s.costo + a.costo, acumulada: s.acumulada + d.acumulada, valorLibros: s.valorLibros + d.valorLibros, mensual: s.mensual + (d.terminada ? 0 : d.mensual) };
    },
    { costo: 0, acumulada: 0, valorLibros: 0, mensual: 0 }
  );
  return { cantidad: vigentes.length, costo: r2(t.costo), acumulada: r2(t.acumulada), valorLibros: r2(t.valorLibros), mensual: r2(t.mensual) };
}
