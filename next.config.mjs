/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
export default nextConfig;
