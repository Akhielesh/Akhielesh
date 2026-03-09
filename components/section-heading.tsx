import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
}

export function SectionHeading({ eyebrow, title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-4xl space-y-5", className)}>
      <div className="inline-flex items-center gap-3">
        <span className="h-px w-12 bg-gradient-to-r from-transparent via-white/40 to-white/10" />
        <p className="eyebrow-label">{eyebrow}</p>
      </div>
      <h2 className="max-w-3xl font-display text-4xl leading-[0.96] tracking-tight text-foreground sm:text-5xl lg:text-[3.6rem]">
        {title}
      </h2>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
    </div>
  );
}
