import type { ChargeKind, FinAccountType, SpendCategory } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { colorFor, slugify } from "../intel/vendor-resolve.js";
import { upsertVendor } from "../services/vendors.js";
import { classifyTransaction, cleanMerchant, looksLikeCardPayment, merchantKey, merchantVendor } from "./merchant.js";
import type { BankAccountInput, BankTxnInput } from "./types.js";

export interface FinAccountRow {
  id: number;
  connection_id: number;
  external_id: string;
  name: string;
  institution: string | null;
  type: FinAccountType;
  subtype: string | null;
  mask: string | null;
  currency: string;
  balance_current: number | null;
  balance_available: number | null;
  credit_limit: number | null;
  balance_at: string | null;
  invert_amounts: number;
  hidden: number;
  created_at: string;
  updated_at: string;
}

/**
 * Card feeds disagree on sign conventions. For a new card account, look at its first batch: card
 * payments must be inflows and most rows are purchases (outflows). Bank accounts are never flipped.
 */
export function detectInvert(type: FinAccountType, txns: Pick<BankTxnInput, "amount" | "description">[]): boolean {
  if (type !== "credit" && type !== "loan") return false;
  if (txns.length === 0) return false;
  const payments = txns.filter((t) => looksLikeCardPayment(t.description));
  if (payments.length > 0) return payments.filter((t) => t.amount < 0).length > payments.length / 2;
  return txns.filter((t) => t.amount > 0).length > txns.length * 0.8;
}

