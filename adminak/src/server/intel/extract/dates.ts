import * as chrono from "chrono-node";
import { dateOnly, tzOffsetMinutes, zonedToUtc } from "../../../shared/time.js";
import type { DateKind, DateMention } from "../types.js";

const KIND_PATTERNS: [DateKind, RegExp][] = [
  ["trial_end", /\b(trial|free (period|month|week))\b[^.\n]{0,50}\b(ends?|ending|expires?|expiring|over|until|through|converts?|after)\b|\b(until|before|after) (your|the) (free )?trial\b|\btrial (end|expir\w*)( date)?\b/gi],
  ["renewal", /\b(renews?|renewal|renewing|auto-?renew\w*|next (billing|payment|charge|bill|invoice|renewal)( date)?|billing date|will be (charged|billed)|(charged|billed) (again )?on|recurring)\b/gi],
  ["effective", /\b(effective|starting|beginning|takes? effect|from your (next )?(billing|bill|payment|renewal)|as of)\b/gi],
  ["due", /\b(due|pay(ment)? by|payment date|deadline|no later than|must be (paid|received))\b/gi],
  ["statement", /\b(statement (date|closing|period)|closing date|billing period|period ending)\b/gi],
  ["delivery", /\b(deliver(y|ed|ing)?|arriv(e|es|ing|al)|estimated|expected|eta|get it|out for delivery)\b/gi],
  ["departure", /\b(depart(s|ure|ing)?|flight|boarding|takeoff|take-off|leaves|outbound)\b/gi],
  ["arrival", /\b(arrives at|arrival|landing|lands)\b/gi],
  ["checkin", /\bcheck[- ]?in\b/gi],
  ["checkout", /\bcheck[- ]?out\b/gi],
  ["pickup", /\bpick[- ]?up\b/gi],
  ["interview", /\b(interview|phone screen|screening|onsite|on-site|technical (round|call)|hiring manager|recruiter call|chat with)\b/gi],
  ["appointment", /\b(appointment|visit|consultation|check-?up|telehealth)\b/gi],
  ["event", /\b(event|starts at|doors|show(time)?|concert|reservation|rsvp|invitation|when:|date:|time:)\b/gi],
  ["expiry", /\b(expire[sd]?|expiration|valid (until|through)|expiring)\b/gi],
];

// When multiple kinds match in the context window, the nearest (rightmost) wins;
// on ties these kinds are preferred.
const PRIORITY: DateKind[] = ["trial_end", "renewal", "due", "effective", "departure", "checkin", "checkout", "interview", "appointment", "delivery"];

function classify(context: string): DateKind {
  let best: { kind: DateKind; at: number } | null = null;
  for (const [kind, pattern] of KIND_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let last = -1;
    while ((match = pattern.exec(context))) last = match.index + match[0].length;
    if (last < 0) continue;
    if (
      !best ||
      last > best.at + 2 ||
      (Math.abs(last - best.at) <= 2 && PRIORITY.indexOf(kind) > -1 && (PRIORITY.indexOf(best.kind) < 0 || PRIORITY.indexOf(kind) < PRIORITY.indexOf(best.kind)))
    ) {
      best = { kind, at: last };
    }
  }
  return best?.kind ?? "unknown";
}

export interface DateExtractOptions {
  reference: Date;
  timeZone: string;
}

export function extractDates(text: string, opts: DateExtractOptions): DateMention[] {
  const source = text.slice(0, 20_000);
  let results: chrono.ParsedResult[] = [];
  try {
    results = chrono.parse(
      source,
      { instant: opts.reference, timezone: tzOffsetMinutes(opts.reference, opts.timeZone) },
      { forwardDate: true },
    );
  } catch {
    return [];
  }
  const out: DateMention[] = [];
  const minTs = opts.reference.getTime() - 2 * 365 * 86400000;
  const maxTs = opts.reference.getTime() + 3 * 365 * 86400000;
  for (const result of results) {
    const start = result.start;
    if (!start.isCertain("day") && !start.isCertain("weekday")) continue;
    if (!/\d|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(result.text)) continue;
    if (/\bago\b/i.test(result.text)) continue;
    const allDay = !start.isCertain("hour");
    // Without an explicit zone, read wall-clock times in the user's zone at *that* date (DST-safe).
    const at = allDay
      ? dateOnly(start.get("year")!, start.get("month")!, start.get("day")!)
      : start.isCertain("timezoneOffset")
        ? start.date()
        : zonedToUtc(start.get("year")!, start.get("month")!, start.get("day")!, start.get("hour") ?? 0, start.get("minute") ?? 0, opts.timeZone);
    if (Number.isNaN(at.getTime()) || at.getTime() < minTs || at.getTime() > maxTs) continue;
    // Context: up to 110 chars before the date, cut at the previous paragraph break.
    let context = source.slice(Math.max(0, result.index - 110), result.index);
    const paragraph = context.lastIndexOf("\n\n");
    if (paragraph >= 0) context = context.slice(paragraph + 2);
    const kind = classify(context);
    out.push({ kind, at, allDay, text: result.text.trim(), index: result.index });
  }
  return out;
}

export function firstDate(dates: DateMention[], kinds: DateKind[], opts: { after?: Date } = {}): DateMention | null {
  for (const kind of kinds) {
    const hit = dates.find((d) => d.kind === kind && (!opts.after || d.at.getTime() >= opts.after.getTime() - 86400000));
    if (hit) return hit;
  }
  return null;
}
