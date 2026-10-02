import type { AccountDTO, AccountStatus, Category, ProviderKind, SyncRunDTO } from "../../shared/types.js";
import { CATEGORY_META } from "../../shared/catalog.js";
import { audit, type AppContext } from "../context.js";
import { parseJson } from "../db/index.js";
import { analyzeEmail } from "../intel/analyze.js";
import { ingestEmail } from "../intel/materialize.js";
import type { IncomingEmail } from "../intel/types.js";
import { createAlert } from "../services/alerts.js";
import { runReminders } from "../services/reminders.js";
import { demoEmails } from "./demo-data.js";
import { GmailProvider } from "./gmail.js";
import { ImapProvider } from "./imap.js";
import { isOwnNotification } from "./mime.js";
import { ProviderAuthError, type GmailSettings, type ImapSecret, type ImapSettings, type MailProvider } from "./types.js";

export interface AccountRow {
  id: number;
  provider: ProviderKind;
  label: string;
  email: string;
  status: AccountStatus;
  secret_enc: string | null;
  settings: string;
  sync_state: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  error_count: number;
  backfill_done: number;
  message_count: number;
  created_at: string;
}

export function accountFromRow(ctx: AppContext, row: AccountRow): AccountDTO {
  const settings = parseJson<Record<string, unknown>>(row.settings, {});
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    email: row.email,
    status: row.status,
    lastSyncAt: row.last_sync_at,
    lastSuccessAt: row.last_success_at,
    lastError: row.last_error,
    messageCount: row.message_count,
    backfillDone: !!row.backfill_done,
    syncing: ctx.runtime.syncing.has(row.id),
    progress: ctx.runtime.progress.get(row.id) ?? null,
    settings: {
      host: settings.host as string | undefined,
      port: settings.port as number | undefined,
      secure: settings.secure as boolean | undefined,
      folders: settings.folders as string[] | undefined,
      backfillDays: settings.backfillDays as number | undefined,
      applyLabels: settings.applyLabels as boolean | undefined,
      scopes: settings.scopes as string[] | undefined,
    },
    createdAt: row.created_at,
  };
}

class DemoProvider implements MailProvider {
  constructor(
    private readonly ctx: AppContext,
    private readonly ownerEmail: string,
  ) {}

  async fetch(opts: Parameters<MailProvider["fetch"]>[0]) {
    if (opts.state.loaded) return { state: opts.state, fetched: 0, backfillDone: true };
    const name = this.ctx.settings.get().profile.name || "Akhielesh";
    const emails = demoEmails(this.ctx.now(), { name, email: this.ownerEmail }).filter((e) => !opts.isKnown(e.providerId));
    for (let i = 0; i < emails.length; i += 25) {
      await opts.onBatch(emails.slice(i, i + 25));
      opts.onProgress("loading demo inbox", Math.min(emails.length, i + 25), emails.length);
    }
    return { state: { loaded: true }, fetched: emails.length, backfillDone: true };
  }
}

export function providerFor(ctx: AppContext, account: AccountRow): MailProvider | null {
  const settings = parseJson<Record<string, unknown>>(account.settings, {});
  switch (account.provider) {
    case "gmail":
      return new GmailProvider(ctx, account.id);
    case "imap": {
      const secret = ctx.vault.decryptJson<ImapSecret>(account.secret_enc, { password: "" });
      if (!secret.password) throw new ProviderAuthError("No password stored for this mailbox. Edit the account to add it.");
      const imap = settings as unknown as ImapSettings;
      return new ImapProvider(ctx, imap, imap.user ?? account.email, secret.password);
    }
    case "demo":
      return new DemoProvider(ctx, account.email);
    default:
      return null;
  }
}

/** Labels Adminak applies in Gmail when "organize my inbox" is on. */
export function labelFor(category: Category, prefix: string): string | null {
  if (!CATEGORY_META[category].signal) return null;
  return `${prefix}/${CATEGORY_META[category].label}`;
}

export interface IngestStats {
  fetched: number;
  inserted: number;
  alerts: number;
  skippedOwn: number;
  labeled: { providerId: string; labels: string[] }[];
}

