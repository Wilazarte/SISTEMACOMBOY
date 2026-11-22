"use client";

// =====================================================================
// GESTIÓN DOCUMENTARIA AUDITADA (Williams, 2026-11-17).
// Módulo independiente: tablas propias (SQL 20261204_gestion_documentaria.sql) y Edge Function
// gestion-documental. El navegador NUNCA escribe en las tablas ni toca el bucket: todo pasa por
// funciones gd_* de la base (que validan el permiso y escriben audit_log en la misma transacción)
// o por la Edge Function (archivos). Aquí solo se llaman y se arman los reportes.
// =====================================================================

import { createClient } from "./supabase/client";
import { guardarArchivo } from "./guardarArchivo";

export const MODULOS_GD = ["Almacen", "Tesoreria", "Produccion", "Ventas", "Gerencia", "Logistica"] as const;
export type ModuloGD = (typeof MODULOS_GD)[number];
export const CATEGORIAS_GD = ["Plano", "Politica", "Estrategia Comercial", "Contrato", "Requerimiento", "Cotizacion", "Factura"] as const;
export type CategoriaGD = (typeof CATEGORIAS_GD)[number];
export const ESTADOS_GD = ["Borrador", "En Revision", "Pendiente", "Aprobado", "Rechazado", "Archivado", "Vencido"] as const;
export type EstadoGD = (typeof ESTADOS_GD)[number];
export const ROLES_GD = ["Gerencia", "Ingenieria", "Produccion", "Almacen", "Tesoreria", "Ventas", "Logistica", "Secocha"] as const;
export type RolGD = (typeof ROLES_GD)[number];
export const PERMISOS_GD = ["Sin Acceso", "Solo Lectura", "Lectura y Descarga", "Edicion", "Aprobacion", "Control Total"] as const;
export type PermisoGD = (typeof PERMISOS_GD)[number];

/** Nombre con tilde para mostrar (en la base se guarda sin tilde, como pidió Williams). */
export const ETIQUETA: Record<string, string> = {
  Almacen: "Almacén",
  Tesoreria: "Tesorería",
  Produccion: "Producción",
  Logistica: "Logística",
  Ingenieria: "Ingeniería",
  Politica: "Política",
  Cotizacion: "Cotización",
  "En Revision": "En Revisión",
  Edicion: "Edición",
  Aprobacion: "Aprobación",
};
export const et = (s: string | null | undefined): string => (s ? (ETIQUETA[s] ?? s) : "");

export const PREFIJO: Record<CategoriaGD, string> = {
  Plano: "PLN",
  Politica: "POL",
  "Estrategia Comercial": "EST",
  Contrato: "CTR",
  Requerimiento: "REQ",
  Cotizacion: "COT",
  Factura: "FAC",
};

/** Paleta obligatoria del módulo: solo estos 4 colores (más blanco para las tarjetas). */
// Colores del tema activo (app/themes.css); con COMBOY VID son #11212D, #800021, #294D61 y #CCD0CF
export const COLOR = { noche: "var(--fuerte)", burdeos: "var(--accent)", petroleo: "var(--secundario)", fondo: "var(--border)" } as const;

/** Color de cada estado: Aprobado = petróleo; Pendiente / En Revisión / Rechazado = burdeos; Archivado = noche. */
export function colorEstado(e: string): { fondo: string; texto: string; borde: string; relleno: boolean } {
  if (e === "Aprobado") return { fondo: COLOR.petroleo, texto: "#FFFFFF", borde: COLOR.petroleo, relleno: true };
  if (e === "Rechazado" || e === "Vencido") return { fondo: COLOR.burdeos, texto: "#FFFFFF", borde: COLOR.burdeos, relleno: true };
  if (e === "Pendiente" || e === "En Revision") return { fondo: "transparent", texto: COLOR.burdeos, borde: COLOR.burdeos, relleno: false };
  if (e === "Archivado") return { fondo: COLOR.noche, texto: "#FFFFFF", borde: COLOR.noche, relleno: true };
  return { fondo: "transparent", texto: "var(--text)", borde: "var(--text)", relleno: false }; // Borrador
}

