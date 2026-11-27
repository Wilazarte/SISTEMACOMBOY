"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Sparkles, TrendingDown } from "lucide-react";
import { Button, Card, CardHeader, Input, Modal, Table, Td, cn, ejecutar } from "@/components/ui";
import { KEYS, fechaPE, soles, useStore } from "@/lib/storage";
import { useCatalogo } from "@/lib/productos";
import { aplicarLlenado, llenadoDesdeCompras, preciosObservados, resumenPrecios, type ResumenProducto } from "@/lib/analisisPrecios";
import { guardarExcel } from "@/lib/guardarArchivo";
import type { Compra, Cotizacion, OrdenCompra, Proveedor } from "@/lib/types";

const ORIGEN: Record<string, string> = { COMPRA: "Compra", OC: "OC", COTIZACION: "Cotización" };

/**
 * Análisis de precios (Williams 2026-11-27): qué proveedor da el precio más bajo de cada producto, según
 * compras, OC y cotizaciones. Se usa en Logística › Base de proveedores y en Tesorería › Listas por proveedor.
 */
/** Resumen de precios por producto con lo que hay descargado (compras, OC, cotizaciones). */
export function useResumenPrecios(): { resumen: ResumenProducto[]; proveedores: Proveedor[] } {
  useCatalogo(); // nombres del catálogo para unir el mismo producto escrito distinto
  const compras = useStore<Compra[]>(KEYS.COMPRAS, []);
  const ordenes = useStore<OrdenCompra[]>(KEYS.ORDENES, []);
  const cotizaciones = useStore<Cotizacion[]>(KEYS.COTIZACIONES, []);
  const proveedores = useStore<Proveedor[]>(KEYS.PROVEEDORES, []);
  const resumen = useMemo(() => resumenPrecios(preciosObservados(compras, ordenes, cotizaciones, proveedores)), [compras, ordenes, cotizaciones, proveedores]);
  return { resumen, proveedores };
}

