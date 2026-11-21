// Del comprobante del ERP (ventas.data, tipo 'comprobante') al documento electrónico normalizado que se
// convierte en XML UBL 2.1. Aquí se hacen TODOS los cálculos y validaciones previas al envío: si algo no
// cumple las reglas de SUNAT se detiene aquí con un mensaje claro, antes de gastar un correlativo en SUNAT.

import { montoEnLetras } from "./letras.ts";

// ---------------------------------------------------------------------
// Catálogos SUNAT usados
// ---------------------------------------------------------------------

/** Catálogo 01: tipo de comprobante. */
export const TIPO_CPE = { FACTURA: "01", BOLETA: "03", NOTA_CREDITO: "07", NOTA_DEBITO: "08" } as const;
export type TipoErp = keyof typeof TIPO_CPE;

/** Catálogo 06: tipo de documento de identidad. */
export const TIPO_DOC_IDENTIDAD: Record<string, string> = { DNI: "1", CE: "4", RUC: "6", PASAPORTE: "7" };

/** Catálogo 09: motivos de nota de crédito que el ERP emite. */
export const MOTIVOS_NC: Record<string, string> = {
  "01": "Anulación de la operación",
  "02": "Anulación por error en el RUC",
  "06": "Devolución total",
  "09": "Disminución en el valor",
};
/** Catálogo 10: motivos de nota de débito. */
export const MOTIVOS_ND: Record<string, string> = {
  "01": "Intereses por mora",
  "02": "Aumento en el valor",
  "03": "Penalidades / otros conceptos",
};

/**
 * Catálogo 03 (UN/ECE rec. 20). Unidades del ERP (lib/empresa.ts UNIDADES). Las que no tienen equivalente
 * exacto van como NIU (unidad, bienes); los servicios (línea sin producto) como ZZ.
 */
export const UNIDAD_SUNAT: Record<string, string> = {
  UND: "NIU",
  PZA: "C62",
  KG: "KGM",
  M: "MTR",
  M2: "MTK",
  M3: "MTQ",
  GLN: "GLL",
  LT: "LTR",
  CAJA: "BX",
  PAR: "PR",
  JGO: "SET",
  BOLSA: "BG",
  ROLLO: "NIU",
};

/** Catálogo 07 + catálogo 05: afectación del IGV y su tributo. */
export const AFECTACION = {
  "10": { tributo: "1000", nombre: "IGV", tipo: "VAT", porcentaje: 18 }, // Gravado - operación onerosa
  "20": { tributo: "9997", nombre: "EXO", tipo: "VAT", porcentaje: 0 }, // Exonerado - operación onerosa
  "30": { tributo: "9998", nombre: "INA", tipo: "FRE", porcentaje: 0 }, // Inafecto - operación onerosa
} as const;
export type CodigoAfectacion = keyof typeof AFECTACION;

export const IGV = 0.18;

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

/** Lo que el Edge Function lee de ventas.data (ver lib/types.ts ComprobanteVenta). */
export interface ComprobanteErp {
  id: string;
  tipo: TipoErp;
  serie: string;
  numero: string;
  fecha: string; // AAAA-MM-DD
  cliente: string;
  clienteDoc: string; // "RUC 20123456789"
  clienteDireccion?: string;
  items: {
    productoNombre: string;
    descripcion: string;
    unidad: string;
    ancho?: number;
    alto?: number;
    m2?: number;
    cantidad: number;
    precio: number;
    total?: number;
  }[];
  conIgv: boolean;
  preciosConIgv?: boolean;
  descuento: number;
  base: number;
  igv: number;
  total: number;
  formaPago: "CONTADO" | "CREDITO" | "CREDITO_CUOTAS";
  fechaVenc?: string;
  inicial?: number;
  cuotas?: { n: number; fecha: string; monto: number }[];
  estado: string;
  /** Notas de crédito / débito: documento que modifican y motivo (catálogos 09 / 10). */
  ref?: { id: string; tipo: TipoErp; numero: string; fecha?: string };
  motivoCodigo?: string;
  motivoDescripcion?: string;
  /** Afectación de las líneas sin IGV (boleta sin IGV): 30 inafecto (por defecto, como la representación impresa "Op. inafecta") o 20 exonerado. */
  afectacionSinIgv?: "20" | "30";
  historial?: { fecha?: string; accion?: string }[];
}

export interface Emisor {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  direccion: string;
  codigoEstablecimiento: string; // 0000 = domicilio fiscal
}

