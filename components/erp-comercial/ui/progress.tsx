import { cn } from "@/lib/erp-comercial/utils";

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full bg-primary transition-all duration-300", barClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
