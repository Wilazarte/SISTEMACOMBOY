// Estado de la conexión y detección de errores "sin señal" (no confundir con errores de permisos o datos).

export const EV_RED = "erp:red";

export const enLinea = (): boolean => typeof navigator === "undefined" || navigator.onLine !== false;

/** true si el error es por falta de red (fetch caído, timeout) y conviene dejarlo en cola en vez de revertir. */
export function esErrorDeRed(e: unknown): boolean {
  if (!enLinea()) return true;
  const err = e as { message?: string; code?: string; name?: string; status?: number } | null;
  if (!err) return false;
  if (err.name === "AbortError" || err.name === "TypeError") return true;
  // supabase-js devuelve { message: "TypeError: Failed to fetch", code: "" } cuando no hay red
  return /failed to fetch|network ?error|load failed|fetch failed|networkrequestfailed|timeout|ERR_INTERNET|ERR_NAME_NOT_RESOLVED/i.test(err.message ?? "");
}
