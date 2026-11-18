import { NextResponse } from "next/server";

// GET /api/sunat/archivo?url=https://www.nubefact.com/cpe/....pdf
// Trae el PDF / XML / CDR que devolvió Nubefact para verlo, descargarlo o imprimirlo desde el ERP
// (el navegador no puede leerlos directo por CORS). Solo enlaces https de nubefact.com; la sesión la exige el middleware.

const permitido = (u: URL) => u.protocol === "https:" && (u.hostname === "nubefact.com" || u.hostname.endsWith(".nubefact.com"));

export async function GET(req: Request) {
  const destino = new URL(req.url).searchParams.get("url") ?? "";
  let u: URL;
  try {
    u = new URL(destino);
  } catch {
    return NextResponse.json({ error: "Enlace inválido." }, { status: 400 });
  }
  if (!permitido(u)) return NextResponse.json({ error: "Solo se permiten enlaces de Nubefact." }, { status: 400 });
  try {
    const r = await fetch(u, { redirect: "follow", cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `Nubefact respondió ${r.status}.` }, { status: 502 });
    if (!r.url || !permitido(new URL(r.url))) return NextResponse.json({ error: "Redirección no permitida." }, { status: 502 });
    const bytes = await r.arrayBuffer();
    return new NextResponse(bytes, {
      headers: { "Content-Type": r.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo traer el archivo: ${(e as Error).message}` }, { status: 502 });
  }
}
