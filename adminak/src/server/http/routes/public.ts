import { Hono, type Context } from "hono";
import { z } from "zod";
import { formatMoney, formatTotals } from "../../../shared/format.js";
import type { TimelineItem } from "../../../shared/types.js";
import type { AppContext } from "../../context.js";
import { parseRawEmail } from "../../ingest/imap.js";
import { ingestBatch, syncAll, type IngestStats } from "../../ingest/sync.js";
import type { IncomingEmail } from "../../intel/types.js";
import { sendDigest } from "../../notify/dispatcher.js";
import { buildOverview, buildTimeline } from "../../services/dashboard.js";
import { randomToken } from "../../security/vault.js";
import { HttpError, RateLimiter, clientIp, readJson } from "../util.js";
import { tokenMatches } from "./system.js";

const hookLimiter = new RateLimiter(120, 60_000);
const calendarLimiter = new RateLimiter(60, 60_000);

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char) > (out.length ? 74 : 75)) {
      out.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function dateValue(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

export function buildIcs(ctx: AppContext, items: TimelineItem[]): string {
  const now = ctx.now();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adminak//Personal Intelligence//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Adminak",
    "X-WR-CALDESC:Renewals\\, bills\\, trips\\, interviews and appointments detected by Adminak",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const item of items) {
    const title = `${item.title}${item.amount !== null ? ` · ${formatMoney(item.amount, item.currency)}` : ""}`;
    lines.push("BEGIN:VEVENT", `UID:${item.id}@adminak`, `DTSTAMP:${stamp(now)}`);
    if (item.allDay) {
      const start = new Date(item.at);
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1, 12));
      lines.push(`DTSTART;VALUE=DATE:${dateValue(item.at)}`, `DTEND;VALUE=DATE:${dateValue(end.toISOString())}`);
    } else {
      const start = new Date(item.at);
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 3600_000))}`);
    }
    lines.push(`SUMMARY:${icsEscape(title)}`);
    const description = [item.subtitle, item.href ? `${ctx.config.appUrl}${item.href}` : null].filter(Boolean).join("\n");
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    if (item.href) lines.push(`URL:${ctx.config.appUrl}${item.href}`);
    lines.push(`CATEGORIES:${icsEscape(item.category)}`);
    if (["bill_due", "trial_end", "renewal", "flight", "interview", "appointment"].includes(item.kind)) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(title)}`, item.allDay ? "TRIGGER:-PT15H" : "TRIGGER:-PT2H", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function hookAuth(ctx: AppContext, c: Context): void {
  const ip = clientIp(c, ctx.config.trustProxy);
  if (!hookLimiter.take(`hook:${ip}`).ok) throw new HttpError(429, "Too many requests");
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : c.req.query("token");
  if (!tokenMatches(ctx, "hook", token)) throw new HttpError(401, "Invalid or missing automation token");
}

function webhookAccountId(ctx: AppContext): number {
  const row = ctx.db.prepare("SELECT id FROM accounts WHERE provider = 'webhook'").get() as { id: number } | undefined;
  if (row) return row.id;
  return Number(
    ctx.db
      .prepare("INSERT INTO accounts(provider, label, email, status, settings, created_at) VALUES ('webhook', 'Automation inbox', 'automations@adminak', 'active', '{}', ?)")
      .run(ctx.now().toISOString()).lastInsertRowid,
  );
}

const ingestSchema = z.object({
  from: z.string().min(3).max(320),
  fromName: z.string().max(200).optional(),
  to: z.string().max(320).optional(),
  subject: z.string().max(1000).default(""),
  text: z.string().max(500_000).optional(),
  html: z.string().max(2_000_000).optional(),
  date: z.string().max(60).optional(),
  messageId: z.string().max(500).optional(),
});

