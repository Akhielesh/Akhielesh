import { impactMetrics } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function ImpactSection() {
  return (
    <section id="impact" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Selected Impact"
            title="Measured outcomes from automation, reporting, and data-platform delivery."
            description="These numbers come directly from resume-backed work across PMO reporting, profiling automation, data quality frameworks, and IT portfolio analytics."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {impactMetrics.map((metric, index) => (
            <Reveal key={`${metric.value}-${metric.label}`} delay={index * 0.04} variant="pop">
              <article className="panel-shell interactive-panel h-full rounded-[1.8rem] border border-white/10 p-5 sm:p-6">
                <p className="eyebrow-label">{metric.label}</p>
                <p className="mt-4 font-display text-[clamp(2rem,5vw,3rem)] leading-none tracking-tight text-foreground">
                  {metric.value}
                </p>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{metric.context}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
