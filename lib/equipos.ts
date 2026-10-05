"use client";

// =====================================================================
// ALMACÉN › EQUIPOS TERMINADOS (equipos fabricados): un registro por equipo.
// Tabla almacen, tipo EQUIPO_TERMINADO, id EQ-2026-0001 (correlativo).
// Serie de motor y código de chasis / VIN son únicos.
// =====================================================================

import { ALMACENES, ALMACEN_DEFECTO } from "./empresa";
import { ErpError, KEYS, escribir, hoy, leer, siguienteNumero, uid, type Serie } from "./storage";

export const TIPOS_EQUIPO = ["DUMPER", "MINICARGADOR", "MIXER", "LOCOMOTORA", "OTRO"] as const;
export const MARCAS_MOTOR = ["KUBOTA", "YANMAR", "HONDA", "LOMBARDINI", "OTRO"] as const;
/** Almacenes donde quedan los equipos terminados (Almacen Aqp por defecto). */
export const SEDES_EQUIPO: readonly string[] = ALMACENES;
export const SEDE_EQUIPO_DEFECTO = ALMACEN_DEFECTO;

/** Las listas son sugerencias: Producción puede registrar otros (ej. REMOLCADOR ECO-MINE 3000, motor RONCO). */
export type TipoEquipo = string;
export type MarcaMotor = string;
export type EstadoEquipo = "DISPONIBLE" | "EN_QC" | "VENDIDO";

export interface FotoEquipo {
  nombre: string;
  url: string; // dataURL (JPEG reducido)
}

export interface EquipoTerminado {
  id: string; // EQ-2026-0001
  tipo_equipo: TipoEquipo;
  modelo: string;
  marca_motor: MarcaMotor;
  serie_motor: string;
  codigo_chasis: string;
  color: string;
  sede: string;
  /** Igual a sede (nombre de columna usado en consultas SQL / v_equipos_terminados). */
  ubicacion_sede?: string;
  qc_aprobado: boolean;
  fecha_qc: string | null;
  supervisor_qc: string | null;
  observaciones_qc: string | null;
  estado: EstadoEquipo;
  fecha_fabricacion: string; // ISO
  fotos: FotoEquipo[];
  creado_por: string;
  actualizado: string; // ISO
  /** Al salir de almacén por una orden de despacho. */
  vendido_od?: string;
  fecha_venta?: string;
  fecha_salida?: string;
  cliente?: string;
  /** Producción: origen, orden de producción, ingreso a almacén y supervisor QC. */
  origen?: "PRODUCCION" | "MANUAL";
  op_id?: string;
  fecha_ingreso?: string;
  qc_supervisor?: string;
}

/** Movimiento de almacén (tabla almacen, tipo MOVIMIENTO_ALMACEN; vista movimientos_almacen). */
export interface MovimientoAlmacen {
  id: string;
  tipo: "INGRESO" | "TRANSFERENCIA" | "SALIDA";
  chasis?: string;
  equipo_id?: string;
  producto?: string;
  cantidad: number;
  de_sede?: string;
  a_sede?: string;
  a_cliente?: string;
  od?: string;
  op?: string;
  fecha: string; // ISO
  usuario: string;
}

export const getMovimientos = () => leer<MovimientoAlmacen[]>(KEYS.MOVIMIENTOS, []);

export function registrarMovimiento(m: Omit<MovimientoAlmacen, "id" | "fecha"> & { fecha?: string }): MovimientoAlmacen {
  const mov: MovimientoAlmacen = { ...m, id: uid(), fecha: m.fecha ?? new Date().toISOString() };
  escribir(KEYS.MOVIMIENTOS, [mov, ...getMovimientos()]);
  return mov;
}

/** Sede real del equipo (registros hechos en Supabase pueden traer solo ubicacion_sede). */
export const sedeEquipo = (e: Pick<EquipoTerminado, "sede" | "ubicacion_sede">): string => e.ubicacion_sede || e.sede || "";

