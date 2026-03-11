"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { projectCaseStudies } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { ShineCard } from "@/components/animate/shine-card";

export function FeaturedAiProducts() {
  return (
    <section id="featured-products" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Featured Products"
            title="Two flagship builds that show AI product judgment, system design, and delivery discipline."
            description="Each case study is grounded in verified product behavior, real stack choices, and the platform tradeoffs behind the interface."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {projectCaseStudies.map((project, index) => (
            <Reveal key={project.slug} delay={index * 0.08} variant="pop">
              <ShineCard className="panel-shell interactive-panel flex h-full flex-col rounded-[2.2rem] border border-white/10 p-6 shadow-panel sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full border border-white/12 bg-black/20 font-mono text-[11px] text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="eyebrow-label">{project.productLabel}</p>
                    </div>
                    <h3 className="mt-4 max-w-xl font-display text-[clamp(1.5rem,4vw,2.8rem)] leading-none tracking-tight text-foreground">
                      {project.title}
                    </h3>
                  </div>
                  <Badge>{project.statusLabel}</Badge>
                </div>

                <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{project.summary}</p>

                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-5">
                    <p className="eyebrow-label">Verified capabilities</p>
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-foreground/84">
                      {project.verifiedFeatures.slice(0, 3).map((feature) => (
                        <li key={feature} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/50" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5">
                    <p className="eyebrow-label">Platform stack</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {project.platformStack.slice(0, 6).map((item) => (
                        <Badge key={item} variant="subtle">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  {project.recruiterKeywords.map((keyword) => (
                    <Badge key={keyword} variant="subtle">
                      {keyword}
                    </Badge>
                  ))}
                </div>

                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href={`/projects/${project.slug}`}
                    className="inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-white"
                  >
                    Read case study
                    <ArrowUpRight className="size-4" />
                  </Link>
                  {project.links
                    .filter((link) => link.label === "Live demo")
                    .map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                        <ArrowUpRight className="size-4" />
                      </Link>
                    ))}
                </div>
              </ShineCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
