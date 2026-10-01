import { CYCLE_META } from "../../shared/catalog.js";
import { formatMoney, sumByCurrency } from "../../shared/format.js";
import { monthKey, startOfZonedMonth } from "../../shared/time.js";
import type {
  BillingCycle,
  Category,
  InsightDTO,
  LinkRef,
  MoneyTotal,
  MonthlySpend,
  OverviewDTO,
  SpendCategory,
  SyncHealth,
  TimelineItem,
  VendorRef,
} from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { getMeta, parseJson } from "../db/index.js";
import { queryAlerts } from "./alerts.js";
import { listSubscriptions, savingsInsights } from "./subscriptions.js";
import { VENDOR_COLUMNS, vendorRefFromRow } from "./vendors.js";

const DAY = 86400000;

interface InsightRow {
  id: number;
  message_id: number | null;
  vendor_id: number | null;
  category: Category;
  type: string;
  title: string;
  summary: string | null;
  amount: number | null;
  currency: string | null;
  occurs_at: string | null;
  status: string | null;
  group_key: string | null;
  data: string;
  links: string;
  archived: number;
  occurred_at: string;
  v_slug: string | null;
  v_name: string | null;
  v_domain: string | null;
  v_kind: string | null;
  v_color: string | null;
}

export const INSIGHT_SELECT = `SELECT i.*, ${VENDOR_COLUMNS} FROM insights i LEFT JOIN vendors v ON v.id = i.vendor_id`;

export function insightFromRow(row: InsightRow): InsightDTO {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    title: row.title,
    summary: row.summary,
    amount: row.amount,
    currency: row.currency,
    occursAt: row.occurs_at,
    status: row.status,
    groupKey: row.group_key,
    data: parseJson<Record<string, unknown>>(row.data, {}),
    links: parseJson<LinkRef[]>(row.links, []),
    archived: !!row.archived,
    occurredAt: row.occurred_at,
    vendor: vendorRefFromRow(row),
    messageId: row.message_id,
  };
}

