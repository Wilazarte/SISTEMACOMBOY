"use client";

// =====================================================================
// Guardar archivos eligiendo la carpeta (Williams, 2026-11-17): toda descarga del ERP (PDF, Excel, XML, ZIP,
// TXT, adjuntos) abre la ventana "Guardar como" de Windows para escoger la carpeta y el nombre.
//  - Chrome / Edge / app de escritorio (Electron y Tauri usan Chromium/WebView2): showSaveFilePicker.
//  - Si el navegador no lo tiene (Firefox, Safari) o falla: descarga normal. En la app Electron la descarga
//    normal también pregunta dónde guardar (diálogo nativo); en el navegador va a la carpeta de Descargas.
//  - Celular (APK / navegador móvil): carpeta de Descargas, como siempre.
// =====================================================================

import { toast } from "@/components/ui";

type Datos = Blob | ArrayBuffer | Uint8Array | string;
/** Contenido ya listo o una función que lo genera (se elige la carpeta ANTES de generarlo / descargarlo). */
export type Contenido = Datos | (() => Datos | Promise<Datos>);

interface Opciones {
  /** MIME del archivo (si no se da, se deduce de la extensión). */
  tipo?: string;
  /** Texto del filtro en la ventana Guardar como, ej. "Libro de Excel". */
  descripcion?: string;
  /** Aviso al terminar (por defecto "<archivo> guardado"). false = sin aviso. */
  aviso?: boolean;
}

const TIPOS: Record<string, { mime: string; descripcion: string }> = {
  pdf: { mime: "application/pdf", descripcion: "Documento PDF" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", descripcion: "Libro de Excel" },
  xls: { mime: "application/vnd.ms-excel", descripcion: "Libro de Excel 97-2003" },
  csv: { mime: "text/csv", descripcion: "Archivo CSV" },
  txt: { mime: "text/plain", descripcion: "Archivo de texto" },
  xml: { mime: "application/xml", descripcion: "Archivo XML" },
  zip: { mime: "application/zip", descripcion: "Archivo ZIP" },
  json: { mime: "application/json", descripcion: "Archivo JSON" },
  png: { mime: "image/png", descripcion: "Imagen PNG" },
  jpg: { mime: "image/jpeg", descripcion: "Imagen JPG" },
  jpeg: { mime: "image/jpeg", descripcion: "Imagen JPG" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", descripcion: "Documento de Word" },
};

/** Quita caracteres que Windows no acepta en nombres de archivo. */
export const nombreSeguro = (n: string): string => n.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+$/g, "").trim() || "archivo";

const extension = (n: string) => (/\.([A-Za-z0-9]{1,6})$/.exec(n)?.[1] ?? "").toLowerCase();

export const esMovil = (): boolean => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

type SavePicker = (o: unknown) => Promise<FileSystemFileHandle>;
type DirPicker = (o?: unknown) => Promise<FileSystemDirectoryHandle>;
const ventana = () => window as unknown as { showSaveFilePicker?: SavePicker; showDirectoryPicker?: DirPicker };

/** ¿Este equipo puede abrir la ventana "Guardar como"? (PC con Chrome / Edge / app de escritorio). */
export const puedeElegirCarpeta = (): boolean => typeof window !== "undefined" && !esMovil() && typeof ventana().showSaveFilePicker === "function";

const cancelado = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function aBlob(d: Datos, tipo: string): Blob {
  if (d instanceof Blob) return d.type || !tipo ? d : new Blob([d], { type: tipo });
  return new Blob([d as BlobPart], { type: tipo });
}

const resolver = async (c: Contenido): Promise<Datos> => (typeof c === "function" ? await c() : c);

/** Descarga normal (carpeta de Descargas; en la app Electron pregunta dónde guardar). */
export function descargaDirecta(datos: Datos, nombre: string, tipo?: string): void {
  const n = nombreSeguro(nombre);
  const url = URL.createObjectURL(aBlob(datos, tipo ?? TIPOS[extension(n)]?.mime ?? "application/octet-stream"));
  const a = document.createElement("a");
  a.href = url;
  a.download = n;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Guarda un archivo preguntando la carpeta ("Guardar como"). Llamar dentro del clic del usuario.
 * Devuelve false si el usuario canceló la ventana.
 */
export async function guardarArchivo(nombre: string, contenido: Contenido, op: Opciones = {}): Promise<boolean> {
  const n = nombreSeguro(nombre);
  const ext = extension(n);
  const info = TIPOS[ext];
  const tipo = op.tipo ?? info?.mime ?? "application/octet-stream";
  const avisar = (texto: string) => op.aviso !== false && toast(texto);

  if (!puedeElegirCarpeta()) {
    descargaDirecta(await resolver(contenido), n, tipo);
    avisar(`${n} descargado`);
    return true;
  }

  // 1) Primero la ventana (el navegador solo la permite justo después del clic), 2) luego se genera y escribe.
  let h: FileSystemFileHandle;
  try {
    h = await ventana().showSaveFilePicker!.call(window, {
      suggestedName: n,
      ...(ext ? { types: [{ description: op.descripcion ?? info?.descripcion ?? `Archivo ${ext.toUpperCase()}`, accept: { [tipo]: [`.${ext}`] } }] } : {}),
    });
  } catch (e) {
    if (cancelado(e)) return false;
    // Sin permiso para abrir la ventana (p. ej. pasó mucho tiempo desde el clic): descarga normal
    descargaDirecta(await resolver(contenido), n, tipo);
    avisar(`${n} descargado`);
    return true;
  }
  const datos = await resolver(contenido);
  try {
    const w = await h.createWritable();
    await w.write(aBlob(datos, tipo));
    await w.close();
    avisar(`${h.name} guardado`);
  } catch {
    descargaDirecta(datos, n, tipo);
    avisar(`${n} descargado`);
  }
  return true;
}

/** Excel (SheetJS) con "Guardar como". */
export async function guardarExcel(libro: unknown, nombre: string): Promise<boolean> {
  const n = /\.xlsx$/i.test(nombre) ? nombre : `${nombre}.xlsx`;
  return guardarArchivo(n, async () => {
    const XLSX = await import("xlsx");
    return new Uint8Array(XLSX.write(libro as import("xlsx").WorkBook, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
  });
}

/** Destino para varios archivos a la vez (recibos masivos): se elige UNA carpeta y todos van ahí. */
export interface Destino {
  guardar: (nombre: string, datos: Datos, tipo?: string) => Promise<void>;
  /** Nombre de la carpeta elegida ("" = Descargas). */
  carpeta: string;
}

/** Pide una carpeta una sola vez. null = el usuario canceló. Sin soporte: todos van a Descargas. */
export async function elegirCarpeta(): Promise<Destino | null> {
  const picker = typeof window !== "undefined" && !esMovil() ? ventana().showDirectoryPicker : undefined;
  if (typeof picker === "function") {
    try {
      const dir = await picker.call(window, { mode: "readwrite" });
      return {
        carpeta: dir.name,
        guardar: async (nombre, datos, tipo) => {
          const n = nombreSeguro(nombre);
          try {
            const w = await (await dir.getFileHandle(n, { create: true })).createWritable();
            await w.write(aBlob(datos, tipo ?? TIPOS[extension(n)]?.mime ?? "application/octet-stream"));
            await w.close();
          } catch {
            descargaDirecta(datos, n, tipo);
          }
        },
      };
    } catch (e) {
      if (cancelado(e)) return null;
    }
  }
  return { carpeta: "", guardar: async (nombre, datos, tipo) => descargaDirecta(datos, nombre, tipo) };
}
