import { formatDate, formatMoney, cycleShort } from "../../shared/format.js";
import type { BillKind, Category, ChargeKind, Fact, LinkRef, SpendCategory } from "../../shared/types.js";
import { SEVERITY_RANK } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { parseJson } from "../db/index.js";
import { createAlert, resolveAlerts, type AlertDraft } from "../services/alerts.js";
import { recomputeSubscription } from "../services/subscriptions.js";
import { upsertVendor, vendorIdForName } from "../services/vendors.js";
import { interpolate, loadRules, loadSenderOverrides, matchSenderOverride, ruleMatches, ruleSubject } from "./rules.js";
import type { Analysis, DateMention, IncomingEmail, MoneyMention, VendorMatch } from "./types.js";
import { domainOf, slugify, vendorBySlug } from "./vendor-resolve.js";

/** Messages older than this at ingest time are "historical": recorded, but they don't trigger event alerts. */
const HISTORICAL_MS = 3 * 86400000;

const INSIGHT_CATEGORIES = new Set<Category>(["subscriptions", "bills", "finance", "orders", "security", "travel", "career", "events", "health"]);

export interface StoredAnalysis {
  category: Category;
  subtype: string;
  confidence: number;
  importance: number;
  reasons: string[];
  vendor: VendorMatch | null;
  amounts: Omit<MoneyMention, "score">[];
  primaryAmount: Omit<MoneyMention, "score"> | null;
  dates: { kind: string; at: string; allDay: boolean; text: string }[];
  cycle: string | null;
  plan: string | null;
  paymentMethod: string | null;
  priceChange: { from: number; to: number; currency: string; effectiveAt: string | null } | null;
  links: LinkRef[];
  unsubscribeUrl: string | null;
  data: Record<string, unknown>;
  summary: string;
  ai?: { summary?: string; action?: string | null; category?: string } | null;
}

export function serializeAnalysis(a: Analysis): StoredAnalysis {
  return {
    category: a.category,
    subtype: a.subtype,
    confidence: a.confidence,
    importance: a.importance,
    reasons: a.reasons,
    vendor: a.vendor,
    amounts: a.amounts.slice(0, 12).map(({ amount, currency, index, raw, label }) => ({ amount, currency, index, raw, label })),
    primaryAmount: a.primaryAmount ? { ...a.primaryAmount } : null,
    dates: a.dates.slice(0, 12).map((d) => ({ kind: d.kind, at: d.at.toISOString(), allDay: d.allDay, text: d.text })),
    cycle: a.cycle,
    plan: a.plan,
    paymentMethod: a.paymentMethod,
    priceChange: a.priceChange ? { ...a.priceChange, effectiveAt: a.priceChange.effectiveAt?.toISOString() ?? null } : null,
    links: a.links,
    unsubscribeUrl: a.unsubscribeUrl,
    data: a.data,
    summary: a.summary,
  };
}

export function deserializeAnalysis(s: StoredAnalysis, cleanText = ""): Analysis {
  return {
    category: s.category,
    subtype: s.subtype,
    confidence: s.confidence,
    importance: s.importance,
    reasons: s.reasons,
    vendor: s.vendor,
    amounts: s.amounts.map((m) => ({ ...m, score: 0 })),
    primaryAmount: s.primaryAmount ? { ...s.primaryAmount, score: 0 } : null,
    dates: s.dates.map((d) => ({ kind: d.kind as DateMention["kind"], at: new Date(d.at), allDay: d.allDay, text: d.text, index: 0 })),
    cycle: s.cycle as Analysis["cycle"],
    plan: s.plan,
    paymentMethod: s.paymentMethod,
    priceChange: s.priceChange ? { ...s.priceChange, effectiveAt: s.priceChange.effectiveAt ? new Date(s.priceChange.effectiveAt) : null } : null,
    links: s.links,
    unsubscribeUrl: s.unsubscribeUrl,
    data: s.data,
    summary: s.summary,
    cleanText,
    snippet: "",
  };
}

const SPEND_BY_KIND: Record<string, SpendCategory> = {
  shopping: "shopping",
  marketplace: "shopping",
  grocery: "food",
  food: "food",
  restaurant: "food",
  airline: "travel",
  hotel: "travel",
  travel: "travel",
  car_rental: "travel",
  transport: "transport",
  health: "health",
  events: "entertainment",
  utility: "bills",
  telecom: "bills",
  internet: "bills",
  insurance: "bills",
  rent: "bills",
  loan: "bills",
  streaming: "subscriptions",
  music: "subscriptions",
  gaming: "entertainment",
  news: "subscriptions",
  software: "subscriptions",
  ai: "subscriptions",
  cloud: "subscriptions",
  dev: "subscriptions",
  storage: "subscriptions",
};

const BILL_KIND_BY_VENDOR: Record<string, BillKind> = {
  card: "credit_card",
  bank: "credit_card",
  utility: "utility",
  telecom: "phone",
  internet: "internet",
  insurance: "insurance",
  rent: "rent",
  loan: "loan",
  tax: "tax",
};

export interface IngestContext {
  accountId: number;
  /** Explicit "now" used for recency decisions (defaults to ctx.now()). */
  now?: Date;
}

export interface IngestResult {
  messageId: number;
  alertsCreated: number;
  category: Category;
  muted: boolean;
}

function dayKeyUtc(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "none";
}

function factMoney(m: { amount: number; currency: string } | null | undefined, suffix = ""): string {
  return m ? `${formatMoney(m.amount, m.currency)}${suffix}` : "";
}

function linkOf(analysis: Analysis, kinds: string[]): LinkRef | null {
  for (const kind of kinds) {
    const hit = analysis.links.find((l) => l.kind === kind);
    if (hit) return hit;
  }
  return null;
}

function firstDateIso(analysis: Analysis, kinds: string[], after?: Date): string | null {
  for (const kind of kinds) {
    const hit = analysis.dates.find((d) => d.kind === kind && (!after || d.at.getTime() >= after.getTime() - 86400000));
    if (hit) return hit.at.toISOString();
  }
  return null;
}

/**
 * Stores an incoming email and everything derived from it. Idempotent per (account, providerId):
 * returns null when the message was already stored (or is a duplicate of another mailbox's copy).
 */
