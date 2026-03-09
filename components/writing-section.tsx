import { upcomingTopics } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function WritingSection() {
  return (
    <section id="writing" className="border-b border-white/8">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Notes & Articles"
            title="Writing soon, but the shape is already intentional."
            description="The content layer is MDX-ready. For v1, the site shows a designed empty state instead of a fake blog archive."
          />
        </Reveal>

        <Reveal delay={0.08} className="mt-14">
          <div className="surface grid gap-10 rounded-[2rem] border border-white/10 p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col justify-between gap-6">
              <div>
                <Badge className="w-fit">Writing soon</Badge>
                <h3 className="mt-5 font-display text-4xl leading-none tracking-tight text-foreground">
                  The writing system is ready before the publishing cadence is.
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
                  Posts will live in local MDX content when they are ready. Until then, the portfolio keeps the section honest and well designed.
                </p>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
                Local content first. No empty archive page. No filler.
              </p>
            </div>
            <div className="grid gap-3">
              {upcomingTopics.map((topic) => (
                <article key={topic.title} className="rounded-[1.3rem] border border-white/8 bg-black/20 p-4">
                  <h4 className="text-base font-medium text-foreground">{topic.title}</h4>
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
