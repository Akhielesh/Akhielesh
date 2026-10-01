import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { SystemStatusDTO } from "../../../shared/types.js";
import { audit, type AppContext } from "../../context.js";
import { getMeta, setMeta } from "../../db/index.js";
import { aiUsageToday, askAdminak, generateBriefing } from "../../intel/ai.js";
import { emailConfigured } from "../../notify/transport.js";
import { SettingsPatchSchema } from "../../services/settings.js";
import { randomToken, safeEqual } from "../../security/vault.js";
import { HttpError, readJson, toCsv, type AppEnv } from "../util.js";

export type TokenKind = "hook" | "calendar";

/** Automation + calendar tokens are stored encrypted so the owner can reveal and copy them. */
export function getToken(ctx: AppContext, kind: TokenKind, create = true): string | null {
  const stored = getMeta(ctx.db, `${kind}_token_enc`);
  if (stored) return ctx.vault.decrypt(stored);
  if (!create) return null;
  const token = randomToken(24);
  setMeta(ctx.db, `${kind}_token_enc`, ctx.vault.encrypt(token));
  return token;
}

export function rotateToken(ctx: AppContext, kind: TokenKind): string {
  const token = randomToken(24);
  setMeta(ctx.db, `${kind}_token_enc`, ctx.vault.encrypt(token));
  return token;
}

export function tokenMatches(ctx: AppContext, kind: TokenKind, candidate: string | undefined | null): boolean {
  if (!candidate) return false;
  const token = getToken(ctx, kind, false);
  return !!token && safeEqual(token, candidate);
}

const EXPORT_TABLES: Record<string, { sql: string; columns: string[] }> = {
  subscriptions: {
    sql: "SELECT s.id, s.name, s.plan, s.kind, s.amount, s.currency, s.cycle, s.status, s.next_renewal_at, s.last_charged_at, s.trial_ends_at, s.payment_method, s.manage_url, s.source, s.notes FROM subscriptions s ORDER BY s.name",
    columns: ["id", "name", "plan", "kind", "amount", "currency", "cycle", "status", "next_renewal_at", "last_charged_at", "trial_ends_at", "payment_method", "manage_url", "source", "notes"],
  },
  charges: {
    sql: "SELECT c.id, c.occurred_at, c.description, c.amount, c.currency, c.direction, c.kind, c.spend_category, c.status, c.payment_method, v.name AS vendor FROM charges c LEFT JOIN vendors v ON v.id = c.vendor_id ORDER BY c.occurred_at DESC",
    columns: ["id", "occurred_at", "description", "amount", "currency", "direction", "kind", "spend_category", "status", "payment_method", "vendor"],
  },
  bills: {
    sql: "SELECT id, name, kind, amount_due, minimum_due, currency, due_at, status, autopay, account_hint, paid_at, paid_amount, notes FROM bills ORDER BY due_at DESC",
    columns: ["id", "name", "kind", "amount_due", "minimum_due", "currency", "due_at", "status", "autopay", "account_hint", "paid_at", "paid_amount", "notes"],
  },
  alerts: {
    sql: "SELECT id, created_at, type, category, severity, status, title, body, due_at FROM alerts ORDER BY created_at DESC",
    columns: ["id", "created_at", "type", "category", "severity", "status", "title", "body", "due_at"],
  },
  messages: {
    sql: "SELECT id, received_at, from_name, from_email, subject, category, subtype, importance, summary FROM messages ORDER BY received_at DESC",
    columns: ["id", "received_at", "from_name", "from_email", "subject", "category", "subtype", "importance", "summary"],
  },
  insights: {
    sql: "SELECT id, occurred_at, category, type, title, status, occurs_at, group_key, amount, currency FROM insights ORDER BY occurred_at DESC",
    columns: ["id", "occurred_at", "category", "type", "title", "status", "occurs_at", "group_key", "amount", "currency"],
  },
};

