"use client";

// =====================================================================
// Login y permisos por módulo.
// OJO: la sesión vive en localStorage (no hay servidor). Protege la navegación
// normal, pero no es seguridad real: quien tenga acceso al navegador puede
// alterarla. Para producción, mover el login a un backend (ej. Supabase Auth).
// =====================================================================

import { useEffect, useState } from "react";
import type { Rol } from "./types";

export type RolAuth = "creador" | "tesoreria" | "almacen" | "planilla" | "gerencia";

export interface Usuario {
  /** SHA-256 (hex) de la contraseña: no se guarda la contraseña en texto plano. */
  passHash: string;
  rol: RolAuth;
  nombre: string;
  /** Rutas permitidas; "*" = todos los módulos. */
  modulos: string[];
  soloLectura?: boolean;
}

export const USERS: Record<string, Usuario> = {
  creador: {
    passHash: "d7d7fa59aacc01f42344cf8d4b0a7b46036707d495ac9eb414bb016b0a549b4c",
    rol: "creador",
    nombre: "Creador (administrador)",
    modulos: ["*"],
  },
  tesoreria: {
    passHash: "69b4c3c459dbc985ecbf7981c14ea73b6b036a274e7b6ca66f3ba865acaee19a",
    rol: "tesoreria",
    nombre: "Tesorería / Compras",
    modulos: ["/dashboard/compras", "/dashboard/tesoreria"],
  },
  almacen: {
    passHash: "a4f16b2d1cc1b188c8705df3eb329d39e734add4d1c90ae8065b278690bff9c4",
    rol: "almacen",
    nombre: "Almacén",
    modulos: ["/dashboard/almacen"],
  },
  planilla: {
    passHash: "973fc7b8f507df8721133a1f3c6072572a335e5f91936948647098c9c9c81737",
    rol: "planilla",
    nombre: "Planilla",
    modulos: ["/dashboard/planilla"],
  },
  gerencia: {
    passHash: "6547ed9c5643c997666724a93a87f32e45d66140e6d98e788313824d818394a7",
    rol: "gerencia",
    nombre: "Gerencia (solo lectura)",
    modulos: ["*"],
    soloLectura: true,
  },
};

/**
 * Rol de negocio (lib/storage.ts PERMISOS) que corresponde a cada usuario.
 * Gerencia y Planilla usan CONTADOR (sin permisos de escritura en Compras/Almacén).
 */
const ROL_NEGOCIO: Record<RolAuth, Rol> = {
  creador: "GERENCIA",
  tesoreria: "TESORERIA",
  almacen: "ALMACEN",
  planilla: "CONTADOR",
  gerencia: "CONTADOR",
};

// localStorage: login=true, usuario, rol
const K = { LOGIN: "login", USUARIO: "usuario", ROL: "rol" } as const;
const EVENTO = "erp:sesion";

export interface Sesion {
  usuario: string;
  rol: RolAuth;
  nombre: string;
  modulos: string[];
  soloLectura: boolean;
}

/** Lee la sesión y la valida contra USERS (un rol alterado a mano no da más permisos). */
export function getSesion(): Sesion | null {
  if (typeof window === "undefined") return null;
  try {
    if (localStorage.getItem(K.LOGIN) !== "true") return null;
    const usuario = localStorage.getItem(K.USUARIO) ?? "";
    const u = Object.prototype.hasOwnProperty.call(USERS, usuario) ? USERS[usuario] : undefined;
    if (!u || localStorage.getItem(K.ROL) !== u.rol) return null;
    return { usuario, rol: u.rol, nombre: u.nombre, modulos: u.modulos, soloLectura: !!u.soloLectura };
  } catch {
    return null;
  }
}

export function login(usuario: string, pass: string): Sesion | null {
  const user = usuario.trim().toLowerCase();
  const u = Object.prototype.hasOwnProperty.call(USERS, user) ? USERS[user] : undefined;
  if (!u || sha256(pass) !== u.passHash) return null;
  localStorage.setItem(K.LOGIN, "true");
  localStorage.setItem(K.USUARIO, user);
  localStorage.setItem(K.ROL, u.rol);
  window.dispatchEvent(new Event(EVENTO));
  return getSesion();
}

export function logout(): void {
  Object.values(K).forEach((k) => localStorage.removeItem(k));
  window.dispatchEvent(new Event(EVENTO));
}

/** Sesión reactiva. `listo` es false hasta leer localStorage en el cliente (evita parpadeos y errores de hidratación). */
export function useSesion(): { sesion: Sesion | null; listo: boolean } {
  const [estado, setEstado] = useState<{ sesion: Sesion | null; listo: boolean }>({ sesion: null, listo: false });
  useEffect(() => {
    const cargar = () => setEstado({ sesion: getSesion(), listo: true });
    cargar();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || (Object.values(K) as string[]).includes(e.key)) cargar();
    };
    window.addEventListener(EVENTO, cargar);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENTO, cargar);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return estado;
}

export function puedeVer(sesion: Sesion | null, ruta: string): boolean {
  if (!sesion) return false;
  if (ruta === "/dashboard") return true; // solo redirige al primer módulo permitido
  return sesion.modulos.some((m) => m === "*" || ruta === m || ruta.startsWith(`${m}/`));
}

/** Primer módulo al que entra el usuario tras el login. */
export function inicioDe(sesion: Sesion): string {
  return sesion.modulos.includes("*") ? "/dashboard/compras" : sesion.modulos[0];
}

export const rolNegocio = (sesion: Sesion | null): Rol => (sesion ? ROL_NEGOCIO[sesion.rol] : "CONTADOR");

// ---------------------------------------------------------------------
// SHA-256 en JS puro: crypto.subtle no existe cuando el ERP se abre por
// http:// desde otra PC de la red (solo en https o localhost).
// ---------------------------------------------------------------------
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(texto: string): string {
  const datos = new TextEncoder().encode(texto);
  const largo = ((datos.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(largo);
  buf.set(datos);
  buf[datos.length] = 0x80;
  const vista = new DataView(buf.buffer);
  vista.setUint32(largo - 4, datos.length * 8);
  vista.setUint32(largo - 8, Math.floor((datos.length * 8) / 2 ** 32));

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < largo; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i];
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}
