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

  const { data, error } = await sb.from("compras").select("id,tipo,data").in("tipo", ["factura", "compra_directa"]).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });

  const filas = data ?? [];
  // Compras con ingreso a stock marcadas "Sin comprobante" (Williams 2026-11-13): su DJ va en djNumero
  const djsCompras = filas
    .filter((r) => r.tipo === "compra_directa")
    .map((r) => r.data as Record<string, unknown>)
    .filter((d) => !!d.djNumero && d.tipoComprobante === "SIN_COMPROBANTE")
    .map((d) => ({
      id: d.id,
      numero_dj: d.djNumero,
      comprobante: d.numero,
      codigo_gasto: null,
      fecha: d.fecha,
      concepto: `Compra con ingreso a ${d.sede}`,
      importe: d.total,
      proveedor: d.proveedor,
      ruc: d.ruc || null,
      estado: d.djEstado ?? "PENDIENTE",
      estado_pago: (d.pago as { estado?: string } | undefined)?.estado === "PENDIENTE" ? "POR_PAGAR" : "PAGADA",
    }));
  const djs = filas
    .filter((r) => r.tipo === "factura")
    .map((r) => r.data as Record<string, unknown>)
    // DJ automática solo en gastos "Sin comprobante" (con factura / boleta / otro comprobante no hay DJ)
    .filter((d) => d.comprobanteGasto === "DJ" || d.tipo === "DECLARACION_JURADA" || (!!d.djNumero && d.comprobanteGasto === "SIN_COMPROBANTE"))
    .map((d) => ({
      id: d.id,
      // DJ automática de un gasto sin comprobante: su N° va en djNumero y `numero` es el del comprobante
      numero_dj: d.comprobanteGasto === "DJ" || d.tipo === "DECLARACION_JURADA" ? d.numero : d.djNumero,
      comprobante: d.comprobanteGasto === "DJ" || d.tipo === "DECLARACION_JURADA" ? null : d.numero,
      codigo_gasto: d.codigo ?? null,
      fecha: d.fecha,
      concepto: d.descripcion ?? null,
      importe: d.total,
      proveedor: d.proveedor,
      ruc: d.ruc || null,
      estado: d.djEstado ?? "PENDIENTE",
      estado_pago: d.estadoPago,
    }));
  return NextResponse.json([...djs, ...djsCompras]);
}
