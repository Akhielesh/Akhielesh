import { CATEGORY_META, SPEND_CATEGORY_META } from "../../shared/catalog.js";
import { formatDate, formatMoney, sumByCurrency } from "../../shared/format.js";
import { dayKey, inTimeWindow, monthKey, parseHHMM, startOfZonedMonth, zonedParts } from "../../shared/time.js";
import type { AlertDTO, Category, NotificationKind, NotificationLogDTO, Severity } from "../../shared/types.js";
import { SEVERITY_RANK } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { getMeta, parseJson, setMeta } from "../db/index.js";
import { generateBriefing } from "../intel/ai.js";
import { getAlerts, queryAlerts } from "../services/alerts.js";
import { buildTimeline, careerSummary, incomeTotals, spendByCategory, spendTotals, subscriptionMonthlyTotals, topMerchants } from "../services/dashboard.js";
import { deliver, type ChannelMessage, type ChannelRow } from "./channels.js";
import {
  renderAlertsEmail,
  renderDigestEmail,
  renderReportEmail,
  renderTestEmail,
  shortAlertText,
  type DigestData,
  type EmailContent,
  type ReportData,
  type TemplateEnv,
} from "./templates/emails.js";

const DAY = 86400000;
const MAX_ATTEMPTS = 4;

export function templateEnv(ctx: AppContext): TemplateEnv {
  const settings = ctx.settings.get();
  const user = ctx.db.prepare("SELECT name FROM users ORDER BY id LIMIT 1").get() as { name: string } | undefined;
  return { appUrl: ctx.config.appUrl, timeZone: settings.profile.timezone, name: settings.profile.name || user?.name || "", now: ctx.now() };
}

function enabledChannels(ctx: AppContext): ChannelRow[] {
  return ctx.db.prepare("SELECT * FROM channels WHERE enabled = 1 ORDER BY id").all() as ChannelRow[];
}

function eventsOf(row: ChannelRow): Record<string, boolean> {
  return { instant: true, digest: true, weekly: true, monthly: true, system: true, ...parseJson<Record<string, boolean>>(row.events, {}) };
}

interface LogEntry {
  channel: ChannelRow;
  kind: NotificationKind;
  subject: string;
  alertIds: number[];
  message: ChannelMessage;
}

async function sendLogged(ctx: AppContext, entry: LogEntry): Promise<boolean> {
  const now = ctx.now().toISOString();
  const res = ctx.db
    .prepare(
      "INSERT INTO notifications(channel_id, channel_type, kind, subject, status, attempts, alert_ids, payload, created_at) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)",
    )
    .run(entry.channel.id, entry.channel.type, entry.kind, entry.subject.slice(0, 300), JSON.stringify(entry.alertIds), JSON.stringify(entry.message), now);
  return attempt(ctx, Number(res.lastInsertRowid), entry.channel, entry.message, 0);
}

async function attempt(ctx: AppContext, notificationId: number, channel: ChannelRow, message: ChannelMessage, attempts: number): Promise<boolean> {
  const now = ctx.now();
  try {
    const note = await deliver(ctx, channel, message);
    const skipped = note?.startsWith("No SMTP configured");
    ctx.db.prepare("UPDATE notifications SET status = ?, attempts = ?, sent_at = ?, error = ?, next_attempt_at = NULL WHERE id = ?").run(
      skipped ? "skipped" : "sent",
      attempts + 1,
      now.toISOString(),
      skipped ? note : null,
      notificationId,
    );
    ctx.db.prepare("UPDATE channels SET last_used_at = ?, last_error = ? WHERE id = ?").run(now.toISOString(), skipped ? note : null, channel.id);
    return !skipped;
  } catch (error) {
    const message_ = ((error as Error).message ?? String(error)).slice(0, 400);
    const next = attempts + 1 < MAX_ATTEMPTS ? new Date(now.getTime() + 2 ** attempts * 5 * 60_000).toISOString() : null;
    ctx.db.prepare("UPDATE notifications SET status = 'failed', attempts = ?, error = ?, next_attempt_at = ? WHERE id = ?").run(attempts + 1, message_, next, notificationId);
    ctx.db.prepare("UPDATE channels SET last_error = ? WHERE id = ?").run(message_, channel.id);
    ctx.log.warn("Notification failed", { channel: channel.name, error: message_ });
    return false;
  }
}

