"use client";

// Auto-actualización de la app de Windows (plugin updater de Tauri). Al abrir, consulta
// latest.json en GitHub Releases (lo publica .github/workflows/tauri-windows.yml) y, si hay una
// versión más nueva, pregunta "Nueva versión disponible" y se instala sola.
// Ojo: las pantallas del ERP se actualizan solas al publicar en Vercel; esto actualiza el programa.

import { esTauri } from "./plataforma";
import { enLinea } from "./red";

let revisado = false;

export async function buscarActualizacion(): Promise<void> {
  if (revisado || !esTauri() || !enLinea()) return;
  revisado = true;
  try {
    const [{ check }, { ask }, { relaunch }] = await Promise.all([
      import("@tauri-apps/plugin-updater"),
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-process"),
    ]);
    const u = await check();
    if (!u) return;
    const si = await ask(`Nueva versión disponible: ${u.version} (tiene la ${u.currentVersion}).\n\n¿Actualizar ahora? La app se cerrará y volverá a abrir sola.`, {
      title: "COMBOY VID ERP",
      kind: "info",
      okLabel: "Actualizar",
      cancelLabel: "Después",
    });
    if (!si) return;
    await u.downloadAndInstall();
    await relaunch();
  } catch (e) {
    console.warn("actualizador:", (e as Error).message);
  }
}
