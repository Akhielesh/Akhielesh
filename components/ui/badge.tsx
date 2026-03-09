import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-white/[0.04] text-foreground/88",
        subtle: "border-white/10 bg-white/[0.02] text-muted-foreground",
        accent: "border-white/25 bg-white text-black"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
