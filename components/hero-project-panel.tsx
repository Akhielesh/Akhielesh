"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

import type { ProjectCaseStudy } from "@/content/site";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HeroProjectPanelProps {
  projects: ProjectCaseStudy[];
}

export function HeroProjectPanel({ projects }: HeroProjectPanelProps) {
  const [activeSlug, setActiveSlug] = useState(projects[0]?.slug);
  const reduceMotion = useReducedMotion();
  const activeProject = projects.find((project) => project.slug === activeSlug) ?? projects[0];
  const supportingSteps = activeProject.architecture.slice(0, 3);
  const surfaceNotes = [
    {
      label: "Status",
      value: activeProject.statusLabel
    },
    {
      label: "Role",
      value: activeProject.role
    },
    {
      label: "AI stack",
      value: activeProject.aiStack.slice(0, 3).join(" / ")
    }
  ];

  return (
    <div className="panel-shell relative overflow-hidden rounded-[2.2rem] border border-white/10 p-4 shadow-panel sm:p-6">
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="absolute -right-12 top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(246,186,116,0.18),_transparent_72%)] blur-3xl" />

      <div className="space-y-5">
        <div>
          <p className="eyebrow-label">Flagship products</p>
          <h2 className="mt-3 max-w-xl font-display text-[clamp(1.8rem,4vw,2.45rem)] leading-none tracking-tight text-foreground">
            Verified products with real AI workflows, platform choices, and recruiter-readable outcomes.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            The homepage stays compact. Each case study opens into product thesis, verified capabilities, platform stack, workflow design, and live links.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {projects.map((project, index) => {
            const isActive = project.slug === activeProject.slug;

            return (
              <motion.button
                key={project.slug}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveSlug(project.slug)}
                whileHover={reduceMotion ? undefined : { y: -3 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "group rounded-[1.45rem] border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "border-white/18 bg-white/[0.08] text-foreground"
                    : "border-white/8 bg-white/[0.03] text-foreground/78 hover:border-white/14 hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{project.productLabel}</p>
                    <h3 className="mt-2 font-display text-[clamp(1.4rem,3vw,1.9rem)] leading-none tracking-tight">{project.shortTitle}</h3>
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{project.summary}</p>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeProject.slug}
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -14 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 rounded-[1.9rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">{activeProject.shortTitle}</Badge>
            <Badge variant="subtle">{activeProject.statusLabel}</Badge>
            <Badge variant="subtle">{activeProject.productLabel}</Badge>
          </div>

          <h3 className="mt-5 max-w-4xl font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-[0.92] tracking-tight text-foreground">
            {activeProject.title}
          </h3>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            {activeProject.heroStatement}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {surfaceNotes.map((item) => (
              <div key={item.label} className="rounded-[1.25rem] border border-white/8 bg-black/20 px-4 py-3">
                <p className="eyebrow-label">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-foreground/84">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {activeProject.recruiterKeywords.map((tag) => (
              <Badge key={tag} variant="subtle">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {supportingSteps.map((step, index) => (
              <motion.div
                key={`${activeProject.slug}-${step.label}`}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.26, delay: 0.06 * index + 0.04, ease: [0.16, 1, 0.3, 1] }
                }
                className="rounded-[1.35rem] border border-white/8 bg-black/20 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] font-mono text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">{step.label}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.summary}</p>
              </motion.div>
            ))}
          </div>

          <Link
            href={`/projects/${activeProject.slug}`}
            className="mt-6 inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-white"
          >
            Open case study
            <ArrowUpRight className="size-4" />
          </Link>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
