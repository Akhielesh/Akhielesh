import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { projectCaseStudies } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function FeaturedAiProducts() {
  return (
    <section id="featured-ai-products" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Featured AI Products"
            title="Case studies presented as systems with interface taste, not prompt demos in disguise."
            description="Each product is framed around workflow, trust, orchestration, and UI structure. The goal is to show how the AI layer becomes understandable and useful once the surrounding product is designed well."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {projectCaseStudies.map((project, index) => (
            <Reveal key={project.slug} delay={index * 0.08} variant="pop">
              <article className="panel-shell interactive-panel flex h-full flex-col rounded-[2.2rem] border border-white/10 p-6 shadow-panel sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full border border-white/12 bg-black/20 font-mono text-[11px] text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="eyebrow-label">{project.shortTitle}</p>
                    </div>
                    <h3 className="mt-4 max-w-xl font-display text-4xl leading-none tracking-tight text-foreground sm:text-[2.8rem]">
                      {project.title}
                    </h3>
                  </div>
                  <Badge>{project.status}</Badge>
                </div>
                <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{project.summary}</p>

                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-white/8 bg-black/15 p-5">
                    <p className="eyebrow-label">Why it works</p>
                    <ul className="mt-4 space-y-3 text-sm leading-6 text-foreground/84">
                      {project.featuredBullets.map((bullet) => (
                        <li key={bullet} className="flex gap-3">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/50" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-5">
                    <p className="eyebrow-label">Delivery surface</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {project.deliverables.map((item) => (
                        <Badge key={item} variant="subtle">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <Badge key={tag} variant="subtle">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <Link
                  href={`/projects/${project.slug}`}
                  className="mt-9 inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-white"
                >
                  Read case study
                  <ArrowUpRight className="size-4" />
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
