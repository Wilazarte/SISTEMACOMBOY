"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tabla única del ERP (Tesorería / Compras: FECHA · PROVEEDOR · DOC. REFERENCIA · TOTAL · ACCIONES):
 * cabecera oscura en mayúsculas, filas con borde #2a2a2a y hover. `components/ui` Table la usa en todos los módulos.
 * `compacto`: menos relleno y cabeceras que pueden partirse (tablas anchas, ej. planilla del periodo).
 */
export function ErpTable({
  head,
  children,
  empty,
  compacto,
  vacio = "Sin registros",
  className,
}: {
  head: string[];
  children: ReactNode;
  empty?: boolean;
  compacto?: boolean;
  vacio?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className={cn("w-full min-w-[720px] text-left text-sm", compacto && "[&_td]:px-2 [&_td]:py-2")}>
        <thead className={cn("border-y border-[#2a2a2a] bg-[#1c1c1c] font-bold uppercase text-[#ffb27a]", compacto ? "text-[10px] tracking-wide" : "text-[11px] tracking-wider")}>
          <tr>
            {head.map((h) => (
              <th key={h} className={compacto ? "px-2 py-2 leading-tight" : "whitespace-nowrap px-4 py-2.5"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[#141414] [&>tr:hover]:bg-[#1c1c1c] [&>tr]:border-b [&>tr]:border-[#2a2a2a] [&>tr]:transition-colors">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-[#a1a1aa]">{vacio}</p>}
    </div>
  );
}

export const ErpTd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-2.5 text-[#e5e7eb]", className)}>{children}</td>
);

export default ErpTable;
