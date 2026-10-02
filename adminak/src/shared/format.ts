import { CYCLE_META } from "./catalog.js";
import type { BillingCycle, MoneyTotal } from "./types.js";
import { calendarDaysBetween, isDateOnlyIso } from "./time.js";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined = "USD",
  opts: { compact?: boolean; signed?: boolean; locale?: string; whole?: boolean } = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const cur = (currency || "USD").toUpperCase();
  const whole = opts.whole === true || (opts.whole === undefined && Math.abs(amount) >= 100_000);
  const key = `${opts.locale ?? "en-US"}|${cur}|${opts.compact ? "c" : ""}|${whole ? "w" : ""}|${opts.signed ? "s" : ""}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(opts.locale ?? "en-US", {
        style: "currency",
        currency: cur,
        notation: opts.compact ? "compact" : "standard",
        maximumFractionDigits: opts.compact ? 1 : whole ? 0 : 2,
        minimumFractionDigits: opts.compact ? 0 : whole ? 0 : 2,
        signDisplay: opts.signed ? "exceptZero" : "auto",
      });
    } catch {
      f = new Intl.NumberFormat(opts.locale ?? "en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    }
    moneyFormatters.set(key, f);
  }
  return f.format(amount);
}

export function formatTotals(totals: MoneyTotal[], opts: { compact?: boolean; whole?: boolean; empty?: string; currency?: string } = {}): string {
  const nonZero = totals.filter((t) => Math.abs(t.amount) > 0.004);
  if (nonZero.length === 0) return opts.empty ?? formatMoney(0, totals[0]?.currency ?? opts.currency ?? "USD", { whole: opts.whole });
  return nonZero.map((t) => formatMoney(t.amount, t.currency, { compact: opts.compact, whole: opts.whole })).join(" + ");
}

export function sumByCurrency<T>(items: T[], amount: (item: T) => number | null, currency: (item: T) => string | null): MoneyTotal[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const value = amount(item);
    const cur = currency(item);
    if (value === null || !cur) continue;
    map.set(cur, (map.get(cur) ?? 0) + value);
  }
  return [...map.entries()]
    .map(([cur, total]) => ({ currency: cur, amount: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthlyCost(amount: number | null, cycle: BillingCycle): number | null {
  if (amount === null) return null;
  return Math.round(amount * CYCLE_META[cycle].perMonth * 100) / 100;
}

export function cycleShort(cycle: BillingCycle | null | undefined): string {
  return cycle ? CYCLE_META[cycle].short : "";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export type DateStyle = "short" | "medium" | "long" | "weekday" | "time" | "datetime" | "monthDay" | "monthYear";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDate(iso: string | Date | null | undefined, timeZone = "UTC", style: DateStyle = "medium"): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return "—";
  // Date-only values are anchored at 12:00 UTC; render them in UTC so they never shift a day.
  const tz = typeof iso === "string" && isDateOnlyIso(iso) && style !== "time" ? "UTC" : timeZone;
  const key = `${tz}|${style}`;
  let f = dateFormatters.get(key);
  if (!f) {
    const base: Intl.DateTimeFormatOptions = { timeZone: tz };
    const options: Record<DateStyle, Intl.DateTimeFormatOptions> = {
      short: { ...base, month: "numeric", day: "numeric" },
      medium: { ...base, month: "short", day: "numeric", year: "numeric" },
      long: { ...base, weekday: "long", month: "long", day: "numeric", year: "numeric" },
      weekday: { ...base, weekday: "short", month: "short", day: "numeric" },
      time: { ...base, hour: "numeric", minute: "2-digit" },
      datetime: { ...base, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
      monthDay: { ...base, month: "short", day: "numeric" },
      monthYear: { ...base, month: "long", year: "numeric" },
    };
    try {
      f = new Intl.DateTimeFormat("en-US", options[style]);
    } catch {
      f = new Intl.DateTimeFormat("en-US", { ...options[style], timeZone: "UTC" });
    }
    dateFormatters.set(key, f);
  }
  return f.format(date);
}

/** "today", "tomorrow", "in 3 days", "yesterday", "5 days ago" based on calendar days in `timeZone`. */
export function humanizeDay(iso: string | null | undefined, timeZone = "UTC", now = new Date()): string {
  if (!iso) return "—";
  const diff = daysUntil(iso, timeZone, now);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 1 && diff < 14) return `in ${diff} days`;
  if (diff < -1 && diff > -14) return `${-diff} days ago`;
  if (diff >= 14 && diff < 60) return `in ${Math.round(diff / 7)} weeks`;
  if (diff <= -14 && diff > -60) return `${Math.round(-diff / 7)} weeks ago`;
  return formatDate(iso, timeZone, "medium");
}

function nowInZoneYMD(now: Date, timeZone: string): [number, number, number, number] {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = f.format(now).split("-").map(Number);
  return [y!, (m ?? 1) - 1, d ?? 1, 12];
}

/** Calendar days until `iso` from now (negative when past). */
export function daysUntil(iso: string, timeZone = "UTC", now = new Date()): number {
  if (isDateOnlyIso(iso)) {
    return calendarDaysBetween(new Date(Date.UTC(...nowInZoneYMD(now, timeZone))), new Date(iso), "UTC");
  }
  return calendarDaysBetween(now, new Date(iso), timeZone);
}

export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "never";
  const diffMs = now.getTime() - new Date(iso).getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  let text: string;
  if (minutes < 1) return future ? "in a moment" : "just now";
  if (minutes < 60) text = `${minutes}m`;
  else if (minutes < 60 * 24) text = `${Math.round(minutes / 60)}h`;
  else if (minutes < 60 * 24 * 30) text = `${Math.round(minutes / 1440)}d`;
  else if (minutes < 60 * 24 * 365) text = `${Math.round(minutes / 43200)}mo`;
  else text = `${Math.round(minutes / 525600)}y`;
  return future ? `in ${text}` : `${text} ago`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || !local) return email;
  const visible = local.length <= 2 ? local[0] : `${local[0]}${"•".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}`;
  return `${visible}@${domain}`;
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
