// XML UBL 2.1 (CustomizationID 2.0) de SUNAT: Invoice (01 factura / 03 boleta), CreditNote (07) y
// DebitNote (08), y la Comunicación de Baja (VoidedDocuments, UBL 2.0). El orden de los elementos sigue
// los XSD de UBL 2.1; si se cambia el orden, SUNAT rechaza el XML (error 0306 / 2335).

import { AFECTACION, type DocumentoCpe, type Emisor, type LineaCpe, dec, m2 } from "./documento.ts";

const NS = {
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ds: "http://www.w3.org/2000/09/xmldsig#",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  sac: "urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1",
};

/** Escapa texto para XML (sin CDATA: el canonicalizador de la firma lo convierte igual). */
export const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const monto = (n: number, moneda: string) => `currencyID="${moneda}">${m2(n)}`;

const firmaUbl = (e: Emisor) =>
  `<cac:Signature><cbc:ID>${e.ruc}</cbc:ID><cac:SignatoryParty><cac:PartyIdentification><cbc:ID>${e.ruc}</cbc:ID></cac:PartyIdentification>` +
  `<cac:PartyName><cbc:Name>${esc(e.razonSocial)}</cbc:Name></cac:PartyName></cac:SignatoryParty>` +
  `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment></cac:Signature>`;

const docIdentidad = (tipo: string, num: string) =>
  `<cbc:ID schemeID="${tipo}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(num)}</cbc:ID>`;

const PAIS = `<cac:Country><cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country">PE</cbc:IdentificationCode></cac:Country>`;

function emisorUbl(e: Emisor): string {
  return (
    `<cac:AccountingSupplierParty><cac:Party>` +
    `<cac:PartyIdentification>${docIdentidad("6", e.ruc)}</cac:PartyIdentification>` +
    (e.nombreComercial ? `<cac:PartyName><cbc:Name>${esc(e.nombreComercial)}</cbc:Name></cac:PartyName>` : "") +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(e.razonSocial)}</cbc:RegistrationName>` +
    `<cac:RegistrationAddress>` +
    `<cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">${e.ubigeo}</cbc:ID>` +
    `<cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">${e.codigoEstablecimiento}</cbc:AddressTypeCode>` +
    `<cbc:CityName>${esc(e.provincia)}</cbc:CityName>` +
    `<cbc:CountrySubentity>${esc(e.departamento)}</cbc:CountrySubentity>` +
    `<cbc:District>${esc(e.distrito)}</cbc:District>` +
    `<cac:AddressLine><cbc:Line>${esc(e.direccion)}</cbc:Line></cac:AddressLine>` +
    PAIS +
    `</cac:RegistrationAddress></cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingSupplierParty>`
  );
}

function clienteUbl(d: DocumentoCpe): string {
  const c = d.cliente;
  return (
    `<cac:AccountingCustomerParty><cac:Party>` +
    `<cac:PartyIdentification>${docIdentidad(c.tipoDoc, c.numDoc)}</cac:PartyIdentification>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(c.nombre)}</cbc:RegistrationName>` +
    (c.direccion ? `<cac:RegistrationAddress><cac:AddressLine><cbc:Line>${esc(c.direccion)}</cbc:Line></cac:AddressLine>${PAIS}</cac:RegistrationAddress>` : "") +
    `</cac:PartyLegalEntity>` +
    `</cac:Party></cac:AccountingCustomerParty>`
  );
}

const esquemaTributo = (afect: keyof typeof AFECTACION) => {
  const a = AFECTACION[afect];
  return (
    `<cac:TaxScheme><cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">${a.tributo}</cbc:ID>` +
    `<cbc:Name>${a.nombre}</cbc:Name><cbc:TaxTypeCode>${a.tipo}</cbc:TaxTypeCode></cac:TaxScheme>`
  );
};

function formaPagoUbl(d: DocumentoCpe): string {
  const f = d.formaPago;
  if (!f) return "";
  if (f.tipo === "Contado") return `<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>`;
  return (
    `<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Credito</cbc:PaymentMeansID><cbc:Amount ${monto(f.montoPendiente, d.moneda)}</cbc:Amount></cac:PaymentTerms>` +
    f.cuotas
      .map(
        (q, i) =>
          `<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Cuota${String(i + 1).padStart(3, "0")}</cbc:PaymentMeansID>` +
          `<cbc:Amount ${monto(q.monto, d.moneda)}</cbc:Amount><cbc:PaymentDueDate>${q.fecha}</cbc:PaymentDueDate></cac:PaymentTerms>`
      )
      .join("")
  );
}

