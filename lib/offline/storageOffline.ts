"use client";

// =====================================================================
// Puente entre la capa de datos (lib/storage.ts) y la base local.
// Solo actúa dentro de las apps (Windows / Android): en el navegador todo sigue igual que antes.
//
//   - guardarCopiaClave: cada clave que baja de Supabase se copia a SQLite (para abrir sin señal).
//   - leerCopia: sin señal, iniciarDatos carga la copia local.
//   - encolarCambios: un INSERT/UPDATE/DELETE sin señal se guarda en sync_queue (sync_status = 'pending')
//     y la pantalla queda con el cambio; useSync() lo sube al volver la señal.
//   - superponerPendientes: si llega una recarga del servidor antes de subir la cola, los cambios
//     locales pendientes no desaparecen de la pantalla.
//   - correlativos: números (OC, REQ...) reservados en Supabase cuando había señal, para emitir sin señal.
// =====================================================================

import { EV_SYNC } from "./cola";
import { guardarCopia, localDb, type FilaLocal, type OpCola } from "./localDb";
import { esAppNativa } from "./plataforma";

export const offlineActivo = (): boolean => esAppNativa();

/** Cambios locales que aún no suben: clave -> id -> fila (null = borrado). */
const pendientes = new Map<string, Map<string, FilaLocal | null>>();
let pendientesCargados: Promise<void> | null = null;

async function recargarPendientes(): Promise<void> {
  const ops = await localDb().cola();
  pendientes.clear();
  for (const op of ops) {
    const m = pendientes.get(op.clave) ?? new Map<string, FilaLocal | null>();
    m.set(op.registroId, op.operacion === "upsert" ? op.payload : null);
    pendientes.set(op.clave, m);
  }
}

/** Carga la cola en memoria (una vez) y la mantiene al día tras cada sincronización. */
export function prepararPendientes(): Promise<void> {
  if (!offlineActivo()) return Promise.resolve();
  if (!pendientesCargados) {
    pendientesCargados = recargarPendientes().catch(() => undefined);
    window.addEventListener(EV_SYNC, () => void recargarPendientes().catch(() => undefined));
  }
  return pendientesCargados;
}

/** Aplica sobre las filas del servidor los cambios locales que todavía no se subieron. */
export function superponerPendientes<F extends { id: string }>(clave: string, filas: F[]): F[] {
  const m = pendientes.get(clave);
  if (!m || m.size === 0) return filas;
  const porId = new Map(filas.map((f) => [String(f.id), f] as const));
  m.forEach((fila, id) => {
    if (fila === null) porId.delete(id);
    else porId.set(id, fila as unknown as F);
  });
  // Lo nuevo (que el servidor aún no tiene) va arriba, como hace el ERP con las listas
  const nuevos = Array.from(m.entries())
    .filter(([id, f]) => f !== null && !filas.some((x) => String(x.id) === id))
    .map(([id]) => porId.get(id)!);
  const resto = filas.filter((f) => porId.has(String(f.id))).map((f) => porId.get(String(f.id))!);
  return [...nuevos, ...resto];
}

const temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

/** Copia la clave a la base local (agrupa escrituras seguidas). */
export function guardarCopiaClave(clave: string, filas: () => FilaLocal[]): void {
  if (!offlineActivo()) return;
  clearTimeout(temporizadores.get(clave));
  temporizadores.set(
    clave,
    setTimeout(() => {
      temporizadores.delete(clave);
      void guardarCopia(clave, filas()).catch((e) => console.warn(`copia local ${clave}:`, (e as Error).message));
    }, 800)
  );
}

/** Copia local de una clave (null si este equipo nunca la descargó). */
export async function leerCopia(clave: string): Promise<FilaLocal[] | null> {
  if (!offlineActivo()) return null;
  await prepararPendientes();
  const filas = await localDb().leerSnapshot(clave);
  return filas;
}

/** Guarda en la cola los cambios de una clave que no se pudieron subir. */
export async function encolarCambios(
  clave: string,
  tabla: string,
  cambios: FilaLocal[],
  borrados: { id: string; tipo?: string }[],
  base: (id: string) => string | null
): Promise<void> {
  const db = localDb();
  const ahora = new Date().toISOString();
  const nueva = (operacion: OpCola["operacion"], payload: FilaLocal): OpCola => ({
    tabla,
    operacion,
    payload,
    clave,
    registroId: String(payload.id),
    base: base(String(payload.id)),
    createdAt: ahora,
    intentos: 0,
    estado: "pending",
  });
  const m = pendientes.get(clave) ?? new Map<string, FilaLocal | null>();
  for (const f of cambios) {
    await db.encolar(nueva("upsert", f));
    m.set(String(f.id), f);
  }
  for (const b of borrados) {
    await db.encolar(nueva("delete", (b.tipo ? { id: b.id, tipo: b.tipo } : { id: b.id }) as FilaLocal));
    m.set(b.id, null);
  }
  pendientes.set(clave, m);
  window.dispatchEvent(new CustomEvent("erp:cola", { detail: { clave, n: cambios.length + borrados.length } }));
}

// ---------------------------------------------------------------------
// Correlativos para emitir sin señal
// ---------------------------------------------------------------------

/** Series que se pueden emitir sin señal y cuántos números se guardan por equipo. */
export const SERIES_OFFLINE: Record<string, number> = { OC: 3, REQ: 3 };

export async function correlativoReservado(serie: string): Promise<number | null> {
  if (!offlineActivo() || !(serie in SERIES_OFFLINE)) return null;
  return localDb().tomarCorrelativo(serie);
}

/**
 * Con señal: completa la reserva de números de cada serie (pide a Supabase con siguiente_numero, el mismo
 * correlativo atómico de siempre). Si el rol no puede emitir esa serie, Supabase lo rechaza y no se reserva.
 */
export async function reservarCorrelativos(pedir: (serie: string) => Promise<number>): Promise<void> {
  if (!offlineActivo()) return;
  const db = localDb();
  for (const [serie, cuantos] of Object.entries(SERIES_OFFLINE)) {
    let faltan = cuantos - (await db.contarCorrelativos(serie));
    while (faltan-- > 0) {
      try {
        await db.guardarCorrelativos(serie, [await pedir(serie)]);
      } catch {
        break; // sin permiso o sin red: se intenta en la próxima sincronización
      }
    }
  }
}
