import { appUrl } from "../lib/base";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Bell,
  BellOff,
  Download,
  ExternalLink,
  Lightbulb,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { CYCLE_META } from "@shared/catalog";
import { cycleShort, formatTotals, titleCase } from "@shared/format";
import { BILLING_CYCLES, SUBSCRIPTION_STATUSES, type BillingCycle, type SavingsInsight, type SubscriptionDTO, type SubscriptionStatus } from "@shared/types";
import { del, errorMessage, patch, post } from "../lib/api";
import { useSubscription, useSubscriptions } from "../lib/queries";
import { useTakeParam } from "../lib/hooks";
import { savingsFigure } from "../lib/savings";
import { useFmt } from "../lib/prefs";
import { cn } from "../lib/utils";
import { DueChip } from "../components/alerts";
import { Sparkline } from "../components/charts";
import { PageHeader } from "../components/layout";
import { MessageRow, MessageSheet } from "../components/message";
import { Sheet } from "../components/sheet";
import { useToast } from "../components/toast";
import { Badge, Button, Card, CardHeader, Chip, ChipRow, EmptyState, ExternalA, Field, Input, Segmented, Select, Skeleton, Stat, Switch, Textarea, type Tone } from "../components/ui";
import { VendorMark } from "../components/vendor";

const STATUS_UI: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  trial: { label: "Free trial", tone: "accent" },
  past_due: { label: "Payment failed", tone: "bad" },
  paused: { label: "Paused", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "warn" },
};

const EVENT_LABEL: Record<string, string> = {
  charge: "Charged",
  renewal_notice: "Renewal notice",
  trial_started: "Trial started",
  trial_ending: "Trial ending",
  price_change: "Price change",
  payment_failed: "Payment failed",
  cancelled: "Cancelled",
  started: "Subscribed",
  plan_changed: "Plan changed",
  notice: "Notice",
};

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "JPY", "CHF", "AED"];

type Filter = "live" | "trial" | "ended" | "all";
type Sort = "renewal" | "cost" | "name";

function isLive(s: SubscriptionDTO) {
  return s.status === "active" || s.status === "trial" || s.status === "past_due";
}

