import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOTIVOS_DERIVACION, type Derivacion, type MotivoDerivacion, type VentaSucursal } from "@/lib/sucursal-modelos";

/**
 * POST /api/sucursal/derivar-venta
 * Body: { ventaId, motivo: PRODUCTO_NO_DISPONIBLE | SERVICIO_ESPECIALIZADO | EQUIPO, detalle?, sucursal: "Arequipa Sur" }
 * Marca la venta como "derivada" y crea la derivación que ve el Taller Principal (notificación + OT pendiente).
 * Usa la sesión del usuario (RLS de la tabla sucursal: solo creador / sucursal escriben ventas).
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido (JSON)." }, { status: 400 });
  }
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const ventaId = txt(b.ventaId);
  const motivo = txt(b.motivo) as MotivoDerivacion;
  const faltan = [!ventaId && "ventaId", !(motivo in MOTIVOS_DERIVACION) && "motivo", !txt(b.sucursal) && "sucursal"].filter(Boolean);
  if (faltan.length) return NextResponse.json({ error: `Datos inválidos: ${faltan.join(", ")}.` }, { status: 400 });

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión vencida: vuelva a iniciar sesión." }, { status: 401 });

  const { data: fila, error: eLeer } = await sb.from("sucursal").select("data").eq("tipo", "venta").eq("id", ventaId).maybeSingle();
  if (eLeer) {
    const falta = eLeer.code === "42P01" || eLeer.code === "PGRST205";
    return NextResponse.json({ error: falta ? "Falta la tabla sucursal: ejecute supabase/migrations/20261022_sucursal_beta.sql." : eLeer.message }, { status: falta ? 501 : 400 });
  }
  if (!fila) return NextResponse.json({ error: "Venta no encontrada." }, { status: 404 });
  const venta = fila.data as VentaSucursal;
  if (venta.estado !== "registrada") return NextResponse.json({ error: venta.estado === "derivada" ? "La venta ya está derivada al Taller." : "Solo se derivan ventas por entregar." }, { status: 409 });

  const { data: perfil } = await sb.from("perfiles").select("usuario").eq("id", user.id).maybeSingle();
  const ahora = new Date().toISOString();
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const derivacion: Derivacion = {
    id: crypto.randomUUID(),
    fecha,
    ventaId,
    ventaNumero: venta.numero,
    cliente: venta.cliente,
    motivo,
    detalle: txt(b.detalle),
    sucursal: txt(b.sucursal),
    sucursalId: venta.sucursalId,
    productos: venta.lineas.map((l) => ({ productoId: l.productoId, productoMaestroId: l.productoMaestroId, sku: l.sku, producto: l.producto, unidad: l.unidad, cantidad: l.cantidad })),
    estado: "pendiente",
    creadoPor: perfil?.usuario ?? user.email ?? "sucursal",
  };
  const derivada: VentaSucursal = {
    ...venta,
    estado: "derivada",
    requiereTraslado: true,
    derivacionId: derivacion.id,
    historial: [
      ...(venta.historial ?? []),
      { fecha: ahora, usuario: derivacion.creadoPor as "CONTADOR", accion: "Derivada a Taller Principal", detalle: `${MOTIVOS_DERIVACION[motivo]} · En preparación${derivacion.detalle ? ` · ${derivacion.detalle}` : ""}` },
    ],
  };

  const ins = await sb.from("sucursal").insert({ tipo: "derivacion", id: derivacion.id, data: derivacion });
  if (ins.error) return NextResponse.json({ error: ins.error.code === "42501" ? "Su usuario no puede derivar ventas." : ins.error.message }, { status: ins.error.code === "42501" ? 403 : 400 });
  // Solo si sigue "registrada": dos clics a la vez no generan dos derivaciones activas
  const upd = await sb.from("sucursal").update({ data: derivada }).eq("tipo", "venta").eq("id", ventaId).eq("data->>estado", "registrada").select("id");
  if (upd.error || !upd.data?.length) {
    await sb.from("sucursal").delete().eq("tipo", "derivacion").eq("id", derivacion.id);
    return NextResponse.json({ error: upd.error?.message ?? "La venta cambió mientras se derivaba: actualice e intente de nuevo." }, { status: 409 });
  }
  return NextResponse.json({ derivacion, venta: derivada });
}
