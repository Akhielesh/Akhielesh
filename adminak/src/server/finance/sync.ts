import type { FinProviderKind } from "../../shared/types.js";
import { audit, type AppContext } from "../context.js";
import { parseJson } from "../db/index.js";
import { createAlert } from "../services/alerts.js";
import { recomputeSubscription } from "../services/subscriptions.js";
import { balanceAlerts, transactionAlerts } from "./alerts.js";
import { DemoBankProvider } from "./demo.js";
import { detectRecurring } from "./recurring.js";
import { pairInternalTransfers, reconcileCharges } from "./reconcile.js";
import { SimplefinProvider, type SimplefinAccess } from "./simplefin.js";
import { detectInvert, recordBalance, removeStalePending, storeTransactions, upsertFinAccount, type FinAccountRow } from "./store.js";
import { TellerProvider, tellerTransport } from "./teller.js";
import { BankAuthError, type BankProvider } from "./types.js";

const DAY = 86400000;

export interface FinConnectionRow {
  id: number;
  provider: FinProviderKind;
  label: string;
  institution: string | null;
  institution_id: string | null;
  external_id: string | null;
  status: "active" | "paused" | "error";
  secret_enc: string | null;
  settings: string;
  sync_state: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  error_count: number;
  created_at: string;
}

export interface TellerSecret {
  accessToken: string;
}

export function bankProviderFor(ctx: AppContext, conn: FinConnectionRow): BankProvider | null {
  switch (conn.provider) {
    case "teller": {
      if (!ctx.config.teller) throw new Error("Teller isn't configured on this server (TELLER_APPLICATION_ID and certificate).");
      const secret = ctx.vault.decryptJson<TellerSecret | null>(conn.secret_enc, null);
      if (!secret?.accessToken) throw new BankAuthError("No Teller access token stored. Reconnect the bank.");
      return new TellerProvider(tellerTransport(ctx.config.teller, secret.accessToken));
    }
    case "simplefin": {
      const secret = ctx.vault.decryptJson<SimplefinAccess | null>(conn.secret_enc, null);
      if (!secret?.url) throw new BankAuthError("No SimpleFIN access URL stored. Reconnect with a new setup token.");
      return new SimplefinProvider(secret);
    }
    case "demo":
      return new DemoBankProvider();
    default:
      return null;
  }
}

export interface BankSyncOutcome {
  connectionId: number;
  ok: boolean;
  inserted: number;
  updated: number;
  matched: number;
  alerts: number;
  error?: string;
}

/** Post-processing shared by feeds and statement imports. */
export function afterBankChanges(ctx: AppContext, opts: { since: Date; insertedIds: number[]; accounts: FinAccountRow[]; notify: boolean }): { matched: number; alerts: number } {
  pairInternalTransfers(ctx, opts.since);
  const matched = reconcileCharges(ctx, opts.since);
  let alerts = detectRecurring(ctx, { notify: opts.notify });
  alerts += transactionAlerts(ctx, opts.insertedIds, { notify: opts.notify });
  alerts += balanceAlerts(ctx, opts.accounts, { notify: opts.notify });
  return { matched, alerts };
}

