"use client";

import { motion, useReducedMotion } from "motion/react";
import { useSyncExternalStore, type PropsWithChildren } from "react";

interface RevealProps extends PropsWithChildren {
  className?: string;
  delay?: number;
  distance?: number;
  amount?: number;
  once?: boolean;
  variant?: "rise" | "soft" | "pop";
}

export function Reveal({
  children,
  className,
  delay = 0,
  distance = 28,
  amount = 0.2,
  once = true,
  variant = "rise"
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  if (reduceMotion || !mounted) {
    return <div className={className}>{children}</div>;
  }

  const initial =
    variant === "soft"
      ? { opacity: 0, y: distance * 0.6 }
      : variant === "pop"
        ? { opacity: 0, y: distance, scale: 0.985 }
        : { opacity: 0, y: distance };

  const animate = variant === "pop" ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      className={className}
      initial={initial}
      whileInView={animate}
      viewport={{ once, amount }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