function SavingsCard({ items, onOpen }: { items: SavingsInsight[]; onOpen: (id: number) => void }) {
  const fmt = useFmt();
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader title="Ways to save" icon={Lightbulb} eyebrow={`${items.length} suggestion${items.length === 1 ? "" : "s"}`} />
      <ul className="mt-2 divide-y divide-line">
        {items.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => s.subscriptionIds[0] && onOpen(s.subscriptionIds[0])} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/50 sm:px-5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-good-soft text-good">
                <Lightbulb className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">{s.title}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{s.detail}</span>
              </span>
              {(() => {
                const fig = savingsFigure(s, (a, c) => fmt.money(a, c, { whole: a >= 100 }));
                return fig ? <span className={cn("tabular shrink-0 text-[13px] font-semibold", fig.tone === "good" ? "text-good" : "text-high")}>{fig.text}</span> : null;
              })()}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SubscriptionRow({ sub, onOpen }: { sub: SubscriptionDTO; onOpen: () => void }) {
  const fmt = useFmt();
  const status = STATUS_UI[sub.status];
  const when = sub.status === "trial" ? sub.trialEndsAt : sub.nextRenewalAt;
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 sm:px-5", !isLive(sub) && "opacity-70")}>
      <VendorMark vendor={sub.vendor ? { ...sub.vendor, name: sub.name } : null} name={sub.name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold text-ink">{sub.name}</span>
          {sub.muted ? <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Alerts muted" /> : null}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
          {sub.status !== "active" ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          {sub.plan ? <span className="truncate">{sub.plan}</span> : null}
          {sub.priceChange ? (
            <Badge tone={sub.priceChange.to > sub.priceChange.from ? "high" : "good"} icon={sub.priceChange.to > sub.priceChange.from ? ArrowUpRight : ArrowDownRight}>
              {fmt.money(sub.priceChange.from, sub.priceChange.currency)} → {fmt.money(sub.priceChange.to, sub.priceChange.currency)}
            </Badge>
          ) : null}
          {when && isLive(sub) ? <DueChip iso={when} /> : sub.lastChargedAt ? <span>Last charged {fmt.date(sub.lastChargedAt, "monthDay")}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block text-[15px] font-semibold text-ink">
          {sub.amount !== null ? fmt.money(sub.amount, sub.currency) : "—"}
          <span className="text-[12px] font-normal text-muted">{cycleShort(sub.cycle)}</span>
        </span>
        {sub.cycle !== "monthly" && sub.monthlyCost !== null ? <span className="tabular block text-[11.5px] text-muted">{fmt.money(sub.monthlyCost, sub.currency)}/mo</span> : null}
      </span>
    </button>
  );
}

interface FormState {
  name: string;
  plan: string;
  amount: string;
  currency: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  nextRenewalAt: string;
  paymentMethod: string;
  manageUrl: string;
  notes: string;
}

function formFrom(sub: SubscriptionDTO | null, currency: string): FormState {
  return {
    name: sub?.name ?? "",
    plan: sub?.plan ?? "",
    amount: sub?.amount !== null && sub?.amount !== undefined ? String(sub.amount) : "",
    currency: sub?.currency ?? currency,
    cycle: sub?.cycle && sub.cycle !== "unknown" ? sub.cycle : "monthly",
    status: sub?.status ?? "active",
    nextRenewalAt: (sub?.status === "trial" ? sub?.trialEndsAt : sub?.nextRenewalAt)?.slice(0, 10) ?? "",
    paymentMethod: sub?.paymentMethod ?? "",
    manageUrl: sub?.manageUrl ?? "",
    notes: sub?.notes ?? "",
  };
}

function SubscriptionForm({ initial, onSubmit, submitLabel, busy }: { initial: FormState; onSubmit: (f: FormState) => void; submitLabel: string; busy: boolean }) {
  const [f, setF] = useState(initial);
  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [key]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(f);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" htmlFor="s-name">
        <Input id="s-name" required value={f.name} onChange={set("name")} placeholder="Netflix, iCloud+, Gym…" />
      </Field>
      <div className="grid grid-cols-[1fr_100px] gap-3">
        <Field label="Price" htmlFor="s-amount">
          <Input id="s-amount" required inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="9.99" />
        </Field>
        <Field label="Currency" htmlFor="s-cur">
          <Select id="s-cur" value={f.currency} onChange={set("currency")}>
            {[...new Set([f.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Billing cycle" htmlFor="s-cycle">
          <Select id="s-cycle" value={f.cycle} onChange={set("cycle")}>
            {BILLING_CYCLES.filter((c) => c !== "unknown").map((c) => (
              <option key={c} value={c}>
                {CYCLE_META[c].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="s-status">
          <Select id="s-status" value={f.status} onChange={set("status")}>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_UI[s].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={f.status === "trial" ? "Trial ends" : "Next renewal"} htmlFor="s-next">
          <Input id="s-next" type="date" value={f.nextRenewalAt} onChange={set("nextRenewalAt")} />
        </Field>
        <Field label="Plan" htmlFor="s-plan">
          <Input id="s-plan" value={f.plan} onChange={set("plan")} placeholder="Premium" />
        </Field>
      </div>
      <Field label="Payment method" htmlFor="s-pm">
        <Input id="s-pm" value={f.paymentMethod} onChange={set("paymentMethod")} placeholder="Visa •• 4242" />
      </Field>
      <Field label="Manage / cancel link" htmlFor="s-url">
        <Input id="s-url" type="url" value={f.manageUrl} onChange={set("manageUrl")} placeholder="https://" />
      </Field>
      <Field label="Notes" htmlFor="s-notes">
        <Textarea id="s-notes" value={f.notes} onChange={set("notes")} placeholder="Shared with family, cancel after the season…" />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

function toBody(f: FormState) {
  const amount = Number(f.amount.replace(/[^\d.,-]/g, "").replace(",", "."));
  return {
    name: f.name.trim(),
    plan: f.plan.trim() || null,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: f.currency,
    cycle: f.cycle,
    status: f.status,
    nextRenewalAt: f.nextRenewalAt || null,
    paymentMethod: f.paymentMethod.trim() || null,
    manageUrl: f.manageUrl.trim() || "",
    notes: f.notes.trim() || null,
  };
}

function SubscriptionSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useSubscription(id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [messageId, setMessageId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const s = detail.data;

  useEffect(() => {
    setEditing(false);
    setConfirmDelete(false);
  }, [id]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["subscriptions"] }),
      qc.invalidateQueries({ queryKey: ["overview"] }),
      qc.invalidateQueries({ queryKey: ["alerts"] }),
      qc.invalidateQueries({ queryKey: ["timeline"] }),
    ]);
  };
  const run = async (key: string, fn: () => Promise<unknown>, message: string, close = false) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      toast.success(message);
      if (close) onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const status = s ? STATUS_UI[s.status] : null;
  return (
    <>
      <Sheet
        open={id !== null}
        onClose={onClose}
        wide
        title={s ? s.name : "Subscription"}
        subtitle={s ? [s.plan, s.vendor?.domain, s.source === "manual" ? "Added by you" : `Detected from ${s.chargeCount} receipt${s.chargeCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ") : null}
        headerAction={
          s && !editing ? (
            <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </Button>
          ) : null
        }
      >
        {!s ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </div>
        ) : editing ? (
          <SubscriptionForm
            initial={formFrom(s, fmt.currency)}
            submitLabel="Save changes"
            busy={busy === "save"}
            onSubmit={(f) =>
              void run(
                "save",
                async () => {
                  await patch(`/subscriptions/${s.id}`, toBody(f));
                  setEditing(false);
                },
                "Saved — your edits override what Adminak detects",
              )
            }
          />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <VendorMark vendor={s.vendor ? { ...s.vendor, name: s.name } : null} name={s.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="tabular text-[28px] leading-none font-semibold tracking-tight text-ink">
                  {s.amount !== null ? fmt.money(s.amount, s.currency) : "—"}
                  <span className="text-[15px] font-normal text-muted">{cycleShort(s.cycle)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                  {s.cycle !== "monthly" && s.monthlyCost !== null ? <Badge>{fmt.money(s.monthlyCost, s.currency)}/mo</Badge> : null}
                  {s.amount !== null && s.cycle !== "unknown" ? <Badge>{fmt.money(Math.round(s.amount * CYCLE_META[s.cycle].perMonth * 12 * 100) / 100, s.currency)}/yr</Badge> : null}
                </div>
              </div>
            </div>

            {s.priceChange ? (
              <div className={cn("rounded-2xl p-3.5 text-sm", s.priceChange.to > s.priceChange.from ? "bg-high-soft text-high" : "bg-good-soft text-good")}>
                <strong>
                  Price {s.priceChange.to > s.priceChange.from ? "increase" : "decrease"}: {fmt.money(s.priceChange.from, s.priceChange.currency)} → {fmt.money(s.priceChange.to, s.priceChange.currency)}
                </strong>{" "}
                <span className="opacity-80">({fmt.date(s.priceChange.at, "medium")})</span>
              </div>
            ) : null}

            <dl className="grid grid-cols-2 gap-2">
              {[
                { label: s.status === "trial" ? "Trial ends" : "Next renewal", value: s.status === "trial" ? s.trialEndsAt : s.nextRenewalAt, date: true },
                { label: "Last charged", value: s.lastChargedAt, date: true },
                { label: "Total spent", value: s.totalSpent ? fmt.money(s.totalSpent, s.currency) : "—" },
                { label: "Payment method", value: s.paymentMethod ?? "—" },
                { label: "Member since", value: s.startedAt, date: true },
                { label: "Billing cycle", value: CYCLE_META[s.cycle].label },
              ].map((row) => (
                <div key={row.label} className="rounded-2xl bg-surface-2 p-3">
                  <dt className="eyebrow">{row.label}</dt>
                  <dd className="mt-1 truncate text-[14.5px] font-semibold text-ink">
                    {row.date ? (row.value ? `${fmt.date(row.value, "medium")}` : "—") : row.value}
                    {row.date && row.value && fmt.daysUntil(row.value) >= 0 ? <span className="block text-[12px] font-normal text-muted">{fmt.day(row.value)}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>

            {s.priceHistory.length > 1 ? (
              <section>
                <h4 className="eyebrow mb-2">Price history</h4>
                <Sparkline points={s.priceHistory} currency={s.currency} />
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {s.manageUrl ? (
                <ExternalA href={s.manageUrl} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink">
                  Manage or cancel <ExternalLink className="size-4" aria-hidden />
                </ExternalA>
              ) : null}
              {isLive(s) ? (
                <Button icon={Ban} loading={busy === "cancel"} onClick={() => void run("cancel", () => patch(`/subscriptions/${s.id}`, { status: "cancelled" }), "Marked as cancelled")}>
                  I cancelled it
                </Button>
              ) : (
                <Button icon={Repeat} loading={busy === "reactivate"} onClick={() => void run("reactivate", () => patch(`/subscriptions/${s.id}`, { status: "active" }), "Marked as active")}>
                  Still active
                </Button>
              )}
              <Button
                icon={s.muted ? Bell : BellOff}
                variant="ghost"
                loading={busy === "mute"}
                onClick={() => void run("mute", () => patch(`/subscriptions/${s.id}`, { muted: !s.muted }), s.muted ? "Alerts back on" : "Alerts muted for this subscription")}
              >
                {s.muted ? "Unmute alerts" : "Mute alerts"}
              </Button>
            </div>

            {s.notes ? <p className="rounded-2xl border border-line p-3.5 text-sm whitespace-pre-wrap text-ink-2">{s.notes}</p> : null}

            {s.events.length ? (
              <section>
                <h4 className="eyebrow mb-2">History</h4>
                <ol className="relative space-y-3 border-l border-line pl-4">
                  {s.events.slice(0, 12).map((e) => (
                    <li key={e.id} className="relative">
                      <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-surface", e.type === "payment_failed" ? "bg-crit" : e.type === "price_change" ? "bg-high" : "bg-series")} aria-hidden />
                      <div className="flex items-baseline justify-between gap-3">
                        <button type="button" className="text-left text-[14px] font-medium text-ink hover:underline disabled:no-underline" disabled={!e.messageId} onClick={() => e.messageId && setMessageId(e.messageId)}>
                          {EVENT_LABEL[e.type] ?? titleCase(e.type)}
                          {e.plan ? <span className="font-normal text-muted"> · {e.plan}</span> : null}
                        </button>
                        <span className="tabular shrink-0 text-[13px] text-ink-2">
                          {e.type === "price_change" && e.oldAmount !== null ? `${fmt.money(e.oldAmount, e.currency)} → ` : ""}
                          {e.amount !== null ? fmt.money(e.amount, e.currency) : ""}
                        </span>
                      </div>
                      <div className="text-[12px] text-muted">
                        {fmt.date(e.occurredAt, "medium")}
                        {e.effectiveAt && e.effectiveAt !== e.occurredAt ? ` · effective ${fmt.date(e.effectiveAt, "medium")}` : ""}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {s.charges.length ? (
              <section>
                <h4 className="eyebrow mb-2">Charges</h4>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {s.charges.slice(0, 12).map((ch) => (
                    <li key={ch.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="text-ink-2">{fmt.date(ch.occurredAt, "medium")}</span>
                      <span className="flex items-center gap-2">
                        {ch.status !== "posted" ? <Badge tone={ch.status === "failed" ? "bad" : "neutral"}>{titleCase(ch.status)}</Badge> : null}
                        <span className="tabular font-medium text-ink">{fmt.money(ch.amount, ch.currency)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {s.messages.length ? (
              <section>
                <h4 className="eyebrow mb-2">Related emails</h4>
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {s.messages.slice(0, 8).map((m) => (
                    <MessageRow key={m.id} message={m} onOpen={() => setMessageId(m.id)} />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {s.source === "detected" ? (
                <Button size="sm" variant="ghost" icon={RotateCcw} loading={busy === "reset"} onClick={() => void run("reset", () => post(`/subscriptions/${s.id}/reset`), "Reset to detected values")}>
                  Reset my edits
                </Button>
              ) : null}
              {confirmDelete ? (
                <Button size="sm" variant="danger" icon={Trash2} loading={busy === "delete"} onClick={() => void run("delete", () => del(`/subscriptions/${s.id}`), "Subscription removed", true)}>
                  Confirm remove
                </Button>
              ) : (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-[12px] text-muted">
              Confidence {Math.round(s.confidence * 100)}%. Adminak keeps this up to date from receipts, renewal notices and price-change emails; your edits always win.
            </p>
          </div>
        )}
      </Sheet>
      <MessageSheet messageId={messageId} onClose={() => setMessageId(null)} />
    </>
  );
}

function AddSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Add a subscription" subtitle="For anything that doesn't email you a receipt — gym, rent-a-locker, a family plan.">
      <SubscriptionForm
        key={open ? "open" : "closed"}
        initial={formFrom(null, fmt.currency)}
        submitLabel="Add subscription"
        busy={busy}
        onSubmit={async (f) => {
          setBusy(true);
          try {
            const created = await post<SubscriptionDTO>("/subscriptions", toBody(f));
            await qc.invalidateQueries({ queryKey: ["subscriptions"] });
            void qc.invalidateQueries({ queryKey: ["overview"] });
            toast.success(`${created.name} added`);
            onClose();
            onCreated(created.id);
          } catch (error) {
            toast.error(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}

export function SubscriptionsPage() {
  const fmt = useFmt();
  const subs = useSubscriptions();
  const [filter, setFilter] = useState<Filter>("live");
  const [sort, setSort] = useState<Sort>("renewal");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  useTakeParam("id", (v) => setOpenId(Number(v) || null));
  useTakeParam("add", () => setAdding(true));

  const items = subs.data?.items ?? [];
  const kinds = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of items.filter(isLive)) if (s.kind) map.set(s.kind, (map.get(s.kind) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items
      .filter((s) => (filter === "live" ? isLive(s) : filter === "trial" ? s.status === "trial" : filter === "ended" ? !isLive(s) : true))
      .filter((s) => !kind || s.kind === kind)
      .filter((s) => !needle || `${s.name} ${s.plan ?? ""} ${s.vendor?.domain ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === "cost") return (b.monthlyCost ?? 0) - (a.monthlyCost ?? 0);
        if (sort === "name") return a.name.localeCompare(b.name);
        const at = (s: SubscriptionDTO) => (isLive(s) ? (s.status === "trial" ? s.trialEndsAt : s.nextRenewalAt) : null) ?? "9999";
        return at(a).localeCompare(at(b));
      });
  }, [items, filter, kind, q, sort]);

  const data = subs.data;
  const yearly = data ? data.monthly.map((m) => ({ currency: m.currency, amount: Math.round(m.amount * 12 * 100) / 100 })) : [];
  const nextUp = items.filter((s) => isLive(s) && (s.status === "trial" ? s.trialEndsAt : s.nextRenewalAt)).sort((a, b) => ((a.status === "trial" ? a.trialEndsAt : a.nextRenewalAt) ?? "").localeCompare((b.status === "trial" ? b.trialEndsAt : b.nextRenewalAt) ?? ""))[0];
  const counts = {
    live: items.filter(isLive).length,
    trial: items.filter((s) => s.status === "trial").length,
    ended: items.filter((s) => !isLive(s)).length,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Subscriptions"
        description="Every recurring charge Adminak found in your receipts and renewal notices — with price changes, trials and renewal dates."
        actions={
          <>
            <a href={appUrl("/api/export/subscriptions")} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink" download>
              <Download className="size-4" aria-hidden /> CSV
            </a>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add
            </Button>
          </>
        }
      />

      {subs.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Per month" value={<span className="tabular">{formatTotals(data?.monthly ?? [], { currency: fmt.currency })}</span>} hint={`${data?.active ?? 0} active`} />
          <Stat label="Per year" value={<span className="tabular">{formatTotals(yearly, { currency: fmt.currency, whole: true })}</span>} hint="at current prices" />
          <Stat label="Free trials" value={data?.trials ?? 0} hint={data?.trials ? "converting soon — check them" : "none running"} tone={data?.trials ? "warn" : "neutral"} onClick={data?.trials ? () => setFilter("trial") : undefined} />
          <Stat
            label="Next charge"
            value={nextUp ? <span className="tabular">{fmt.money(nextUp.nextAmount ?? nextUp.amount, nextUp.currency)}</span> : "—"}
            hint={nextUp ? `${nextUp.name} · ${fmt.day(nextUp.status === "trial" ? nextUp.trialEndsAt : nextUp.nextRenewalAt)}` : "nothing scheduled"}
            onClick={nextUp ? () => setOpenId(nextUp.id) : undefined}
          />
        </div>
      )}

      <SavingsCard items={data?.savings ?? []} onOpen={setOpenId} />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            value={filter}
            onChange={setFilter}
            className="w-full sm:w-auto"
            options={[
              { value: "live", label: "Active", count: counts.live },
              { value: "trial", label: "Trials", count: counts.trial },
              { value: "ended", label: "Ended", count: counts.ended },
              { value: "all", label: "All" },
            ]}
          />
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-10" type="search" aria-label="Search subscriptions" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto" aria-label="Sort">
              <option value="renewal">Next renewal</option>
              <option value="cost">Monthly cost</option>
              <option value="name">Name</option>
            </Select>
          </div>
        </div>
        {kinds.length > 1 ? (
          <ChipRow>
            <Chip active={!kind} onClick={() => setKind(null)}>
              All types
            </Chip>
            {kinds.map(([k, n]) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)} count={n}>
                {titleCase(k)}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        {subs.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title={items.length ? "No subscriptions match" : "No subscriptions yet"}
            action={
              items.length ? null : (
                <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                  Add one manually
                </Button>
              )
            }
          >
            {items.length ? "Try another filter." : "Adminak builds this list automatically from receipts and renewal emails once a mailbox is connected."}
          </EmptyState>
        ) : (
          <div className="divide-y divide-line">
            {shown.map((s) => (
              <SubscriptionRow key={s.id} sub={s} onOpen={() => setOpenId(s.id)} />
            ))}
          </div>
        )}
      </Card>

      <SubscriptionSheet id={openId} onClose={() => setOpenId(null)} />
      <AddSheet open={adding} onClose={() => setAdding(false)} onCreated={(id) => setOpenId(id)} />
    </div>
  );
}