/** Inserts or refreshes an account; returns its row. New accounts take `invert` from detectInvert. */
export function upsertFinAccount(ctx: AppContext, connectionId: number, input: BankAccountInput, invert: boolean): { row: FinAccountRow; created: boolean } {
  const now = ctx.now().toISOString();
  const existing = ctx.db.prepare("SELECT * FROM fin_accounts WHERE connection_id = ? AND external_id = ?").get(connectionId, input.externalId) as FinAccountRow | undefined;
  if (existing) {
    ctx.db
      .prepare(
        `UPDATE fin_accounts SET institution = COALESCE(?, institution), subtype = COALESCE(?, subtype), mask = COALESCE(?, mask), currency = ?,
           balance_current = COALESCE(?, balance_current), balance_available = COALESCE(?, balance_available), credit_limit = COALESCE(?, credit_limit),
           balance_at = COALESCE(?, balance_at), updated_at = ? WHERE id = ?`,
      )
      .run(
        input.institution,
        input.subtype ?? null,
        input.mask ?? null,
        input.currency,
        input.balanceCurrent ?? null,
        input.balanceAvailable ?? null,
        input.creditLimit ?? null,
        input.balanceAt ?? null,
        now,
        existing.id,
      );
    return { row: ctx.db.prepare("SELECT * FROM fin_accounts WHERE id = ?").get(existing.id) as FinAccountRow, created: false };
  }
  const id = Number(
    ctx.db
      .prepare(
        `INSERT INTO fin_accounts(connection_id, external_id, name, institution, type, subtype, mask, currency, balance_current, balance_available, credit_limit, balance_at, invert_amounts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        connectionId,
        input.externalId,
        input.name.slice(0, 120),
        input.institution,
        input.type,
        input.subtype ?? null,
        input.mask ?? null,
        input.currency,
        input.balanceCurrent ?? null,
        input.balanceAvailable ?? null,
        input.creditLimit ?? null,
        input.balanceAt ?? null,
        invert ? 1 : 0,
        now,
        now,
      ).lastInsertRowid,
  );
  return { row: ctx.db.prepare("SELECT * FROM fin_accounts WHERE id = ?").get(id) as FinAccountRow, created: true };
}

/** Today's balance point for the account's history chart. */
export function recordBalance(ctx: AppContext, account: FinAccountRow): void {
  if (account.balance_current === null) return;
  const day = (account.balance_at ?? ctx.now().toISOString()).slice(0, 10);
  ctx.db
    .prepare(
      "INSERT INTO fin_balance_history(fin_account_id, day, current, available) VALUES (?, ?, ?, ?) ON CONFLICT(fin_account_id, day) DO UPDATE SET current = excluded.current, available = excluded.available",
    )
    .run(account.id, day, account.balance_current, account.balance_available);
}

export interface MerchantRule {
  merchant_key: string;
  spend_category: SpendCategory | null;
  kind: ChargeKind | null;
  vendor_id: number | null;
  source: string;
}

export function loadMerchantRules(ctx: AppContext): Map<string, MerchantRule> {
  const rows = ctx.db.prepare("SELECT merchant_key, spend_category, kind, vendor_id, source FROM merchant_rules").all() as MerchantRule[];
  return new Map(rows.map((r) => [r.merchant_key, r]));
}

/** Known directory vendor, or an existing vendor (from email) with the same slug. Unknown merchants stay unlinked. */
function vendorFor(ctx: AppContext, merchant: string, cache: Map<string, { id: number; kind: string | null } | null>): { id: number; kind: string | null } | null {
  const key = merchant.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  let result: { id: number; kind: string | null } | null = null;
  const known = merchantVendor(merchant);
  if (known) {
    const id = upsertVendor(
      ctx.db,
      { slug: known.slug, name: known.name, domain: known.domains[0] ?? null, kind: known.kind, category: known.category, manageUrl: known.manageUrl ?? null, color: known.color ?? colorFor(known.slug), known: true },
      ctx.now().toISOString(),
    );
    result = { id, kind: known.kind };
  } else {
    const row = ctx.db.prepare("SELECT id, kind FROM vendors WHERE slug = ?").get(slugify(merchant)) as { id: number; kind: string | null } | undefined;
    result = row ?? null;
  }
  cache.set(key, result);
  return result;
}

export interface StoreStats {
  inserted: number;
  updated: number;
  duplicates: number;
  insertedIds: number[];
  minDate: string | null;
  maxDate: string | null;
}

/**
 * Upserts one account's transactions into `charges`. Re-fetches update status/amount/date of the
 * same transaction (pending → posted) but never overwrite a category the user picked.
 */
export function storeTransactions(
  ctx: AppContext,
  account: FinAccountRow,
  txns: Omit<BankTxnInput, "accountExternalId">[],
  source: "bank" | "import",
): StoreStats {
  const stats: StoreStats = { inserted: 0, updated: 0, duplicates: 0, insertedIds: [], minDate: null, maxDate: null };
  const rules = loadMerchantRules(ctx);
  const vendorCache = new Map<string, { id: number; kind: string | null } | null>();
  const now = ctx.now().toISOString();
  const findExisting = ctx.db.prepare("SELECT id, category_source FROM charges WHERE fin_account_id = ? AND external_id = ?");
  // A statement imported into an account that also has a live feed: same money, different ids.
  const fuzzyDuplicate = ctx.db.prepare(
    `SELECT id FROM charges WHERE fin_account_id = ? AND external_id != ? AND amount = ? AND direction = ?
       AND ABS(julianday(occurred_at) - julianday(?)) <= 2 AND (merchant_key = ? OR source = 'bank') AND id <= ? LIMIT 1`,
  );
  // Only rows that existed before this batch count as duplicates: two identical coffees in one file are two coffees.
  const lastIdBefore = (ctx.db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM charges").get() as { id: number }).id;
  const insert = ctx.db.prepare(
    `INSERT INTO charges(vendor_id, kind, spend_category, description, amount, currency, direction, status, payment_method, occurred_at, source, created_at,
       fin_account_id, external_id, merchant, merchant_key, raw_description, category_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = ctx.db.prepare(
    `UPDATE charges SET amount = ?, direction = ?, status = ?, occurred_at = ?, raw_description = ?, merchant = ?, merchant_key = ?,
       description = CASE WHEN category_source = 'user' THEN description ELSE ? END,
       kind = CASE WHEN category_source IN ('user','rule') THEN kind ELSE ? END,
       spend_category = CASE WHEN category_source IN ('user','rule','ai') THEN spend_category ELSE ? END,
       vendor_id = COALESCE(vendor_id, ?)
     WHERE id = ?`,
  );
  const sign = account.invert_amounts ? -1 : 1;
  const payment = account.mask ? `${account.institution ?? account.name} ••${account.mask}` : (account.institution ?? account.name);

  ctx.db.transaction(() => {
    for (const t of txns) {
      const amount = Math.round(t.amount * sign * 100) / 100;
      if (!amount) continue;
      const merchant = cleanMerchant(t.merchant && t.merchant.trim().length > 1 ? t.merchant : t.description);
      const key = merchantKey(merchant);
      const vendor = vendorFor(ctx, merchant, vendorCache);
      const auto = classifyTransaction({ description: t.description, merchant, amount, accountType: account.type, bankCategory: t.category, bankType: t.type, vendorKind: vendor?.kind });
      const rule = rules.get(key);
      const kind: ChargeKind = rule?.kind && !["card_payment", "transfer_in", "transfer_out"].includes(auto.kind) ? rule.kind : auto.kind;
      const spend: SpendCategory = rule?.spend_category && auto.kind !== "card_payment" ? rule.spend_category : auto.spend;
      const categorySource = rule && (rule.kind || rule.spend_category) ? (rule.source === "ai" ? "ai" : "rule") : auto.source;
      const vendorId = rule?.vendor_id ?? vendor?.id ?? null;
      const direction = amount < 0 ? "out" : "in";
      const status = t.pending ? "pending" : "posted";
      const day = t.date.slice(0, 10);
      if (!stats.minDate || day < stats.minDate) stats.minDate = day;
      if (!stats.maxDate || day > stats.maxDate) stats.maxDate = day;

      const existing = findExisting.get(account.id, t.externalId) as { id: number; category_source: string | null } | undefined;
      if (existing && source === "import") {
        stats.duplicates++;
        continue;
      }
      if (existing) {
        update.run(Math.abs(amount), direction, status, t.date, t.description.slice(0, 300), merchant, key, merchant.slice(0, 200), kind, spend, vendorId, existing.id);
        stats.updated++;
        continue;
      }
      if (source === "import" && fuzzyDuplicate.get(account.id, t.externalId, Math.abs(amount), direction, t.date, key, lastIdBefore)) {
        stats.duplicates++;
        continue;
      }
      const result = insert.run(
        vendorId,
        kind,
        spend,
        merchant.slice(0, 200),
        Math.abs(amount),
        account.currency,
        direction,
        status,
        payment,
        t.date,
        source,
        now,
        account.id,
        t.externalId,
        merchant,
        key,
        t.description.slice(0, 300),
        categorySource,
      );
      stats.inserted++;
      stats.insertedIds.push(Number(result.lastInsertRowid));
    }
  })();
  return stats;
}

/** Pending rows the bank no longer reports (they posted under a new id, or were voided). */
export function removeStalePending(ctx: AppContext, accountId: number, seen: Set<string>, windowStart: string | null): number {
  const rows = ctx.db
    .prepare("SELECT id, external_id FROM charges WHERE fin_account_id = ? AND status = 'pending' AND (? IS NULL OR occurred_at >= ?)")
    .all(accountId, windowStart, windowStart) as { id: number; external_id: string }[];
  const stale = rows.filter((r) => !seen.has(r.external_id)).map((r) => r.id);
  if (stale.length) ctx.db.prepare(`DELETE FROM charges WHERE id IN (${stale.map(() => "?").join(",")})`).run(...stale);
  return stale.length;
}

/** Flips every stored transaction of an account (the user said the signs were backwards). */
export function flipAccountSigns(ctx: AppContext, account: FinAccountRow): void {
  const rows = ctx.db.prepare("SELECT id, raw_description, merchant, direction, amount FROM charges WHERE fin_account_id = ?").all(account.id) as {
    id: number;
    raw_description: string | null;
    merchant: string | null;
    direction: "in" | "out";
    amount: number;
  }[];
  const update = ctx.db.prepare("UPDATE charges SET direction = ?, kind = CASE WHEN category_source IN ('user','rule') THEN kind ELSE ? END, spend_category = CASE WHEN category_source IN ('user','rule','ai') THEN spend_category ELSE ? END WHERE id = ?");
  ctx.db.transaction(() => {
    for (const r of rows) {
      const signed = r.direction === "out" ? r.amount : -r.amount;
      const merchant = r.merchant ?? "";
      const vendor = merchantVendor(merchant);
      const auto = classifyTransaction({ description: r.raw_description ?? merchant, merchant, amount: signed, accountType: account.type, vendorKind: vendor?.kind });
      update.run(signed < 0 ? "out" : "in", auto.kind, auto.spend, r.id);
    }
  })();
}

/** Applies a merchant rule to everything already stored for that merchant (except per-transaction user edits). */
export function applyMerchantRule(ctx: AppContext, rule: Pick<MerchantRule, "merchant_key" | "spend_category" | "kind" | "vendor_id">, source: "rule" | "ai"): number {
  const result = ctx.db
    .prepare(
      `UPDATE charges SET spend_category = COALESCE(?, spend_category),
         kind = CASE WHEN ? IS NOT NULL AND kind NOT IN ('card_payment','transfer_in','transfer_out') THEN ? ELSE kind END,
         vendor_id = COALESCE(?, vendor_id), category_source = ?
       WHERE merchant_key = ? AND fin_account_id IS NOT NULL AND COALESCE(category_source, '') != 'user'
         AND (? = 'rule' OR COALESCE(category_source, '') NOT IN ('rule'))`,
    )
    .run(rule.spend_category, rule.kind, rule.kind, rule.vendor_id, source, rule.merchant_key, source);
  return result.changes;
}
