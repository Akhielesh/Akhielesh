"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PropsWithChildren } from "react";

interface RevealProps extends PropsWithChildren {
  className?: string;
  delay?: number;
  offset?: number;
}

export function Reveal({ children, className, delay = 0, offset = 28 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
