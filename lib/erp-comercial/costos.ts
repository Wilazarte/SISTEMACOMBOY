// Cálculos de costo de producción, compartidos por la API, la página de costos y la tabla de Equipos.

export type MaterialIn = { nombre: string; cantidad: number; unidad: string; costoUnitario: number };
export type ManoObraIn = { rol: string; horas: number; costoHora: number };
export type ServicioIn = { nombre: string; costoMensual: number };
export type CostosIn = { diasFabricacion: number; materiales: MaterialIn[]; manoObra: ManoObraIn[]; servicios: ServicioIn[] };

export const prorratear = (costoMensual: number, dias: number) => (costoMensual / 30) * dias;

export function totalesCostos(c: CostosIn) {
  const materiales = c.materiales.reduce((s, m) => s + m.cantidad * m.costoUnitario, 0);
  const manoObra = c.manoObra.reduce((s, m) => s + m.horas * m.costoHora, 0);
  const servicios = c.servicios.reduce((s, x) => s + prorratear(x.costoMensual, c.diasFabricacion), 0);
  return { materiales, manoObra, servicios, total: materiales + manoObra + servicios };
}

export function rentabilidad(precio: number, costo: number) {
  const ganancia = precio - costo;
  return { ganancia, margen: precio > 0 ? (ganancia / precio) * 100 : null };
}

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(x) || x < 0) return 0;
  return x;
};
const s = (v: unknown) => String(v ?? "").trim();

/** Normaliza el cuerpo recibido por la API (números ≥ 0, textos recortados). */
export function parseCostos(b: unknown): CostosIn {
  const o = (b ?? {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    diasFabricacion: n(o.diasFabricacion),
    materiales: arr(o.materiales).map((m) => ({ nombre: s(m.nombre), cantidad: n(m.cantidad), unidad: s(m.unidad) || "und", costoUnitario: n(m.costoUnitario) })),
    manoObra: arr(o.manoObra).map((m) => ({ rol: s(m.rol), horas: n(m.horas), costoHora: n(m.costoHora) })),
    servicios: arr(o.servicios).map((x) => ({ nombre: s(x.nombre), costoMensual: n(x.costoMensual) })),
  };
}

/** include de Prisma para traer un costo con sus filas en orden. */
export const includeCostos = {
  materiales: { orderBy: { orden: "asc" } },
  manoObra: { orderBy: { orden: "asc" } },
  servicios: { orderBy: { orden: "asc" } },
} as const;

type CostoDB = {
  diasFabricacion: number;
  materiales: MaterialIn[];
  manoObra: ManoObraIn[];
  servicios: ServicioIn[];
};
/** Convierte un CostoProduccion de la BD (con filas) al formato del editor. */
export function aCostosIn(cp: CostoDB | null | undefined): CostosIn | null {
  if (!cp) return null;
  return {
    diasFabricacion: cp.diasFabricacion,
    materiales: cp.materiales.map(({ nombre, cantidad, unidad, costoUnitario }) => ({ nombre, cantidad, unidad, costoUnitario })),
    manoObra: cp.manoObra.map(({ rol, horas, costoHora }) => ({ rol, horas, costoHora })),
    servicios: cp.servicios.map(({ nombre, costoMensual }) => ({ nombre, costoMensual })),
  };
}
