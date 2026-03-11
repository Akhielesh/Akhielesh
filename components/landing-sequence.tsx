"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { introTitles, siteName } from "@/content/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "akhielesh-entry-seen-v5";
const LETTERS_PHASE_MS = 2200;
const TITLES_START_MS = 2800;
const TITLE_STEP_MS = 1400;
const NOTE_START_MS = TITLES_START_MS + introTitles.length * TITLE_STEP_MS + 500;
const CONTINUE_AFTER_MS = NOTE_START_MS + 2200;
const TIMELINE_DURATION_MS = CONTINUE_AFTER_MS + 2600;
const EXIT_DURATION_MS = 420;
const BUILD_NOTE = "I love building applications and solutions. It's always human-led and AI-powered.";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function LandingSequence() {
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<"hidden" | "playing" | "closing">("hidden");
  const [timelineMs, setTimelineMs] = useState(0);
  const [allowTimelineScrub, setAllowTimelineScrub] = useState(false);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const letters = useMemo(() => siteName.toUpperCase().split(""), []);
  const hasSeen = mounted ? window.sessionStorage.getItem(STORAGE_KEY) === "1" : false;
  const rafRef = useRef<number | null>(null);
  const playbackAnchorRef = useRef<number | null>(null);
  const playbackOffsetRef = useRef(0);
  const timelineRef = useRef(0);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);

  const mode = timelineMs < LETTERS_PHASE_MS ? "letters" : "titles";
  const titleIndex =
    timelineMs < TITLES_START_MS
      ? 0
      : Math.min(introTitles.length - 1, Math.floor((timelineMs - TITLES_START_MS) / TITLE_STEP_MS));
  const showBuildNote = timelineMs >= NOTE_START_MS;
  const canContinue = timelineMs >= CONTINUE_AFTER_MS;
  const progress = clamp(timelineMs / TIMELINE_DURATION_MS, 0, 1);
  const timelineLabels = [
    { label: "Entry", at: LETTERS_PHASE_MS / TIMELINE_DURATION_MS },
    { label: "AI lens", at: TITLES_START_MS / TIMELINE_DURATION_MS },
    { label: "Build note", at: NOTE_START_MS / TIMELINE_DURATION_MS },
    { label: "Handoff", at: CONTINUE_AFTER_MS / TIMELINE_DURATION_MS }
  ];
  const timelineStatus = isScrubbing
    ? "Scrubbing the intro timeline. Release to let it play forward again."
    : isTimelineHovered
      ? "Timeline unlocked. Drag the line to revisit the AI sequence."
      : canContinue
        ? "The sequence has landed. Continue when ready."
        : "The AI intro is still unfolding. Continue unlocks once the build note lands.";

  const updateTimeline = (nextValue: number) => {
    const clamped = clamp(nextValue, 0, TIMELINE_DURATION_MS);
    timelineRef.current = clamped;
    setTimelineMs(clamped);
  };

  const updateTimelineFromClientX = (clientX: number) => {
    if (!timelineTrackRef.current) {
      return;
    }

    const rect = timelineTrackRef.current.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    updateTimeline(ratio * TIMELINE_DURATION_MS);
  };

  const setBackgroundLocked = (locked: boolean) => {
    document.documentElement.style.overflow = locked ? "hidden" : "";
    document.body.style.overflow = locked ? "hidden" : "";
  };

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateScrubMode = () => setAllowTimelineScrub(mediaQuery.matches);

    updateScrubMode();
    mediaQuery.addEventListener("change", updateScrubMode);

    return () => {
      mediaQuery.removeEventListener("change", updateScrubMode);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || reduceMotion || dismissed || hasSeen) {
      return;
    }

    const startTimer = window.setTimeout(() => {
      const shouldLockBackground = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

      setBackgroundLocked(shouldLockBackground);
      playbackAnchorRef.current = performance.now();
      playbackOffsetRef.current = 0;
      timelineRef.current = 0;
      setTimelineMs(0);
      setIsTimelineHovered(false);
      setIsScrubbing(false);
      setPhase("playing");
    }, 40);

    return () => {
      window.clearTimeout(startTimer);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      setBackgroundLocked(false);
    };
  }, [dismissed, hasSeen, mounted, reduceMotion]);

  useEffect(() => {
    if (phase !== "playing" || isScrubbing || timelineRef.current >= TIMELINE_DURATION_MS) {
      return;
    }

    playbackAnchorRef.current = performance.now();
    playbackOffsetRef.current = timelineRef.current;

    const step = (now: number) => {
      if (playbackAnchorRef.current === null) {
        return;
      }

      const elapsed = now - playbackAnchorRef.current;
      const nextValue = playbackOffsetRef.current + elapsed;

      if (nextValue >= TIMELINE_DURATION_MS) {
        updateTimeline(TIMELINE_DURATION_MS);
        rafRef.current = null;
        playbackAnchorRef.current = null;
        return;
      }

      updateTimeline(nextValue);
      rafRef.current = window.requestAnimationFrame(step);
    };

    rafRef.current = window.requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = null;
      playbackAnchorRef.current = null;
    };
  }, [isScrubbing, phase]);

  useEffect(() => {
    if (phase !== "closing") {
      return;
    }

    const exitTimer = window.setTimeout(() => {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      setBackgroundLocked(false);
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
          data-intro-overlay
          initial={{ opacity: 0 }}
          animate={phase === "closing" ? { opacity: 0 } : { opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_DURATION_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[90] flex touch-pan-y items-start justify-center overflow-y-auto overflow-x-hidden bg-[hsl(220_18%_6%/0.97)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] overscroll-y-contain [-webkit-overflow-scrolling:touch] sm:items-center sm:px-5"
        >
          <div className="absolute inset-0">
            <div className="absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(246,186,116,0.18),_transparent_68%)] blur-3xl" />
            <div className="absolute right-[12%] top-[14%] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(118,183,201,0.16),_transparent_70%)] blur-3xl" />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
          </div>

          <div className="relative my-auto w-full max-w-5xl self-start rounded-[2.35rem] border border-white/[0.12] bg-[hsl(220_18%_8%/0.95)] px-5 py-10 shadow-[0_30px_110px_-54px_rgba(0,0,0,0.82)] backdrop-blur-2xl sm:self-auto sm:rounded-[2.6rem] sm:px-10 sm:py-20">
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
                      data-intro-title
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
                    className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground"
                  >
                    AI systems deserve real product thinking, clear operator control, and interfaces that still feel serious after the demo.
                  </motion.p>

                  <AnimatePresence>
                    {showBuildNote ? (
                      <motion.div
                        data-intro-build-note
                        key="build-note"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -18, scale: 0.98 }}
                        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-8 w-full max-w-3xl rounded-[1.8rem] border border-white/[0.12] bg-white/[0.04] px-5 py-5 shadow-[0_28px_80px_-46px_rgba(0,0,0,0.92)] backdrop-blur-xl"
                      >
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <span className="eyebrow-label">Build note</span>
                          <span className="rounded-full border border-[#f0b56f]/30 bg-[#f0b56f]/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#f6d3a2]">
                            Human-led
                          </span>
                          <span className="rounded-full border border-[#8ac5cf]/30 bg-[#8ac5cf]/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#b7e0e6]">
                            AI-powered
                          </span>
                        </div>

                        <p className="mt-4 font-display text-[clamp(1.45rem,3vw,2.5rem)] leading-[1.02] tracking-tight text-foreground">
                          I love building applications and solutions.
                        </p>
                        <p className="mt-3 text-sm leading-7 text-foreground/80 sm:text-base">
                          It&apos;s always <span className="text-[#f6d3a2]">human-led</span> and{" "}
                          <span className="text-[#b7e0e6]">AI-powered</span>.
                        </p>
                        <p className="mt-4 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                          {BUILD_NOTE}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.72, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-10 max-w-2xl text-center text-sm leading-7 text-muted-foreground sm:text-base"
            >
              A product-minded AI portfolio built around applications, workflow systems, and live product work that still feels active when the demo tab is closed.
            </motion.p>

            <div className="mx-auto mt-10 max-w-2xl">
              <div
                className="group"
                onPointerEnter={() => {
                  if (allowTimelineScrub) {
                    setIsTimelineHovered(true);
                  }
                }}
                onPointerLeave={() => setIsTimelineHovered(false)}
              >
                <div
                  ref={timelineTrackRef}
                  data-intro-timeline-track
                  onPointerDown={(event) => {
                    if (!allowTimelineScrub) {
                      return;
                    }

                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setIsScrubbing(true);
                    updateTimelineFromClientX(event.clientX);
                  }}
                  onPointerMove={(event) => {
                    if (!isScrubbing) {
                      return;
                    }

                    updateTimelineFromClientX(event.clientX);
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }

                    playbackOffsetRef.current = timelineRef.current;
                    setIsScrubbing(false);
                  }}
                  onPointerCancel={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }

                    playbackOffsetRef.current = timelineRef.current;
                    setIsScrubbing(false);
                  }}
                  className={cn(
                    "relative h-8 transition-all duration-300",
                    allowTimelineScrub ? "touch-pan-y" : "pointer-events-none",
                    isTimelineHovered || isScrubbing ? "cursor-grab" : "cursor-default"
                  )}
                >
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full bg-white/10" />
                  <div
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#f0b56f] via-white/80 to-[#8ac5cf] shadow-[0_0_18px_rgba(240,181,111,0.22)] transition-all duration-300",
                      isTimelineHovered || isScrubbing ? "h-[3px]" : "h-[2px]"
                    )}
                    style={{ width: `${progress * 100}%` }}
                  />
                  <motion.div
                    animate={{
                      opacity: isTimelineHovered || isScrubbing ? 1 : 0.4,
                      height: isTimelineHovered || isScrubbing ? 18 : 12
                    }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute top-1/2 w-px -translate-y-1/2 bg-gradient-to-b from-[#f0b56f] via-white to-[#8ac5cf] shadow-[0_0_18px_rgba(138,197,207,0.24)]"
                    style={{ left: `${progress * 100}%` }}
                  />
                </div>

                <AnimatePresence>
                  {allowTimelineScrub && (isTimelineHovered || isScrubbing) ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{timelineStatus}</p>
                      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                        {timelineLabels.map((item) => (
                          <span
                            key={item.label}
                            className={cn(
                              "rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] transition-colors duration-300",
                              progress >= item.at
                                ? "border-white/14 bg-white/[0.08] text-foreground/82"
                                : "border-white/[0.08] bg-transparent text-muted-foreground"
                            )}
                          >
                            {item.label}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="mt-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <p data-intro-status className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
                  {timelineStatus}
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={!canContinue}
                  onClick={() => setPhase("closing")}
                  className="pointer-events-auto min-w-full justify-center border-white/14 bg-white/[0.04] disabled:opacity-60 sm:min-w-[220px]"
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