const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Equipo terminado de una línea de venta / despacho: por codigo_chasis explícito o porque el producto /
 * descripción es (o contiene) el código de chasis. Ej. "WH174MN-2 260380186".
 */
export function equipoDeLinea(
  l: { codigo_chasis?: string; productoNombre?: string; descripcion?: string },
  equipos: EquipoTerminado[] = getEquipos()
): EquipoTerminado | undefined {
  if (l.codigo_chasis) return equipos.find((e) => norm(e.codigo_chasis) === norm(l.codigo_chasis));
  const textos = [norm(l.productoNombre), norm(l.descripcion)].filter(Boolean);
  if (!textos.length) return undefined;
  const exacto = equipos.find((e) => textos.includes(norm(e.codigo_chasis)));
  if (exacto) return exacto;
  return equipos.find((e) => norm(e.codigo_chasis).length >= 6 && textos.some((t) => t.includes(norm(e.codigo_chasis))));
}

/** Unidades DISPONIBLES de ese chasis en la sede (equivale a COUNT(*) en almacen tipo EQUIPO_TERMINADO). */
export const disponibleEquipo = (codigoChasis: string, sede: string, equipos: EquipoTerminado[] = getEquipos()): number =>
  equipos.filter((e) => norm(e.codigo_chasis) === norm(codigoChasis) && e.estado === "DISPONIBLE" && sedeEquipo(e) === sede).length;

/**
 * Salida de almacén (Marcar entregado / dejado en agencia): solo equipos DISPONIBLES de esa sede pasan a
 * VENDIDO con fecha_salida y cliente, y se registra el movimiento SALIDA.
 */
export function marcarEquiposVendidos(chasis: string[], od: string, cliente: string, deSede: string, usuario: string): void {
  if (!chasis.length) return;
  const set = new Set(chasis.map(norm));
  const ahora = new Date().toISOString();
  const lista = getEquipos();
  const vendidos = lista.filter((e) => set.has(norm(e.codigo_chasis)) && e.estado === "DISPONIBLE" && sedeEquipo(e) === deSede);
  if (vendidos.length < set.size) {
    const faltan = chasis.filter((c) => !vendidos.some((e) => norm(e.codigo_chasis) === norm(c)));
    throw new ErpError(`No hay equipo DISPONIBLE en ${deSede} con chasis ${faltan.join(", ")}: no se puede entregar.`);
  }
  escribir(
    KEYS.EQUIPOS,
    lista.map((e) =>
      vendidos.some((v) => v.id === e.id) ? { ...e, estado: "VENDIDO" as const, vendido_od: od, fecha_venta: ahora, fecha_salida: ahora, cliente, actualizado: ahora } : e
    )
  );
  vendidos.forEach((e) => registrarMovimiento({ tipo: "SALIDA", chasis: e.codigo_chasis, equipo_id: e.id, cantidad: 1, de_sede: deSede, a_cliente: cliente, od, usuario }));
}

/** Transferir un equipo DISPONIBLE a otra sede (botón "Transferir desde…"). */
export function transferirEquipo(codigoChasis: string, aSede: string, usuario: string, od?: string): EquipoTerminado {
  const e = getEquipos().find((x) => norm(x.codigo_chasis) === norm(codigoChasis) && x.estado === "DISPONIBLE");
  if (!e) throw new ErpError(`No hay equipo DISPONIBLE con chasis ${codigoChasis}.`);
  const de = sedeEquipo(e);
  if (de === aSede) throw new ErpError(`El equipo ya está en ${aSede}.`);
  const ahora = new Date().toISOString();
  const nuevo = { ...e, sede: aSede, ubicacion_sede: aSede, actualizado: ahora };
  escribir(KEYS.EQUIPOS, getEquipos().map((x) => (x.id === e.id ? nuevo : x)));
  registrarMovimiento({ tipo: "TRANSFERENCIA", chasis: e.codigo_chasis, equipo_id: e.id, cantidad: 1, de_sede: de, a_sede: aSede, od, usuario });
  return nuevo;
}

