// Reglas para importar saldos de almacén (Excel "Current Balances": Nombre Único | Ubicación | Ctd).
// Archivo sin dependencias: lo usan la pantalla de Stock (Importar saldos) y scripts/import_stock_repuestos.js.

/** Ubicación del Excel -> sede del sistema. */
export const UBICACIONES: Record<string, string> = {
  ALMACEN: "Taller Principal Aqp",
  "ALMACEN AQP": "Almacen Aqp",
  "OFICINA LIMA": "Oficina Lima",
  LIMA: "Oficina Lima",
};
export const SEDE_POR_DEFECTO = "Taller Principal Aqp";

/** Unidad escrita al final del nombre ("PERNO M12 | UNIDAD") -> unidad del sistema. */
const SUFIJOS: Record<string, string> = {
  UNIDAD: "UND",
  UNIDADES: "UND",
  UND: "UND",
  UN: "UND",
  PZA: "PZA",
  PIEZA: "PZA",
  PAR: "PAR",
  ROLLO: "ROLLO",
  JUEGO: "JGO",
  JGO: "JGO",
  KG: "KG",
  LT: "LT",
  LITRO: "LT",
  GLN: "GLN",
  GALON: "GLN",
  CAJA: "CAJA",
  BOLSA: "BOLSA",
  M: "M",
  METRO: "M",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "CATALIZADOR euro 4  |  UNIDAD" -> { nombre: "CATALIZADOR EURO 4", unidadExplicita: "UND" } */
export function limpiarProducto(raw: unknown): { nombre: string; unidadExplicita?: string } {
  let s = String(raw ?? "").trim();
  let unidadExplicita: string | undefined;
  const m = /\|\s*([A-Za-zÁÉÍÓÚáéíóú.]+)\s*$/.exec(s);
  if (m) {
    const u = SUFIJOS[sinTildes(m[1]).toUpperCase().replace(/\./g, "")];
    if (u) {
      unidadExplicita = u;
      s = s.slice(0, m.index);
    }
  }
  return { nombre: s.replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim().toUpperCase(), unidadExplicita };
}

/**
 * Unidad del producto:
 * 1) la escrita en el nombre ("| UNIDAD" -> UND, "| ROLLO" -> ROLLO, "| PAR" -> PAR)
 * 2) ACEITE… -> LT  ·  CAJA DE 100… (caja con contenido) -> CAJA
 * 3) BALDE / LIQUIDO / SILICONA / AFLOJATODO -> UND
 * 4) resto -> PZA
 * "CAJA RETRO", "CAJA FILTRO DE AIRE", "PERNO CAJA RETRO" son repuestos (PZA), no cajas.
 */
export function inferirUnidad(nombre: string, unidadExplicita?: string): string {
  if (unidadExplicita) return unidadExplicita;
  const n = sinTildes(nombre).toUpperCase();
  if (/^ACEITE\b/.test(n)) return "LT";
  if (/^CAJA\s+(DE\s+|X\s*)?\d+/.test(n)) return "CAJA";
  if (/\b(BALDE|BAL|LIQUIDO|SILICONA|AFLOJATODO)\b/.test(n)) return "UND";
  return "PZA";
}

export interface ProductoSaldo {
  fila: number; // fila del Excel (1 = primera)
  nombre: string;
  unidad: string;
  sede: string;
  cantidad: number;
}

export interface LineaLog {
  fila: number;
  nivel: "OK" | "AVISO" | "ERROR";
  producto: string;
  mensaje: string;
}

export interface PlanSaldos {
  productos: ProductoSaldo[];
  log: LineaLog[];
  resumen: { filas: number; productos: number; conStock: number; enCero: number; unidades: Record<string, number>; avisos: number; errores: number };
}

const clave = (s: string) => sinTildes(String(s ?? "")).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Lee las filas del Excel (sheet_to_json con header: 1) y arma los productos a importar.
 * Detecta la fila de cabecera (Nombre / Ubicación / Ctd), limpia nombres, infiere unidad, convierte la cantidad a entero
 * y une productos repetidos (suma cantidades). Todo queda en el log.
 */
export function prepararSaldos(filas: unknown[][], sedeDefecto = SEDE_POR_DEFECTO): PlanSaldos {
  const log: LineaLog[] = [];
  const iCab = filas.findIndex((f) => f.some((c) => clave(String(c)).startsWith("nombre")) && f.some((c) => ["ctd", "cantidad", "cant", "saldo"].includes(clave(String(c)))));
  const cab = (iCab >= 0 ? filas[iCab] : ["Nombre Único", "Ubicación", "Ctd"]).map((c) => clave(String(c)));
  const cNom = Math.max(0, cab.findIndex((c) => c.startsWith("nombre") || c === "producto" || c === "descripcion"));
  const cUbi = cab.findIndex((c) => c.startsWith("ubicacion") || c === "sede" || c === "almacen");
  const cCtd = cab.findIndex((c) => ["ctd", "cantidad", "cant", "saldo"].includes(c));
  const datos = filas.slice(iCab + 1);
  const porClave = new Map<string, ProductoSaldo>();

  datos.forEach((f, i) => {
    const fila = iCab + 2 + i;
    if (f.every((c) => String(c ?? "").trim() === "")) return;
    const { nombre, unidadExplicita } = limpiarProducto(f[cNom]);
    if (!nombre) {
      log.push({ fila, nivel: "ERROR", producto: "", mensaje: "Fila sin nombre de producto: se omite." });
      return;
    }
    const ubic = cUbi >= 0 ? sinTildes(String(f[cUbi] ?? "")).trim().toUpperCase() : "";
    const sede = (ubic && UBICACIONES[ubic]) || sedeDefecto;
    if (ubic && !UBICACIONES[ubic]) log.push({ fila, nivel: "AVISO", producto: nombre, mensaje: `Ubicación "${ubic}" desconocida: se usa ${sedeDefecto}.` });
    const bruto = cCtd >= 0 ? f[cCtd] : 0;
    let cantidad = typeof bruto === "number" ? bruto : Number(String(bruto ?? "").replace(",", ".").trim() || 0);
    if (!Number.isFinite(cantidad)) {
      log.push({ fila, nivel: "AVISO", producto: nombre, mensaje: `Cantidad "${bruto}" no numérica: se importa 0.` });
      cantidad = 0;
    }
    if (cantidad < 0) {
      log.push({ fila, nivel: "AVISO", producto: nombre, mensaje: `Cantidad negativa (${cantidad}): se importa 0.` });
      cantidad = 0;
    }
    if (!Number.isInteger(cantidad)) {
      log.push({ fila, nivel: "AVISO", producto: nombre, mensaje: `Cantidad ${cantidad} con decimales: se redondea a ${Math.round(cantidad)}.` });
      cantidad = Math.round(cantidad);
    }
    const unidad = inferirUnidad(nombre, unidadExplicita);
    const k = `${sede}|${nombre}|${unidad}`;
    const previo = porClave.get(k);
    if (previo) {
      previo.cantidad += cantidad;
      log.push({ fila, nivel: "AVISO", producto: nombre, mensaje: `Repetido (fila ${previo.fila}): se suman las cantidades -> ${previo.cantidad}.` });
      return;
    }
    porClave.set(k, { fila, nombre, unidad, sede, cantidad });
    log.push({ fila, nivel: "OK", producto: nombre, mensaje: `${sede} · ${cantidad} ${unidad}${unidadExplicita ? " (unidad del nombre)" : ""}${cantidad === 0 ? " · sin stock" : ""}` });
  });

  const productos = [...porClave.values()];
  const unidades: Record<string, number> = {};
  productos.forEach((p) => (unidades[p.unidad] = (unidades[p.unidad] ?? 0) + 1));
  return {
    productos,
    log,
    resumen: {
      filas: datos.filter((f) => !f.every((c) => String(c ?? "").trim() === "")).length,
      productos: productos.length,
      conStock: productos.filter((p) => p.cantidad > 0).length,
      enCero: productos.filter((p) => p.cantidad === 0).length,
      unidades,
      avisos: log.filter((l) => l.nivel === "AVISO").length,
      errores: log.filter((l) => l.nivel === "ERROR").length,
    },
  };
}
