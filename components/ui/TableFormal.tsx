import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/** Tabla del tema: cabecera gris clara, filas con hover y borde suave. */
export function TableFormal({ head, children, empty, minWidth = 720, className }: { head: ReactNode[]; children: ReactNode; empty?: boolean; minWidth?: number; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-plomo-200 bg-surface", className)}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-plomo-200 bg-plomo-50 text-[11px] font-medium uppercase tracking-wider text-plomo-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface [&>tr:hover]:bg-plomo-50 [&>tr]:border-b [&>tr]:border-plomo-100 [&>tr]:transition-colors">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-plomo-500">Sin registros</p>}
    </div>
  );
}

export const TdFormal = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-3 text-fg", className)}>{children}</td>
);