/** Correlativo EQ-/OP-AAAA-0001: atómico en Supabase; si la serie aún no está habilitada, por el mayor existente del año. */
export async function nuevoCodigo(serie: Extract<Serie, "EQ" | "OP">, existentes: string[]): Promise<string> {
  try {
    return await siguienteNumero(serie);
  } catch (e) {
    const msg = (e as Error).message;
    if (!/serie inv|falta la funci|no puede emitir/i.test(msg)) throw e;
    const anio = new Date().getFullYear();
    const max = existentes.map((x) => new RegExp(`^${serie}-${anio}-(\\d+)$`).exec(x)?.[1]).reduce((m, n) => Math.max(m, Number(n ?? 0)), 0);
    return `${serie}-${anio}-${String(max + 1).padStart(4, "0")}`;
  }
}

/**
 * QC aprobado en Producción: crea el EQUIPO_TERMINADO (DISPONIBLE, origen PRODUCCION) y el movimiento INGRESO.
 * No se inserta si el chasis ya existe (único).
 */
export async function ingresarEquipoProduccion(
  d: {
    codigo_chasis: string;
    tipo_equipo: string;
    modelo: string;
    marca_motor: string;
    serie_motor: string;
    color: string;
    ubicacion_sede?: string | null;
    op_id: string;
    qc_supervisor: string;
    fecha_qc: string;
    observaciones_qc?: string;
  },
  usuario: string
): Promise<EquipoTerminado> {
  const codigo_chasis = d.codigo_chasis.trim().toUpperCase();
  if (!codigo_chasis) throw new ErpError("La orden de producción no tiene código de chasis.");
  const existente = getEquipos().find((x) => norm(x.codigo_chasis) === norm(codigo_chasis));
  if (existente)
    throw new ErpError(`El chasis ${codigo_chasis} ya está en almacén como ${existente.id} (${existente.estado}${existente.estado === "DISPONIBLE" ? ` en ${sedeEquipo(existente)}` : ""}): no se vuelve a ingresar.`);
  const serie = d.serie_motor.trim().toUpperCase();
  if (serie) {
    const rep = getEquipos().find((x) => norm(x.serie_motor) === norm(serie));
    if (rep) throw new ErpError(`La serie de motor ${serie} ya está registrada en ${rep.id}.`);
  }
  const sede = d.ubicacion_sede?.trim() || ALMACEN_DEFECTO;
  const id = await nuevoCodigo("EQ", getEquipos().map((x) => x.id));
  if (getEquipos().some((x) => x.id === id)) throw new ErpError(`El código ${id} ya existe: vuelva a intentar.`);
  const ahora = new Date().toISOString();
  const equipo: EquipoTerminado = {
    id,
    tipo_equipo: d.tipo_equipo.trim().toUpperCase() as TipoEquipo,
    modelo: d.modelo.trim().toUpperCase(),
    marca_motor: d.marca_motor.trim().toUpperCase() as MarcaMotor,
    serie_motor: serie,
    codigo_chasis,
    color: d.color.trim(),
    sede,
    ubicacion_sede: sede,
    qc_aprobado: true,
    fecha_qc: d.fecha_qc,
    supervisor_qc: d.qc_supervisor,
    qc_supervisor: d.qc_supervisor,
    observaciones_qc: d.observaciones_qc?.trim() || null,
    estado: "DISPONIBLE",
    origen: "PRODUCCION",
    op_id: d.op_id,
    fecha_ingreso: ahora,
    fecha_fabricacion: ahora,
    fotos: [],
    creado_por: usuario,
    actualizado: ahora,
  };
  escribir(KEYS.EQUIPOS, [equipo, ...getEquipos()]);
  registrarMovimiento({ tipo: "INGRESO", chasis: codigo_chasis, equipo_id: id, cantidad: 1, a_sede: sede, op: d.op_id, usuario });
  return equipo;
}

