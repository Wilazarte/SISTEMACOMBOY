import { handler } from "@/lib/erp-comercial/api";
import { waConfigurado } from "@/lib/erp-comercial/whatsapp";

export const dynamic = "force-dynamic";

// Verifica la conexion con Meta consultando el numero de telefono
export const GET = handler(async () => {
  if (!waConfigurado()) return { conectado: false, modo: "SIMULACION" };
  const v = process.env.WHATSAPP_API_VERSION || "v21.0";
  const res = await fetch(`https://graph.facebook.com/${v}/${process.env.PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  const json = await res.json();
  if (!res.ok) return { conectado: false, modo: "ERROR", error: json?.error?.message };
  return { conectado: true, modo: "PRODUCCION", numero: json.display_phone_number, nombre: json.verified_name, calidad: json.quality_rating };
});