/** Retries failed deliveries with exponential backoff. */
export async function retryFailed(ctx: AppContext): Promise<number> {
  const due = ctx.db
    .prepare("SELECT id, channel_id, attempts, payload FROM notifications WHERE status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ? LIMIT 20")
    .all(ctx.now().toISOString()) as { id: number; channel_id: number | null; attempts: number; payload: string | null }[];
  let ok = 0;
  for (const row of due) {
    const channel = row.channel_id ? (ctx.db.prepare("SELECT * FROM channels WHERE id = ? AND enabled = 1").get(row.channel_id) as ChannelRow | undefined) : undefined;
    const message = parseJson<ChannelMessage | null>(row.payload, null);
    if (!channel || !message) {
      ctx.db.prepare("UPDATE notifications SET next_attempt_at = NULL WHERE id = ?").run(row.id);
      continue;
    }
    if (await attempt(ctx, row.id, channel, message, row.attempts)) ok++;
  }
  return ok;
}

function alertsMessage(ctx: AppContext, alerts: AlertDTO[], kind: "alerts" | "system" = "alerts"): ChannelMessage {
  const env = templateEnv(ctx);
  const email = renderAlertsEmail(env, alerts);
  const short = shortAlertText(alerts);
  return {
    kind,
    email,
    short: { ...short, url: alerts.length === 1 ? `${env.appUrl}/alerts?focus=${alerts[0]!.id}` : `${env.appUrl}/alerts` },
    json: { alerts },
  };
}

/**
 * Sends instant notifications for fresh alerts. Respects each channel's minimum severity,
 * the global instant threshold, and quiet hours (critical alerts always go through).
 */
export async function dispatchInstant(ctx: AppContext): Promise<{ sent: number; held: number }> {
  const settings = ctx.settings.get();
  const n = settings.notifications;
  const now = ctx.now();
  const pending = ctx.db
    .prepare("SELECT id, severity, type FROM alerts WHERE status = 'new' AND notify = 1 AND notified_at IS NULL AND created_at >= ? ORDER BY created_at ASC LIMIT 200")
    .all(new Date(now.getTime() - 18 * 3600_000).toISOString()) as { id: number; severity: Severity; type: string }[];
  if (pending.length === 0) return { sent: 0, held: 0 };
  const quiet = n.quietHours.enabled && inTimeWindow(now, settings.profile.timezone, n.quietHours.start, n.quietHours.end);
  const globalMin: Severity | "off" = n.instantMinSeverity;
  const ready = pending.filter((a) => !quiet || a.severity === "critical");
  const held = pending.length - ready.length;
  if (ready.length === 0) return { sent: 0, held };
  // Mark first so a slow channel can't cause duplicates on the next tick.
  const mark = ctx.db.prepare("UPDATE alerts SET notified_at = ? WHERE id = ?");
  ctx.db.transaction(() => {
    for (const a of ready) mark.run(now.toISOString(), a.id);
  })();
  if (globalMin === "off") return { sent: 0, held };
  const alerts = getAlerts(
    ctx,
    ready.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK[globalMin] || a.type === "system.sync_error" || a.type === "system.login").map((a) => a.id),
  );
  let sent = 0;
  for (const channel of enabledChannels(ctx)) {
    const events = eventsOf(channel);
    const selected = alerts.filter((a) => {
      const isSystem = a.type.startsWith("system.");
      if (isSystem) return events.system;
      return events.instant && SEVERITY_RANK[a.severity] >= SEVERITY_RANK[channel.min_severity];
    });
    if (selected.length === 0) continue;
    const message = alertsMessage(ctx, selected);
    if (await sendLogged(ctx, { channel, kind: "instant", subject: message.email.subject, alertIds: selected.map((a) => a.id), message })) sent++;
  }
  return { sent, held };
}

// ─── Digest & reports ────────────────────────────────────────────────────────

