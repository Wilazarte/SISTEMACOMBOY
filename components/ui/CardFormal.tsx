import type { ReactNode } from "react";
import { cn } from "@/components/ui";

/** Tarjeta del tema formal: blanco, borde plomo, sombra azul suave y p-6. */
export function CardFormal({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-plomo-200 bg-white p-6 shadow-[0_4px_12px_rgba(15,36,64,0.06)]", className)}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-[12px] font-semibold uppercase tracking-wider text-plomo-500">{title}</h3>}
            {subtitle && <p className="mt-1 text-[13px] text-plomo-600">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Encabezado de página: título serif azul y subtítulo plomo. */
export function PageTitle({ title, subtitle, icon, action }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-3 font-serif text-[36px] font-light leading-tight text-azul-900 lg:text-[42px]">
          {icon}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-plomo-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