export type DatosEquipo = Pick<
  EquipoTerminado,
  "tipo_equipo" | "modelo" | "marca_motor" | "serie_motor" | "codigo_chasis" | "color" | "sede" | "qc_aprobado" | "fecha_qc" | "supervisor_qc" | "observaciones_qc" | "fotos"
>;

export const equipoVacio = (): DatosEquipo => ({
  tipo_equipo: "DUMPER",
  modelo: "",
  marca_motor: "KUBOTA",
  serie_motor: "",
  codigo_chasis: "",
  color: "",
  sede: SEDE_EQUIPO_DEFECTO,
  qc_aprobado: true, // por defecto DISPONIBLE (se desmarca si aún está en control de calidad)
  fecha_qc: hoy(),
  supervisor_qc: "",
  observaciones_qc: "",
  fotos: [],
});

/** Completa registros hechos a mano en Supabase (pueden traer solo chasis, tipo, ubicacion_sede y estado). */
export function normalizarEquipo(e: Partial<EquipoTerminado> & { id?: string }): EquipoTerminado {
  const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const estado = txt(e.estado).toUpperCase();
  return {
    ...(e as EquipoTerminado),
    id: txt(e.id),
    tipo_equipo: (txt(e.tipo_equipo).toUpperCase() || "OTRO") as TipoEquipo,
    modelo: txt(e.modelo),
    marca_motor: (txt(e.marca_motor).toUpperCase() || "OTRO") as MarcaMotor,
    serie_motor: txt(e.serie_motor),
    codigo_chasis: txt(e.codigo_chasis),
    color: txt(e.color),
    sede: txt(e.ubicacion_sede || e.sede),
    ubicacion_sede: txt(e.ubicacion_sede || e.sede),
    qc_aprobado: e.qc_aprobado === undefined ? estado === "DISPONIBLE" || estado === "VENDIDO" : !!e.qc_aprobado,
    fecha_qc: e.fecha_qc ?? null,
    supervisor_qc: e.supervisor_qc ?? null,
    observaciones_qc: e.observaciones_qc ?? null,
    estado: (estado === "DISPONIBLE" || estado === "VENDIDO" ? estado : "EN_QC") as EstadoEquipo,
    fecha_fabricacion: txt(e.fecha_fabricacion) || txt(e.actualizado),
    fotos: Array.isArray(e.fotos) ? e.fotos : [],
    creado_por: txt(e.creado_por) || "Supabase",
    actualizado: txt(e.actualizado) || txt(e.fecha_fabricacion),
  };
}

export const getEquipos = () => leer<Partial<EquipoTerminado>[]>(KEYS.EQUIPOS, []).map(normalizarEquipo);

/** Para comparar únicos: sin espacios, mayúsculas. */
const clave = (s: string) => s.replace(/\s+/g, "").toUpperCase();

const nuevoId = () => nuevoCodigo("EQ", getEquipos().map((x) => x.id));

