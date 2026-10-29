import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Buscador de repuestos de la web pública (comboyvid.com/#repuestos).
// Sin sesión: llama solo a la función buscar_repuestos_publico (SQL 20261105_repuestos_publico.sql),
// que devuelve nombre, código, sede y si hay stock (sin costos ni cantidades).

const ORIGENES = ["https://comboyvid.com", "https://www.comboyvid.com"];

function cors(req: Request): Record<string, string> {
  const origen = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

/** GET /api/publico/repuestos?q=yuchai -> { resultados: [{ tipo, codigo, nombre, unidad, sede, disponible }] } */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ resultados: [] }, { headers: cors(req) });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("buscar_repuestos_publico", { p_q: q });
  if (error) {
    const falta = error.code === "PGRST202" || /could not find|does not exist/i.test(error.message);
    return NextResponse.json(
      { error: falta ? "SIN_FUNCION" : "ERROR", mensaje: falta ? "Falta ejecutar 20261105_repuestos_publico.sql en Supabase." : "No se pudo consultar el stock." },
      { status: falta ? 501 : 500, headers: cors(req) }
    );
  }
  return NextResponse.json({ resultados: data ?? [] }, { headers: { ...cors(req), "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
