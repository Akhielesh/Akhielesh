"use client";

import { motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface TypingTextProps {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
}

export function TypingText({ text, className = "", speed = 35, delay = 300 }: TypingTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    if (!isInView) return;

    let i = 0;
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayText(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
        }
      }, speed);
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [isInView, text, speed, delay]);

  return (
    <span ref={ref} className={className}>
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
        className="inline-block w-[2px] h-[1em] bg-current align-text-bottom ml-0.5"
      />
    </span>
  );
}
