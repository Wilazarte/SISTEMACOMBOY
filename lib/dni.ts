// =====================================================================
// DNI verificado con RENIEC (Decolecta) en todo el ERP · Williams 2026-11-22
//
// - Usa la MISMA Edge Function y el MISMO token que el RUC (validar-ruc-decolecta, secreto DECOLECTA_TOKEN):
//   se le manda { dni } en vez de { ruc }. El token nunca llega al navegador.
// - Cada DNI encontrado queda en la tabla dni_validados (solo la escribe la Edge Function), así un DNI
//   verificado una vez sirve en todos los módulos sin volver a gastar consulta.
// - A diferencia del RUC, el DNI NO bloquea el guardado: si RENIEC no responde, el DNI no existe o no hay
//   internet, se avisa y el usuario completa los datos a mano.
// =====================================================================

import { useEffect, useState } from "react";
import { ErpError, rucValido } from "./storage";
import { createClient } from "./supabase/client";

export interface DniReniec {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
  /** ISO: cuándo se verificó en RENIEC. */
  verificadoAt: string;
}

/** Tipos de documento de identidad para clientes, proveedores, trabajadores y contactos. */
export type TipoDocumento = "RUC" | "DNI" | "CE" | "PASAPORTE";
export const TIPOS_DOCUMENTO: { value: TipoDocumento; label: string }[] = [
  { value: "RUC", label: "RUC" },
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "CE (carné de extranjería)" },
  { value: "PASAPORTE", label: "Pasaporte" },
];
export const LARGO_DOCUMENTO: Record<TipoDocumento, string> = { RUC: "11 dígitos", DNI: "8 dígitos", CE: "9 a 12 caracteres", PASAPORTE: "6 a 12 caracteres" };
export const MAX_DOCUMENTO: Record<TipoDocumento, number> = { RUC: 11, DNI: 8, CE: 12, PASAPORTE: 12 };

export const MSG_DNI_8 = "El DNI debe tener 8 dígitos";
export const MSG_DNI_FALLO = "No se pudo verificar el DNI, ingrese los datos manualmente";

/** Quita lo que no corresponde al tipo: RUC/DNI solo dígitos; CE/Pasaporte letras y números en mayúscula. */
export const limpiarDocumento = (tipo: TipoDocumento, v: string): string =>
  (tipo === "RUC" || tipo === "DNI" ? v.replace(/\D/g, "") : v.toUpperCase().replace(/[^A-Z0-9]/g, "")).slice(0, MAX_DOCUMENTO[tipo]);

/** Mensaje de error del número según su tipo, o null si está bien. */
export function validarDocumentoPersona(tipo: TipoDocumento, num: string): string | null {
  const n = (num ?? "").trim().toUpperCase();
  if (tipo === "DNI") return /^\d{8}$/.test(n) ? null : `${MSG_DNI_8}.`;
  if (tipo === "RUC") return rucValido(n) ? null : "RUC inválido (11 dígitos con dígito verificador correcto).";
  if (tipo === "CE") return /^[A-Z0-9]{9,12}$/.test(n) ? null : "El carné de extranjería debe tener de 9 a 12 caracteres.";
  return /^[A-Z0-9]{6,12}$/.test(n) ? null : "El pasaporte debe tener de 6 a 12 letras o números.";
}

/** Tipo según el número (registros antiguos sin tipo): 8 dígitos = DNI, 11 = RUC. */
export const tipoDeNumero = (num: string | undefined | null, porDefecto: TipoDocumento = "RUC"): TipoDocumento => {
  const n = (num ?? "").trim();
  return /^\d{8}$/.test(n) ? "DNI" : /^\d{11}$/.test(n) ? "RUC" : porDefecto;
};

/**
 * Aviso de duplicado: "Este DNI ya está registrado como [Nombre]". `lista` son los demás registros
 * (sin el que se está editando).
 */
