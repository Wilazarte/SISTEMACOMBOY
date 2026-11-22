// Pruebas locales (sin SUNAT): deno test -A supabase/functions/sunat-cpe/tests/
// Arma factura, boleta, NC y ND desde comprobantes como los guarda el ERP, valida los cálculos con las
// reglas de SUNAT, firma con un certificado de prueba y verifica la firma. Con SALIDA_XML=<carpeta>
// deja los XML firmados y sus ZIP para revisarlos o enviarlos a beta.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { armarDocumento, ErrorCpe, nombreArchivo, type ComprobanteErp } from "../documento.ts";
import { xmlBaja, xmlComprobante } from "../ubl.ts";
import { firmarXml, leerPfx } from "../firma.ts";
import { zipXml, leerCdr } from "../sunat.ts";
import { enteroALetras, montoEnLetras } from "../letras.ts";
import { EMISOR_DEFECTO } from "../config.ts";
import { SignedXml } from "npm:xml-crypto@6.4.0";

const PFX = Deno.env.get("PFX_PRUEBA_B64") ?? "";
const CLAVE = Deno.env.get("PFX_PRUEBA_CLAVE") ?? "";
const SALIDA = Deno.env.get("SALIDA_XML");

const base = (o: Partial<ComprobanteErp>): ComprobanteErp => ({
  id: "c1",
  tipo: "FACTURA",
  serie: "F001",
  numero: "F001-0001",
  fecha: "2026-11-16",
  cliente: "MINERA DE PRUEBA S.A.C.",
  clienteDoc: "RUC 20100070970",
  clienteDireccion: "AV. LOS MINEROS 123 - AREQUIPA",
  items: [
    { productoNombre: "BOQUILLA DE MIG 1.0", descripcion: "Repuesto", unidad: "UND", cantidad: 3, precio: 25.5 },
    { productoNombre: "", descripcion: "Mantenimiento preventivo de remolcador", unidad: "UND", cantidad: 1, precio: 1180 },
    { productoNombre: "PLANCHA ANTIDESGASTE", descripcion: "", unidad: "M2", ancho: 1.2, alto: 2.4, m2: 5.76, cantidad: 2, precio: 99.99 },
  ],
  conIgv: true,
  preciosConIgv: true,
  descuento: 0,
  base: 0,
  igv: 0,
  total: 0,
  formaPago: "CONTADO",
  estado: "EMITIDO",
  historial: [{ fecha: "2026-11-16T15:30:00.000Z", accion: "Emitido" }],
  ...o,
});

/** Total igual al del ERP: suma de importes con IGV − descuento (precios con IGV). */
const totalErp = (c: ComprobanteErp) => {
  const bruto = Math.round(c.items.reduce((a, l) => a + Math.round(((l.m2 ?? 0) > 0 ? l.m2! : l.cantidad) * l.precio * 100) / 100, 0) * 100) / 100;
  return Math.round((bruto - c.descuento) * 100) / 100;
};

const conTotal = (c: ComprobanteErp) => ({ ...c, total: totalErp(c) });

Deno.test("montos en letras", () => {
  assertEquals(enteroALetras(1), "UNO");
  assertEquals(enteroALetras(21000), "VEINTIUN MIL");
  assertEquals(enteroALetras(1_001_101), "UN MILLON MIL CIENTO UNO");
  assertEquals(enteroALetras(100), "CIEN");
  assertEquals(montoEnLetras(1108.5), "SON MIL CIENTO OCHO CON 50/100 SOLES");
});

Deno.test("factura: cada línea y los totales cuadran (reglas de SUNAT)", () => {
  const d = armarDocumento(conTotal(base({ descuento: 50 })), EMISOR_DEFECTO);
  for (const l of d.lineas) {
    assert(Math.abs(l.cantidad * l.valorUnitario - l.valorVenta) < 0.01, `línea ${l.n}: cantidad × valor unitario`);
    assert(Math.abs(l.valorVenta * 0.18 - l.igv) <= 0.01, `línea ${l.n}: IGV 18 %`);
  }
  const suma = Math.round(d.lineas.reduce((a, l) => a + l.valorVenta, 0) * 100) / 100;
  assertEquals(d.sumaValorVenta, suma);
  assertEquals(d.baseImponible, Math.round((suma - d.descuentoBase) * 100) / 100);
  assertEquals(Math.round((d.baseImponible + d.igv) * 100) / 100, d.total);
  assert(Math.abs(d.baseImponible * 0.18 - d.igv) < 0.05);
  assertEquals(d.lineas[2].unidad, "MTK");
  assertEquals(d.lineas[1].unidad, "ZZ");
});

Deno.test("validaciones previas al envío", () => {
  assertThrows(() => armarDocumento(conTotal(base({ clienteDoc: "DNI 12345678" })), EMISOR_DEFECTO), ErrorCpe, "RUC");
  assertThrows(() => armarDocumento(conTotal(base({ estado: "BORRADOR" })), EMISOR_DEFECTO), ErrorCpe, "EMITIDOS");
  assertThrows(() => armarDocumento({ ...conTotal(base({})), total: 999 }, EMISOR_DEFECTO), ErrorCpe);
  assertThrows(
    () => armarDocumento(conTotal(base({ formaPago: "CREDITO", fechaVenc: "2026-11-16" })), EMISOR_DEFECTO),
    ErrorCpe,
    "DESPUÉS"
  );
});

