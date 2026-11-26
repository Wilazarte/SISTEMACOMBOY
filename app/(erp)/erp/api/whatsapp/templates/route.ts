import { handler } from "@/lib/erp-comercial/api";
import { listarPlantillasMeta, waConfigurado } from "@/lib/erp-comercial/whatsapp";

export const dynamic = "force-dynamic";

// Plantillas APROBADAS en Meta (para escribir fuera de la ventana de 24h)
export const GET = handler(async () => {
  if (!waConfigurado()) return [];
  return listarPlantillasMeta();
});
