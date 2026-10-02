import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Briefcase, CalendarClock, ChevronDown, ExternalLink, HeartPulse, History, Package, Plane, ShieldCheck, type LucideIcon } from "lucide-react";
import type { DomainDTO, InsightDTO, InsightGroup } from "@shared/types";
import { errorMessage, patch } from "../lib/api";
import { useDomain } from "../lib/queries";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { InsightRow, INSIGHT_STATUS, StatusBadge, insightIcon } from "../components/insight";
import { PageHeader } from "../components/layout";
import { MessageSheet } from "../components/message";
import { useToast } from "../components/toast";
import { Button, Card, CardHeader, Chip, ChipRow, EmptyState, ExternalA, Select, Skeleton, Stat } from "../components/ui";
import { VendorMark } from "../components/vendor";

type Domain = "career" | "orders" | "travel" | "security" | "life";

const CONFIG: Record<Domain, { title: string; description: string; icon: LucideIcon; groups: string; upcoming: string; empty: string; archivable: boolean }> = {
  career: {
    title: "Career",
    description: "Every application, recruiter message, assessment, interview and offer — organized into a pipeline by company.",
    icon: Briefcase,
    groups: "Pipeline",
    upcoming: "Interviews & deadlines",
    empty: "Applications, interview invites and offers show up here once they hit your inbox.",
    archivable: true,
  },
  orders: {
    title: "Orders",
    description: "Purchases, shipments and deliveries with tracking, grouped by order.",
    icon: Package,
    groups: "Orders",
    upcoming: "Arriving",
    empty: "Order confirmations and shipping updates will be tracked here.",
    archivable: true,
  },
  travel: {
    title: "Travel",
    description: "Flights, stays, rentals and rides with confirmation numbers and changes.",
    icon: Plane,
    groups: "Bookings",
    upcoming: "Upcoming",
    empty: "Flight and hotel confirmations will build your itinerary here.",
    archivable: true,
  },
  security: {
    title: "Security",
    description: "Sign-ins, password and 2FA changes, breach notices and suspicious activity across your accounts.",
    icon: ShieldCheck,
    groups: "Accounts",
    upcoming: "",
    empty: "Security notices from your accounts will be logged here.",
    archivable: false,
  },
  life: {
    title: "People & events",
    description: "Invitations, tickets, reservations, appointments and the real people writing to you.",
    icon: HeartPulse,
    groups: "People",
    upcoming: "Coming up",
    empty: "Events, appointments and personal emails appear here.",
    archivable: true,
  },
};

const CAREER_FILTERS: { value: string; label: string; statuses: string[] }[] = [
  { value: "active", label: "In progress", statuses: ["applied", "in_review", "assessment", "interviewing", "outreach"] },
  { value: "interviewing", label: "Interviewing", statuses: ["interviewing", "assessment"] },
  { value: "offer", label: "Offers", statuses: ["offer"] },
  { value: "rejected", label: "Closed", statuses: ["rejected"] },
];

const CAREER_STAGES = ["applied", "in_review", "assessment", "interviewing", "offer", "rejected"];

