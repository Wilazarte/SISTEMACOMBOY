import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/erp-comercial/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-primary/30 bg-primary/15 text-primary",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
      success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
      warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
      danger: "border-rose-500/30 bg-rose-500/15 text-rose-300",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
