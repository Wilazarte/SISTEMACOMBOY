// =====================================================================
// ¿En qué envoltorio corre el ERP? La misma web (Vercel) se abre en:
//   - el navegador (comportamiento de siempre, sin capa offline),
//   - la app de Windows (Tauri v2, carpeta src-tauri/),
//   - la app Android (Capacitor, Fase 2).
// La capa offline (SQLite / cola de sincronización) solo se activa en las apps.
// =====================================================================

type VentanaApp = Window & {
  __TAURI_INTERNALS__?: unknown;
  Capacitor?: { isNativePlatform?: () => boolean };
};

const ventana = (): VentanaApp | null => (typeof window === "undefined" ? null : (window as VentanaApp));

/** App de escritorio Tauri (Windows). */
export const esTauri = (): boolean => !!ventana()?.__TAURI_INTERNALS__;

/** App Android/iOS de Capacitor. */
export const esCapacitor = (): boolean => !!ventana()?.Capacitor?.isNativePlatform?.();

/** Cualquier app instalada: aquí el ERP trabaja sin señal y sincroniza después. */
export const esAppNativa = (): boolean => esTauri() || esCapacitor();

/** Identificador estable de este equipo (para la cola, los bloqueos y los conflictos). */
export function idDispositivo(): string {
  const v = ventana();
  if (!v) return "servidor";
  try {
    let id = v.localStorage.getItem("erp_dispositivo");
    if (!id) {
      const pre = esTauri() ? "PC" : esCapacitor() ? "CEL" : "WEB";
      id = `${pre}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      v.localStorage.setItem("erp_dispositivo", id);
    }
    return id;
  } catch {
    return "SIN-ID";
  }
}
