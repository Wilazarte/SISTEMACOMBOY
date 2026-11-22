/**
 * "Recordar contraseña" de la app de PC (Electron, carpeta desktop/).
 *
 * La web NO guarda contraseñas: solo cuando corre dentro de la app de escritorio, su preload expone
 * `window.comboyEscritorio.credenciales`, y la app las cifra con el almacén seguro del sistema
 * (Electron safeStorage = DPAPI de Windows, ligado a la cuenta de Windows del equipo).
 * En el navegador o en el celular estas funciones no hacen nada y la casilla no se muestra.
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

const puente = (): PuenteCredenciales | null => (typeof window !== "undefined" && window.comboyEscritorio?.credenciales) || null;

/** true solo en la app de PC con cifrado del sistema disponible. */
export async function recordarDisponible(): Promise<boolean> {
  const p = puente();
  if (!p) return false;
  try {
    return await p.disponible();
  } catch {
    return false;
  }
}

/** Credencial guardada para ese módulo de login (cada módulo tiene su propio usuario). */
export async function leerCredencial(modulo: string): Promise<CredencialGuardada | null> {
  try {
    return (await puente()?.leer(modulo)) ?? null;
  } catch {
    return null;
  }
}

export async function guardarCredencial(modulo: string, usuario: string, pass: string): Promise<void> {
  try {
    await puente()?.guardar(modulo, usuario, pass);
  } catch {
    /* sin almacén seguro: no se guarda nada */
  }
}

export async function olvidarCredencial(modulo: string): Promise<void> {
  try {
    await puente()?.borrar(modulo);
  } catch {
    /* nada que borrar */
  }
}
