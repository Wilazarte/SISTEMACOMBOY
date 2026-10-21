import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/** Tarjeta del tema: superficie, borde suave, sombra mínima y p-6. */
export function CardFormal({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-plomo-200 bg-surface p-6 shadow-card", className)}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-fg">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[13px] text-plomo-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Encabezado de página: título y subtítulo. */
export function PageTitle({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-3 text-[26px] font-semibold leading-tight tracking-tight text-fg lg:text-[28px]">
          {icon}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-plomo-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