export function queryInsights(ctx: AppContext, where: string, params: unknown[], limit = 200, order = "i.occurred_at DESC"): InsightDTO[] {
  return (ctx.db.prepare(`${INSIGHT_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ?`).all(...params, limit) as InsightRow[]).map(insightFromRow);
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export function buildTimeline(ctx: AppContext, from: Date, to: Date): TimelineItem[] {
  const db = ctx.db;
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const items: TimelineItem[] = [];
  const vendorOf = (row: { vendor_id: number | null; v_slug: string | null; v_name: string | null; v_domain: string | null; v_kind: string | null; v_color: string | null }): VendorRef | null =>
    vendorRefFromRow(row);

  const subs = db
    .prepare(
      `SELECT s.id, s.name, s.amount, s.currency, s.cycle, s.status, s.next_renewal_at, s.trial_ends_at, s.next_amount, s.vendor_id, ${VENDOR_COLUMNS}
       FROM subscriptions s LEFT JOIN vendors v ON v.id = s.vendor_id
       WHERE s.muted = 0 AND ((s.status IN ('active','past_due') AND s.next_renewal_at BETWEEN ? AND ?) OR (s.status = 'trial' AND s.trial_ends_at BETWEEN ? AND ?))`,
    )
    .all(fromIso, toIso, fromIso, toIso) as {
    id: number;
    name: string;
    amount: number | null;
    currency: string | null;
    cycle: BillingCycle;
    status: string;
    next_renewal_at: string | null;
    trial_ends_at: string | null;
    next_amount: number | null;
    vendor_id: number | null;
    v_slug: string | null;
    v_name: string | null;
    v_domain: string | null;
    v_kind: string | null;
    v_color: string | null;
  }[];
  for (const s of subs) {
    const trial = s.status === "trial";
    const at = trial ? s.trial_ends_at! : s.next_renewal_at!;
    items.push({
      id: `sub-${s.id}`,
      kind: trial ? "trial_end" : "renewal",
      title: trial ? `${s.name} trial ends` : `${s.name} renews`,
      subtitle: trial ? `Then ${s.amount !== null ? `${formatMoney(s.amount, s.currency)}${CYCLE_META[s.cycle].short}` : "paid"}` : CYCLE_META[s.cycle].label,
      at,
      allDay: true,
      amount: s.next_amount ?? s.amount,
      currency: s.currency,
      category: "subscriptions",
      severity: trial || s.status === "past_due" ? "high" : null,
      href: `/subscriptions?id=${s.id}`,
      vendor: vendorOf(s),
    });
  }

  const bills = db
    .prepare(
      `SELECT b.id, b.name, b.amount_due, b.currency, b.due_at, b.status, b.autopay, b.vendor_id, ${VENDOR_COLUMNS}
       FROM bills b LEFT JOIN vendors v ON v.id = b.vendor_id WHERE b.status IN ('due','scheduled','overdue') AND b.due_at BETWEEN ? AND ?`,
    )
    .all(new Date(from.getTime() - 30 * DAY).toISOString(), toIso) as {
    id: number;
    name: string;
    amount_due: number | null;
    currency: string | null;
    due_at: string;
    status: string;
    autopay: number;
    vendor_id: number | null;
    v_slug: string | null;
    v_name: string | null;
    v_domain: string | null;
    v_kind: string | null;
    v_color: string | null;
  }[];
  for (const b of bills) {
    if (b.due_at < fromIso && b.status !== "overdue") continue;
    items.push({
      id: `bill-${b.id}`,
      kind: "bill_due",
      title: b.status === "overdue" ? `${b.name} overdue` : `${b.name} due`,
      subtitle: b.autopay ? "Autopay scheduled" : b.status === "overdue" ? "Past due" : "Pay before the due date",
      at: b.due_at,
      allDay: true,
      amount: b.amount_due,
      currency: b.currency,
      category: "bills",
      severity: b.status === "overdue" ? "critical" : b.autopay ? null : "medium",
      href: `/money?bill=${b.id}`,
      vendor: vendorOf(b),
    });
  }

  const insights = queryInsights(
    ctx,
    "i.archived = 0 AND i.occurs_at BETWEEN ? AND ? AND i.category IN ('orders','travel','career','events','health')",
    [fromIso, toIso],
    400,
    "i.occurs_at ASC",
  );
  const seen = new Set<string>();
  for (const i of insights) {
    let kind: TimelineItem["kind"] | null = null;
    let href = "/";
    if (i.category === "orders" && ["shipped", "out_for_delivery", "delayed"].includes(i.type)) {
      kind = "delivery";
      href = "/orders";
    } else if (i.category === "travel" && ["flight", "checkin", "flight_change", "train"].includes(i.type)) {
      kind = "flight";
      href = "/travel";
    } else if (i.category === "travel" && ["hotel", "car_rental"].includes(i.type)) {
      kind = "stay";
      href = "/travel";
    } else if (i.category === "career" && i.type === "interview_request") {
      kind = "interview";
      href = "/career";
    } else if (i.category === "career" && i.type === "assessment") {
      kind = "deadline";
      href = "/career";
    } else if (i.category === "events") {
      kind = "event";
      href = "/life";
    } else if (i.category === "health" && i.type === "appointment") {
      kind = "appointment";
      href = "/life";
    }
    if (!kind) continue;
    const key = `${kind}:${i.groupKey ?? i.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `insight-${i.id}`,
      kind,
      title: i.title,
      subtitle: i.vendor?.name ?? null,
      at: i.occursAt!,
      allDay: i.occursAt!.endsWith("T12:00:00.000Z"),
      amount: kind === "stay" || kind === "flight" ? null : null,
      currency: null,
      category: i.category,
      severity: kind === "interview" ? "high" : null,
      href,
      vendor: i.vendor,
    });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

// ─── Money analytics ─────────────────────────────────────────────────────────

/** Spending = money out, excluding transfers between people and credit-card bill payments (already counted as purchases). */
// Paying a card statement isn't new spending — the card purchases were already counted. COALESCE keeps
// payments with no linked bill (bill_id NULL) from turning the whole predicate NULL and vanishing.
const CC_PAYMENT = `(c.kind = 'bill_payment' AND (COALESCE(c.bill_id IN (SELECT id FROM bills WHERE kind = 'credit_card'), 0)
  OR COALESCE((SELECT kind FROM vendors WHERE id = c.vendor_id) = 'card', 0)))`;
const SPEND_FILTER = `c.direction = 'out' AND c.status = 'posted' AND c.kind != 'transfer_out' AND NOT ${CC_PAYMENT}`;

export function spendTotals(ctx: AppContext, from: Date, to: Date): MoneyTotal[] {
  const rows = ctx.db
    .prepare(`SELECT c.currency, SUM(c.amount) AS total FROM charges c WHERE ${SPEND_FILTER} AND c.occurred_at >= ? AND c.occurred_at < ? GROUP BY c.currency`)
    .all(from.toISOString(), to.toISOString()) as { currency: string; total: number }[];
  return rows.map((r) => ({ currency: r.currency, amount: Math.round(r.total * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}

export function incomeTotals(ctx: AppContext, from: Date, to: Date): MoneyTotal[] {
  const rows = ctx.db
    .prepare(`SELECT currency, SUM(amount) AS total FROM charges WHERE direction = 'in' AND kind IN ('deposit') AND occurred_at >= ? AND occurred_at < ? GROUP BY currency`)
    .all(from.toISOString(), to.toISOString()) as { currency: string; total: number }[];
  return rows.map((r) => ({ currency: r.currency, amount: Math.round(r.total * 100) / 100 }));
}

export function monthlySpend(ctx: AppContext, months = 12): MonthlySpend[] {
  const settings = ctx.settings.get();
  const tz = settings.profile.timezone;
  const currency = settings.profile.currency;
  const now = ctx.now();
  const start = startOfZonedMonth(now, tz, -(months - 1));
  const rows = ctx.db
    .prepare(
      `SELECT c.occurred_at, c.amount, c.direction, c.kind, c.spend_category, c.currency, c.status,
         ${CC_PAYMENT} AS cc_payment
       FROM charges c WHERE c.occurred_at >= ? AND c.currency = ? AND c.status = 'posted'`,
    )
    .all(start.toISOString(), currency) as {
    occurred_at: string;
    amount: number;
    direction: "in" | "out";
    kind: string;
    spend_category: SpendCategory;
    currency: string;
    status: string;
    cc_payment: number;
  }[];
  const buckets = new Map<string, MonthlySpend>();
  for (let i = 0; i < months; i++) {
    const monthStart = startOfZonedMonth(now, tz, -(months - 1) + i);
    const key = monthKey(new Date(monthStart.getTime() + 2 * DAY), tz);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: tz }).format(new Date(monthStart.getTime() + 2 * DAY));
    buckets.set(key, { month: key, label, out: 0, in: 0, subscriptions: 0, byCategory: {} });
  }
  for (const r of rows) {
    const bucket = buckets.get(monthKey(new Date(r.occurred_at), tz));
    if (!bucket) continue;
    if (r.direction === "in") {
      if (r.kind === "deposit") bucket.in += r.amount;
      continue;
    }
    if (r.kind === "transfer_out" || r.cc_payment) continue;
    bucket.out += r.amount;
    if (r.kind === "subscription") bucket.subscriptions += r.amount;
    bucket.byCategory[r.spend_category] = (bucket.byCategory[r.spend_category] ?? 0) + r.amount;
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    out: Math.round(b.out * 100) / 100,
    in: Math.round(b.in * 100) / 100,
    subscriptions: Math.round(b.subscriptions * 100) / 100,
    byCategory: Object.fromEntries(Object.entries(b.byCategory).map(([k, v]) => [k, Math.round(v! * 100) / 100])),
  }));
}

export function spendByCategory(ctx: AppContext, from: Date, to: Date): { category: SpendCategory; total: number }[] {
  const currency = ctx.settings.get().profile.currency;
  const rows = ctx.db
    .prepare(`SELECT c.spend_category AS category, SUM(c.amount) AS total FROM charges c WHERE ${SPEND_FILTER} AND c.currency = ? AND c.occurred_at >= ? AND c.occurred_at < ? GROUP BY c.spend_category ORDER BY total DESC`)
    .all(currency, from.toISOString(), to.toISOString()) as { category: SpendCategory; total: number }[];
  return rows.map((r) => ({ category: r.category, total: Math.round(r.total * 100) / 100 }));
}

export function topMerchants(ctx: AppContext, from: Date, to: Date, limit = 8): { name: string; vendor: VendorRef | null; total: number; count: number; currency: string }[] {
  const currency = ctx.settings.get().profile.currency;
  const rows = ctx.db
    .prepare(
      `SELECT COALESCE(v.name, c.description) AS name, c.vendor_id, ${VENDOR_COLUMNS}, SUM(c.amount) AS total, COUNT(*) AS count
       FROM charges c LEFT JOIN vendors v ON v.id = c.vendor_id
       WHERE ${SPEND_FILTER} AND c.currency = ? AND c.occurred_at >= ? AND c.occurred_at < ?
       GROUP BY COALESCE(c.vendor_id, c.description) ORDER BY total DESC LIMIT ?`,
    )
    .all(currency, from.toISOString(), to.toISOString(), limit) as {
    name: string;
    vendor_id: number | null;
    v_slug: string | null;
    v_name: string | null;
    v_domain: string | null;
    v_kind: string | null;
    v_color: string | null;
    total: number;
    count: number;
  }[];
  return rows.map((r) => ({ name: r.name, vendor: vendorRefFromRow(r), total: Math.round(r.total * 100) / 100, count: r.count, currency }));
}

export function subscriptionMonthlyTotals(ctx: AppContext): { totals: MoneyTotal[]; active: number; trials: number } {
  const subs = listSubscriptions(ctx).filter((s) => ["active", "trial", "past_due"].includes(s.status) && !s.muted);
  const paying = subs.filter((s) => s.status !== "trial");
  return {
    totals: sumByCurrency(paying, (s) => s.monthlyCost, (s) => s.currency),
    active: paying.length,
    trials: subs.filter((s) => s.status === "trial").length,
  };
}

// ─── Career pipeline ─────────────────────────────────────────────────────────

const STAGE_ORDER = ["outreach", "applied", "in_review", "assessment", "interviewing", "offer", "rejected"];

export function careerSummary(ctx: AppContext): { active: number; applied: number; interviewing: number; offers: number; rejected: number } {
  const rows = ctx.db
    .prepare(
      "SELECT group_key, status, occurred_at FROM insights WHERE category = 'career' AND archived = 0 AND group_key IS NOT NULL AND status NOT IN ('alert','network','other') ORDER BY occurred_at ASC",
    )
    .all() as { group_key: string; status: string; occurred_at: string }[];
  const latest = new Map<string, string>();
  for (const r of rows) {
    if (!STAGE_ORDER.includes(r.status)) continue;
    const prev = latest.get(r.group_key);
    if (!prev) {
      latest.set(r.group_key, r.status);
      continue;
    }
    // Later emails win, but outreach never regresses a pipeline and an offer stays until it's closed.
    if (r.status === "outreach") continue;
    if (prev === "offer" && r.status !== "rejected") continue;
    latest.set(r.group_key, r.status);
  }
  const stages = [...latest.values()];
  return {
    active: stages.filter((s) => ["applied", "in_review", "assessment", "interviewing", "offer"].includes(s)).length,
    applied: stages.filter((s) => s === "applied" || s === "in_review").length,
    interviewing: stages.filter((s) => s === "interviewing" || s === "assessment").length,
    offers: stages.filter((s) => s === "offer").length,
    rejected: stages.filter((s) => s === "rejected").length,
  };
}

// ─── Sync health ─────────────────────────────────────────────────────────────

export function syncHealth(ctx: AppContext): SyncHealth {
  const row = ctx.db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(status != 'paused') AS active, SUM(status = 'error') AS errors, MAX(last_success_at) AS last
       FROM accounts WHERE provider != 'webhook'`,
    )
    .get() as { total: number; active: number | null; errors: number | null; last: string | null };
  const interval = ctx.settings.get().scanning.intervalMinutes;
  return {
    accounts: row.total,
    activeAccounts: row.active ?? 0,
    errorAccounts: row.errors ?? 0,
    lastSyncAt: row.last,
    syncing: ctx.runtime.syncing.size > 0,
    nextSyncAt: row.last ? new Date(new Date(row.last).getTime() + interval * 60000).toISOString() : null,
  };
}

// ─── Overview ────────────────────────────────────────────────────────────────

export function buildOverview(ctx: AppContext): OverviewDTO {
  const settings = ctx.settings.get();
  const tz = settings.profile.timezone;
  const now = ctx.now();
  const monthStart = startOfZonedMonth(now, tz, 0);
  const prevMonthStart = startOfZonedMonth(now, tz, -1);
  const sameDayLastMonth = new Date(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()));
  const subs = subscriptionMonthlyTotals(ctx);
  const upcoming = buildTimeline(ctx, now, new Date(now.getTime() + 14 * DAY));
  const dueSoon = upcoming.filter((u) => (u.kind === "bill_due" || u.kind === "renewal") && new Date(u.at).getTime() <= now.getTime() + 7 * DAY);
  const openAlerts = ctx.db
    .prepare("SELECT COUNT(*) AS total, SUM(severity = 'critical') AS critical, SUM(severity = 'high') AS high FROM alerts WHERE status IN ('new','read')")
    .get() as { total: number; critical: number | null; high: number | null };
  const counts = ctx.db.prepare("SELECT COUNT(*) AS total, SUM(received_at >= ?) AS today FROM messages").get(new Date(now.getTime() - DAY).toISOString()) as {
    total: number;
    today: number | null;
  };
  const categoryCounts = Object.fromEntries(
    (ctx.db.prepare("SELECT category, COUNT(*) AS n FROM messages WHERE received_at >= ? GROUP BY category").all(new Date(now.getTime() - 30 * DAY).toISOString()) as { category: Category; n: number }[]).map(
      (r) => [r.category, r.n],
    ),
  );
  const briefingRaw = getMeta(ctx.db, "briefing");
  const briefing = briefingRaw ? parseJson<{ text: string; generatedAt: string; source: "ai" | "rules" } | null>(briefingRaw, null) : null;
  const deliveries = queryInsights(
    ctx,
    "i.category = 'orders' AND i.archived = 0 AND i.type IN ('shipped','out_for_delivery','delayed') AND i.occurred_at >= ? AND (i.group_key IS NULL OR i.group_key NOT IN (SELECT group_key FROM insights WHERE category = 'orders' AND type = 'delivered' AND group_key IS NOT NULL))",
    [new Date(now.getTime() - 10 * DAY).toISOString()],
    6,
  );
  const security = queryInsights(ctx, "i.category = 'security' AND i.type != 'verification_code' AND i.occurred_at >= ?", [new Date(now.getTime() - 14 * DAY).toISOString()], 5);
  return {
    generatedAt: now.toISOString(),
    name: settings.profile.name,
    baseCurrency: settings.profile.currency,
    kpis: {
      monthlySubscriptions: subs.totals,
      activeSubscriptions: subs.active,
      trials: subs.trials,
      dueNext7: { count: dueSoon.length, total: sumByCurrency(dueSoon, (d) => d.amount, (d) => d.currency) },
      openAlerts: { total: openAlerts.total, critical: openAlerts.critical ?? 0, high: openAlerts.high ?? 0 },
      spendThisMonth: spendTotals(ctx, monthStart, new Date(now.getTime() + 1)),
      spendLastMonth: spendTotals(ctx, prevMonthStart, sameDayLastMonth),
      incomeThisMonth: incomeTotals(ctx, monthStart, new Date(now.getTime() + 1)),
      emailsAnalyzed: counts.total,
      emailsToday: counts.today ?? 0,
    },
    spendTrend: monthlySpend(ctx, 12),
    spendByCategory: spendByCategory(ctx, new Date(now.getTime() - 30 * DAY), new Date(now.getTime() + 1)),
    attention: queryAlerts(ctx, { status: "open", severity: ["critical", "high"], limit: 6 }),
    upcoming,
    savings: savingsInsights(listSubscriptions(ctx)),
    career: careerSummary(ctx),
    deliveries,
    security: { recent: security, openCritical: (ctx.db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE category = 'security' AND severity = 'critical' AND status IN ('new','read')").get() as { n: number }).n },
    sync: syncHealth(ctx),
    briefing,
    categoryCounts,
  };
}
