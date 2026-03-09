import { backboneItems } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function DataBackboneSection() {
  return (
    <section id="data-backbone" className="border-b border-white/8">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Reveal>
          <SectionHeading
            eyebrow="Data Backbone"
            title="The data systems background is part of the edge, not a side note."
            description="Azure, Databricks, ETL, BI, dashboards, profiling, metadata, and lineage work strengthen the ability to build AI products that are observable, trustworthy, and useful."
          />
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          {backboneItems.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.06}>
              <article className="surface h-full rounded-[1.7rem] border border-white/10 p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{item.title}</p>
                <h3 className="mt-3 font-display text-3xl leading-none tracking-tight text-foreground">{item.value}</h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