function GroupCard({ group, domain, onOpenMessage, onArchive, onStage }: { group: InsightGroup; domain: Domain; onOpenMessage: (id: number) => void; onArchive?: () => void; onStage?: (status: string) => void }) {
  const fmt = useFmt();
  const [open, setOpen] = useState(false);
  const first = group.items[0]!;
  const Icon = insightIcon(first);
  const track = group.items.flatMap((i) => i.links).find((l) => ["track", "checkin", "itinerary", "manage", "schedule", "review"].includes(l.kind));
  const vendor = group.items.find((i) => i.vendor)?.vendor ?? null;
  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 sm:px-5" aria-expanded={open}>
        {domain === "life" ? (
          <VendorMark name={group.title} />
        ) : vendor && domain !== "career" ? (
          <VendorMark vendor={vendor} />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-ink">{group.title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted">{group.subtitle ?? `${group.items.length} update${group.items.length === 1 ? "" : "s"}`}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            {domain !== "life" && domain !== "security" ? <StatusBadge status={group.status} /> : null}
            {group.nextAt ? <span className="font-medium text-accent">{fmt.day(group.nextAt)}</span> : <span>{fmt.ago(group.latestAt)}</span>}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="bg-surface-3/50 pb-2">
          {(track || onStage || onArchive) && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-1 pb-2 sm:px-5">
              {track ? (
                <ExternalA href={track.url} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-accent-ink">
                  {track.label} <ExternalLink className="size-3.5" aria-hidden />
                </ExternalA>
              ) : null}
              {onStage ? (
                <Select value={group.status ?? ""} onChange={(e) => onStage(e.target.value)} className="h-8 w-auto py-0 text-[12.5px]" aria-label="Stage">
                  {[...new Set([group.status ?? "", ...CAREER_STAGES])].filter(Boolean).map((s) => (
                    <option key={s} value={s}>
                      {INSIGHT_STATUS[s]?.label ?? s}
                    </option>
                  ))}
                </Select>
              ) : null}
              {onArchive ? (
                <Button size="sm" variant="ghost" icon={Archive} onClick={onArchive}>
                  Archive
                </Button>
              ) : null}
            </div>
          )}
          <ol className="relative ml-[33px] space-y-0 border-l border-line sm:ml-[37px]">
            {group.items.map((i) => (
              <li key={i.id} className="relative">
                <span className="absolute top-4 -left-[5px] size-2.5 rounded-full bg-series ring-4 ring-surface" aria-hidden />
                <button type="button" disabled={!i.messageId} onClick={() => i.messageId && onOpenMessage(i.messageId)} className="w-full py-2 pr-4 pl-5 text-left hover:bg-surface-2/50 disabled:hover:bg-transparent">
                  <span className="block text-[13.5px] font-medium text-ink">{i.title}</span>
                  <span className="block text-[12px] text-muted">
                    {fmt.date(i.occurredAt, "datetime")}
                    {i.occursAt ? ` · for ${fmt.date(i.occursAt, i.occursAt.endsWith("T12:00:00.000Z") ? "weekday" : "datetime")}` : ""}
                    {i.amount !== null ? ` · ${fmt.money(i.amount, i.currency)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function filterGroups(data: DomainDTO, domain: Domain, filter: string | null): InsightGroup[] {
  if (domain !== "career" || !filter) return data.groups;
  const statuses = CAREER_FILTERS.find((f) => f.value === filter)?.statuses ?? [];
  return data.groups.filter((g) => statuses.includes(g.status ?? ""));
}

export function DomainPage({ domain }: { domain: Domain }) {
  const config = CONFIG[domain];
  const query = useDomain(domain);
  const qc = useQueryClient();
  const toast = useToast();
  const [messageId, setMessageId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(domain === "career" ? "active" : null);
  const [showAll, setShowAll] = useState(false);
  const data = query.data;
  const groups = useMemo(() => (data ? filterGroups(data, domain, filter) : []), [data, domain, filter]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["domain", domain] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    void qc.invalidateQueries({ queryKey: ["timeline"] });
  };
  const archive = async (items: InsightDTO[]) => {
    try {
      await Promise.all(items.filter((i) => i.id > 0).map((i) => patch(`/insights/${i.id}`, { archived: true })));
      refresh();
      toast.success("Archived");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const setStage = async (group: InsightGroup, status: string) => {
    try {
      await patch(`/insights/${group.items[0]!.id}`, { status });
      refresh();
      toast.success(`${group.title} → ${INSIGHT_STATUS[status]?.label ?? status}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const shownGroups = showAll ? groups : groups.slice(0, 12);
  return (
    <div className="space-y-4">
      <PageHeader title={config.title} description={config.description} />
      {!data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.stats.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} hint={s.hint} tone={s.tone} />
            ))}
          </div>

          {config.upcoming && data.upcoming.length ? (
            <Card>
              <CardHeader title={config.upcoming} icon={CalendarClock} />
              <div className="mt-2 divide-y divide-line">
                {data.upcoming.slice(0, 8).map((i) => (
                  <InsightRow key={i.id} item={i} onOpen={i.messageId ? () => setMessageId(i.messageId) : undefined} />
                ))}
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card className="overflow-hidden">
              <CardHeader title={config.groups} icon={config.icon} eyebrow={`${groups.length} total`} />
              {domain === "career" ? (
                <ChipRow className="mt-3 px-4 sm:px-5">
                  {CAREER_FILTERS.map((f) => (
                    <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(filter === f.value ? null : f.value)} count={data.groups.filter((g) => f.statuses.includes(g.status ?? "")).length}>
                      {f.label}
                    </Chip>
                  ))}
                </ChipRow>
              ) : null}
              <div className="mt-2 border-t border-line">
                {shownGroups.length ? (
                  shownGroups.map((g) => (
                    <GroupCard
                      key={g.key}
                      group={g}
                      domain={domain}
                      onOpenMessage={setMessageId}
                      onArchive={config.archivable && g.items.some((i) => i.id > 0) ? () => void archive(g.items) : undefined}
                      onStage={domain === "career" ? (status) => void setStage(g, status) : undefined}
                    />
                  ))
                ) : (
                  <EmptyState icon={config.icon} title={data.groups.length ? "Nothing in this view" : "Nothing yet"}>
                    {data.groups.length ? "Try another filter." : config.empty}
                  </EmptyState>
                )}
              </div>
              {groups.length > 12 && !showAll ? (
                <div className="border-t border-line p-2">
                  <Button variant="ghost" className="w-full" onClick={() => setShowAll(true)}>
                    Show all {groups.length}
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Recent activity" icon={History} />
              <div className="mt-2 divide-y divide-line">
                {data.recent.length ? (
                  data.recent.slice(0, 25).map((i) => <InsightRow key={i.id} item={i} onOpen={i.messageId ? () => setMessageId(i.messageId) : undefined} />)
                ) : (
                  <EmptyState icon={History} title="No activity yet">
                    {config.empty}
                  </EmptyState>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </div>
  );
}
