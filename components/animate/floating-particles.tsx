"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

interface FloatingParticlesProps {
  count?: number;
  className?: string;
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function FloatingParticles({ count = 28, className = "" }: FloatingParticlesProps) {
  const reduceMotion = useReducedMotion();

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: pseudoRandom(i + 1) * 100,
      y: pseudoRandom(i + 101) * 100,
      size: 1 + pseudoRandom(i + 201) * 2,
      duration: 12 + pseudoRandom(i + 301) * 20,
      delay: pseudoRandom(i + 401) * 8,
      opacity: 0.08 + pseudoRandom(i + 501) * 0.18
    }));
  }, [count]);

  if (reduceMotion) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity
          }}
          animate={{
            y: [-20, 20, -20],
            x: [-10, 10, -10],
            opacity: [p.opacity, p.opacity * 1.8, p.opacity]
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}