export function publicRoutes(ctx: AppContext) {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true, version: ctx.version, time: ctx.now().toISOString() }));

  app.get("/calendar/:file", (c) => {
    const ip = clientIp(c, ctx.config.trustProxy);
    if (!calendarLimiter.take(`cal:${ip}`).ok) throw new HttpError(429, "Too many requests");
    const token = c.req.param("file").replace(/\.ics$/, "");
    if (!tokenMatches(ctx, "calendar", token)) throw new HttpError(404, "Not found");
    const now = ctx.now();
    const items = buildTimeline(ctx, new Date(now.getTime() - 14 * 86400000), new Date(now.getTime() + 365 * 86400000));
    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header("Cache-Control", "private, max-age=900");
    return c.body(buildIcs(ctx, items));
  });

  app.post("/api/hooks/scan", async (c) => {
    hookAuth(ctx, c);
    if (c.req.query("wait") === "1") return c.json({ ok: true, outcomes: await syncAll(ctx, "hook") });
    void syncAll(ctx, "hook");
    return c.json({ ok: true, started: true }, 202);
  });

  app.post("/api/hooks/digest", async (c) => {
    hookAuth(ctx, c);
    return c.json(await sendDigest(ctx, "digest"));
  });

  app.get("/api/hooks/summary", (c) => {
    hookAuth(ctx, c);
    const overview = buildOverview(ctx);
    return c.json({
      generatedAt: overview.generatedAt,
      openAlerts: overview.kpis.openAlerts.total,
      critical: overview.kpis.openAlerts.critical,
      subscriptionsMonthly: formatTotals(overview.kpis.monthlySubscriptions),
      dueNext7: formatTotals(overview.kpis.dueNext7.total),
      spentThisMonth: formatTotals(overview.kpis.spendThisMonth),
      next: overview.upcoming.slice(0, 5).map((u) => ({ at: u.at, title: u.title, amount: u.amount !== null ? formatMoney(u.amount, u.currency) : null })),
      attention: overview.attention.slice(0, 5).map((a) => ({ severity: a.severity, title: a.title })),
      briefing: overview.briefing?.text ?? null,
    });
  });

  app.post("/api/hooks/ingest", async (c) => {
    hookAuth(ctx, c);
    const type = (c.req.header("content-type") ?? "").toLowerCase();
    let email: IncomingEmail;
    if (type.includes("message/rfc822") || type.startsWith("text/plain")) {
      const raw = await c.req.text();
      if (raw.length > 5_000_000) throw new HttpError(413, "Message too large");
      email = await parseRawEmail(raw, `hook-${randomToken(12)}`);
    } else {
      const body = await readJson(c, ingestSchema);
      const match = /^(.*?)\s*<([^>]+)>$/.exec(body.from);
      email = {
        providerId: `hook-${randomToken(12)}`,
        messageId: body.messageId ?? null,
        threadId: null,
        from: { name: body.fromName ?? (match ? match[1]!.replace(/"/g, "").trim() : null), address: (match ? match[2]! : body.from).toLowerCase() },
        to: body.to ? [body.to] : [],
        subject: body.subject,
        date: body.date && !Number.isNaN(new Date(body.date).getTime()) ? new Date(body.date) : ctx.now(),
        text: body.text ?? "",
        html: body.html ?? null,
        headers: {},
        attachments: [],
        labels: [],
      };
    }
    const stats: IngestStats = { fetched: 0, inserted: 0, alerts: 0, skippedOwn: 0, labeled: [] };
    const accountId = webhookAccountId(ctx);
    ingestBatch(ctx, accountId, [email], stats);
    const stored = ctx.db.prepare("SELECT id, category, subtype, summary FROM messages WHERE account_id = ? AND provider_id = ?").get(accountId, email.providerId) as
      | { id: number; category: string; subtype: string; summary: string }
      | undefined;
    if (stats.inserted) ctx.bus.emit("sync:done", { accountId, inserted: stats.inserted, alerts: stats.alerts });
    return c.json({ ok: true, stored: !!stored, duplicate: !stored && stats.skippedOwn === 0, message: stored ?? null, alertsCreated: stats.alerts }, stored ? 201 : 200);
  });

  return app;
}
