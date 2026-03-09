"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import type { ProjectCaseStudy } from "@/content/site";
import { cn } from "@/lib/utils";

interface HeroProjectPanelProps {
  projects: ProjectCaseStudy[];
}

export function HeroProjectPanel({ projects }: HeroProjectPanelProps) {
  const [activeSlug, setActiveSlug] = useState(projects[0]?.slug);
  const reduceMotion = useReducedMotion();
  const activeProject = projects.find((project) => project.slug === activeSlug) ?? projects[0];

  return (
    <div className="surface relative overflow-hidden rounded-[2rem] border border-white/10 p-4 shadow-panel sm:p-5">
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted-foreground">Signature interaction</p>
          <p className="mt-2 text-sm text-foreground/78">Expand a product to inspect the system behind it.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => {
          const isActive = project.slug === activeProject.slug;
          return (
            <button
              key={project.slug}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveSlug(project.slug)}
              className={cn(
                "group rounded-[1.6rem] border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-white/20 bg-white/[0.08] text-foreground"
                  : "border-white/8 bg-white/[0.03] text-foreground/80 hover:border-white/16 hover:bg-white/[0.05]"
              )}
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{project.kicker}</p>
              <h3 className="mt-3 font-display text-2xl leading-none tracking-tight">{project.shortTitle}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{project.summary}</p>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeProject.slug}
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 rounded-[1.7rem] border border-white/10 bg-black/20 p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                {activeProject.shortTitle} architecture
              </p>
              <h3 className="mt-2 max-w-xl font-display text-3xl leading-none tracking-tight text-foreground">
                {activeProject.heroStatement}
              </h3>
            </div>
            <Link
              href={`/projects/${activeProject.slug}`}
              className="inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-white"
            >
              Open case study
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-3">
            {activeProject.architecture.map((step, index) => (
              <div
                key={`${activeProject.slug}-${step.label}`}
                className="grid gap-3 rounded-[1.4rem] border border-white/8 bg-white/[0.03] p-4 sm:grid-cols-[120px_minmax(0,1fr)]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full border border-white/12 font-mono text-[11px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{step.label}</span>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{step.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
