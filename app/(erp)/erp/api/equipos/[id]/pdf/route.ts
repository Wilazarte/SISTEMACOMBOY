import { prisma } from "@/lib/erp-comercial/prisma";
import { generarFichaPDF } from "@/lib/erp-comercial/pdf";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const equipo = await prisma.equipo.findUnique({ where: { id: params.id } });
  if (!equipo) return new Response("No encontrado", { status: 404 });
  const precio = Number(new URL(req.url).searchParams.get("precio")) || undefined;
  const pdf = await generarFichaPDF(equipo, { precio });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Ficha-${equipo.codigo}.pdf"`,
    },
  });
}
