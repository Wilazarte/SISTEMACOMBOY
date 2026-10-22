/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El módulo Sucursal ahora es Secocha: las direcciones antiguas siguen funcionando
  async redirects() {
    return [
      { source: "/sucursal", destination: "/secocha", permanent: false },
      { source: "/sucursal/:ruta*", destination: "/secocha/:ruta*", permanent: false },
    ];
  },
};
export default nextConfig;
