import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, CircleAlert, Info, Loader2, OctagonAlert, type LucideIcon } from "lucide-react";
import type { Severity } from "@shared/types";
import { cn } from "../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-ink hover:opacity-90 active:opacity-80",
  secondary: "bg-surface-2 text-ink hover:bg-surface-2/70 border border-line",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-crit-soft text-crit hover:bg-crit/15 border border-crit/20",
  accent: "bg-accent text-accent-ink hover:opacity-90",
  outline: "border border-line-strong text-ink hover:bg-surface-2",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon: Icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background,opacity,color] select-none disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cn("card", className)}>{children}</As>;
}

export function CardHeader({ title, eyebrow, action, className, icon: Icon }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {Icon ? <Icon className="size-4 text-muted" aria-hidden /> : null}
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent" | "high";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-med-soft text-med border-transparent",
  bad: "bg-crit-soft text-crit border-transparent",
  info: "bg-low-soft text-low border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
  high: "bg-high-soft text-high border-transparent",
};

export function Badge({ tone = "neutral", children, className, icon: Icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", toneClass[tone], className)}>
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

export const SEVERITY_UI: Record<Severity, { label: string; tone: Tone; icon: LucideIcon; dot: string; text: string; soft: string }> = {
  critical: { label: "Critical", tone: "bad", icon: OctagonAlert, dot: "bg-crit", text: "text-crit", soft: "bg-crit-soft" },
  high: { label: "High", tone: "high", icon: AlertTriangle, dot: "bg-high", text: "text-high", soft: "bg-high-soft" },
  medium: { label: "Medium", tone: "warn", icon: CircleAlert, dot: "bg-med", text: "text-med", soft: "bg-med-soft" },
  low: { label: "Low", tone: "info", icon: Info, dot: "bg-low", text: "text-low", soft: "bg-low-soft" },
  info: { label: "Info", tone: "neutral", icon: Info, dot: "bg-muted", text: "text-muted", soft: "bg-surface-2" },
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY_UI[severity];
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {s.label}
    </Badge>
  );
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY_UI[severity];
  const Icon = s.icon;
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", s.soft, s.text, className)} aria-label={s.label} role="img">
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

export function Chip({ active, onClick, children, count, className }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
        active ? "border-transparent bg-primary text-primary-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
        className,
      )}
    >
      {children}
      {count !== undefined ? <span className={cn("tabular text-[11px]", active ? "opacity-70" : "text-muted")}>{count}</span> : null}
    </button>
  );
}

export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0", className)}>{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12.5px] text-crit">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("field", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("field min-h-24 py-2.5", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn("field appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "var(--select-arrow)" }} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      {label ? (
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium text-ink">{label}</span>
          {description ? <span className="mt-0.5 block text-[12.5px] text-muted">{description}</span> : null}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-good" : "bg-line-strong")}
      >
        <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-xl border border-line bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined ? <span className="tabular text-[11px] text-muted">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "bad" | "warn" | "neutral";
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("card flex min-w-0 flex-col items-start p-4 text-left", onClick && "transition-colors hover:border-line-strong", className)}>
      <div className="flex w-full items-center justify-between gap-2">
        <span className="eyebrow truncate">{label}</span>
        {Icon ? <Icon className="size-4 shrink-0 text-muted" aria-hidden /> : null}
      </div>
      <div className="mt-2 truncate text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[26px]">{value}</div>
      {hint ? (
        <div className={cn("mt-1 text-[12.5px]", tone === "good" ? "text-good" : tone === "bad" ? "text-crit" : tone === "warn" ? "text-med" : "text-muted")}>{hint}</div>
      ) : null}
    </Comp>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children ? <div className="mt-1 max-w-sm text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-series transition-[width] duration-500" style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3 px-1", className)}>
      <h3 className="eyebrow">{children}</h3>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function ExternalA({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
