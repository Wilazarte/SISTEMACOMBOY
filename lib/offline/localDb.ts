"use client";

// =====================================================================
// Base local del equipo, para trabajar sin señal.
//   - Windows (Tauri): SQLite (@tauri-apps/plugin-sql, archivo comboy-erp.db). Las tablas las crea
//     src-tauri/src/lib.rs: oc, facturas, guias, kardex, otros_registros, usuarios, sync_queue,
//     correlativos_reservados, ajustes.
//   - Android (Capacitor) y cualquier otro WebView: IndexedDB con las mismas operaciones.
// Nada de esto se usa en el navegador normal (ver lib/offline/plataforma.ts).
// =====================================================================

import { esTauri } from "./plataforma";

/** Fila tal como va a Supabase (tablas de documentos: { tipo, id, data }). */
export type FilaLocal = Record<string, unknown> & { id: string };

export type EstadoSync = "synced" | "pending" | "error" | "conflict";

export interface OpCola {
  id?: number;
  /** Tabla de Supabase (compras, almacen, ventas...). */
  tabla: string;
  operacion: "upsert" | "delete";
  /** upsert: la fila completa; delete: { id, tipo? }. */
  payload: FilaLocal;
  /** Clave del ERP (lib/storage.ts KEYS), p. ej. "ordenes_compra". */
  clave: string;
  registroId: string;
  /** JSON de la fila tal como estaba en el servidor cuando se editó (detección de conflictos). null = fila nueva. */
  base: string | null;
  /** Momento del cambio en este equipo (ISO). Gana el más reciente (last-write-wins). */
  createdAt: string;
  intentos: number;
  estado: "pending" | "error";
  ultimoError?: string | null;
}

export interface SesionGuardada {
  uid: string;
  usuario: string;
  rol: string;
  soloLectura: boolean;
  sesion: unknown;
  actualizadoEn: string;
}

/** Claves del ERP que tienen tabla propia en SQLite (las pedidas: oc, facturas, guias, kardex). */
const TABLA_LOCAL: Record<string, "oc" | "facturas" | "guias" | "kardex"> = {
  ordenes_compra: "oc",
  facturas: "facturas",
  guias: "guias",
  almacen_kardex: "kardex",
};

/** N° visible del documento (OC-2026-0001, F001-123...) para la columna serie. */
function serieDe(f: FilaLocal): string | null {
  const d = (f.data ?? f) as Record<string, unknown>;
  const v = d.numero ?? d.codigo ?? d.serie ?? d.numeroSerie ?? null;
  return v === null || v === undefined ? null : String(v);
}

interface Motor {
  guardarSnapshot(clave: string, filas: FilaLocal[]): Promise<void>;
  leerSnapshot(clave: string): Promise<FilaLocal[] | null>;
  marcar(clave: string, id: string, estado: EstadoSync): Promise<void>;
  encolar(op: OpCola): Promise<void>;
  cola(): Promise<OpCola[]>;
  actualizarOp(id: number, cambios: Partial<Pick<OpCola, "intentos" | "estado" | "ultimoError">>): Promise<void>;
  quitarOp(id: number): Promise<void>;
  guardarSesion(s: SesionGuardada): Promise<void>;
  leerSesion(uid: string): Promise<SesionGuardada | null>;
  ajuste(k: string): Promise<string | null>;
  fijarAjuste(k: string, v: string): Promise<void>;
  guardarCorrelativos(serie: string, numeros: number[]): Promise<void>;
  tomarCorrelativo(serie: string): Promise<number | null>;
  contarCorrelativos(serie: string): Promise<number>;
}

// ---------------------------------------------------------------------
// SQLite (Tauri)
// ---------------------------------------------------------------------

type Sql = {
  execute(q: string, v?: unknown[]): Promise<unknown>;
  select<T>(q: string, v?: unknown[]): Promise<T>;
};

