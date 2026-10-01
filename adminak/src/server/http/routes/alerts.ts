import { Hono } from "hono";
import { z } from "zod";
import { formatMoney } from "../../../shared/format.js";
import { ALERT_STATUSES, BILLING_CYCLES, CATEGORIES, SEVERITIES, SUBSCRIPTION_STATUSES, type AlertCounts, type Category, type Severity, type SubscriptionDetailDTO } from "../../../shared/types.js";
import { audit, type AppContext } from "../../context.js";
import { parseJson } from "../../db/index.js";
import { getAlerts, queryAlerts, resolveAlerts } from "../../services/alerts.js";
import { getSubscription, listSubscriptions, recomputeSubscription, savingsInsights, type SubscriptionOverrides } from "../../services/subscriptions.js";
import { subscriptionMonthlyTotals } from "../../services/dashboard.js";
import { vendorIdForName } from "../../services/vendors.js";
import { slugify } from "../../intel/vendor-resolve.js";
import { messageListSelect, messageListFromRow, type MessageListRow } from "./messages.js";
import { CHARGE_SELECT, chargeFromRow, type ChargeRow } from "./dashboard.js";
import { HttpError, intParam, readJson, type AppEnv } from "../util.js";

export function alertRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    const status = c.req.query("status") ?? "open";
    const severity = c.req.query("severity")?.split(",").filter((s): s is Severity => (SEVERITIES as readonly string[]).includes(s));
    const category = c.req.query("category")?.split(",").filter((s): s is Category => (CATEGORIES as readonly string[]).includes(s));
    return c.json(
      queryAlerts(ctx, {
        status: (["open", "all", ...ALERT_STATUSES] as string[]).includes(status) ? (status as "open") : "open",
        severity,
        category,
        q: c.req.query("q")?.slice(0, 100),
        limit: Number(c.req.query("limit") ?? 200),
      }),
    );
  });

  app.get("/counts", (c) => {
    const rows = ctx.db.prepare("SELECT status, severity, category, COUNT(*) AS n FROM alerts GROUP BY status, severity, category").all() as {
      status: string;
      severity: Severity;
      category: Category;
      n: number;
    }[];
    const counts: AlertCounts = { new: 0, snoozed: 0, done: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, byCategory: {} };
    for (const r of rows) {
      if (r.status === "new") counts.new += r.n;
      if (r.status === "snoozed") counts.snoozed += r.n;
      if (r.status === "done") counts.done += r.n;
      if (r.status === "new" || r.status === "read") {
        counts.bySeverity[r.severity] += r.n;
        counts.byCategory[r.category] = (counts.byCategory[r.category] ?? 0) + r.n;
      }
    }
    return c.json(counts);
  });

  app.get("/:id", (c) => {
    const alert = getAlerts(ctx, [intParam(c, "id")])[0];
    if (!alert) throw new HttpError(404, "Alert not found");
    return c.json(alert);
  });

  const update = (ids: number[], action: "read" | "new" | "done" | "snooze" | "delete", snoozeUntil?: string) => {
    if (ids.length === 0) return 0;
    const now = ctx.now().toISOString();
    const placeholders = ids.map(() => "?").join(",");
    if (action === "delete") return ctx.db.prepare(`DELETE FROM alerts WHERE id IN (${placeholders})`).run(...ids).changes;
    if (action === "snooze") {
      const until = snoozeUntil && !Number.isNaN(new Date(snoozeUntil).getTime()) ? new Date(snoozeUntil).toISOString() : new Date(Date.now() + 86400000).toISOString();
      return ctx.db.prepare(`UPDATE alerts SET status = 'snoozed', snoozed_until = ?, updated_at = ? WHERE id IN (${placeholders})`).run(until, now, ...ids).changes;
    }
    return ctx.db.prepare(`UPDATE alerts SET status = ?, snoozed_until = NULL, updated_at = ? WHERE id IN (${placeholders})`).run(action, now, ...ids).changes;
  };

  app.patch("/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, z.object({ status: z.enum(["new", "read", "done", "snoozed"]), snoozeUntil: z.string().max(40).optional() }));
    update([id], body.status === "snoozed" ? "snooze" : body.status, body.snoozeUntil);
    const alert = getAlerts(ctx, [id])[0];
    if (!alert) throw new HttpError(404, "Alert not found");
    return c.json(alert);
  });

  app.post("/bulk", async (c) => {
    const body = await readJson(
      c,
      z.object({ ids: z.array(z.number().int().positive()).max(1000), action: z.enum(["read", "new", "done", "snooze", "delete"]), snoozeUntil: z.string().max(40).optional() }),
    );
    return c.json({ ok: true, changed: update(body.ids, body.action, body.snoozeUntil) });
  });

  app.post("/read-all", (c) => {
    const changed = ctx.db.prepare("UPDATE alerts SET status = 'read', updated_at = ? WHERE status = 'new'").run(ctx.now().toISOString()).changes;
    return c.json({ ok: true, changed });
  });

  return app;
}

const subscriptionPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  plan: z.string().max(80).nullable().optional(),
  amount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  currency: z.string().length(3).optional(),
  cycle: z.enum(BILLING_CYCLES).optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  nextRenewalAt: z.string().max(40).nullable().optional(),
  paymentMethod: z.string().max(80).nullable().optional(),
  manageUrl: z.url().max(1000).nullable().optional().or(z.literal("")),
  kind: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  muted: z.boolean().optional(),
});

function dateOnlyIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(422, "Invalid date");
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)).toISOString();
}

export function subscriptionRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/", (c) => {
    const items = listSubscriptions(ctx);
    const totals = subscriptionMonthlyTotals(ctx);
    return c.json({ items, monthly: totals.totals, active: totals.active, trials: totals.trials, savings: savingsInsights(items) });
  });

  app.get("/:id", (c) => {
    const id = intParam(c, "id");
    const sub = getSubscription(ctx, id);
    if (!sub) throw new HttpError(404, "Subscription not found");
    const events = ctx.db.prepare("SELECT * FROM subscription_events WHERE subscription_id = ? ORDER BY occurred_at DESC").all(id) as {
      id: number;
      type: string;
      amount: number | null;
      old_amount: number | null;
      currency: string | null;
      cycle: string | null;
      plan: string | null;
      occurred_at: string;
      effective_at: string | null;
      message_id: number | null;
    }[];
    const charges = (ctx.db.prepare(`${CHARGE_SELECT} WHERE c.subscription_id = ? ORDER BY c.occurred_at DESC LIMIT 100`).all(id) as ChargeRow[]).map(chargeFromRow);
    const messageIds = [...new Set([...events.map((e) => e.message_id), ...charges.map((ch) => ch.messageId)].filter((m): m is number => !!m))];
    const messages = messageIds.length
      ? (ctx.db.prepare(`${messageListSelect} WHERE m.id IN (${messageIds.map(() => "?").join(",")}) ORDER BY m.received_at DESC LIMIT 50`).all(...messageIds) as MessageListRow[]).map(
          messageListFromRow,
        )
      : [];
    const priceHistory = [...charges]
      .filter((ch) => ch.status === "posted")
      .reverse()
      .map((ch) => ({ at: ch.occurredAt, amount: ch.amount }));
    const detail: SubscriptionDetailDTO = {
      ...sub,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        oldAmount: e.old_amount,
        currency: e.currency,
        cycle: e.cycle,
        plan: e.plan,
        occurredAt: e.occurred_at,
        effectiveAt: e.effective_at,
        messageId: e.message_id,
      })),
      charges,
      messages,
      priceHistory,
    };
    return c.json(detail);
  });

  app.post("/", async (c) => {
    const body = await readJson(
      c,
      subscriptionPatch.extend({ name: z.string().min(1).max(120), amount: z.number().nonnegative().max(1_000_000), cycle: z.enum(BILLING_CYCLES).default("monthly") }),
    );
    const now = ctx.now().toISOString();
    const vendorId = vendorIdForName(ctx.db, body.name, now);
    const vendor = ctx.db.prepare("SELECT slug, manage_url, kind FROM vendors WHERE id = ?").get(vendorId) as { slug: string; manage_url: string | null; kind: string | null };
    let key = `manual:${slugify(body.name)}`;
    if (ctx.db.prepare("SELECT 1 FROM subscriptions WHERE key = ?").get(key)) key = `${key}-${Date.now()}`;
    const res = ctx.db
      .prepare(
        `INSERT INTO subscriptions(key, vendor_id, name, plan, kind, amount, currency, cycle, status, next_renewal_at, payment_method, manage_url, source, notes, confidence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 1, ?, ?)`,
      )
      .run(
        key,
        vendorId,
        body.name,
        body.plan ?? null,
        body.kind ?? vendor.kind,
        body.amount,
        (body.currency ?? ctx.settings.get().profile.currency).toUpperCase(),
        body.cycle,
        body.status ?? "active",
        body.nextRenewalAt ? dateOnlyIso(body.nextRenewalAt) : null,
        body.paymentMethod ?? null,
        body.manageUrl || vendor.manage_url,
        body.notes ?? null,
        now,
        now,
      );
    const id = Number(res.lastInsertRowid);
    recomputeSubscription(ctx, id);
    audit(ctx, "subscription.create", body.name);
    return c.json(getSubscription(ctx, id), 201);
  });

  app.patch("/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, subscriptionPatch);
    const row = ctx.db.prepare("SELECT overrides, source FROM subscriptions WHERE id = ?").get(id) as { overrides: string; source: string } | undefined;
    if (!row) throw new HttpError(404, "Subscription not found");
    const overrides = parseJson<SubscriptionOverrides>(row.overrides, {});
    const map: [keyof typeof body, keyof SubscriptionOverrides][] = [
      ["name", "name"],
      ["plan", "plan"],
      ["amount", "amount"],
      ["currency", "currency"],
      ["cycle", "cycle"],
      ["status", "status"],
      ["paymentMethod", "payment_method"],
      ["kind", "kind"],
    ];
    for (const [from, to] of map) if (body[from] !== undefined) (overrides as Record<string, unknown>)[to] = body[from];
    if (body.nextRenewalAt !== undefined) overrides.next_renewal_at = body.nextRenewalAt ? dateOnlyIso(body.nextRenewalAt) : null;
    if (body.manageUrl !== undefined) overrides.manage_url = body.manageUrl || null;
    const now = ctx.now().toISOString();
    ctx.db.prepare("UPDATE subscriptions SET overrides = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(overrides), now, id);
    if (body.notes !== undefined) ctx.db.prepare("UPDATE subscriptions SET notes = ? WHERE id = ?").run(body.notes, id);
    if (body.muted !== undefined) ctx.db.prepare("UPDATE subscriptions SET muted = ? WHERE id = ?").run(body.muted ? 1 : 0, id);
    if (row.source === "manual") {
      // Manual subscriptions store their values directly too.
      ctx.db
        .prepare(
          "UPDATE subscriptions SET name = COALESCE(?, name), amount = COALESCE(?, amount), cycle = COALESCE(?, cycle), status = COALESCE(?, status), next_renewal_at = COALESCE(?, next_renewal_at) WHERE id = ?",
        )
        .run(body.name ?? null, body.amount ?? null, body.cycle ?? null, body.status ?? null, overrides.next_renewal_at ?? null, id);
    }
    recomputeSubscription(ctx, id);
    if (body.status === "cancelled") resolveAlerts(ctx, "subscription", id);
    audit(ctx, "subscription.update", `${id}`);
    return c.json(getSubscription(ctx, id));
  });

  app.post("/:id/reset", (c) => {
    const id = intParam(c, "id");
    ctx.db.prepare("UPDATE subscriptions SET overrides = '{}' WHERE id = ?").run(id);
    recomputeSubscription(ctx, id);
    return c.json(getSubscription(ctx, id));
  });

  app.delete("/:id", (c) => {
    const id = intParam(c, "id");
    const sub = getSubscription(ctx, id);
    if (!sub) throw new HttpError(404, "Subscription not found");
    ctx.db.prepare("DELETE FROM alerts WHERE entity_type = 'subscription' AND entity_id = ?").run(id);
    ctx.db.prepare("UPDATE charges SET subscription_id = NULL WHERE subscription_id = ?").run(id);
    ctx.db.prepare("DELETE FROM subscriptions WHERE id = ?").run(id);
    audit(ctx, "subscription.delete", `${sub.name} ${sub.amount !== null ? formatMoney(sub.amount, sub.currency) : ""}`);
    return c.json({ ok: true });
  });

  return app;
}
