// =====================================================================
// Service worker del ERP (solo lo registran las apps de Windows y Android, ver
// components/app-nativa/AppNativa.tsx). Guarda en el equipo las páginas que el
// usuario abre y los archivos de Next.js para que el ERP abra sin señal.
// Los DATOS no pasan por aquí: los guarda la base local (lib/offline/).
//   - Páginas: primero la red (siempre la versión nueva); sin señal, la copia.
//   - /_next/static: copia primero (cada versión tiene nombre único).
//   - /api, Supabase y otros dominios: nunca se guardan.
// =====================================================================
const VERSION = "erp-v1";
const PAGINAS = `${VERSION}-paginas`;
const ESTATICOS = `${VERSION}-estaticos`;
const MAX_PAGINAS = 120;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGINAS).then((c) => c.addAll(["/login"]).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function recortar(nombre, max) {
  const c = await caches.open(nombre);
  const ks = await c.keys();
  for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}

const sinRed = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin señal</title>' +
      '<body style="font:16px Segoe UI,system-ui,sans-serif;background:#0b1530;color:#e6edf7;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
      '<div><h2>Sin señal</h2><p>Esta pantalla aún no se guardó en el equipo.<br>Ábrala una vez con internet para usarla sin señal.</p>' +
      '<button onclick="history.back()" style="padding:10px 20px;border:0;border-radius:10px;background:#1e6bff;color:#fff">Volver</button></div>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fuentes, etc.
  if (url.pathname.startsWith("/api/")) return;

  // Archivos de Next.js con hash: copia primero
  if (url.pathname.startsWith("/_next/static/") || /\.(?:png|jpe?g|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(ESTATICOS).then(async (c) => {
        const copia = await c.match(req);
        if (copia) return copia;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      })
    );
    return;
  }

  // Navegación (HTML): red primero; sin señal, la copia guardada de esa página
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const c = await caches.open(PAGINAS);
        const clave = url.origin + url.pathname; // sin ?parámetros: una copia por pantalla
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch(req, { signal: ctrl.signal });
          clearTimeout(t);
          // Solo páginas reales (no redirecciones al login ni errores)
          if (r.ok && !r.redirected) {
            await c.put(clave, r.clone());
            recortar(PAGINAS, MAX_PAGINAS);
          }
          return r;
        } catch {
          return (await c.match(clave)) || (await c.match(url.origin + "/")) || sinRed();
        }
      })()
    );
  }
  // RSC (?_rsc=...): siempre red. Si falla, Next.js navega como página completa y entra la copia de arriba.
});
