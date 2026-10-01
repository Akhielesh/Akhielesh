import type { MoneyMention } from "../types.js";

const TOKEN_CURRENCY: Record<string, string> = {
  "US$": "USD",
  USD: "USD",
  "CA$": "CAD",
  C$: "CAD",
  CAD: "CAD",
  A$: "AUD",
  AU$: "AUD",
  AUD: "AUD",
  NZ$: "NZD",
  NZD: "NZD",
  HK$: "HKD",
  HKD: "HKD",
  S$: "SGD",
  SGD: "SGD",
  R$: "BRL",
  BRL: "BRL",
  "€": "EUR",
  EUR: "EUR",
  "£": "GBP",
  GBP: "GBP",
  "¥": "JPY",
  JPY: "JPY",
  "₹": "INR",
  RS: "INR",
  "RS.": "INR",
  INR: "INR",
  "₩": "KRW",
  KRW: "KRW",
  CHF: "CHF",
  AED: "AED",
  MXN: "MXN",
  SEK: "SEK",
  NOK: "NOK",
  DKK: "DKK",
  PLN: "PLN",
  "ZŁ": "PLN",
  "₱": "PHP",
  PHP: "PHP",
  "₦": "NGN",
  "₺": "TRY",
  TRY: "TRY",
  ZAR: "ZAR",
};

