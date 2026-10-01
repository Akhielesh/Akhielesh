import type { BillingCycle } from "../../../shared/types.js";
import type { DateMention, MoneyMention } from "../types.js";

const CYCLE_PATTERNS: [BillingCycle, RegExp][] = [
  ["weekly", /\b(weekly|per week|a week|every week|\/\s?(wk|week)\b|billed weekly)/gi],
  ["quarterly", /\b(quarterly|per quarter|every (3|three) months|3-month|three-month|\/\s?(qtr|quarter)\b)/gi],
  ["semiannual", /\b(semi-?annual(ly)?|bi-?annual(ly)?|every (6|six) months|6-month|six-month|half-?year(ly)?)/gi],
  ["annual", /\b(annual(ly)?|yearly|per year|a year|every year|\/\s?(yr|year)\b|12-month|twelve-month|billed annually|1-year|one-year|annual plan|year plan|for (1|one|a) year\b|(1|one) year (plan|term|subscription|renewal|registration))/gi],
  ["monthly", /\b(monthly|per month|a month|every month|\/\s?(mo|mth|month)\b|month-to-month|billed monthly|1-month|one-month|mo\.)/gi],
];

/** Finds the billing cycle, favoring mentions closest to the primary amount. */
export function detectCycle(text: string, nearIndex?: number): BillingCycle | null {
  const candidates: { cycle: BillingCycle; distance: number }[] = [];
  for (const [cycle, pattern] of CYCLE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      // "12 months free", "for 3 months" describe promos, not cycles.
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 20);
      if (/^\s*(free|trial|of free|on us|for free)/i.test(after)) continue;
      const before = text.slice(Math.max(0, match.index - 25), match.index);
      if (/\b(first|for|after)\s*$/i.test(before) && cycle !== "monthly") continue;
      candidates.push({ cycle, distance: nearIndex === undefined ? match.index : Math.abs(match.index - nearIndex) });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]!.cycle;
}

const PLAN_WORDS =
  "Premium|Plus|Pro|Basic|Standard|Family|Individual|Duo|Student|Business|Team|Teams|Enterprise|Personal|Starter|Ultimate|Essentials?|Max|Unlimited|Lite|Premier|Gold|Silver|Platinum|Advanced|Growth|Creator|Hobby|Ultra|Deluxe|Prime";

const PLAN_RE = new RegExp(
  `\\b((?:[A-Z][\\w+]*\\s){0,2}(?:${PLAN_WORDS})(?:\\s(?:Individual|Family|Annual|Monthly|Yearly|Duo|Student|with ads|Plan|Plus|\\d+\\s?(?:GB|TB)))?)\\s+(?:plan|tier|membership|subscription)\\b`,
);
const PLAN_COLON_RE = /\b(?:plan|tier|membership|subscription)(?: name)?\s*[:\-–]\s*([A-Z][\w+ ]{1,40}?)(?=\s{2,}|\n|$|[.,;(])/;
const STORAGE_PLAN_RE = /\b(\d+\s?(?:GB|TB))\b(?=[^\n]{0,30}\b(storage|plan)\b)/i;

export function extractPlan(text: string): string | null {
  const head = text.slice(0, 6000);
  const colon = PLAN_COLON_RE.exec(head);
  if (colon?.[1] && colon[1].length <= 40 && !/\b(details|summary|information|below|change)\b/i.test(colon[1])) return tidy(colon[1]);
  const named = PLAN_RE.exec(head);
  if (named?.[1]) return tidy(named[1]);
  const storage = STORAGE_PLAN_RE.exec(head);
  if (storage?.[1]) return storage[1].replace(/\s+/g, " ").toUpperCase();
  return null;
}

function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^(your|the|our)\s+/i, "")
    .trim();
}

const CARD_RE =
  /\b(visa|mastercard|master card|amex|american express|discover|rupay|maestro|debit card|credit card|card|account|checking|savings)\b[^\n\d]{0,24}?(?:ending(?:\s+in|\s+with)?|\(?\s*(?:•|\*|x|X|…){2,}|no\.?|#|last (?:4|four)(?: digits)?(?: of)?)\s*[:\-]?\s*(\d{4})\b/i;
const WALLET_RE = /\b(paypal|apple pay|google pay|venmo|cash app|amazon pay|shop pay|klarna|affirm|upi)\b/i;

export function extractPaymentMethod(text: string): string | null {
  const card = CARD_RE.exec(text);
  if (card) {
    const brand = card[1]!.toLowerCase();
    const label =
      brand === "master card" || brand === "mastercard"
        ? "Mastercard"
        : brand === "amex" || brand === "american express"
          ? "Amex"
          : ["debit card", "credit card", "card"].includes(brand)
            ? "Card"
            : ["account", "checking", "savings"].includes(brand)
              ? "Account"
              : brand.charAt(0).toUpperCase() + brand.slice(1);
    return `${label} •• ${card[2]}`;
  }
  const wallet = WALLET_RE.exec(text.slice(0, 5000));
  if (wallet && /\b(paid|payment|charged|method|via|using|with)\b/i.test(text.slice(Math.max(0, wallet.index - 60), wallet.index + 60))) {
    return wallet[1]!.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

export function extractAccountHint(text: string): string | null {
  const match = /\b(?:account|card)\s*(?:number\s*)?(?:ending(?:\s+in)?|•+|\*+|x{2,}|no\.?)\s*[:\-]?\s*(\d{4})\b/i.exec(text);
  return match ? match[1]! : null;
}

export interface PriceChange {
  from: number;
  to: number;
  currency: string;
  effectiveAt: Date | null;
}

const BETWEEN_TO = /^\s*(\/\s?(mo|month|yr|year))?\s*(per (month|year))?\s*(a (month|year))?\s*(\)|,)?\s*(to|→|->|–|—|will (now )?be|will change to|will increase to|increases? to|is now|becomes)\s*$/i;

export function detectPriceChange(text: string, amounts: MoneyMention[], dates: DateMention[]): PriceChange | null {
  const sorted = [...amounts].filter((a) => a.amount > 0).sort((a, b) => a.index - b.index);
  const effective =
    dates.find((d) => d.kind === "effective") ?? dates.find((d) => d.kind === "renewal") ?? dates.find((d) => d.kind === "due") ?? null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.currency !== b.currency || a.amount === b.amount) continue;
    const between = text.slice(a.index + a.raw.length, b.index);
    if (between.length <= 40 && BETWEEN_TO.test(between)) {
      return { from: a.amount, to: b.amount, currency: a.currency, effectiveAt: effective?.at ?? null };
    }
  }
  const newer = sorted.find((m) => m.label === "new_price");
  const older = sorted.find((m) => m.label === "old_price");
  if (newer && older && newer.currency === older.currency && newer.amount !== older.amount) {
    return { from: older.amount, to: newer.amount, currency: newer.currency, effectiveAt: effective?.at ?? null };
  }
  return null;
}
