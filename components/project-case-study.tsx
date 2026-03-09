import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import type { ProjectCaseStudy } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ProjectCaseStudyProps {
  project: ProjectCaseStudy;
}

export function ProjectCaseStudyPage({ project }: ProjectCaseStudyProps) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal className="space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/#featured-ai-products">
              <ArrowLeft className="size-4" />
              Back to featured products
            </Link>
          </Button>
          <Badge>{project.status}</Badge>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_320px] lg:items-end">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted-foreground">{project.kicker}</p>
            <h1 className="mt-4 max-w-4xl font-display text-[clamp(2rem,5.5vw,3.75rem)] leading-[0.94] tracking-tight text-foreground">
              {project.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{project.heroStatement}</p>
          </div>
          <div className="surface rounded-[2rem] border border-white/10 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Stack</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.stack.map((item) => (
                <Badge key={item} variant="subtle">
                  {item}
                </Badge>
              ))}
            </div>
            <Separator className="my-6 bg-white/8" />
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Core outputs</p>
            <div className="mt-4 grid gap-2">
              {project.deliverables.map((deliverable) => (
                <div key={deliverable} className="rounded-full border border-white/10 px-4 py-2 text-sm text-foreground/84">
                  {deliverable}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.08} className="mt-12">
        <div className="surface rounded-[2rem] border border-white/10 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Workflow snapshot</p>
              <h2 className="mt-2 font-display text-3xl leading-none tracking-tight text-foreground">
                Architecture rail
              </h2>
            </div>
            <Link href="/#contact" className="inline-flex items-center gap-2 text-sm text-foreground hover:text-white">
              Discuss this build
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {project.architecture.map((step, index) => (
              <article key={step.label} className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full border border-white/12 font-mono text-[11px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{step.label}</p>
                </div>
                <h3 className="mt-4 text-base font-medium text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.summary}</p>
              </article>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Reveal className="lg:sticky lg:top-24 lg:h-fit">
          <div className="space-y-4 rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Case study structure</p>
            {project.sections.map((section) => (
              <a
                key={section.title}
                href={`#${section.title.toLowerCase().replaceAll("/", "").replaceAll(" ", "-")}`}
                className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {section.title}
              </a>
            ))}
          </div>
        </Reveal>

        <div className="space-y-6">
          {project.sections.map((section, index) => (
            <Reveal
              key={section.title}
              delay={index * 0.04}
              className="surface rounded-[2rem] border border-white/10 p-6"
            >
              <section id={section.title.toLowerCase().replaceAll("/", "").replaceAll(" ", "-")}>
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{section.title}</p>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="max-w-3xl text-base leading-8 text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
