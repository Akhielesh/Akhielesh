// ⚡ Bolt Optimization: Removed "use client" directive to render this component on the server.
// Pushing layout and static text mapping to the server reduces JS bundle size and hydration overhead.
import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";

import { contactLinks, emailAddress, fullName, locationLabel } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { ShineCard } from "@/components/animate/shine-card";
import { FloatingParticles } from "@/components/animate/floating-particles";
import { StaggerChildren, StaggerItem } from "@/components/animate/stagger-children";

export function ContactSection() {
  return (
    <section id="contact" className="section-shell relative">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <Reveal variant="soft">
          <SectionHeading
            eyebrow="Links / Contact"
            title="A clean handoff to public work, live products, and direct contact."
            description="This closing section is intentionally simple: where to find the work, how to verify the products, and how to reach me."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Reveal variant="pop">
            <div className="panel-shell rounded-[2.2rem] border border-white/10 p-6 sm:p-7">
              <Badge className="w-fit">{fullName}</Badge>
              <p className="mt-5 max-w-xl font-display text-[clamp(1.5rem,4vw,3rem)] leading-none tracking-tight text-foreground">
                AI product engineering, Python automation, and data-backed systems built from Fairfax, VA.
              </p>
              <div className="soft-divider mt-8" />
              <div className="mt-8 space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <Mail className="size-4" />
                  <span>{emailAddress}</span>
                </div>
                <div>{locationLabel}</div>
              </div>
            </div>
          </Reveal>

          <StaggerChildren className="grid gap-3 sm:grid-cols-2">
            {contactLinks.map((item) => (
              <StaggerItem key={item.label}>
                {item.href ? (
                  <ShineCard className="panel-shell interactive-panel gradient-border block rounded-[1.5rem] border border-white/10 p-5">
                    <Link
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                      className="block"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-lg font-medium text-foreground">{item.label}</h3>
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                    </Link>
                  </ShineCard>
                ) : (
                  <div className="panel-shell rounded-[1.5rem] border border-dashed border-white/12 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-medium text-foreground">{item.label}</h3>
                      <Badge variant="subtle">{item.availability}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.note}</p>
                  </div>
                )}
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>
      </div>
    </section>
  );
}
