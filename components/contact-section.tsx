import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";

import { brandTest, contactLinks } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";

export function ContactSection() {
  return (
    <section id="contact">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Links / Contact"
            title="Clean contact structure now, real endpoints later."
            description="The content model is already wired for LinkedIn, GitHub, resume, demos, and direct contact. Missing links are shown honestly instead of rendered as broken calls to action."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Reveal>
            <div className="surface rounded-[2rem] border border-white/10 p-6">
              <Badge className="w-fit">Brand test</Badge>
              <p className="mt-5 max-w-xl font-display text-4xl leading-none tracking-tight text-foreground">{brandTest}</p>
              <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
                <Mail className="size-4" />
                Ready to plug in public links and a direct contact route.
              </div>
            </div>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {contactLinks.map((item, index) => (
              <Reveal key={item.label} delay={index * 0.05}>
                {item.href ? (
                  <Link href={item.href} className="surface block rounded-[1.5rem] border border-white/10 p-5 transition-colors hover:border-white/25">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-medium text-foreground">{item.label}</h3>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                  </Link>
                ) : (
                  <div className="surface rounded-[1.5rem] border border-dashed border-white/12 p-5">
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
