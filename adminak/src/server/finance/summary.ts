import { startOfZonedMonth } from "../../shared/time.js";
import type { BankingDTO, BankingProviders, BankingSummary, FinAccountDTO, FinConnectionDTO } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { SPEND_FILTER } from "../services/dashboard.js";
import { IMPORT_FORMATS } from "./import.js";
import type { FinAccountRow } from "./store.js";
import type { FinConnectionRow } from "./sync.js";

const DAY = 86400000;
const HISTORY_DAYS = 90;

export function bankingProviders(ctx: AppContext): BankingProviders {
  return {
    teller: {
      configured: !!ctx.config.teller,
      applicationId: ctx.config.teller?.applicationId ?? null,
      environment: ctx.config.teller?.environment ?? "development",
    },
    simplefin: { enabled: ctx.config.simplefinHosts.length > 0 },
    imports: { formats: IMPORT_FORMATS },
  };
}

/**
 * Daily end-of-day balances, walked back from the current balance through the account's
 * transactions (so the chart is full from the first refresh), with recorded points taking over
 * where we have them.
 */
function balanceHistory(ctx: AppContext, a: FinAccountRow): { day: string; balance: number }[] {
  if (a.balance_current === null) return [];
  const owedSide = a.type === "credit" || a.type === "loan";
  const end = new Date(a.balance_at ?? ctx.now().toISOString());
  const start = new Date(end.getTime() - HISTORY_DAYS * DAY);
  const rows = ctx.db
    .prepare("SELECT substr(occurred_at, 1, 10) AS day, SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS net FROM charges WHERE fin_account_id = ? AND status = 'posted' AND occurred_at >= ? GROUP BY day")
    .all(a.id, start.toISOString()) as { day: string; net: number }[];
  const netByDay = new Map(rows.map((r) => [r.day, r.net]));
  const recorded = new Map(
    (ctx.db.prepare("SELECT day, current FROM fin_balance_history WHERE fin_account_id = ? AND day >= ?").all(a.id, start.toISOString().slice(0, 10)) as { day: string; current: number | null }[])
      .filter((r) => r.current !== null)
      .map((r) => [r.day, r.current!]),
  );
  const out: { day: string; balance: number }[] = [];
  let balance = a.balance_current;
  for (let t = end.getTime(); t >= start.getTime(); t -= DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (recorded.has(day)) balance = recorded.get(day)!;
    out.push({ day, balance: Math.round(balance * 100) / 100 });
    // Undo this day's movement to get the previous day's closing balance. Money out of a card
    // raises what's owed, so on the owed side the sign is reversed.
    const net = netByDay.get(day) ?? 0;
    balance = owedSide ? balance + net : balance - net;
  }
  return out.reverse();
}

export function finAccountDTO(ctx: AppContext, a: FinAccountRow): FinAccountDTO {
  const stats = ctx.db.prepare("SELECT COUNT(*) AS n, MAX(occurred_at) AS last FROM charges WHERE fin_account_id = ?").get(a.id) as { n: number; last: string | null };
  return {
    id: a.id,
    connectionId: a.connection_id,
    name: a.name,
    institution: a.institution,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    currency: a.currency,
    balanceCurrent: a.balance_current,
    balanceAvailable: a.balance_available,
    creditLimit: a.credit_limit,
    balanceAt: a.balance_at,
    invertAmounts: !!a.invert_amounts,
    hidden: !!a.hidden,
    transactionCount: stats.n,
    lastTransactionAt: stats.last,
    history: balanceHistory(ctx, a),
  };
}

export function finConnectionDTO(ctx: AppContext, row: FinConnectionRow): FinConnectionDTO {
  const accounts = ctx.db.prepare("SELECT * FROM fin_accounts WHERE connection_id = ? ORDER BY type = 'credit', name").all(row.id) as FinAccountRow[];
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    institution: row.institution,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    syncing: ctx.runtime.bankSyncing.has(row.id),
    createdAt: row.created_at,
    accounts: accounts.map((a) => finAccountDTO(ctx, a)),
  };
}