export async function buildDigestData(ctx: AppContext, since: Date): Promise<DigestData> {
  const now = ctx.now();
  const newAlerts = queryAlerts(ctx, { status: "open", limit: 200 }).filter((a) => a.createdAt >= since.toISOString());
  const open = ctx.db.prepare("SELECT COUNT(*) AS n, SUM(severity = 'critical') AS c FROM alerts WHERE status IN ('new','read')").get() as { n: number; c: number | null };
  const upcoming = buildTimeline(ctx, now, new Date(now.getTime() + 7 * DAY));
  const due = upcoming.filter((u) => u.kind === "bill_due" || u.kind === "renewal");
  const subs = subscriptionMonthlyTotals(ctx);
  const tz = ctx.settings.get().profile.timezone;
  const activityRows = ctx.db
    .prepare("SELECT category, summary, importance FROM messages WHERE received_at >= ? AND muted = 0 ORDER BY importance DESC")
    .all(since.toISOString()) as { category: Category; summary: string | null; importance: number }[];
  const groups = new Map<Category, { count: number; examples: string[] }>();
  for (const row of activityRows) {
    if (!CATEGORY_META[row.category].signal) continue;
    const g = groups.get(row.category) ?? { count: 0, examples: [] };
    g.count++;
    if (row.summary && g.examples.length < 3) g.examples.push(row.summary);
    groups.set(row.category, g);
  }
  const briefing = await generateBriefing(ctx).catch(() => null);
  return {
    alerts: newAlerts,
    upcoming,
    kpis: {
      openAlerts: open.n,
      critical: open.c ?? 0,
      dueThisWeek: sumByCurrency(due, (d) => d.amount, (d) => d.currency),
      dueCount: due.length,
      subscriptionsMonthly: subs.totals,
      spentThisMonth: spendTotals(ctx, startOfZonedMonth(now, tz, 0), new Date(now.getTime() + 1)),
    },
    activity: [...groups.entries()].map(([category, g]) => ({ category, ...g })).sort((a, b) => b.count - a.count),
    briefing: briefing?.text ?? null,
    emailsScanned: activityRows.length,
  };
}

