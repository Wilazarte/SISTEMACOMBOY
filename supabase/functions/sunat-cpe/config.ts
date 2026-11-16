// Configuración del emisor y de SUNAT. Todo lo secreto viene de los Secrets del Edge Function (nunca del repositorio).
//
// Secrets (Supabase › Edge Functions › Secrets, o `supabase secrets set NOMBRE=valor`):
//   SUNAT_ENTORNO         beta | produccion            (por defecto beta)
//   SUNAT_SOL_USUARIO     usuario SOL secundario       (beta: MODDATOS)
//   SUNAT_SOL_CLAVE       clave del usuario SOL        (beta: moddatos)
//   SUNAT_CERT_PFX        certificado digital .pfx/.p12 en base64
//   SUNAT_CERT_CLAVE      contraseña del .pfx
//   SUNAT_FIRMA_ALG       sha1 (por defecto) | sha256
// Opcionales (si cambian los datos del domicilio fiscal en la Ficha RUC):
//   SUNAT_UBIGEO, SUNAT_DEPARTAMENTO, SUNAT_PROVINCIA, SUNAT_DISTRITO, SUNAT_DIRECCION, SUNAT_NOMBRE_COMERCIAL

import type { Emisor } from "./documento.ts";
import type { CredencialesSol, Entorno } from "./sunat.ts";

const env = (k: string) => (typeof Deno !== "undefined" ? Deno.env.get(k) ?? "" : "").trim();

/** Domicilio fiscal según la Ficha RUC 20613238566 (lib/empresa.ts). Paucarpata = ubigeo INEI 040112. */
export const EMISOR_DEFECTO: Emisor = {
  ruc: "20613238566",
  razonSocial: "INVERSIONES GLOBAL COMPANY ROUSVID S.A.C.",
  nombreComercial: "",
  ubigeo: "040112",
  departamento: "AREQUIPA",
  provincia: "AREQUIPA",
  distrito: "PAUCARPATA",
  direccion: "EL NAZARENO MZ. A LT. 25",
  codigoEstablecimiento: "0000",
};

export function emisor(): Emisor {
  return {
    ...EMISOR_DEFECTO,
    nombreComercial: env("SUNAT_NOMBRE_COMERCIAL") || EMISOR_DEFECTO.nombreComercial,
    ubigeo: env("SUNAT_UBIGEO") || EMISOR_DEFECTO.ubigeo,
    departamento: env("SUNAT_DEPARTAMENTO") || EMISOR_DEFECTO.departamento,
    provincia: env("SUNAT_PROVINCIA") || EMISOR_DEFECTO.provincia,
    distrito: env("SUNAT_DISTRITO") || EMISOR_DEFECTO.distrito,
    direccion: env("SUNAT_DIRECCION") || EMISOR_DEFECTO.direccion,
  };
}

export function entorno(): Entorno {
  return env("SUNAT_ENTORNO").toLowerCase() === "produccion" ? "produccion" : "beta";
}

export function credenciales(): CredencialesSol {
  const ent = entorno();
  const usuario = env("SUNAT_SOL_USUARIO") || (ent === "beta" ? "MODDATOS" : "");
  const clave = env("SUNAT_SOL_CLAVE") || (ent === "beta" ? "moddatos" : "");
  if (!usuario || !clave) throw new Error("Falta configurar SUNAT_SOL_USUARIO y SUNAT_SOL_CLAVE (usuario SOL secundario) en los Secrets del Edge Function.");
  return { ruc: EMISOR_DEFECTO.ruc, usuario, clave };
}

export function certificadoConfigurado(): { pfx: string; clave: string } {
  const pfx = env("SUNAT_CERT_PFX");
  const clave = env("SUNAT_CERT_CLAVE");
  if (!pfx) throw new Error("Falta configurar SUNAT_CERT_PFX (certificado digital .pfx en base64) en los Secrets del Edge Function.");
  return { pfx, clave };
}

export const algoritmoFirma = (): "sha1" | "sha256" => (env("SUNAT_FIRMA_ALG").toLowerCase() === "sha256" ? "sha256" : "sha1");
