import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./erp-comercial.css";
import { Sidebar, MobileNav } from "@/components/erp-comercial/sidebar";
import { prisma } from "@/lib/erp-comercial/prisma";
import { waConfigurado } from "@/lib/erp-comercial/whatsapp";

// ERP Comercial + WhatsApp (antes el proyecto COMBOY-ERP). Vive en /erp/* junto a los expedientes 26W
// de app/(dashboard)/erp. El login es el de SISTEMACOMBOY: middleware.ts protege /erp/*.
export const metadata: Metadata = {
  title: "COMBOY ERP Comercial + WhatsApp",
  description: "Gestion comercial, precios, CRM y WhatsApp Business",
};

export const dynamic = "force-dynamic";

export default async function ErpComercialLayout({ children }: { children: React.ReactNode }) {
  // Si la DB falla, el layout igual debe renderizar (con estilos) y dejar que error.tsx muestre el problema
  const noLeidos = await prisma.mensaje
    .count({ where: { direccion: "IN", leido: false } })
    .catch((e) => {
      console.error("[erp-comercial/layout] No se pudo contar mensajes no leidos:", e);
      return 0;
    });
  return (
    <div className="erp-comercial dark min-h-screen font-sans">
      <div className="flex min-h-screen">
        <Sidebar waConectado={waConfigurado()} noLeidos={noLeidos} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav />
          <main className="print-area flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
      <Toaster theme="dark" richColors position="top-right" />
    </div>
  );
}
