// =====================================================================
// Abrir enlaces externos (WhatsApp, correo, Gmail) desde el navegador, la app de Windows (Tauri) y la de Android.
//
// En la app de Windows `window.open` hacia otra web no hace nada (el webview no abre ventanas nuevas): ahí se usa
// el plugin "opener" de Tauri, que abre el enlace en el navegador / WhatsApp de la PC. Si la app instalada todavía
// es una versión sin ese plugin, o el navegador bloquea la ventana, devuelve false y la pantalla ofrece copiar el
// mensaje o abrirlo con un enlace normal.
// =====================================================================

import { esCapacitor, esTauri } from "./offline/plataforma";

export async function abrirEnlaceExterno(url: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (esTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:opener|open_url", { url });
      return true;
    } catch {
      return false;
    }
  }
  if (esCapacitor()) {
    // Android: la navegación a un dominio que no es del ERP la abre el sistema (WhatsApp / navegador)
    window.open(url, "_system");
    return true;
  }
  const w = window.open(url, "_blank");
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    /* otra ventana: sin acceso */
  }
  return true;
}

/** Copia texto al portapapeles (con respaldo para webviews sin API de portapapeles). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
