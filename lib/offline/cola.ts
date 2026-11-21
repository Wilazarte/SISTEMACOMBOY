"use client";

// =====================================================================
// Cola de sincronización (sync_queue): sube a Supabase los cambios hechos sin señal.
//
// Reglas (pedido de Williams, 2026-11-06):
//   - Se sube en el orden en que se hicieron. Sin red se detiene y espera.
//   - Si falla por otra causa (permiso, dato inválido) se reintenta hasta 3 veces; luego queda en "error"
//     visible para el usuario, sin bloquear al resto de la cola.
//   - Conflicto = otro equipo cambió la misma fila mientras este estaba sin señal. Gana el cambio más
//     reciente (last-write-wins por fecha), NUNCA se borra nada, y la versión perdedora queda en la tabla
//     public.conflictos para que Administración (SOPORTE) decida.
// Los permisos no cambian: Supabase aplica las mismas políticas RLS de siempre al subir.
// =====================================================================

import { createClient } from "@/lib/supabase/client";
import { localDb, type FilaLocal, type OpCola } from "./localDb";
import { idDispositivo } from "./plataforma";
import { esErrorDeRed } from "./red";

export const MAX_INTENTOS = 3;
export const EV_SYNC = "erp:sync";

export interface ResultadoSync {
  subidos: number;
  conflictos: number;
  errores: number;
  pendientes: number;
  sinRed: boolean;
  /** Claves del ERP que cambiaron en el servidor: se vuelven a leer. */
  claves: string[];
}

const ordenar = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordenar)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]))
      : v;

/** Misma firma que lib/storage.ts (solo con las columnas que el ERP envía). */
const firmaDe = (fila: Record<string, unknown>, columnas: string[]) =>
  JSON.stringify(ordenar(Object.fromEntries(columnas.filter((c) => c in fila).map((c) => [c, fila[c]]))));

const serieDe = (f: FilaLocal | null | undefined): string | null => {
  if (!f) return null;
  const d = (f.data ?? f) as Record<string, unknown>;
  const v = d.numero ?? d.codigo ?? d.serie ?? d.numeroSerie;
  return v === undefined || v === null ? null : String(v);
};

let enCurso: Promise<ResultadoSync> | null = null;

/** Sube la cola. Si ya se está subiendo, devuelve la misma ejecución. */
export function procesarCola(usuario?: string): Promise<ResultadoSync> {
  return (enCurso ??= subir(usuario).finally(() => {
    enCurso = null;
  }));
}

async function subir(usuario?: string): Promise<ResultadoSync> {
  const db = localDb();
  const sb = createClient();
  const r: ResultadoSync = { subidos: 0, conflictos: 0, errores: 0, pendientes: 0, sinRed: false, claves: [] };
  const claves = new Set<string>();
  const ops = (await db.cola()).filter((o) => o.estado === "pending");

  for (const op of ops) {
    try {
      const resultado = await subirOp(sb, op, usuario);
      await db.quitarOp(op.id!);
      if (op.operacion === "upsert") await db.marcar(op.clave, op.registroId, resultado === "conflicto" ? "conflict" : "synced");
      claves.add(op.clave);
      if (resultado === "conflicto") r.conflictos++;
      else r.subidos++;
    } catch (e) {
      if (esErrorDeRed(e)) {
        r.sinRed = true;
        break; // sin señal: el resto espera al próximo intento
      }
      const intentos = op.intentos + 1;
      const msg = (e as { message?: string }).message ?? String(e);
      const estado = intentos >= MAX_INTENTOS ? "error" : "pending";
      await db.actualizarOp(op.id!, { intentos, estado, ultimoError: msg });
      if (estado === "error") {
        r.errores++;
        await db.marcar(op.clave, op.registroId, "error");
      }
    }
  }
  const restantes = await db.cola();
  r.pendientes = restantes.filter((o) => o.estado === "pending").length;
  r.errores = restantes.filter((o) => o.estado === "error").length;
  r.claves = Array.from(claves);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EV_SYNC, { detail: r }));
  return r;
}

type Sb = ReturnType<typeof createClient>;

