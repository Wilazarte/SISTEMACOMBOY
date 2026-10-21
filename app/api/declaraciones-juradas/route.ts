import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/declaraciones-juradas
 * Declaraciones juradas de gasto (gastos sin comprobante, DJ-0001…) con la sesión del usuario (RLS de compras).
 * Viven en compras (tipo factura) con comprobante DJ; no hay tabla aparte. El PDF se arma en el navegador (lib/pdf.ts).
 */
export async function GET() {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión vencida: vuelva a iniciar sesión." }, { status: 401 });

  const { data, error } = await sb.from("compras").select("id,data").eq("tipo", "factura").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });

  const djs = (data ?? [])
    .map((r) => r.data as Record<string, unknown>)
    .filter((d) => d.comprobanteGasto === "DJ" || d.tipo === "DECLARACION_JURADA")
    .map((d) => ({
      id: d.id,
      numero_dj: d.numero,
      codigo_gasto: d.codigo ?? null,
      fecha: d.fecha,
      concepto: d.descripcion ?? null,
      importe: d.total,
      proveedor: d.proveedor,
      ruc: d.ruc || null,
      estado: d.djEstado ?? "PENDIENTE",
      estado_pago: d.estadoPago,
    }));
  return NextResponse.json(djs);
}
