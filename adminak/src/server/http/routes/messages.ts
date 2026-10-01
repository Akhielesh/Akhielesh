import { Hono } from "hono";
import { z } from "zod";
import { CATEGORIES, RULE_FIELDS, RULE_OPERATORS, SEVERITIES, type AnalysisDTO, type Category, type MessageDetailDTO, type MessageListItem, type SenderSummary } from "../../../shared/types.js";
import { audit, type AppContext } from "../../context.js";
import { ftsQuery, parseJson } from "../../db/index.js";
import { aiAvailable, enrichMessage } from "../../intel/ai.js";
import { deserializeAnalysis, rematerialize, type StoredAnalysis } from "../../intel/materialize.js";
import { loadRules, ruleFromRow, ruleMatches, ruleSubject } from "../../intel/rules.js";
import { ALERT_SELECT, alertFromRow } from "../../services/alerts.js";
import { INSIGHT_SELECT, insightFromRow } from "../../services/dashboard.js";
import { VENDOR_COLUMNS, vendorRefFromRow } from "../../services/vendors.js";
import { HttpError, intParam, readJson, type AppEnv } from "../util.js";

export interface MessageListRow {
  id: number;
  account_id: number;
  subject: string;
  snippet: string;
  from_name: string | null;
  from_email: string | null;
  received_at: string;
  category: Category;
  subtype: string | null;
  confidence: number;
  importance: number;
  summary: string | null;
  vendor_id: number | null;
  attachments: string;
  user_category: Category | null;
  ai_status: string | null;
  v_slug: string | null;
  v_name: string | null;
  v_domain: string | null;
  v_kind: string | null;
  v_color: string | null;
}

export const messageListSelect = `SELECT m.id, m.account_id, m.subject, m.snippet, m.from_name, m.from_email, m.received_at, m.category, m.subtype, m.confidence,
  m.importance, m.summary, m.vendor_id, m.attachments, m.user_category, m.ai_status, ${VENDOR_COLUMNS}
  FROM messages m LEFT JOIN vendors v ON v.id = m.vendor_id`;

export function messageListFromRow(r: MessageListRow): MessageListItem {
  return {
    id: r.id,
    accountId: r.account_id,
    subject: r.subject,
    snippet: r.snippet,
    fromName: r.from_name,
    fromEmail: r.from_email,
    receivedAt: r.received_at,
    category: r.category,
    subtype: r.subtype,
    confidence: r.confidence,
    importance: r.importance,
    summary: r.summary,
    vendor: vendorRefFromRow(r),
    hasAttachments: parseJson<unknown[]>(r.attachments, []).length > 0,
    userCategory: r.user_category,
    aiEnriched: r.ai_status === "done",
  };
}

const ruleSchema = z.object({
  name: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(z.object({ field: z.enum(RULE_FIELDS), op: z.enum(RULE_OPERATORS), value: z.string().max(300) })).min(1).max(10),
  actions: z.object({
    alert: z.boolean().optional(),
    severity: z.enum(SEVERITIES).optional(),
    title: z.string().max(160).optional(),
    category: z.enum(CATEGORIES).optional(),
    ignore: z.boolean().optional(),
  }),
});

