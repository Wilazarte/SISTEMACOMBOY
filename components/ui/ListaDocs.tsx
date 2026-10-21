"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input, Select, Table, Td, cn } from "@/components/ui";
import { fechaPE } from "@/lib/storage";

/** Una fila de la lista: lo que se ve (fecha, contraparte, documento, total, acciones) y lo que se filtra. */
export interface FilaDoc {
  id: string;
  /** YYYY-MM-DD (o ISO): se muestra DD/MM/AAAA y se filtra por rango. */
  fecha: string;
  /** Proveedor, cliente, trabajador o producto. */
  contraparte: string;
  /** Celda "Doc. referencia" (número, documento relacionado, estado). */
  ref: ReactNode;
  /** Celda "Total" (S/, cantidad…). */
  total: ReactNode;
  acciones?: ReactNode;
  /** Texto donde busca el buscador (N° de documento, REQ, OC, RUC…). */
  buscar: string;
  tipoDoc?: string;
  estado?: string;
  /** Línea pequeña bajo la fecha (vencimiento, periodo…). */
  subFecha?: ReactNode;
  claseFila?: string;
}

export type TipoLista = "compras" | "cotizaciones" | "ordenes" | "facturas" | "planilla" | "ventas" | "inventario" | "requerimientos";

const ETIQUETAS: Record<TipoLista, { contraparte: string; ref: string; total: string; buscar: string }> = {
  compras: { contraparte: "Proveedor", ref: "Doc. referencia", total: "Total", buscar: "Buscar comprobante, proveedor, RUC…" },
  cotizaciones: { contraparte: "Proveedor", ref: "N° cotización", total: "Total", buscar: "Buscar cotización, REQ, proveedor…" },
  ordenes: { contraparte: "Proveedor", ref: "N° OC / cotización", total: "Total", buscar: "Buscar OC, cotización, REQ, proveedor…" },
  facturas: { contraparte: "Proveedor", ref: "N° factura", total: "Total", buscar: "Buscar factura, OC, proveedor…" },
  planilla: { contraparte: "Trabajador", ref: "Detalle", total: "Monto", buscar: "Buscar trabajador, DNI, cargo…" },
  ventas: { contraparte: "Cliente", ref: "Doc. referencia", total: "Total", buscar: "Buscar NP, OD, cliente…" },
  inventario: { contraparte: "Producto", ref: "Sede / unidad", total: "Cantidad", buscar: "Buscar producto…" },
  requerimientos: { contraparte: "Solicitante", ref: "Doc. referencia", total: "Ítems", buscar: "Buscar REQ, OC, solicitante…" },
};

/** Página 1: los últimos 15; desde la 2: de 30 en 30. */
export const PAGE1 = 15;
export const PAGEN = 30;
const rango = (pagina: number): [number, number] => (pagina === 1 ? [0, PAGE1] : [PAGE1 + (pagina - 2) * PAGEN, PAGE1 + (pagina - 1) * PAGEN]);

/**
 * Lista de documentos del ERP: FECHA | PROVEEDOR/CLIENTE | DOC REFERENCIA | TOTAL | ACCIONES,
 * con buscador, filtros (fecha, contraparte, tipo, estado) y paginación 15 / 30.
 * El detalle completo (RUC, ítems, IGV, pago, baucher…) queda en el modal Ver y en el PDF de cada documento.
 */
