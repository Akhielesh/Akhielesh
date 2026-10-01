// Time-zone aware helpers built on Intl (no external date library).

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. -240 for EDT). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Converts a wall-clock time in `timeZone` to the UTC instant. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = tzOffsetMinutes(new Date(guess), timeZone);
  let ts = guess - offset1 * 60000;
  const offset2 = tzOffsetMinutes(new Date(ts), timeZone);
  if (offset2 !== offset1) ts = guess - offset2 * 60000;
  return new Date(ts);
}

/** YYYY-MM-DD of `date` as seen in `timeZone`. */
export function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function monthKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86400000);
}

/** Whole calendar days from `from` to `to` in `timeZone` (0 = same day, 1 = tomorrow). */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  return dayNumber(dayKey(to, timeZone)) - dayNumber(dayKey(from, timeZone));
}

/** Start of the local day containing `date`, as a UTC instant. */
export function startOfZonedDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

export function startOfZonedMonth(date: Date, timeZone: string, monthOffset = 0): Date {
  const p = zonedParts(date, timeZone);
  const base = new Date(Date.UTC(p.year, p.month - 1 + monthOffset, 1));
  return zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, 1, 0, 0, timeZone);
}

/** A date-only value stored as 12:00 UTC so it renders as the same calendar day almost everywhere. */
export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function isDateOnlyIso(iso: string): boolean {
  return iso.endsWith("T12:00:00.000Z");
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/** Adds calendar months, clamping to the end of shorter months (Jan 31 + 1 → Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

export function parseHHMM(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hour: 8, minute: 0 };
  return { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) };
}

/** True when the local time in `timeZone` falls inside [start, end) — handles windows that cross midnight. */
export function inTimeWindow(date: Date, timeZone: string, start: string, end: string): boolean {
  const p = zonedParts(date, timeZone);
  const now = p.hour * 60 + p.minute;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  const startMin = s.hour * 60 + s.minute;
  const endMin = e.hour * 60 + e.minute;
  if (startMin === endMin) return false;
  return startMin < endMin ? now >= startMin && now < endMin : now >= startMin || now < endMin;
}

/** Next UTC instant at which the local clock in `timeZone` reads `hhmm`, at or after `from`. */
export function nextZonedTime(from: Date, timeZone: string, hhmm: string): Date {
  const { hour, minute } = parseHHMM(hhmm);
  const p = zonedParts(from, timeZone);
  let candidate = zonedToUtc(p.year, p.month, p.day, hour, minute, timeZone);
  if (candidate.getTime() < from.getTime()) {
    const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    candidate = zonedToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), hour, minute, timeZone);
  }
  return candidate;
}
