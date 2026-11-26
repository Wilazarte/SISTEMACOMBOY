import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Todos los colores salen de variables CSS (canales RGB) definidas en app/globals.css:
// así el modo oscuro (clase .dark en <html>) cambia la paleta sin tocar los componentes.
const v = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;
const escala = (familia: string, tonos: number[]) => Object.fromEntries(tonos.map((t) => [t, v(`${familia}-${t}`)]));
// Temas de color (app/themes.css): variables en hex; la opacidad (/10, /60…) se aplica con color-mix
const t = (nombre: string) => `color-mix(in srgb, var(--${nombre}) calc(<alpha-value> * 100%), transparent)`;

// ERP Comercial (app/(erp)/erp): tokens shadcn en HSL. Las variables solo existen dentro de .erp-comercial
// (app/(erp)/erp/erp-comercial.css), así que no cambian nada en el resto del sistema.
const h = (nombre: string) => `hsl(var(--${nombre}) / <alpha-value>)`;
const erpColores = {
  border: h("border"),
  input: h("input"),
  ring: h("ring"),
  background: h("background"),
  foreground: h("foreground"),
  primary: { DEFAULT: h("primary"), foreground: h("primary-foreground") },
  secondary: { DEFAULT: h("secondary"), foreground: h("secondary-foreground") },
  destructive: { DEFAULT: h("destructive"), foreground: h("destructive-foreground") },
  muted: { DEFAULT: h("muted"), foreground: h("muted-foreground") },
  accent: { DEFAULT: h("accent"), foreground: h("accent-foreground") },
  card: { DEFAULT: h("card"), foreground: h("card-foreground") },
  popover: { DEFAULT: h("popover"), foreground: h("popover-foreground") },
  wa: { DEFAULT: "#25D366", dark: "#128C7E", bubble: "#005c4b", panel: "#111b21", chat: "#0b141a", in: "#202c33" },
};

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    // "card" es sombra del sistema (shadow-card) y color del ERP Comercial: sin esto shadow-card tomaría el color
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    boxShadowColor: ({ theme }) => (({ card, ...resto }) => resto)(theme("colors") ?? {}),
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
        // Sistema de 5 temas (Williams 2026-11-22): reemplazan los hex fijos #11212D / #800021 / #294D61 / #CCD0CF
        tema: {
          texto: t("text"), // antes text-[#11212D]
          muted: t("text-muted"),
          fuerte: t("fuerte"), // antes bg-[#11212D]
          acento: t("accent"), // antes bg/border-[#800021]
          tinta: t("accent-ink"), // antes text-[#800021]
          sec: t("secundario"), // antes [#294D61]
          borde: t("border"), // antes [#CCD0CF]
          card: t("card-bg"),
          fondo: t("bg"),
          icono: t("icon-bg"),
          boton: t("button-bg"),
          tenue: t("barra-tenue"), // antes text-[#CCD0CF] sobre fondo oscuro
        },
        ...erpColores,
      },
      // Radios del ERP Comercial: fuera de .erp-comercial valen lo mismo que los de Tailwind
      borderRadius: { lg: "var(--erp-radius-lg, 0.5rem)", md: "var(--erp-radius-md, 0.375rem)", sm: "var(--erp-radius-sm, 0.125rem)" },
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
  plugins: [animate],
};
export default config;
