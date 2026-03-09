"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { introTitles, siteName } from "@/content/site";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "akhielesh-entry-seen";
const LETTERS_PHASE_MS = 2000;
const TITLES_START_MS = 2600;
const TITLE_STEP_MS = 1200;
const CONTINUE_AFTER_MS = 4200;
const ENTRY_DURATION_MS = 9600;
const EXIT_DURATION_MS = 420;

export function LandingSequence() {
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<"hidden" | "playing" | "closing">("hidden");
  const [mode, setMode] = useState<"letters" | "titles">("letters");
  const [titleIndex, setTitleIndex] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const letters = useMemo(() => siteName.toUpperCase().split(""), []);
  const hasSeen = mounted ? window.sessionStorage.getItem(STORAGE_KEY) === "1" : false;

  useEffect(() => {
    if (!mounted || reduceMotion || dismissed || hasSeen) {
      return;
    }

    const startTimer = window.setTimeout(() => {
      document.documentElement.style.overflow = "hidden";
      setPhase("playing");
    }, 40);

    return () => {
      window.clearTimeout(startTimer);
      document.documentElement.style.overflow = "";
    };
  }, [dismissed, hasSeen, mounted, reduceMotion]);

  useEffect(() => {
    if (phase !== "playing") {
      return;
    }

    const timers = [
      window.setTimeout(() => setMode("titles"), LETTERS_PHASE_MS),
      ...introTitles.map((_, index) =>
        window.setTimeout(() => {
          setTitleIndex(index);
        }, TITLES_START_MS + index * TITLE_STEP_MS)
      ),
      window.setTimeout(() => setCanContinue(true), CONTINUE_AFTER_MS),
      window.setTimeout(() => setPhase("closing"), ENTRY_DURATION_MS)
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") {
      return;
    }

    const exitTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      document.documentElement.style.overflow = "";
      setCanContinue(false);
      setDismissed(true);
      setPhase("hidden");
    }, EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(exitTimer);
    };
  }, [phase]);

  if (!mounted || reduceMotion || (phase === "hidden" && (dismissed || hasSeen))) {
    return null;
  }

  return (
    <AnimatePresence>
      {phase !== "hidden" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={phase === "closing" ? { opacity: 0 } : { opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_DURATION_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[rgba(10,13,18,0.82)] px-5"
        >
          <div className="absolute inset-0">
            <div className="absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(246,186,116,0.18),_transparent_68%)] blur-3xl" />
            <div className="absolute right-[12%] top-[14%] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(118,183,201,0.16),_transparent_70%)] blur-3xl" />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          </div>

          <div className="panel-shell relative w-full max-w-5xl rounded-[2.6rem] border border-white/10 px-6 py-14 sm:px-10 sm:py-20">
            <div className="mb-6 text-center">
              <p className="eyebrow-label">Entering the studio</p>
            </div>

            <div className="relative min-h-[17.5rem] overflow-hidden">
              {mode === "letters" ? (
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
                  {letters.map((letter, index) => (
                    <motion.span
                      key={`${letter}-${index}`}
                      initial={{ opacity: 0, y: -180, rotate: -8, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                      transition={{ delay: index * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      className="font-display text-[clamp(2.5rem,8vw,6rem)] leading-none tracking-[0.08em] text-foreground"
                    >
                      {letter}
                    </motion.span>
                  ))}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 0.1, scale: 1, y: 0 }}
                    transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 font-display text-[clamp(2.5rem,9vw,7.2rem)] tracking-[0.18em] text-white/10"
                  >
                    {siteName.toUpperCase()}
                  </motion.div>
                  <p className="eyebrow-label">Current lens</p>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={introTitles[titleIndex]}
                      initial={{ opacity: 0, y: 26, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -18, scale: 0.99 }}
                      transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
                      className="mt-6 max-w-3xl font-display text-[clamp(2rem,6vw,4.5rem)] leading-[0.92] tracking-tight text-foreground"
                    >
                      {introTitles[titleIndex]}
                    </motion.div>
                  </AnimatePresence>
                  <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground"
                  >
                    Systems, interfaces, orchestration, and the product judgment that keeps AI work usable once it leaves the demo.
                  </motion.p>
                </div>
              )}
            </div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.72, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-10 max-w-2xl text-center text-sm leading-7 text-muted-foreground sm:text-base"
            >
              A product-minded AI portfolio built around systems, interfaces, and live work that still feels active when the demo tab is closed.
            </motion.p>

            <div className="mx-auto mt-10 max-w-2xl">
              <div className="h-px w-full overflow-hidden rounded-full bg-white/8">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: ENTRY_DURATION_MS / 1000, ease: "linear" }}
                  className="h-full origin-left bg-gradient-to-r from-[#f0b56f] via-white/80 to-[#8ac5cf]"
                />
              </div>

              <div className="mt-5 flex flex-col items-center justify-between gap-4 sm:flex-row">
                <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
                  {canContinue ? "The intro has landed. Continue when ready." : "The sequence is still unfolding. Continue unlocks once the titles settle."}
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={!canContinue}
                  onClick={() => setPhase("closing")}
                  className="pointer-events-auto min-w-[220px] justify-center border-white/14 bg-white/[0.04] disabled:opacity-60"
                >
                  Continue to website
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
