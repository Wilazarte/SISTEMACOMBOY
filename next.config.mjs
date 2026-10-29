/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El ERP se abre dentro de comboyvid.com (sección #erp y comboyvid.com/erp) en un iframe: solo esa web puede enmarcarlo
  async headers() {
    return [
      {
        source: "/:ruta*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://comboyvid.com https://www.comboyvid.com" }],
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
