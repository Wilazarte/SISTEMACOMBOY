/**
 * "Recordar contraseña" del login, en todas las versiones del ERP.
 *
 * 1) App de PC Electron (carpeta desktop/): su preload expone `window.comboyEscritorio.credenciales` y la app
 *    cifra con el almacén seguro del sistema (Electron safeStorage = DPAPI de Windows).
 * 2) Web, Tauri y APK (WebView): se cifra en el propio equipo con Web Crypto (AES-GCM 256). La llave se crea
 *    NO exportable y se guarda en IndexedDB: el navegador puede usarla para descifrar, pero nadie puede leerla
 *    ni copiarla a otro equipo. La contraseña nunca queda en texto plano (ni en localStorage).
 *    Lo guardado caduca a los 30 días sin usarse.
 * Cada módulo del login tiene su propio usuario guardado.
 */

export interface CredencialGuardada {
  usuario: string;
  pass: string;
}

interface PuenteCredenciales {
  disponible(): Promise<boolean>;
  leer(clave: string): Promise<CredencialGuardada | null>;
  guardar(clave: string, usuario: string, pass: string): Promise<boolean>;
  borrar(clave: string): Promise<void>;
}

declare global {
  interface Window {
    comboyEscritorio?: { credenciales?: PuenteCredenciales };
  }
}

/** Último módulo recordado (no es secreto): el login lo deja elegido al abrir. */
export const CLAVE_MODULO_RECORDADO = "login_modulo_recordado";

const CADUCA_MS = 30 * 24 * 60 * 60 * 1000;
const BD = "comboy-recordar";
const TABLA = "kv";
const LLAVE = "llave";

const puenteEscritorio = (): PuenteCredenciales | null =>
  (typeof window !== "undefined" && window.comboyEscritorio?.credenciales) || null;

/* ---------- Web / Tauri / APK: Web Crypto + IndexedDB ---------- */

function webDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !!window.crypto?.subtle &&
    typeof window.indexedDB !== "undefined"
  );
}

function abrirBd(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TABLA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function op<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const bd = await abrirBd();
  try {
    return await new Promise<T>((ok, mal) => {
      const req = f(bd.transaction(TABLA, modo).objectStore(TABLA));
      req.onsuccess = () => ok(req.result as T);
      req.onerror = () => mal(req.error);
    });
  } finally {
    bd.close();
  }
}

async function llave(): Promise<CryptoKey> {
  const existente = await op<CryptoKey | undefined>("readonly", (s) => s.get(LLAVE));
  if (existente) return existente;
  const nueva = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await op("readwrite", (s) => s.put(nueva, LLAVE));
  return nueva;
}

interface Cifrado {
  iv: Uint8Array<ArrayBuffer>;
  datos: ArrayBuffer;
  guardado: number;
}

const puenteWeb: PuenteCredenciales = {
  async disponible() {
    if (!webDisponible()) return false;
    await llave();
    return true;
  },
  async leer(clave) {
    const c = await op<Cifrado | undefined>("readonly", (s) => s.get(`cred:${clave}`));
    if (!c) return null;
    if (Date.now() - c.guardado > CADUCA_MS) {
      await this.borrar(clave);
      return null;
    }
    try {
      const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: c.iv }, await llave(), c.datos);
      const v = JSON.parse(new TextDecoder().decode(plano)) as CredencialGuardada;
      return v.usuario && v.pass ? { usuario: v.usuario, pass: v.pass } : null;
    } catch {
      await this.borrar(clave); // llave cambiada o dato dañado
      return null;
    }
  },
  async guardar(clave, usuario, pass) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const datos = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await llave(),
      new TextEncoder().encode(JSON.stringify({ usuario, pass })),
    );
    const c: Cifrado = { iv, datos, guardado: Date.now() };
    await op("readwrite", (s) => s.put(c, `cred:${clave}`));
    return true;
  },
  async borrar(clave) {
    await op("readwrite", (s) => s.delete(`cred:${clave}`));
  },
};

/* ---------- API usada por el login ---------- */

let elegido: Promise<PuenteCredenciales | null> | null = null;

/** Electron si está su almacén seguro; si no, Web Crypto; null si el equipo no permite guardar de forma segura. */
function puente(): Promise<PuenteCredenciales | null> {
  if (!elegido) {
    elegido = (async () => {
      const esc = puenteEscritorio();
      if (esc) {
        try {
          if (await esc.disponible()) return esc;
        } catch {
          /* sigue con la web */
        }
      }
      try {
        return (await puenteWeb.disponible()) ? puenteWeb : null;
      } catch {
        return null;
      }
    })();
  }
  return elegido;
}

/** true cuando el equipo puede guardar la contraseña cifrada (PC, navegador, Tauri o APK). */
export async function recordarDisponible(): Promise<boolean> {
  return !!(await puente());
}

/** Credencial guardada para ese módulo de login. */
export async function leerCredencial(modulo: string): Promise<CredencialGuardada | null> {
  try {
    return (await (await puente())?.leer(modulo)) ?? null;
  } catch {
    return null;
  }
}

export async function guardarCredencial(modulo: string, usuario: string, pass: string): Promise<void> {
  try {
    await (await puente())?.guardar(modulo, usuario, pass);
    window.localStorage.setItem(CLAVE_MODULO_RECORDADO, modulo);
  } catch {
    /* sin almacén seguro: no se guarda nada */
  }
}

export async function olvidarCredencial(modulo: string): Promise<void> {
  try {
    await (await puente())?.borrar(modulo);
    if (window.localStorage.getItem(CLAVE_MODULO_RECORDADO) === modulo) window.localStorage.removeItem(CLAVE_MODULO_RECORDADO);
  } catch {
    /* nada que borrar */
  }
}

/** Módulo que quedó recordado en este equipo ("" si ninguno). */
export function moduloRecordado(): string {
  try {
    return window.localStorage.getItem(CLAVE_MODULO_RECORDADO) ?? "";
  } catch {
    return "";
  }
}
