import type { Category, RuleActions, RuleCondition, RuleDTO } from "../../shared/types.js";
import type { DB } from "../db/index.js";
import { parseJson } from "../db/index.js";
import type { Analysis, IncomingEmail } from "./types.js";
import { domainOf } from "./vendor-resolve.js";

interface RuleRow {
  id: number;
  name: string;
  enabled: number;
  match: "all" | "any";
  conditions: string;
  actions: string;
  hits: number;
  last_hit_at: string | null;
  created_at: string;
}

export function ruleFromRow(row: RuleRow): RuleDTO {
  return {
    id: row.id,
    name: row.name,
    enabled: !!row.enabled,
    match: row.match,
    conditions: parseJson<RuleCondition[]>(row.conditions, []),
    actions: parseJson<RuleActions>(row.actions, {}),
    hits: row.hits,
    lastHitAt: row.last_hit_at,
    createdAt: row.created_at,
  };
}

export function loadRules(db: DB, onlyEnabled = true): RuleDTO[] {
  const rows = db.prepare(`SELECT * FROM rules ${onlyEnabled ? "WHERE enabled = 1" : ""} ORDER BY id ASC`).all() as RuleRow[];
  return rows.map(ruleFromRow);
}

export interface RuleSubject {
  from: string;
  fromName: string;
  fromDomain: string;
  subject: string;
  body: string;
  category: string;
  vendor: string;
  amount: number | null;
}

export function ruleSubject(email: Pick<IncomingEmail, "from" | "subject">, analysis: Pick<Analysis, "category" | "vendor" | "primaryAmount" | "cleanText">): RuleSubject {
  return {
    from: (email.from.address ?? "").toLowerCase(),
    fromName: email.from.name ?? "",
    fromDomain: domainOf(email.from.address) ?? "",
    subject: email.subject ?? "",
    body: analysis.cleanText.slice(0, 10_000),
    category: analysis.category,
    vendor: analysis.vendor?.name ?? "",
    amount: analysis.primaryAmount?.amount ?? null,
  };
}

function fieldValue(subject: RuleSubject, field: RuleCondition["field"]): string | number | null {
  switch (field) {
    case "any":
      return `${subject.fromName} ${subject.from} ${subject.subject} ${subject.body}`;
    case "amount":
      return subject.amount;
    default:
      return subject[field];
  }
}

const regexCache = new Map<string, RegExp | null>();
function compile(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  let re: RegExp | null = null;
  try {
    re = pattern.length <= 300 ? new RegExp(pattern, "i") : null;
  } catch {
    re = null;
  }
  regexCache.set(pattern, re);
  return re;
}

export function conditionMatches(subject: RuleSubject, condition: RuleCondition): boolean {
  const raw = fieldValue(subject, condition.field);
  const value = condition.value.trim();
  if (["gt", "gte", "lt", "lte"].includes(condition.op)) {
    const num = typeof raw === "number" ? raw : Number(raw);
    const target = Number(value);
    if (raw === null || Number.isNaN(num) || Number.isNaN(target)) return false;
    if (condition.op === "gt") return num > target;
    if (condition.op === "gte") return num >= target;
    if (condition.op === "lt") return num < target;
    return num <= target;
  }
  const text = String(raw ?? "").toLowerCase();
  const needle = value.toLowerCase();
  switch (condition.op) {
    case "contains":
      return needle.split(/\s*\|\s*/).some((n) => n && text.includes(n));
    case "not_contains":
      return !needle.split(/\s*\|\s*/).some((n) => n && text.includes(n));
    case "equals":
      return needle.split(/\s*,\s*/).includes(text);
    case "starts_with":
      return text.startsWith(needle);
    case "ends_with":
      return text.endsWith(needle);
    case "matches": {
      const re = compile(value);
      return re ? re.test(String(raw ?? "")) : false;
    }
    default:
      return false;
  }
}

export function ruleMatches(subject: RuleSubject, rule: Pick<RuleDTO, "conditions" | "match">): boolean {
  if (rule.conditions.length === 0) return false;
  return rule.match === "any" ? rule.conditions.some((c) => conditionMatches(subject, c)) : rule.conditions.every((c) => conditionMatches(subject, c));
}

export interface SenderOverride {
  id: number;
  pattern: string;
  category: Category | null;
  ignore: boolean;
}

export function loadSenderOverrides(db: DB): SenderOverride[] {
  return (db.prepare("SELECT id, pattern, category, ignore FROM sender_overrides").all() as { id: number; pattern: string; category: Category | null; ignore: number }[]).map(
    (r) => ({ ...r, ignore: !!r.ignore }),
  );
}

export function matchSenderOverride(overrides: SenderOverride[], address: string | null, ignoreList: string[] = []): SenderOverride | null {
  if (!address) return null;
  const email = address.toLowerCase();
  const domain = domainOf(email) ?? "";
  const matches = (pattern: string) => {
    const p = pattern.trim().toLowerCase();
    if (!p) return false;
    if (p.includes("@") && !p.startsWith("@")) return p === email;
    const d = p.replace(/^@/, "");
    return domain === d || domain.endsWith(`.${d}`);
  };
  for (const pattern of ignoreList) if (matches(pattern)) return { id: 0, pattern, category: null, ignore: true };
  // Exact addresses win over domains.
  const exact = overrides.find((o) => o.pattern.includes("@") && !o.pattern.startsWith("@") && matches(o.pattern));
  return exact ?? overrides.find((o) => matches(o.pattern)) ?? null;
}

export function interpolate(template: string, subject: RuleSubject): string {
  return template
    .replace(/\{\{\s*subject\s*\}\}/g, subject.subject)
    .replace(/\{\{\s*from\s*\}\}/g, subject.fromName || subject.from)
    .replace(/\{\{\s*vendor\s*\}\}/g, subject.vendor)
    .replace(/\{\{\s*amount\s*\}\}/g, subject.amount !== null ? String(subject.amount) : "")
    .slice(0, 200);
}
