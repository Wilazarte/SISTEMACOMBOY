import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP COMBOY VID",
  description: "Sistema de compras, almacén y tesorería",
  // Sistema interno: fuera de Google y de cualquier buscador
  robots: { index: false, follow: false },
};

// Pinta el tema guardado (lib/preferencias.ts, clave erp_tema) antes de que cargue React: evita el destello claro→oscuro.
const SCRIPT_TEMA = `try{var t=localStorage.getItem("erp_tema")||"sistema";if(t==="oscuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
