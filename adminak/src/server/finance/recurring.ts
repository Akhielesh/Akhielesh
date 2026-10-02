import { CYCLE_DAYS, CYCLE_META } from "../../shared/catalog.js";
import { formatMoney } from "../../shared/format.js";
import type { BillingCycle } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { cycleFromGap } from "../intel/analyze.js";
import { createAlert } from "../services/alerts.js";
import { recomputeSubscription } from "../services/subscriptions.js";

// Subscriptions that never email a receipt (gyms, app-store renewals billed to a card, local
// services) only show up in the bank feed. Find merchants that charge about the same amount on a
// steady schedule and track them like any other subscription.

const DAY = 86400000;

interface Row {
  id: number;
  amount: number;
  currency: string;
  occurred_at: string;
  merchant: string;
  merchant_key: string;
  vendor_id: number | null;
  vendor_kind: string | null;
  subscription_id: number | null;
  spend_category: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface RecurringFinding {
  merchantKey: string;
  merchant: string;
  cycle: Exclude<BillingCycle, "unknown">;
  amount: number;
  currency: string;
  chargeIds: number[];
  lastAt: string;
}

/** Pure detection over a merchant's charge history (oldest first). */
export function detectCycle(rows: Pick<Row, "amount" | "occurred_at">[]): { cycle: Exclude<BillingCycle, "unknown">; amount: number } | null {
  if (rows.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) gaps.push((new Date(rows[i]!.occurred_at).getTime() - new Date(rows[i - 1]!.occurred_at).getTime()) / DAY);
  const gap = median(gaps);
  const found = cycleFromGap(gap);
  if (!found || found === "unknown") return null;
  const cycle: Exclude<BillingCycle, "unknown"> = found;
  const minCount = cycle === "weekly" ? 5 : cycle === "monthly" ? 3 : 2;
  if (rows.length < minCount) return null;
  // Regular: every gap within a few days of the cycle (a week of slack for long cycles).
  const slack = cycle === "weekly" ? 2 : cycle === "monthly" ? 5 : 10;
  if (gaps.some((g) => Math.abs(g - CYCLE_DAYS[cycle]) > slack)) return null;
  // Steady price: the latest few within 15% of their median (allows one price change).
  const recent = rows.slice(-Math.min(rows.length, 4)).map((r) => r.amount);
  const typical = median(recent);
  if (recent.some((a) => Math.abs(a - typical) > typical * 0.15)) return null;
  return { cycle, amount: rows.at(-1)!.amount };
}

/** Finds bank-only recurring charges and files them as subscriptions. Returns how many were created. */
export function detectRecurring(ctx: AppContext, opts: { notify: boolean }): number {
  const now = ctx.now();
  const rows = ctx.db
    .prepare(
      `SELECT c.id, c.amount, c.currency, c.occurred_at, c.merchant, c.merchant_key, c.vendor_id, v.kind AS vendor_kind, c.subscription_id, c.spend_category
       FROM charges c LEFT JOIN vendors v ON v.id = c.vendor_id
       WHERE c.fin_account_id IS NOT NULL AND c.direction = 'out' AND c.status = 'posted' AND c.merchant_key IS NOT NULL
         AND c.kind IN ('purchase','subscription') AND c.spend_category NOT IN ('food','transport','transfers','travel','bills','income')
         AND c.occurred_at >= ?
       ORDER BY c.merchant_key, c.occurred_at`,
    )
    .all(new Date(now.getTime() - 400 * DAY).toISOString()) as Row[];
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(`${r.merchant_key}|${r.currency}`, [...(groups.get(`${r.merchant_key}|${r.currency}`) ?? []), r]);

  let created = 0;
  for (const group of groups.values()) {
    // Already tracked (matched to an email subscription, or found earlier).
    const tracked = group.find((r) => r.subscription_id)?.subscription_id ?? null;
    const found = detectCycle(group);
    if (!found) continue;
    const last = group.at(-1)!;
    // Stale patterns (stopped months ago) aren't worth a new subscription.
    if (now.getTime() - new Date(last.occurred_at).getTime() > CYCLE_DAYS[found.cycle] * 1.75 * DAY && !tracked) continue;

    let subId = tracked;
    if (!subId && last.vendor_id) {
      subId = (ctx.db.prepare("SELECT id FROM subscriptions WHERE vendor_id = ? AND status NOT IN ('cancelled') ORDER BY updated_at DESC LIMIT 1").get(last.vendor_id) as { id: number } | undefined)?.id ?? null;
    }
    const key = `bank:${last.merchant_key}`;
    let isNew = false;
    if (!subId) {
      const existing = ctx.db.prepare("SELECT id FROM subscriptions WHERE key = ?").get(key) as { id: number } | undefined;
      if (existing) subId = existing.id;
      else {
        const nowIso = now.toISOString();
        subId = Number(
          ctx.db
            .prepare(
              `INSERT INTO subscriptions(key, vendor_id, name, kind, amount, currency, cycle, status, source, confidence, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'detected', 0.7, ?, ?, ?)`,
            )
            .run(key, last.vendor_id, last.merchant, last.vendor_kind, found.amount, last.currency, found.cycle, "Found in your bank transactions (no receipts in your mail).", nowIso, nowIso).lastInsertRowid,
        );
        isNew = true;
        created++;
      }
    }
    const ids = group.filter((r) => !r.subscription_id).map((r) => r.id);
    if (ids.length) {
      ctx.db
        .prepare(`UPDATE charges SET subscription_id = ?, kind = CASE WHEN category_source IN ('user','rule') THEN kind ELSE 'subscription' END, spend_category = CASE WHEN category_source IN ('user','rule','ai') THEN spend_category ELSE 'subscriptions' END WHERE id IN (${ids.map(() => "?").join(",")})`)
        .run(subId, ...ids);
    }
    recomputeSubscription(ctx, subId);
    if (isNew) {
      createAlert(ctx, {
        fingerprint: `bank-recurring:${key}`,
        type: "subscription.new",
        title: `${last.merchant} charges you ${formatMoney(found.amount, last.currency)}${CYCLE_META[found.cycle].short}`,
        body: `Found ${group.length} ${CYCLE_META[found.cycle].label.toLowerCase()} charges from ${last.merchant} in your bank feed with no receipts in your mail. It's now tracked under Subscriptions.`,
        facts: [
          { label: "Merchant", value: last.merchant },
          { label: "Amount", value: formatMoney(found.amount, last.currency) },
          { label: "Charges found", value: String(group.length) },
        ],
        vendorId: last.vendor_id,
        entityType: "subscription",
        entityId: subId,
        actionUrl: `${ctx.config.appUrl}/subscriptions?open=${subId}`,
        actionLabel: "Review subscription",
        notify: opts.notify,
      });
    }
  }
  return created;
}
