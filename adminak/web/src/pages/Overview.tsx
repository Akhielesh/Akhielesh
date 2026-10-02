import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  Bell,
  Briefcase,
  CalendarClock,
  CreditCard,
  Lightbulb,
  Mail,
  Package,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { SPEND_CATEGORY_META } from "@shared/catalog";
import type { AlertDTO, OverviewDTO } from "@shared/types";
import { post, errorMessage } from "../lib/api";
import { actions, useAccounts, useInvalidateData, useOverview } from "../lib/queries";
import { useFmt, usePrefs } from "../lib/prefs";
import { greeting, pct, cn } from "../lib/utils";
import { savingsFigure } from "../lib/savings";
import { AlertRow, AlertSheet } from "../components/alerts";
import { InstallCard } from "../components/native";
import { CategoryBars, SpendBars } from "../components/charts";
import { TimelineList } from "../components/timeline";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, Stat } from "../components/ui";

function ConnectCard() {
  const accounts = useAccounts();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const loadDemo = async () => {
    setBusy(true);
    try {
      const result = await actions.loadDemo();
      toast.success(`Demo inbox loaded — ${result.inserted} emails analyzed, ${result.alerts} alerts raised.`);
      invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="overflow-hidden">
      <div className="relative p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,var(--accent-soft),transparent_45%)]" />
        <div className="relative max-w-2xl">
          <Badge tone="accent" icon={Sparkles}>
            Get started
          </Badge>
          <h2 className="display mt-3 text-[30px] leading-tight text-ink sm:text-[36px]">Connect your inbox and Adminak gets to work</h2>
          <p className="mt-2 text-[14.5px] text-ink-2">
            It scans receipts, statements and notices to track every subscription, bill, delivery, trip, interview and security event — then emails you before anything slips.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" size="lg" icon={Mail} onClick={() => navigate("/accounts?add=1")}>
              Connect a mailbox
            </Button>
            {!accounts.data?.accounts.some((a) => a.provider === "demo") ? (
              <Button variant="outline" size="lg" icon={Sparkles} loading={busy} onClick={loadDemo}>
                Explore with demo data
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Briefing({ overview }: { overview: OverviewDTO }) {
  const fmt = useFmt();
  const toast = useToast();
  const invalidate = useInvalidateData();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      await post("/briefing");
      invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const text = overview.briefing?.text;
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,var(--accent-soft),transparent_55%)]" />
      <div className="relative flex gap-3 p-4 sm:p-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Sparkles className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="eyebrow">Briefing{overview.briefing ? ` · ${overview.briefing.source === "ai" ? "AI" : "auto"} · ${fmt.ago(overview.briefing.generatedAt)}` : ""}</div>
            <Button size="sm" variant="ghost" onClick={refresh} loading={busy}>
              Refresh
            </Button>
          </div>
          <p className="mt-1 text-[14.5px] leading-relaxed text-ink">{text ?? (overview.kpis.emailsAnalyzed ? "Preparing your briefing — tap refresh if it doesn't appear in a moment." : "Once a mailbox is connected, this briefing summarizes what needs action today, what's coming up and one money insight.")}</p>
        </div>
      </div>
    </Card>
  );
}

function KpiGrid({ overview }: { overview: OverviewDTO }) {
  const fmt = useFmt();
  const navigate = useNavigate();
  const k = overview.kpis;
  const spent = k.spendThisMonth.find((t) => t.currency === overview.baseCurrency)?.amount ?? 0;
  const last = k.spendLastMonth.find((t) => t.currency === overview.baseCurrency)?.amount ?? 0;
  const change = pct(spent, last);
  const thisMonth = overview.spendTrend.at(-1);
  const prevMonth = overview.spendTrend.at(-2);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Subscriptions"
        icon={Repeat}
        value={fmt.totals(k.monthlySubscriptions, { whole: true })}
        hint={`per month · ${k.activeSubscriptions} active${k.trials ? ` · ${k.trials} trial${k.trials > 1 ? "s" : ""}` : ""}`}
        onClick={() => navigate("/subscriptions")}
      />
      <Stat
        label="Due in 7 days"
        icon={CalendarClock}
        value={k.dueNext7.count ? fmt.totals(k.dueNext7.total, { whole: true }) : "Nothing"}
        hint={k.dueNext7.count ? `${k.dueNext7.count} bill${k.dueNext7.count > 1 ? "s" : ""} & renewals` : "You're clear this week"}
        tone={k.dueNext7.count ? "warn" : "good"}
        onClick={() => navigate("/timeline")}
      />
      <Stat
        label="Open alerts"
        icon={Bell}
        value={String(k.openAlerts.total)}
        hint={k.openAlerts.critical ? `${k.openAlerts.critical} critical · ${k.openAlerts.high} high` : k.openAlerts.high ? `${k.openAlerts.high} high priority` : "Nothing urgent"}
        tone={k.openAlerts.critical ? "bad" : k.openAlerts.high ? "warn" : "good"}
        onClick={() => navigate("/alerts")}
      />
      <Stat
        label={thisMonth ? `Spent in ${thisMonth.label}` : "Spent this month"}
        icon={Wallet}
        value={fmt.money(spent, overview.baseCurrency, { whole: true })}
        hint={
          change !== null && spent > 0
            ? `${change > 0 ? "+" : ""}${change}% vs this point in ${prevMonth?.label ?? "last month"}`
            : prevMonth && prevMonth.out > 0
              ? `${prevMonth.label}: ${fmt.money(prevMonth.out, overview.baseCurrency, { whole: true })} total`
              : "from scanned receipts"
        }
        tone={change === null || spent === 0 ? "neutral" : change > 10 ? "warn" : "good"}
        onClick={() => navigate("/money")}
      />
    </div>
  );
}

function Attention({ alerts, onOpen }: { alerts: AlertDTO[]; onOpen: (a: AlertDTO) => void }) {
  return (
    <Card>
      <CardHeader
        title="Needs your attention"
        icon={Bell}
        action={
          <Link to="/alerts" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent">
            All alerts <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {alerts.length ? (
        <div className="mt-2 divide-y divide-line">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} onOpen={() => onOpen(a)} compact />
          ))}
        </div>
      ) : (
        <EmptyState icon={ShieldCheck} title="All clear" className="py-8">
          No critical or high-priority alerts right now.
        </EmptyState>
      )}
    </Card>
  );
}