function descuentoUbl(d: DocumentoCpe): string {
  if (!(d.descuentoBase > 0)) return "";
  const factor = (Math.round((d.descuentoBase / d.sumaValorVenta) * 1e5) / 1e5).toFixed(5);
  return (
    `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>` +
    `<cbc:AllowanceChargeReasonCode listAgencyName="PE:SUNAT" listName="Cargo/descuento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo53">02</cbc:AllowanceChargeReasonCode>` +
    `<cbc:MultiplierFactorNumeric>${factor}</cbc:MultiplierFactorNumeric>` +
    `<cbc:Amount ${monto(d.descuentoBase, d.moneda)}</cbc:Amount><cbc:BaseAmount ${monto(d.sumaValorVenta, d.moneda)}</cbc:BaseAmount></cac:AllowanceCharge>`
  );
}

function totalTributosUbl(d: DocumentoCpe): string {
  return (
    `<cac:TaxTotal><cbc:TaxAmount ${monto(d.igv, d.moneda)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal><cbc:TaxableAmount ${monto(d.baseImponible, d.moneda)}</cbc:TaxableAmount><cbc:TaxAmount ${monto(d.igv, d.moneda)}</cbc:TaxAmount>` +
    `<cac:TaxCategory>${esquemaTributo(d.afectacion)}</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`
  );
}

function totalesUbl(d: DocumentoCpe, etiqueta: "LegalMonetaryTotal" | "RequestedMonetaryTotal"): string {
  return (
    `<cac:${etiqueta}>` +
    `<cbc:LineExtensionAmount ${monto(d.baseImponible, d.moneda)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxInclusiveAmount ${monto(d.total, d.moneda)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount ${monto(d.total, d.moneda)}</cbc:PayableAmount>` +
    `</cac:${etiqueta}>`
  );
}

function lineaUbl(d: DocumentoCpe, l: LineaCpe, etiqueta: "InvoiceLine" | "CreditNoteLine" | "DebitNoteLine"): string {
  const cantidad = { InvoiceLine: "InvoicedQuantity", CreditNoteLine: "CreditedQuantity", DebitNoteLine: "DebitedQuantity" }[etiqueta];
  const a = AFECTACION[l.afectacion];
  return (
    `<cac:${etiqueta}><cbc:ID>${l.n}</cbc:ID>` +
    `<cbc:${cantidad} unitCode="${l.unidad}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${dec(l.cantidad)}</cbc:${cantidad}>` +
    `<cbc:LineExtensionAmount ${monto(l.valorVenta, d.moneda)}</cbc:LineExtensionAmount>` +
    `<cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount currencyID="${d.moneda}">${dec(l.precioUnitario)}</cbc:PriceAmount>` +
    `<cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference>` +
    `<cac:TaxTotal><cbc:TaxAmount ${monto(l.igv, d.moneda)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal><cbc:TaxableAmount ${monto(l.valorVenta, d.moneda)}</cbc:TaxableAmount><cbc:TaxAmount ${monto(l.igv, d.moneda)}</cbc:TaxAmount>` +
    `<cac:TaxCategory><cbc:Percent>${a.porcentaje}</cbc:Percent>` +
    `<cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${l.afectacion}</cbc:TaxExemptionReasonCode>` +
    `${esquemaTributo(l.afectacion)}</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>` +
    `<cac:Item><cbc:Description>${esc(l.descripcion)}</cbc:Description></cac:Item>` +
    `<cac:Price><cbc:PriceAmount currencyID="${d.moneda}">${dec(l.valorUnitario)}</cbc:PriceAmount></cac:Price>` +
    `</cac:${etiqueta}>`
  );
}

const EXTENSION = `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>`;
const nsAttrs = (raiz: string) =>
  `xmlns="${raiz}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ds="${NS.ds}" xmlns:ext="${NS.ext}"`;

const leyendaUbl = (d: DocumentoCpe) => `<cbc:Note languageLocaleID="1000">${esc(d.leyenda)}</cbc:Note>`;
const monedaUbl = (d: DocumentoCpe) =>
  `<cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${d.moneda}</cbc:DocumentCurrencyCode>`;

