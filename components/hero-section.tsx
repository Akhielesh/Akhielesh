"use client";
import { ArrowDownRight, MoveRight, Sparkles } from "lucide-react";

import {
  certificationEntries,
  experienceEntries,
  fullName,
  heroHeadline,
  heroSummary,
  locationLabel,
  projectCaseStudies,
  proofChips,
  roleTitle
} from "@/content/site";
import { Reveal } from "@/components/reveal";
import { HeroProjectPanel } from "@/components/hero-project-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatingParticles } from "@/components/animate/floating-particles";
import { StaggerChildren, StaggerItem } from "@/components/animate/stagger-children";
import { ShineCard } from "@/components/animate/shine-card";

export function HeroSection() {
  const signalCards = [
    { label: "Flagship products", value: String(projectCaseStudies.length).padStart(2, "0") },
    { label: "Career roles", value: String(experienceEntries.length).padStart(2, "0") },
    { label: "Certifications", value: String(certificationEntries.length).padStart(2, "0") }
  ];

  return (
    <section id="hero" className="section-shell relative border-b border-white/8">
      <FloatingParticles count={20} />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(246,186,116,0.22),_transparent_70%)] blur-3xl" />
        <div className="absolute right-[-4rem] top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(118,183,201,0.18),_transparent_72%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 lg:pb-28 lg:pt-16">
        <Reveal variant="soft" className="space-y-8 sm:space-y-10">
          <div className="inline-flex flex-wrap items-center gap-3">
            <Badge variant="accent" className="w-fit">
              {fullName}
            </Badge>
            <Badge variant="subtle" className="w-fit">
              {locationLabel}
            </Badge>
          </div>

          <div className="space-y-5">
            <p className="eyebrow-label">{roleTitle}</p>
            <h1 className="max-w-5xl font-display text-[clamp(2.4rem,7vw,5.6rem)] leading-[0.9] tracking-tight text-foreground">
              {heroHeadline}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">{heroSummary}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="#featured-products">
                Explore Products
                <MoveRight className="size-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#experience">
                View Experience
                <ArrowDownRight className="size-4" />
              </a>
            </Button>
          </div>

          <StaggerChildren className="grid gap-3 sm:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_240px]">
            {signalCards.map((item) => (
              <StaggerItem key={item.label}>
                <ShineCard className="panel-shell rounded-[1.5rem] border border-white/10 p-5">
                  <p className="eyebrow-label">{item.label}</p>
                  <p className="mt-3 font-display text-3xl leading-none tracking-tight text-foreground">{item.value}</p>
                </ShineCard>
              </StaggerItem>
            ))}
            <StaggerItem>
              <ShineCard className="panel-shell rounded-[1.5rem] border border-white/10 p-5 sm:col-span-3 xl:col-span-1">
                <p className="eyebrow-label">Operating lens</p>
                <p className="mt-3 text-sm leading-6 text-foreground/82">
                  AI-first product work backed by Python automation, analytics engineering, and data-platform discipline.
                </p>
              </ShineCard>
            </StaggerItem>
          </StaggerChildren>

          <div className="flex flex-wrap gap-2">
            {proofChips.map((chip, index) => (
              <div
                key={chip}
                className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-foreground/78"
              >
                {index === 0 ? <Sparkles className="size-3.5 text-[#f0b56f]" /> : null}
                <span>{chip}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.08} variant="pop" className="mt-12 lg:mt-16">
          <HeroProjectPanel projects={projectCaseStudies} />
        </Reveal>
      </div>
    </section>
  );
}
