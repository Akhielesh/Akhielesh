import { CYCLE_DAYS, CYCLE_META } from "../../shared/catalog.js";
import { formatMoney, monthlyCost } from "../../shared/format.js";
import { addDays, addMonths } from "../../shared/time.js";
import type { BillingCycle, SavingsInsight, SubscriptionDTO, SubscriptionStatus } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { parseJson } from "../db/index.js";
import { cycleFromGap } from "../intel/analyze.js";
import { VENDOR_COLUMNS, vendorRefFromRow } from "./vendors.js";

export interface SubscriptionRow {
  id: number;
  key: string;
  vendor_id: number | null;
  name: string;
  plan: string | null;
  kind: string | null;
  amount: number | null;
  currency: string | null;
  cycle: BillingCycle;
  next_amount: number | null;
  status: SubscriptionStatus;
  started_at: string | null;
  trial_ends_at: string | null;
  next_renewal_at: string | null;
  last_charged_at: string | null;
  cancelled_at: string | null;
  payment_method: string | null;
  manage_url: string | null;
  source: "detected" | "manual";
  overrides: string;
  notes: string | null;
  muted: number;
  confidence: number;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  type: string;
  amount: number | null;
  old_amount: number | null;
  currency: string | null;
  cycle: string | null;
  plan: string | null;
  payment_method: string | null;
  occurred_at: string;
  effective_at: string | null;
}

interface ChargeLite {
  amount: number;
  currency: string;
  occurred_at: string;
  status: string;
}

export type SubscriptionOverrides = Partial<{
  name: string;
  plan: string | null;
  amount: number | null;
  currency: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  next_renewal_at: string | null;
  payment_method: string | null;
  manage_url: string | null;
  kind: string | null;
}>;

