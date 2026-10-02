import { formatMoney } from "../../shared/format.js";
import type { AppContext } from "../context.js";
import { createAlert } from "../services/alerts.js";
import type { FinAccountRow } from "./store.js";

const DAY = 86400000;

function accountLabel(a: Pick<FinAccountRow, "name" | "mask">): string {
  return a.mask ? `${a.name} ••${a.mask}` : a.name;
}

/** Alerts for newly stored bank transactions: large charges, fees and likely double charges. */
export function transactionAlerts(ctx: AppContext, chargeIds: number[], opts: { notify: boolean }): number {
  if (chargeIds.length === 0) return 0;
  // A first sync can insert thousands of rows; keep each IN (…) well under SQLite's variable limit.
  if (chargeIds.length > 500) {
    let total = 0;
    for (let i = 0; i < chargeIds.length; i += 500) total += transactionAlerts(ctx, chargeIds.slice(i, i + 500), opts);
    return total;
  }
  const settings = ctx.settings.get();
  const threshold = settings.notifications.largeTransactionThreshold;
  const recentCutoff = ctx.now().getTime() - 4 * DAY;
  let created = 0;
  const rows = ctx.db
    .prepare(
      `SELECT c.id, c.amount, c.currency, c.direction, c.kind, c.status, c.merchant, c.merchant_key, c.spend_category, c.occurred_at, c.vendor_id,
         a.name AS account_name, a.mask AS account_mask
       FROM charges c JOIN fin_accounts a ON a.id = c.fin_account_id WHERE c.id IN (${chargeIds.map(() => "?").join(",")})`,
    )
    .all(...chargeIds) as {
    id: number;
    amount: number;
    currency: string;
    direction: "in" | "out";
    kind: string;
    status: string;
    merchant: string;
    merchant_key: string;
    spend_category: string;
    occurred_at: string;
    vendor_id: number | null;
    account_name: string;
    account_mask: string | null;
  }[];
  for (const r of rows) {
    const recent = new Date(r.occurred_at).getTime() >= recentCutoff;
    const notify = opts.notify && recent;
    const account = accountLabel({ name: r.account_name, mask: r.account_mask });
    const facts = [
      { label: "Amount", value: formatMoney(r.amount, r.currency) },
      { label: "Merchant", value: r.merchant },
      { label: "Account", value: account },
      { label: "Date", value: r.occurred_at.slice(0, 10) },
    ];
    if (r.direction === "out" && threshold > 0 && r.amount >= threshold && ["purchase", "subscription", "bill_payment", "fee"].includes(r.kind) && recent) {
      if (
        createAlert(ctx, {
          fingerprint: `bank-large:${r.id}`,
          type: "finance.large_transaction",
          title: `${formatMoney(r.amount, r.currency)} at ${r.merchant}`,
          body: `A charge above your ${formatMoney(threshold, r.currency)} threshold posted to ${account}.`,
          facts,
          vendorId: r.vendor_id,
          entityType: "charge",
          entityId: r.id,
          actionUrl: `${ctx.config.appUrl}/money?tab=activity`,
          actionLabel: "See transactions",
          notify,
        })
      )
        created++;
    }
    if (r.kind === "fee" && r.direction === "out" && settings.banking.feeAlerts && recent) {
      if (
        createAlert(ctx, {
          fingerprint: `bank-fee:${r.id}`,
          type: "finance.fee",
          title: `${formatMoney(r.amount, r.currency)} fee on ${account}`,
          body: `“${r.merchant}”. Banks often waive a first overdraft, late or foreign-transaction fee if you call and ask.`,
          facts,
          entityType: "charge",
          entityId: r.id,
          actionUrl: `${ctx.config.appUrl}/money?tab=activity`,
          actionLabel: "See transactions",
          notify,
        })
      )
        created++;
    }
    if (settings.banking.duplicateAlerts && r.direction === "out" && r.amount >= 10 && ["purchase", "subscription"].includes(r.kind) && !["food", "transport"].includes(r.spend_category)) {
      const twin = ctx.db
        .prepare(
          `SELECT id FROM charges WHERE id != ? AND fin_account_id IS NOT NULL AND merchant_key = ? AND amount = ? AND currency = ? AND direction = 'out'
             AND status != 'refunded' AND ABS(julianday(occurred_at) - julianday(?)) <= 2 ORDER BY id LIMIT 1`,
        )
        .get(r.id, r.merchant_key, r.amount, r.currency, r.occurred_at) as { id: number } | undefined;
      if (twin) {
        const [a, b] = [Math.min(twin.id, r.id), Math.max(twin.id, r.id)];
        if (
          createAlert(ctx, {
            fingerprint: `bank-dup:${a}:${b}`,
            type: "finance.duplicate_charge",
            title: `${r.merchant} charged ${formatMoney(r.amount, r.currency)} twice`,
            body: "Two identical charges from the same merchant within two days. If you only bought once, ask the merchant (or your card issuer) to reverse one.",
            facts,
            vendorId: r.vendor_id,
            entityType: "charge",
            entityId: r.id,
            actionUrl: `${ctx.config.appUrl}/money?tab=activity`,
            actionLabel: "See transactions",
            notify,
          })
        )
          created++;
      }
    }
  }
  return created;
}

