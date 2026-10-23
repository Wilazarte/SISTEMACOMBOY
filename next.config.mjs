/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El módulo Sucursal ahora es Secocha: las direcciones antiguas siguen funcionando
  async redirects() {
    return [
      { source: "/sucursal", destination: "/secocha", permanent: false },
      { source: "/sucursal/:ruta*", destination: "/secocha/:ruta*", permanent: false },
      // El Catálogo de Productos ahora es una pestaña de Ventas
      { source: "/dashboard/productos", destination: "/dashboard/ventas?tab=productos", permanent: false },
    ];
  },
};
export default nextConfig;