/** Analyzes and stores a batch of emails for an account. Used by every provider and the inbound webhook. */
export function ingestBatch(ctx: AppContext, accountId: number, emails: IncomingEmail[], stats: IngestStats, labelPrefix: string | null = null): void {
  const settings = ctx.settings.get();
  const aiOn = settings.ai.enabled && !!ctx.config.ai;
  const opts = { currency: settings.profile.currency, timeZone: settings.profile.timezone, ownerName: settings.profile.name };
  const run = ctx.db.transaction((batch: IncomingEmail[]) => {
    for (const email of batch) {
      stats.fetched++;
      if (isOwnNotification(email.headers, email.subject)) {
        stats.skippedOwn++;
        continue;
      }
      let analysis;
      try {
        analysis = analyzeEmail(email, opts);
      } catch (error) {
        ctx.log.warn("Analysis failed", { subject: email.subject, error: (error as Error).message });
        continue;
      }
      const result = ingestEmail(ctx, { accountId }, email, analysis);
      if (!result) continue;
      stats.inserted++;
      stats.alerts += result.alertsCreated;
      if (aiOn && !result.muted && shouldEnrich(settings.ai.mode, analysis.category, analysis.confidence, email.date, ctx.now())) {
        ctx.db.prepare("UPDATE messages SET ai_status = 'queued' WHERE id = ?").run(result.messageId);
      }
      if (labelPrefix && !result.muted) {
        const label = labelFor(result.category, labelPrefix);
        if (label) stats.labeled.push({ providerId: email.providerId, labels: [label] });
      }
    }
  });
  run(emails);
}

function shouldEnrich(mode: "smart" | "all", category: Category, confidence: number, date: Date, now: Date): boolean {
  if (now.getTime() - date.getTime() > 21 * 86400000) return false;
  if (["promotions", "newsletters", "social"].includes(category)) return false;
  if (mode === "all") return true;
  return confidence < 0.6 || category === "other" || category === "updates";
}

function markRun(ctx: AppContext, runId: number, patch: { status: string; fetched: number; inserted: number; alerts: number; error?: string | null }): void {
  ctx.db
    .prepare("UPDATE sync_runs SET status = ?, finished_at = ?, fetched = ?, new_messages = ?, alerts_created = ?, error = ? WHERE id = ?")
    .run(patch.status, ctx.now().toISOString(), patch.fetched, patch.inserted, patch.alerts, patch.error ?? null, runId);
}

export interface SyncOutcome {
  accountId: number;
  ok: boolean;
  fetched: number;
  inserted: number;
  alerts: number;
  error?: string;
}