function motorSqlite(): Motor {
  let db: Promise<Sql> | null = null;
  const conexion = () =>
    (db ??= import("@tauri-apps/plugin-sql").then(async ({ default: Database }) => (await Database.load("sqlite:comboy-erp.db")) as unknown as Sql));

  const filaCola = (r: Record<string, unknown>): OpCola => ({
    id: Number(r.id),
    tabla: String(r.tabla),
    operacion: r.operacion as OpCola["operacion"],
    payload: JSON.parse(String(r.payload_json)),
    clave: String(r.clave),
    registroId: String(r.registro_id),
    base: (r.base_updated_at as string | null) ?? null,
    createdAt: String(r.created_at),
    intentos: Number(r.intentos) || 0,
    estado: r.estado as OpCola["estado"],
    ultimoError: (r.ultimo_error as string | null) ?? null,
  });

  return {
    async guardarSnapshot(clave, filas) {
      const sql = await conexion();
      const t = TABLA_LOCAL[clave];
      // Los cambios locales pendientes no se pisan con la copia del servidor
      if (t) await sql.execute(`DELETE FROM ${t} WHERE sync_status = 'synced'`);
      else await sql.execute("DELETE FROM otros_registros WHERE clave = $1 AND sync_status = 'synced'", [clave]);
      const ahora = new Date().toISOString();
      for (let i = 0; i < filas.length; i += 100) {
        const lote = filas.slice(i, i + 100);
        const valores: unknown[] = [];
        const marcas = lote.map((f, j) => {
          const b = j * 4;
          valores.push(t ? String(f.id) : clave, t ? serieDe(f) : String(f.id), JSON.stringify(f), ahora);
          return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, 'synced')`;
        });
        const columnas = t ? `${t} (id, serie, data, updated_at, sync_status)` : "otros_registros (clave, id, data, updated_at, sync_status)";
        await sql.execute(`INSERT OR IGNORE INTO ${columnas} VALUES ${marcas.join(", ")}`, valores);
      }
    },
    async leerSnapshot(clave) {
      const sql = await conexion();
      const t = TABLA_LOCAL[clave];
      const filas = t
        ? await sql.select<{ data: string }[]>(`SELECT data FROM ${t}`)
        : await sql.select<{ data: string }[]>("SELECT data FROM otros_registros WHERE clave = $1", [clave]);
      if (!filas.length && !(await this.ajuste(`snap:${clave}`))) return null;
      return filas.map((f) => JSON.parse(f.data) as FilaLocal);
    },
    async marcar(clave, id, estado) {
      const sql = await conexion();
      const t = TABLA_LOCAL[clave];
      if (t) await sql.execute(`UPDATE ${t} SET sync_status = $1 WHERE id = $2`, [estado, id]);
      else await sql.execute("UPDATE otros_registros SET sync_status = $1 WHERE clave = $2 AND id = $3", [estado, clave, id]);
    },
    async encolar(op) {
      const sql = await conexion();
      await sql.execute(
        "INSERT INTO sync_queue (tabla, operacion, payload_json, created_at, intentos, clave, registro_id, base_updated_at, estado) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, 'pending')",
        [op.tabla, op.operacion, JSON.stringify(op.payload), op.createdAt, op.clave, op.registroId, op.base]
      );
      // La copia local queda con el cambio y marcada como pendiente
      const t = TABLA_LOCAL[op.clave];
      if (op.operacion === "upsert") {
        if (t)
          await sql.execute(`INSERT OR REPLACE INTO ${t} (id, serie, data, updated_at, sync_status) VALUES ($1, $2, $3, $4, 'pending')`, [
            op.registroId,
            serieDe(op.payload),
            JSON.stringify(op.payload),
            op.createdAt,
          ]);
        else
          await sql.execute("INSERT OR REPLACE INTO otros_registros (clave, id, data, updated_at, sync_status) VALUES ($1, $2, $3, $4, 'pending')", [
            op.clave,
            op.registroId,
            JSON.stringify(op.payload),
            op.createdAt,
          ]);
      } else if (t) await sql.execute(`DELETE FROM ${t} WHERE id = $1`, [op.registroId]);
      else await sql.execute("DELETE FROM otros_registros WHERE clave = $1 AND id = $2", [op.clave, op.registroId]);
    },
    async cola() {
      const sql = await conexion();
      return (await sql.select<Record<string, unknown>[]>("SELECT * FROM sync_queue ORDER BY id")).map(filaCola);
    },
    async actualizarOp(id, c) {
      const sql = await conexion();
      await sql.execute("UPDATE sync_queue SET intentos = COALESCE($1, intentos), estado = COALESCE($2, estado), ultimo_error = $3 WHERE id = $4", [
        c.intentos ?? null,
        c.estado ?? null,
        c.ultimoError ?? null,
        id,
      ]);
    },
    async quitarOp(id) {
      const sql = await conexion();
      await sql.execute("DELETE FROM sync_queue WHERE id = $1", [id]);
    },
    async guardarSesion(s) {
      const sql = await conexion();
      await sql.execute(
        "INSERT OR REPLACE INTO usuarios (uid, usuario, rol, solo_lectura, sesion_json, actualizado_en) VALUES ($1, $2, $3, $4, $5, $6)",
        [s.uid, s.usuario, s.rol, s.soloLectura ? 1 : 0, JSON.stringify(s.sesion), s.actualizadoEn]
      );
    },
    async leerSesion(uid) {
      const sql = await conexion();
      const [r] = await sql.select<Record<string, unknown>[]>("SELECT * FROM usuarios WHERE uid = $1", [uid]);
      if (!r) return null;
      return {
        uid: String(r.uid),
        usuario: String(r.usuario),
        rol: String(r.rol),
        soloLectura: Number(r.solo_lectura) === 1,
        sesion: JSON.parse(String(r.sesion_json)),
        actualizadoEn: String(r.actualizado_en),
      };
    },
    async ajuste(k) {
      const sql = await conexion();
      const [r] = await sql.select<{ v: string | null }[]>("SELECT v FROM ajustes WHERE k = $1", [k]);
      return r?.v ?? null;
    },
    async fijarAjuste(k, v) {
      const sql = await conexion();
      await sql.execute("INSERT OR REPLACE INTO ajustes (k, v) VALUES ($1, $2)", [k, v]);
    },
    async guardarCorrelativos(serie, numeros) {
      const sql = await conexion();
      for (const n of numeros) await sql.execute("INSERT OR IGNORE INTO correlativos_reservados (serie, numero) VALUES ($1, $2)", [serie, n]);
    },
    async tomarCorrelativo(serie) {
      const sql = await conexion();
      const [r] = await sql.select<{ numero: number }[]>("SELECT numero FROM correlativos_reservados WHERE serie = $1 ORDER BY numero LIMIT 1", [serie]);
      if (!r) return null;
      await sql.execute("DELETE FROM correlativos_reservados WHERE serie = $1 AND numero = $2", [serie, r.numero]);
      return Number(r.numero);
    },
    async contarCorrelativos(serie) {
      const sql = await conexion();
      const [r] = await sql.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM correlativos_reservados WHERE serie = $1", [serie]);
      return Number(r?.n) || 0;
    },
  };
}

// ---------------------------------------------------------------------
// IndexedDB (Capacitor / otros WebView)
// ---------------------------------------------------------------------

function motorIndexedDb(): Motor {
  let db: Promise<IDBDatabase> | null = null;
  const abrir = () =>
    (db ??= new Promise<IDBDatabase>((ok, mal) => {
      const r = indexedDB.open("comboy-erp", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("registros"); // clave `${clave}|${id}` -> { clave, id, fila, estado }
        d.createObjectStore("cola", { keyPath: "id", autoIncrement: true });
        d.createObjectStore("kv"); // ajustes, sesiones y correlativos
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    }));
  const req = <T,>(r: IDBRequest<T>) => new Promise<T>((ok, mal) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => mal(r.error))));
  const store = async (nombre: string, modo: IDBTransactionMode = "readonly") => (await abrir()).transaction(nombre, modo).objectStore(nombre);

  type Reg = { clave: string; id: string; fila: FilaLocal; estado: EstadoSync };
  const registrosDe = async (clave: string): Promise<Reg[]> => {
    const s = await store("registros");
    return req(s.getAll(IDBKeyRange.bound(`${clave}|`, `${clave}|￿`))) as Promise<Reg[]>;
  };
  const kv = {
    get: async <T,>(k: string) => (await req((await store("kv")).get(k))) as T | undefined,
    set: async (k: string, v: unknown) => void (await req((await store("kv", "readwrite")).put(v, k))),
  };

  return {
    async guardarSnapshot(clave, filas) {
      const previos = await registrosDe(clave);
      const s = await store("registros", "readwrite");
      previos.filter((r) => r.estado === "synced").forEach((r) => s.delete(`${clave}|${r.id}`));
      const pendientes = new Set(previos.filter((r) => r.estado !== "synced").map((r) => r.id));
      filas.filter((f) => !pendientes.has(String(f.id))).forEach((f) => s.put({ clave, id: String(f.id), fila: f, estado: "synced" }, `${clave}|${f.id}`));
      await kv.set(`snap:${clave}`, "1");
    },
    async leerSnapshot(clave) {
      if (!(await kv.get(`snap:${clave}`))) return null;
      return (await registrosDe(clave)).map((r) => r.fila);
    },
    async marcar(clave, id, estado) {
      const s = await store("registros", "readwrite");
      const r = (await req(s.get(`${clave}|${id}`))) as Reg | undefined;
      if (r) await req(s.put({ ...r, estado }, `${clave}|${id}`));
    },
    async encolar(op) {
      const { id: _sinId, ...resto } = op;
      void _sinId;
      await req((await store("cola", "readwrite")).add(resto));
      const s = await store("registros", "readwrite");
      if (op.operacion === "upsert") await req(s.put({ clave: op.clave, id: op.registroId, fila: op.payload, estado: "pending" }, `${op.clave}|${op.registroId}`));
      else await req(s.delete(`${op.clave}|${op.registroId}`));
    },
    async cola() {
      return (await req((await store("cola")).getAll())) as OpCola[];
    },
    async actualizarOp(id, c) {
      const s = await store("cola", "readwrite");
      const op = (await req(s.get(id))) as OpCola | undefined;
      if (op) await req(s.put({ ...op, ...c }));
    },
    async quitarOp(id) {
      await req((await store("cola", "readwrite")).delete(id));
    },
    guardarSesion: (s) => kv.set(`sesion:${s.uid}`, s),
    leerSesion: async (uid) => (await kv.get<SesionGuardada>(`sesion:${uid}`)) ?? null,
    ajuste: async (k) => (await kv.get<string>(`ajuste:${k}`)) ?? null,
    fijarAjuste: (k, v) => kv.set(`ajuste:${k}`, v),
    async guardarCorrelativos(serie, numeros) {
      const previos = (await kv.get<number[]>(`corr:${serie}`)) ?? [];
      await kv.set(`corr:${serie}`, Array.from(new Set([...previos, ...numeros])).sort((a, b) => a - b));
    },
    async tomarCorrelativo(serie) {
      const lista = (await kv.get<number[]>(`corr:${serie}`)) ?? [];
      const [n, ...resto] = lista;
      if (n === undefined) return null;
      await kv.set(`corr:${serie}`, resto);
      return n;
    },
    contarCorrelativos: async (serie) => ((await kv.get<number[]>(`corr:${serie}`)) ?? []).length,
  };
}

let motor: Motor | null = null;

/** Base local del equipo (SQLite en Windows, IndexedDB en el celular). */
export function localDb(): Motor {
  return (motor ??= esTauri() ? motorSqlite() : motorIndexedDb());
}

/** Marca que la copia de una clave ya se guardó (aunque esté vacía). */
export async function guardarCopia(clave: string, filas: FilaLocal[]): Promise<void> {
  const db = localDb();
  await db.guardarSnapshot(clave, filas);
  if (esTauri()) await db.fijarAjuste(`snap:${clave}`, new Date().toISOString());
}
