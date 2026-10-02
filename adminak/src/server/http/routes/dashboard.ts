import { Hono } from "hono";
import { z } from "zod";
import { formatDate, sumByCurrency } from "../../../shared/format.js";
import type { BillDTO, BillKind, BillStatus, ChargeDTO, DomainDTO, InsightDTO, InsightGroup, MoneyDTO, SpendCategory } from "../../../shared/types.js";
import { BILL_KINDS, BILL_STATUSES, SPEND_CATEGORIES } from "../../../shared/types.js";
import { audit, type AppContext } from "../../context.js";
import { resolveAlerts } from "../../services/alerts.js";
import { buildOverview, buildTimeline, careerSummary, incomeTotals, insightFromRow, INSIGHT_SELECT, monthlySpend, queryInsights, spendByCategory, topMerchants } from "../../services/dashboard.js";
import { VENDOR_COLUMNS, vendorIdForName, vendorRefFromRow } from "../../services/vendors.js";
import { slugify } from "../../intel/vendor-resolve.js";
import { HttpError, intParam, readJson, type AppEnv } from "../util.js";

const DAY = 86400000;

interface ChargeRow {
  id: number;
  message_id: number | null;
  vendor_id: number | null;
  subscription_id: number | null;
  bill_id: number | null;
  kind: ChargeDTO["kind"];
  spend_category: SpendCategory;
  description: string;
  amount: number;
  currency: string;
  direction: "in" | "out";
  status: ChargeDTO["status"];
  payment_method: string | null;
  occurred_at: string;
  source: string;
  v_slug: string | null;
  v_name: string | null;
  v_domain: string | null;
  v_kind: string | null;
  v_color: string | null;
}

export function chargeFromRow(r: ChargeRow): ChargeDTO {
  return {
    id: r.id,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    direction: r.direction,
    kind: r.kind,
    spendCategory: r.spend_category,
    status: r.status,
    paymentMethod: r.payment_method,
    occurredAt: r.occurred_at,
    vendor: vendorRefFromRow(r),
    subscriptionId: r.subscription_id,
    billId: r.bill_id,
    messageId: r.message_id,
    source: r.source === "manual" ? "manual" : "email",
  };
}

export const CHARGE_SELECT = `SELECT c.*, ${VENDOR_COLUMNS} FROM charges c LEFT JOIN vendors v ON v.id = c.vendor_id`;

interface BillRow {
  id: number;
  vendor_id: number | null;
  message_id: number | null;
  name: string;
  kind: BillKind;
  amount_due: number | null;
  minimum_due: number | null;
  statement_balance: number | null;
  currency: string | null;
  due_at: string | null;
  statement_at: string | null;
  status: BillStatus;
  autopay: number;
  account_hint: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  pay_url: string | null;
  notes: string | null;
  source: "detected" | "manual";
  v_slug: string | null;
  v_name: string | null;
  v_domain: string | null;
  v_kind: string | null;
  v_color: string | null;
}

export function billFromRow(ctx: AppContext, r: BillRow): BillDTO {
  let status = r.status;
  if (status === "due" && r.due_at && new Date(r.due_at).getTime() < ctx.now().getTime() - 1.5 * DAY) status = "overdue";
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    vendor: vendorRefFromRow(r),
    amountDue: r.amount_due,
    minimumDue: r.minimum_due,
    statementBalance: r.statement_balance,
    currency: r.currency,
    dueAt: r.due_at,
    statementAt: r.statement_at,
    status,
    autopay: !!r.autopay,
    accountHint: r.account_hint,
    paidAt: r.paid_at,
    paidAmount: r.paid_amount,
    payUrl: r.pay_url,
    notes: r.notes,
    source: r.source,
    messageId: r.message_id,
  };
}

export const BILL_SELECT = `SELECT b.*, ${VENDOR_COLUMNS} FROM bills b LEFT JOIN vendors v ON v.id = b.vendor_id`;