/** Sube una operación. Devuelve "ok" o "conflicto" (ya resuelto con last-write-wins y registrado). */
async function subirOp(sb: Sb, op: OpCola, usuario?: string): Promise<"ok" | "conflicto"> {
  const p = op.payload;
  const tieneTipo = typeof p.tipo === "string";
  let q = sb.from(op.tabla).select("*").eq("id", op.registroId);
  if (tieneTipo) q = q.eq("tipo", p.tipo as string);
  const { data: actual, error: errLeer } = await q.maybeSingle();
  if (errLeer) throw errLeer;

  const servidor = actual as (Record<string, unknown> & { updated_at?: string }) | null;
  const columnas = Object.keys(p);
  const cambioEnServidor = servidor ? (op.base === null ? firmaDe(servidor, columnas) !== firmaDe(p, columnas) : firmaDe(servidor, columnas) !== op.base) : false;

  if (!cambioEnServidor) {
    await aplicar(sb, op);
    return "ok";
  }

  // Conflicto: gana el más reciente. Un borrado en conflicto nunca se aplica (nunca borrar).
  const fechaServidor = servidor?.updated_at ? Date.parse(servidor.updated_at) : Number.POSITIVE_INFINITY;
  const ganaLocal = op.operacion === "upsert" && Date.parse(op.createdAt) > fechaServidor;
  if (ganaLocal) await aplicar(sb, op);

  const { error } = await sb.from("conflictos").insert({
    tabla: op.tabla,
    tipo: tieneTipo ? p.tipo : null,
    registro_id: op.registroId,
    clave: op.clave,
    serie: serieDe(p) ?? serieDe(servidor as FilaLocal | null),
    operacion: op.operacion,
    version_local: p,
    version_servidor: servidor,
    gano: ganaLocal ? "LOCAL" : "SERVIDOR",
    editado_local_en: op.createdAt,
    servidor_updated_at: servidor?.updated_at ?? null,
    usuario: usuario ?? null,
    dispositivo: idDispositivo(),
  });
  // Sin la tabla (SQL 20261112 aún no corrido) igual se resuelve: queda solo el aviso en consola
  if (error && !esErrorDeRed(error)) console.warn("conflictos:", error.message);
  else if (error) throw error;
  return "conflicto";
}

async function aplicar(sb: Sb, op: OpCola): Promise<void> {
  const p = op.payload;
  const tieneTipo = typeof p.tipo === "string";
  if (op.operacion === "delete") {
    let q = sb.from(op.tabla).delete().eq("id", op.registroId);
    if (tieneTipo) q = q.eq("tipo", p.tipo as string);
    const { error } = await q;
    if (error) throw error;
    return;
  }
  const { error } = await sb.from(op.tabla).upsert(p, { onConflict: tieneTipo ? "tipo,id" : "id" });
  if (!error) return;
  if (error.code !== "42P10") throw error;
  // Tabla sin índice único (tipo, id): actualizar y, si no existía, insertar (igual que lib/storage.ts)
  let u = sb.from(op.tabla).update(p).eq("id", op.registroId);
  if (tieneTipo) u = u.eq("tipo", p.tipo as string);
  const { data, error: e2 } = await u.select("id");
  if (e2) throw e2;
  if (data && data.length) return;
  const ins = await sb.from(op.tabla).insert(p);
  if (ins.error) throw ins.error;
}

/** Vuelve a poner en cola las operaciones que quedaron en "error" (botón Reintentar). */
export async function reintentarErrores(): Promise<void> {
  const db = localDb();
  for (const op of await db.cola()) if (op.estado === "error") await db.actualizarOp(op.id!, { estado: "pending", intentos: 0, ultimoError: null });
}

/** Resumen para la insignia: cuántos cambios esperan y cuántos fallaron. */
export async function estadoCola(): Promise<{ pendientes: number; errores: number; ultimoError: string | null }> {
  const ops = await localDb().cola();
  const err = ops.filter((o) => o.estado === "error");
  return { pendientes: ops.filter((o) => o.estado === "pending").length, errores: err.length, ultimoError: err[0]?.ultimoError ?? null };
}
