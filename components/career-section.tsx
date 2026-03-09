import { careerPhases } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function CareerSection() {
  return (
    <section id="career" className="border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Career"
            title="Compact, outcome-focused, and honest about what is already known."
            description="This phase-based timeline keeps the structure visible now, while leaving room to swap in exact employers, dates, and outcomes later through the content model."
          />
        </Reveal>

        <div className="mt-14 space-y-5">
          {careerPhases.map((phase, index) => (
            <Reveal key={phase.title} delay={index * 0.08}>
              <article className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">{phase.title}</p>
                  <p className="mt-3 font-display text-3xl leading-none tracking-tight text-foreground">{phase.period}</p>
                </div>
                <div>
                  <p className="max-w-3xl text-base leading-7 text-muted-foreground">{phase.summary}</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {phase.outcomes.map((outcome) => (
                      <div key={outcome} className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4 text-sm text-foreground/84">
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
