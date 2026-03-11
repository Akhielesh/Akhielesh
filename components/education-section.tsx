import { certificationEntries, educationEntries } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function EducationSection() {
  return (
    <section id="education" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Education & Certifications"
            title="Academic foundation and certifications aligned to cloud, analytics, and machine learning."
            description="Graduation years are intentionally omitted. The emphasis stays on the credentials that support product, data, and AI-facing work."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <Reveal variant="pop">
            <div className="panel-shell rounded-[2rem] border border-white/10 p-6 sm:p-7">
              <p className="eyebrow-label">Education</p>
              <div className="mt-6 space-y-4">
                {educationEntries.map((entry) => (
                  <article key={`${entry.institution}-${entry.credential}`} className="rounded-[1.4rem] border border-white/8 bg-black/20 p-5">
                    <h3 className="font-display text-[clamp(1.35rem,3vw,1.8rem)] leading-none tracking-tight text-foreground">
                      {entry.credential}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-foreground/84">{entry.institution}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.location}</p>
                  </article>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08} variant="pop">
            <div className="panel-shell rounded-[2rem] border border-white/10 p-6 sm:p-7">
              <p className="eyebrow-label">Certifications</p>
              <div className="mt-6 grid gap-3">
                {certificationEntries.map((entry) => (
                  <article key={entry.title} className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                    <Badge variant="subtle" className="w-fit">
                      {entry.issuer}
                    </Badge>
                    <h3 className="mt-4 text-base font-medium text-foreground">{entry.title}</h3>
                  </article>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
