// PSE Nubefact: JSON que se envía (cuadre de montos) y lectura de respuestas, contra un Nubefact simulado.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { armarDocumento, type ComprobanteErp } from "../documento.ts";
import { EMISOR_DEFECTO } from "../config.ts";
import { anularNubefact, diferenciaQr, estadoPse, generarNubefact, jsonNubefact, mapaSeries, type RespuestaPse } from "../nubefact.ts";
import { assertThrows } from "jsr:@std/assert@1";

const fac: ComprobanteErp = {
  id: "c1",
  tipo: "FACTURA",
  serie: "F001",
  numero: "F001-0007",
  fecha: "2026-11-16",
  cliente: "MINERA DE PRUEBA S.A.C.",
  clienteDoc: "RUC 20100070970",
  clienteDireccion: "AV. LOS MINEROS 123",
  items: [
    { productoNombre: "BOQUILLA DE MIG 1.0", descripcion: "", unidad: "UND", cantidad: 3, precio: 25.5 },
    { productoNombre: "", descripcion: "Mantenimiento", unidad: "UND", cantidad: 1, precio: 1180 },
  ],
  conIgv: true,
  preciosConIgv: true,
  descuento: 50,
  base: 0,
  igv: 0,
  total: 1206.5,
  formaPago: "CREDITO_CUOTAS",
  inicial: 6.5,
  cuotas: [
    { n: 1, fecha: "2026-12-16", monto: 600 },
    { n: 2, fecha: "2027-01-15", monto: 600 },
  ],
  fechaVenc: "2027-01-15",
  estado: "EMITIDO",
};

Deno.test("JSON Nubefact: montos cuadran", () => {
  const j = jsonNubefact(armarDocumento(fac, EMISOR_DEFECTO)) as Record<string, any>;
  assertEquals(j.tipo_de_comprobante, 1);
  assertEquals(j.serie, "F001");
  assertEquals(j.numero, 7);
  assertEquals(j.fecha_de_emision, "16-11-2026");
  assertEquals(j.cliente_tipo_de_documento, "6");
  const sumaSub = j.items.reduce((a: number, i: any) => a + i.subtotal, 0);
  assert(Math.abs(sumaSub - j.descuento_global - j.total_gravada) < 0.01, "total_gravada = Σ subtotal − descuento");
  assert(Math.abs(j.total_gravada + j.total_igv - j.total) < 0.01, "total = gravada + IGV");
  for (const i of j.items) {
    assert(Math.abs(i.cantidad * i.valor_unitario - i.subtotal) < 0.01);
    assert(Math.abs(i.subtotal + i.igv - i.total) < 0.01);
    assertEquals(i.tipo_de_igv, 1);
  }
  assertEquals(j.venta_al_credito.length, 2);
  assertEquals(j.venta_al_credito[0].fecha_de_pago, "16-12-2026");
});

Deno.test("JSON Nubefact: nota de crédito y boleta inafecta", () => {
  const nc = jsonNubefact(
    armarDocumento(
      { ...fac, id: "n1", tipo: "NOTA_CREDITO", serie: "FC01", numero: "FC01-0001", formaPago: "CONTADO", cuotas: [], ref: { id: "c1", tipo: "FACTURA", numero: "F001-0007" }, motivoCodigo: "01", motivoDescripcion: "Anulación" },
      EMISOR_DEFECTO,
      fac
    )
  ) as Record<string, any>;
  assertEquals(nc.tipo_de_comprobante, 3);
  assertEquals(nc.tipo_de_nota_de_credito, 1);
  assertEquals(nc.documento_que_se_modifica_tipo, 1);
  assertEquals(nc.documento_que_se_modifica_serie, "F001");
  assertEquals(nc.documento_que_se_modifica_numero, 7);
  const bol = jsonNubefact(
    armarDocumento({ ...fac, tipo: "BOLETA", serie: "B001", numero: "B001-0001", clienteDoc: "DNI 46027897", conIgv: false, descuento: 0, total: 1256.5, formaPago: "CONTADO", cuotas: [] }, EMISOR_DEFECTO)
  ) as Record<string, any>;
  assertEquals(bol.tipo_de_comprobante, 2);
  assertEquals(bol.total_inafecta, 1256.5);
  assertEquals(bol.total_igv, 0);
  assertEquals(bol.items[0].tipo_de_igv, 9);
});

