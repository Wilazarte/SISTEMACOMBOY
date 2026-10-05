"use client";

// =====================================================================
// ALMACÉN › EQUIPOS TERMINADOS (equipos fabricados): un registro por equipo.
// Tabla almacen, tipo EQUIPO_TERMINADO, id EQ-2026-0001 (correlativo).
// Serie de motor y código de chasis / VIN son únicos.
// =====================================================================

import { ErpError, KEYS, escribir, hoy, leer, siguienteNumero } from "./storage";

export const TIPOS_EQUIPO = ["DUMPER", "MINICARGADOR", "MIXER", "LOCOMOTORA", "OTRO"] as const;
export const MARCAS_MOTOR = ["KUBOTA", "YANMAR", "HONDA", "LOMBARDINI", "OTRO"] as const;
export const SEDES_EQUIPO = ["Planta Arequipa", "Lima", "Mina"] as const;

export type TipoEquipo = (typeof TIPOS_EQUIPO)[number];
export type MarcaMotor = (typeof MARCAS_MOTOR)[number];
export type EstadoEquipo = "DISPONIBLE" | "EN_QC";

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
  qc_aprobado: boolean;
  fecha_qc: string | null;
  supervisor_qc: string | null;
  observaciones_qc: string | null;
  estado: EstadoEquipo;
  fecha_fabricacion: string; // ISO
  fotos: FotoEquipo[];
  creado_por: string;
  actualizado: string; // ISO
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
  sede: SEDES_EQUIPO[0],
  qc_aprobado: false,
  fecha_qc: hoy(),
  supervisor_qc: "",
  observaciones_qc: "",
  fotos: [],
});

export const getEquipos = () => leer<EquipoTerminado[]>(KEYS.EQUIPOS, []);

/** Para comparar únicos: sin espacios, mayúsculas. */
const clave = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** Siguiente EQ-AAAA-0001: atómico en Supabase; si la serie EQ aún no está habilitada, por el mayor existente del año. */
async function nuevoId(): Promise<string> {
  try {
    return await siguienteNumero("EQ");
  } catch (e) {
    const msg = (e as Error).message;
    if (!/serie inv|falta la funci/i.test(msg)) throw e;
    const anio = new Date().getFullYear();
    const max = getEquipos()
      .map((x) => new RegExp(`^EQ-${anio}-(\\d+)$`).exec(x.id)?.[1])
      .reduce((m, n) => Math.max(m, Number(n ?? 0)), 0);
    return `EQ-${anio}-${String(max + 1).padStart(4, "0")}`;
  }
}

/** Registra (o actualiza) un equipo terminado. Estado: QC aprobado -> DISPONIBLE; si no -> EN_QC. */
export async function guardarEquipo(d: DatosEquipo, usuario: string, idExistente?: string): Promise<EquipoTerminado> {
  const modelo = d.modelo.trim().toUpperCase();
  const serie_motor = d.serie_motor.trim().toUpperCase();
  const codigo_chasis = d.codigo_chasis.trim().toUpperCase();
  const color = d.color.trim();
  if (!TIPOS_EQUIPO.includes(d.tipo_equipo)) throw new ErpError("Seleccione el tipo de equipo.");
  if (!modelo) throw new ErpError("Indique el modelo (ej. CV-D500).");
  if (!MARCAS_MOTOR.includes(d.marca_motor)) throw new ErpError("Seleccione la marca del motor.");
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
    qc_aprobado: d.qc_aprobado,
    fecha_qc: d.qc_aprobado ? d.fecha_qc : null,
    supervisor_qc: d.qc_aprobado ? d.supervisor_qc?.trim() || null : null,
    observaciones_qc: d.qc_aprobado ? d.observaciones_qc?.trim() || null : null,
    estado: d.qc_aprobado ? "DISPONIBLE" : "EN_QC",
    fecha_fabricacion: anterior?.fecha_fabricacion ?? ahora,
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
