import type { AppContext } from "../context.js";
import { generateBriefing, runEnrichmentQueue } from "../intel/ai.js";
import { syncAll } from "../ingest/sync.js";
import { dispatchInstant, markScheduled, retryFailed, scheduledDue, sendDigest } from "../notify/dispatcher.js";
import { runReminders } from "../services/reminders.js";
import { dayKey, zonedParts } from "../../shared/time.js";
import { getMeta, parseJson, setMeta } from "../db/index.js";

const running = new Set<string>();

/** Runs a named job at most once at a time and records its outcome for the System page. */
export async function runJob<T>(ctx: AppContext, name: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  if (running.has(name)) return undefined;
  running.add(name);
  const started = Date.now();
  try {
    const result = await fn();
    ctx.db
      .prepare(
        "INSERT INTO job_state(name, last_run_at, last_status, last_error, duration_ms) VALUES (?, ?, 'ok', NULL, ?) ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, last_status = 'ok', last_error = NULL, duration_ms = excluded.duration_ms",
      )
      .run(name, ctx.now().toISOString(), Date.now() - started);
    return result;
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    ctx.log.error(`Job ${name} failed`, { error: message });
    ctx.db
      .prepare(
        "INSERT INTO job_state(name, last_run_at, last_status, last_error, duration_ms) VALUES (?, ?, 'error', ?, ?) ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, last_status = 'error', last_error = excluded.last_error, duration_ms = excluded.duration_ms",
      )
      .run(name, ctx.now().toISOString(), message.slice(0, 500), Date.now() - started);
    return undefined;
  } finally {
    running.delete(name);
  }
}

export function runRetention(ctx: AppContext): { bodies: number; sessions: number } {
  const db = ctx.db;
  const settings = ctx.settings.get();
  const now = ctx.now();
  const cutoff = new Date(now.getTime() - settings.scanning.bodyRetentionDays * 86400000).toISOString();
  const bodies = db.prepare("UPDATE messages SET body_text = NULL WHERE body_text IS NOT NULL AND received_at < ?").run(cutoff).changes;
  const sessions = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now.toISOString()).changes;
  db.prepare("DELETE FROM sync_runs WHERE started_at < ?").run(new Date(now.getTime() - 60 * 86400000).toISOString());
  db.prepare("DELETE FROM notifications WHERE created_at < ?").run(new Date(now.getTime() - 180 * 86400000).toISOString());
  db.prepare("DELETE FROM audit_log WHERE at < ?").run(new Date(now.getTime() - 365 * 86400000).toISOString());
  db.prepare("DELETE FROM alerts WHERE status = 'done' AND updated_at < ?").run(new Date(now.getTime() - 120 * 86400000).toISOString());
  db.pragma("optimize");
  return { bodies, sessions };
}

const HOUR = 3_600_000;

/**
 * Keeps the dashboard briefing fresh: regenerate when there's none yet, when new mail arrived since
 * the last one (at most hourly, so AI briefings stay cheap), or when it's older than six hours.
 */
export async function refreshBriefingIfStale(ctx: AppContext): Promise<boolean> {
  const messages = (ctx.db.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n;
  if (messages === 0) return false;
  const current = parseJson<{ generatedAt: string } | null>(getMeta(ctx.db, "briefing"), null);
  const changedAt = getMeta(ctx.db, "data_changed_at");
  const age = current ? ctx.now().getTime() - new Date(current.generatedAt).getTime() : Infinity;
  const stale = !current || age > 6 * HOUR || (!!changedAt && changedAt > current.generatedAt && age > HOUR);
  if (!stale) return false;
  await runJob(ctx, "briefing", () => generateBriefing(ctx));
  return true;
}

export interface Scheduler {
  stop(): void;
  tick(): Promise<void>;
}

export function startScheduler(ctx: AppContext): Scheduler {
  let lastReminders = 0;
  let lastEnrich = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const nowMs = ctx.now().getTime();
    await runJob(ctx, "sync", () => syncAll(ctx, "schedule", true));
    if (nowMs - lastReminders > 10 * 60_000) {
      lastReminders = nowMs;
      await runJob(ctx, "reminders", () => runReminders(ctx));
    }
    await runJob(ctx, "dispatch", () => dispatchInstant(ctx));
    await runJob(ctx, "retry", () => retryFailed(ctx));
    for (const kind of scheduledDue(ctx)) {
      const hasAccounts = (ctx.db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number }).n > 0;
      markScheduled(ctx, kind);
      if (hasAccounts) await runJob(ctx, kind, () => sendDigest(ctx, kind));
    }
    if (ctx.config.ai && nowMs - lastEnrich > 2 * 60_000) {
      lastEnrich = nowMs;
      await runJob(ctx, "ai-enrich", () => runEnrichmentQueue(ctx));
    }
    await refreshBriefingIfStale(ctx);
    const tz = ctx.settings.get().profile.timezone;
    const local = zonedParts(ctx.now(), tz);
    if (local.hour >= 3 && getMeta(ctx.db, "retention_day") !== dayKey(ctx.now(), tz)) {
      setMeta(ctx.db, "retention_day", dayKey(ctx.now(), tz));
      await runJob(ctx, "retention", () => runRetention(ctx));
    }
  };

  // React quickly to fresh mail instead of waiting for the next tick.
  const onSyncDone = (event: { inserted: number }) => {
    if (event.inserted > 0) {
      setMeta(ctx.db, "data_changed_at", ctx.now().toISOString());
      void runJob(ctx, "dispatch", () => dispatchInstant(ctx));
      if (!getMeta(ctx.db, "briefing")) void refreshBriefingIfStale(ctx);
    }
  };
  ctx.bus.on("sync:done", onSyncDone);

  const first = setTimeout(() => void tick(), 4000);
  const interval = setInterval(() => void tick(), 60_000);
  interval.unref?.();
  first.unref?.();
  return {
    stop() {
      stopped = true;
      clearTimeout(first);
      clearInterval(interval);
      ctx.bus.off("sync:done", onSyncDone);
    },
    tick,
  };
}