export function messageRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/messages", (c) => {
    const q = c.req.query("q")?.trim();
    const category = c.req.query("category");
    const account = c.req.query("account");
    const vendor = c.req.query("vendor");
    const before = c.req.query("before");
    const minImportance = Number(c.req.query("minImportance") ?? 0);
    const limit = Math.min(200, Number(c.req.query("limit") ?? 60));
    const where: string[] = [];
    const params: unknown[] = [];
    let from = messageListSelect;
    if (q) {
      const fts = ftsQuery(q);
      if (fts) {
        from = `${messageListSelect} JOIN messages_fts f ON f.rowid = m.id`;
        where.push("messages_fts MATCH ?");
        params.push(fts);
      }
    }
    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      where.push("m.category = ?");
      params.push(category);
    } else if (category === "signal") {
      where.push("m.category NOT IN ('promotions','newsletters','social','other')");
    }
    if (account) {
      where.push("m.account_id = ?");
      params.push(Number(account));
    }
    if (vendor) {
      where.push("v.slug = ?");
      params.push(vendor);
    }
    if (before) {
      where.push("m.received_at < ?");
      params.push(before);
    }
    if (minImportance > 0) {
      where.push("m.importance >= ?");
      params.push(minImportance);
    }
    const rows = ctx.db.prepare(`${from} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY m.received_at DESC LIMIT ?`).all(...params, limit) as MessageListRow[];
    return c.json(rows.map(messageListFromRow));
  });

  app.get("/messages/:id", (c) => {
    const id = intParam(c, "id");
    const row = ctx.db
      .prepare(`SELECT m.*, ${VENDOR_COLUMNS}, a.label AS account_label, a.email AS account_email FROM messages m LEFT JOIN vendors v ON v.id = m.vendor_id LEFT JOIN accounts a ON a.id = m.account_id WHERE m.id = ?`)
      .get(id) as (MessageListRow & { body_text: string | null; to_email: string | null; labels: string; analysis: string; account_label: string | null; account_email: string | null; list_unsubscribe: string | null }) | undefined;
    if (!row) throw new HttpError(404, "Message not found");
    const stored = parseJson<StoredAnalysis | null>(row.analysis, null);
    const analysis: AnalysisDTO = {
      reasons: stored?.reasons ?? [],
      amounts: (stored?.amounts ?? []).map(({ amount, currency, label, raw }) => ({ amount, currency, label, raw })),
      dates: (stored?.dates ?? []).map(({ kind, at, text }) => ({ kind, at, text })),
      cycle: (stored?.cycle as AnalysisDTO["cycle"]) ?? null,
      plan: stored?.plan ?? null,
      paymentMethod: stored?.paymentMethod ?? null,
      data: Object.fromEntries(Object.entries(stored?.data ?? {}).filter(([k]) => k !== "ai")),
      links: stored?.links ?? [],
      unsubscribeUrl: row.list_unsubscribe,
      ai: (stored?.data?.ai as AnalysisDTO["ai"]) ?? null,
    };
    const detail: MessageDetailDTO = {
      ...messageListFromRow(row),
      bodyText: row.body_text,
      toEmail: row.to_email,
      labels: parseJson<string[]>(row.labels, []),
      attachments: parseJson(row.attachments, []),
      account: row.account_label ? { id: row.account_id, label: row.account_label, email: row.account_email ?? "" } : null,
      analysis,
      insights: (ctx.db.prepare(`${INSIGHT_SELECT} WHERE i.message_id = ?`).all(id) as Parameters<typeof insightFromRow>[0][]).map(insightFromRow),
      alerts: (ctx.db.prepare(`${ALERT_SELECT} WHERE a.message_id = ? ORDER BY a.created_at DESC`).all(id) as Parameters<typeof alertFromRow>[0][]).map(alertFromRow),
    };
    return c.json(detail);
  });

  app.post("/messages/:id/reclassify", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, z.object({ category: z.enum(CATEGORIES), remember: z.enum(["none", "sender", "domain"]).default("none") }));
    const row = ctx.db.prepare("SELECT analysis, body_text, from_email, from_domain FROM messages WHERE id = ?").get(id) as
      | { analysis: string; body_text: string | null; from_email: string | null; from_domain: string | null }
      | undefined;
    if (!row) throw new HttpError(404, "Message not found");
    const stored = parseJson<StoredAnalysis | null>(row.analysis, null);
    if (!stored) throw new HttpError(409, "This message has no stored analysis.");
    const analysis = deserializeAnalysis(stored, row.body_text ?? "");
    if (analysis.category !== body.category) {
      analysis.category = body.category;
      analysis.subtype = body.category === "personal" ? "message" : "general";
      analysis.confidence = 0.99;
      analysis.reasons = ["You reclassified this email", ...analysis.reasons].slice(0, 5);
    }
    rematerialize(ctx, id, analysis);
    ctx.db.prepare("UPDATE messages SET user_category = ? WHERE id = ?").run(body.category, id);
    const pattern = body.remember === "sender" ? row.from_email : body.remember === "domain" ? (row.from_domain ? `@${row.from_domain}` : null) : null;
    if (pattern) {
      ctx.db
        .prepare("INSERT INTO sender_overrides(pattern, category, ignore, created_at) VALUES (?, ?, 0, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category, ignore = 0")
        .run(pattern, body.category, ctx.now().toISOString());
    }
    audit(ctx, "message.reclassify", `${id} → ${body.category}${pattern ? ` (remember ${pattern})` : ""}`);
    return c.json({ ok: true });
  });

  app.post("/messages/:id/mute-sender", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, z.object({ scope: z.enum(["sender", "domain"]).default("sender") }));
    const row = ctx.db.prepare("SELECT from_email, from_domain FROM messages WHERE id = ?").get(id) as { from_email: string | null; from_domain: string | null } | undefined;
    if (!row?.from_email) throw new HttpError(404, "Message not found");
    const pattern = body.scope === "domain" && row.from_domain ? `@${row.from_domain}` : row.from_email;
    ctx.db
      .prepare("INSERT INTO sender_overrides(pattern, category, ignore, created_at) VALUES (?, NULL, 1, ?) ON CONFLICT(pattern) DO UPDATE SET ignore = 1")
      .run(pattern, ctx.now().toISOString());
    const like = body.scope === "domain" ? "from_domain = ?" : "from_email = ?";
    ctx.db.prepare(`UPDATE messages SET muted = 1 WHERE ${like}`).run(body.scope === "domain" ? row.from_domain : row.from_email);
    ctx.db.prepare(`UPDATE alerts SET status = 'done' WHERE status IN ('new','read') AND message_id IN (SELECT id FROM messages WHERE ${like})`).run(body.scope === "domain" ? row.from_domain : row.from_email);
    audit(ctx, "sender.mute", pattern);
    return c.json({ ok: true, pattern });
  });

  app.post("/messages/:id/enrich", async (c) => {
    if (!aiAvailable(ctx)) throw new HttpError(409, "AI is not configured. Add ANTHROPIC_API_KEY and enable AI in Settings.");
    const result = await enrichMessage(ctx, intParam(c, "id"));
    return c.json({ ok: !!result, result });
  });

  app.get("/senders", (c) => {
    const category = c.req.query("category");
    const params: unknown[] = [new Date(ctx.now().getTime() - 90 * 86400000).toISOString()];
    let filter = "m.category IN ('promotions','newsletters','social')";
    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      filter = "m.category = ?";
      params.push(category);
    }
    const rows = ctx.db
      .prepare(
        `SELECT m.from_email, MAX(m.from_name) AS from_name, m.from_domain, COUNT(*) AS count, MAX(m.received_at) AS last_at, MAX(m.category) AS category,
           MAX(m.list_unsubscribe) AS unsub, MAX(m.muted) AS muted
         FROM messages m WHERE m.received_at >= ? AND ${filter} AND m.from_email IS NOT NULL
         GROUP BY m.from_email ORDER BY count DESC LIMIT 60`,
      )
      .all(...params) as { from_email: string; from_name: string | null; from_domain: string | null; count: number; last_at: string; category: Category; unsub: string | null; muted: number }[];
    const senders: SenderSummary[] = rows.map((r) => ({
      fromEmail: r.from_email,
      fromName: r.from_name,
      domain: r.from_domain ?? "",
      count: r.count,
      lastAt: r.last_at,
      category: r.category,
      unsubscribeUrl: r.unsub,
      muted: !!r.muted,
    }));
    return c.json(senders);
  });

  app.post("/senders/mute", async (c) => {
    const body = await readJson(c, z.object({ email: z.email().max(320), scope: z.enum(["sender", "domain"]).default("sender"), muted: z.boolean().default(true) }));
    const email = body.email.toLowerCase();
    const domain = email.split("@")[1]!;
    const pattern = body.scope === "domain" ? `@${domain}` : email;
    const like = body.scope === "domain" ? "from_domain = ?" : "from_email = ?";
    const value = body.scope === "domain" ? domain : email;
    if (body.muted) {
      ctx.db
        .prepare("INSERT INTO sender_overrides(pattern, category, ignore, created_at) VALUES (?, NULL, 1, ?) ON CONFLICT(pattern) DO UPDATE SET ignore = 1")
        .run(pattern, ctx.now().toISOString());
      ctx.db.prepare(`UPDATE alerts SET status = 'done' WHERE status IN ('new','read') AND message_id IN (SELECT id FROM messages WHERE ${like})`).run(value);
    } else {
      ctx.db.prepare("DELETE FROM sender_overrides WHERE pattern = ? AND category IS NULL").run(pattern);
      ctx.db.prepare("UPDATE sender_overrides SET ignore = 0 WHERE pattern = ?").run(pattern);
    }
    ctx.db.prepare(`UPDATE messages SET muted = ? WHERE ${like}`).run(body.muted ? 1 : 0, value);
    audit(ctx, body.muted ? "sender.mute" : "sender.unmute", pattern);
    return c.json({ ok: true, pattern });
  });

  // ── Rules ──────────────────────────────────────────────────────────────────
  app.get("/rules", (c) => c.json(loadRules(ctx.db, false)));

  app.post("/rules", async (c) => {
    const body = await readJson(c, ruleSchema);
    const now = ctx.now().toISOString();
    const res = ctx.db
      .prepare("INSERT INTO rules(name, enabled, match, conditions, actions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(body.name, body.enabled ? 1 : 0, body.match, JSON.stringify(body.conditions), JSON.stringify(body.actions), now, now);
    audit(ctx, "rule.create", body.name);
    return c.json(ruleFromRow(ctx.db.prepare("SELECT * FROM rules WHERE id = ?").get(Number(res.lastInsertRowid)) as Parameters<typeof ruleFromRow>[0]), 201);
  });

  app.patch("/rules/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, ruleSchema.partial());
    const existing = ctx.db.prepare("SELECT * FROM rules WHERE id = ?").get(id) as Parameters<typeof ruleFromRow>[0] | undefined;
    if (!existing) throw new HttpError(404, "Rule not found");
    const merged = { ...ruleFromRow(existing), ...body };
    ctx.db
      .prepare("UPDATE rules SET name = ?, enabled = ?, match = ?, conditions = ?, actions = ?, updated_at = ? WHERE id = ?")
      .run(merged.name, merged.enabled ? 1 : 0, merged.match, JSON.stringify(merged.conditions), JSON.stringify(merged.actions), ctx.now().toISOString(), id);
    return c.json(ruleFromRow(ctx.db.prepare("SELECT * FROM rules WHERE id = ?").get(id) as Parameters<typeof ruleFromRow>[0]));
  });

  app.delete("/rules/:id", (c) => {
    ctx.db.prepare("DELETE FROM rules WHERE id = ?").run(intParam(c, "id"));
    return c.json({ ok: true });
  });

  app.post("/rules/test", async (c) => {
    const body = await readJson(c, ruleSchema.pick({ match: true, conditions: true }));
    const rows = ctx.db.prepare("SELECT id, subject, from_name, from_email, category, analysis, body_text FROM messages ORDER BY received_at DESC LIMIT 1000").all() as {
      id: number;
      subject: string;
      from_name: string | null;
      from_email: string | null;
      category: Category;
      analysis: string;
      body_text: string | null;
    }[];
    const matched: number[] = [];
    for (const r of rows) {
      const stored = parseJson<StoredAnalysis | null>(r.analysis, null);
      const subject = ruleSubject(
        { from: { name: r.from_name, address: r.from_email }, subject: r.subject },
        { category: r.category, vendor: stored?.vendor ?? null, primaryAmount: stored?.primaryAmount ? { ...stored.primaryAmount, score: 0 } : null, cleanText: r.body_text ?? "" },
      );
      if (ruleMatches(subject, body)) matched.push(r.id);
    }
    const preview = matched.length
      ? (ctx.db.prepare(`${messageListSelect} WHERE m.id IN (${matched.slice(0, 25).map(() => "?").join(",")}) ORDER BY m.received_at DESC`).all(...matched.slice(0, 25)) as MessageListRow[]).map(
          messageListFromRow,
        )
      : [];
    return c.json({ total: matched.length, scanned: rows.length, preview });
  });

  // ── Sender overrides ───────────────────────────────────────────────────────
  app.get("/sender-overrides", (c) => {
    const rows = ctx.db.prepare("SELECT * FROM sender_overrides ORDER BY created_at DESC").all() as { id: number; pattern: string; category: Category | null; ignore: number; created_at: string }[];
    return c.json(rows.map((r) => ({ id: r.id, pattern: r.pattern, category: r.category, ignore: !!r.ignore, createdAt: r.created_at })));
  });

  app.post("/sender-overrides", async (c) => {
    const body = await readJson(
      c,
      z.object({ pattern: z.string().min(3).max(200).regex(/^@?[^\s@]+(@[^\s@]+)?$/, "Use an email address or @domain"), category: z.enum(CATEGORIES).nullable().optional(), ignore: z.boolean().default(false) }),
    );
    ctx.db
      .prepare("INSERT INTO sender_overrides(pattern, category, ignore, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category, ignore = excluded.ignore")
      .run(body.pattern.toLowerCase(), body.category ?? null, body.ignore ? 1 : 0, ctx.now().toISOString());
    return c.json({ ok: true }, 201);
  });

  app.delete("/sender-overrides/:id", (c) => {
    ctx.db.prepare("DELETE FROM sender_overrides WHERE id = ?").run(intParam(c, "id"));
    return c.json({ ok: true });
  });

  return app;
}
