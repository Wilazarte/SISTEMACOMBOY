// =====================================================================
// RUC validado con SUNAT (Decolecta), obligatorio en todo el ERP.
//
// - La consulta la hace la Edge Function validar-ruc-decolecta (el token de Decolecta nunca llega al navegador).
//   Cada consulta exitosa queda en la tabla ruc_validados (solo la escribe la Edge Function), así que un RUC
//   validado una vez sirve para todos los módulos y usuarios sin volver a consultarlo.
// - Una validación vale VIGENCIA_DIAS días; luego se vuelve a consultar al usarse (la situación en SUNAT cambia).
// - Las funciones que guardan (proveedores, clientes, gastos, OC, OS, cotizaciones, contratistas, ventas de sucursal)
//   llaman a exigirRucSunat(): sin RUC validado no se guarda. Los RUC antiguos no validados se exigen al editarse
//   o al usarse en un documento nuevo.
// - Solo aplica a RUC (11 dígitos). DNI y carné de extranjería no se consultan.
// =====================================================================

import { useEffect, useState } from "react";
import { ErpError, rucValido } from "./storage";
import { createClient } from "./supabase/client";

export interface RucSunat {
  ruc: string;
  razon_social: string;
  estado: string;
  condicion: string;
  direccion: string;
  /** ACTIVO y HABIDO */
  validado: boolean;
  validado_at: string;
}

/** Días que vale una consulta antes de volver a pedirla. */
export const VIGENCIA_DIAS = 30;

const cache = new Map<string, RucSunat>();
const oyentes = new Set<() => void>();
let carga: Promise<void> | null = null;
let tablaFalta = false;

const avisar = () => oyentes.forEach((f) => f());
const limpiar = (ruc: string) => (ruc ?? "").replace(/\D/g, "");
const vigente = (r: RucSunat | undefined): r is RucSunat =>
  !!r && Date.now() - new Date(r.validado_at).getTime() < VIGENCIA_DIAS * 86_400_000;

/** Es un RUC (11 dígitos): los DNI (8) y vacíos no se validan en SUNAT. */
export const esRuc = (doc: string) => limpiar(doc).length === 11;

/** Baja una vez la lista de RUC ya validados en el sistema (para que exigirRucSunat funcione sin esperar). */
export function cargarRucsValidados(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  carga ??= (async () => {
    const { data, error } = await createClient()
      .from("ruc_validados")
      .select("ruc,razon_social,estado,condicion,direccion,validado,validado_at")
      .gte("validado_at", new Date(Date.now() - VIGENCIA_DIAS * 86_400_000).toISOString());
    if (error) {
      // Sin la tabla (SQL pendiente) la validación sigue funcionando, pero solo se recuerda en esta sesión.
      tablaFalta = /does not exist|42P01|schema cache/i.test(`${error.code} ${error.message}`);
      if (!tablaFalta) carga = null;
      return;
    }
    (data as RucSunat[]).forEach((r) => cache.set(r.ruc, r));
    avisar();
  })();
  return carga;
}

/** Resultado vigente en SUNAT para ese RUC, o undefined si falta validarlo. */
export function rucSunat(ruc: string): RucSunat | undefined {
  void cargarRucsValidados();
  const r = cache.get(limpiar(ruc));
  return vigente(r) ? r : undefined;
}

export const rucEstaValidado = (ruc: string) => !!rucSunat(ruc);

/** Aviso cuando el RUC existe pero SUNAT no lo da como ACTIVO / HABIDO (se puede guardar, pero se avisa). */
export function avisoRuc(r: RucSunat | undefined): string | null {
  if (!r || r.validado) return null;
  return `SUNAT: ${r.estado || "sin estado"} / ${r.condicion || "sin condición"}`;
}

/**
 * Corta el guardado si el RUC no está validado con SUNAT. DNI / vacío pasan (las reglas de cada formulario
 * deciden si el documento es obligatorio). `quien` nombra el campo en el mensaje: "del proveedor", "del cliente"…
 */
export function exigirRucSunat(ruc: string | undefined | null, quien = ""): void {
  const n = limpiar(ruc ?? "");
  if (n.length !== 11) return;
  if (!rucValido(n)) throw new ErpError(`RUC ${quien ? `${quien} ` : ""}${n} inválido (dígito verificador).`);
  if (!rucSunat(n))
    throw new ErpError(`El RUC ${quien ? `${quien} ` : ""}${n} no está validado con SUNAT. Pulse "Validar RUC" antes de guardar.`);
}

/** Consulta el RUC en SUNAT (Decolecta). Si ya está validado y vigente, no vuelve a consultar salvo `forzar`. */
export async function validarRuc(ruc: string, opciones: { cotizacionId?: string; forzar?: boolean } = {}): Promise<RucSunat> {
  const n = limpiar(ruc);
  if (!rucValido(n)) throw new ErpError(`RUC ${n || "vacío"} no es válido (11 dígitos y dígito verificador).`);
  await cargarRucsValidados().catch(() => undefined);
  const previo = rucSunat(n);
  if (previo && !opciones.forzar && !opciones.cotizacionId) return previo;
  const { data, error } = await createClient().functions.invoke("validar-ruc-decolecta", { body: { ruc: n, cotizacion_id: opciones.cotizacionId } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const cuerpo = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null;
    if (cuerpo?.error) throw new ErpError(cuerpo.error);
    throw new ErpError(/not found|404|Failed to send/i.test(error.message) ? "Falta desplegar la Edge Function validar-ruc-decolecta en Supabase." : error.message);
  }
  const d = data as Omit<RucSunat, "validado_at"> & { validado_at?: string };
  const r: RucSunat = { ...d, ruc: n, validado_at: d.validado_at ?? new Date().toISOString() };
  cache.set(n, r);
  avisar();
  return r;
}

/** Hook: estado SUNAT del RUC; se re-renderiza cuando se valida en cualquier parte del sistema. */
export function useRucSunat(ruc: string): RucSunat | undefined {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((x) => x + 1);
    oyentes.add(f);
    void cargarRucsValidados().then(f);
    return () => {
      oyentes.delete(f);
    };
  }, []);
  return rucSunat(ruc);
}

export const faltaTablaRucValidados = () => tablaFalta;
