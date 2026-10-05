import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/** Tabla del tema formal: cabecera azul oscuro, texto blanco 11px y filas blancas con borde plomo. */
export function TableFormal({ head, children, empty, minWidth = 720, className }: { head: ReactNode[]; children: ReactNode; empty?: boolean; minWidth?: number; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-plomo-200", className)}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="bg-azul-900 text-[11px] font-semibold uppercase tracking-widest text-white">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white [&>tr]:border-b [&>tr]:border-plomo-100">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-plomo-500">Sin registros</p>}
    </div>
  );
}

export const TdFormal = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn("whitespace-nowrap px-4 py-3 text-azul-900", className)}>{children}</td>
);
