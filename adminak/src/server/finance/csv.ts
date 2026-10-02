import { createHash } from "node:crypto";
import type { CsvMapping, FinAccountType } from "../../shared/types.js";
import { looksLikeCardPayment } from "./merchant.js";
import { dateOnlyIso, type BankAccountInput, type BankTxnInput } from "./types.js";

// Statement exports: one parser for every bank's CSV, with known layouts recognised by their
// header row (Capital One first) and a column-guessing fallback the user can correct.

/** RFC 4180 CSV with BOM, CRLF, quoted fields and doubled quotes; picks comma, semicolon or tab. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.slice(0, input.search(/\r?\n/) >>> 0 || input.length);
  const delimiter = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** "$1,234.56", "(12.34)", "-12.34", "12.34-", "1 234,56" → number, or null. */
export function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let text = raw.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/-$/.test(text)) {
    negative = true;
    text = text.slice(0, -1);
  }
  text = text.replace(/[$€£₹¥\s]|USD|EUR|GBP|INR|CAD/gi, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) text = text.slice(1);
  // European decimal comma: "1.234,56" or "12,34".
  if (/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(text) || /^\d+,\d{1,2}$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round((negative ? -value : value) * 100) / 100;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** US-style statement dates → YYYY-MM-DD. Accepts M/D/YYYY, M/D/YY, YYYY-MM-DD, YYYYMMDD, "Jan 5, 2026", "05 Jan 2026". */
export function parseDate(raw: string | undefined, order: "mdy" | "dmy" = "mdy"): string | null {
  if (!raw) return null;
  const text = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text) ?? /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(text);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text))) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
    [m, d] = order === "dmy" || a > 12 ? [b, a] : [a, b];
  } else if ((match = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text))) {
    [m, d, y] = [MONTHS[match[1]!.toLowerCase()] ?? 0, Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(text))) {
    [d, m, y] = [Number(match[1]), MONTHS[match[2]!.toLowerCase()] ?? 0, Number(match[3])];
  } else return null;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface CsvFormat {
  id: string;
  label: string;
  institution: string | null;
  accountType: FinAccountType | null;
  /** Does this header row belong to the format? (lower-cased, trimmed headers) */
  match: (h: string[]) => boolean;
  mapping: (h: string[]) => CsvMapping;
  /** Column holding the card/account number (for the last four digits). */
  maskColumn?: (h: string[]) => number;
  headerless?: boolean;
}

