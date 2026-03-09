"use client";

import { motion, useMotionValue, useTransform } from "motion/react";
import { useRef, type PropsWithChildren } from "react";

interface ShineCardProps extends PropsWithChildren {
  className?: string;
}

export function ShineCard({ children, className = "" }: ShineCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const background = useTransform(
    [mouseX, mouseY],
    ([x, y]) =>
      `radial-gradient(320px circle at ${x}px ${y}px, rgba(255,255,255,0.06), transparent 60%)`
  );

  function handleMouseMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }

  return (
    <div ref={ref} className={`relative ${className}`} onMouseMove={handleMouseMove}>
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{ background }}
      />
      {children}
    </div>
  );
}