function groupInsights(items: InsightDTO[], title: (first: InsightDTO, all: InsightDTO[]) => string, subtitle: (all: InsightDTO[]) => string | null): InsightGroup[] {
  const groups = new Map<string, InsightDTO[]>();
  for (const item of items) {
    const key = item.groupKey ?? `single-${item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      const next = sorted.map((i) => i.occursAt).filter((d): d is string => !!d && d >= new Date(Date.now() - DAY).toISOString()).sort()[0] ?? null;
      return { key, title: title(sorted[0]!, sorted), subtitle: subtitle(sorted), status: sorted[0]!.status, latestAt: sorted[0]!.occurredAt, nextAt: next, items: sorted };
    })
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

function domainDTO(ctx: AppContext, domain: string): DomainDTO {
  const now = ctx.now();
  const nowIso = now.toISOString();
  const tz = ctx.settings.get().profile.timezone;
  const since = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  switch (domain) {
    case "career": {
      const items = queryInsights(ctx, "i.category = 'career' AND i.archived = 0 AND i.occurred_at >= ?", [since(365)], 400);
      const pipeline = items.filter((i) => !["job_alert", "networking"].includes(i.type));
      const summary = careerSummary(ctx);
      const companies = new Set(pipeline.filter((i) => i.groupKey).map((i) => i.groupKey));
      const responded = new Set(pipeline.filter((i) => i.groupKey && ["interviewing", "assessment", "offer", "rejected", "in_review"].includes(i.status ?? "")).map((i) => i.groupKey));
      return {
        domain,
        stats: [
          { label: "Active", value: String(summary.active), hint: "applications in flight" },
          { label: "Interviewing", value: String(summary.interviewing), tone: summary.interviewing ? "good" : "neutral" },
          { label: "Offers", value: String(summary.offers), tone: summary.offers ? "good" : "neutral" },
          { label: "Response rate", value: companies.size ? `${Math.round((responded.size / companies.size) * 100)}%` : "—", hint: `${companies.size} companies` },
        ],
        upcoming: items.filter((i) => i.occursAt && i.occursAt >= since(1)).sort((a, b) => a.occursAt!.localeCompare(b.occursAt!)),
        groups: groupInsights(
          pipeline.filter((i) => i.groupKey),
          (first, all) => (all.find((i) => i.data.company)?.data.company as string | undefined) ?? first.vendor?.name ?? first.groupKey ?? "Company",
          (all) => (all.find((i) => i.data.role)?.data.role as string | undefined) ?? null,
        ),
        recent: items.slice(0, 80),
      };
    }
    case "orders": {
      const items = queryInsights(ctx, "i.category = 'orders' AND i.archived = 0 AND i.occurred_at >= ?", [since(120)], 300);
      const groups = groupInsights(
        items,
        (first) => first.vendor?.name ?? (first.data.merchant as string | undefined) ?? "Order",
        (all) => {
          const num = all.find((i) => i.data.orderNumber)?.data.orderNumber as string | undefined;
          const items_ = all.find((i) => Array.isArray(i.data.items) && (i.data.items as string[]).length)?.data.items as string[] | undefined;
          return [num ? `#${num}` : null, items_?.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || null;
        },
      );
      const inTransit = groups.filter((g) => ["shipped", "out_for_delivery", "delayed", "order_placed"].includes(g.status ?? ""));
      return {
        domain,
        stats: [
          { label: "In transit", value: String(inTransit.length) },
          { label: "Arriving today", value: String(groups.filter((g) => g.status === "out_for_delivery").length), tone: "good" },
          { label: "Delivered (30d)", value: String(items.filter((i) => i.type === "delivered" && i.occurredAt >= since(30)).length) },
          { label: "Issues", value: String(groups.filter((g) => g.status === "delayed").length), tone: groups.some((g) => g.status === "delayed") ? "warn" : "neutral" },
        ],
        upcoming: items.filter((i) => i.occursAt && i.occursAt >= since(1) && i.type !== "delivered").sort((a, b) => a.occursAt!.localeCompare(b.occursAt!)),
        groups,
        recent: items.slice(0, 80),
      };
    }
    case "travel": {
      const items = queryInsights(ctx, "i.category = 'travel' AND i.archived = 0 AND i.occurred_at >= ?", [since(365)], 300);
      const upcoming = items.filter((i) => i.occursAt && i.occursAt >= since(1)).sort((a, b) => a.occursAt!.localeCompare(b.occursAt!));
      const groups = groupInsights(
        items.filter((i) => i.type !== "ride"),
        (first) => first.vendor?.name ?? "Trip",
        (all) => {
          const route = all.find((i) => i.data.route)?.data.route as { from: string; to: string } | undefined;
          const hotel = all.find((i) => i.data.hotel)?.data.hotel as string | undefined;
          const conf = all.find((i) => i.data.confirmation)?.data.confirmation as string | undefined;
          return [route ? `${route.from} → ${route.to}` : hotel, conf ? `Conf. ${conf}` : null].filter(Boolean).join(" · ") || null;
        },
      );
      return {
        domain,
        stats: [
          { label: "Upcoming", value: String(new Set(upcoming.map((u) => u.groupKey ?? u.id)).size) },
          { label: "Next departure", value: upcoming[0]?.occursAt ? formatDate(upcoming[0].occursAt, tz, "monthDay") : "—" },
          { label: "Rides (30d)", value: String(items.filter((i) => i.type === "ride" && i.occurredAt >= since(30)).length) },
          { label: "Changes", value: String(items.filter((i) => i.type === "flight_change" && i.occurredAt >= since(14)).length), tone: items.some((i) => i.type === "flight_change" && i.occurredAt >= since(14)) ? "warn" : "neutral" },
        ],
        upcoming,
        groups,
        recent: items.slice(0, 80),
      };
    }
    case "security": {
      const items = queryInsights(ctx, "i.category = 'security' AND i.occurred_at >= ?", [since(180)], 300);
      const open = ctx.db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE category = 'security' AND status IN ('new','read') AND severity IN ('critical','high')").get() as { n: number };
      return {
        domain,
        stats: [
          { label: "Open issues", value: String(open.n), tone: open.n ? "bad" : "good" },
          { label: "Sign-ins (30d)", value: String(items.filter((i) => i.type === "new_signin" && i.occurredAt >= since(30)).length) },
          { label: "Password changes", value: String(items.filter((i) => i.type === "password_changed" && i.occurredAt >= since(30)).length), hint: "last 30 days" },
          { label: "Breach notices", value: String(items.filter((i) => i.type === "breach_notice").length), tone: items.some((i) => i.type === "breach_notice") ? "warn" : "neutral" },
        ],
        upcoming: [],
        groups: groupInsights(items.filter((i) => i.type !== "verification_code"), (first) => first.vendor?.name ?? "Account", (all) => `${all.length} event${all.length > 1 ? "s" : ""}`),
        recent: items.slice(0, 100),
      };
    }
    case "life": {
      const items = queryInsights(ctx, "i.category IN ('events','health') AND i.archived = 0 AND i.occurred_at >= ?", [since(180)], 200);
      const people = ctx.db
        .prepare(
          `SELECT m.id, m.from_name, m.from_email, m.subject, m.snippet, m.received_at, m.summary FROM messages m WHERE m.category = 'personal' AND m.muted = 0 AND m.received_at >= ? ORDER BY m.received_at DESC LIMIT 40`,
        )
        .all(since(60)) as { id: number; from_name: string | null; from_email: string | null; subject: string; snippet: string; received_at: string; summary: string | null }[];
      const peopleItems: InsightDTO[] = people.map((p) => ({
        id: -p.id,
        category: "personal",
        type: "message",
        title: p.summary ?? `${p.from_name ?? p.from_email}: ${p.subject}`,
        summary: p.snippet,
        amount: null,
        currency: null,
        occursAt: null,
        status: null,
        groupKey: p.from_email,
        data: { from: p.from_name ?? p.from_email },
        links: [],
        archived: false,
        occurredAt: p.received_at,
        vendor: null,
        messageId: p.id,
      }));
      const upcoming = items.filter((i) => i.occursAt && i.occursAt >= nowIso.slice(0, 10)).sort((a, b) => a.occursAt!.localeCompare(b.occursAt!));
      return {
        domain,
        stats: [
          { label: "Upcoming", value: String(upcoming.length), hint: "events & appointments" },
          { label: "Appointments", value: String(upcoming.filter((u) => u.category === "health").length) },
          { label: "People (7d)", value: String(new Set(people.filter((p) => p.received_at >= since(7)).map((p) => p.from_email)).size), hint: "who wrote to you" },
          { label: "Health updates", value: String(items.filter((i) => i.category === "health" && i.type !== "appointment" && i.occurredAt >= since(30)).length) },
        ],
        upcoming,
        groups: groupInsights(peopleItems, (first) => (first.data.from as string) ?? "Someone", (all) => `${all.length} message${all.length > 1 ? "s" : ""}`),
        recent: [...items, ...peopleItems].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 80),
      };
    }
    default:
      throw new HttpError(404, "Unknown domain");
  }
}