export function avisoDniDuplicado<T>(dni: string, lista: T[], doc: (x: T) => string | undefined | null, nombre: (x: T) => string): string | null {
  const n = (dni ?? "").trim();
  if (!/^\d{8}$/.test(n)) return null;
  const otro = lista.find((x) => (doc(x) ?? "").trim() === n);
  return otro ? `Este DNI ya está registrado como ${nombre(otro) || "otro registro"}` : null;
}

// ------------------------------------------------------------------ caché (dni_validados)
const cache = new Map<string, DniReniec>();
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

interface FilaDni {
  dni: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombre_completo: string;
  verificado_at: string;
}
const deFila = (f: FilaDni): DniReniec => ({
  dni: f.dni,
  nombres: (f.nombres ?? "").trim(),
  apellidoPaterno: (f.apellido_paterno ?? "").trim(),
  apellidoMaterno: (f.apellido_materno ?? "").trim(),
  nombreCompleto: (f.nombre_completo ?? "").trim() || [f.apellido_paterno, f.apellido_materno, f.nombres].filter(Boolean).join(" ").trim(),
  verificadoAt: f.verificado_at ?? new Date().toISOString(),
});

/** DNI ya verificado en esta sesión (o leído de dni_validados), sin consultar. */
export const dniVerificado = (dni: string): DniReniec | undefined => cache.get((dni ?? "").replace(/\D/g, ""));

/** Nombre completo como se guarda en los formularios de UNA sola casilla: NOMBRES APELLIDO_P APELLIDO_M. */
export const nombreDesdeDni = (r: DniReniec): string =>
  [r.nombres, r.apellidoPaterno, r.apellidoMaterno].filter(Boolean).join(" ").trim().toUpperCase() || r.nombreCompleto.toUpperCase();

/**
 * Verifica el DNI en RENIEC con Decolecta. Primero mira dni_validados (no gasta consulta); si no está,
 * llama a la Edge Function. Lanza ErpError con un mensaje claro si no se pudo (el formulario sigue editable).
 */
export async function verificarDni(dni: string): Promise<DniReniec> {
  const n = (dni ?? "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(n)) throw new ErpError(`${MSG_DNI_8}.`);
  const previo = cache.get(n);
  if (previo) return previo;
  const sb = createClient();
  // 1) padrón del sistema (si la tabla aún no existe, se ignora)
  try {
    const { data } = await sb.from("dni_validados").select("dni,nombres,apellido_paterno,apellido_materno,nombre_completo,verificado_at").eq("dni", n).maybeSingle();
    if (data) {
      const r = deFila(data as FilaDni);
      cache.set(n, r);
      avisar();
      return r;
    }
  } catch {
    /* sin tabla o sin conexión: se intenta la Edge Function */
  }
  // 2) RENIEC vía la misma Edge Function del RUC
  let data: unknown;
  try {
    const res = await sb.functions.invoke("validar-ruc-decolecta", { body: { dni: n } });
    if (res.error) {
      const ctx = (res.error as { context?: Response }).context;
      const cuerpo = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
      throw new ErpError(`${MSG_DNI_FALLO}${cuerpo?.error ? ` (${cuerpo.error})` : ""}.`);
    }
    data = res.data;
  } catch (e) {
    if (e instanceof ErpError) throw e;
    throw new ErpError(`${MSG_DNI_FALLO} (sin conexión).`);
  }
  const fila = data as Partial<FilaDni> | null;
  if (!fila || !(fila.nombres || fila.nombre_completo)) throw new ErpError(`${MSG_DNI_FALLO}.`);
  const r = deFila({ ...(fila as FilaDni), dni: n });
  cache.set(n, r);
  avisar();
  return r;
}

/** Hook: se vuelve a pintar cuando se verifica un DNI en cualquier parte del sistema. */
export function useDniVerificado(dni: string): DniReniec | undefined {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((x) => x + 1);
    oyentes.add(f);
    return () => {
      oyentes.delete(f);
    };
  }, []);
  return dniVerificado(dni);
}
