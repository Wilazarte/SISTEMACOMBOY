// Prueba del cliente SOAP contra un SUNAT simulado (sin red): sendBill con CDR, error SOAP, sendSummary + getStatus.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.3";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { getStatus, sendBill, sendSummary, zipXml, estadoDeCodigo } from "../sunat.ts";

const cred = { ruc: "20613238566", usuario: "MODDATOS", clave: "moddatos" };
const cdr = (id: string, codigo: string, desc: string) =>
  zipXml(
    `R-${id}`,
    `<?xml version="1.0" encoding="UTF-8"?><ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><cac:DocumentResponse><cac:Response><cbc:ReferenceID>${id}</cbc:ReferenceID><cbc:ResponseCode>${codigo}</cbc:ResponseCode><cbc:Description>${desc}</cbc:Description></cac:Response></cac:DocumentResponse></ar:ApplicationResponse>`
  );
const soap = (body: string) => `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>${body}</soap-env:Body></soap-env:Envelope>`;

let consultas = 0;
const recibidos: { usuario: string; archivo: string; contenido: string[] }[] = [];

Deno.test("cliente SOAP contra SUNAT simulado", async () => {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, async (req) => {
    const x = await req.text();
    const usuario = /<wsse:Username>([^<]*)</.exec(x)?.[1] ?? "";
    if (x.includes("<ser:sendBill>")) {
      const archivo = /<fileName>([^<]*)</.exec(x)![1];
      const zip = unzipSync(decodeBase64(/<contentFile>([^<]*)</.exec(x)![1]));
      recibidos.push({ usuario, archivo, contenido: Object.keys(zip) });
      if (archivo.includes("F001-0009"))
        return new Response(soap(`<soap-env:Fault><faultcode>soap-env:Client.0306</faultcode><faultstring>No se puede leer (parsear) el archivo XML</faultstring></soap-env:Fault>`), { status: 500 });
      const id = archivo.replace(".zip", "");
      assert(strFromU8(zip[`${id}.xml`]).includes("<Invoice"));
      return new Response(soap(`<br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${cdr(id, "0", `La Factura numero ${id}, ha sido aceptada`)}</applicationResponse></br:sendBillResponse>`));
    }
    if (x.includes("<ser:sendSummary>")) return new Response(soap(`<br:sendSummaryResponse xmlns:br="http://service.sunat.gob.pe"><ticket>1700000000001</ticket></br:sendSummaryResponse>`));
    if (x.includes("<ser:getStatus>")) {
      consultas++;
      if (consultas === 1) return new Response(soap(`<br:getStatusResponse xmlns:br="http://service.sunat.gob.pe"><status><statusCode>98</statusCode></status></br:getStatusResponse>`));
      return new Response(soap(`<br:getStatusResponse xmlns:br="http://service.sunat.gob.pe"><status><statusCode>0</statusCode><content>${cdr("RA-20261116-1", "0", "La Comunicacion de baja RA-20261116-1, ha sido aceptada")}</content></status></br:getStatusResponse>`));
    }
    return new Response("?", { status: 400 });
  });
  Deno.env.set("SUNAT_URL_BILL", `http://localhost:${server.addr.port}/billService`);
  try {
    const ok = await sendBill("beta", cred, "20613238566-01-F001-0001", `<?xml version="1.0"?><Invoice/>`);
    assert(ok.ok);
    assertEquals(ok.cdr?.codigo, "0");
    assertEquals(estadoDeCodigo(ok.cdr!.codigo), "ACEPTADO");
    assertEquals(recibidos[0].usuario, "20613238566MODDATOS");
    assertEquals(recibidos[0].contenido, ["20613238566-01-F001-0001.xml"]);

    const mal = await sendBill("beta", cred, "20613238566-01-F001-0009", `<?xml version="1.0"?><Invoice/>`);
    assertEquals(mal.ok, false);
    assertEquals(mal.faultCodigo, "0306");
    assertEquals(estadoDeCodigo("0306"), "EXCEPCION");
    assertEquals(estadoDeCodigo("2800"), "RECHAZADO");
    assertEquals(estadoDeCodigo("4252"), "OBSERVADO");

    const t = await sendSummary("beta", cred, "20613238566-RA-20261116-1", `<?xml version="1.0"?><VoidedDocuments/>`);
    assertEquals(t.ticket, "1700000000001");
    assertEquals((await getStatus("beta", cred, t.ticket!)).statusCode, "98");
    const fin = await getStatus("beta", cred, t.ticket!);
    assertEquals(fin.cdr?.codigo, "0");
  } finally {
    Deno.env.delete("SUNAT_URL_BILL");
    ac.abort();
    await server.finished;
  }
});