export const NIVEL: Record<PermisoGD, number> = { "Sin Acceso": 0, "Solo Lectura": 1, "Lectura y Descarga": 2, Edicion: 3, Aprobacion: 4, "Control Total": 5 };
export const permisoDeNivel = (n: number): PermisoGD => PERMISOS_GD[Math.max(0, Math.min(5, n))];

export interface DocumentoGD {
  id: string;
  codigo_unico: string;
  nombre: string;
  descripcion: string | null;
  modulo: ModuloGD;
  categoria: CategoriaGD;
  estado: EstadoGD;
  version_actual: string;
  dueno_id: string;
  dueno_nombre: string | null;
  fecha_creacion: string;
  fecha_vencimiento: string | null;
  hash_sha256: string;
  es_confidencial: boolean;
  referencia_externa: string | null;
  sede: "AREQUIPA" | "SECOCHA";
  archivo_nombre: string | null;
  archivo_tipo: string | null;
  archivo_bytes: number | null;
  integridad: "OK" | "ALERTA" | "SIN_VERIFICAR";
  /** Nivel del usuario conectado sobre el documento (0-5). */
  nivel: number;
  motivo_archivo: string | null;
  actualizado_at: string;
}

export interface VersionGD {
  version: string;
  hash_sha256: string;
  cambiado_por: string | null;
  motivo_cambio: string;
  fecha: string;
  archivo_nombre: string | null;
  archivo_bytes: number | null;
  restaurada_de: string | null;
}
export interface PermisoFila {
  rol: RolGD;
  permiso: PermisoGD;
  otorgado_por: string | null;
  actualizado_at: string;
}
export interface PasoFlujo {
  version: string;
  paso: number;
  aprobador_rol: RolGD;
  aprobador: string | null;
  estado: "En Espera" | "Pendiente" | "Aprobado" | "Rechazado" | "Anulado";
  comentario: string | null;
  fecha_aprobacion: string | null;
}
export interface DetalleGD {
  nivel: number;
  rol: string | null;
  puede_resolver: boolean;
  paso_pendiente: { paso: number; aprobador_rol: string } | null;
  versiones: VersionGD[];
  permisos: PermisoFila[];
  flujo: PasoFlujo[];
}
export interface AuditoriaGD {
  id: number;
  secuencia: number;
  document_id: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  accion: string;
  fecha_hora: string;
  ip: string | null;
  dispositivo: string | null;
  detalle: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  version: string | null;
  codigo_documento: string | null;
  nombre_documento: string | null;
  confidencial: boolean;
  hash_registro: string;
}
export interface PendienteGD {
  id: string;
  codigo_unico: string;
  nombre: string;
  version: string;
  paso: number;
  aprobador_rol: string;
  desde: string;
}
export interface VencimientoGD {
  codigo_unico: string;
  nombre: string;
  categoria: string;
  modulo: string;
  estado: string;
  version_actual: string;
  dueno_nombre: string | null;
  fecha_vencimiento: string;
  dias_restantes: number;
}

/** Rol de Gestión Documentaria según perfiles.rol (misma regla que gd_rol_de en la base). */
export function rolGD(rol: string | undefined | null): RolGD | "Soporte" | null {
  switch (rol) {
    case "creador":
    case "soporte":
      return "Soporte";
    case "gerencia":
      return "Gerencia";
    case "ingenieria":
      return "Ingenieria";
    case "produccion":
      return "Produccion";
    case "almacen":
      return "Almacen";
    case "tesoreria":
    case "finanzas":
    case "planilla":
      return "Tesoreria";
    case "ventas":
      return "Ventas";
    case "logistica":
      return "Logistica";
    case "sucursal":
      return "Secocha";
    default:
      return null;
  }
}

/** Módulos donde el rol puede subir: los moduladores solo el suyo; Gerencia, Soporte y Secocha todos. */
export function modulosParaSubir(rol: ReturnType<typeof rolGD>): ModuloGD[] {
  if (!rol) return [];
  if (rol === "Soporte" || rol === "Gerencia" || rol === "Secocha") return [...MODULOS_GD];
  if (rol === "Ingenieria") return ["Produccion"];
  return (MODULOS_GD as readonly string[]).includes(rol) ? [rol as ModuloGD] : [];
}

export const esGerenciaGD = (rol: ReturnType<typeof rolGD>) => rol === "Gerencia" || rol === "Soporte";

