import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { projectCaseStudies } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function FeaturedAiProducts() {
  return (
    <section id="featured-ai-products" className="border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Featured AI Products"
            title="Serious product case studies, not disconnected demos."
            description="These projects are shown as product systems: problem framing, workflow design, technical structure, and the interface decisions that make the AI layer usable."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {projectCaseStudies.map((project, index) => (
            <Reveal key={project.slug} delay={index * 0.08}>
              <article className="surface flex h-full flex-col rounded-[2rem] border border-white/10 p-6 shadow-panel">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
                      {project.shortTitle}
                    </p>
                    <h3 className="mt-3 font-display text-4xl leading-none tracking-tight text-foreground">
                      {project.title}
                    </h3>
                  </div>
                  <Badge>{project.status}</Badge>
                </div>
                <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">{project.summary}</p>
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">What makes it interesting</p>
                    <ul className="mt-3 space-y-3 text-sm leading-6 text-foreground/84">
                      {project.featuredBullets.map((bullet) => (
                        <li key={bullet} className="border-l border-white/12 pl-4">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Delivery surface</p>
                    <div className="mt-3 flex flex-wrap gap-2">
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