/** Registra (o actualiza) un equipo terminado. Estado: QC aprobado -> DISPONIBLE; si no -> EN_QC. */
export async function guardarEquipo(d: DatosEquipo, usuario: string, idExistente?: string): Promise<EquipoTerminado> {
  const modelo = d.modelo.trim().toUpperCase();
  const serie_motor = d.serie_motor.trim().toUpperCase();
  const codigo_chasis = d.codigo_chasis.trim().toUpperCase();
  const color = d.color.trim();
  if (!d.tipo_equipo?.trim()) throw new ErpError("Seleccione el tipo de equipo.");
  if (!modelo) throw new ErpError("Indique el modelo (ej. CV-D500).");
  if (!d.marca_motor?.trim()) throw new ErpError("Seleccione la marca del motor.");
  if (!serie_motor) throw new ErpError("Indique la serie del motor.");
  if (!codigo_chasis) throw new ErpError("Indique el código de chasis / VIN.");
  if (!color) throw new ErpError("Indique el color.");
  if (!d.sede) throw new ErpError("Seleccione la ubicación / sede.");
  if (d.qc_aprobado) {
    if (!d.fecha_qc || !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_qc)) throw new ErpError("Control de calidad: indique la fecha de QC.");
    if (d.fecha_qc > hoy()) throw new ErpError("La fecha de QC no puede ser futura.");
    if (!d.supervisor_qc?.trim()) throw new ErpError("Control de calidad: indique el supervisor QC.");
  }
  if (d.fotos.length > 3) throw new ErpError("Máximo 3 fotos por equipo.");

  const otros = getEquipos().filter((x) => x.id !== idExistente);
  const repSerie = otros.find((x) => clave(x.serie_motor) === clave(serie_motor));
  if (repSerie) throw new ErpError(`La serie de motor ${serie_motor} ya está registrada en ${repSerie.id} (${repSerie.modelo}, chasis ${repSerie.codigo_chasis}).`);
  const repChasis = otros.find((x) => clave(x.codigo_chasis) === clave(codigo_chasis));
  if (repChasis) throw new ErpError(`El código de chasis ${codigo_chasis} ya está registrado en ${repChasis.id} (${repChasis.modelo}, motor ${repChasis.serie_motor}).`);

  const anterior = idExistente ? getEquipos().find((x) => x.id === idExistente) : undefined;
  if (idExistente && !anterior) throw new ErpError("Equipo no encontrado.");
  const ahora = new Date().toISOString();
  const id = anterior?.id ?? (await nuevoId());
  if (!anterior && getEquipos().some((x) => x.id === id)) throw new ErpError(`El código ${id} ya existe: vuelva a intentar.`);
  const equipo: EquipoTerminado = {
    id,
    tipo_equipo: d.tipo_equipo,
    modelo,
    marca_motor: d.marca_motor,
    serie_motor,
    codigo_chasis,
    color,
    sede: d.sede,
    ubicacion_sede: d.sede,
    qc_aprobado: d.qc_aprobado,
    fecha_qc: d.qc_aprobado ? d.fecha_qc : null,
    supervisor_qc: d.qc_aprobado ? d.supervisor_qc?.trim() || null : null,
    observaciones_qc: d.qc_aprobado ? d.observaciones_qc?.trim() || null : null,
    // Un equipo ya vendido no vuelve a stock al editarlo
    estado: anterior?.estado === "VENDIDO" ? "VENDIDO" : d.qc_aprobado ? "DISPONIBLE" : "EN_QC",
    vendido_od: anterior?.vendido_od,
    fecha_venta: anterior?.fecha_venta,
    fecha_fabricacion: anterior?.fecha_fabricacion || ahora,
    fotos: d.fotos.slice(0, 3),
    creado_por: anterior?.creado_por ?? usuario,
    actualizado: ahora,
  };
  escribir(KEYS.EQUIPOS, [equipo, ...getEquipos().filter((x) => x.id !== id)]);
  return equipo;
}

/** Foto reducida a máx. 1280 px en JPEG (≈150-300 KB) para no inflar la fila. */
export function reducirFoto(file: File, lado = 1280): Promise<FotoEquipo> {
  return new Promise((ok, mal) => {
    if (!file.type.startsWith("image/")) return mal(new ErpError("La foto debe ser una imagen (JPG, PNG o WEBP)."));
    const r = new FileReader();
    r.onerror = () => mal(new ErpError("No se pudo leer la foto."));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => mal(new ErpError("Imagen inválida."));
      img.onload = () => {
        const k = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        ok({ nombre: file.name, url: c.toDataURL("image/jpeg", 0.75) });
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}
