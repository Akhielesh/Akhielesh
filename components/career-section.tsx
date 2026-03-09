import { careerPhases } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function CareerSection() {
  return (
    <section id="career" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Career"
            title="A timeline that reads like compounding system experience, not isolated role bullets."
            description="The layout stays compact, but the framing is cumulative: each phase adds product judgment, data depth, and better intuition for where AI systems break or become usable."
          />
        </Reveal>

        <div className="relative mt-14 space-y-5 before:absolute before:bottom-10 before:left-5 before:top-10 before:w-px before:bg-gradient-to-b before:from-white/20 before:via-white/10 before:to-transparent sm:before:left-6">
          {careerPhases.map((phase, index) => (
            <Reveal key={phase.title} delay={index * 0.08} variant="pop">
              <article className="panel-shell relative grid gap-6 rounded-[2rem] border border-white/10 p-6 pl-14 sm:pl-16 lg:grid-cols-[240px_minmax(0,1fr)]">
                <span className="absolute left-[0.95rem] top-8 flex size-8 items-center justify-center rounded-full border border-white/12 bg-background font-mono text-[10px] text-muted-foreground sm:left-[1.1rem]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="eyebrow-label">{phase.title}</p>
                  <p className="mt-3 font-display text-3xl leading-none tracking-tight text-foreground">{phase.period}</p>
                </div>
                <div>
                  <p className="max-w-3xl text-base leading-7 text-muted-foreground">{phase.summary}</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {phase.outcomes.map((outcome) => (
                      <div
                        key={outcome}
                        className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground/84"
                      >
                        {outcome}
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
