import { experienceEntries } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function CareerSection() {
  return (
    <section id="experience" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Experience"
            title="Role-based experience built on automation, reporting systems, and data-platform execution."
            description="Each role adds evidence of measurable delivery: pipeline design, dashboard systems, workflow automation, and stakeholder-facing analytics."
          />
        </Reveal>

        <div className="relative mt-14 space-y-5 before:absolute before:bottom-10 before:left-5 before:top-10 before:w-px before:bg-gradient-to-b before:from-white/20 before:via-white/10 before:to-transparent sm:before:left-6">
          {experienceEntries.map((entry, index) => (
            <Reveal key={`${entry.company}-${entry.role}`} delay={index * 0.08} variant="pop">
              <article className="panel-shell relative grid gap-6 rounded-[2rem] border border-white/10 p-6 pl-14 sm:pl-16 lg:grid-cols-[300px_minmax(0,1fr)]">
                <span className="absolute left-[0.95rem] top-8 flex size-8 items-center justify-center rounded-full border border-white/12 bg-background font-mono text-[10px] text-muted-foreground sm:left-[1.1rem]">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div>
                  <p className="eyebrow-label">{entry.company}</p>
                  <h3 className="mt-3 font-display text-[clamp(1.4rem,3.5vw,2rem)] leading-none tracking-tight text-foreground">
                    {entry.role}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{entry.location}</p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.26em] text-muted-foreground">{entry.period}</p>
                </div>

                <div>
                  <p className="max-w-3xl text-base leading-7 text-muted-foreground">{entry.summary}</p>
                  <div className="mt-6 grid gap-3">
                    {entry.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-foreground/84"
                      >
                        {bullet}
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