export function systemRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/settings", (c) => c.json(ctx.settings.get()));

  app.patch("/settings", async (c) => {
    const body = await readJson(c, SettingsPatchSchema);
    const next = ctx.settings.patch(body);
    audit(ctx, "settings.update", Object.keys(body).join(","));
    return c.json(next);
  });

  app.get("/automation", (c) => {
    const hook = getToken(ctx, "hook")!;
    const calendar = getToken(ctx, "calendar")!;
    const base = ctx.config.appUrl;
    return c.json({
      hookToken: hook,
      calendarUrl: `${base}/calendar/${calendar}.ics`,
      webcalUrl: `${base.replace(/^https?:/, "webcal:")}/calendar/${calendar}.ics`,
      endpoints: {
        scan: `${base}/api/hooks/scan`,
        ingest: `${base}/api/hooks/ingest`,
        digest: `${base}/api/hooks/digest`,
        summary: `${base}/api/hooks/summary`,
      },
    });
  });

  app.post("/automation/rotate", async (c) => {
    const body = await readJson(c, z.object({ which: z.enum(["hook", "calendar"]) }));
    rotateToken(ctx, body.which);
    audit(ctx, "token.rotate", body.which);
    return c.json({ ok: true });
  });

  app.get("/system", (c) => {
    const file = path.join(ctx.config.dataDir, "adminak.db");
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      size = 0;
    }
    const count = (table: string) => (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    const usage = aiUsageToday(ctx);
    const status: SystemStatusDTO = {
      version: ctx.version,
      startedAt: ctx.startedAt.toISOString(),
      now: ctx.now().toISOString(),
      dataDir: path.resolve(ctx.config.dataDir),
      dbSizeBytes: size,
      counts: {
        accounts: count("accounts"),
        messages: count("messages"),
        subscriptions: count("subscriptions"),
        bills: count("bills"),
        charges: count("charges"),
        insights: count("insights"),
        alerts: count("alerts"),
        rules: count("rules"),
        channels: count("channels"),
      },
      integrations: {
        smtp: !!ctx.config.smtp,
        gmailApi: !!ctx.config.google,
        ai: !!ctx.config.ai,
        aiModel: ctx.config.aiModel,
        push: true,
        appUrl: ctx.config.appUrl,
      },
      jobs: (ctx.db.prepare("SELECT * FROM job_state ORDER BY name").all() as { name: string; last_run_at: string | null; last_status: string | null; last_error: string | null; duration_ms: number | null }[]).map((j) => ({
        name: j.name,
        lastRunAt: j.last_run_at,
        lastStatus: j.last_status,
        lastError: j.last_error,
        durationMs: j.duration_ms,
      })),
      ai: { callsToday: usage.calls, inputTokensToday: usage.input, outputTokensToday: usage.output, limit: ctx.settings.get().ai.dailyLimit },
    };
    return c.json({ ...status, emailConfigured: emailConfigured(ctx) });
  });

  app.get("/audit", (c) => {
    const rows = ctx.db.prepare("SELECT id, at, action, detail, ip FROM audit_log ORDER BY at DESC, id DESC LIMIT 200").all();
    return c.json(rows);
  });

  app.get("/export.json", (c) => {
    const dump: Record<string, unknown[]> = {};
    for (const [name, def] of Object.entries(EXPORT_TABLES)) dump[name] = ctx.db.prepare(def.sql).all();
    dump.rules = ctx.db.prepare("SELECT name, enabled, match, conditions, actions FROM rules").all();
    dump.settings = [ctx.settings.get()];
    audit(ctx, "data.export", "json");
    c.header("Content-Disposition", `attachment; filename="adminak-export-${ctx.now().toISOString().slice(0, 10)}.json"`);
    return c.json({ exportedAt: ctx.now().toISOString(), version: ctx.version, ...dump });
  });

  app.get("/export/:table", (c) => {
    const table = c.req.param("table").replace(/\.csv$/, "");
    const def = EXPORT_TABLES[table];
    if (!def) throw new HttpError(404, "Unknown export");
    const rows = ctx.db.prepare(def.sql).all() as Record<string, unknown>[];
    audit(ctx, "data.export", table);
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="adminak-${table}-${ctx.now().toISOString().slice(0, 10)}.csv"`);
    return c.body(toCsv(rows, def.columns));
  });

  app.post("/data/purge", async (c) => {
    const body = await readJson(c, z.object({ scope: z.enum(["bodies", "everything"]), confirm: z.string() }));
    if (body.confirm !== "PURGE") throw new HttpError(422, 'Type "PURGE" to confirm.');
    if (body.scope === "bodies") {
      const n = ctx.db.prepare("UPDATE messages SET body_text = NULL").run().changes;
      audit(ctx, "data.purge", `bodies ${n}`);
      return c.json({ ok: true, changed: n });
    }
    ctx.db.transaction(() => {
      for (const table of ["alerts", "insights", "charges", "subscription_events", "subscriptions", "bills", "messages", "sync_runs", "notifications", "vendors"]) {
        ctx.db.prepare(`DELETE FROM ${table}`).run();
      }
      ctx.db.prepare("UPDATE accounts SET sync_state = '{}', backfill_done = 0, message_count = 0, last_sync_at = NULL").run();
    })();
    audit(ctx, "data.purge", "everything");
    return c.json({ ok: true });
  });

  app.post("/ask", async (c) => {
    const body = await readJson(c, z.object({ question: z.string().min(2).max(500) }));
    return c.json(await askAdminak(ctx, body.question));
  });

  app.post("/briefing", async (c) => c.json(await generateBriefing(ctx, { force: true })));

  return app;
}
