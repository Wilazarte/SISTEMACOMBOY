"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tabla única del ERP (Tesorería / Compras: FECHA · PROVEEDOR · DOC. REFERENCIA · TOTAL · ACCIONES):
 * cabecera oscura en mayúsculas, filas con borde #2a3445 y hover. `components/ui` Table la usa en todos los módulos.
 * `compacto`: menos relleno y cabeceras que pueden partirse (tablas anchas, ej. planilla del periodo).
 * `tarjetas`: en celular (< 768 px) cada fila se ve como tarjeta con "CABECERA  valor" en vez de tabla horizontal.
 */
export function ErpTable({
  head,
  children,
  empty,
  compacto,
  vacio = "Sin registros",
  className,
  tarjetas,
}: {
  head: string[];
  children: ReactNode;
  empty?: boolean;
  compacto?: boolean;
  vacio?: string;
  className?: string;
  tarjetas?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("overflow-x-auto", tarjetas && "tabla-tarjetas", className)} data-tt={tarjetas ? id : undefined}>
      {tarjetas && <EtiquetasTarjeta id={id} head={head} />}
      <table className={cn("w-full min-w-[720px] text-left text-sm", compacto && "[&_td]:px-2 [&_td]:py-2")}>
        <thead className={cn("border-y border-white/[0.08] bg-[#212a3a] font-bold uppercase text-[#93c5fd]", compacto ? "text-[10px] tracking-wide" : "text-[11px] tracking-wider")}>
          <tr>
            {head.map((h) => (
              <th key={h} className={compacto ? "px-2 py-2 leading-tight" : "whitespace-nowrap px-4 py-2.5"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="glass-card [&>tr:hover]:bg-[#212a3a] [&>tr]:border-b [&>tr]:border-white/[0.08] [&>tr]:transition-colors">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-[#a1a1aa]">{vacio}</p>}
    </div>
  );
}

/**
 * Etiqueta de cada celda en modo tarjeta (celular): td:nth-child(n)::before = cabecera n.
 * Así no hay que tocar cada <Td> de los módulos. El estilo base está en app/globals.css (.tabla-tarjetas).
 */
export function EtiquetasTarjeta({ id, head }: { id: string; head: string[] }) {
  const sel = `[data-tt="${id.replace(/"/g, "")}"]`;
  const css = head.map((h, i) => `${sel} td:nth-child(${i + 1})::before{content:${JSON.stringify(h)}}`).join("");
  return <style>{`@media (max-width:767px){${css}}`}</style>;
}

export const ErpTd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-2.5 text-[#e5e7eb]", className)}>{children}</td>
);

export default ErpTable;