export function dashboardRoutes(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.get("/overview", (c) => c.json(buildOverview(ctx)));

  app.get("/timeline", (c) => {
    const days = Math.min(365, Math.max(1, Number(c.req.query("days") ?? 60)));
    const past = Math.min(60, Math.max(0, Number(c.req.query("past") ?? 0)));
    const now = ctx.now();
    return c.json(buildTimeline(ctx, new Date(now.getTime() - past * DAY), new Date(now.getTime() + days * DAY)));
  });

  app.get("/domains/:domain", (c) => c.json(domainDTO(ctx, c.req.param("domain"))));

  app.patch("/insights/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(c, z.object({ archived: z.boolean().optional(), status: z.string().max(40).optional() }));
    const row = ctx.db.prepare(`${INSIGHT_SELECT} WHERE i.id = ?`).get(id);
    if (!row) throw new HttpError(404, "Not found");
    if (body.archived !== undefined) ctx.db.prepare("UPDATE insights SET archived = ?, updated_at = ? WHERE id = ?").run(body.archived ? 1 : 0, ctx.now().toISOString(), id);
    if (body.status) ctx.db.prepare("UPDATE insights SET status = ?, updated_at = ? WHERE id = ?").run(body.status, ctx.now().toISOString(), id);
    return c.json(insightFromRow(ctx.db.prepare(`${INSIGHT_SELECT} WHERE i.id = ?`).get(id) as Parameters<typeof insightFromRow>[0]));
  });

  app.get("/money", (c) => {
    const now = ctx.now();
    const settings = ctx.settings.get();
    const bills = (ctx.db.prepare(`${BILL_SELECT} WHERE b.due_at IS NULL OR b.due_at >= ? OR b.status != 'paid' ORDER BY b.status = 'paid', b.due_at IS NULL, b.due_at ASC LIMIT 200`).all(
      new Date(now.getTime() - 75 * DAY).toISOString(),
    ) as BillRow[]).map((r) => billFromRow(ctx, r));
    const due = bills.filter((b) => b.status === "due" || b.status === "overdue" || b.status === "scheduled");
    const charges = (ctx.db.prepare(`${CHARGE_SELECT} ORDER BY c.occurred_at DESC LIMIT 150`).all() as ChargeRow[]).map(chargeFromRow);
    const dto: MoneyDTO = {
      baseCurrency: settings.profile.currency,
      bills,
      billsSummary: {
        dueCount: due.length,
        dueTotal: sumByCurrency(due, (b) => b.amountDue, (b) => b.currency),
        overdueCount: bills.filter((b) => b.status === "overdue").length,
        autopayCount: bills.filter((b) => b.autopay && b.status !== "paid").length,
      },
      charges,
      monthly: monthlySpend(ctx, 12),
      topMerchants: topMerchants(ctx, new Date(now.getTime() - 90 * DAY), new Date(now.getTime() + 1)).map(({ name, vendor, total, count }) => ({ name, vendor, total, count })),
      spendByCategory: spendByCategory(ctx, new Date(now.getTime() - 30 * DAY), new Date(now.getTime() + 1)),
      incomeLast30: incomeTotals(ctx, new Date(now.getTime() - 30 * DAY), new Date(now.getTime() + 1)),
      documents: queryInsights(ctx, "i.category IN ('finance','bills') AND i.type IN ('tax_document','statement','investment','credit_score')", [], 30),
      financeEvents: queryInsights(ctx, "i.category = 'finance' AND i.type IN ('fraud_alert','low_balance','transfer_in','transfer_out','deposit','refund','transaction')", [], 60),
    };
    return c.json(dto);
  });

  app.get("/charges", (c) => {
    const q = c.req.query("q")?.trim();
    const category = c.req.query("category");
    const direction = c.req.query("direction");
    const where: string[] = [];
    const params: unknown[] = [];
    if (q) {
      where.push("(c.description LIKE ? OR v.name LIKE ?)");
      params.push(`%${q.replace(/[%_]/g, "")}%`, `%${q.replace(/[%_]/g, "")}%`);
    }
    if (category && (SPEND_CATEGORIES as readonly string[]).includes(category)) {
      where.push("c.spend_category = ?");
      params.push(category);
    }
    if (direction === "in" || direction === "out") {
      where.push("c.direction = ?");
      params.push(direction);
    }
    const limit = Math.min(500, Number(c.req.query("limit") ?? 200));
    const rows = ctx.db.prepare(`${CHARGE_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY c.occurred_at DESC LIMIT ?`).all(...params, limit) as ChargeRow[];
    return c.json(rows.map(chargeFromRow));
  });

  app.post("/charges", async (c) => {
    const body = await readJson(
      c,
      z.object({
        description: z.string().min(1).max(200),
        amount: z.number().positive().max(10_000_000),
        currency: z.string().length(3).optional(),
        direction: z.enum(["in", "out"]).default("out"),
        spendCategory: z.enum(SPEND_CATEGORIES).default("other"),
        occurredAt: z.string().max(40).optional(),
      }),
    );
    const now = ctx.now().toISOString();
    const occurred = body.occurredAt && !Number.isNaN(new Date(body.occurredAt).getTime()) ? new Date(body.occurredAt).toISOString() : now;
    const vendorId = vendorIdForName(ctx.db, body.description, now);
    const res = ctx.db
      .prepare(
        "INSERT INTO charges(vendor_id, kind, spend_category, description, amount, currency, direction, status, occurred_at, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'posted', ?, 'manual', ?)",
      )
      .run(vendorId, body.direction === "in" ? "deposit" : "purchase", body.spendCategory, body.description, body.amount, (body.currency ?? ctx.settings.get().profile.currency).toUpperCase(), body.direction, occurred, now);
    return c.json(chargeFromRow(ctx.db.prepare(`${CHARGE_SELECT} WHERE c.id = ?`).get(Number(res.lastInsertRowid)) as ChargeRow), 201);
  });

  app.delete("/charges/:id", (c) => {
    ctx.db.prepare("DELETE FROM charges WHERE id = ?").run(intParam(c, "id"));
    return c.json({ ok: true });
  });

  // ── Bills ──────────────────────────────────────────────────────────────────
  app.post("/bills", async (c) => {
    const body = await readJson(
      c,
      z.object({
        name: z.string().min(1).max(120),
        kind: z.enum(BILL_KINDS).default("other"),
        amountDue: z.number().nonnegative().max(10_000_000).nullable().optional(),
        currency: z.string().length(3).optional(),
        dueAt: z.string().max(40),
        autopay: z.boolean().default(false),
        notes: z.string().max(1000).optional(),
        payUrl: z.url({ protocol: /^https?$/ }).max(1000).optional().or(z.literal("")),
      }),
    );
    const now = ctx.now().toISOString();
    const due = new Date(body.dueAt);
    if (Number.isNaN(due.getTime())) throw new HttpError(422, "Invalid due date");
    const dueIso = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 12)).toISOString();
    const vendorId = vendorIdForName(ctx.db, body.name, now);
    const res = ctx.db
      .prepare(
        `INSERT INTO bills(key, vendor_id, name, kind, amount_due, currency, due_at, status, autopay, pay_url, notes, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
      )
      .run(`manual:${slugify(body.name)}:${dueIso.slice(0, 10)}:${Date.now()}`, vendorId, body.name, body.kind, body.amountDue ?? null, (body.currency ?? ctx.settings.get().profile.currency).toUpperCase(), dueIso, body.autopay ? "scheduled" : "due", body.autopay ? 1 : 0, body.payUrl || null, body.notes ?? null, now, now);
    audit(ctx, "bill.create", body.name);
    return c.json(billFromRow(ctx, ctx.db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(Number(res.lastInsertRowid)) as BillRow), 201);
  });

  app.patch("/bills/:id", async (c) => {
    const id = intParam(c, "id");
    const body = await readJson(
      c,
      z.object({
        status: z.enum(BILL_STATUSES).optional(),
        autopay: z.boolean().optional(),
        notes: z.string().max(1000).nullable().optional(),
        amountDue: z.number().nonnegative().nullable().optional(),
        dueAt: z.string().max(40).nullable().optional(),
        name: z.string().min(1).max(120).optional(),
      }),
    );
    const bill = ctx.db.prepare("SELECT * FROM bills WHERE id = ?").get(id) as { amount_due: number | null } | undefined;
    if (!bill) throw new HttpError(404, "Bill not found");
    const now = ctx.now().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.status) {
      sets.push("status = ?");
      params.push(body.status);
      if (body.status === "paid") {
        sets.push("paid_at = COALESCE(paid_at, ?)", "paid_amount = COALESCE(paid_amount, ?)");
        params.push(now, bill.amount_due);
        resolveAlerts(ctx, "bill", id);
      }
    }
    if (body.autopay !== undefined) {
      sets.push("autopay = ?");
      params.push(body.autopay ? 1 : 0);
    }
    if (body.notes !== undefined) {
      sets.push("notes = ?");
      params.push(body.notes);
    }
    if (body.amountDue !== undefined) {
      sets.push("amount_due = ?");
      params.push(body.amountDue);
    }
    if (body.dueAt !== undefined) {
      sets.push("due_at = ?");
      params.push(body.dueAt ? new Date(body.dueAt).toISOString() : null);
    }
    if (body.name) {
      sets.push("name = ?");
      params.push(body.name);
    }
    if (sets.length) ctx.db.prepare(`UPDATE bills SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(...params, now, id);
    return c.json(billFromRow(ctx, ctx.db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(id) as BillRow));
  });

  app.delete("/bills/:id", (c) => {
    const id = intParam(c, "id");
    ctx.db.prepare("DELETE FROM alerts WHERE entity_type = 'bill' AND entity_id = ?").run(id);
    ctx.db.prepare("DELETE FROM bills WHERE id = ?").run(id);
    return c.json({ ok: true });
  });

  return app;
}

export type { BillRow, ChargeRow };