const PREFIX =
  /(^|[^A-Za-z0-9$])(-|\()?\s?(US\$|CA\$|C\$|A\$|AU\$|NZ\$|HK\$|S\$|R\$|\$|€|£|¥|₹|₩|₱|₦|₺|Rs\.?|INR|USD|EUR|GBP|CAD|AUD|NZD|HKD|SGD|BRL|JPY|CHF|AED|MXN|SEK|NOK|DKK|PLN|PHP|TRY|ZAR|KRW)\s?(-)?(\d{1,3}(?:[,.']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])/g;

const SUFFIX =
  /(^|[^A-Za-z0-9.,])(\d{1,3}(?:[,.]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(USD|EUR|GBP|INR|CAD|AUD|JPY|CHF|SGD|AED|SEK|NOK|DKK|PLN|€|zł)(?![A-Za-z])/g;

const DECIMAL_COMMA_CURRENCIES = new Set(["EUR", "BRL", "DKK", "NOK", "SEK", "PLN", "TRY", "CHF"]);

export function parseAmount(raw: string, currency: string): number | null {
  let s = raw.replace(/['\s]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    s = decimals === 2 && commas === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1 || (decimals === 3 && DECIMAL_COMMA_CURRENCIES.has(currency))) s = s.replace(/\./g, "");
  }
  const value = Number(s);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

interface ContextRule {
  re: RegExp;
  label: string;
  score: number;
}

// Matched against the ~70 characters BEFORE an amount.
const BEFORE: ContextRule[] = [
  { re: /\b(grand )?total(\s+(charged|paid|amount|billed|due|cost))?\s*(\(.*?\))?\s*[:\-–]?\s*$/i, label: "total", score: 7 },
  { re: /\b(amount|total)?\s*(charged|billed|paid)(\s+(to|on|today|with)[\w •*.-]{0,30})?\s*[:\-–]?\s*$/i, label: "charged", score: 7 },
  { re: /\b(amount|balance|payment|total|bill)\s+(is\s+)?due(\s+(on|by)\s+[\w ,]{3,20})?\s*[:\-–]?\s*$/i, label: "due", score: 7 },
  { re: /\bminimum(\s+payment)?(\s+due)?\s*[:\-–]?\s*$/i, label: "minimum", score: 2 },
  { re: /\b(new|statement|current|outstanding)\s+balance\s*(is|of)?\s*[:\-–]?\s*$/i, label: "balance", score: 6 },
  { re: /\b(payment|charge|purchase|transaction|deposit|transfer|refund|withdrawal|debit|credit|invoice|order)(\s+(amount|total|of|for|in the amount of))+\s*[:\-–]?\s*$/i, label: "payment", score: 6 },
  { re: /\b(you|we)\s+(paid|sent|received|spent|charged|refunded|deposited)(\s+[\w .]{0,25})?\s*$/i, label: "payment", score: 6 },
  { re: /\b(has been|was|were|will be)\s+(charged|billed|credited|refunded|deposited|debited|withdrawn|sent|paid)(\s+(for|with))?\s*[:\-–]?\s*$/i, label: "payment", score: 6 },
  { re: /\b(received|sent you|paid you|got)\s*$/i, label: "payment", score: 5 },
  { re: /\b(renews?|renewal)\s+(at|for|price)?\s*[:\-–]?\s*$/i, label: "price", score: 5 },
  { re: /\b(new|updated|future)\s+(price|rate|pricing)(\s+(is|will be|of))?\s*[:\-–]?\s*$/i, label: "new_price", score: 6 },
  { re: /\b(current|previous|old|existing)\s+(price|rate|pricing)(\s+(is|was|of))?\s*[:\-–]?\s*$/i, label: "old_price", score: 3 },
  { re: /\b(price|cost|rate|fee|plan|membership|subscription)(\s+(is|will be|of|at))?\s*[:\-–]?\s*$/i, label: "price", score: 4 },
  { re: /\b(a charge|charge)\s+of\s*$/i, label: "payment", score: 6 },
  { re: /\bsubtotal\s*[:\-–]?\s*$/i, label: "subtotal", score: 1 },
  { re: /\b(sales\s+)?(tax|vat|gst|hst)(es)?(\s*\(?[\d.]+\s?%\)?)?\s*[:\-–]?\s*$/i, label: "tax", score: -5 },
  { re: /\b(shipping|delivery fee|service fee|tip|handling|surcharge)\s*[:\-–]?\s*$/i, label: "fee", score: -3 },
  { re: /\b(discount|savings?|you saved|promo(tion)?|coupon|credit applied|gift card|reward)\s*[:\-–]?\s*$/i, label: "discount", score: -6 },
  { re: /\b(available balance|account balance|your balance|current available)\s*(is|of)?\s*[:\-–]?\s*$/i, label: "available", score: 1 },
  { re: /\b(limit|credit line|threshold|over|above|exceeds?|more than|less than|below|under|up to|as low as|starting at|just|only)\s*$/i, label: "threshold", score: -3 },
  { re: /\bfrom\s*$/i, label: "from", score: 1 },
  { re: /\bto\s*$/i, label: "to", score: 2 },
];

// Matched against the ~30 characters AFTER an amount.
const AFTER: ContextRule[] = [
  { re: /^\s*(\/\s?(mo|month|yr|year|wk|week)|per\s+(month|year|week)|a\s+(month|year|week)|monthly|annually|yearly)\b/i, label: "recurring", score: 3 },
  { re: /^\s*(off|discount|savings?)\b/i, label: "discount", score: -7 },
  { re: /^\s*(credit|reward|cashback|cash back|points)\b/i, label: "credit", score: -3 },
  { re: /^\s*(was|has been)\s+(charged|billed|paid|debited|deposited|refunded)/i, label: "payment", score: 4 },
  { re: /^\s*(is|was)\s+due\b/i, label: "due", score: 5 },
  { re: /^\s*(in|of)\s+(free|bonus|credit)/i, label: "credit", score: -4 },
];

export function extractAmounts(text: string, defaultDollar = "USD", subject = ""): MoneyMention[] {
  const mentions: MoneyMention[] = [];
  const source = subject ? `${subject}\n${text}` : text;
  const subjectEnd = subject ? subject.length : -1;
  const dollar = ["USD", "CAD", "AUD", "NZD", "SGD", "HKD"].includes(defaultDollar) ? defaultDollar : "USD";
  const seen = new Set<number>();

  const add = (rawNumber: string, token: string, index: number, raw: string, negative: boolean) => {
    const upper = token.toUpperCase();
    const currency = upper === "$" ? dollar : (TOKEN_CURRENCY[upper] ?? TOKEN_CURRENCY[token] ?? dollar);
    const value = parseAmount(rawNumber, currency);
    if (value === null || value === 0 || value > 10_000_000) return;
    if (seen.has(index)) return;
    seen.add(index);
    const before = source.slice(Math.max(0, index - 70), index);
    const after = source.slice(index + raw.length, index + raw.length + 30);
    let score = 1;
    let label = "amount";
    let bestBefore = -Infinity;
    if (/\bminimum\b[^\n$€£₹]{0,30}$/i.test(before)) {
      // "Minimum payment due: $40" must never be mistaken for the full amount due.
      bestBefore = 2;
      label = "minimum";
    } else {
      for (const rule of BEFORE) {
        if (rule.re.test(before) && rule.score > bestBefore) {
          bestBefore = rule.score;
          label = rule.label;
        }
      }
    }
    if (bestBefore > -Infinity) score += bestBefore;
    for (const rule of AFTER) {
      if (rule.re.test(after)) {
        score += rule.score;
        if (label === "amount" || rule.score < 0) label = rule.label;
        break;
      }
    }
    if (index <= subjectEnd) score += 2;
    // Table-style "Total ............ $17.99" lines.
    const lineStart = source.lastIndexOf("\n", index) + 1;
    const line = source.slice(lineStart, index);
    if (/^\s*(order |grand )?total\b/i.test(line)) {
      score += 3;
      label = "total";
    }
    mentions.push({ amount: negative ? -value : value, currency, index, raw: raw.trim(), label, score });
  };

  let match: RegExpExecArray | null;
  PREFIX.lastIndex = 0;
  while ((match = PREFIX.exec(source))) {
    const lead = match[1] ?? "";
    const index = match.index + lead.length;
    const negative = !!match[2] || !!match[4];
    add(match[5]!, match[3]!, index, match[0].slice(lead.length), negative);
  }
  SUFFIX.lastIndex = 0;
  while ((match = SUFFIX.exec(source))) {
    const lead = match[1] ?? "";
    const index = match.index + lead.length;
    // Skip if a prefix match already covers this region (e.g. "USD 10.00 USD").
    if (mentions.some((m) => Math.abs(m.index - index) < 6)) continue;
    add(match[2]!, match[3]!, index, match[0].slice(lead.length), false);
  }
  return mentions.sort((a, b) => a.index - b.index);
}

/** Highest-scoring positive amount, preferring the latest "total" on ties (grand totals come last). */
export function pickPrimary(mentions: MoneyMention[], prefer: string[] = []): MoneyMention | null {
  const positive = mentions.filter((m) => m.amount > 0 && m.score > -1);
  if (positive.length === 0) return null;
  const preferred = prefer.length ? positive.filter((m) => prefer.includes(m.label)) : [];
  const pool = preferred.length ? preferred : positive;
  return pool.reduce((best, m) => {
    if (m.score > best.score) return m;
    if (m.score === best.score && (m.label === "total" || m.label === "charged") && m.index > best.index) return m;
    if (m.score === best.score && m.amount > best.amount && best.label === "amount") return m;
    return best;
  });
}
