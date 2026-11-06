"use client";

// =====================================================================
// Solo dentro de las apps (Windows con Tauri / Android con Capacitor):
//   - registra el service worker (public/sw.js) para abrir el ERP sin señal,
//   - arranca useSync() (sube la cola cada 30 s y al volver la señal),
//   - en Windows busca una versión nueva del programa al abrir,
//   - muestra una insignia discreta: "Sin señal · N cambios por subir".
// En el navegador no muestra ni hace nada.
// =====================================================================

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CloudOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useSync } from "@/hooks/useSync";
import { buscarActualizacion } from "@/lib/offline/actualizador";
import { localDb } from "@/lib/offline/localDb";
import { esAppNativa, esTauri } from "@/lib/offline/plataforma";

export function AppNativa() {
  const [app, setApp] = useState(false);
  useEffect(() => setApp(esAppNativa()), []);
  return app ? <Insignia /> : null;
}

function Insignia() {
  const s = useSync();
  const ruta = usePathname();

  // Service worker + aviso a la página de arranque de Windows (src-tauri/offline/index.html)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => (esTauri() ? localDb().fijarAjuste("shell_cacheado", "1") : undefined))
      .catch((e) => console.warn("service worker:", (e as Error).message));
    void buscarActualizacion();
  }, []);

  // Última pantalla abierta: sin señal, la app vuelve a ella
  useEffect(() => {
    if (!esTauri() || !ruta || ruta.startsWith("/login")) return;
    void localDb().fijarAjuste("ultima_ruta", ruta).catch(() => undefined);
  }, [ruta]);

  if (s.enLinea && !s.sincronizando && s.pendientes === 0 && s.errores === 0) return null;

  const base =
    "fixed bottom-3 left-3 z-[9999] flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-md";
  if (s.errores > 0)
    return (
      <button
        type="button"
        onClick={() => void s.reintentar()}
        title={s.ultimoError ?? ""}
        className={`${base} border-red-400/50 bg-red-950/80 text-red-100 hover:bg-red-900/90`}
      >
        <TriangleAlert className="h-3.5 w-3.5" />
        {s.errores} cambio(s) no se pudieron subir · Reintentar
      </button>
    );
  if (!s.enLinea)
    return (
      <div className={`${base} border-amber-300/50 bg-amber-950/80 text-amber-100`}>
        <CloudOff className="h-3.5 w-3.5" />
        Sin señal{s.pendientes > 0 ? ` · ${s.pendientes} cambio(s) guardados en este equipo` : " · trabajando con la copia local"}
      </div>
    );
  return (
    <button type="button" onClick={() => void s.sincronizar()} className={`${base} border-sky-300/50 bg-sky-950/80 text-sky-100`}>
      {s.sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {s.sincronizando ? "Sincronizando…" : `${s.pendientes} cambio(s) por subir`}
    </button>
  );
}
