// Firma digital XMLDSig (enveloped) que exige SUNAT, dentro de ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent.
// Certificado: archivo .pfx/.p12 del emisor (en beta SUNAT acepta cualquier certificado, incluso autofirmado).

import { SignedXml } from "npm:xml-crypto@6.4.0";
// @deno-types="npm:@types/node-forge@1.3.14"
import forge from "npm:node-forge@1.4.3";

export interface Certificado {
  privateKeyPem: string;
  certPem: string;
  /** Titular del certificado (CN) y vencimiento, para mostrarlos en la configuración. */
  titular: string;
  vence: string;
}

/** Lee el .pfx (base64) con su contraseña. */
export function leerPfx(pfxBase64: string, password: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.decode64(pfxBase64.replace(/\s+/g, ""));
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password);
  } catch (e) {
    throw new Error(`No se pudo abrir el certificado digital (.pfx): revise el archivo y la contraseña. ${(e as Error).message}`);
  }
  const llaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const key = llaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new Error("El .pfx no tiene llave privada.");
  // El certificado del firmante es el que corresponde a la llave privada (el .pfx puede traer la cadena)
  const pub = forge.pki.setRsaPublicKey(key.n, key.e);
  const propio = certs.find((b) => b.cert && forge.pki.publicKeyToPem(b.cert.publicKey) === forge.pki.publicKeyToPem(pub))?.cert ?? certs[0]?.cert;
  if (!propio) throw new Error("El .pfx no tiene certificado.");
  return {
    privateKeyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(propio),
    titular: String(propio.subject.getField("CN")?.value ?? ""),
    vence: propio.validity.notAfter.toISOString(),
  };
}

const ALG = {
  sha1: { firma: "http://www.w3.org/2000/09/xmldsig#rsa-sha1", digest: "http://www.w3.org/2000/09/xmldsig#sha1" },
  sha256: { firma: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", digest: "http://www.w3.org/2001/04/xmlenc#sha256" },
} as const;

/**
 * Firma el XML. Devuelve el XML firmado y el valor resumen (DigestValue), que va en la representación impresa
 * y en el QR. Algoritmo por defecto RSA-SHA1 (el de los ejemplos de SUNAT); SUNAT_FIRMA_ALG=sha256 para SHA-256.
 */
export function firmarXml(xml: string, cert: Certificado, alg: "sha1" | "sha256" = "sha1"): { xml: string; hash: string } {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: ALG[alg].firma,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });
  sig.addReference({
    xpath: "/*",
    uri: "",
    isEmptyUri: true,
    digestAlgorithm: ALG[alg].digest,
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
  });
  sig.computeSignature(xml, {
    prefix: "ds",
    attrs: { Id: "SignatureSP" },
    location: { reference: "//*[local-name()='ExtensionContent']", action: "append" },
  });
  const firmado = sig.getSignedXml();
  const hash = /<ds:DigestValue>([^<]+)<\/ds:DigestValue>/.exec(firmado)?.[1] ?? "";
  return { xml: firmado.startsWith("<?xml") ? firmado : `<?xml version="1.0" encoding="UTF-8"?>\n${firmado}`, hash };
}
