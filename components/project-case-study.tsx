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
            <Link href="/#featured-products">
              <ArrowLeft className="size-4" />
              Back to featured products
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Badge>{project.statusLabel}</Badge>
            <Badge variant="subtle">{project.productLabel}</Badge>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_340px] lg:items-end">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted-foreground">{project.kicker}</p>
            <h1 className="mt-4 max-w-4xl font-display text-[clamp(2rem,5.5vw,3.75rem)] leading-[0.94] tracking-tight text-foreground">
              {project.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{project.heroStatement}</p>
          </div>

          <div className="surface rounded-[2rem] border border-white/10 p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Project role</p>
            <p className="mt-3 text-sm leading-7 text-foreground/84">{project.role}</p>
            <Separator className="my-6 bg-white/8" />
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Live links</p>
            <div className="mt-4 grid gap-2">
              {project.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between rounded-full border border-white/10 px-4 py-2 text-sm text-foreground/84 transition-colors hover:text-foreground"
                >
                  <span>{link.label}</span>
                  <ArrowUpRight className="size-4" />
                </Link>
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
              <h2 className="mt-2 font-display text-3xl leading-none tracking-tight text-foreground">System design rail</h2>
            </div>
            <Link href="/#contact" className="inline-flex items-center gap-2 text-sm text-foreground hover:text-white">
              Contact
              <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="mt-12 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Reveal className="lg:sticky lg:top-24 lg:h-fit">
          <div className="space-y-4 rounded-[1.7rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Recruiter scan</p>
            {project.recruiterKeywords.map((keyword) => (
              <Badge key={keyword} variant="subtle" className="mr-2 mt-1">
                {keyword}
              </Badge>
            ))}
          </div>
        </Reveal>

        <div className="space-y-6">
          <Reveal className="surface rounded-[2rem] border border-white/10 p-6">
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Product thesis</p>
              <div className="mt-4 space-y-4">
                <p className="max-w-3xl text-base leading-8 text-muted-foreground">{project.problem}</p>
                <p className="max-w-3xl text-base leading-8 text-muted-foreground">{project.summary}</p>
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.04} className="surface rounded-[2rem] border border-white/10 p-6">
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Verified AI capabilities</p>
              <div className="mt-4 grid gap-3">
                {project.verifiedFeatures.map((feature) => (
                  <div key={feature} className="rounded-[1.3rem] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-7 text-foreground/84">
                    {feature}
                  </div>
                ))}
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.08} className="surface rounded-[2rem] border border-white/10 p-6">
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Platform architecture</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.4rem] border border-white/8 bg-black/20 p-5">
                  <p className="eyebrow-label">AI stack</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.aiStack.map((item) => (
                      <Badge key={item} variant="subtle">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/8 bg-black/20 p-5">
                  <p className="eyebrow-label">Platform stack</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.platformStack.map((item) => (
                      <Badge key={item} variant="subtle">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.12} className="surface rounded-[2rem] border border-white/10 p-6">
            <section>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Why it matters</p>
              <div className="mt-4 grid gap-3">
                {project.featuredBullets.map((bullet) => (
                  <div key={bullet} className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-foreground/84">
                    {bullet}
                  </div>
                ))}
              </div>
            </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
