import { upcomingTopics } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function WritingSection() {
  return (
    <section id="writing" className="section-shell border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Notes & Articles"
            title="The writing area now reads like an intentional editorial lane instead of a placeholder block."
            description="It signals the upcoming writing system without faking volume. The layout uses one strong lead note and a queue of future topics so the empty state still feels designed."
          />
        </Reveal>

        <Reveal delay={0.08} variant="pop" className="mt-14">
          <div className="panel-shell grid gap-10 rounded-[2.2rem] border border-white/10 p-6 sm:p-7 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <div className="flex flex-col justify-between gap-6">
              <div>
                <Badge className="w-fit">Writing soon</Badge>
                <h3 className="mt-5 font-display text-4xl leading-none tracking-tight text-foreground sm:text-[3rem]">
                  The publishing cadence comes later. The editorial system is already in place.
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                  Posts will live in local MDX once they are ready. Until then, the section behaves like a designed notes board rather
                  than an empty archive pretending to be active.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                <p className="eyebrow-label">Editorial stance</p>
                <p className="mt-3 text-sm leading-7 text-foreground/80">
                  Local content first. No auto-generated archive. No filler. Each note should earn its place with a clear takeaway.
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              {upcomingTopics.map((topic, index) => (
                <article key={topic.title} className="interactive-panel rounded-[1.3rem] border border-white/8 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="text-base font-medium text-foreground">{topic.title}</h4>
                    <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
