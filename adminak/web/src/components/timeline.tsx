import { Link } from "react-router";
import { AlarmClock, Briefcase, CalendarDays, CreditCard, Hotel, Package, Plane, Repeat, Stethoscope, Ticket, type LucideIcon } from "lucide-react";
import type { TimelineItem, TimelineKind } from "@shared/types";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";

export const KIND_UI: Record<TimelineKind, { icon: LucideIcon; label: string }> = {
  renewal: { icon: Repeat, label: "Renewal" },
  trial_end: { icon: AlarmClock, label: "Trial ends" },
  bill_due: { icon: CreditCard, label: "Bill due" },
  delivery: { icon: Package, label: "Delivery" },
  flight: { icon: Plane, label: "Flight" },
  stay: { icon: Hotel, label: "Stay" },
  interview: { icon: Briefcase, label: "Interview" },
  event: { icon: Ticket, label: "Event" },
  appointment: { icon: Stethoscope, label: "Appointment" },
  deadline: { icon: CalendarDays, label: "Deadline" },
};

function dayHeading(iso: string, fmt: ReturnType<typeof useFmt>): string {
  const days = fmt.daysUntil(iso);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return fmt.date(iso, "weekday");
  return fmt.date(iso, "weekday");
}

export function TimelineRow({ item }: { item: TimelineItem }) {
  const fmt = useFmt();
  const ui = KIND_UI[item.kind];
  const urgent = item.severity === "critical" || item.severity === "high";
  const body = (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", urgent ? "bg-high-soft text-high" : "bg-surface-2 text-ink-2")}>
        <ui.icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">{item.title}</span>
        <span className="block truncate text-[12.5px] text-muted">
          {ui.label}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
          {!item.allDay ? ` · ${fmt.date(item.at, "time")}` : ""}
        </span>
      </span>
      {item.amount !== null ? <span className="tabular shrink-0 text-[14px] font-semibold text-ink">{fmt.money(item.amount, item.currency)}</span> : null}
    </div>
  );
  return item.href ? (
    <Link to={item.href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function TimelineList({ items, limit }: { items: TimelineItem[]; limit?: number }) {
  const fmt = useFmt();
  const shown = limit ? items.slice(0, limit) : items;
  const groups: { heading: string; key: string; items: TimelineItem[] }[] = [];
  for (const item of shown) {
    const heading = dayHeading(item.at, fmt);
    const key = heading === "Overdue" ? "overdue" : fmt.date(item.at, "medium");
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ heading, key, items: [item] });
  }
  return (
    <div>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="sticky top-14 z-10 flex items-baseline justify-between border-y border-line bg-surface-3/95 px-4 py-1.5 backdrop-blur sm:px-5 lg:top-16">
            <span className={cn("text-[12px] font-semibold tracking-wide uppercase", g.heading === "Overdue" ? "text-crit" : g.heading === "Today" ? "text-accent" : "text-ink-2")}>{g.heading}</span>
            {g.heading !== "Overdue" ? <span className="text-[11.5px] text-muted">{fmt.date(g.items[0]!.at, "monthDay")}</span> : null}
          </div>
          <div className="divide-y divide-line">
            {g.items.map((item) => (
              <TimelineRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
