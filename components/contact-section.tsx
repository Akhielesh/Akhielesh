import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";

import { brandTest, contactLinks } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function ContactSection() {
  return (
    <section id="contact" className="section-shell">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Links / Contact"
            title="Close with one clear contact surface and cleaner outbound paths."
            description="The final section should feel like a confident handoff: brand framing on the left, direct routes to public work and contact on the right."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Reveal variant="pop">
            <div className="panel-shell rounded-[2.2rem] border border-white/10 p-6 sm:p-7">
              <Badge className="w-fit">Brand test</Badge>
              <p className="mt-5 max-w-xl font-display text-[clamp(1.5rem,4vw,3rem)] leading-none tracking-tight text-foreground">{brandTest}</p>
              <div className="soft-divider mt-8" />
              <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
                <Mail className="size-4" />
                Public links and live demos are wired in and ready to use.
              </div>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {contactLinks.map((item, index) => (
              <Reveal key={item.label} delay={index * 0.05} variant="pop">
                {item.href ? (
                  <Link
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                    className="panel-shell interactive-panel block rounded-[1.5rem] border border-white/10 p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-medium text-foreground">{item.label}</h3>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                  </Link>
                ) : (
                  <div className="panel-shell rounded-[1.5rem] border border-dashed border-white/12 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-medium text-foreground">{item.label}</h3>
                      <Badge variant="subtle">{item.availability}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
