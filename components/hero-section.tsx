import Link from "next/link";
import { ArrowDownRight, MoveRight } from "lucide-react";

import { proofChips, projectCaseStudies, roleSubtitle, roleTitle, siteName } from "@/content/site";
import { Reveal } from "@/components/reveal";
import { HeroProjectPanel } from "@/components/hero-project-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section id="hero" className="relative border-b border-white/8">
      <div className="mx-auto grid max-w-7xl gap-16 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)] lg:items-center lg:py-24">
        <Reveal className="space-y-8">
          <div className="space-y-5">
            <Badge variant="subtle" className="w-fit">
              {siteName}
            </Badge>
            <div className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted-foreground">{roleTitle}</p>
              <h1 className="max-w-3xl font-display text-6xl leading-[0.92] tracking-tight text-foreground sm:text-7xl lg:text-[5.25rem]">
                I build AI products that turn complex workflows into usable systems.
              </h1>
            </div>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{roleSubtitle}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="#featured-ai-products">
                Explore AI Products
                <MoveRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#contact">
                Get in Touch
                <ArrowDownRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {proofChips.map((chip) => (
              <Badge key={chip} className="rounded-full">
                {chip}
              </Badge>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <HeroProjectPanel projects={projectCaseStudies} />
        </Reveal>
      </div>
    </section>
  );
}