/** Low balances on bank accounts and high utilization on cards, at most once a day / month. */
export function balanceAlerts(ctx: AppContext, accounts: FinAccountRow[], opts: { notify: boolean }): number {
  const settings = ctx.settings.get().banking;
  const day = ctx.now().toISOString().slice(0, 10);
  let created = 0;
  for (const a of accounts) {
    if (a.hidden) continue;
    const label = accountLabel(a);
    if ((a.type === "checking" || a.type === "savings") && settings.lowBalanceThreshold > 0) {
      const balance = a.balance_available ?? a.balance_current;
      if (balance !== null && balance < settings.lowBalanceThreshold) {
        if (
          createAlert(ctx, {
            fingerprint: `bank-lowbal:${a.id}:${day}`,
            type: "finance.low_balance",
            title: `${label} is down to ${formatMoney(balance, a.currency)}`,
            body: `Below your ${formatMoney(settings.lowBalanceThreshold, a.currency)} low-balance threshold. Check upcoming bills and autopays before they bounce.`,
            facts: [
              { label: "Available", value: formatMoney(balance, a.currency) },
              { label: "Account", value: label },
            ],
            entityType: "fin_account",
            entityId: a.id,
            actionUrl: `${ctx.config.appUrl}/money?tab=accounts`,
            actionLabel: "See accounts",
            notify: opts.notify,
          })
        )
          created++;
      }
    }
    if (a.type === "credit" && settings.utilizationAlertPercent > 0 && a.credit_limit && a.balance_current !== null && a.credit_limit > 0) {
      const pct = (a.balance_current / a.credit_limit) * 100;
      if (pct >= settings.utilizationAlertPercent) {
        if (
          createAlert(ctx, {
            fingerprint: `bank-util:${a.id}:${day.slice(0, 7)}`,
            type: "finance.high_utilization",
            title: `${label} is at ${Math.round(pct)}% of its limit`,
            body: `${formatMoney(a.balance_current, a.currency)} of ${formatMoney(a.credit_limit, a.currency)}. Utilization above ~30% can weigh on your credit score; paying before the statement closes helps.`,
            facts: [
              { label: "Balance", value: formatMoney(a.balance_current, a.currency) },
              { label: "Limit", value: formatMoney(a.credit_limit, a.currency) },
            ],
            entityType: "fin_account",
            entityId: a.id,
            actionUrl: `${ctx.config.appUrl}/money?tab=accounts`,
            actionLabel: "See accounts",
            notify: opts.notify,
          })
        )
          created++;
      }
    }
  }
  return created;
}
