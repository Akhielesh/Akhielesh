import { ALERT_TYPES } from "../../shared/catalog.js";
import type { AlertDTO, AlertStatus, Category, Fact, Severity } from "../../shared/types.js";
import { SEVERITY_RANK } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { parseJson } from "../db/index.js";
import { VENDOR_COLUMNS, vendorRefFromRow } from "./vendors.js";

export interface AlertDraft {
  fingerprint: string;
  type: string;
  category?: Category;
  severity?: Severity;
  title: string;
  body?: string | null;
  facts?: Fact[];
  messageId?: number | null;
  vendorId?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  dueAt?: string | null;
  /** Eligible for instant notifications (false for historical backfill). */
  notify?: boolean;
}

export function createAlert(ctx: AppContext, draft: AlertDraft): number | null {
  const meta = ALERT_TYPES[draft.type];
  const overrides = ctx.settings.get().notifications.typeOverrides[draft.type];
  if (overrides?.enabled === false) return null;
  const severity = overrides?.severity ?? draft.severity ?? meta?.severity ?? "medium";
  const category = draft.category ?? meta?.category ?? "other";
  const now = ctx.now().toISOString();
  const facts = (draft.facts ?? []).filter((f) => f.value && f.value !== "—").slice(0, 8);
  const result = ctx.db
    .prepare(
      `INSERT INTO alerts(fingerprint, type, category, severity, title, body, facts, message_id, vendor_id, entity_type, entity_id,
         action_url, action_label, due_at, status, notify, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
       ON CONFLICT(fingerprint) DO NOTHING`,
    )
    .run(
      draft.fingerprint,
      draft.type,
      category,
      severity,
      draft.title.slice(0, 200),
      draft.body ?? null,
      JSON.stringify(facts),
      draft.messageId ?? null,
      draft.vendorId ?? null,
      draft.entityType ?? null,
      draft.entityId ?? null,
      safeUrl(draft.actionUrl),
      draft.actionLabel ?? null,
      draft.dueAt ?? null,
      draft.notify === false ? 0 : 1,
      now,
      now,
    );
  if (result.changes === 0) return null;
  const id = Number(result.lastInsertRowid);
  ctx.bus.emit("alert", { id, severity, type: draft.type });
  return id;
}

export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Marks open alerts for an entity as done (e.g. bill paid, subscription cancelled). */
export function resolveAlerts(ctx: AppContext, entityType: string, entityId: number, types?: string[]): number {
  const now = ctx.now().toISOString();
  const typeClause = types?.length ? `AND type IN (${types.map(() => "?").join(",")})` : "";
  return ctx.db
    .prepare(`UPDATE alerts SET status = 'done', updated_at = ? WHERE entity_type = ? AND entity_id = ? AND status IN ('new','read','snoozed') ${typeClause}`)
    .run(now, entityType, entityId, ...(types ?? [])).changes;
}

interface AlertRow {
  id: number;
  type: string;
  category: Category;
  severity: Severity;
  title: string;
  body: string | null;
  facts: string;
  status: AlertStatus;
  due_at: string | null;
  snoozed_until: string | null;
  notified_at: string | null;
  created_at: string;
  action_url: string | null;
  action_label: string | null;
  entity_type: string | null;
  entity_id: number | null;
  vendor_id: number | null;
  v_slug: string | null;
  v_name: string | null;
  v_domain: string | null;
  v_kind: string | null;
  v_color: string | null;
  message_id: number | null;
  m_subject: string | null;
  m_from_name: string | null;
  m_from_email: string | null;
  m_received_at: string | null;
}

export const ALERT_SELECT = `
  SELECT a.*, ${VENDOR_COLUMNS},
         m.subject AS m_subject, m.from_name AS m_from_name, m.from_email AS m_from_email, m.received_at AS m_received_at
  FROM alerts a
  LEFT JOIN vendors v ON v.id = a.vendor_id
  LEFT JOIN messages m ON m.id = a.message_id`;

export function alertFromRow(row: AlertRow): AlertDTO {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    severity: row.severity,
    title: row.title,
    body: row.body,
    facts: parseJson<Fact[]>(row.facts, []),
    status: row.status,
    dueAt: row.due_at,
    snoozedUntil: row.snoozed_until,
    notifiedAt: row.notified_at,
    createdAt: row.created_at,
    actionUrl: row.action_url,
    actionLabel: row.action_label,
    entityType: row.entity_type,
    entityId: row.entity_id,
    vendor: vendorRefFromRow(row),
    message:
      row.message_id && row.m_received_at
        ? { id: row.message_id, subject: row.m_subject ?? "", fromName: row.m_from_name, fromEmail: row.m_from_email, receivedAt: row.m_received_at }
        : null,
  };
}

export function getAlerts(ctx: AppContext, ids: number[]): AlertDTO[] {
  if (ids.length === 0) return [];
  const rows = ctx.db.prepare(`${ALERT_SELECT} WHERE a.id IN (${ids.map(() => "?").join(",")})`).all(...ids) as AlertRow[];
  return rows.map(alertFromRow);
}

export interface AlertQuery {
  status?: AlertStatus | "open" | "all";
  severity?: Severity[];
  category?: Category[];
  q?: string;
  limit?: number;
  before?: string;
}

export function queryAlerts(ctx: AppContext, query: AlertQuery): AlertDTO[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const status = query.status ?? "open";
  if (status === "open") where.push("a.status IN ('new','read')");
  else if (status !== "all") {
    where.push("a.status = ?");
    params.push(status);
  }
  if (query.severity?.length) {
    where.push(`a.severity IN (${query.severity.map(() => "?").join(",")})`);
    params.push(...query.severity);
  }
  if (query.category?.length) {
    where.push(`a.category IN (${query.category.map(() => "?").join(",")})`);
    params.push(...query.category);
  }
  if (query.q) {
    where.push("(a.title LIKE ? OR a.body LIKE ? OR v.name LIKE ?)");
    const like = `%${query.q.replace(/[%_]/g, "")}%`;
    params.push(like, like, like);
  }
  if (query.before) {
    where.push("a.created_at < ?");
    params.push(query.before);
  }
  const sql = `${ALERT_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY CASE a.status WHEN 'new' THEN 0 ELSE 1 END,
             CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
             a.created_at DESC
    LIMIT ?`;
  params.push(Math.min(500, query.limit ?? 100));
  return (ctx.db.prepare(sql).all(...params) as AlertRow[]).map(alertFromRow);
}

/** Re-opens snoozed alerts whose snooze expired. */
export function wakeSnoozed(ctx: AppContext): number {
  const now = ctx.now().toISOString();
  return ctx.db.prepare("UPDATE alerts SET status = 'new', snoozed_until = NULL, updated_at = ? WHERE status = 'snoozed' AND snoozed_until <= ?").run(now, now)
    .changes;
}

export function severityAtLeast(severity: Severity, min: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}
