import type { Config } from "tailwindcss";

// Todos los colores salen de variables CSS (canales RGB) definidas en app/globals.css:
// así el modo oscuro (clase .dark en <html>) cambia la paleta sin tocar los componentes.
const v = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;
const escala = (familia: string, tonos: number[]) => Object.fromEntries(tonos.map((t) => [t, v(`${familia}-${t}`)]));

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Sistema de diseño COMBOY VID v2: rojo COMBOY como primario + grises grafito
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        fg: { DEFAULT: v("fg"), 2: v("fg-2") },
        rojo: { DEFAULT: v("rojo"), soft: v("rojo-soft"), tenue: v("rojo-tenue") },
        sidebar: { DEFAULT: v("sb"), borde: v("sb-borde"), texto: v("sb-texto"), sub: v("sb-sub"), activo: v("sb-activo"), "activo-texto": v("sb-activo-texto") },
        // Nombres históricos: se mantienen para no tocar las páginas
        azul: { 900: v("azul-900"), 700: v("azul-700"), 500: v("azul-500") },
        vino: { 900: v("vino-900"), DEFAULT: v("vino") },
        corp: v("corp"),
        plomo: { 50: v("plomo-50"), 100: v("plomo-100"), 200: v("plomo-200"), 500: v("plomo-500"), 600: v("plomo-600") },
        // Tonos de Tailwind que usan los estados y avisos: se ajustan en modo oscuro
        red: escala("red", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        emerald: escala("emerald", [50, 100, 200, 400, 500, 600, 700, 800]),
        amber: escala("amber", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        orange: escala("orange", [50, 300, 600, 700, 800]),
        slate: escala("slate", [100, 200, 300, 400, 600, 700, 900]),
        blue: escala("blue", [50, 200, 600, 800]),
      },
      boxShadow: {
        card: "0 1px 2px rgb(10 10 11 / 0.05)",
        pop: "0 16px 48px rgb(10 10 11 / 0.16), 0 2px 6px rgb(10 10 11 / 0.06)",
        rojo: "0 1px 2px rgb(var(--corp) / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.15)",
        fab: "0 10px 30px rgb(227 6 19 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.2)",
      },
      keyframes: {
        // Entrada suave (fade + subir), ej. bienvenida del login al elegir módulo
        aparecer: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        // Logo flotante del login
        flotar: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        // Menús desplegables, paleta de comandos y modales
        emerger: { "0%": { opacity: "0", transform: "translateY(6px) scale(0.98)" }, "100%": { opacity: "1", transform: "none" } },
        bajar: { "0%": { opacity: "0", transform: "translateY(-4px)" }, "100%": { opacity: "1", transform: "none" } },
        velo: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        aparecer: "aparecer 300ms ease-out both",
        flotar: "flotar 4s ease-in-out infinite",
        emerger: "emerger 160ms cubic-bezier(0.2,0.8,0.2,1) both",
        bajar: "bajar 200ms ease both",
        velo: "velo 150ms ease both",
      },
      transitionTimingFunction: { suave: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      fontFamily: {
        // Times New Roman en todo el sistema (ver app/globals.css)
        sans: ['"Times New Roman"', "Times", "serif"],
        serif: ['"Times New Roman"', "Times", "serif"],
        mono: ['"Times New Roman"', "Times", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
