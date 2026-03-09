import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
}

export function SectionHeading({ eyebrow, title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl space-y-4", className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">{eyebrow}</p>
      <h2 className="max-w-2xl font-display text-4xl leading-none tracking-tight text-foreground sm:text-5xl">
        {title}
      </h2>
      <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
    </div>
  );
}