const col = (h: string[], ...names: string[]) => {
  for (const name of names) {
    const i = h.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
};
const has = (h: string[], ...names: string[]) => names.every((n) => h.includes(n));
const base = (over: Partial<CsvMapping>): CsvMapping => ({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, category: -1, direction: -1, positiveIsOut: false, ...over });

const FORMATS: CsvFormat[] = [
  {
    id: "capital_one_card",
    label: "Capital One credit card",
    institution: "Capital One",
    accountType: "credit",
    match: (h) => has(h, "transaction date", "posted date", "description", "debit", "credit") && (h.includes("card no.") || h.includes("category")),
    mapping: (h) => base({ date: col(h, "transaction date"), description: col(h, "description"), debit: col(h, "debit"), credit: col(h, "credit"), category: col(h, "category") }),
    maskColumn: (h) => col(h, "card no."),
  },
  {
    id: "capital_one_360",
    label: "Capital One 360 checking / savings",
    institution: "Capital One",
    accountType: null,
    match: (h) => has(h, "transaction description", "transaction date", "transaction type", "transaction amount"),
    mapping: (h) => base({ date: col(h, "transaction date"), description: col(h, "transaction description"), amount: col(h, "transaction amount"), direction: col(h, "transaction type") }),
    maskColumn: (h) => col(h, "account number"),
  },
  {
    id: "chase_card",
    label: "Chase credit card",
    institution: "Chase",
    accountType: "credit",
    match: (h) => has(h, "transaction date", "post date", "description", "category", "type", "amount"),
    mapping: (h) => base({ date: col(h, "transaction date"), description: col(h, "description"), amount: col(h, "amount"), category: col(h, "category") }),
  },
  {
    id: "chase_bank",
    label: "Chase checking / savings",
    institution: "Chase",
    accountType: "checking",
    match: (h) => has(h, "details", "posting date", "description", "amount", "type"),
    mapping: (h) => base({ date: col(h, "posting date"), description: col(h, "description"), amount: col(h, "amount") }),
  },
  {
    id: "apple_card",
    label: "Apple Card",
    institution: "Apple Card",
    accountType: "credit",
    match: (h) => has(h, "transaction date", "clearing date", "description", "merchant", "amount (usd)"),
    mapping: (h) => base({ date: col(h, "transaction date"), description: col(h, "merchant"), amount: col(h, "amount (usd)"), category: col(h, "category"), positiveIsOut: true }),
  },
  {
    id: "discover_card",
    label: "Discover card",
    institution: "Discover",
    accountType: "credit",
    match: (h) => has(h, "trans. date", "post date", "description", "amount"),
    mapping: (h) => base({ date: col(h, "trans. date"), description: col(h, "description"), amount: col(h, "amount"), category: col(h, "category"), positiveIsOut: true }),
  },
  {
    id: "amex_card",
    label: "American Express",
    institution: "American Express",
    accountType: "credit",
    match: (h) => has(h, "date", "description", "amount") && (h.includes("appears on your statement as") || h.includes("extended details") || (h.includes("card member") && h.includes("account #"))),
    mapping: (h) => base({ date: col(h, "date"), description: col(h, "description"), amount: col(h, "amount"), category: col(h, "category"), positiveIsOut: true }),
    maskColumn: (h) => col(h, "account #"),
  },
  {
    id: "citi_card",
    label: "Citi card",
    institution: "Citi",
    accountType: "credit",
    match: (h) => has(h, "status", "date", "description", "debit", "credit"),
    mapping: (h) => base({ date: col(h, "date"), description: col(h, "description"), debit: col(h, "debit"), credit: col(h, "credit") }),
  },
  {
    id: "bofa_bank",
    label: "Bank of America checking",
    institution: "Bank of America",
    accountType: "checking",
    match: (h) => has(h, "date", "description", "amount", "running bal."),
    mapping: (h) => base({ date: col(h, "date"), description: col(h, "description"), amount: col(h, "amount") }),
  },
  {
    id: "bofa_card",
    label: "Bank of America credit card",
    institution: "Bank of America",
    accountType: "credit",
    match: (h) => has(h, "posted date", "reference number", "payee", "address", "amount"),
    mapping: (h) => base({ date: col(h, "posted date"), description: col(h, "payee"), amount: col(h, "amount") }),
  },
];

/** Wells Fargo exports have no header: date, amount, "*", check number, description. */
function isWellsFargo(rows: string[][]): boolean {
  const sample = rows.slice(0, 5);
  return sample.length > 0 && sample.every((r) => r.length === 5 && !!parseDate(r[0]) && parseAmount(r[1]) !== null && r[2] === "*");
}

/** Guesses columns for an unknown export from its header names. */
export function guessMapping(headers: string[], rows: string[][]): CsvMapping {
  const find = (pattern: RegExp, exclude?: RegExp) => headers.findIndex((h) => pattern.test(h) && !(exclude && exclude.test(h)));
  const date = find(/\b(?:transaction |trans\.? |posting |posted |booking |value )?date\b/, /\b(?:clearing|statement|due)\b/);
  const description = find(/\b(?:description|payee|merchant|name|details|memo|narrative|transaction)\b/, /\b(?:date|amount|type|id|number)\b/);
  const amount = find(/\bamount\b/, /\b(?:balance|original)\b/);
  const debit = find(/\b(?:debit|withdrawal|withdrawals|paid out|money out|outflow|charges?)\b/);
  const credit = find(/\b(?:credit|deposit|deposits|paid in|money in|inflow|payments?)\b/, /\bcredit card\b/);
  const category = find(/\bcategory\b/);
  const direction = find(/^(?:type|transaction type|dr\/cr|debit\/credit)$/);
  const mapping = base({ date, description, amount: amount >= 0 && !(debit >= 0 && credit >= 0) ? amount : -1, debit: amount >= 0 && !(debit >= 0 && credit >= 0) ? -1 : debit, credit: amount >= 0 && !(debit >= 0 && credit >= 0) ? -1 : credit, category, direction: -1 });
  if (mapping.amount >= 0 && direction >= 0) {
    const values = rows.slice(0, 40).map((r) => (r[direction] ?? "").toLowerCase());
    if (values.some((v) => /^(?:debit|credit|dr|cr|withdrawal|deposit)$/.test(v)) && rows.slice(0, 40).every((r) => (parseAmount(r[mapping.amount]) ?? 0) >= 0)) mapping.direction = direction;
  }
  if (mapping.amount >= 0 && mapping.direction < 0) mapping.positiveIsOut = inferPositiveIsOut(rows.map((r) => ({ amount: parseAmount(r[mapping.amount]) ?? 0, description: r[mapping.description] ?? "" })));
  return mapping;
}

/**
 * Card exports disagree on sign: some list purchases as positive. On a card statement most rows are
 * purchases and the few opposite-signed rows are payments ("PAYMENT - THANK YOU").
 */
function inferPositiveIsOut(rows: { amount: number; description: string }[]): boolean {
  const payments = rows.filter((r) => looksLikeCardPayment(r.description) && r.amount !== 0);
  if (payments.length >= 1) {
    const negativePayments = payments.filter((r) => r.amount < 0).length;
    return negativePayments > payments.length / 2;
  }
  const positive = rows.filter((r) => r.amount > 0).length;
  return positive > rows.length * 0.8;
}

export interface ParsedStatement {
  format: string;
  formatLabel: string;
  institution: string | null;
  account: Omit<BankAccountInput, "externalId" | "currency"> & { currency: string | null };
  mapping: CsvMapping | null;
  columns: string[];
  transactions: Omit<BankTxnInput, "accountExternalId">[];
  warnings: string[];
}

/** External ids for statement rows: stable across re-imports, distinct for identical same-day purchases. */
export function rowIds(rows: { date: string; amount: number; description: string }[], salt: string): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.date}|${r.amount.toFixed(2)}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `csv:${createHash("sha256").update(`${salt}|${key}|${n}`).digest("hex").slice(0, 24)}`;
  });
}

