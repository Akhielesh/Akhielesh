import type { AppContext } from "../context.js";
import { normalizeName } from "../intel/vendor-resolve.js";
import { recomputeSubscription } from "../services/subscriptions.js";

// The same purchase often shows up twice: a receipt (or card alert) in the mailbox and the
// transaction in the bank feed. The bank row is the money that actually moved, so it becomes the
// record that counts; the email row is kept as its receipt (superseded_by → bank row) and lends
// it what only the email knows — the vendor, subscription and bill it belongs to.

const DAY = 86400000;

interface BankRow {
  id: number;
  amount: number;
  currency: string;
  direction: "in" | "out";
  occurred_at: string;
  vendor_id: number | null;
  merchant_key: string | null;
  merchant: string | null;
  kind: string;
  category_source: string | null;
}

interface EmailRow {
  id: number;
  amount: number;
  currency: string;
  direction: "in" | "out";
  occurred_at: string;
  vendor_id: number | null;
  description: string;
  vendor_name: string | null;
  subscription_id: number | null;
  bill_id: number | null;
  spend_category: string;
  kind: string;
  source: string;
}

function tokens(text: string | null | undefined): Set<string> {
  return new Set(
    normalizeName(text ?? "")
      .split(" ")
      .filter((t) => t.length >= 3 && !["the", "and", "com", "www", "payment", "purchase", "online", "store", "inc"].includes(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t) || [...b].some((u) => u.length >= 4 && t.length >= 4 && (u.startsWith(t) || t.startsWith(u)))) n++;
  return n;
}

/** Score for "this email charge is the receipt for this bank transaction", or null when it can't be. */
export function matchScore(bank: BankRow, email: EmailRow): number | null {
  if (bank.currency !== email.currency || bank.direction !== email.direction) return null;
  if (Math.round(bank.amount * 100) !== Math.round(email.amount * 100)) return null;
  // Banks post a day or three after the receipt; card alerts arrive within minutes.
  const lag = (new Date(bank.occurred_at).getTime() - new Date(email.occurred_at).getTime()) / DAY;
  if (lag < -2.5 || lag > 6.5) return null;
  const sameVendor = !!bank.vendor_id && bank.vendor_id === email.vendor_id;
  if (bank.vendor_id && email.vendor_id && !sameVendor) return null;
  const nameOverlap = overlap(tokens(bank.merchant ?? bank.merchant_key), tokens(`${email.vendor_name ?? ""} ${email.description}`));
  const evidence = sameVendor || nameOverlap > 0;
  // A card alert from the bank itself names the merchant loosely; accept close, unique amounts.
  if (!evidence && !(email.source === "card_alert" && Math.abs(lag) <= 2)) return null;
  return (sameVendor ? 3 : 0) + Math.min(2, nameOverlap) + (1 - Math.min(Math.abs(lag), 6) / 6);
}

/** Links bank transactions to their email receipts. Returns the number of new matches. */
export function reconcileCharges(ctx: AppContext, since: Date): number {
  const sinceIso = new Date(since.getTime() - 7 * DAY).toISOString();
  const banks = ctx.db
    .prepare(
      `SELECT b.id, b.amount, b.currency, b.direction, b.occurred_at, b.vendor_id, b.merchant_key, b.merchant, b.kind, b.category_source
       FROM charges b
       WHERE b.fin_account_id IS NOT NULL AND b.status IN ('posted','pending') AND b.occurred_at >= ?
         AND b.kind NOT IN ('card_payment','transfer_in','transfer_out')
         AND NOT EXISTS (SELECT 1 FROM charges e WHERE e.superseded_by = b.id)`,
    )
    .all(sinceIso) as BankRow[];
  if (banks.length === 0) return 0;
  const emails = ctx.db
    .prepare(
      `SELECT c.id, c.amount, c.currency, c.direction, c.occurred_at, c.vendor_id, c.description, v.name AS vendor_name,
         c.subscription_id, c.bill_id, c.spend_category, c.kind, c.source
       FROM charges c LEFT JOIN vendors v ON v.id = c.vendor_id
       WHERE c.fin_account_id IS NULL AND c.source IN ('email','card_alert') AND c.superseded_by IS NULL
         AND c.status IN ('posted','pending') AND c.occurred_at >= ?`,
    )
    .all(new Date(new Date(sinceIso).getTime() - 7 * DAY).toISOString()) as EmailRow[];
  const byCents = new Map<string, EmailRow[]>();
  for (const e of emails) {
    const key = `${e.currency}:${e.direction}:${Math.round(e.amount * 100)}`;
    byCents.set(key, [...(byCents.get(key) ?? []), e]);
  }
  const pairs: { bank: BankRow; email: EmailRow; score: number }[] = [];
  for (const b of banks) {
    for (const e of byCents.get(`${b.currency}:${b.direction}:${Math.round(b.amount * 100)}`) ?? []) {
      const score = matchScore(b, e);
      if (score !== null) pairs.push({ bank: b, email: e, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedBank = new Set<number>();
  const usedEmail = new Set<number>();
  const subs = new Set<number>();
  const link = ctx.db.prepare("UPDATE charges SET superseded_by = ? WHERE id = ?");
  const enrich = ctx.db.prepare(
    `UPDATE charges SET vendor_id = COALESCE(vendor_id, ?), subscription_id = COALESCE(subscription_id, ?), bill_id = COALESCE(bill_id, ?),
       kind = CASE WHEN category_source IN ('user','rule') THEN kind WHEN ? IN ('subscription','bill_payment','refund') THEN ? ELSE kind END,
       spend_category = CASE WHEN category_source IN ('user','rule') THEN spend_category ELSE ? END,
       category_source = CASE WHEN category_source IN ('user','rule') THEN category_source ELSE 'auto' END
     WHERE id = ?`,
  );
  let matched = 0;
  ctx.db.transaction(() => {
    for (const p of pairs) {
      if (usedBank.has(p.bank.id) || usedEmail.has(p.email.id)) continue;
      usedBank.add(p.bank.id);
      usedEmail.add(p.email.id);
      link.run(p.bank.id, p.email.id);
      enrich.run(p.email.vendor_id, p.email.subscription_id, p.email.bill_id, p.email.kind, p.email.kind, p.email.spend_category, p.bank.id);
      if (p.email.subscription_id) subs.add(p.email.subscription_id);
      matched++;
    }
  })();
  for (const id of subs) recomputeSubscription(ctx, id);
  return matched;
}

/**
 * Money moving between the owner's own accounts (checking → savings, checking → card) is neither
 * spending nor income. Pair an outflow with a same-amount inflow on another account within three
 * days and mark both as transfers / card payments.
 */
export function pairInternalTransfers(ctx: AppContext, since: Date): number {
  const rows = ctx.db
    .prepare(
      `SELECT c.id, c.fin_account_id, c.amount, c.currency, c.direction, c.occurred_at, c.kind, c.category_source, a.type AS account_type
       FROM charges c JOIN fin_accounts a ON a.id = c.fin_account_id
       WHERE c.occurred_at >= ? AND c.status = 'posted' AND c.kind IN ('purchase','deposit','transfer_in','transfer_out','card_payment','bill_payment','refund')
       ORDER BY c.occurred_at`,
    )
    .all(new Date(since.getTime() - 5 * DAY).toISOString()) as {
    id: number;
    fin_account_id: number;
    amount: number;
    currency: string;
    direction: "in" | "out";
    occurred_at: string;
    kind: string;
    category_source: string | null;
    account_type: string;
  }[];
  const outs = rows.filter((r) => r.direction === "out");
  const ins = rows.filter((r) => r.direction === "in");
  const used = new Set<number>();
  const set = ctx.db.prepare("UPDATE charges SET kind = ?, spend_category = 'transfers', category_source = 'auto' WHERE id = ? AND COALESCE(category_source, '') NOT IN ('user','rule')");
  let paired = 0;
  ctx.db.transaction(() => {
    for (const o of outs) {
      if (used.has(o.id)) continue;
      const match = ins.find(
        (i) =>
          !used.has(i.id) &&
          i.fin_account_id !== o.fin_account_id &&
          i.currency === o.currency &&
          Math.round(i.amount * 100) === Math.round(o.amount * 100) &&
          Math.abs(new Date(i.occurred_at).getTime() - new Date(o.occurred_at).getTime()) <= 3.5 * DAY &&
          // Only pair rows that already look like moving money, not a coincidental purchase + refund.
          (["transfer_in", "transfer_out", "card_payment", "deposit"].includes(i.kind) || i.account_type === "credit") &&
          (["transfer_in", "transfer_out", "card_payment", "deposit", "bill_payment"].includes(o.kind) || o.kind === "purchase"),
      );
      if (!match) continue;
      // A purchase-looking outflow is only reclassified when the inflow is clearly a transfer/payment.
      if (o.kind === "purchase" && !["transfer_in", "card_payment"].includes(match.kind)) continue;
      used.add(o.id);
      used.add(match.id);
      const toCard = match.account_type === "credit" || match.account_type === "loan";
      set.run(toCard ? "card_payment" : "transfer_out", o.id);
      set.run(toCard ? "card_payment" : "transfer_in", match.id);
      paired++;
    }
  })();
  return paired;
}