let cert: ReturnType<typeof leerPfx> | undefined;
const certificado = () => (cert ??= leerPfx(PFX, CLAVE));

async function guardar(nombre: string, xml: string) {
  if (!SALIDA) return;
  await Deno.mkdir(SALIDA, { recursive: true });
  await Deno.writeTextFile(`${SALIDA}/${nombre}.xml`, xml);
  await Deno.writeTextFile(`${SALIDA}/${nombre}.zip.b64`, zipXml(nombre, xml));
}

function verificar(xml: string) {
  const sig = new SignedXml({ publicCert: certificado().certPem });
  const nodo = /<ds:Signature[\s\S]*<\/ds:Signature>/.exec(xml)![0];
  sig.loadSignature(nodo);
  assert(sig.checkSignature(xml), "la firma no verifica");
}

const casos: [string, ComprobanteErp, ComprobanteErp?][] = (() => {
  const fac = conTotal(base({ descuento: 50 }));
  const facCredito = conTotal(
    base({ numero: "F001-0002", formaPago: "CREDITO_CUOTAS", inicial: 100, cuotas: [] })
  );
  facCredito.cuotas = [
    { n: 1, fecha: "2026-12-16", monto: Math.round(((facCredito.total - 100) / 2) * 100) / 100 },
    { n: 2, fecha: "2027-01-15", monto: Math.round((facCredito.total - 100 - Math.round(((facCredito.total - 100) / 2) * 100) / 100) * 100) / 100 },
  ];
  facCredito.fechaVenc = "2027-01-15";
  const bol = conTotal(base({ tipo: "BOLETA", serie: "B001", numero: "B001-0001", clienteDoc: "DNI 46027897", cliente: "JUAN PEREZ QUISPE" }));
  const bolExo = conTotal(base({ tipo: "BOLETA", serie: "B001", numero: "B001-0002", conIgv: false, clienteDoc: "DNI 46027897", cliente: "JUAN PEREZ QUISPE" }));
  const nc = { ...fac, id: "nc1", tipo: "NOTA_CREDITO" as const, serie: "FC01", numero: "FC01-0001", ref: { id: fac.id, tipo: "FACTURA" as const, numero: fac.numero }, motivoCodigo: "01", motivoDescripcion: "Anulación de la operación" };
  const ndItems = [{ productoNombre: "", descripcion: "Intereses por pago fuera de plazo", unidad: "UND", cantidad: 1, precio: 118 }];
  const nd = conTotal(base({ id: "nd1", tipo: "NOTA_DEBITO", serie: "FD01", numero: "FD01-0001", items: ndItems, ref: { id: fac.id, tipo: "FACTURA", numero: fac.numero }, motivoCodigo: "01", motivoDescripcion: "Intereses por mora" }));
  return [
    ["factura-contado-descuento", fac],
    ["factura-credito-cuotas", facCredito],
    ["boleta-gravada", bol],
    ["boleta-inafecta", bolExo],
    ["nota-credito-anulacion", nc, fac],
    ["nota-debito-intereses", nd, fac],
  ];
})();

for (const [nombre, c, ref] of casos) {
  Deno.test({
    name: `XML firmado: ${nombre}`,
    ignore: !PFX,
    fn: async () => {
      const d = armarDocumento(c, EMISOR_DEFECTO, ref);
      const { xml, hash } = firmarXml(xmlComprobante(d), certificado(), (Deno.env.get("ALG") as "sha1") ?? "sha1");
      assert(hash.length > 20);
      assert(xml.includes(`<cbc:ID>${d.id}</cbc:ID>`));
      verificar(xml);
      await guardar(nombreArchivo(d), xml);
    },
  });
}

Deno.test({
  name: "XML firmado: comunicación de baja",
  ignore: !PFX,
  fn: async () => {
    const xml = firmarXml(
      xmlBaja(EMISOR_DEFECTO, "RA-20261116-1", "2026-11-16", "2026-11-16", [{ codigoTipo: "01", serie: "F001", correlativo: "0001", motivo: "ERROR EN DATOS" }]),
      certificado()
    ).xml;
    verificar(xml);
    await guardar(`${EMISOR_DEFECTO.ruc}-RA-20261116-1`, xml);
  },
});

Deno.test("lee un CDR de SUNAT", () => {
  const cdr = `<?xml version="1.0" encoding="UTF-8"?><ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><cbc:ID>1</cbc:ID><cbc:Note>4252 - El dato ingresado como atributo @listName es incorrecto.</cbc:Note><cac:DocumentResponse><cac:Response><cbc:ReferenceID>F001-0001</cbc:ReferenceID><cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>La Factura numero F001-0001, ha sido aceptada</cbc:Description></cac:Response></cac:DocumentResponse></ar:ApplicationResponse>`;
  const r = leerCdr(zipXml("R-20613238566-01-F001-0001", cdr));
  assertEquals(r.codigo, "0");
  assertEquals(r.descripcion, "La Factura numero F001-0001, ha sido aceptada");
  assertEquals(r.observaciones.length, 1);
});
