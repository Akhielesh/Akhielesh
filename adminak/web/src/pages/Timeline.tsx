import { useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, Copy, ExternalLink } from "lucide-react";
import { formatTotals, sumByCurrency } from "@shared/format";
import type { TimelineKind } from "@shared/types";
import { useAutomation, useTimeline } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { copyText } from "../lib/utils";
import { PageHeader } from "../components/layout";
import { KIND_UI, TimelineList } from "../components/timeline";
import { useToast } from "../components/toast";
import { Card, Chip, ChipRow, EmptyState, ExternalA, Segmented, Skeleton, Stat } from "../components/ui";

const RANGES = [
  { value: "14", label: "2 weeks" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "Year" },
];

function CalendarCard() {
  const automation = useAutomation();
  const toast = useToast();
  const data = automation.data;
  if (!data) return <Skeleton className="h-36" />;
  const copy = async () => {
    toast[(await copyText(data.calendarUrl)) ? "success" : "error"]("Calendar link copied — keep it private");
  };
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(data.webcalUrl)}`;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <CalendarPlus className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Put this in your calendar</h2>
          <p className="mt-0.5 text-[13px] text-muted">A private, auto-updating feed with renewals, bills, trips, interviews and deliveries — with reminders before each one.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <a href={data.webcalUrl} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-ink">
          <CalendarClock className="size-4" aria-hidden /> Apple / Outlook
        </a>
        <ExternalA href={google} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-surface-2">
          Google Calendar <ExternalLink className="size-4 text-muted" aria-hidden />
        </ExternalA>
        <button type="button" onClick={() => void copy()} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-surface-2">
          <Copy className="size-4 text-muted" aria-hidden /> Copy link
        </button>
      </div>
      <p className="mt-3 text-[12px] text-muted">Google Calendar needs Adminak to be reachable on the internet. Anyone with the link can read the feed — rotate it in Mailboxes → Automations if it leaks.</p>
    </Card>
  );
}

export function TimelinePage() {
  const fmt = useFmt();
  const [range, setRange] = useState("30");
  const [kind, setKind] = useState<TimelineKind | null>(null);
  const timeline = useTimeline(Number(range));
  const items = timeline.data ?? [];
  const kinds = useMemo(() => {
    const map = new Map<TimelineKind, number>();
    for (const i of items) map.set(i.kind, (map.get(i.kind) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const money = sumByCurrency(
    items.filter((i) => ["renewal", "trial_end", "bill_due"].includes(i.kind)),
    (i) => i.amount,
    (i) => i.currency,
  );
  const week = items.filter((i) => fmt.daysUntil(i.at) <= 7).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Timeline" description="What's coming up across your money and life, pulled from your mail." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Next 7 days" value={week} hint="things scheduled" />
        <Stat label="Charges ahead" value={<span className="tabular">{formatTotals(money, { currency: fmt.currency, whole: true })}</span>} hint={`renewals & bills · ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}`} />
        <Stat label="Trips" value={items.filter((i) => i.kind === "flight" || i.kind === "stay").length} hint="flights & stays" />
        <Stat label="Interviews" value={items.filter((i) => i.kind === "interview" || i.kind === "deadline").length} hint="and assessment deadlines" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented value={range} onChange={setRange} options={RANGES} className="w-full sm:w-auto" />
      </div>
      {kinds.length > 1 ? (
        <ChipRow>
          <Chip active={!kind} onClick={() => setKind(null)} count={items.length}>
            Everything
          </Chip>
          {kinds.map(([k, n]) => {
            const Icon = KIND_UI[k].icon;
            return (
              <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)} count={n}>
                <Icon className="size-3.5" aria-hidden />
                {KIND_UI[k].label}
              </Chip>
            );
          })}
        </ChipRow>
      ) : null}
      {/* overflow-clip, not hidden: hidden would make this the scroll container and break the sticky day headers. */}
      <Card className="overflow-clip">
        {timeline.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : shown.length ? (
          <TimelineList items={shown} />
        ) : (
          <EmptyState icon={CalendarClock} title="Nothing scheduled">
            Renewals, bills, flights, interviews and deliveries appear here as Adminak finds them.
          </EmptyState>
        )}
      </Card>
      <CalendarCard />
    </div>
  );
}