function SpendCard({ overview }: { overview: OverviewDTO }) {
  const rows = overview.spendByCategory.slice(0, 5).map((c) => ({ label: SPEND_CATEGORY_META[c.category]?.label ?? c.category, value: c.total }));
  return (
    <Card>
      <CardHeader
        title="Spending trend"
        icon={TrendingUp}
        eyebrow="Last 12 months · from scanned emails"
        action={
          <Link to="/money" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent">
            Details <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <div className="px-4 pt-2 pb-4 sm:px-5">
        <SpendBars data={overview.spendTrend} currency={overview.baseCurrency} />
        {rows.length ? (
          <div className="mt-5 border-t border-line pt-4">
            <div className="eyebrow mb-3">Last 30 days by category</div>
            <CategoryBars rows={rows} currency={overview.baseCurrency} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function Savings({ overview }: { overview: OverviewDTO }) {
  const fmt = useFmt();
  if (!overview.savings.length) return null;
  return (
    <Card>
      <CardHeader title="Money moves" icon={PiggyBank} eyebrow="Spotted in your subscriptions" />
      <ul className="mt-2 space-y-2 px-4 pb-4 sm:px-5">
        {overview.savings.slice(0, 4).map((s) => (
          <li key={s.id}>
            <Link to={`/subscriptions${s.subscriptionIds.length === 1 ? `?id=${s.subscriptionIds[0]}` : ""}`} className="flex gap-3 rounded-2xl bg-surface-2/70 p-3 hover:bg-surface-2">
              <Lightbulb className={cn("mt-0.5 size-4 shrink-0", s.kind === "failed_payment" ? "text-crit" : s.kind === "trial" ? "text-high" : "text-accent")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">{s.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{s.detail}</span>
              </span>
              {(() => {
                const fig = savingsFigure(s, (a, c) => fmt.money(a, c, { whole: a >= 100 }));
                return fig ? <span className={cn("tabular ml-auto shrink-0 text-[12.5px] font-semibold", fig.tone === "good" ? "text-good" : "text-high")}>{fig.text}</span> : null;
              })()}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LifeSnapshot({ overview }: { overview: OverviewDTO }) {
  const fmt = useFmt();
  const c = overview.career;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Link to="/career" className="card block p-4 hover:border-line-strong">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Career</span>
          <Briefcase className="size-4 text-muted" aria-hidden />
        </div>
        <div className="display mt-2 text-[28px] leading-none text-ink">{c.active} active</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {c.interviewing ? <Badge tone="info">{c.interviewing} interviewing</Badge> : null}
          {c.offers ? <Badge tone="good">{c.offers} offer{c.offers > 1 ? "s" : ""}</Badge> : null}
          {!c.interviewing && !c.offers ? <span className="text-[12.5px] text-muted">{c.applied} applied</span> : null}
        </div>
      </Link>
      <Link to="/orders" className="card block p-4 hover:border-line-strong">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Deliveries</span>
          <Truck className="size-4 text-muted" aria-hidden />
        </div>
        <div className="display mt-2 text-[28px] leading-none text-ink">{overview.deliveries.length} in transit</div>
        <div className="mt-1 truncate text-[12.5px] text-muted">{overview.deliveries[0] ? overview.deliveries[0].title : "Nothing on the way"}</div>
      </Link>
      <Link to="/security" className="card block p-4 hover:border-line-strong">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Security</span>
          <ShieldCheck className={cn("size-4", overview.security.openCritical ? "text-crit" : "text-good")} aria-hidden />
        </div>
        <div className={cn("display mt-2 text-[28px] leading-none", overview.security.openCritical ? "text-crit" : "text-ink")}>
          {overview.security.openCritical ? `${overview.security.openCritical} critical` : "Looks good"}
        </div>
        <div className="mt-1 truncate text-[12.5px] text-muted">{overview.security.recent[0] ? `${overview.security.recent[0].title} · ${fmt.ago(overview.security.recent[0].occurredAt)}` : "No recent security events"}</div>
      </Link>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-24" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export function OverviewPage() {
  const overview = useOverview();
  const accounts = useAccounts();
  const prefs = usePrefs();
  const fmt = useFmt();
  const [open, setOpen] = useState<AlertDTO | null>(null);
  if (overview.isLoading || !overview.data) return <OverviewSkeleton />;
  const data = overview.data;
  const noAccounts = (accounts.data?.accounts.length ?? 0) === 0;
  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">{fmt.date(new Date().toISOString(), "long")}</div>
          <h1 className="display mt-1 text-[40px] leading-[1.02] text-ink sm:text-[52px]">{greeting(data.name || prefs.name, prefs.tz)}</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {data.kpis.emailsAnalyzed
              ? `${data.kpis.emailsAnalyzed.toLocaleString()} emails analyzed · ${data.kpis.emailsToday} in the last day · ${data.sync.activeAccounts} mailbox${data.sync.activeAccounts === 1 ? "" : "es"}`
              : "No emails analyzed yet"}
            {data.sync.errorAccounts ? <span className="text-crit"> · {data.sync.errorAccounts} mailbox needs attention</span> : null}
          </p>
        </div>
      </div>

      {noAccounts ? <ConnectCard /> : <InstallCard />}
      <KpiGrid overview={data} />
      {data.kpis.emailsAnalyzed ? <Briefing overview={data} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="space-y-4 lg:col-span-2 lg:space-y-5">
          <Attention alerts={data.attention} onOpen={setOpen} />
          <SpendCard overview={data} />
        </div>
        <div className="space-y-4 lg:space-y-5">
          <Card>
            <CardHeader
              title="Coming up"
              icon={CalendarClock}
              eyebrow="Next 14 days"
              action={
                <Link to="/timeline" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent">
                  Timeline <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-3 overflow-clip rounded-b-[18px]">
              {data.upcoming.length ? (
                <TimelineList items={data.upcoming} limit={8} />
              ) : (
                <EmptyState icon={CreditCard} title="Nothing scheduled" className="py-8">
                  Renewals, bills, trips and interviews will appear here.
                </EmptyState>
              )}
            </div>
          </Card>
          <Savings overview={data} />
        </div>
      </div>
      <LifeSnapshot overview={data} />
      {data.deliveries.length ? (
        <Card>
          <CardHeader title="On the way" icon={Package} />
          <ul className="mt-2 divide-y divide-line">
            {data.deliveries.slice(0, 4).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Package className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.title}</span>
                <span className="shrink-0 text-[12px] text-muted">{d.occursAt ? fmt.day(d.occursAt) : fmt.ago(d.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <AlertSheet alert={open} open={!!open} onClose={() => setOpen(null)} />
    </div>
  );
}