export async function syncAccount(ctx: AppContext, accountId: number, trigger: string): Promise<SyncOutcome> {
  const account = ctx.db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as AccountRow | undefined;
  if (!account) return { accountId, ok: false, fetched: 0, inserted: 0, alerts: 0, error: "Account not found" };
  if (account.provider === "webhook") return { accountId, ok: true, fetched: 0, inserted: 0, alerts: 0 };
  if (ctx.runtime.syncing.has(accountId)) return { accountId, ok: false, fetched: 0, inserted: 0, alerts: 0, error: "Sync already running" };
  ctx.runtime.syncing.add(accountId);
  const startedAt = ctx.now().toISOString();
  const runId = Number(
    ctx.db.prepare("INSERT INTO sync_runs(account_id, trigger, status, started_at) VALUES (?, ?, 'running', ?)").run(accountId, trigger, startedAt).lastInsertRowid,
  );
  ctx.bus.emit("sync:start", { accountId });
  const stats: IngestStats = { fetched: 0, inserted: 0, alerts: 0, skippedOwn: 0, labeled: [] };
  const settings = ctx.settings.get();
  const accountSettings = parseJson<GmailSettings & ImapSettings>(account.settings, {} as GmailSettings & ImapSettings);
  const labelsWanted = settings.gmail.applyLabels && (accountSettings.applyLabels ?? true) && (account.provider === "gmail" || /imap\.gmail\.com/i.test(accountSettings.host ?? ""));
  const canModify = account.provider !== "gmail" || (accountSettings.scopes ?? []).some((s) => /gmail\.modify/.test(s));
  const labelPrefix = labelsWanted && canModify ? settings.gmail.labelPrefix : null;
  try {
    const provider = providerFor(ctx, account);
    if (!provider) throw new Error(`Unsupported provider: ${account.provider}`);
    const backfillDays = accountSettings.backfillDays ?? settings.scanning.backfillDays;
    const since = new Date(ctx.now().getTime() - backfillDays * 86400000);
    const known = ctx.db.prepare("SELECT 1 FROM messages WHERE account_id = ? AND provider_id = ?");
    const result = await provider.fetch({
      state: parseJson<Record<string, unknown>>(account.sync_state, {}),
      since,
      maxMessages: account.backfill_done ? 2000 : settings.scanning.maxBackfillMessages,
      isKnown: (providerId) => !!known.get(accountId, providerId),
      onBatch: (emails) => ingestBatch(ctx, accountId, emails, stats, labelPrefix),
      onProgress: (phase, done, total) => {
        ctx.runtime.progress.set(accountId, { phase, done, total });
        ctx.bus.emit("sync:progress", { accountId, phase, done, total });
      },
    });
    if (labelPrefix && stats.labeled.length && provider.applyLabels) {
      await provider.applyLabels(stats.labeled).catch((error: Error) => ctx.log.warn("Applying labels failed", { error: error.message }));
    }
    await provider.close?.();
    const nowIso = ctx.now().toISOString();
    ctx.db
      .prepare(
        `UPDATE accounts SET sync_state = ?, last_sync_at = ?, last_success_at = ?, last_error = NULL, error_count = 0, backfill_done = ?,
           status = CASE WHEN status = 'error' THEN 'active' ELSE status END WHERE id = ?`,
      )
      .run(JSON.stringify(result.state), nowIso, nowIso, result.backfillDone ? 1 : 0, accountId);
    if (stats.inserted > 0) stats.alerts += runReminders(ctx).created;
    markRun(ctx, runId, { status: "ok", fetched: stats.fetched, inserted: stats.inserted, alerts: stats.alerts });
    ctx.log.info("Sync finished", { account: account.label, trigger, fetched: stats.fetched, inserted: stats.inserted, alerts: stats.alerts });
    return { accountId, ok: true, fetched: stats.fetched, inserted: stats.inserted, alerts: stats.alerts };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    const isAuth = error instanceof ProviderAuthError;
    ctx.db
      .prepare("UPDATE accounts SET last_sync_at = ?, last_error = ?, error_count = error_count + 1, status = CASE WHEN ? THEN 'error' ELSE status END WHERE id = ?")
      .run(ctx.now().toISOString(), message.slice(0, 500), isAuth ? 1 : 0, accountId);
    markRun(ctx, runId, { status: "error", fetched: stats.fetched, inserted: stats.inserted, alerts: stats.alerts, error: message.slice(0, 500) });
    const errors = (ctx.db.prepare("SELECT error_count FROM accounts WHERE id = ?").get(accountId) as { error_count: number }).error_count;
    if (isAuth || errors >= 3) {
      createAlert(ctx, {
        fingerprint: `sync-error:${accountId}:${ctx.now().toISOString().slice(0, 10)}`,
        type: "system.sync_error",
        title: `${account.label} (${account.email}) needs attention`,
        body: isAuth ? "The mailbox rejected Adminak's credentials. Reconnect it to resume scanning." : `Scanning failed ${errors} times in a row: ${message.slice(0, 160)}`,
        facts: [
          { label: "Mailbox", value: account.email },
          { label: "Error", value: message.slice(0, 160) },
        ],
        entityType: "account",
        entityId: accountId,
        actionUrl: `${ctx.config.appUrl}/accounts`,
        actionLabel: "Open accounts",
      });
    }
    ctx.log.warn("Sync failed", { account: account.label, error: message });
    return { accountId, ok: false, fetched: stats.fetched, inserted: stats.inserted, alerts: stats.alerts, error: message };
  } finally {
    ctx.runtime.syncing.delete(accountId);
    ctx.runtime.progress.delete(accountId);
    ctx.bus.emit("sync:done", { accountId, inserted: stats.inserted, alerts: stats.alerts });
  }
}

export async function syncAll(ctx: AppContext, trigger: string, onlyDue = false): Promise<SyncOutcome[]> {
  const settings = ctx.settings.get();
  const accounts = ctx.db.prepare("SELECT id, last_sync_at, provider FROM accounts WHERE status != 'paused' AND provider != 'webhook' ORDER BY id").all() as {
    id: number;
    last_sync_at: string | null;
    provider: ProviderKind;
  }[];
  const outcomes: SyncOutcome[] = [];
  for (const account of accounts) {
    if (onlyDue && account.last_sync_at) {
      const elapsed = ctx.now().getTime() - new Date(account.last_sync_at).getTime();
      if (elapsed < settings.scanning.intervalMinutes * 60_000 - 5_000) continue;
    }
    if (onlyDue && account.provider === "demo") continue;
    outcomes.push(await syncAccount(ctx, account.id, trigger));
  }
  return outcomes;
}

