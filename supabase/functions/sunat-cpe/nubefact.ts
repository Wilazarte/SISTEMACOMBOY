// PSE Nubefact (API JSON "Integración"): el PSE firma con SU certificado, envía a SUNAT y devuelve el CDR.
// El ERP manda los mismos datos ya validados y calculados por armarDocumento() (documento.ts), así los montos
// del PDF del ERP, del XML de Nubefact y de SUNAT son idénticos.
//
// Secretos: NUBEFACT_RUTA (URL única de la cuenta, p. ej. https://api.nubefact.com/api/v1/xxxxxxxx-...)
//           NUBEFACT_TOKEN (token de la misma pantalla "API - Integración" del panel de Nubefact)
// @ts-ignore - Deno es global en Supabase Edge Functions
declare const Deno: {
  env: { get(key: string): string | undefined };
};
import { type DocumentoCpe, m2, r10 } from "./documento.ts";

/** Catálogo de Nubefact: 1 factura, 2 boleta, 3 nota de crédito, 4 nota de débito. */
const TIPO_NUBEFACT: Record<string, number> = { "01": 1, "03": 2, "07": 3, "08": 4 };
/** tipo_de_igv de Nubefact: 1 gravado - operación onerosa, 8 exonerado, 9 inafecto. */
const IGV_NUBEFACT: Record<string, number> = { "10": 1, "20": 8, "30": 9 };