// ---------------------------------------------------------------- Formato
export const fechaHora = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fechaCorta = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-05:00`) : new Date(iso);
  return d.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });
};
export const hoyLima = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
export const pesoArchivo = (b: number | null | undefined): string =>
  !b ? "—" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", (data instanceof Uint8Array ? data : new Uint8Array(data)) as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Dispositivo que se envía junto a la IP (la IP la toma el servidor, no el navegador). */
export function dispositivo(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const so = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Otro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const app = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) ? " · app escritorio" : "";
  return `${so} · ${nav}${app} · ${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`;
}

// ---------------------------------------------------------------- Base de datos (funciones gd_*)
const sb = () => createClient();

class ErrorGD extends Error {
  constructor(
    msg: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(msg);
  }
}
export { ErrorGD };

/** Las funciones gd_* responden { ok, error }: un "ok:false" se vuelve error con el mensaje de la base. */
async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new ErrorGD(traducir(error.message));
  if (data && typeof data === "object" && "ok" in (data as object) && (data as { ok: boolean }).ok === false) {
    throw new ErrorGD(String((data as { error?: string }).error ?? "Operación rechazada"), data as Record<string, unknown>);
  }
  return data as T;
}

function traducir(m: string): string {
  if (/function .*gd_.* does not exist|Could not find the function/i.test(m)) return "Falta correr el SQL 20261204_gestion_documentaria.sql en Supabase.";
  return m;
}

export async function listarDocumentos(): Promise<DocumentoGD[]> {
  // Marca los vencidos antes de listar (también lo hace pg_cron si está activo)
  await sb()
    .rpc("gd_marcar_vencidos")
    .then(
      () => undefined,
      () => undefined
    );
  const { data, error } = await sb().rpc("gd_listar");
  if (error) throw new ErrorGD(traducir(error.message));
  return (data ?? []) as DocumentoGD[];
}

export const detalleDocumento = (id: string) => rpc<DetalleGD | null>("gd_detalle", { p_doc: id });
export const misPendientes = async (): Promise<PendienteGD[]> => {
  const { data, error } = await sb().rpc("gd_mis_pendientes");
  if (error) return [];
  return (data ?? []) as PendienteGD[];
};
/** AUDITORÍA: abrir la ficha de un documento queda registrado como VER. */
export const registrarVistaFicha = (id: string, codigo: string) => rpc("gd_registrar_evento", { p_doc: id, p_accion: "VER", p_detalle: `Abrió la ficha de ${codigo}` });
export const aprobar = (id: string, comentario?: string) => rpc("gd_resolver", { p_doc: id, p_decision: "APROBAR", p_comentario: comentario ?? null });
export const rechazar = (id: string, comentario: string) => rpc("gd_resolver", { p_doc: id, p_decision: "RECHAZAR", p_comentario: comentario });
export const enviarRevision = (id: string, aprobadores: string[]) => rpc("gd_enviar_revision", { p_doc: id, p_aprobadores: aprobadores });
export const cambiarPermiso = (id: string, rol: RolGD, permiso: PermisoGD, motivo?: string) =>
  rpc("gd_set_permiso", { p_doc: id, p_rol: rol, p_permiso: permiso, p_motivo: motivo ?? null });
export const archivar = (id: string, motivo: string) => rpc("gd_archivar", { p_doc: id, p_motivo: motivo });
export const restaurarArchivo = (id: string, motivo: string) => rpc("gd_restaurar_archivo", { p_doc: id, p_motivo: motivo });
export const restaurarVersion = (id: string, version: string, motivo: string) => rpc("gd_restaurar_version", { p_doc: id, p_version: version, p_motivo: motivo });
export const editarDatos = (id: string, d: { nombre: string; descripcion: string; fecha_vencimiento: string | null; referencia: string; confidencial: boolean }) =>
  rpc("gd_editar_datos", { p_doc: id, p_nombre: d.nombre, p_descripcion: d.descripcion, p_fecha_vencimiento: d.fecha_vencimiento || null, p_referencia: d.referencia, p_confidencial: d.confidencial });

export async function auditoriaDocumento(id: string): Promise<AuditoriaGD[]> {
  const { data, error } = await sb().rpc("gd_auditoria_documento", { p_doc: id });
  if (error) throw new ErrorGD(traducir(error.message));
  return (data ?? []) as AuditoriaGD[];
}

export interface FiltroAuditoria {
  usuario?: string;
  documento?: string;
  desde?: string;
  hasta?: string;
  acciones?: string[];
  soloConfidencial?: boolean;
}
export async function buscarAuditoria(f: FiltroAuditoria): Promise<AuditoriaGD[]> {
  const { data, error } = await sb().rpc("gd_auditoria_buscar", {
    p_usuario: f.usuario?.trim() || null,
    p_documento: f.documento?.trim() || null,
    p_desde: f.desde || null,
    p_hasta: f.hasta || null,
    p_acciones: f.acciones?.length ? f.acciones : null,
    p_solo_confidencial: !!f.soloConfidencial,
    p_limite: 5000,
  });
  if (error) throw new ErrorGD(traducir(error.message));
  return (data ?? []) as AuditoriaGD[];
}
export async function reporteVencimientos(dias = 30, categoria: string | null = "Politica"): Promise<VencimientoGD[]> {
  const { data, error } = await sb().rpc("gd_reporte_vencimientos", { p_dias: dias, p_categoria: categoria });
  if (error) throw new ErrorGD(traducir(error.message));
  return (data ?? []) as VencimientoGD[];
}
export const verificarCadena = () => rpc<{ ok: boolean; total: number; ultimo_hash?: string; error?: string; secuencia?: number }>("gd_verificar_cadena");
/** AUDITORÍA: cada exportación de reporte queda registrada con el hash del contenido exportado. */
export const registrarExportacion = (detalle: string, valor: Record<string, unknown>) =>
  rpc("gd_registrar_evento", { p_doc: null, p_accion: "EXPORTAR_REPORTE", p_detalle: detalle, p_valor: valor });

/**
 * AUDITORÍA: abrir o imprimir la historia clínica de un proceso (SQL 20261207). Si ese SQL aún no se corrió,
 * la base rechaza la acción: la historia se muestra igual y se avisa en consola.
 */
export async function registrarConsultaHistoria(proceso: string, detalle: string, valor: Record<string, unknown> = {}): Promise<boolean> {
  try {
    await rpc("gd_registrar_evento", { p_doc: null, p_accion: "CONSULTAR_HISTORIA", p_detalle: detalle, p_valor: { proceso, ...valor } });
    return true;
  } catch (e) {
    console.warn("Historia de procesos: no se pudo registrar en audit_log (¿falta correr 20261207_gd_historia_procesos.sql?)", (e as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------- Edge Function (archivos)
async function edge(body: BodyInit, json: boolean): Promise<Response> {
  const cli = sb();
  const { data } = await cli.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErrorGD("Su sesión venció: vuelva a iniciar sesión.");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    "x-gd-dispositivo": dispositivo(),
  };
  if (json) headers["Content-Type"] = "application/json";
  let r: Response;
  try {
    r = await fetch(`${base}/functions/v1/gestion-documental`, { method: "POST", headers, body });
  } catch {
    throw new ErrorGD("No se pudo conectar con el servicio de archivos (Edge Function gestion-documental). ¿Ya se desplegó?");
  }
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 404 && !e.error) throw new ErrorGD("Falta desplegar la Edge Function gestion-documental en Supabase.");
    throw new ErrorGD(String(e.error ?? `Error ${r.status}`), { ...e, status: r.status });
  }
  return r;
}

export interface DatosSubida {
  nombre: string;
  descripcion: string;
  modulo: ModuloGD;
  categoria: CategoriaGD;
  fecha_vencimiento: string | null;
  es_confidencial: boolean;
  referencia_externa: string;
  permisos: { rol: RolGD; permiso: PermisoGD }[];
  aprobadores: RolGD[];
  enviar: boolean;
}

/** FLUJO 1 · Subir: el navegador calcula el SHA-256 para comprobar que el archivo llegó igual; el servidor lo recalcula. */
export async function subirDocumento(archivo: File, datos: DatosSubida): Promise<{ codigo: string; estado: string; hash_sha256: string }> {
  const fd = new FormData();
  fd.set("accion", "subir");
  fd.set("archivo", archivo);
  fd.set("datos", JSON.stringify(datos));
  fd.set("hash_cliente", await sha256Hex(await archivo.arrayBuffer()));
  return (await edge(fd, false)).json();
}

/** FLUJO 3 · Nueva versión (la anterior queda intacta). */
export async function subirVersion(docId: string, archivo: File, tipoCambio: "menor" | "mayor", motivo: string): Promise<{ version: string; hash_sha256: string }> {
  const fd = new FormData();
  fd.set("accion", "nueva_version");
  fd.set("archivo", archivo);
  fd.set("document_id", docId);
  fd.set("tipo_cambio", tipoCambio);
  fd.set("motivo", motivo);
  fd.set("hash_cliente", await sha256Hex(await archivo.arrayBuffer()));
  return (await edge(fd, false)).json();
}

export interface ArchivoGD {
  bytes: ArrayBuffer;
  tipo: string;
  version: string;
  hash: string;
  integridad: "OK" | "ALERTA";
  marca: string;
  nombre: string;
}
async function leerArchivo(r: Response): Promise<ArchivoGD> {
  return {
    bytes: await r.arrayBuffer(),
    tipo: r.headers.get("content-type") ?? "application/octet-stream",
    version: r.headers.get("x-gd-version") ?? "",
    hash: r.headers.get("x-gd-hash") ?? "",
    integridad: r.headers.get("x-gd-integridad") === "ALERTA" ? "ALERTA" : "OK",
    marca: r.headers.get("x-gd-marca") ?? "no",
    nombre: decodeURIComponent(r.headers.get("x-gd-nombre") ?? "documento"),
  };
}

/** Vista previa (registra VER). Los bytes quedan solo en memoria: no se guardan ni se ofrecen para descargar. */
export const verArchivo = async (docId: string, version?: string) => leerArchivo(await edge(JSON.stringify({ accion: "ver", document_id: docId, version }), true));

/** FLUJO 4 · Descargar (registra DESCARGAR; límite 5 por hora; confidencial = 2 confirmaciones + marca de agua). */
export async function descargarArchivo(docId: string, version: string | undefined, confirmaciones: number): Promise<ArchivoGD> {
  const a = await leerArchivo(await edge(JSON.stringify({ accion: "descargar", document_id: docId, version, confirmaciones }), true));
  // "Guardar como" para elegir la carpeta (si el navegador ya no lo permite, descarga normal)
  await guardarArchivo(a.nombre, new Blob([a.bytes], { type: a.tipo }), { tipo: a.tipo, aviso: false });
  return a;
}

export const verificarIntegridad = async (docId: string): Promise<{ ok: boolean; versiones: { version: string; ok: boolean }[] }> =>
  (await edge(JSON.stringify({ accion: "verificar", document_id: docId }), true)).json();

// ---------------------------------------------------------------- Textos de la auditoría
export const ACCION_TEXTO: Record<string, string> = {
  CREAR: "Creó",
  VER: "Vio",
  DESCARGAR: "Descargó",
  SUBIR_VERSION: "Subió versión",
  APROBAR: "Aprobó",
  RECHAZAR: "Rechazó",
  EDITAR_PERMISO: "Cambió permiso",
  ELIMINAR_LOGICA: "Archivó (eliminación lógica)",
  RESTAURAR_VERSION: "Restauró versión",
  ENVIAR_REVISION: "Envió a revisión",
  EDITAR_DATOS: "Editó datos",
  RESTAURAR_ARCHIVO: "Restauró del archivo",
  ACCESO_DENEGADO: "Acceso denegado",
  DESCARGA_BLOQUEADA: "Descarga bloqueada (límite)",
  ALERTA_INTEGRIDAD: "ALERTA DE INTEGRIDAD",
  VERIFICAR_INTEGRIDAD: "Verificó integridad",
  VENCER: "Venció",
  CONSULTAR_AUDITORIA: "Consultó auditoría",
  EXPORTAR_REPORTE: "Exportó reporte",
  CONSULTAR_HISTORIA: "Consultó historia de proceso",
};
/** Acciones críticas (se pintan en burdeos). */
export const ACCION_CRITICA = new Set(["RECHAZAR", "ELIMINAR_LOGICA", "ACCESO_DENEGADO", "DESCARGA_BLOQUEADA", "ALERTA_INTEGRIDAD", "VENCER"]);

export const valorTexto = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v !== "object") return String(v);
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined && x !== "")
    .map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : String(x)}`)
    .join(" · ");
};
