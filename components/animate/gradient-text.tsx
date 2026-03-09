"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  from?: string;
  via?: string;
  to?: string;
}

export function GradientText({
  children,
  className = "",
  from = "#f0b56f",
  via = "#e8d5b7",
  to = "#8ac5cf"
}: GradientTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${via}, ${to})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text"
      }}
      initial={{ opacity: 0, backgroundSize: "200% 200%", backgroundPosition: "0% 50%" }}
      animate={
        isInView
          ? { opacity: 1, backgroundPosition: "100% 50%" }
          : { opacity: 0 }
      }
      transition={{ duration: 2.4, ease: "easeInOut" }}
    >
      {children}
    </motion.span>
  );
}