/** XML sin firmar del comprobante (la firma se inserta en ext:ExtensionContent). */
export function xmlComprobante(d: DocumentoCpe): string {
  const cabecera =
    `<cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>` +
    `<cbc:ID>${d.id}</cbc:ID><cbc:IssueDate>${d.fechaEmision}</cbc:IssueDate><cbc:IssueTime>${d.horaEmision}</cbc:IssueTime>`;

  if (d.tipo === "FACTURA" || d.tipo === "BOLETA") {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Invoice ${nsAttrs("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2")}>` +
      EXTENSION +
      cabecera +
      (d.fechaVencimiento ? `<cbc:DueDate>${d.fechaVencimiento}</cbc:DueDate>` : "") +
      `<cbc:InvoiceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01" listID="0101" name="Tipo de Operacion" listSchemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51">${d.codigoTipo}</cbc:InvoiceTypeCode>` +
      leyendaUbl(d) +
      monedaUbl(d) +
      `<cbc:LineCountNumeric>${d.lineas.length}</cbc:LineCountNumeric>` +
      firmaUbl(d.emisor) +
      emisorUbl(d.emisor) +
      clienteUbl(d) +
      formaPagoUbl(d) +
      descuentoUbl(d) +
      totalTributosUbl(d) +
      totalesUbl(d, "LegalMonetaryTotal") +
      d.lineas.map((l) => lineaUbl(d, l, "InvoiceLine")).join("") +
      `</Invoice>`
    );
  }

  const credito = d.tipo === "NOTA_CREDITO";
  const raiz = credito ? "CreditNote" : "DebitNote";
  const catalogoMotivo = credito ? "catalogo09" : "catalogo10";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<${raiz} ${nsAttrs(`urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2`)}>` +
    EXTENSION +
    cabecera +
    leyendaUbl(d) +
    monedaUbl(d) +
    `<cbc:LineCountNumeric>${d.lineas.length}</cbc:LineCountNumeric>` +
    `<cac:DiscrepancyResponse><cbc:ReferenceID>${d.referencia!.id}</cbc:ReferenceID>` +
    `<cbc:ResponseCode listAgencyName="PE:SUNAT" listName="${credito ? "Tipo de nota de credito" : "Tipo de nota de debito"}" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:${catalogoMotivo}">${d.motivo!.codigo}</cbc:ResponseCode>` +
    `<cbc:Description>${esc(d.motivo!.descripcion)}</cbc:Description></cac:DiscrepancyResponse>` +
    `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${d.referencia!.id}</cbc:ID>` +
    `<cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${d.referencia!.codigoTipo}</cbc:DocumentTypeCode>` +
    `</cac:InvoiceDocumentReference></cac:BillingReference>` +
    firmaUbl(d.emisor) +
    emisorUbl(d.emisor) +
    clienteUbl(d) +
    (credito ? formaPagoUbl(d) : "") +
    descuentoUbl(d) +
    totalTributosUbl(d) +
    totalesUbl(d, credito ? "LegalMonetaryTotal" : "RequestedMonetaryTotal") +
    d.lineas.map((l) => lineaUbl(d, l, credito ? "CreditNoteLine" : "DebitNoteLine")).join("") +
    `</${raiz}>`
  );
}

// ---------------------------------------------------------------------
// Comunicación de baja (RA): anula facturas y sus notas ya aceptadas por SUNAT
// ---------------------------------------------------------------------

export interface DocumentoBaja {
  codigoTipo: string; // 01 / 07 / 08
  serie: string;
  correlativo: string;
  motivo: string;
}

/** id = RA-AAAAMMDD-N (N correlativo del día de generación). fechaReferencia = fecha de emisión de los documentos. */
export function xmlBaja(emisor: Emisor, id: string, fechaReferencia: string, fechaGeneracion: string, docs: DocumentoBaja[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ds="${NS.ds}" xmlns:ext="${NS.ext}" xmlns:sac="${NS.sac}">` +
    EXTENSION +
    `<cbc:UBLVersionID>2.0</cbc:UBLVersionID><cbc:CustomizationID>1.0</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID><cbc:ReferenceDate>${fechaReferencia}</cbc:ReferenceDate><cbc:IssueDate>${fechaGeneracion}</cbc:IssueDate>` +
    firmaUbl(emisor) +
    `<cac:AccountingSupplierParty><cbc:CustomerAssignedAccountID>${emisor.ruc}</cbc:CustomerAssignedAccountID><cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>` +
    `<cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${esc(emisor.razonSocial)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>` +
    docs
      .map(
        (x, i) =>
          `<sac:VoidedDocumentsLine><cbc:LineID>${i + 1}</cbc:LineID><cbc:DocumentTypeCode>${x.codigoTipo}</cbc:DocumentTypeCode>` +
          `<sac:DocumentSerialID>${x.serie}</sac:DocumentSerialID><sac:DocumentNumberID>${x.correlativo}</sac:DocumentNumberID>` +
          `<sac:VoidReasonDescription>${esc(x.motivo.slice(0, 100))}</sac:VoidReasonDescription></sac:VoidedDocumentsLine>`
      )
      .join("") +
    `</VoidedDocuments>`
  );
}
