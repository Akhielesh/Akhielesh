import { initials } from "@shared/format";
import type { VendorRef } from "@shared/types";
import { cn } from "../lib/utils";

const FALLBACK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

function colorFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length]!;
}

/** Initials in a brand-tinted tile. Text never relies on the tint alone for meaning. */
export function VendorMark({ vendor, name, size = "md", className }: { vendor?: VendorRef | null; name?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const label = vendor?.name ?? name ?? "?";
  const color = vendor?.color ?? colorFor(label);
  const dims = size === "sm" ? "size-8 text-[11px] rounded-[10px]" : size === "lg" ? "size-12 text-[15px] rounded-2xl" : "size-10 text-[13px] rounded-xl";
  return (
    <span
      className={cn("grid shrink-0 place-items-center font-bold tracking-tight text-white", dims, className)}
      style={{ background: `linear-gradient(145deg, ${color}, color-mix(in oklab, ${color} 70%, black))` }}
      aria-hidden
    >
      {initials(label)}
    </span>
  );
}