export function ListaDocs({ filas, tipo, conAcciones = true }: { filas: FilaDoc[]; tipo: TipoLista; conAcciones?: boolean }) {
  const et = ETIQUETAS[tipo];
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [contraparte, setContraparte] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);

  const opciones = useMemo(() => {
    const unicos = (v: (string | undefined)[]) => Array.from(new Set(v.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "es"));
    return { contrapartes: unicos(filas.map((f) => f.contraparte)), tipos: unicos(filas.map((f) => f.tipoDoc)), estados: unicos(filas.map((f) => f.estado)) };
  }, [filas]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) => {
      const dia = f.fecha.slice(0, 10);
      return (
        (!t || `${f.buscar} ${f.contraparte}`.toLowerCase().includes(t)) &&
        (!desde || dia >= desde) &&
        (!hasta || dia <= hasta) &&
        (!contraparte || f.contraparte === contraparte) &&
        (!tipoDoc || f.tipoDoc === tipoDoc) &&
        (!estado || f.estado === estado)
      );
    });
  }, [filas, q, desde, hasta, contraparte, tipoDoc, estado]);

  const paginas = filtradas.length <= PAGE1 ? 1 : 1 + Math.ceil((filtradas.length - PAGE1) / PAGEN);
  useEffect(() => setPagina(1), [q, desde, hasta, contraparte, tipoDoc, estado]);
  useEffect(() => {
    if (pagina > paginas) setPagina(paginas);
  }, [pagina, paginas]);
  const [ini, fin] = rango(pagina);
  const visibles = filtradas.slice(ini, fin);
  const hayFiltros = !!(q || desde || hasta || contraparte || tipoDoc || estado);
  const limpiar = () => {
    setQ("");
    setDesde("");
    setHasta("");
    setContraparte("");
    setTipoDoc("");
    setEstado("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 border-b border-plomo-100 px-4 py-3">
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-plomo-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={et.buscar} className="pl-9" aria-label="Buscar" />
        </label>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" title="Desde" aria-label="Desde" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" title="Hasta" aria-label="Hasta" />
        {opciones.contrapartes.length > 1 && (
          <Select value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder={`Todos (${et.contraparte.toLowerCase()})`} options={opciones.contrapartes.map((x) => ({ value: x, label: x }))} className="w-52" />
        )}
        {opciones.tipos.length > 1 && <Select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} placeholder="Tipo doc." options={opciones.tipos.map((x) => ({ value: x, label: x }))} className="w-36" />}
        {opciones.estados.length > 1 && (
          <Select value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Estado" options={opciones.estados.map((x) => ({ value: x, label: x.replace(/_/g, " ") }))} className="w-40" />
        )}
        {hayFiltros && (
          <button type="button" onClick={limpiar} className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-plomo-500 hover:bg-plomo-100 hover:text-fg">
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      <Table head={["Fecha", et.contraparte, et.ref, et.total, ...(conAcciones ? ["Acciones"] : [])]} empty={visibles.length === 0}>
        {visibles.map((f) => (
          <tr key={f.id} className={cn("hover:bg-plomo-50", f.claseFila)}>
            <Td className="whitespace-nowrap">
              {fechaPE(f.fecha.slice(0, 10))}
              {f.subFecha && <div className="text-[11px]">{f.subFecha}</div>}
            </Td>
            <Td className="max-w-[320px]">
              <span className="block truncate font-medium text-fg" title={f.contraparte}>
                {f.contraparte}
              </span>
            </Td>
            <Td>{f.ref}</Td>
            <Td className="whitespace-nowrap text-right font-semibold">{f.total}</Td>
            {conAcciones && <Td>{f.acciones}</Td>}
          </tr>
        ))}
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-plomo-100 px-4 py-3 text-xs text-plomo-500">
        <span>
          Mostrando {visibles.length} de {filtradas.length} resultado{filtradas.length === 1 ? "" : "s"}
          {filtradas.length !== filas.length && ` (filtrados de ${filas.length})`} · Página 1 muestra los últimos {PAGE1}, página 2+ muestra {PAGEN}
        </span>
        {paginas > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)} className="rounded-md p-1.5 hover:bg-plomo-100 disabled:opacity-40" aria-label="Página anterior">
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: paginas }, (_, i) => i + 1).map((p) => (
              <button key={p} type="button" onClick={() => setPagina(p)} className={cn("h-7 min-w-[28px] rounded-md px-2 font-semibold", p === pagina ? "bg-corp text-white" : "hover:bg-plomo-100")}>
                {p}
              </button>
            ))}
            <button type="button" disabled={pagina === paginas} onClick={() => setPagina((p) => p + 1)} className="rounded-md p-1.5 hover:bg-plomo-100 disabled:opacity-40" aria-label="Página siguiente">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