export function buildReportData(ctx: AppContext, period: "weekly" | "monthly"): ReportData {
  const settings = ctx.settings.get();
  const tz = settings.profile.timezone;
  const now = ctx.now();
  let from: Date;
  let to: Date;
  let prevFrom: Date;
  let label: string;
  if (period === "weekly") {
    to = now;
    from = new Date(now.getTime() - 7 * DAY);
    prevFrom = new Date(now.getTime() - 14 * DAY);
    label = `${formatDate(from.toISOString(), tz, "monthDay")} – ${formatDate(new Date(to.getTime() - 1).toISOString(), tz, "monthDay")}`;
  } else {
    to = startOfZonedMonth(now, tz, 0);
    from = startOfZonedMonth(now, tz, -1);
    prevFrom = startOfZonedMonth(now, tz, -2);
    label = formatDate(new Date(from.getTime() + 2 * DAY).toISOString(), tz, "monthYear");
  }
  const subs = subscriptionMonthlyTotals(ctx);
  const events = ctx.db
    .prepare(
      `SELECT e.type, e.amount, e.old_amount, e.currency, s.name FROM subscription_events e JOIN subscriptions s ON s.id = e.subscription_id
       WHERE e.occurred_at >= ? AND e.occurred_at < ? AND e.type IN ('price_change','cancelled','trial_started','payment_failed','started') ORDER BY e.occurred_at`,
    )
    .all(from.toISOString(), to.toISOString()) as { type: string; amount: number | null; old_amount: number | null; currency: string | null; name: string }[];
  const newSubs = ctx.db.prepare("SELECT name, amount, currency FROM subscriptions WHERE created_at >= ? AND created_at < ? AND source = 'detected'").all(from.toISOString(), to.toISOString()) as {
    name: string;
    amount: number | null;
    currency: string | null;
  }[];
  const changes: ReportData["changes"] = [
    ...newSubs.map((s) => ({ kind: "new" as const, text: `${s.name} started${s.amount !== null ? ` — ${formatMoney(s.amount, s.currency)}` : ""}` })),
    ...events.map((e) => {
      if (e.type === "price_change")
        return { kind: "price" as const, text: `${e.name}: ${e.old_amount !== null ? formatMoney(e.old_amount, e.currency) : "?"} → ${e.amount !== null ? formatMoney(e.amount, e.currency) : "?"}` };
      if (e.type === "cancelled") return { kind: "cancelled" as const, text: `${e.name} cancelled` };
      if (e.type === "payment_failed") return { kind: "failed" as const, text: `${e.name} payment failed` };
      return { kind: "trial" as const, text: `${e.name} trial started` };
    }),
  ];
  const security = ctx.db
    .prepare("SELECT COUNT(*) AS n FROM insights WHERE category = 'security' AND type != 'verification_code' AND occurred_at >= ? AND occurred_at < ?")
    .get(from.toISOString(), to.toISOString()) as { n: number };
  const alertCounts = ctx.db
    .prepare("SELECT COUNT(*) AS n, SUM(severity = 'critical') AS c FROM alerts WHERE created_at >= ? AND created_at < ?")
    .get(from.toISOString(), to.toISOString()) as { n: number; c: number | null };
  const securityCritical = ctx.db
    .prepare("SELECT COUNT(*) AS n FROM alerts WHERE category = 'security' AND severity = 'critical' AND created_at >= ? AND created_at < ?")
    .get(from.toISOString(), to.toISOString()) as { n: number };
  const career = careerSummary(ctx);
  return {
    period,
    label,
    spent: spendTotals(ctx, from, to),
    spentPrevious: spendTotals(ctx, prevFrom, from),
    income: incomeTotals(ctx, from, to),
    byCategory: spendByCategory(ctx, from, to).map((c) => ({ label: SPEND_CATEGORY_META[c.category].label, amount: c.total, currency: settings.profile.currency })),
    subscriptionsMonthly: subs.totals,
    subscriptionCount: subs.active,
    changes,
    upcoming: buildTimeline(ctx, now, new Date(now.getTime() + (period === "weekly" ? 14 : 30) * DAY)),
    career: { active: career.active, interviews: career.interviewing, offers: career.offers, applied: career.applied },
    security: { events: security.n, critical: securityCritical.n },
    topMerchants: topMerchants(ctx, from, to, 5).map((m) => ({ name: m.name, amount: m.total, currency: m.currency })),
    alerts: { total: alertCounts.n, critical: alertCounts.c ?? 0 },
    briefing: null,
  };
}

function summaryText(kind: "digest" | "weekly" | "monthly", email: EmailContent): string {
  return email.preheader || (kind === "digest" ? "Your daily brief is ready" : "Your report is ready");
}

export async function sendDigest(ctx: AppContext, kind: "digest" | "weekly" | "monthly", opts: { channelIds?: number[] } = {}): Promise<{ sent: number; channels: number }> {
  const env = templateEnv(ctx);
  let email: EmailContent;
  let json: Record<string, unknown>;
  let severity: Severity = "info";
  if (kind === "digest") {
    const last = getMeta(ctx.db, "last_digest_at");
    const since = last ? new Date(last) : new Date(ctx.now().getTime() - DAY);
    const data = await buildDigestData(ctx, since);
    email = renderDigestEmail(env, data);
    json = { digest: data };
    severity = data.kpis.critical > 0 ? "high" : "info";
  } else {
    const data = buildReportData(ctx, kind);
    email = renderReportEmail(env, data);
    json = { report: data };
  }
  const message: ChannelMessage = {
    kind: kind === "digest" ? "digest" : "report",
    email,
    short: { title: email.subject.replace(/^\[Adminak\]\s*/, ""), body: summaryText(kind, email), url: env.appUrl, severity },
    json,
  };
  let channels = 0;
  let sent = 0;
  for (const channel of enabledChannels(ctx)) {
    if (opts.channelIds && !opts.channelIds.includes(channel.id)) continue;
    const events = eventsOf(channel);
    if (!opts.channelIds && !events[kind === "digest" ? "digest" : kind]) continue;
    channels++;
    if (await sendLogged(ctx, { channel, kind, subject: email.subject, alertIds: [], message })) sent++;
  }
  if (kind === "digest") setMeta(ctx.db, "last_digest_at", ctx.now().toISOString());
  return { sent, channels };
}

