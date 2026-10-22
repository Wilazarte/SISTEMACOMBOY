import type { ReactNode } from "react";

/**
 * COMBOY VID SUCURSAL: sistema aparte del ERP (sin Tesorería, dock ni barra de notificaciones del ERP).
 * Tema claro, Times New Roman como todo el sistema. Cada usuario ve solo su sede (RLS sede_isolation).
 */
export default function SucursalRootLayout({ children }: { children: ReactNode }) {
  return <div className="tema-claro min-h-screen bg-canvas text-fg">{children}</div>;
}
