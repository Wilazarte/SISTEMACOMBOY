import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Paleta corporativa COMBOY VID (ver variables en app/globals.css)
      colors: {
        azul: { 900: "#0F2440", 700: "#1E3A5F", 500: "#2A4A73" },
        vino: { 900: "#7F1D1D", DEFAULT: "#9B1C1F" },
        corp: "#B91C1C",
        plomo: { 50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 500: "#64748B", 600: "#475569" },
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans: ["var(--font-sans)"],
      },
    },
  },
  plugins: [],
};
export default config;
