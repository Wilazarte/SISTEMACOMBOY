import { notFound } from "next/navigation";
import { prisma } from "@/lib/erp-comercial/prisma";
import { parseJSON, soles } from "@/lib/erp-comercial/utils";
import { PrintButton } from "@/components/erp-comercial/equipos/print-button";

export const dynamic = "force-dynamic";

// Ficha tecnica imprimible (Ctrl+P / boton imprimir -> Guardar como PDF)
export default async function FichaImprimible({ params, searchParams }: { params: { id: string }; searchParams: { precio?: string } }) {
  const e = await prisma.equipo.findUnique({ where: { id: params.id } });
  if (!e) notFound();
  const fotos = parseJSON<string[]>(e.fotos, []);
  const ficha = parseJSON<Record<string, string>>(e.fichaTecnica, {});
  const precio = Number(searchParams.precio) || null;

  return (
    <div className="mx-auto max-w-[210mm] rounded-xl bg-white text-slate-900 shadow-2xl print:max-w-none print:rounded-none print:shadow-none">
      <div className="no-print flex justify-end gap-2 p-3">
        <PrintButton />
      </div>
      <div className="flex items-center justify-between bg-blue-800 px-10 py-6 text-white print:[-webkit-print-color-adjust:exact]">
        <div className="text-3xl font-black tracking-wider">COMBOY</div>
        <div className="text-right">
          <div className="text-sm font-bold tracking-widest">FICHA TÉCNICA</div>
          <div className="text-xs opacity-80">{e.codigo}</div>
        </div>
      </div>
      <div className="space-y-6 px-10 py-8">
        <div>
          <h1 className="text-2xl font-bold">{e.nombre}</h1>
          <p className="text-sm text-slate-500">{e.marca} · {e.categoria}</p>
        </div>
        {fotos[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotos[0]} alt={e.nombre} className="mx-auto max-h-72 rounded-lg object-contain" />
        )}
        {e.descripcion && (
          <section>
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-blue-800">Descripción</h2>
            <p className="text-sm leading-relaxed">{e.descripcion}</p>
          </section>
        )}
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-800">Especificaciones técnicas</h2>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(ficha).map(([k, v], i) => (
                <tr key={k} className={i % 2 === 0 ? "bg-blue-50 print:[-webkit-print-color-adjust:exact]" : ""}>
                  <td className="w-1/3 px-3 py-2 font-semibold capitalize text-slate-600">{k.replace(/([A-Z])/g, " $1")}</td>
                  <td className="px-3 py-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {fotos.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {fotos.slice(1, 4).map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={f} alt="" className="aspect-square rounded object-cover" />
            ))}
          </div>
        )}
        {precio && (
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-5 py-4 print:[-webkit-print-color-adjust:exact]">
            <span className="font-semibold">Precio especial para usted</span>
            <span className="text-xl font-bold text-emerald-700">{soles(precio)} + IGV</span>
          </div>
        )}
        <p className="border-t pt-3 text-[11px] text-slate-400">Documento generado el {new Date().toLocaleDateString("es-PE")} · Especificaciones sujetas a cambio sin previo aviso.</p>
      </div>
    </div>
  );
}
