import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UMBRAL_DUPLICADO, normalizarNombre, type ProductoMaestro } from "@/lib/productos-modelos";

type Similar = Pick<ProductoMaestro, "id" | "sku" | "nombre_display" | "nombre_normalizado" | "unidad"> & { similitud: number };

const faltaCatalogo = (e: { code?: string; message?: string }) => e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|could not find/i.test(e.message ?? "");
const SIN_CATALOGO = { error: "SIN_CATALOGO", mensaje: "Falta el catálogo maestro en Supabase: ejecute supabase/migrations/20261022_unificar_productos.sql." };

/** GET /api/productos?q=temple blanco -> productos parecidos del catálogo maestro (pg_trgm). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ productos: [] });
  const sb = createClient();
  const { data, error } = await sb.rpc("productos_similares", { nombre: q, umbral: 0.3 });
  if (error) return NextResponse.json(faltaCatalogo(error) ? SIN_CATALOGO : { error: error.message }, { status: faltaCatalogo(error) ? 501 : 400 });
  return NextResponse.json({ productos: data ?? [] });
}

/**
 * POST /api/productos  { nombre, unidad, marca?, categoria?, descripcion?, forzar?, solicitudId? }
 * Alta en el catálogo maestro (solo administrador: creador / admin).
 * 409 PRODUCTO_YA_EXISTE  -> mismo nombre normalizado (o alias): se devuelve el producto a usar.
 * 409 PRODUCTO_SIMILAR    -> parecido > 80 % (pg_trgm): "¿Quisiste decir…?"; se crea igual con forzar: true.
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido (JSON)." }, { status: 400 });
  }
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const nombre = txt(b.nombre);
  const norm = normalizarNombre(nombre);
  if (!norm) return NextResponse.json({ error: "DATOS_INVALIDOS", mensaje: "Ingrese el nombre del producto." }, { status: 400 });

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "SIN_SESION", mensaje: "Sesión vencida: vuelva a iniciar sesión." }, { status: 401 });
  const { data: perfil } = await sb.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
  if (!["creador", "admin"].includes(perfil?.rol ?? ""))
    return NextResponse.json({ error: "SOLO_ADMIN", mensaje: 'Solo el administrador crea productos en el catálogo maestro. Use "Solicitar nuevo producto".' }, { status: 403 });

  // Mismo nombre normalizado o alias: no se crea, se sugiere el existente
  const { data: idExistente, error: eExiste } = await sb.rpc("producto_de_nombre", { nombre: norm });
  if (eExiste) return NextResponse.json(faltaCatalogo(eExiste) ? SIN_CATALOGO : { error: eExiste.message }, { status: faltaCatalogo(eExiste) ? 501 : 400 });
  if (idExistente) {
    const { data: existente } = await sb.from("productos_maestro").select("id, sku, nombre_display, nombre_normalizado, unidad").eq("id", idExistente).maybeSingle();
    return NextResponse.json(
      {
        error: "PRODUCTO_YA_EXISTE",
        sugerencia: existente,
        mensaje: `Ya existe como ${existente?.nombre_display ?? norm} (${existente?.sku ?? "-"}). Use ese producto para todos los almacenes.`,
      },
      { status: 409 }
    );
  }

  // Parecido > 80 %: "¿Quisiste decir…?"
  if (b.forzar !== true) {
    const { data: similares } = await sb.rpc("productos_similares", { nombre: norm, umbral: UMBRAL_DUPLICADO });
    const top = ((similares ?? []) as Similar[]).filter((s) => s.similitud >= UMBRAL_DUPLICADO)[0];
    if (top)
      return NextResponse.json(
        { error: "PRODUCTO_SIMILAR", sugerencia: top, mensaje: `¿Quisiste decir ${top.nombre_display} (${top.sku})? Parecido ${Math.round(top.similitud * 100)} %.` },
        { status: 409 }
      );
  }

  const { data, error } = await sb.rpc("crear_producto_maestro", {
    p_nombre: nombre,
    p_unidad: txt(b.unidad) || "UND",
    p_marca: txt(b.marca) || null,
    p_categoria: txt(b.categoria) || null,
    p_descripcion: txt(b.descripcion) || null,
    p_solicitud: txt(b.solicitudId) || null,
  });
  if (error) {
    if (/PRODUCTO_YA_EXISTE/.test(error.message)) return NextResponse.json({ error: "PRODUCTO_YA_EXISTE", mensaje: error.message.replace(/^PRODUCTO_YA_EXISTE:\s*/, "") }, { status: 409 });
    return NextResponse.json({ error: error.code === "42501" ? "SOLO_ADMIN" : "ERROR", mensaje: error.message }, { status: error.code === "42501" ? 403 : 400 });
  }
  return NextResponse.json({ producto: data }, { status: 201 });
}