export function createDemoAccount(ctx: AppContext): number {
  const existing = ctx.db.prepare("SELECT id FROM accounts WHERE provider = 'demo'").get() as { id: number } | undefined;
  if (existing) return existing.id;
  const now = ctx.now().toISOString();
  const id = Number(
    ctx.db
      .prepare("INSERT INTO accounts(provider, label, email, status, settings, created_at) VALUES ('demo', 'Demo inbox', 'demo@adminak.app', 'active', '{}', ?)")
      .run(now).lastInsertRowid,
  );
  audit(ctx, "account.demo.create");
  return id;
}

/** Deletes an account and everything derived from its messages. */
export function deleteAccount(ctx: AppContext, accountId: number): void {
  const db = ctx.db;
  db.transaction(() => {
    const subIds = (
      db.prepare("SELECT DISTINCT e.subscription_id AS id FROM subscription_events e JOIN messages m ON m.id = e.message_id WHERE m.account_id = ?").all(accountId) as {
        id: number;
      }[]
    ).map((r) => r.id);
    db.prepare("DELETE FROM alerts WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)").run(accountId);
    db.prepare("DELETE FROM bills WHERE source = 'detected' AND message_id IN (SELECT id FROM messages WHERE account_id = ?)").run(accountId);
    db.prepare("DELETE FROM subscription_events WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)").run(accountId);
    db.prepare("DELETE FROM messages WHERE account_id = ?").run(accountId);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(accountId);
    for (const id of subIds) {
      const left = db.prepare("SELECT (SELECT COUNT(*) FROM subscription_events WHERE subscription_id = ?) + (SELECT COUNT(*) FROM charges WHERE subscription_id = ?) AS n").get(id, id) as {
        n: number;
      };
      if (left.n === 0) db.prepare("DELETE FROM subscriptions WHERE id = ? AND source = 'detected'").run(id);
    }
    // Alerts that referenced now-deleted entities.
    db.prepare("DELETE FROM alerts WHERE entity_type = 'subscription' AND entity_id NOT IN (SELECT id FROM subscriptions)").run();
    db.prepare("DELETE FROM alerts WHERE entity_type = 'bill' AND entity_id NOT IN (SELECT id FROM bills)").run();
    db.prepare("DELETE FROM alerts WHERE entity_type = 'insight' AND entity_id NOT IN (SELECT id FROM insights)").run();
    db.prepare("DELETE FROM vendors WHERE id NOT IN (SELECT vendor_id FROM messages WHERE vendor_id IS NOT NULL) AND id NOT IN (SELECT vendor_id FROM subscriptions WHERE vendor_id IS NOT NULL) AND id NOT IN (SELECT vendor_id FROM charges WHERE vendor_id IS NOT NULL) AND id NOT IN (SELECT vendor_id FROM bills WHERE vendor_id IS NOT NULL)").run();
  })();
}

export function listSyncRuns(ctx: AppContext, limit = 30): SyncRunDTO[] {
  const rows = ctx.db
    .prepare(
      "SELECT r.*, COALESCE(a.label, f.label) AS account_label FROM sync_runs r LEFT JOIN accounts a ON a.id = r.account_id LEFT JOIN fin_connections f ON f.id = r.fin_connection_id ORDER BY r.started_at DESC LIMIT ?",
    )
    .all(limit) as {
    id: number;
    account_id: number | null;
    fin_connection_id: number | null;
    account_label: string | null;
    trigger: string;
    status: "running" | "ok" | "error";
    started_at: string;
    finished_at: string | null;
    fetched: number;
    new_messages: number;
    alerts_created: number;
    error: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    finConnectionId: r.fin_connection_id,
    accountLabel: r.account_label,
    trigger: r.trigger,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    fetched: r.fetched,
    newMessages: r.new_messages,
    alertsCreated: r.alerts_created,
    error: r.error,
  }));
}