export function buildBanking(ctx: AppContext): BankingDTO {
  const settings = ctx.settings.get();
  const currency = settings.profile.currency;
  const connections = (ctx.db.prepare("SELECT * FROM fin_connections ORDER BY provider = 'file', id").all() as FinConnectionRow[]).map((r) => finConnectionDTO(ctx, r));
  const accounts = connections.flatMap((c) => c.accounts).filter((a) => !a.hidden && a.currency === currency);
  if (accounts.length === 0) return { providers: bankingProviders(ctx), connections, summary: null, netWorthHistory: [] };

  const sum = (list: FinAccountDTO[], pick: (a: FinAccountDTO) => number | null) => Math.round(list.reduce((s, a) => s + (pick(a) ?? 0), 0) * 100) / 100;
  const cashAccounts = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const owedAccounts = accounts.filter((a) => a.type === "credit" || a.type === "loan");
  const cards = accounts.filter((a) => a.type === "credit" && a.creditLimit);
  const investments = accounts.filter((a) => a.type === "investment" || a.type === "other");
  const cash = sum(cashAccounts, (a) => a.balanceCurrent);
  const owed = sum(owedAccounts, (a) => a.balanceCurrent);
  const creditLimit = sum(cards, (a) => a.creditLimit);
  const cardOwed = sum(cards, (a) => a.balanceCurrent);

  const now = ctx.now();
  const monthStart = startOfZonedMonth(now, settings.profile.timezone, 0).toISOString();
  const monthSpend = (
    ctx.db.prepare(`SELECT COALESCE(SUM(c.amount), 0) AS total FROM charges c WHERE ${SPEND_FILTER} AND c.fin_account_id IS NOT NULL AND c.currency = ? AND c.occurred_at >= ?`).get(currency, monthStart) as {
      total: number;
    }
  ).total;
  const monthIncome = (
    ctx.db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM charges WHERE fin_account_id IS NOT NULL AND direction = 'in' AND kind = 'deposit' AND currency = ? AND occurred_at >= ?")
      .get(currency, monthStart) as { total: number }
  ).total;
  const since90 = new Date(now.getTime() - 90 * DAY).toISOString();
  const matchedReceipts = (ctx.db.prepare("SELECT COUNT(*) AS n FROM charges WHERE superseded_by IS NOT NULL AND occurred_at >= ?").get(since90) as { n: number }).n;
  const unmatchedTransactions = (
    ctx.db
      .prepare(
        "SELECT COUNT(*) AS n FROM charges b WHERE b.fin_account_id IS NOT NULL AND b.direction = 'out' AND b.kind IN ('purchase','subscription') AND b.occurred_at >= ? AND NOT EXISTS (SELECT 1 FROM charges e WHERE e.superseded_by = b.id)",
      )
      .get(since90) as { n: number }
  ).n;

  const summary: BankingSummary = {
    currency,
    cash,
    owed,
    netWorth: Math.round((cash + sum(investments, (a) => a.balanceCurrent) - owed) * 100) / 100,
    creditLimit,
    utilization: creditLimit > 0 ? Math.round((cardOwed / creditLimit) * 1000) / 10 : null,
    monthSpend: Math.round(monthSpend * 100) / 100,
    monthIncome: Math.round(monthIncome * 100) / 100,
    matchedReceipts,
    unmatchedTransactions,
  };

  // Net worth over time from the per-account histories (same day grid for every account).
  const days = new Map<string, { cash: number; owed: number }>();
  for (const a of accounts) {
    const owedSide = a.type === "credit" || a.type === "loan";
    for (const point of a.history) {
      const slot = days.get(point.day) ?? { cash: 0, owed: 0 };
      if (owedSide) slot.owed += point.balance;
      else slot.cash += point.balance;
      days.set(point.day, slot);
    }
  }
  const netWorthHistory = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, cash: Math.round(v.cash * 100) / 100, owed: Math.round(v.owed * 100) / 100 }));
  return { providers: bankingProviders(ctx), connections, summary, netWorthHistory };
}