export interface LineaCpe {
  n: number;
  descripcion: string;
  unidad: string;
  cantidad: number; // hasta 10 decimales
  valorUnitario: number; // sin IGV, hasta 10 decimales (cac:Price)
  precioUnitario: number; // con IGV, hasta 10 decimales (PricingReference, tipo 01)
  valorVenta: number; // cantidad × valor unitario, 2 decimales
  igv: number;
  afectacion: CodigoAfectacion;
}

export interface DocumentoCpe {
  tipo: TipoErp;
  codigoTipo: string; // catálogo 01
  serie: string;
  correlativo: string;
  id: string; // F001-0001
  fechaEmision: string;
  horaEmision: string;
  fechaVencimiento?: string;
  moneda: "PEN";
  emisor: Emisor;
  cliente: { tipoDoc: string; numDoc: string; nombre: string; direccion?: string };
  lineas: LineaCpe[];
  afectacion: CodigoAfectacion;
  /** Descuento global que afecta la base imponible (catálogo 53, código 02), sin IGV. */
  descuentoBase: number;
  sumaValorVenta: number; // suma de valores de venta de las líneas
  baseImponible: number; // sumaValorVenta − descuentoBase
  igv: number;
  total: number;
  leyenda: string;
  formaPago?: { tipo: "Contado" } | { tipo: "Credito"; montoPendiente: number; cuotas: { monto: number; fecha: string }[] };
  referencia?: { codigoTipo: string; id: string };
  motivo?: { codigo: string; descripcion: string };
}

export class ErrorCpe extends Error {}

// ---------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const r10 = (n: number) => Math.round(n * 1e10) / 1e10;

/** Monto con 2 decimales exactos para el XML. */
export const m2 = (n: number) => r2(n).toFixed(2);
/** Cantidad / precio con hasta 10 decimales, sin ceros sobrantes. */
export const dec = (n: number) => {
  const s = r10(n).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};

/** Hora de emisión (America/Lima) a partir del evento "Emitido" del historial, o la hora actual. */
function horaLima(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .format(t)
    .replace(/^24/, "00");
}

