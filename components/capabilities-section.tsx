import { capabilityGroups } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function CapabilitiesSection() {
  return (
    <section id="systems-capabilities" className="border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Systems / Capabilities"
            title="AI-first systems thinking, grounded in shipped product behavior."
            description="The throughline is practical: agents, tool calling, connectors, orchestration, deployment, and interfaces that make AI capabilities legible to users."
          />
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-12">
          {capabilityGroups.map((group, index) => (
            <Reveal
              key={group.title}
              delay={index * 0.08}
              className={index === 0 ? "lg:col-span-7" : index === 3 ? "lg:col-span-7" : "lg:col-span-5"}
            >
              <article className="surface h-full rounded-[2rem] border border-white/10 p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">{group.eyebrow}</p>
                <h3 className="mt-4 max-w-xl font-display text-3xl leading-none tracking-tight text-foreground">
                  {group.title}
                </h3>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{group.description}</p>
                <ul className="mt-8 grid gap-3">
                  {group.bullets.map((bullet) => (
                    <li key={bullet} className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-foreground/84">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
