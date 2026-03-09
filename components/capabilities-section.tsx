import { capabilityGroups } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";

export function CapabilitiesSection() {
  return (
    <section id="systems-capabilities" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Systems / Capabilities"
            title="Capability areas arranged like a product operating map, not a generic skills grid."
            description="The emphasis stays on what changes product behavior: orchestration, tool use, interface framing, deployment decisions, and the data plumbing that keeps AI trustworthy once it ships."
          />
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-12">
          {capabilityGroups.map((group, index) => (
            <Reveal
              key={group.title}
              delay={index * 0.08}
              variant="pop"
              className={index === 0 ? "lg:col-span-7" : index === 3 ? "lg:col-span-7" : "lg:col-span-5"}
            >
              <article className="panel-shell interactive-panel h-full rounded-[2rem] border border-white/10 p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <p className="eyebrow-label">{group.eyebrow}</p>
                  <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/20 font-mono text-[11px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 max-w-xl font-display text-3xl leading-none tracking-tight text-foreground sm:text-[2.35rem]">
                  {group.title}
                </h3>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{group.description}</p>

                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {group.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="rounded-[1.3rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-foreground/84"
                    >
                      <span className="mb-3 block h-px w-10 bg-gradient-to-r from-white/45 to-transparent" />
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
