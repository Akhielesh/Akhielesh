import { backboneItems } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function DataBackboneSection() {
  return (
    <section id="data-backbone" className="section-shell border-b border-white/8">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Reveal variant="soft" className="lg:sticky lg:top-28 lg:h-fit">
          <SectionHeading
            eyebrow="Data Backbone"
            title="The data background sharpens the AI product work instead of sitting beside it."
            description="ETL, analytics, observability, and source modeling are what make retrieval, agent workflows, and product trust hold up once the shiny demo layer is gone."
          />
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          {backboneItems.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.06} variant="pop">
              <article className="panel-shell interactive-panel h-full rounded-[1.8rem] border border-white/10 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <p className="eyebrow-label">{item.title}</p>
                  <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-none tracking-tight text-foreground">{item.value}</h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
