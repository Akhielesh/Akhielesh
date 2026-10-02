import type { CsvMapping, FinAccountType, ImportPreviewDTO, ImportResultDTO } from "../../shared/types.js";
import { audit, type AppContext } from "../context.js";
import { slugify } from "../intel/vendor-resolve.js";
import { parseCsvStatement, type ParsedStatement } from "./csv.js";
import { looksLikeOfx, parseOfxStatement } from "./ofx.js";
import { recordBalance, storeTransactions, type FinAccountRow } from "./store.js";
import { afterBankChanges, createFinConnection } from "./sync.js";

export const IMPORT_FORMATS = [
  "Capital One credit card (CSV)",
  "Capital One 360 checking & savings (CSV)",
  "OFX / QFX / QBO (any bank's “Quicken” or “Web Connect” download)",
  "Chase, Amex, Discover, Citi, Apple Card, Bank of America, Wells Fargo (CSV)",
  "Any other CSV with a date, description and amount",
];

export function parseStatement(filename: string, content: string, mapping?: CsvMapping | null): ParsedStatement & { kind: "csv" | "ofx" } {
  if (content.length > 8 * 1024 * 1024) throw new Error("That file is over 8 MB. Export a shorter date range.");
  if (/\.(?:ofx|qfx|qbo)$/i.test(filename) || looksLikeOfx(content)) return { ...parseOfxStatement(content), kind: "ofx" };
  return { ...parseCsvStatement(content, mapping), kind: "csv" };
}

export function previewStatement(ctx: AppContext, filename: string, content: string, mapping?: CsvMapping | null): ImportPreviewDTO {
  const parsed = parseStatement(filename, content, mapping);
  const currency = parsed.account.currency ?? ctx.settings.get().profile.currency;
  const days = parsed.transactions.map((t) => t.date.slice(0, 10)).sort();
  const sum = (sign: 1 | -1) => Math.round(parsed.transactions.filter((t) => Math.sign(t.amount) === sign).reduce((s, t) => s + Math.abs(t.amount), 0) * 100) / 100;
  return {
    format: parsed.format,
    formatLabel: parsed.formatLabel,
    kind: parsed.kind,
    count: parsed.transactions.length,
    from: days[0] ?? null,
    to: days.at(-1) ?? null,
    totalOut: sum(-1),
    totalIn: sum(1),
    currency,
    account: { name: parsed.account.name, type: parsed.account.type, mask: parsed.account.mask ?? null, institution: parsed.institution },
    columns: parsed.columns,
    mapping: parsed.mapping,
    sample: parsed.transactions.slice(0, 8).map((t) => ({ date: t.date.slice(0, 10), description: t.description, amount: t.amount, category: t.category ?? null })),
    warnings: parsed.warnings,
  };
}

export interface ImportTarget {
  finAccountId?: number;
  account?: { name: string; type: FinAccountType; institution?: string | null; mask?: string | null };
}

/** The "statements" connection for an institution: imported accounts live under it. */
function fileConnection(ctx: AppContext, institution: string | null): number {
  const label = `${institution ?? "Imported"} statements`;
  const existing = ctx.db.prepare("SELECT id FROM fin_connections WHERE provider = 'file' AND label = ?").get(label) as { id: number } | undefined;
  return existing?.id ?? createFinConnection(ctx, { provider: "file", label, institution });
}

export function importStatement(ctx: AppContext, filename: string, content: string, target: ImportTarget, mapping?: CsvMapping | null): ImportResultDTO {
  const parsed = parseStatement(filename, content, mapping);
  let account: FinAccountRow | undefined;
  if (target.finAccountId) {
    account = ctx.db.prepare("SELECT * FROM fin_accounts WHERE id = ?").get(target.finAccountId) as FinAccountRow | undefined;
    if (!account) throw new Error("That account no longer exists.");
  } else {
    const spec = target.account ?? { name: parsed.account.name, type: parsed.account.type, institution: parsed.institution, mask: parsed.account.mask };
    const institution = spec.institution ?? parsed.institution;
    const connectionId = fileConnection(ctx, institution);
    const externalId = `file:${spec.mask || slugify(spec.name)}`;
    account = ctx.db.prepare("SELECT * FROM fin_accounts WHERE connection_id = ? AND external_id = ?").get(connectionId, externalId) as FinAccountRow | undefined;
    if (!account) {
      const now = ctx.now().toISOString();
      const id = Number(
        ctx.db
          .prepare(
            `INSERT INTO fin_accounts(connection_id, external_id, name, institution, type, mask, currency, balance_current, balance_available, balance_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            connectionId,
            externalId,
            spec.name.slice(0, 120),
            institution,
            spec.type,
            spec.mask ?? null,
            parsed.account.currency ?? ctx.settings.get().profile.currency,
            parsed.account.balanceCurrent ?? null,
            parsed.account.balanceAvailable ?? null,
            parsed.account.balanceAt ?? null,
            now,
            now,
          ).lastInsertRowid,
      );
      account = ctx.db.prepare("SELECT * FROM fin_accounts WHERE id = ?").get(id) as FinAccountRow;
    }
  }
  // Statement files carry their own sign convention (handled by the parser); never apply a feed's flip.
  const stats = storeTransactions(ctx, { ...account, invert_amounts: 0 }, parsed.transactions, "import");
  if (parsed.account.balanceCurrent != null && (!account.balance_at || (parsed.account.balanceAt ?? "") >= account.balance_at)) {
    ctx.db
      .prepare("UPDATE fin_accounts SET balance_current = ?, balance_available = COALESCE(?, balance_available), balance_at = ?, updated_at = ? WHERE id = ?")
      .run(parsed.account.balanceCurrent, parsed.account.balanceAvailable ?? null, parsed.account.balanceAt ?? ctx.now().toISOString(), ctx.now().toISOString(), account.id);
  }
  const fresh = ctx.db.prepare("SELECT * FROM fin_accounts WHERE id = ?").get(account.id) as FinAccountRow;
  recordBalance(ctx, fresh);
  const { matched } = afterBankChanges(ctx, {
    since: stats.minDate ? new Date(`${stats.minDate}T00:00:00Z`) : new Date(ctx.now().getTime() - 400 * 86400000),
    insertedIds: stats.insertedIds,
    accounts: [fresh],
    notify: false,
  });
  ctx.db.prepare("UPDATE fin_connections SET last_sync_at = ?, last_success_at = ? WHERE id = ?").run(ctx.now().toISOString(), ctx.now().toISOString(), fresh.connection_id);
  audit(ctx, "bank.import", `${parsed.format} ${stats.inserted} new → ${fresh.name}`);
  if (stats.inserted > 0) ctx.bus.emit("sync:done", { accountId: 0, inserted: stats.inserted, alerts: 0 });
  return { accountId: fresh.id, inserted: stats.inserted, duplicates: stats.duplicates, matched, from: stats.minDate, to: stats.maxDate };
}