export function ingestEmail(ctx: AppContext, ingest: IngestContext, email: IncomingEmail, analysis: Analysis): IngestResult | null {
  const db = ctx.db;
  const now = ingest.now ?? ctx.now();
  const nowIso = now.toISOString();
  const exists = db.prepare("SELECT id FROM messages WHERE account_id = ? AND provider_id = ?").get(ingest.accountId, email.providerId);
  if (exists) return null;
  if (email.messageId) {
    const dup = db.prepare("SELECT id FROM messages WHERE message_id = ? LIMIT 1").get(email.messageId);
    if (dup) return null;
  }

  const settings = ctx.settings.get();
  const override = matchSenderOverride(loadSenderOverrides(db), email.from.address, settings.scanning.ignoreSenders);
  if (override?.category && override.category !== analysis.category) {
    analysis.reasons = [`You filed ${override.pattern} under ${override.category}`, ...analysis.reasons].slice(0, 5);
    analysis.subtype = override.category === "personal" ? "message" : "general";
    analysis.category = override.category;
    analysis.confidence = 0.99;
  }
  let muted = !!override?.ignore;

  // Custom rules.
  const rules = loadRules(db);
  const subject = ruleSubject(email, analysis);
  const matchedRules = rules.filter((r) => ruleMatches(subject, r));
  for (const rule of matchedRules) {
    if (rule.actions.category && rule.actions.category !== analysis.category) {
      analysis.category = rule.actions.category;
      analysis.subtype = "general";
      analysis.reasons = [`Rule “${rule.name}” filed this under ${rule.actions.category}`, ...analysis.reasons].slice(0, 5);
    }
    if (rule.actions.ignore) muted = true;
  }

  const vendorId = analysis.vendor ? upsertVendor(db, analysis.vendor, nowIso) : null;
  const stored = serializeAnalysis(analysis);
  const storeBodies = settings.scanning.storeBodies;
  const fromAddress = email.from.address?.toLowerCase() ?? null;
  const result = db
    .prepare(
      `INSERT INTO messages(account_id, provider_id, thread_id, message_id, from_name, from_email, from_domain, to_email, subject, snippet, body_text,
         received_at, labels, attachments, list_unsubscribe, category, subtype, confidence, importance, vendor_id, summary, analysis, muted, processed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ingest.accountId,
      email.providerId,
      email.threadId ?? null,
      email.messageId ?? null,
      email.from.name,
      fromAddress,
      domainOf(fromAddress),
      email.to[0] ?? null,
      email.subject ?? "",
      analysis.snippet,
      storeBodies ? analysis.cleanText.slice(0, 30_000) : null,
      email.date.toISOString(),
      JSON.stringify(email.labels ?? []),
      JSON.stringify(email.attachments ?? []),
      analysis.unsubscribeUrl,
      analysis.category,
      analysis.subtype,
      analysis.confidence,
      analysis.importance,
      vendorId,
      analysis.summary,
      JSON.stringify(stored),
      muted ? 1 : 0,
      nowIso,
      nowIso,
    );
  const messageId = Number(result.lastInsertRowid);
  db.prepare("UPDATE accounts SET message_count = message_count + 1 WHERE id = ?").run(ingest.accountId);

  let alertsCreated = 0;
  if (!muted) {
    alertsCreated += materialize(ctx, { messageId, vendorId, email, analysis, now });
    for (const rule of matchedRules) {
      db.prepare("UPDATE rules SET hits = hits + 1, last_hit_at = ? WHERE id = ?").run(nowIso, rule.id);
      if (rule.actions.alert) {
        const id = createAlert(ctx, {
          fingerprint: `rule:${rule.id}:${messageId}`,
          type: "rule.match",
          category: analysis.category,
          severity: rule.actions.severity ?? "medium",
          title: rule.actions.title ? interpolate(rule.actions.title, subject) : `${rule.name}: ${email.subject || analysis.summary}`,
          body: analysis.summary,
          facts: [
            { label: "From", value: email.from.name ? `${email.from.name} <${fromAddress}>` : (fromAddress ?? "") },
            { label: "Rule", value: rule.name },
          ],
          messageId,
          vendorId,
          notify: now.getTime() - email.date.getTime() < HISTORICAL_MS,
        });
        if (id) alertsCreated++;
      }
    }
  }
  return { messageId, alertsCreated, category: analysis.category, muted };
}

interface MaterializeInput {
  messageId: number;
  vendorId: number | null;
  email: Pick<IncomingEmail, "date" | "subject" | "from">;
  analysis: Analysis;
  now: Date;
}

/** Removes everything derived from a message (used before re-materializing after reclassification). */
export function clearDerived(ctx: AppContext, messageId: number): number[] {
  const db = ctx.db;
  const subIds = (db.prepare("SELECT DISTINCT subscription_id AS id FROM subscription_events WHERE message_id = ?").all(messageId) as { id: number }[]).map((r) => r.id);
  const chargeSubIds = (db.prepare("SELECT DISTINCT subscription_id AS id FROM charges WHERE message_id = ? AND subscription_id IS NOT NULL").all(messageId) as { id: number }[]).map(
    (r) => r.id,
  );
  db.prepare("DELETE FROM subscription_events WHERE message_id = ?").run(messageId);
  db.prepare("DELETE FROM charges WHERE message_id = ?").run(messageId);
  db.prepare("DELETE FROM insights WHERE message_id = ?").run(messageId);
  db.prepare("DELETE FROM bills WHERE message_id = ? AND source = 'detected'").run(messageId);
  db.prepare("DELETE FROM alerts WHERE message_id = ? AND status IN ('new','read')").run(messageId);
  const affected = [...new Set([...subIds, ...chargeSubIds])];
  // Drop detected subscriptions that no longer have any evidence.
  for (const id of affected) {
    const left = db.prepare("SELECT (SELECT COUNT(*) FROM subscription_events WHERE subscription_id = ?) + (SELECT COUNT(*) FROM charges WHERE subscription_id = ?) AS n").get(id, id) as {
      n: number;
    };
    if (left.n === 0) db.prepare("DELETE FROM subscriptions WHERE id = ? AND source = 'detected'").run(id);
    else recomputeSubscription(ctx, id);
  }
  return affected;
}

/** Re-runs materialization for a stored message with an updated analysis (AI enrichment, user reclassification). */
export function rematerialize(ctx: AppContext, messageId: number, analysis: Analysis): number {
  const db = ctx.db;
  const row = db.prepare("SELECT id, vendor_id, received_at, subject, from_name, from_email, muted FROM messages WHERE id = ?").get(messageId) as
    | { id: number; vendor_id: number | null; received_at: string; subject: string; from_name: string | null; from_email: string | null; muted: number }
    | undefined;
  if (!row) return 0;
  clearDerived(ctx, messageId);
  const vendorId = analysis.vendor ? upsertVendor(db, analysis.vendor, ctx.now().toISOString()) : row.vendor_id;
  db.prepare("UPDATE messages SET category = ?, subtype = ?, confidence = ?, importance = ?, summary = ?, vendor_id = ?, analysis = ? WHERE id = ?").run(
    analysis.category,
    analysis.subtype,
    analysis.confidence,
    analysis.importance,
    analysis.summary,
    vendorId,
    JSON.stringify(serializeAnalysis(analysis)),
    messageId,
  );
  if (row.muted) return 0;
  return materialize(ctx, {
    messageId,
    vendorId,
    email: { date: new Date(row.received_at), subject: row.subject, from: { name: row.from_name, address: row.from_email } },
    analysis,
    now: ctx.now(),
  });
}

function materialize(ctx: AppContext, input: MaterializeInput): number {
  const { analysis } = input;
  if (analysis.subtype === "general" && analysis.category !== "personal") {
    // A category without a concrete signal: keep only a lightweight insight.
    if (INSIGHT_CATEGORIES.has(analysis.category)) upsertInsight(ctx, input, {});
    return 0;
  }
  const drafts: AlertDraft[] = [];
  switch (analysis.category) {
    case "subscriptions":
      drafts.push(...materializeSubscription(ctx, input));
      break;
    case "bills":
      drafts.push(...materializeBill(ctx, input));
      break;
    case "finance":
      drafts.push(...materializeFinance(ctx, input));
      break;
    case "orders":
      drafts.push(...materializeOrder(ctx, input));
      break;
    case "travel":
      drafts.push(...materializeTravel(ctx, input));
      break;
    case "career":
      drafts.push(...materializeCareer(ctx, input));
      break;
    case "security":
      drafts.push(...materializeSecurity(ctx, input));
      break;
    case "events":
    case "health":
      drafts.push(...materializeLife(ctx, input));
      break;
    case "updates":
      if (analysis.subtype === "dev_alert") drafts.push(...materializeDevAlert(ctx, input));
      break;
    default:
      break;
  }
  let created = 0;
  for (const draft of drafts) if (createAlert(ctx, draft)) created++;
  return created;
}

function isRecent(input: MaterializeInput, ms = HISTORICAL_MS): boolean {
  return input.now.getTime() - input.email.date.getTime() < ms;
}

function upsertInsight(
  ctx: AppContext,
  input: MaterializeInput,
  opts: { occursAt?: string | null; status?: string | null; groupKey?: string | null; amount?: { amount: number; currency: string } | null; extra?: Record<string, unknown> },
): number {
  const { analysis } = input;
  const now = input.now.toISOString();
  const { scores: _scores, ...data } = analysis.data;
  const result = ctx.db
    .prepare(
      `INSERT INTO insights(message_id, vendor_id, category, type, title, summary, amount, currency, occurs_at, status, group_key, data, links, occurred_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(message_id, type) WHERE message_id IS NOT NULL DO UPDATE SET title = excluded.title, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(
      input.messageId,
      input.vendorId,
      analysis.category,
      analysis.subtype,
      analysis.summary,
      input.email.subject ?? null,
      opts.amount?.amount ?? analysis.primaryAmount?.amount ?? null,
      opts.amount?.currency ?? analysis.primaryAmount?.currency ?? null,
      opts.occursAt ?? null,
      opts.status ?? analysis.subtype,
      opts.groupKey ?? null,
      JSON.stringify({ ...data, ...opts.extra }),
      JSON.stringify(analysis.links),
      input.email.date.toISOString(),
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}

function insertCharge(
  ctx: AppContext,
  input: MaterializeInput,
  charge: {
    kind: ChargeKind;
    spend: SpendCategory;
    description: string;
    amount: number;
    currency: string;
    direction: "in" | "out";
    status?: "posted" | "failed" | "pending" | "refunded";
    subscriptionId?: number | null;
    billId?: number | null;
    vendorId?: number | null;
    source?: "email" | "card_alert";
  },
): number | null {
  const db = ctx.db;
  const occurred = input.email.date.toISOString();
  const windowStart = new Date(input.email.date.getTime() - 3 * 86400000).toISOString();
  const windowEnd = new Date(input.email.date.getTime() + 3 * 86400000).toISOString();
  const vendorId = charge.vendorId ?? input.vendorId;
  if (charge.source === "card_alert") {
    // A receipt for the same purchase already exists → don't double count.
    const dup = db
      .prepare(
        `SELECT id FROM charges WHERE amount = ? AND currency = ? AND direction = ? AND occurred_at BETWEEN ? AND ? AND source = 'email' AND (vendor_id = ? OR ? IS NULL) LIMIT 1`,
      )
      .get(charge.amount, charge.currency, charge.direction, windowStart, windowEnd, vendorId, vendorId);
    if (dup) return null;
  } else {
    // Replace a matching card-alert charge with this more specific receipt.
    db.prepare(
      `DELETE FROM charges WHERE source = 'card_alert' AND amount = ? AND currency = ? AND direction = ? AND occurred_at BETWEEN ? AND ? AND (vendor_id = ? OR vendor_id IS NULL)`,
    ).run(charge.amount, charge.currency, charge.direction, windowStart, windowEnd, vendorId);
  }
  const result = db
    .prepare(
      `INSERT INTO charges(message_id, vendor_id, subscription_id, bill_id, kind, spend_category, description, amount, currency, direction, status, payment_method, occurred_at, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(message_id, kind) WHERE message_id IS NOT NULL DO NOTHING`,
    )
    .run(
      input.messageId,
      vendorId,
      charge.subscriptionId ?? null,
      charge.billId ?? null,
      charge.kind,
      charge.spend,
      charge.description.slice(0, 200),
      Math.abs(charge.amount),
      charge.currency,
      charge.direction,
      charge.status ?? "posted",
      input.analysis.paymentMethod,
      occurred,
      charge.source ?? "email",
      input.now.toISOString(),
    );
  return result.changes ? Number(result.lastInsertRowid) : null;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

function materializeSubscription(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const vendor = analysis.vendor;
  if (!vendor) return [];
  const db = ctx.db;
  const nowIso = input.now.toISOString();
  const key = vendor.product ? `${vendor.slug}:${vendor.product.key}` : vendor.slug;
  const name = vendor.product?.name ?? vendor.name;
  const kind = vendor.kind;
  const manageUrl = linkOf(analysis, ["manage", "cancel"])?.url ?? vendor.manageUrl ?? null;
  let sub = db.prepare("SELECT id, amount, currency, cycle, muted FROM subscriptions WHERE key = ?").get(key) as
    | { id: number; amount: number | null; currency: string | null; cycle: string; muted: number }
    | undefined;
  const isNew = !sub;
  if (!sub) {
    const res = db
      .prepare(
        `INSERT INTO subscriptions(key, vendor_id, name, plan, kind, amount, currency, cycle, status, manage_url, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'detected', ?, ?)`,
      )
      .run(key, input.vendorId, name, analysis.plan, kind, analysis.primaryAmount?.amount ?? null, analysis.primaryAmount?.currency ?? null, analysis.cycle ?? "unknown", manageUrl, nowIso, nowIso);
    sub = { id: Number(res.lastInsertRowid), amount: null, currency: null, cycle: analysis.cycle ?? "unknown", muted: 0 };
  } else if (manageUrl) {
    db.prepare("UPDATE subscriptions SET manage_url = COALESCE(manage_url, ?) WHERE id = ?").run(manageUrl, sub.id);
  }
  const subId = sub.id;
  const previousCharge = db
    .prepare("SELECT amount, currency FROM charges WHERE subscription_id = ? AND status = 'posted' AND direction = 'out' AND occurred_at < ? ORDER BY occurred_at DESC LIMIT 1")
    .get(subId, input.email.date.toISOString()) as { amount: number; currency: string } | undefined;

  const primary = analysis.primaryAmount;
  const renewalAt = firstDateIso(analysis, ["renewal", "due", "effective"], input.email.date);
  const trialEnd = (analysis.data.trialEndsAt as string | null) ?? null;
  const eventType: Record<string, string> = {
    receipt: "charge",
    renewal_notice: "renewal_notice",
    trial_started: "trial_started",
    trial_ending: "trial_ending",
    price_change: "price_change",
    payment_failed: "payment_failed",
    cancelled: "cancelled",
    started: "started",
    plan_changed: "plan_changed",
  };
  const type = eventType[analysis.subtype] ?? "notice";
  const effectiveAt =
    type === "trial_started" || type === "trial_ending"
      ? trialEnd ?? renewalAt
      : type === "price_change"
        ? (analysis.priceChange?.effectiveAt?.toISOString() ?? renewalAt)
        : renewalAt;
  const amount = type === "price_change" ? (analysis.priceChange?.to ?? primary?.amount ?? null) : (primary?.amount ?? null);
  const oldAmount = type === "price_change" ? (analysis.priceChange?.from ?? previousCharge?.amount ?? null) : null;
  db.prepare(
    `INSERT INTO subscription_events(subscription_id, message_id, type, amount, old_amount, currency, cycle, plan, payment_method, occurred_at, effective_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(subscription_id, message_id, type) DO NOTHING`,
  ).run(subId, input.messageId, type, amount, oldAmount, primary?.currency ?? analysis.priceChange?.currency ?? null, analysis.cycle, analysis.plan, analysis.paymentMethod, input.email.date.toISOString(), effectiveAt, nowIso);

  if (type === "charge" && primary) {
    insertCharge(ctx, input, {
      kind: "subscription",
      spend: "subscriptions",
      description: `${name}${analysis.plan ? ` ${analysis.plan}` : ""}`,
      amount: primary.amount,
      currency: primary.currency,
      direction: "out",
      subscriptionId: subId,
    });
  }
  if (type === "payment_failed" && primary) {
    insertCharge(ctx, input, {
      kind: "subscription",
      spend: "subscriptions",
      description: `${name} (failed)`,
      amount: primary.amount,
      currency: primary.currency,
      direction: "out",
      status: "failed",
      subscriptionId: subId,
    });
  }
  recomputeSubscription(ctx, subId);
  const fresh = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(subId) as {
    status: string;
    next_renewal_at: string | null;
    amount: number | null;
    currency: string | null;
    cycle: string;
    muted: number;
  };

  upsertInsight(ctx, input, { occursAt: type === "trial_started" || type === "trial_ending" ? effectiveAt : fresh.next_renewal_at, groupKey: key });

  if (fresh.muted) return [];
  const recent = isRecent(input);
  const tz = ctx.settings.get().profile.timezone;
  const cycle = (fresh.cycle as Analysis["cycle"]) ?? null;
  const priceText = fresh.amount !== null ? `${formatMoney(fresh.amount, fresh.currency)}${cycleShort(cycle)}` : "";
  const base = {
    messageId: input.messageId,
    vendorId: input.vendorId,
    entityType: "subscription",
    entityId: subId,
    actionUrl: manageUrl,
    actionLabel: manageUrl ? "Manage" : null,
  };
  const facts: Fact[] = [
    { label: "Service", value: name },
    { label: "Price", value: priceText },
    { label: "Plan", value: analysis.plan ?? "" },
    { label: "Next renewal", value: fresh.next_renewal_at ? formatDate(fresh.next_renewal_at, tz, "medium") : "" },
    { label: "Payment method", value: analysis.paymentMethod ?? "" },
  ];
  const drafts: AlertDraft[] = [];
  switch (type) {
    case "charge": {
      if (isNew && recent) {
        drafts.push({
          ...base,
          fingerprint: `sub-new:${subId}`,
          type: "subscription.new",
          title: `New subscription detected: ${name}${priceText ? ` — ${priceText}` : ""}`,
          body: "Adminak spotted a recurring charge from a service it hadn't seen before. Confirm it's expected.",
          facts,
        });
      }
      const announced = db
        .prepare("SELECT 1 FROM subscription_events WHERE subscription_id = ? AND type = 'price_change' AND occurred_at BETWEEN ? AND ? LIMIT 1")
        .get(subId, new Date(input.email.date.getTime() - 60 * 86400000).toISOString(), input.email.date.toISOString());
      if (!announced && primary && previousCharge && previousCharge.currency === primary.currency && Math.abs(primary.amount - previousCharge.amount) >= 0.5) {
        const up = primary.amount > previousCharge.amount;
        if (isRecent(input, 21 * 86400000)) {
          drafts.push({
            ...base,
            fingerprint: `sub-price:${subId}:${dayKeyUtc(input.email.date.toISOString())}`,
            type: up ? "subscription.price_increase" : "subscription.price_decrease",
            title: `${name} charged ${formatMoney(primary.amount, primary.currency)} (was ${formatMoney(previousCharge.amount, previousCharge.currency)})`,
            body: up ? "Your latest charge is higher than the previous one — the price may have gone up." : "Your latest charge is lower than before.",
            facts,
            notify: recent,
          });
        }
      }
      break;
    }
    case "price_change": {
      const change = analysis.priceChange;
      const effective = effectiveAt ? new Date(effectiveAt) : null;
      if ((effective && effective.getTime() > input.now.getTime() - 7 * 86400000) || isRecent(input, 21 * 86400000)) {
        const up = change ? change.to > change.from : true;
        drafts.push({
          ...base,
          fingerprint: `sub-pricechange:${subId}:${input.messageId}`,
          type: up ? "subscription.price_increase" : "subscription.price_decrease",
          title: change
            ? `${name} price ${up ? "increase" : "change"}: ${formatMoney(change.from, change.currency)} → ${formatMoney(change.to, change.currency)}${cycleShort(cycle)}`
            : `${name} is changing its price`,
          body: effective ? `Takes effect ${formatDate(effectiveAt!, tz, "long")}.` : null,
          facts: [...facts, { label: "Effective", value: effectiveAt ? formatDate(effectiveAt, tz, "medium") : "" }],
          dueAt: effectiveAt,
          notify: recent,
        });
      }
      break;
    }
    case "trial_started":
      if (recent) {
        drafts.push({
          ...base,
          fingerprint: `sub-trial-start:${subId}:${input.messageId}`,
          type: "subscription.trial_started",
          title: `${name} free trial started${effectiveAt ? ` — ends ${formatDate(effectiveAt, tz, "monthDay")}` : ""}`,
          body: "Adminak will remind you before it converts to a paid plan.",
          facts,
          dueAt: effectiveAt,
        });
      }
      break;
    case "trial_ending": {
      const end = effectiveAt ? new Date(effectiveAt) : null;
      if ((end && end.getTime() > input.now.getTime() - 86400000) || (!end && recent)) {
        drafts.push({
          ...base,
          fingerprint: `sub-trial:${subId}:${dayKeyUtc(effectiveAt)}`,
          type: "subscription.trial_ending",
          title: `${name} trial ends ${end ? formatDate(effectiveAt!, tz, "monthDay") : "soon"}${priceText ? ` — then ${priceText}` : ""}`,
          body: "Cancel before the trial ends if you don't want to be charged.",
          facts,
          dueAt: effectiveAt,
          actionUrl: linkOf(analysis, ["cancel", "manage"])?.url ?? manageUrl,
          actionLabel: "Cancel or manage",
          notify: recent,
        });
      }
      break;
    }
    case "payment_failed":
      if (isRecent(input, 14 * 86400000) && fresh.status === "past_due") {
        drafts.push({
          ...base,
          fingerprint: `sub-failed:${subId}:${input.messageId}`,
          type: "subscription.payment_failed",
          title: `${name} payment failed${primary ? ` — ${formatMoney(primary.amount, primary.currency)}` : ""}`,
          body: "Update your payment method or the service may be paused.",
          facts,
          actionUrl: linkOf(analysis, ["manage"])?.url ?? manageUrl,
          actionLabel: "Update payment",
          notify: recent,
        });
      }
      break;
    case "cancelled":
      resolveAlerts(ctx, "subscription", subId, ["subscription.renewal", "subscription.trial_ending", "subscription.payment_failed"]);
      if (recent) {
        drafts.push({
          ...base,
          fingerprint: `sub-cancel:${subId}:${input.messageId}`,
          type: "subscription.cancelled",
          title: `${name} cancelled`,
          body: "Confirmed cancellation — Adminak stopped tracking renewals for it.",
          facts,
        });
      }
      break;
    case "renewal_notice":
      if (renewalAt && new Date(renewalAt).getTime() > input.now.getTime()) {
        drafts.push({
          ...base,
          fingerprint: `sub-renewal:${subId}:${dayKeyUtc(renewalAt)}`,
          type: "subscription.renewal",
          title: `${name} renews ${formatDate(renewalAt, tz, "monthDay")}${priceText ? ` — ${priceText}` : ""}`,
          body: "Cancel before the renewal date if you no longer need it.",
          facts,
          dueAt: renewalAt,
          notify: recent,
        });
      }
      break;
    case "started":
      if (isNew && recent) {
        drafts.push({
          ...base,
          fingerprint: `sub-new:${subId}`,
          type: "subscription.new",
          title: `New subscription: ${name}${priceText ? ` — ${priceText}` : ""}`,
          body: "Added to your subscription tracker.",
          facts,
        });
      }
      break;
    default:
      break;
  }
  return drafts;
}

// ─── Bills ───────────────────────────────────────────────────────────────────

function materializeBill(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const db = ctx.db;
  const nowIso = input.now.toISOString();
  const tz = ctx.settings.get().profile.timezone;
  const vendor = analysis.vendor;
  const name = (analysis.data.name as string) ?? vendor?.name ?? "Bill";
  const accountHint = (analysis.data.accountHint as string | null) ?? null;
  const dueAt = (analysis.data.dueAt as string | null) ?? null;
  const amountDue = (analysis.data.amountDue as number | null) ?? analysis.primaryAmount?.amount ?? null;
  const currency = analysis.primaryAmount?.currency ?? ctx.settings.get().profile.currency;
  const autopay = !!analysis.data.autopay;
  const kind: BillKind = (vendor?.kind && BILL_KIND_BY_VENDOR[vendor.kind]) || (/credit card|card ending/i.test(analysis.summary) ? "credit_card" : "other");
  const payUrl = linkOf(analysis, ["pay", "statement"])?.url ?? null;
  const slug = vendor?.slug ?? slugify(name);
  const drafts: AlertDraft[] = [];

  if (analysis.subtype === "payment_confirmation") {
    const paid = analysis.primaryAmount;
    const bill = db
      .prepare(
        `SELECT id, name, amount_due, due_at FROM bills WHERE vendor_id IS ? AND status != 'paid' AND (account_hint IS ? OR account_hint IS NULL OR ? IS NULL)
         AND (due_at IS NULL OR due_at BETWEEN ? AND ?) ORDER BY due_at DESC LIMIT 1`,
      )
      .get(
        input.vendorId,
        accountHint,
        accountHint,
        new Date(input.email.date.getTime() - 45 * 86400000).toISOString(),
        new Date(input.email.date.getTime() + 40 * 86400000).toISOString(),
      ) as { id: number; name: string } | undefined;
    if (bill) {
      db.prepare("UPDATE bills SET status = 'paid', paid_at = ?, paid_amount = ?, updated_at = ? WHERE id = ?").run(input.email.date.toISOString(), paid?.amount ?? null, nowIso, bill.id);
      resolveAlerts(ctx, "bill", bill.id);
    }
    if (paid) {
      insertCharge(ctx, input, {
        kind: "bill_payment",
        spend: "bills",
        description: `${name} payment`,
        amount: paid.amount,
        currency: paid.currency,
        direction: "out",
        billId: bill?.id ?? null,
      });
    }
    upsertInsight(ctx, input, { status: "paid", groupKey: slug });
    return drafts;
  }

  // Statements, reminders, autopay notices and overdue notices all describe one bill per due date.
  const period = dueAt ? dueAt.slice(0, 10) : input.email.date.toISOString().slice(0, 7);
  const key = `${slug}:${accountHint ?? "-"}:${period}`;
  const existing = db.prepare("SELECT id, status FROM bills WHERE key = ?").get(key) as { id: number; status: string } | undefined;
  let billId: number;
  const status = analysis.subtype === "overdue" ? "overdue" : autopay ? "scheduled" : "due";
  if (existing) {
    billId = existing.id;
    db.prepare(
      `UPDATE bills SET amount_due = COALESCE(?, amount_due), minimum_due = COALESCE(?, minimum_due), statement_balance = COALESCE(?, statement_balance),
         due_at = COALESCE(?, due_at), autopay = MAX(autopay, ?), pay_url = COALESCE(pay_url, ?),
         status = CASE WHEN status = 'paid' THEN status ELSE ? END, updated_at = ? WHERE id = ?`,
    ).run(amountDue, analysis.data.minimumDue ?? null, analysis.data.statementBalance ?? null, dueAt, autopay ? 1 : 0, payUrl, status, nowIso, billId);
  } else {
    // Without an amount or a due date, a "statement" is just an FYI (e.g. a checking account statement).
    if (amountDue === null && !dueAt && analysis.subtype !== "overdue") {
      upsertInsight(ctx, input, { status: analysis.subtype, groupKey: slug });
      return drafts;
    }
    const res = db
      .prepare(
        `INSERT INTO bills(key, vendor_id, message_id, name, kind, amount_due, minimum_due, statement_balance, currency, due_at, statement_at, status, autopay,
           account_hint, pay_url, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'detected', ?, ?)`,
      )
      .run(
        key,
        input.vendorId,
        input.messageId,
        `${name}${accountHint ? ` ••${accountHint}` : ""}`,
        kind,
        amountDue,
        analysis.data.minimumDue ?? null,
        analysis.data.statementBalance ?? null,
        currency,
        dueAt,
        analysis.subtype === "statement" ? input.email.date.toISOString() : null,
        status,
        autopay ? 1 : 0,
        accountHint,
        payUrl,
        nowIso,
        nowIso,
      );
    billId = Number(res.lastInsertRowid);
  }
  upsertInsight(ctx, input, { occursAt: dueAt, status, groupKey: slug });

  const recent = isRecent(input);
  const facts: Fact[] = [
    { label: "Biller", value: name },
    { label: "Amount due", value: amountDue !== null ? formatMoney(amountDue, currency) : "" },
    { label: "Minimum", value: typeof analysis.data.minimumDue === "number" ? formatMoney(analysis.data.minimumDue, currency) : "" },
    { label: "Due", value: dueAt ? formatDate(dueAt, tz, "medium") : "" },
    { label: "Account", value: accountHint ? `•• ${accountHint}` : "" },
    { label: "Autopay", value: autopay ? "On" : "" },
  ];
  const base = { messageId: input.messageId, vendorId: input.vendorId, entityType: "bill", entityId: billId, actionUrl: payUrl, actionLabel: payUrl ? "Pay or view" : null, facts };
  if (analysis.subtype === "overdue" && isRecent(input, 10 * 86400000)) {
    drafts.push({
      ...base,
      fingerprint: `bill-overdue:${billId}`,
      type: "bill.overdue",
      title: `${name} is past due${amountDue !== null ? ` — ${formatMoney(amountDue, currency)}` : ""}`,
      body: "Pay as soon as possible to avoid late fees or service interruption.",
      dueAt,
      notify: recent,
    });
  } else if (recent && analysis.subtype === "statement") {
    drafts.push({
      ...base,
      fingerprint: `bill-statement:${billId}`,
      type: "bill.statement",
      title: `${name} statement${amountDue !== null ? `: ${formatMoney(amountDue, currency)}` : ""}${dueAt ? ` due ${formatDate(dueAt, tz, "monthDay")}` : ""}`,
      body: autopay ? "Autopay is on for this bill." : "Adminak will remind you before it's due.",
      dueAt,
    });
  }
  if (dueAt && !autopay && analysis.subtype !== "overdue") {
    const days = (new Date(dueAt).getTime() - input.now.getTime()) / 86400000;
    const reminderDays = ctx.settings.get().notifications.reminders.billDays;
    if (days >= -1 && days <= Math.max(reminderDays, analysis.subtype === "due_reminder" ? 7 : 0)) {
      drafts.push({
        ...base,
        fingerprint: `bill-due:${billId}:${dayKeyUtc(dueAt)}`,
        type: "bill.due",
        title: `${name}${amountDue !== null ? ` — ${formatMoney(amountDue, currency)}` : ""} due ${formatDate(dueAt, tz, "monthDay")}`,
        body: "Payment due soon.",
        dueAt,
        notify: recent,
      });
    }
  }
  return drafts;
}

// ─── Finance ─────────────────────────────────────────────────────────────────

function materializeFinance(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const db = ctx.db;
  const settings = ctx.settings.get();
  const primary = analysis.primaryAmount;
  const institution = analysis.vendor?.name ?? "Your bank";
  const merchant = (analysis.data.merchant as string | null) ?? null;
  const merchantSlug = (analysis.data.merchantSlug as string | null) ?? null;
  const recent = isRecent(input);
  const drafts: AlertDraft[] = [];
  const facts: Fact[] = [
    { label: "Amount", value: factMoney(primary) },
    { label: "Merchant", value: merchant ?? "" },
    { label: "Card", value: analysis.paymentMethod ?? "" },
    { label: "Institution", value: institution },
    { label: "From", value: (analysis.data.counterparty as string | null) ?? "" },
  ];
  const base = { messageId: input.messageId, vendorId: input.vendorId, facts, actionUrl: linkOf(analysis, ["review", "statement"])?.url ?? null, actionLabel: "Review" };

  switch (analysis.subtype) {
    case "transaction": {
      if (primary) {
        let merchantVendorId: number | null = null;
        let subscriptionId: number | null = null;
        if (merchant) merchantVendorId = vendorIdForName(db, merchant, input.now.toISOString());
        if (merchantSlug) {
          const sub = db.prepare("SELECT id, amount FROM subscriptions WHERE (key = ? OR key LIKE ?) AND status != 'cancelled' LIMIT 1").get(merchantSlug, `${merchantSlug}:%`) as
            | { id: number; amount: number | null }
            | undefined;
          if (sub && (sub.amount === null || Math.abs(sub.amount - primary.amount) <= Math.max(1, sub.amount * 0.15))) subscriptionId = sub.id;
        }
        const merchantKind = merchantSlug ? vendorBySlug(merchantSlug)?.kind : undefined;
        insertCharge(ctx, input, {
          kind: subscriptionId ? "subscription" : "purchase",
          spend: subscriptionId ? "subscriptions" : ((merchantKind && SPEND_BY_KIND[merchantKind]) ?? "other"),
          description: merchant ?? `Card purchase (${institution})`,
          amount: primary.amount,
          currency: primary.currency,
          direction: "out",
          vendorId: merchantVendorId,
          subscriptionId,
          source: "card_alert",
        });
        if (subscriptionId) recomputeSubscription(ctx, subscriptionId);
        if (primary.amount >= settings.notifications.largeTransactionThreshold && recent) {
          drafts.push({
            ...base,
            fingerprint: `fin-large:${input.messageId}`,
            type: "finance.large_transaction",
            title: `${formatMoney(primary.amount, primary.currency)}${merchant ? ` at ${merchant}` : ""}${analysis.paymentMethod ? ` · ${analysis.paymentMethod}` : ""}`,
            body: `Above your ${formatMoney(settings.notifications.largeTransactionThreshold, primary.currency)} alert threshold. Not you? Contact ${institution} right away.`,
          });
        }
      }
      upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
      break;
    }
    case "fraud_alert":
      upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
      if (isRecent(input, 7 * 86400000)) {
        drafts.push({
          ...base,
          fingerprint: `fin-fraud:${input.messageId}`,
          type: "finance.fraud",
          title: `${institution} fraud alert${primary ? ` — ${formatMoney(primary.amount, primary.currency)}` : ""}${merchant ? ` at ${merchant}` : ""}`,
          body: "Your bank flagged a transaction. Confirm or deny it from the bank's app — never via links in unexpected emails.",
          notify: recent,
        });
      }
      break;
    case "low_balance":
      upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
      if (isRecent(input, 5 * 86400000)) {
        drafts.push({
          ...base,
          fingerprint: `fin-low:${input.messageId}`,
          type: "finance.low_balance",
          title: `${institution}: low balance${primary ? ` (${formatMoney(primary.amount, primary.currency)})` : ""}`,
          body: "Top up to avoid overdraft fees or failed payments.",
          notify: recent,
        });
      }
      break;
    case "deposit":
    case "transfer_in":
    case "refund":
    case "transfer_out": {
      if (primary) {
        const kind: ChargeKind = analysis.subtype === "deposit" ? "deposit" : analysis.subtype === "refund" ? "refund" : analysis.subtype === "transfer_in" ? "transfer_in" : "transfer_out";
        const direction = kind === "transfer_out" ? "out" : "in";
        const spend: SpendCategory = kind === "deposit" ? "income" : kind === "refund" ? "other" : "transfers";
        insertCharge(ctx, input, {
          kind,
          spend,
          description:
            kind === "deposit"
              ? `Deposit${analysis.data.counterparty ? ` · ${analysis.data.counterparty}` : ` · ${institution}`}`
              : kind === "refund"
                ? `Refund · ${institution}`
                : `${kind === "transfer_in" ? "From" : "To"} ${(analysis.data.counterparty as string | null) ?? institution}`,
          amount: primary.amount,
          currency: primary.currency,
          direction,
        });
      }
      upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
      if (recent && analysis.subtype !== "transfer_out") {
        const type = analysis.subtype === "deposit" ? "finance.deposit" : analysis.subtype === "refund" ? "finance.refund" : "finance.transfer";
        drafts.push({
          ...base,
          fingerprint: `fin-${analysis.subtype}:${input.messageId}`,
          type,
          title: analysis.summary,
          body: null,
        });
      }
      break;
    }
    case "tax_document":
      upsertInsight(ctx, input, { groupKey: "tax" });
      if (isRecent(input, 21 * 86400000)) {
        drafts.push({ ...base, fingerprint: `fin-tax:${input.messageId}`, type: "finance.tax_document", title: analysis.summary, body: "Download it for your records and tax filing." });
      }
      break;
    case "credit_score":
      upsertInsight(ctx, input, { groupKey: "credit" });
      if (recent) drafts.push({ ...base, fingerprint: `fin-credit:${input.messageId}`, type: "finance.credit", title: analysis.summary, body: "Check the report for anything you don't recognize." });
      break;
    default:
      upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
  }
  return drafts;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

function materializeOrder(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const data = analysis.data as { orderNumber?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; carrier?: string | null; deliveryAt?: string | null };
  const groupKey = data.orderNumber ?? data.trackingNumber ?? null;
  upsertInsight(ctx, input, { occursAt: data.deliveryAt ?? null, status: analysis.subtype, groupKey });
  const primary = analysis.primaryAmount;
  if (analysis.subtype === "order_placed" && primary) {
    insertCharge(ctx, input, {
      kind: "purchase",
      spend: (analysis.vendor?.kind && SPEND_BY_KIND[analysis.vendor.kind]) || "shopping",
      description: `${analysis.vendor?.name ?? "Order"}${data.orderNumber ? ` #${data.orderNumber}` : ""}`,
      amount: primary.amount,
      currency: primary.currency,
      direction: "out",
    });
  }
  if (!isRecent(input, 2 * 86400000)) return [];
  const map: Record<string, string> = { out_for_delivery: "order.out_for_delivery", delivered: "order.delivered", delayed: "order.delayed" };
  const type = map[analysis.subtype];
  if (!type) return [];
  const track = data.trackingUrl ?? linkOf(analysis, ["track", "order"])?.url ?? null;
  return [
    {
      fingerprint: `order:${analysis.subtype}:${groupKey ?? input.messageId}`,
      type,
      title: analysis.summary,
      body: analysis.subtype === "delayed" ? "Check the carrier for a new delivery estimate." : null,
      facts: [
        { label: "Merchant", value: analysis.vendor?.name ?? "" },
        { label: "Order", value: data.orderNumber ? `#${data.orderNumber}` : "" },
        { label: "Carrier", value: data.carrier ?? "" },
        { label: "Tracking", value: data.trackingNumber ?? "" },
      ],
      messageId: input.messageId,
      vendorId: input.vendorId,
      actionUrl: track,
      actionLabel: track ? "Track" : null,
    },
  ];
}

// ─── Travel ──────────────────────────────────────────────────────────────────

function materializeTravel(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const data = analysis.data as { confirmation?: string | null; departAt?: string | null; checkIn?: string | null; flights?: string[]; route?: { from: string; to: string } | null };
  const occursAt = analysis.subtype === "hotel" || analysis.subtype === "car_rental" ? (data.checkIn ?? data.departAt ?? null) : (data.departAt ?? data.checkIn ?? null);
  upsertInsight(ctx, input, { occursAt, groupKey: data.confirmation ?? null });
  const primary = analysis.primaryAmount;
  if (primary && ["flight", "hotel", "car_rental", "train", "ride"].includes(analysis.subtype)) {
    insertCharge(ctx, input, {
      kind: "purchase",
      spend: analysis.subtype === "ride" ? "transport" : "travel",
      description: analysis.summary.split(" · ")[0] ?? "Travel",
      amount: primary.amount,
      currency: primary.currency,
      direction: "out",
    });
  }
  const drafts: AlertDraft[] = [];
  const facts: Fact[] = [
    { label: "Provider", value: analysis.vendor?.name ?? "" },
    { label: "Confirmation", value: data.confirmation ?? "" },
    { label: "Flight", value: data.flights?.join(", ") ?? "" },
    { label: "Route", value: data.route ? `${data.route.from} → ${data.route.to}` : "" },
  ];
  if (analysis.subtype === "flight_change" && isRecent(input, 2 * 86400000)) {
    drafts.push({
      fingerprint: `travel-change:${input.messageId}`,
      type: "travel.change",
      title: analysis.summary,
      body: "Check the airline app for your new itinerary and rebooking options.",
      facts,
      messageId: input.messageId,
      vendorId: input.vendorId,
      actionUrl: linkOf(analysis, ["itinerary", "checkin"])?.url ?? null,
      actionLabel: "View trip",
    });
  }
  if (analysis.subtype === "checkin" && isRecent(input, 2 * 86400000)) {
    drafts.push({
      fingerprint: `travel-checkin:${data.confirmation ?? input.messageId}`,
      type: "travel.checkin",
      title: analysis.summary,
      body: "Check in now to keep your seat and get your boarding pass.",
      facts,
      messageId: input.messageId,
      vendorId: input.vendorId,
      actionUrl: linkOf(analysis, ["checkin", "itinerary"])?.url ?? null,
      actionLabel: "Check in",
    });
  }
  return drafts;
}

// ─── Career ──────────────────────────────────────────────────────────────────

function materializeCareer(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const data = analysis.data as { company?: string | null; role?: string | null; stage?: string; at?: string | null; recruiter?: string | null };
  const company = data.company ?? null;
  upsertInsight(ctx, input, { occursAt: data.at ?? null, status: data.stage ?? analysis.subtype, groupKey: company ? slugify(company) : null });
  const map: Record<string, { type: string; body: string; window: number }> = {
    offer: { type: "career.offer", body: "Congratulations! Review the details and deadlines carefully.", window: 14 },
    interview_request: { type: "career.interview", body: "Reply with your availability or pick a slot.", window: 7 },
    assessment: { type: "career.assessment", body: "Note the deadline and block time to complete it.", window: 7 },
    application_update: { type: "career.update", body: "There's movement on your application.", window: 5 },
    rejection: { type: "career.rejection", body: "This application is closed. On to the next one.", window: 5 },
    recruiter_outreach: { type: "career.recruiter", body: "A recruiter reached out — reply if you're interested.", window: 5 },
  };
  const def = map[analysis.subtype];
  if (!def || !isRecent(input, def.window * 86400000)) return [];
  const tz = ctx.settings.get().profile.timezone;
  return [
    {
      fingerprint: `career:${analysis.subtype}:${input.messageId}`,
      type: def.type,
      title: analysis.summary,
      body: def.body,
      facts: [
        { label: "Company", value: company ?? "" },
        { label: "Role", value: data.role ?? "" },
        { label: "When", value: data.at ? formatDate(data.at, tz, "datetime") : "" },
        { label: "Contact", value: data.recruiter ?? input.email.from.name ?? "" },
      ],
      messageId: input.messageId,
      vendorId: input.vendorId,
      dueAt: data.at ?? null,
      actionUrl: linkOf(analysis, ["schedule", "join", "assessment"])?.url ?? null,
      actionLabel: linkOf(analysis, ["schedule", "join", "assessment"])?.label ?? null,
      notify: isRecent(input),
    },
  ];
}

// ─── Security ────────────────────────────────────────────────────────────────

function materializeSecurity(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
  const map: Record<string, { type: string; body: string; window: number }> = {
    suspicious_activity: { type: "security.suspicious", body: "If this wasn't you, change your password and review active sessions immediately.", window: 5 },
    breach_notice: { type: "security.breach", body: "Change the affected password everywhere you reused it and enable two-factor authentication.", window: 14 },
    account_locked: { type: "security.account_locked", body: "Follow the provider's official recovery steps — don't use links from unexpected emails.", window: 5 },
    password_changed: { type: "security.password_changed", body: "If you didn't change it, recover the account now.", window: 3 },
    mfa_change: { type: "security.mfa_change", body: "If you didn't make this change, secure the account immediately.", window: 3 },
    email_changed: { type: "security.mfa_change", body: "Contact details on an account changed. If it wasn't you, act now.", window: 3 },
    new_signin: { type: "security.new_signin", body: "If you recognize this device, no action is needed.", window: 2 },
    password_reset: { type: "security.password_reset", body: "Didn't request a reset? Someone may be trying to access the account.", window: 2 },
  };
  const def = map[analysis.subtype];
  if (!def || !isRecent(input, def.window * 86400000)) return [];
  const data = analysis.data as { device?: string | null; browser?: string | null; location?: string | null; ip?: string | null };
  const review = linkOf(analysis, ["review", "reset"]);
  return [
    {
      fingerprint: `security:${analysis.subtype}:${input.messageId}`,
      type: def.type,
      title: analysis.summary,
      body: def.body,
      facts: [
        { label: "Account", value: analysis.vendor?.name ?? "" },
        { label: "Device", value: [data.device, data.browser].filter(Boolean).join(" · ") },
        { label: "Location", value: data.location ?? "" },
        { label: "IP", value: data.ip ?? "" },
      ],
      messageId: input.messageId,
      vendorId: input.vendorId,
      actionUrl: review?.url ?? null,
      actionLabel: review?.label ?? null,
    },
  ];
}

// ─── Events & health ─────────────────────────────────────────────────────────

function materializeLife(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  const at = (analysis.data.at as string | null) ?? null;
  upsertInsight(ctx, input, { occursAt: at, groupKey: analysis.vendor?.slug ?? null });
  if (analysis.category === "health" && isRecent(input, 2 * 86400000)) {
    const tz = ctx.settings.get().profile.timezone;
    const type = analysis.subtype === "appointment" ? "health.appointment" : "health.update";
    if (analysis.subtype === "appointment" && at && new Date(at).getTime() < input.now.getTime()) return [];
    return [
      {
        fingerprint: `health:${analysis.subtype}:${input.messageId}`,
        type,
        title: analysis.summary,
        body: analysis.subtype === "appointment" ? "Added to your timeline." : null,
        facts: [
          { label: "Provider", value: analysis.vendor?.name ?? "" },
          { label: "When", value: at ? formatDate(at, tz, "datetime") : "" },
        ],
        messageId: input.messageId,
        vendorId: input.vendorId,
        dueAt: at,
      },
    ];
  }
  return [];
}

function materializeDevAlert(ctx: AppContext, input: MaterializeInput): AlertDraft[] {
  const { analysis } = input;
  upsertInsight(ctx, input, { groupKey: analysis.vendor?.slug ?? null });
  if (!isRecent(input, 2 * 86400000)) return [];
  if (!/fail|error|down|outage|incident|vulnerab|security|exceed|limit|alert/i.test(`${input.email.subject} ${analysis.summary}`)) return [];
  return [
    {
      fingerprint: `dev:${input.messageId}`,
      type: "dev.failure",
      title: analysis.summary,
      body: null,
      facts: [{ label: "Service", value: analysis.vendor?.name ?? "" }],
      messageId: input.messageId,
      vendorId: input.vendorId,
    },
  ];
}

export function severityRank(sev: string): number {
  return SEVERITY_RANK[sev as keyof typeof SEVERITY_RANK] ?? 0;
}

export function storedAnalysisOf(row: { analysis: string }): StoredAnalysis | null {
  return parseJson<StoredAnalysis | null>(row.analysis, null);
}