export function addCycle(date: Date, cycle: Exclude<BillingCycle, "unknown">, times = 1): Date {
  switch (cycle) {
    case "weekly":
      return addDays(date, 7 * times);
    case "monthly":
      return addMonths(date, times);
    case "quarterly":
      return addMonths(date, 3 * times);
    case "semiannual":
      return addMonths(date, 6 * times);
    case "annual":
      return addMonths(date, 12 * times);
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Derives a subscription's state from its full event + charge history (order-independent),
 * then applies the user's manual overrides on top.
 */
export function recomputeSubscription(ctx: AppContext, id: number): void {
  const db = ctx.db;
  const sub = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as SubscriptionRow | undefined;
  if (!sub) return;
  const now = ctx.now();
  const events = db.prepare("SELECT * FROM subscription_events WHERE subscription_id = ? ORDER BY occurred_at ASC, id ASC").all(id) as EventRow[];
  const charges = db
    .prepare("SELECT amount, currency, occurred_at, status FROM charges WHERE subscription_id = ? AND direction = 'out' ORDER BY occurred_at ASC")
    .all(id) as ChargeLite[];
  const overrides = parseJson<SubscriptionOverrides>(sub.overrides, {});

  const posted = charges.filter((c) => c.status === "posted");
  const lastCharge = posted.at(-1) ?? null;
  const lastChargeTime = lastCharge ? new Date(lastCharge.occurred_at).getTime() : 0;

  // Cycle: explicit statements beat inference from charge spacing.
  let cycle: BillingCycle = "unknown";
  for (const e of events) if (e.cycle && e.cycle !== "unknown") cycle = e.cycle as BillingCycle;
  if (cycle === "unknown" && posted.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < posted.length; i++) {
      gaps.push((new Date(posted[i]!.occurred_at).getTime() - new Date(posted[i - 1]!.occurred_at).getTime()) / 86400000);
    }
    cycle = cycleFromGap(median(gaps) ?? 0) ?? "unknown";
  }

  // Amount: latest charge or quoted price; price changes take over once effective.
  let amount: number | null = null;
  let currency: string | null = null;
  let amountAt = 0;
  for (const c of posted) {
    amount = c.amount;
    currency = c.currency;
    amountAt = new Date(c.occurred_at).getTime();
  }
  let nextAmount: number | null = null;
  for (const e of events) {
    if (e.amount === null) continue;
    const at = new Date(e.occurred_at).getTime();
    if (["renewal_notice", "started", "trial_started", "trial_ending", "plan_changed"].includes(e.type) && at >= amountAt) {
      amount = e.amount;
      currency = e.currency ?? currency;
      amountAt = at;
    }
    if (e.type === "price_change") {
      const effective = e.effective_at ? new Date(e.effective_at).getTime() : at;
      if (effective <= now.getTime() && effective >= amountAt) {
        amount = e.amount;
        currency = e.currency ?? currency;
        amountAt = effective;
      } else if (effective > now.getTime()) {
        nextAmount = e.amount;
      }
    }
  }

  // Status.
  const lastOf = (type: string) => [...events].reverse().find((e) => e.type === type) ?? null;
  const cancelled = lastOf("cancelled");
  const failed = lastOf("payment_failed");
  const trial = [...events].reverse().find((e) => e.type === "trial_started" || e.type === "trial_ending") ?? null;
  const restarted = [...events].reverse().find((e) => e.type === "started" || e.type === "trial_started") ?? null;
  const lastActivity = Math.max(lastChargeTime, restarted ? new Date(restarted.occurred_at).getTime() : 0);
  let status: SubscriptionStatus = "active";
  let cancelledAt: string | null = null;
  const trialEnd = trial?.effective_at ?? null;
  if (cancelled && new Date(cancelled.occurred_at).getTime() >= lastActivity) {
    status = "cancelled";
    cancelledAt = cancelled.occurred_at;
  } else if (failed && new Date(failed.occurred_at).getTime() > lastChargeTime) {
    status = "past_due";
  } else if (trial && trialEnd && new Date(trialEnd).getTime() > now.getTime() - 86400000 && new Date(trial.occurred_at).getTime() >= lastChargeTime) {
    status = "trial";
  } else if (cycle !== "unknown" && lastCharge) {
    const staleAfter = CYCLE_DAYS[cycle] * 1.75 * 86400000;
    if (now.getTime() - lastChargeTime > staleAfter) status = "lapsed";
  } else if (!lastCharge && !trial && events.length > 0) {
    const latest = new Date(events.at(-1)!.occurred_at).getTime();
    if (now.getTime() - latest > 400 * 86400000) status = "lapsed";
  }

  // Next renewal: explicit future date from the newest notice/receipt, else project from last charge.
  let nextRenewal: Date | null = null;
  for (const e of events) {
    if (!e.effective_at || !["renewal_notice", "charge", "started", "price_change", "plan_changed"].includes(e.type)) continue;
    const eff = new Date(e.effective_at);
    // Events are oldest-first, so the newest future-dated statement wins.
    if (eff.getTime() > lastChargeTime) nextRenewal = eff;
  }
  if (status === "trial" && trialEnd) nextRenewal = new Date(trialEnd);
  if (!nextRenewal && lastCharge && cycle !== "unknown") nextRenewal = addCycle(new Date(lastCharge.occurred_at), cycle);
  if (nextRenewal && cycle !== "unknown" && (status === "active" || status === "past_due")) {
    // Assume it renewed if the date passed without a receipt (receipts are often missing).
    let guard = 0;
    while (nextRenewal.getTime() < now.getTime() - 2 * 86400000 && guard++ < 120) nextRenewal = addCycle(nextRenewal, cycle);
  }
  if (status === "cancelled" || status === "lapsed") nextRenewal = null;

  const plan = [...events].reverse().find((e) => e.plan)?.plan ?? sub.plan;
  const paymentMethod = [...events].reverse().find((e) => e.payment_method)?.payment_method ?? sub.payment_method;
  const startedAt = events[0]?.occurred_at ?? posted[0]?.occurred_at ?? sub.started_at;
  const confidence = Math.min(0.99, 0.45 + posted.length * 0.12 + (cycle !== "unknown" ? 0.15 : 0) + (events.some((e) => e.type === "renewal_notice") ? 0.1 : 0));

  const merged = {
    name: overrides.name ?? sub.name,
    plan: overrides.plan !== undefined ? overrides.plan : plan,
    kind: overrides.kind !== undefined ? overrides.kind : sub.kind,
    amount: overrides.amount !== undefined ? overrides.amount : (amount ?? sub.amount),
    currency: overrides.currency ?? currency ?? sub.currency,
    cycle: overrides.cycle ?? (cycle !== "unknown" ? cycle : sub.cycle),
    status: overrides.status ?? (sub.source === "manual" && events.length === 0 && posted.length === 0 ? sub.status : status),
    next_renewal_at: overrides.next_renewal_at !== undefined ? overrides.next_renewal_at : (nextRenewal?.toISOString() ?? (sub.source === "manual" ? sub.next_renewal_at : null)),
    payment_method: overrides.payment_method !== undefined ? overrides.payment_method : paymentMethod,
    manage_url: overrides.manage_url !== undefined ? overrides.manage_url : sub.manage_url,
  };
  // Manual subscriptions roll forward on their own schedule.
  if (sub.source === "manual" && merged.next_renewal_at && merged.cycle !== "unknown" && merged.status === "active") {
    let next = new Date(merged.next_renewal_at);
    let guard = 0;
    while (next.getTime() < now.getTime() - 86400000 && guard++ < 120) next = addCycle(next, merged.cycle as Exclude<BillingCycle, "unknown">);
    merged.next_renewal_at = next.toISOString();
  }

  db.prepare(
    `UPDATE subscriptions SET name = ?, plan = ?, kind = ?, amount = ?, currency = ?, cycle = ?, next_amount = ?, status = ?, started_at = ?,
       trial_ends_at = ?, next_renewal_at = ?, last_charged_at = ?, cancelled_at = ?, payment_method = ?, manage_url = ?, confidence = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.name,
    merged.plan,
    merged.kind,
    merged.amount,
    merged.currency,
    merged.cycle,
    nextAmount,
    merged.status,
    startedAt,
    trialEnd,
    merged.next_renewal_at,
    lastCharge?.occurred_at ?? sub.last_charged_at,
    cancelledAt,
    merged.payment_method,
    merged.manage_url,
    sub.source === "manual" ? 1 : confidence,
    now.toISOString(),
    id,
  );
}

export function recomputeAllSubscriptions(ctx: AppContext): void {
  const ids = ctx.db.prepare("SELECT id FROM subscriptions").all() as { id: number }[];
  for (const { id } of ids) recomputeSubscription(ctx, id);
}

export const SUBSCRIPTION_SELECT = `
  SELECT s.*, s.vendor_id AS vendor_id, ${VENDOR_COLUMNS},
    (SELECT COUNT(*) FROM charges c WHERE c.subscription_id = s.id AND c.status = 'posted' AND c.direction = 'out') AS charge_count,
    (SELECT COALESCE(SUM(c.amount), 0) FROM charges c WHERE c.subscription_id = s.id AND c.status = 'posted' AND c.direction = 'out') AS total_spent
  FROM subscriptions s LEFT JOIN vendors v ON v.id = s.vendor_id`;

type SubscriptionJoinRow = SubscriptionRow & {
  v_slug: string | null;
  v_name: string | null;
  v_domain: string | null;
  v_kind: string | null;
  v_color: string | null;
  charge_count: number;
  total_spent: number;
};

export function subscriptionFromRow(ctx: AppContext, row: SubscriptionJoinRow): SubscriptionDTO {
  const change = ctx.db
    .prepare(
      "SELECT old_amount, amount, currency, COALESCE(effective_at, occurred_at) AS at FROM subscription_events WHERE subscription_id = ? AND type = 'price_change' AND old_amount IS NOT NULL ORDER BY occurred_at DESC LIMIT 1",
    )
    .get(row.id) as { old_amount: number; amount: number; currency: string | null; at: string } | undefined;
  const recentChange = change && ctx.now().getTime() - new Date(change.at).getTime() < 200 * 86400000 ? change : undefined;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    plan: row.plan,
    kind: row.kind,
    vendor: vendorRefFromRow(row),
    amount: row.amount,
    currency: row.currency,
    cycle: row.cycle,
    monthlyCost: monthlyCost(row.amount, row.cycle),
    nextAmount: row.next_amount,
    status: row.status,
    startedAt: row.started_at,
    trialEndsAt: row.trial_ends_at,
    nextRenewalAt: row.next_renewal_at,
    lastChargedAt: row.last_charged_at,
    cancelledAt: row.cancelled_at,
    paymentMethod: row.payment_method,
    manageUrl: row.manage_url,
    source: row.source,
    notes: row.notes,
    muted: !!row.muted,
    confidence: row.confidence,
    chargeCount: row.charge_count,
    totalSpent: Math.round(row.total_spent * 100) / 100,
    priceChange: recentChange
      ? { from: recentChange.old_amount, to: recentChange.amount, currency: recentChange.currency ?? row.currency ?? "USD", at: recentChange.at }
      : null,
  };
}

export function listSubscriptions(ctx: AppContext): SubscriptionDTO[] {
  const rows = ctx.db.prepare(`${SUBSCRIPTION_SELECT} ORDER BY CASE s.status WHEN 'past_due' THEN 0 WHEN 'trial' THEN 1 WHEN 'active' THEN 2 ELSE 3 END, s.next_renewal_at IS NULL, s.next_renewal_at ASC`).all() as SubscriptionJoinRow[];
  return rows.map((r) => subscriptionFromRow(ctx, r));
}

export function getSubscription(ctx: AppContext, id: number): SubscriptionDTO | null {
  const row = ctx.db.prepare(`${SUBSCRIPTION_SELECT} WHERE s.id = ?`).get(id) as SubscriptionJoinRow | undefined;
  return row ? subscriptionFromRow(ctx, row) : null;
}

const OVERLAP_GROUPS: { label: string; kinds: string[]; slugs?: string[] }[] = [
  { label: "music streaming", kinds: ["music"] },
  { label: "video streaming", kinds: ["streaming"] },
  { label: "cloud storage", kinds: ["storage"] },
  { label: "AI assistants", kinds: ["ai"] },
  { label: "password managers", kinds: [], slugs: ["1password", "lastpass", "bitwarden"] },
  { label: "VPNs", kinds: ["vpn"] },
];

/** Practical money-saving observations derived from the subscription list. */
export function savingsInsights(subs: SubscriptionDTO[]): SavingsInsight[] {
  const out: SavingsInsight[] = [];
  const live = subs.filter((s) => s.status === "active" || s.status === "trial" || s.status === "past_due");
  for (const group of OVERLAP_GROUPS) {
    const members = live.filter((s) => (s.kind && group.kinds.includes(s.kind)) || (s.vendor && group.slugs?.includes(s.vendor.slug)));
    if (members.length >= 2) {
      const total = members.reduce((sum, s) => sum + (s.monthlyCost ?? 0), 0);
      const currency = members[0]!.currency ?? "USD";
      out.push({
        id: `overlap-${group.label}`,
        kind: "duplicate",
        title: `${members.length} ${group.label} subscriptions`,
        detail: `${members.map((m) => m.name).join(", ")} — together ${formatMoney(total, currency)}/mo. Keep the one you use most.`,
        amount: Math.round(total * 100) / 100,
        currency,
        subscriptionIds: members.map((m) => m.id),
      });
    }
  }
  for (const s of live) {
    if (s.priceChange && s.priceChange.to > s.priceChange.from) {
      const delta = s.priceChange.to - s.priceChange.from;
      out.push({
        id: `increase-${s.id}`,
        kind: "price_increase",
        title: `${s.name} went up ${formatMoney(delta, s.priceChange.currency)}`,
        detail: `${formatMoney(s.priceChange.from, s.priceChange.currency)} → ${formatMoney(s.priceChange.to, s.priceChange.currency)}${CYCLE_META[s.cycle].short}. That's ${formatMoney(delta * 12 * CYCLE_META[s.cycle].perMonth, s.priceChange.currency)} more per year.`,
        amount: Math.round(delta * 12 * CYCLE_META[s.cycle].perMonth * 100) / 100,
        currency: s.priceChange.currency,
        subscriptionIds: [s.id],
      });
    }
    if (s.status === "trial" && s.trialEndsAt) {
      out.push({
        id: `trial-${s.id}`,
        kind: "trial",
        title: `${s.name} trial converts to paid`,
        detail: `Decide before ${new Date(s.trialEndsAt).toDateString()}${s.amount ? ` — it becomes ${formatMoney(s.amount, s.currency)}${CYCLE_META[s.cycle].short}` : ""}.`,
        amount: s.amount,
        currency: s.currency,
        subscriptionIds: [s.id],
      });
    }
    if (s.status === "past_due") {
      out.push({
        id: `failed-${s.id}`,
        kind: "failed_payment",
        title: `${s.name} payment failed`,
        detail: "Update the card or cancel — services often pause after a few retries.",
        amount: s.amount,
        currency: s.currency,
        subscriptionIds: [s.id],
      });
    }
    if (s.cycle === "monthly" && s.amount && s.amount >= 8 && s.chargeCount >= 6) {
      const yearly = s.amount * 12;
      out.push({
        id: `annual-${s.id}`,
        kind: "annual_switch",
        title: `Pay ${s.name} yearly?`,
        detail: `You've paid monthly ${s.chargeCount}× (${formatMoney(yearly, s.currency)}/yr). Annual plans typically save ~15% ≈ ${formatMoney(yearly * 0.15, s.currency)}.`,
        amount: Math.round(yearly * 0.15 * 100) / 100,
        currency: s.currency,
        subscriptionIds: [s.id],
      });
    }
  }
  const lapsed = subs.filter((s) => s.status === "lapsed");
  if (lapsed.length > 0) {
    out.push({
      id: "lapsed",
      kind: "lapsed",
      title: `${lapsed.length} subscription${lapsed.length > 1 ? "s look" : " looks"} inactive`,
      detail: `${lapsed.map((s) => s.name).join(", ")} haven't billed in a while. Confirm they're cancelled or mark them as such.`,
      amount: null,
      currency: null,
      subscriptionIds: lapsed.map((s) => s.id),
    });
  }
  const rank: Record<SavingsInsight["kind"], number> = { failed_payment: 0, trial: 1, price_increase: 2, duplicate: 3, annual_switch: 4, lapsed: 5 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 8);
}