Deno.test("cliente Nubefact contra servidor simulado", async () => {
  let auth = "";
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, async (req) => {
    auth = req.headers.get("Authorization") ?? "";
    const b = await req.json();
    if (b.operacion === "generar_anulacion") return Response.json({ numero: b.numero, sunat_ticket_numero: "123", aceptada_por_sunat: true, sunat_description: "La Comunicacion de baja RA-1, ha sido aceptada", sunat_responsecode: "0", enlace_del_cdr: "" });
    if (b.numero === 9) return Response.json({ errors: "El documento indicado ya existe", codigo: 23 });
    return Response.json({ tipo_de_comprobante: 1, serie: b.serie, numero: b.numero, aceptada_por_sunat: true, sunat_description: `La Factura numero ${b.serie}-${b.numero}, ha sido aceptada`, sunat_note: null, sunat_responsecode: "0", codigo_hash: "abc=", cadena_para_codigo_qr: "x|y", enlace_del_pdf: "https://x/pdf", enlace_del_xml: "", enlace_del_cdr: "" });
  });
  const ruta = `http://localhost:${server.addr.port}/api/v1/demo`;
  try {
    const d = armarDocumento(fac, EMISOR_DEFECTO);
    const r = await generarNubefact(ruta, "TOKEN123", d);
    assert(r.ok && r.aceptada);
    assertEquals(r.codigo, "0");
    assertEquals(r.hash, "abc=");
    assertEquals(auth, 'Token token="TOKEN123"');
    const dup = await generarNubefact(ruta, "TOKEN123", { ...d, correlativo: "9" });
    assertEquals(dup.ok, false);
    assertEquals(dup.errorCodigo, "23");
    const an = await anularNubefact(ruta, "TOKEN123", "01", "F001", "0007", "ERROR");
    assert(an.aceptada);
    assertEquals(an.ticket, "123");
  } finally {
    ac.abort();
    await server.finished;
  }
});

const resp = (x: Partial<RespuestaPse>): RespuestaPse => ({
  ok: true, aceptada: false, codigo: "", descripcion: "", observaciones: [], hash: "", qr: "", enlacePdf: "", enlaceXml: "", enlaceCdr: "", ...x,
});

Deno.test("Homologación: el estado sale de la respuesta (nunca se asume ACEPTADO)", () => {
  assertEquals(estadoPse(resp({ aceptada: true, codigo: "0" })), "ACEPTADO");
  assertEquals(estadoPse(resp({ aceptada: true, codigo: "4287", observaciones: ["obs"] })), "OBSERVADO");
  assertEquals(estadoPse(resp({ codigo: "2800" })), "RECHAZADO");
  assertEquals(estadoPse(resp({})), "ENVIADO");
  assertEquals(estadoPse(resp({ ok: false, error: "x" })), "EXCEPCION");
});

Deno.test("Homologación: un número ya ocupado por OTRO comprobante no se da por propio", () => {
  const d = armarDocumento(fac, EMISOR_DEFECTO);
  const propio = `20613238566|01|F001|7|${d.igv.toFixed(2)}|${d.total.toFixed(2)}|2026-11-16|6|${d.cliente.numDoc}|hash|`;
  assertEquals(diferenciaQr(resp({ qr: propio }), d), "");
  const ajeno = `20613238566|01|F001|7|18.00|118.00|2026-11-16|6|20123456789|hash|`;
  assert(diferenciaQr(resp({ qr: ajeno }), d).length > 0);
});

Deno.test("Homologación: NUBEFACT_SERIES (demo) no se usa en producción", () => {
  Deno.env.set("SUNAT_ENTORNO", "produccion");
  try {
    assertThrows(() => mapaSeries("F001=FFF1"));
    assertEquals(mapaSeries(""), {});
  } finally {
    Deno.env.delete("SUNAT_ENTORNO");
  }
});

Deno.test("Homologación: fecha de emisión futura se rechaza", () => {
  assertThrows(() => armarDocumento({ ...fac, fecha: "2999-01-01" }, EMISOR_DEFECTO));
});

Deno.test("NUBEFACT_SERIES: series de la cuenta demo", () => {
  const m = mapaSeries("F001=FFF1, fc01=fff1,B001=BBB1,,malo");
  assertEquals(m, { F001: "FFF1", FC01: "FFF1", B001: "BBB1" });
  assertEquals(mapaSeries(""), {});
});