export async function syncFinConnection(ctx: AppContext, connectionId: number, trigger: string, fetchOverride?: BankProvider): Promise<BankSyncOutcome> {
  const conn = ctx.db.prepare("SELECT * FROM fin_connections WHERE id = ?").get(connectionId) as FinConnectionRow | undefined;
  const empty = { connectionId, inserted: 0, updated: 0, matched: 0, alerts: 0 };
  if (!conn) return { ...empty, ok: false, error: "Connection not found" };
  if (conn.provider === "file") return { ...empty, ok: true };
  if (ctx.runtime.bankSyncing.has(connectionId)) return { ...empty, ok: false, error: "Refresh already running" };
  ctx.runtime.bankSyncing.add(connectionId);
  const runId = Number(
    ctx.db
      .prepare("INSERT INTO sync_runs(account_id, fin_connection_id, trigger, status, started_at) VALUES (NULL, ?, ?, 'running', ?)")
      .run(connectionId, trigger, ctx.now().toISOString()).lastInsertRowid,
  );
  const firstSync = !conn.last_success_at;
  try {
    const provider = fetchOverride ?? bankProviderFor(ctx, conn);
    if (!provider) throw new Error(`Unsupported bank provider: ${conn.provider}`);
    const now = ctx.now();
    const since = firstSync ? new Date(now.getTime() - 365 * DAY) : new Date(new Date(conn.last_success_at!).getTime() - 10 * DAY);
    const result = await provider.fetch({ state: parseJson(conn.sync_state, {}), since, now, firstSync });

    let inserted = 0;
    let updated = 0;
    const insertedIds: number[] = [];
    const accounts: FinAccountRow[] = [];
    let minDate: string | null = null;
    for (const input of result.accounts) {
      const txns = result.transactions.filter((t) => t.accountExternalId === input.externalId);
      const { row } = upsertFinAccount(ctx, connectionId, input, detectInvert(input.type, txns));
      accounts.push(row);
      const stats = storeTransactions(ctx, row, txns, "bank");
      inserted += stats.inserted;
      updated += stats.updated;
      insertedIds.push(...stats.insertedIds);
      if (stats.minDate && (!minDate || stats.minDate < minDate)) minDate = stats.minDate;
      removeStalePending(ctx, row.id, new Set(txns.map((t) => t.externalId)), result.windowStart ?? null);
      recordBalance(ctx, row);
    }
    const { matched, alerts } = afterBankChanges(ctx, {
      since: minDate ? new Date(`${minDate}T00:00:00Z`) : since,
      insertedIds,
      accounts,
      notify: !firstSync,
    });
    const nowIso = ctx.now().toISOString();
    const institution = conn.institution ?? result.accounts.find((a) => a.institution)?.institution ?? null;
    ctx.db
      .prepare(
        `UPDATE fin_connections SET sync_state = ?, last_sync_at = ?, last_success_at = ?, last_error = ?, error_count = 0, institution = ?,
           status = CASE WHEN status = 'error' THEN 'active' ELSE status END WHERE id = ?`,
      )
      .run(JSON.stringify(result.state), nowIso, nowIso, result.warnings?.length ? result.warnings.join(" · ").slice(0, 500) : null, institution, connectionId);
    ctx.db
      .prepare("UPDATE sync_runs SET status = 'ok', finished_at = ?, fetched = ?, new_messages = ?, alerts_created = ? WHERE id = ?")
      .run(nowIso, result.transactions.length, inserted, alerts, runId);
    ctx.log.info("Bank refresh finished", { connection: conn.label, trigger, inserted, updated, matched, alerts });
    if (inserted > 0) ctx.bus.emit("sync:done", { accountId: -connectionId, inserted, alerts });
    return { connectionId, ok: true, inserted, updated, matched, alerts };
  } catch (error) {
    const message = ((error as Error).message ?? String(error)).slice(0, 500);
    const isAuth = error instanceof BankAuthError;
    ctx.db
      .prepare("UPDATE fin_connections SET last_sync_at = ?, last_error = ?, error_count = error_count + 1, status = CASE WHEN ? THEN 'error' ELSE status END WHERE id = ?")
      .run(ctx.now().toISOString(), message, isAuth ? 1 : 0, connectionId);
    ctx.db.prepare("UPDATE sync_runs SET status = 'error', finished_at = ?, error = ? WHERE id = ?").run(ctx.now().toISOString(), message, runId);
    const errors = (ctx.db.prepare("SELECT error_count FROM fin_connections WHERE id = ?").get(connectionId) as { error_count: number }).error_count;
    if (isAuth || errors >= 3) {
      createAlert(ctx, {
        fingerprint: `bank-error:${connectionId}:${ctx.now().toISOString().slice(0, 10)}`,
        type: "system.bank_error",
        title: `${conn.label} needs attention`,
        body: isAuth ? "The bank link expired or was revoked. Reconnect it to keep balances and transactions current." : `Refreshing failed ${errors} times in a row: ${message.slice(0, 160)}`,
        facts: [
          { label: "Connection", value: conn.label },
          { label: "Error", value: message.slice(0, 160) },
        ],
        entityType: "fin_connection",
        entityId: connectionId,
        actionUrl: `${ctx.config.appUrl}/accounts`,
        actionLabel: "Open connections",
      });
    }
    ctx.log.warn("Bank refresh failed", { connection: conn.label, error: message });
    return { ...empty, ok: false, error: message };
  } finally {
    ctx.runtime.bankSyncing.delete(connectionId);
  }
}

