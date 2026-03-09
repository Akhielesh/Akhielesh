"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect, useRef } from "react";

interface CountingNumberProps {
  value: number;
  duration?: number;
  className?: string;
  padStart?: number;
}

export function CountingNumber({ value, duration = 1.6, className, padStart = 2 }: CountingNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (v) =>
    String(Math.round(v)).padStart(padStart, "0")
  );

  useEffect(() => {
    if (!isInView) return;

    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1]
    });

    return controls.stop;
  }, [isInView, motionValue, value, duration]);

  return <motion.span ref={ref} className={className}>{display}</motion.span>;
}