export function AnalisisPrecios({ puedeLlenar }: { puedeLlenar: boolean }) {
  const { resumen, proveedores } = useResumenPrecios();
  const [q, setQ] = useState("");
  const [soloVarios, setSoloVarios] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [llenar, setLlenar] = useState(false);
  const [conCotizados, setConCotizados] = useState(false);

  const lista = resumen.filter((r) => (!soloVarios || r.proveedores.length > 1) && (!q.trim() || `${r.nombre} ${r.sku ?? ""} ${r.proveedores.map((p) => p.proveedor).join(" ")}`.toUpperCase().includes(q.trim().toUpperCase())));
  const varios = resumen.filter((r) => r.proveedores.length > 1).length;
  const llenado = useMemo(() => (llenar ? llenadoDesdeCompras(resumen, proveedores, conCotizados) : []), [llenar, resumen, proveedores, conCotizados]);
  const totalNuevos = llenado.reduce((a, l) => a + l.nuevos.length, 0);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filas = lista.flatMap((r) =>
      r.proveedores.map((p, k) => ({
        Producto: r.nombre,
        SKU: r.sku ?? "",
        Unidad: r.unidad,
        Puesto: k + 1,
        Proveedor: p.proveedor,
        RUC: p.ruc,
        "Ultimo precio con IGV": p.ultimo,
        "Fecha ultimo": p.fechaUltimo,
        Origen: ORIGEN[p.origenUltimo],
        Minimo: p.minimo,
        Promedio: p.promedio,
        Compras: p.compras,
        Cotizaciones: p.cotizaciones,
      })),
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Precios");
    await guardarExcel(libro, "analisis-precios-proveedores.xlsx");
  };

  return (
    <Card>
      <CardHeader
        title={`Análisis de precios (${resumen.length} productos)`}
        subtitle={`Precios CON IGV de compras, OC y cotizaciones. ${varios} producto(s) tienen más de un proveedor: el más barato va primero y es el sugerido.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Producto o proveedor…" value={q} onChange={(e) => setQ(e.target.value)} className="w-52" aria-label="Buscar producto" />
            <label className="flex items-center gap-1.5 text-xs font-medium text-plomo-600">
              <input type="checkbox" checked={soloVarios} onChange={(e) => setSoloVarios(e.target.checked)} /> Solo con varios proveedores
            </label>
            <Button variant="secondary" onClick={() => void exportar()} disabled={!lista.length}>
              <Download size={15} /> Excel
            </Button>
            {puedeLlenar && (
              <Button onClick={() => setLlenar(true)} disabled={!resumen.length}>
                <Sparkles size={15} /> Llenar fichas con compras
              </Button>
            )}
          </div>
        }
      />
      {resumen.length === 0 ? (
        <p className="px-5 py-6 text-sm text-plomo-500">Aún no hay compras, OC ni cotizaciones con precios para comparar.</p>
      ) : (
        <Table head={["Producto", "Más barato (sugerido)", "Otros proveedores", "Ahorro", ""]} empty={lista.length === 0}>
          {lista.map((r) => {
            const [mejor, ...otros] = r.proveedores;
            const abiertoAqui = abierto === r.clave;
            return [
              <tr key={r.clave} className="align-top hover:bg-plomo-50">
                <Td>
                  <p className="font-medium text-fg">{r.nombre}</p>
                  <p className="text-[11px] text-plomo-500">{[r.sku, r.unidad].filter(Boolean).join(" · ")}</p>
                </Td>
                <Td>
                  <p className="flex items-center gap-1 font-semibold text-emerald-700">
                    <TrendingDown size={14} /> {soles(mejor.ultimo)}
                  </p>
                  <p className="text-xs text-fg">{mejor.proveedor}</p>
                  <p className="text-[11px] text-plomo-500">
                    {ORIGEN[mejor.origenUltimo]} {fechaPE(mejor.fechaUltimo)} · {mejor.compras} compra(s)
                  </p>
                </Td>
                <Td className="text-xs">
                  {otros.length === 0 ? (
                    <span className="text-plomo-500">Único proveedor</span>
                  ) : (
                    otros.map((p) => (
                      <p key={p.proveedorId || p.ruc || p.proveedor}>
                        {p.proveedor}: <b>{soles(p.ultimo)}</b>
                        <span className="ml-1 text-red-700">+{mejor.ultimo > 0 ? Math.round(((p.ultimo - mejor.ultimo) / mejor.ultimo) * 100) : 0}%</span>
                      </p>
                    ))
                  )}
                </Td>
                <Td className="whitespace-nowrap">{r.ahorroPct !== null ? <span className="font-semibold text-emerald-700">{r.ahorroPct}%</span> : "-"}</Td>
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => setAbierto(abiertoAqui ? null : r.clave)} title="Historial de precios">
                    {abiertoAqui ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </Button>
                </Td>
              </tr>,
              abiertoAqui && (
                <tr key={`${r.clave}-h`}>
                  <td colSpan={5} className="bg-plomo-50 px-5 py-2">
                    <Table head={["Fecha", "Proveedor", "Origen", "Documento", "Cant.", "Precio (inc. IGV)"]}>
                      {r.historial.map((h, k) => (
                        <tr key={k}>
                          <Td>{fechaPE(h.fecha)}</Td>
                          <Td>{h.proveedor}</Td>
                          <Td>{ORIGEN[h.origen]}</Td>
                          <Td>{h.documento}</Td>
                          <Td>{h.cantidad}</Td>
                          <Td className="text-right">{soles(h.precio)}</Td>
                        </tr>
                      ))}
                    </Table>
                  </td>
                </tr>
              ),
            ];
          })}
        </Table>
      )}

      <Modal open={llenar} onClose={() => setLlenar(false)} title="Llenar fichas de proveedores con lo que ya se compró" wide>
        <p className="mb-2 text-sm text-plomo-600">
          Se agregan a cada proveedor de la base los productos que ya nos vendió y que aún no están en su ficha. La opción se pone por precio:
          el más barato de ese producto queda como <b>1ª opción</b>, el segundo como <b>2ª</b> y el resto como <b>3ª</b>. Lo que ya tiene la ficha no se cambia.
        </p>
        <label className="mb-3 flex items-center gap-1.5 text-xs font-medium text-plomo-600">
          <input type="checkbox" checked={conCotizados} onChange={(e) => setConCotizados(e.target.checked)} /> Incluir también productos que solo cotizaron (sin compra)
        </label>
        {llenado.length === 0 ? (
          <p className="rounded-lg bg-plomo-50 p-3 text-sm text-plomo-600">No hay productos nuevos para agregar: las fichas ya tienen todo lo comprado.</p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {llenado.map((l) => (
              <div key={l.proveedor.id} className="rounded-lg border border-plomo-100 p-2">
                <p className="text-sm font-semibold text-fg">
                  {l.proveedor.razonSocial} <span className="font-normal text-plomo-500">· {l.nuevos.length} producto(s) nuevo(s)</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {l.nuevos.map((x) => (
                    <span key={x.nombre} className={cn("rounded-full border px-2 py-0.5 text-[11px]", x.opcion === 1 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : x.opcion === 2 ? "border-sky-300 bg-sky-50 text-sky-800" : "border-amber-300 bg-amber-50 text-amber-800")}>
                      {x.opcion}ª {x.nombre}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setLlenar(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!totalNuevos}
            onClick={() => {
              if (ejecutar(() => void aplicarLlenado(llenado), `${totalNuevos} producto(s) agregados a ${llenado.length} proveedor(es)`)) setLlenar(false);
            }}
          >
            <Sparkles size={15} /> Agregar {totalNuevos} producto(s)
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
