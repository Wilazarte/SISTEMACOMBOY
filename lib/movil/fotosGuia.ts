"use client";

// =====================================================================
// Fotos de guías de remisión con el celular (app Android, Capacitor).
// El almacenero toma la foto de la guía física, se guarda en el celular
// (Filesystem, carpeta privada de la app), se vincula a la OC y se sube al
// bucket "guias" de Supabase Storage apenas hay señal (useSync la reintenta).
// Lista de fotos por subir: Preferences (sobrevive a cerrar la app).
// =====================================================================

import { createClient } from "@/lib/supabase/client";
import { getSesion } from "@/lib/auth";
import { KEYS, escribir, getOrdenes } from "@/lib/storage";
import { esErrorDeRed } from "@/lib/offline/red";
import type { FotoGuia } from "@/lib/types";

export const BUCKET_GUIAS = "guias";
const CLAVE_PENDIENTES = "fotos_guias_pendientes";
const CARPETA = "guias";

interface FotoPendiente {
  ocId: string;
  ruta: string; // <ocId>/<fecha>.jpg (misma ruta en el celular y en el bucket)
}

const plugins = async () => {
  const [{ Camera, CameraResultType, CameraSource }, { Filesystem, Directory }, { Preferences }] = await Promise.all([
    import("@capacitor/camera"),
    import("@capacitor/filesystem"),
    import("@capacitor/preferences"),
  ]);
  return { Camera, CameraResultType, CameraSource, Filesystem, Directory, Preferences };
};

async function leerPendientes(): Promise<FotoPendiente[]> {
  const { Preferences } = await plugins();
  const { value } = await Preferences.get({ key: CLAVE_PENDIENTES });
  try {
    return value ? (JSON.parse(value) as FotoPendiente[]) : [];
  } catch {
    return [];
  }
}

async function guardarPendientes(lista: FotoPendiente[]): Promise<void> {
  const { Preferences } = await plugins();
  await Preferences.set({ key: CLAVE_PENDIENTES, value: JSON.stringify(lista) });
}

/** Cambia la lista de fotos de la OC (pasa por la cola offline de lib/storage.ts). */
function actualizarFotosOC(ocId: string, cambiar: (f: FotoGuia[]) => FotoGuia[]): void {
  const ordenes = getOrdenes();
  if (!ordenes.some((o) => o.id === ocId)) return;
  escribir(
    KEYS.ORDENES,
    ordenes.map((o) => (o.id === ocId ? { ...o, fotosGuia: cambiar(o.fotosGuia ?? []) } : o))
  );
}

/** Abre la cámara, guarda la foto en el celular, la vincula a la OC y la intenta subir. */
export async function tomarFotoGuia(ocId: string): Promise<{ ruta: string; subida: boolean } | null> {
  const s = getSesion();
  if (!s || s.soloLectura) throw new Error("Su usuario es de solo lectura: no puede adjuntar guías.");
  const { Camera, CameraResultType, CameraSource, Filesystem, Directory } = await plugins();
  const foto = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    quality: 70,
    width: 1600,
    correctOrientation: true,
    saveToGallery: false,
  }).catch((e: Error) => {
    if (/cancel/i.test(e.message)) return null; // el usuario cerró la cámara
    throw e;
  });
  if (!foto?.base64String) return null;

  const ruta = `${ocId}/${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
  await Filesystem.writeFile({ path: `${CARPETA}/${ruta}`, data: foto.base64String, directory: Directory.Data, recursive: true });
  await guardarPendientes([...(await leerPendientes()), { ocId, ruta }]);
  actualizarFotosOC(ocId, (f) => [...f, { ruta, fecha: new Date().toISOString(), usuario: s.usuario, subida: false }]);

  const r = await subirFotosPendientes();
  return { ruta, subida: !r.pendientes.includes(ruta) };
}

const base64ABlob = (b64: string, tipo: string): Blob => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
};

let subiendo: Promise<{ subidas: number; pendientes: string[] }> | null = null;

/** Sube las fotos que quedaron en el celular. Sin señal se detiene y espera al próximo intento. */
export function subirFotosPendientes(): Promise<{ subidas: number; pendientes: string[] }> {
  return (subiendo ??= (async () => {
    const { Filesystem, Directory } = await plugins();
    let lista = await leerPendientes();
    let subidas = 0;
    for (const p of [...lista]) {
      try {
        const archivo = await Filesystem.readFile({ path: `${CARPETA}/${p.ruta}`, directory: Directory.Data });
        const { error } = await createClient()
          .storage.from(BUCKET_GUIAS)
          .upload(p.ruta, base64ABlob(String(archivo.data), "image/jpeg"), { contentType: "image/jpeg", upsert: true });
        if (error) throw error;
        lista = lista.filter((x) => x.ruta !== p.ruta);
        await guardarPendientes(lista);
        actualizarFotosOC(p.ocId, (f) => f.map((x) => (x.ruta === p.ruta ? { ...x, subida: true } : x)));
        await Filesystem.deleteFile({ path: `${CARPETA}/${p.ruta}`, directory: Directory.Data }).catch(() => undefined);
        subidas++;
      } catch (e) {
        if (esErrorDeRed(e)) break;
        // Archivo que ya no existe en el celular: se quita de la lista para no reintentar siempre
        if (/does not exist|no such file|not found/i.test((e as Error).message ?? "")) {
          lista = lista.filter((x) => x.ruta !== p.ruta);
          await guardarPendientes(lista);
        } else console.warn("foto guía:", (e as Error).message);
      }
    }
    return { subidas, pendientes: lista.map((x) => x.ruta) };
  })().finally(() => {
    subiendo = null;
  }));
}

export const contarFotosPendientes = async (): Promise<number> => (await leerPendientes()).length;

/** Enlace temporal (5 min) para ver una foto ya subida. */
export async function urlFotoGuia(ruta: string): Promise<string> {
  const { data, error } = await createClient().storage.from(BUCKET_GUIAS).createSignedUrl(ruta, 300);
  if (error) throw error;
  return data.signedUrl;
}
