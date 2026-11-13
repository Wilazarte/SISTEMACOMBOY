// Web (Vercel): servidor Next normal, con middleware de login, headers de seguridad y redirects.
// App Tauri: `npm run build:tauri` compila con TAURI_EXPORT=1 → export estático en out/ (frontendDist de src-tauri).
// El export estático no admite middleware, headers ni redirects, por eso solo se activa para Tauri.
const exportTauri = process.env.TAURI_EXPORT === "1";

// pdf.js (vista previa de PDF, components/VisorPDF) trae un require opcional de "canvas" solo para Node: en el navegador no se usa.
const webpack = (config) => {
  config.resolve.alias = { ...config.resolve.alias, canvas: false };
  return config;
};

/** @type {import('next').NextConfig} */
const webConfig = {
  reactStrictMode: true,
  webpack,
  // ERP privado: nunca se muestra embebido en otra web (siempre en su propia pestaña) y los buscadores no lo indexan.
  async headers() {
    return [
      {
        source: "/:ruta*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  // El módulo Sucursal ahora es Secocha: las direcciones antiguas siguen funcionando
  async redirects() {
    return [
      { source: "/sucursal", destination: "/secocha", permanent: false },
      { source: "/sucursal/:ruta*", destination: "/secocha/:ruta*", permanent: false },
      // El Catálogo de Productos ahora es una pestaña de Ventas
      { source: "/dashboard/productos", destination: "/dashboard/ventas?tab=productos", permanent: false },
      // Logística Planta: los accesos abren los módulos actuales tal cual (sin cambiar su diseño)
      { source: "/logistica/ventas", destination: "/dashboard/ventas", permanent: false },
      // Botón "Mundo Ventas" (perfil Logística / Soporte)
      { source: "/mundo-ventas", destination: "/dashboard/ventas", permanent: false },
      { source: "/logistica/compras", destination: "/dashboard/compras?tab=ordenes", permanent: false },
      { source: "/logistica/almacen", destination: "/dashboard/almacen", permanent: false },
      { source: "/logistica/finanzas", destination: "/dashboard/compras", permanent: false },
      { source: "/logistica/produccion", destination: "/dashboard/produccion", permanent: false },
      { source: "/logistica/planilla", destination: "/dashboard/compras?tab=planilla", permanent: false },
    ];
  },
};
/** @type {import('next').NextConfig} */
const tauriConfig = { reactStrictMode: true, webpack, output: "export", images: { unoptimized: true } };

export default exportTauri ? tauriConfig : webConfig;
