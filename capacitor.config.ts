import type { CapacitorConfig } from "@capacitor/cli";

// =====================================================================
// App Android de COMBOY VID ERP (Capacitor 6). Abre la misma web de Vercel
// (una sola base de código) con acceso a cámara, archivos, red y almacenamiento
// del celular. Sin señal: service worker (public/sw.js) + IndexedDB + cola
// de sincronización (lib/offline/). Si nunca se abrió con señal, muestra
// movil/www/index.html.
// =====================================================================
const config: CapacitorConfig = {
  appId: "com.comboyvid.erp",
  appName: "COMBOY VID ERP",
  webDir: "movil/www",
  server: {
    url: "https://sistemacomboy.vercel.app",
    cleartext: false,
    // Sin señal y sin copia guardada: página local con botón Reintentar
    errorPath: "index.html",
    allowNavigation: ["sistemacomboy.vercel.app", "erp.comboyvid.com", "*.supabase.co"],
  },
  android: {
    backgroundColor: "#0b1530",
    allowMixedContent: false,
  },
  plugins: {
    Camera: {},
  },
};

export default config;