function limpiarTexto(s: string, max: number): string {
  // Sin caracteres de control (rompen el XML) y sin espacios repetidos
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ---------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------

export function armarDocumento(c: ComprobanteErp, emisor: Emisor, ref?: ComprobanteErp): DocumentoCpe {
  if (!(c.tipo in TIPO_CPE)) throw new ErrorCpe(`Tipo de comprobante no soportado: ${c.tipo}`);
  if (c.estado !== "EMITIDO") throw new ErrorCpe("Solo se envían a SUNAT comprobantes EMITIDOS (no borradores ni anulados).");
  const codigoTipo = TIPO_CPE[c.tipo];
  const [serie, correlativo] = (c.numero || "").split("-");
  if (!serie || !correlativo) throw new ErrorCpe(`Número de comprobante inválido: "${c.numero}".`);
  if (!/^[0-9]{1,8}$/.test(correlativo) || Number(correlativo) < 1) throw new ErrorCpe(`Correlativo inválido (1 a 8 dígitos): ${correlativo}`);

  // Serie según tipo (F… factura y sus notas; B… boleta y sus notas)
  const familia = c.tipo === "FACTURA" || c.tipo === "BOLETA" ? c.tipo : ref?.tipo;
  if (familia === "FACTURA" && !/^F[A-Z0-9]{3}$/.test(serie)) throw new ErrorCpe(`La serie ${serie} no corresponde a factura (debe empezar con F).`);
  if (familia === "BOLETA" && !/^B[A-Z0-9]{3}$/.test(serie)) throw new ErrorCpe(`La serie ${serie} no corresponde a boleta (debe empezar con B).`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) throw new ErrorCpe(`Fecha de emisión inválida: ${c.fecha}`);

  // Cliente
  const [tipoDocTxt, ...resto] = (c.clienteDoc || "").trim().split(/\s+/);
  const numDoc = resto.join("");
  const tipoDoc = TIPO_DOC_IDENTIDAD[(tipoDocTxt || "").toUpperCase()];
  if (!tipoDoc || !numDoc) throw new ErrorCpe(`Documento del cliente inválido: "${c.clienteDoc}".`);
  if (familia === "FACTURA" && tipoDoc !== "6") throw new ErrorCpe("La factura (y sus notas) requiere un cliente con RUC.");
  if (tipoDoc === "6" && !/^(10|15|16|17|20)\d{9}$/.test(numDoc)) throw new ErrorCpe(`RUC del cliente inválido: ${numDoc}`);
  if (tipoDoc === "1" && !/^\d{8}$/.test(numDoc)) throw new ErrorCpe(`DNI del cliente inválido: ${numDoc}`);
  const nombre = limpiarTexto(c.cliente || "", 1500);
  if (nombre.length < 2) throw new ErrorCpe("Falta el nombre o razón social del cliente.");

  // Afectación: factura siempre gravada; boleta sin IGV = inafecto (o exonerado si así se marcó)
  const afectacion: CodigoAfectacion = c.conIgv ? "10" : c.afectacionSinIgv ?? "30";
  const gravado = afectacion === "10";
  const conIgvIncluido = c.preciosConIgv === true;

  // Líneas: cada una cuadra por sí sola (valor venta = cantidad × valor unitario; IGV = 18 % del valor venta)
  if (!c.items?.length) throw new ErrorCpe("El comprobante no tiene ítems.");
  const lineas: LineaCpe[] = c.items.map((l, i) => {
    const conMedidas = (l.m2 ?? 0) > 0;
    const cantidad = conMedidas ? Number(l.m2) : Number(l.cantidad);
    const precio = Number(l.precio);
    if (!(cantidad > 0)) throw new ErrorCpe(`Ítem ${i + 1}: la cantidad debe ser mayor a 0.`);
    if (!(precio > 0)) throw new ErrorCpe(`Ítem ${i + 1}: el precio debe ser mayor a 0 (las transferencias gratuitas no están habilitadas).`);
    const importe = r2(cantidad * precio); // lo mismo que calcularLinea() del ERP
    let valorVenta: number;
    let igv: number;
    if (!gravado) {
      valorVenta = importe;
      igv = 0;
    } else if (conIgvIncluido) {
      valorVenta = r2(importe / (1 + IGV));
      igv = r2(importe - valorVenta);
    } else {
      valorVenta = importe;
      igv = r2(importe * IGV);
    }
    const medidas = conMedidas && l.ancho && l.alto ? ` (${l.cantidad} pza ${l.ancho} x ${l.alto} m)` : "";
    const descripcion = limpiarTexto([l.productoNombre, l.descripcion].filter((x) => x && x.trim()).join(" - ") + medidas, 500);
    if (!descripcion) throw new ErrorCpe(`Ítem ${i + 1}: falta la descripción.`);
    const unidad = conMedidas ? "MTK" : !l.productoNombre?.trim() ? "ZZ" : UNIDAD_SUNAT[(l.unidad || "").toUpperCase()] ?? "NIU";
    return {
      n: i + 1,
      descripcion,
      unidad,
      cantidad: r10(cantidad),
      valorUnitario: r10(valorVenta / cantidad),
      precioUnitario: r10((valorVenta + igv) / cantidad),
      valorVenta,
      igv,
      afectacion,
    };
  });

  const sumaValorVenta = r2(lineas.reduce((a, l) => a + l.valorVenta, 0));
  const sumaConIgv = r2(lineas.reduce((a, l) => a + l.valorVenta + l.igv, 0));
  // Descuento global (cat. 53 código 02): afecta la base imponible. En el ERP se resta del total con IGV.
  const descuento = r2(Math.max(0, Number(c.descuento) || 0));
  const descuentoBase = descuento <= 0 ? 0 : gravado && conIgvIncluido ? r2(descuento / (1 + IGV)) : descuento;
  const baseImponible = r2(sumaValorVenta - descuentoBase);
  // El total es el que cobró el ERP (no se recalcula). El IGV sale por diferencia y se valida contra el 18 %.
  const total = r2(Number(c.total));
  const igv = gravado ? r2(total - baseImponible) : 0;
  if (!(total > 0)) throw new ErrorCpe("El total debe ser mayor a 0.");
  if (!gravado && Math.abs(total - baseImponible) > 0.01)
    throw new ErrorCpe(`Los ítems (S/ ${baseImponible.toFixed(2)}) no cuadran con el total del comprobante (S/ ${total.toFixed(2)}).`);
  if (gravado && Math.abs(igv - baseImponible * IGV) > 0.05)
    throw new ErrorCpe(`El IGV (S/ ${igv.toFixed(2)}) no es el 18 % de la base (S/ ${baseImponible.toFixed(2)}): revise los importes.`);
  const esperado = !gravado
    ? baseImponible
    : conIgvIncluido
      ? r2(sumaConIgv - descuento)
      : r2(baseImponible + r2(baseImponible * IGV));
  if (Math.abs(esperado - total) > 0.05)
    throw new ErrorCpe(`La suma de los ítems (S/ ${esperado.toFixed(2)}) no cuadra con el total del comprobante (S/ ${total.toFixed(2)}).`);

  // Forma de pago (obligatoria en facturas y sus notas de crédito desde 2021)
  let formaPago: DocumentoCpe["formaPago"];
  if (c.tipo === "FACTURA") {
    if (c.formaPago === "CONTADO") formaPago = { tipo: "Contado" };
    else {
      const montoPendiente = r2(total - (Number(c.inicial) || 0));
      const cuotas = c.cuotas?.length
        ? c.cuotas.map((q) => ({ monto: r2(q.monto), fecha: q.fecha }))
        : [{ monto: montoPendiente, fecha: c.fechaVenc || "" }];
      if (cuotas.some((q) => !/^\d{4}-\d{2}-\d{2}$/.test(q.fecha) || q.fecha <= c.fecha))
        throw new ErrorCpe("Factura al crédito: cada cuota debe vencer DESPUÉS de la fecha de emisión (use días de crédito mayores a 0).");
      if (Math.abs(r2(cuotas.reduce((a, q) => a + q.monto, 0)) - montoPendiente) > 0.01)
        throw new ErrorCpe("Factura al crédito: la suma de las cuotas no coincide con el monto pendiente.");
      if (!(montoPendiente > 0)) throw new ErrorCpe("Factura al crédito sin monto pendiente: emítala al CONTADO.");
      formaPago = { tipo: "Credito", montoPendiente, cuotas };
    }
  }

  // Notas: referencia y motivo
  let referencia: DocumentoCpe["referencia"];
  let motivo: DocumentoCpe["motivo"];
  if (c.tipo === "NOTA_CREDITO" || c.tipo === "NOTA_DEBITO") {
    if (!ref || !c.ref) throw new ErrorCpe("La nota no tiene el comprobante de referencia.");
    if (ref.tipo !== "FACTURA" && ref.tipo !== "BOLETA") throw new ErrorCpe("La nota solo puede modificar una factura o boleta.");
    const catalogo = c.tipo === "NOTA_CREDITO" ? MOTIVOS_NC : MOTIVOS_ND;
    const codigo = c.motivoCodigo ?? "";
    if (!catalogo[codigo]) throw new ErrorCpe(`Motivo de la nota inválido: ${codigo}`);
    const sustento = limpiarTexto(c.motivoDescripcion || catalogo[codigo], 250);
    referencia = { codigoTipo: TIPO_CPE[ref.tipo], id: ref.numero };
    motivo = { codigo, descripcion: sustento };
    if (["01", "02", "06"].includes(codigo) && c.tipo === "NOTA_CREDITO" && Math.abs(total - r2(ref.total)) > 0.01)
      throw new ErrorCpe(`Motivo ${codigo} (${catalogo[codigo]}): la nota debe ser por el total del comprobante (S/ ${r2(ref.total).toFixed(2)}).`);
    if (c.tipo === "NOTA_CREDITO" && total > r2(ref.total) + 0.01) throw new ErrorCpe("La nota de crédito no puede superar el total del comprobante.");
  }

  const emitido = [...(c.historial ?? [])].reverse().find((e) => e.accion === "Emitido");
  return {
    tipo: c.tipo,
    codigoTipo,
    serie,
    correlativo,
    id: `${serie}-${correlativo}`,
    fechaEmision: c.fecha,
    horaEmision: horaLima(emitido?.fecha),
    fechaVencimiento: c.tipo === "FACTURA" && c.formaPago !== "CONTADO" && c.fechaVenc && c.fechaVenc > c.fecha ? c.fechaVenc : undefined,
    moneda: "PEN",
    emisor,
    cliente: { tipoDoc, numDoc, nombre, direccion: c.clienteDireccion ? limpiarTexto(c.clienteDireccion, 200) : undefined },
    lineas,
    afectacion,
    descuentoBase,
    sumaValorVenta,
    baseImponible,
    igv,
    total,
    leyenda: montoEnLetras(total),
    formaPago,
    referencia,
    motivo,
  };
}

/** Nombre del archivo SUNAT: RUC-TIPO-SERIE-CORRELATIVO (sin extensión). */
export const nombreArchivo = (d: Pick<DocumentoCpe, "emisor" | "codigoTipo" | "serie" | "correlativo">) =>
  `${d.emisor.ruc}-${d.codigoTipo}-${d.serie}-${d.correlativo}`;