export async function sendTest(ctx: AppContext, channelId: number): Promise<{ ok: boolean; error?: string; note?: string }> {
  const channel = ctx.db.prepare("SELECT * FROM channels WHERE id = ?").get(channelId) as ChannelRow | undefined;
  if (!channel) return { ok: false, error: "Channel not found" };
  const env = templateEnv(ctx);
  const email = renderTestEmail(env, channel.name);
  const message: ChannelMessage = {
    kind: "test",
    email,
    short: { title: "Adminak test notification ✅", body: "Your alert channel is connected.", url: env.appUrl, severity: "low" },
    json: { test: true },
  };
  const ok = await sendLogged(ctx, { channel, kind: "test", subject: email.subject, alertIds: [], message });
  const row = ctx.db.prepare("SELECT status, error FROM notifications WHERE channel_id = ? ORDER BY id DESC LIMIT 1").get(channelId) as { status: string; error: string | null };
  return ok ? { ok: true } : row.status === "skipped" ? { ok: false, note: row.error ?? undefined, error: row.error ?? "Skipped" } : { ok: false, error: row.error ?? "Delivery failed" };
}

/** Sends a one-off system email (welcome, sign-in alerts) to every email channel that accepts system mail. */
export async function sendSystemEmail(ctx: AppContext, email: EmailContent, short: { title: string; body: string }): Promise<void> {
  const env = templateEnv(ctx);
  const message: ChannelMessage = { kind: "system", email, short: { ...short, url: env.appUrl, severity: "medium" }, json: { system: short } };
  for (const channel of enabledChannels(ctx)) {
    if (!eventsOf(channel).system) continue;
    await sendLogged(ctx, { channel, kind: "system", subject: email.subject, alertIds: [], message });
  }
}

/** Decides whether the scheduled digest/report is due right now (once per local day / week / month). */
export function scheduledDue(ctx: AppContext): ("digest" | "weekly" | "monthly")[] {
  const settings = ctx.settings.get();
  const n = settings.notifications;
  const tz = settings.profile.timezone;
  const now = ctx.now();
  const local = zonedParts(now, tz);
  const minutes = local.hour * 60 + local.minute;
  const at = (hhmm: string) => {
    const { hour, minute } = parseHHMM(hhmm);
    return hour * 60 + minute;
  };
  const today = dayKey(now, tz);
  const due: ("digest" | "weekly" | "monthly")[] = [];
  if (n.digest.enabled && minutes >= at(n.digest.time) && getMeta(ctx.db, "sched_digest_day") !== today) due.push("digest");
  if (n.weekly.enabled && local.weekday === n.weekly.day && minutes >= at(n.weekly.time) && getMeta(ctx.db, "sched_weekly_day") !== today) due.push("weekly");
  if (n.monthly.enabled && local.day === 1 && minutes >= at(n.monthly.time) && getMeta(ctx.db, "sched_monthly_month") !== monthKey(now, tz)) due.push("monthly");
  return due;
}

export function markScheduled(ctx: AppContext, kind: "digest" | "weekly" | "monthly"): void {
  const tz = ctx.settings.get().profile.timezone;
  const now = ctx.now();
  if (kind === "monthly") setMeta(ctx.db, "sched_monthly_month", monthKey(now, tz));
  else setMeta(ctx.db, `sched_${kind}_day`, dayKey(now, tz));
}

export function notificationLog(ctx: AppContext, limit = 50): NotificationLogDTO[] {
  const rows = ctx.db
    .prepare("SELECT n.*, c.name AS channel_name FROM notifications n LEFT JOIN channels c ON c.id = n.channel_id ORDER BY n.created_at DESC, n.id DESC LIMIT ?")
    .all(limit) as {
    id: number;
    channel_id: number | null;
    channel_type: string;
    channel_name: string | null;
    kind: NotificationKind;
    subject: string;
    status: NotificationLogDTO["status"];
    error: string | null;
    attempts: number;
    alert_ids: string;
    created_at: string;
    sent_at: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    channelType: r.channel_type,
    channelName: r.channel_name,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    error: r.error,
    attempts: r.attempts,
    alertCount: parseJson<number[]>(r.alert_ids, []).length,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  }));
}

