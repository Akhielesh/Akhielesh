"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, type PropsWithChildren } from "react";

interface StaggerChildrenProps extends PropsWithChildren {
  className?: string;
  stagger?: number;
  once?: boolean;
}

const container = {
  hidden: {},
  show: (stagger: number) => ({
    transition: {
      staggerChildren: stagger
    }
  })
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }
  }
};

export function StaggerChildren({ children, className, stagger = 0.08, once = true }: StaggerChildrenProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once, amount: 0.15 });
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={container}
      initial="hidden"
      animate={isInView ? "show" : "hidden"}
      custom={stagger}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
