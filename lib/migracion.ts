"use client";

// =====================================================================
// Migración única: sube a Supabase los datos que cada PC tenía guardados
// en su navegador (versión anterior del ERP). Se combinan por id, así que
// subir desde varias PCs no duplica nada. Al terminar se borran del navegador.
// =====================================================================

import { KEYS, escribir, esperarGuardado, leer, type StoreKey } from "./storage";

const SESION_ANTIGUA = ["login", "usuario", "rol", "erp_rol"];

function local(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Cantidad de registros que quedan en el navegador sin subir. */
export function contarDatosLocales(): number {
  if (typeof window === "undefined") return 0;
  return (Object.values(KEYS) as StoreKey[]).reduce((n, k) => {
    const v = local(k);
    if (Array.isArray(v)) return n + v.length;
    if (v && typeof v === "object") return n + Object.keys(v).length;
    return n;
  }, 0);
}

const unirPorId = <T extends { id: string }>(servidor: T[], locales: T[]): T[] => {
  const ids = new Set(servidor.map((x) => String(x.id)));
  return [...servidor, ...locales.filter((x) => x && x.id !== undefined && !ids.has(String(x.id)))];
};

/**
 * Sube los datos locales (solo lo que falta en el servidor) y, cuando Supabase
 * confirma, los borra del navegador. Devuelve cuántos registros se agregaron.
 */
export async function subirDatosLocales(): Promise<number> {
  await esperarGuardado(); // descarta errores de antes
  let agregados = 0;
  const subidas: string[] = [];
  (Object.values(KEYS) as StoreKey[]).forEach((k) => {
    const v = local(k);
    if (v === undefined) return;
    if (k === KEYS.CONTADORES) {
      // numeración: se conserva el número más alto para no repetir correlativos
      const s = leer<Record<string, number>>(k, {});
      const l = v as Record<string, number>;
      const r = { ...s };
      Object.entries(l).forEach(([serie, n]) => (r[serie] = Math.max(s[serie] ?? 0, Number(n) || 0)));
      escribir(k, r);
    } else if (k === KEYS.OBSERVACIONES) {
      const s = leer<Record<string, { id: string }[]>>(k, {});
      const l = v as Record<string, { id: string }[]>;
      const r = { ...s };
      Object.entries(l).forEach(([modulo, lista]) => {
        const antes = (r[modulo] ?? []).length;
        r[modulo] = unirPorId(r[modulo] ?? [], lista ?? []);
        agregados += r[modulo].length - antes;
      });
      escribir(k, r);
    } else if (Array.isArray(v)) {
      const s = leer<{ id: string }[]>(k, []);
      const r = unirPorId(s, v as { id: string }[]);
      agregados += r.length - s.length;
      escribir(k, r);
    }
    subidas.push(k);
  });
  const error = await esperarGuardado();
  if (error) throw new Error(`No se completó la subida (los datos siguen en este navegador): ${error}`);
  [...subidas, ...SESION_ANTIGUA].forEach((k) => window.localStorage.removeItem(k));
  return agregados;
}