/** Scheduler entry: refreshes bank connections whose last refresh is older than the configured interval. */
export async function syncDueBanks(ctx: AppContext): Promise<BankSyncOutcome[]> {
  const hours = ctx.settings.get().banking.syncHours;
  const rows = ctx.db
    .prepare("SELECT id, last_sync_at FROM fin_connections WHERE status != 'paused' AND provider IN ('teller','simplefin') ORDER BY id")
    .all() as { id: number; last_sync_at: string | null }[];
  const out: BankSyncOutcome[] = [];
  for (const r of rows) {
    if (r.last_sync_at && ctx.now().getTime() - new Date(r.last_sync_at).getTime() < hours * 3600_000 - 60_000) continue;
    out.push(await syncFinConnection(ctx, r.id, "schedule"));
  }
  return out;
}

export function createFinConnection(
  ctx: AppContext,
  input: { provider: FinProviderKind; label: string; institution?: string | null; institutionId?: string | null; externalId?: string | null; secret?: unknown },
): number {
  const id = Number(
    ctx.db
      .prepare("INSERT INTO fin_connections(provider, label, institution, institution_id, external_id, status, secret_enc, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)")
      .run(
        input.provider,
        input.label.slice(0, 80),
        input.institution ?? null,
        input.institutionId ?? null,
        input.externalId ?? null,
        input.secret !== undefined ? ctx.vault.encryptJson(input.secret) : null,
        ctx.now().toISOString(),
      ).lastInsertRowid,
  );
  audit(ctx, "bank.connect", `${input.provider} ${input.label}`);
  return id;
}

/** Removes a connection and its transactions; receipts it had superseded count on their own again. */
export function deleteFinConnection(ctx: AppContext, id: number): void {
  ctx.db.transaction(() => {
    const subs = (
      ctx.db.prepare("SELECT DISTINCT subscription_id AS id FROM charges WHERE subscription_id IS NOT NULL AND fin_account_id IN (SELECT id FROM fin_accounts WHERE connection_id = ?)").all(id) as { id: number }[]
    ).map((r) => r.id);
    ctx.db.prepare("DELETE FROM charges WHERE fin_account_id IN (SELECT id FROM fin_accounts WHERE connection_id = ?)").run(id);
    ctx.db.prepare("DELETE FROM fin_connections WHERE id = ?").run(id);
    // Subscriptions found only in this bank's data go with it.
    for (const sub of subs) {
      const left = (ctx.db.prepare("SELECT (SELECT COUNT(*) FROM charges WHERE subscription_id = ?) + (SELECT COUNT(*) FROM subscription_events WHERE subscription_id = ?) AS n").get(sub, sub) as { n: number }).n;
      if (left === 0) ctx.db.prepare("DELETE FROM subscriptions WHERE id = ? AND key LIKE 'bank:%'").run(sub);
    }
    ctx.db.prepare("DELETE FROM alerts WHERE entity_type = 'charge' AND entity_id NOT IN (SELECT id FROM charges)").run();
    ctx.db.prepare("DELETE FROM alerts WHERE entity_type = 'fin_account' AND entity_id NOT IN (SELECT id FROM fin_accounts)").run();
    ctx.db.prepare("DELETE FROM alerts WHERE entity_type = 'fin_connection' AND entity_id NOT IN (SELECT id FROM fin_connections)").run();
    ctx.db.prepare("DELETE FROM alerts WHERE entity_type = 'subscription' AND entity_id NOT IN (SELECT id FROM subscriptions)").run();
    // Email-backed subscriptions get their receipts back as the charges that count.
    for (const sub of subs) recomputeSubscription(ctx, sub);
  })();
}
