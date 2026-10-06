import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { MOTIVOS_RETIRO, errorChasis } from "@/lib/motivosRetiro";

const MOTIVOS: readonly string[] = MOTIVOS_RETIRO;

/**
 * POST /api/almacen/retiro-produccion
 * Retiro de repuestos para producción / mantenimiento / taller (consumo interno, sin OD ni guía).
 * Body: { producto_id, cantidad_a_retirar, chasis_ot?, motivo, solicitante, autoriza, op_id?, equipo_id? }
 * chasis_ot es obligatorio solo para PRODUCCION - … (PLUS 4000, ECO MINE, COCHE MINERO) y MANTENIMIENTO EQUIPO; en los demás motivos
 * (consumo general de taller, herramientas, insumos de soldadura, oficina / limpieza) puede ir null.
 * Usa la sesión del usuario (RLS) y la función retiro_produccion() de Supabase: valida stock, descuenta,
 * genera el Vale de Producción Interno (VPI-000001) y anota el kardex SALIDA-PRODUCCION. Todo o nada.
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido (JSON)." }, { status: 400 });
  }
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const cantidad = Number(b.cantidad_a_retirar);
  const faltan = [
    !txt(b.producto_id) && "producto_id",
    !(cantidad > 0) && "cantidad_a_retirar",
    !MOTIVOS.includes(txt(b.motivo)) && "motivo",
    !txt(b.solicitante) && "solicitante",
    !txt(b.autoriza) && "autoriza",
  ].filter(Boolean);
  if (faltan.length) return NextResponse.json({ error: `Datos inválidos: ${faltan.join(", ")}.` }, { status: 400 });
  const eChasis = errorChasis(txt(b.motivo), txt(b.chasis_ot));
  if (eChasis) return NextResponse.json({ error: eChasis }, { status: 400 });

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión vencida: vuelva a iniciar sesión." }, { status: 401 });

  const { data, error } = await sb.rpc("retiro_produccion", {
    p_stock_id: txt(b.producto_id),
    p_cantidad: cantidad,
    p_chasis: txt(b.chasis_ot).toUpperCase() || null,
    p_motivo: txt(b.motivo),
    p_solicitante: txt(b.solicitante),
    p_autoriza: txt(b.autoriza),
    p_op_id: txt(b.op_id) || null,
    p_equipo_id: txt(b.equipo_id) || null,
  });
  if (error) {
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
      return NextResponse.json({ error: "Falta la función retiro_produccion en Supabase: ejecute supabase/almacen_kardex.sql en el SQL Editor." }, { status: 501 });
    const status = error.code === "42501" ? 403 : error.code === "23514" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