export function parseCsvStatement(text: string, override?: CsvMapping | null): ParsedStatement {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("The file is empty.");
  const warnings: string[] = [];
  let headers: string[] = [];
  let body: string[][];
  let format: CsvFormat | null = null;
  let mapping: CsvMapping;
  let maskCol = -1;

  if (isWellsFargo(rows)) {
    body = rows;
    headers = ["Date", "Amount", "*", "Check #", "Description"];
    mapping = base({ date: 0, amount: 1, description: 4 });
    format = { id: "wells_fargo", label: "Wells Fargo", institution: "Wells Fargo", accountType: "checking", match: () => false, mapping: () => mapping, headerless: true };
  } else {
    // Some banks put a title block above the header; take the first row that looks like a header.
    const headerIndex = rows.findIndex((r, i) => i < 15 && r.length >= 3 && r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|description|payee/i.test(c)));
    if (headerIndex < 0) throw new Error("Couldn't find a header row with a date and an amount column.");
    headers = rows[headerIndex]!;
    body = rows.slice(headerIndex + 1).filter((r) => r.length >= Math.min(3, headers.length));
    const lower = headers.map((h) => h.toLowerCase().trim());
    format = FORMATS.find((f) => f.match(lower)) ?? null;
    mapping = format ? format.mapping(lower) : guessMapping(lower, body);
    maskCol = format?.maskColumn?.(lower) ?? lower.findIndex((h) => /^(?:card no\.?|card number|account number|account #|account)$/.test(h));
  }
  if (override) mapping = { ...override };

  if (mapping.date < 0) throw new Error("Couldn't tell which column holds the date. Pick it below.");
  if (mapping.description < 0) throw new Error("Couldn't tell which column describes each transaction. Pick it below.");
  if (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0) throw new Error("Couldn't find an amount column. Pick it below.");

  const parsed: { date: string; amount: number; description: string; category: string | null }[] = [];
  let skipped = 0;
  for (const r of body) {
    const date = parseDate(r[mapping.date]);
    const description = (r[mapping.description] ?? "").replace(/\s+/g, " ").trim();
    let amount: number | null;
    if (mapping.amount >= 0) {
      amount = parseAmount(r[mapping.amount]);
      if (amount !== null && mapping.direction >= 0) {
        const dir = (r[mapping.direction] ?? "").toLowerCase();
        amount = /debit|dr|withdraw/.test(dir) ? -Math.abs(amount) : /credit|cr|deposit/.test(dir) ? Math.abs(amount) : amount;
      } else if (amount !== null && mapping.positiveIsOut) amount = -amount;
    } else {
      const debit = parseAmount(r[mapping.debit]);
      const credit = parseAmount(r[mapping.credit]);
      amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : debit === 0 || credit === 0 ? 0 : null;
    }
    if (!date || amount === null || !description) {
      skipped++;
      continue;
    }
    if (amount === 0) continue;
    parsed.push({ date, amount, description, category: mapping.category >= 0 ? (r[mapping.category] ?? "").trim() || null : null });
  }
  if (parsed.length === 0) throw new Error("No transactions found. Check the column mapping.");
  if (skipped > 0) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} without a date, amount or description ${skipped === 1 ? "was" : "were"} skipped.`);

  const masks = new Set(maskCol >= 0 ? body.map((r) => (r[maskCol] ?? "").replace(/\D/g, "").slice(-4)).filter((m) => m.length === 4) : []);
  if (masks.size > 1) warnings.push(`This file mixes ${masks.size} cards (${[...masks].join(", ")}); they'll be imported into one account.`);
  const mask = masks.size >= 1 ? [...masks][0]! : null;

  let accountType: FinAccountType | null = format?.accountType ?? null;
  if (!accountType) {
    // 360 exports (and unknown files) don't say; a payment-shaped inflow suggests a card.
    const cardish = parsed.some((p) => p.amount > 0 && looksLikeCardPayment(p.description)) && !parsed.some((p) => /payroll|direct dep/i.test(p.description));
    accountType = /saving/i.test(text.slice(0, 4000)) ? "savings" : cardish ? "credit" : "checking";
  }
  const salt = `${format?.id ?? "csv"}|${mask ?? ""}`;
  const ids = rowIds(parsed, salt);
  return {
    format: format?.id ?? "generic_csv",
    formatLabel: format?.label ?? "Spreadsheet export",
    institution: format?.institution ?? null,
    account: {
      name: format?.institution ? `${format.institution}${accountType === "credit" ? " card" : accountType === "savings" ? " savings" : " checking"}` : "Imported account",
      institution: format?.institution ?? null,
      type: accountType,
      mask,
      currency: null,
    },
    mapping,
    columns: headers,
    transactions: parsed.map((p, i) => ({ externalId: ids[i]!, date: dateOnlyIso(p.date), amount: p.amount, description: p.description, category: p.category, pending: false })),
    warnings,
  };
}