const fechaNf = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}-${m}-${a}`;
};
const n2 = (n: number) => Number(m2(n));

/**
 * Cuenta DEMO de Nubefact: solo deja emitir con sus series de prueba (FFF1 facturas y sus notas, BBB1 boletas y sus notas).
 * Secreto opcional NUBEFACT_SERIES, p. ej. "F001=FFF1,FC01=FFF1,FD01=FFF1,B001=BBB1,BC01=BBB1,BD01=BBB1":
 * el ERP sigue numerando con sus series y solo lo que viaja a Nubefact usa la serie de la demo. En producción se deja vacío.
 */
export function mapaSeries(texto = Deno.env.get("NUBEFACT_SERIES") ?? ""): Record<string, string> {
  const m: Record<string, string> = {};
  // Homologación: en producción las series que viajan a SUNAT deben ser las mismas del ERP (y del PDF).
  // Si NUBEFACT_SERIES quedó configurado desde la demo, se detiene aquí en vez de emitir con otra serie.
  if (texto.trim() && (Deno.env.get("SUNAT_ENTORNO") ?? "").trim().toLowerCase() === "produccion")
    throw new Error("NUBEFACT_SERIES es solo para la cuenta DEMO: bórrelo de los Secrets antes de emitir en producción.");
  for (const par of texto.split(",")) {
    const [de, a] = par.split("=").map((x) => x.trim().toUpperCase());
    if (de && a) m[de] = a;
  }
  return m;
}
function aplicarSeries(cuerpo: Record<string, unknown>): Record<string, unknown> {
  const m = mapaSeries();
  const c = { ...cuerpo };
  for (const k of ["serie", "documento_que_se_modifica_serie"]) {
    const v = c[k];
    if (typeof v === "string" && m[v]) c[k] = m[v];
  }
  return c;
}

export interface RespuestaPse {
  ok: boolean;
  aceptada: boolean;
  /** Código SUNAT (0 aceptado, 2xxx rechazo, 4xxx observación) si ya respondió. */
  codigo: string;
  descripcion: string;
  observaciones: string[];
  hash: string;
  qr: string;
  enlacePdf: string;
  enlaceXml: string;
  enlaceCdr: string;
  /** Error de validación de Nubefact (no llegó a SUNAT): se corrige y se reenvía. */
  error?: string;
  errorCodigo?: string;
}

/** JSON "generar_comprobante" de Nubefact. */
export function jsonNubefact(d: DocumentoCpe): Record<string, unknown> {
  const gravado = d.afectacion === "10";
  const totalOperacion = n2(d.baseImponible);
  const nota = d.tipo === "NOTA_CREDITO" || d.tipo === "NOTA_DEBITO";
  const [refSerie, refNumero] = (d.referencia?.id ?? "").split("-");
  return {
    operacion: "generar_comprobante",
    tipo_de_comprobante: TIPO_NUBEFACT[d.codigoTipo],
    serie: d.serie,
    numero: Number(d.correlativo),
    sunat_transaction: 1, // venta interna
    cliente_tipo_de_documento: d.cliente.tipoDoc,
    cliente_numero_de_documento: d.cliente.numDoc,
    cliente_denominacion: d.cliente.nombre,
    cliente_direccion: d.cliente.direccion ?? "",
    cliente_email: "",
    fecha_de_emision: fechaNf(d.fechaEmision),
    fecha_de_vencimiento: d.fechaVencimiento ? fechaNf(d.fechaVencimiento) : "",
    moneda: 1, // soles
    tipo_de_cambio: "",
    porcentaje_de_igv: 18.0,
    descuento_global: d.descuentoBase > 0 ? n2(d.descuentoBase) : "",
    total_descuento: d.descuentoBase > 0 ? n2(d.descuentoBase) : "",
    total_anticipo: "",
    total_gravada: gravado ? totalOperacion : "",
    total_exonerada: d.afectacion === "20" ? totalOperacion : "",
    total_inafecta: d.afectacion === "30" ? totalOperacion : "",
    total_igv: n2(d.igv),
    total_gratuita: "",
    total_otros_cargos: "",
    total: n2(d.total),
    detraccion: false,
    observaciones: "",
    documento_que_se_modifica_tipo: nota ? (d.referencia!.codigoTipo === "01" ? 1 : 2) : "",
    documento_que_se_modifica_serie: nota ? refSerie : "",
    documento_que_se_modifica_numero: nota ? Number(refNumero) : "",
    tipo_de_nota_de_credito: d.tipo === "NOTA_CREDITO" ? Number(d.motivo!.codigo) : "",
    tipo_de_nota_de_debito: d.tipo === "NOTA_DEBITO" ? Number(d.motivo!.codigo) : "",
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,
    codigo_unico: "",
    condiciones_de_pago: d.formaPago?.tipo === "Credito" ? "CRÉDITO" : d.formaPago ? "CONTADO" : "",
    medio_de_pago: "",
    placa_vehiculo: "",
    orden_compra_servicio: "",
    formato_de_pdf: "",
    ...(nota ? { observaciones: d.motivo!.descripcion } : {}),
    ...(d.formaPago?.tipo === "Credito"
      ? { venta_al_credito: d.formaPago.cuotas.map((q, i) => ({ cuota: i + 1, fecha_de_pago: fechaNf(q.fecha), importe: n2(q.monto) })) }
      : {}),
    items: d.lineas.map((l) => ({
      unidad_de_medida: l.unidad,
      codigo: "",
      codigo_producto_sunat: "",
      descripcion: l.descripcion,
      cantidad: r10(l.cantidad),
      valor_unitario: r10(l.valorUnitario),
      precio_unitario: r10(l.precioUnitario),
      descuento: "",
      subtotal: n2(l.valorVenta),
      tipo_de_igv: IGV_NUBEFACT[l.afectacion],
      igv: n2(l.igv),
      total: n2(l.valorVenta + l.igv),
      anticipo_regularizacion: false,
    })),
  };
}

async function llamar(ruta: string, token: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  let ultimo: unknown;
  const enviado = JSON.stringify(aplicarSeries(cuerpo)); // fuera del try: un error de configuración no se reintenta
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(ruta, {
        method: "POST",
        headers: { Authorization: `Token token="${token}"`, "Content-Type": "application/json" },
        body: enviado,
        signal: AbortSignal.timeout(60_000),
      });
      const texto = await r.text();
      try {
        return JSON.parse(texto) as Record<string, unknown>;
      } catch {
        throw new Error(`Nubefact respondió HTTP ${r.status}: ${texto.slice(0, 200)}`);
      }
    } catch (e) {
      ultimo = e;
      await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1)));
    }
  }
  throw new Error(`No se pudo conectar con Nubefact: ${(ultimo as Error)?.message ?? ultimo}`);
}

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function leer(r: Record<string, unknown>): RespuestaPse {
  if (r.errors) {
    return {
      ok: false,
      aceptada: false,
      codigo: "",
      descripcion: "",
      observaciones: [],
      hash: "",
      qr: "",
      enlacePdf: "",
      enlaceXml: "",
      enlaceCdr: "",
      error: txt(r.errors),
      errorCodigo: txt(r.codigo),
    };
  }
  const nota = txt(r.sunat_note);
  return {
    ok: true,
    aceptada: r.aceptada_por_sunat === true,
    codigo: txt(r.sunat_responsecode),
    descripcion: txt(r.sunat_description) || txt(r.sunat_soap_error),
    observaciones: nota ? nota.split(/\s*[|;]\s*|\n/).filter(Boolean) : [],
    hash: txt(r.codigo_hash),
    qr: txt(r.cadena_para_codigo_qr),
    enlacePdf: txt(r.enlace_del_pdf),
    enlaceXml: txt(r.enlace_del_xml),
    enlaceCdr: txt(r.enlace_del_cdr),
  };
}

export async function generarNubefact(ruta: string, token: string, d: DocumentoCpe): Promise<RespuestaPse> {
  return leer(await llamar(ruta, token, jsonNubefact(d)));
}

/** Operación libre (guías de remisión: generar_guia / consultar_guia) con la misma conexión, reintentos y series DEMO. */
export async function operacionNubefact(ruta: string, token: string, cuerpo: Record<string, unknown>): Promise<RespuestaPse> {
  return leer(await llamar(ruta, token, cuerpo));
}

export async function consultarNubefact(ruta: string, token: string, codigoTipo: string, serie: string, numero: string): Promise<RespuestaPse> {
  return leer(await llamar(ruta, token, { operacion: "consultar_comprobante", tipo_de_comprobante: TIPO_NUBEFACT[codigoTipo], serie, numero: Number(numero) }));
}

export interface RespuestaAnulacion {
  ok: boolean;
  aceptada: boolean;
  ticket: string;
  codigo: string;
  descripcion: string;
  enlaceCdr: string;
  error?: string;
}

function leerAnulacion(r: Record<string, unknown>): RespuestaAnulacion {
  if (r.errors) return { ok: false, aceptada: false, ticket: "", codigo: txt(r.codigo), descripcion: "", enlaceCdr: "", error: txt(r.errors) };
  return {
    ok: true,
    aceptada: r.aceptada_por_sunat === true,
    ticket: txt(r.sunat_ticket_numero),
    codigo: txt(r.sunat_responsecode),
    descripcion: txt(r.sunat_description) || txt(r.sunat_soap_error),
    enlaceCdr: txt(r.enlace_del_cdr),
  };
}

/** Anulación (Nubefact arma la comunicación de baja o el resumen diario según sea factura o boleta). */
export async function anularNubefact(ruta: string, token: string, codigoTipo: string, serie: string, numero: string, motivo: string) {
  return leerAnulacion(
    await llamar(ruta, token, {
      operacion: "generar_anulacion",
      tipo_de_comprobante: TIPO_NUBEFACT[codigoTipo],
      serie,
      numero: Number(numero),
      motivo: motivo.slice(0, 100),
      codigo_unico: "",
    })
  );
}

export async function consultarAnulacionNubefact(ruta: string, token: string, codigoTipo: string, serie: string, numero: string) {
  return leerAnulacion(
    await llamar(ruta, token, { operacion: "consultar_anulacion", tipo_de_comprobante: TIPO_NUBEFACT[codigoTipo], serie, numero: Number(numero) })
  );
}

/** Descarga un archivo de los enlaces de Nubefact (XML / CDR) para guardarlo en el ERP. */
export async function bajarEnlace(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Estado del comprobante según la respuesta del PSE (no se asume ACEPTADO):
 * aceptada sin observaciones -> ACEPTADO; aceptada con observaciones (4xxx) -> OBSERVADO;
 * código 2000-3999 -> RECHAZADO; error de validación del PSE -> EXCEPCION; sin respuesta aún -> ENVIADO.
 */
export function estadoPse(r: RespuestaPse): "ACEPTADO" | "OBSERVADO" | "RECHAZADO" | "EXCEPCION" | "ENVIADO" {
  if (!r.ok) return "EXCEPCION";
  const n = Number(r.codigo);
  if (r.aceptada) return r.observaciones.length || n >= 4000 ? "OBSERVADO" : "ACEPTADO";
  if (r.codigo && n >= 2000 && n < 4000) return "RECHAZADO";
  return "ENVIADO";
}

/**
 * Al reintentar, Nubefact responde "ya existe" y el ERP consulta ese número. Antes de darlo por propio se
 * compara la cadena del QR (RUC|TIPO|SERIE|NÚMERO|IGV|TOTAL|FECHA|TIPO DOC|N° DOC|HASH) con el documento:
 * si el número lo ocupa OTRO comprobante (p. ej. una prueba), se detiene en vez de marcarlo como aceptado.
 * Devuelve el motivo de la diferencia, o "" si coincide (o si el PSE no devolvió QR para comparar).
 */
export function diferenciaQr(r: RespuestaPse, d: DocumentoCpe): string {
  const p = (r.qr || "").split("|");
  if (p.length < 9) return "";
  const total = Number(p[5]);
  const numDoc = (p[8] || "").trim();
  if (Number.isFinite(total) && Math.abs(total - d.total) > 0.01)
    return `el total registrado en el PSE es S/ ${total.toFixed(2)} y el del ERP S/ ${d.total.toFixed(2)}`;
  if (numDoc && numDoc !== d.cliente.numDoc) return `el cliente registrado en el PSE es ${numDoc} y el del ERP ${d.cliente.numDoc}`;
  return "";
}
