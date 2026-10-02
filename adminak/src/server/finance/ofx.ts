import type { FinAccountType } from "../../shared/types.js";
import type { ParsedStatement } from "./csv.js";
import { dateOnlyIso } from "./types.js";

// OFX / QFX / QBO downloads ("Quicken", "Money", "Web Connect"). Both the SGML 1.x flavour
// (no closing tags) and XML 2.x are handled with tag scanning — no XML parser, no entities.

function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, "i").exec(block);
  const value = match?.[1]?.trim();
  return value ? decode(value) : null;
}

function decode(value: string): string {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function section(text: string, name: string): string | null {
  const start = text.search(new RegExp(`<${name}>`, "i"));
  if (start < 0) return null;
  const end = text.slice(start).search(new RegExp(`</${name}>`, "i"));
  return end < 0 ? text.slice(start) : text.slice(start, start + end);
}

/** 20260115120000.000[-5:EST] → 2026-01-15 */
function ofxDate(value: string | null): string | null {
  const match = value ? /^(\d{4})(\d{2})(\d{2})/.exec(value) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 2000);
  return /OFXHEADER|<OFX>|<\?OFX/i.test(head);
}

export function parseOfxStatement(text: string): ParsedStatement {
  if (!looksLikeOfx(text)) throw new Error("This doesn't look like an OFX/QFX file.");
  const isCard = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text);
  const acct = section(text, isCard ? "CCACCTFROM" : "BANKACCTFROM") ?? "";
  const acctId = tag(acct, "ACCTID");
  const acctType = (tag(acct, "ACCTTYPE") ?? "").toUpperCase();
  const fi = section(text, "FI") ?? "";
  const org = tag(fi, "ORG");
  const currency = (tag(text, "CURDEF") ?? "USD").toUpperCase();
  const type: FinAccountType = isCard ? "credit" : acctType === "SAVINGS" || acctType === "MONEYMRKT" ? "savings" : acctType === "CREDITLINE" ? "loan" : "checking";

  const transactions: ParsedStatement["transactions"] = [];
  const warnings: string[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  let skipped = 0;
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0] ?? raw;
    const date = ofxDate(tag(block, "DTPOSTED") ?? tag(block, "DTUSER"));
    const amount = Number(tag(block, "TRNAMT"));
    const name = tag(block, "NAME") ?? tag(block, "PAYEE") ?? "";
    const memo = tag(block, "MEMO") ?? "";
    const fitid = tag(block, "FITID");
    if (!date || !Number.isFinite(amount) || amount === 0) {
      skipped++;
      continue;
    }
    const description = name && memo && !memo.toLowerCase().includes(name.toLowerCase()) && memo.length < 80 ? `${name} ${memo}` : name || memo;
    transactions.push({
      // FITIDs are unique per account at the bank, so re-downloads dedupe exactly.
      externalId: fitid ? `ofx:${fitid}` : `ofx:${date}:${amount.toFixed(2)}:${description.slice(0, 40)}`,
      date: dateOnlyIso(date),
      amount: Math.round(amount * 100) / 100,
      description: description.replace(/\s+/g, " ").trim() || "Transaction",
      type: (tag(block, "TRNTYPE") ?? "").toLowerCase() || null,
      pending: false,
    });
  }
  if (transactions.length === 0) throw new Error("No transactions found in this OFX file.");
  if (skipped) warnings.push(`${skipped} entr${skipped === 1 ? "y" : "ies"} without a date or amount ${skipped === 1 ? "was" : "were"} skipped.`);

  const ledger = section(text, "LEDGERBAL") ?? "";
  const available = section(text, "AVAILBAL") ?? "";
  const balance = Number(tag(ledger, "BALAMT"));
  const availableAmount = Number(tag(available, "BALAMT"));
  const asOf = ofxDate(tag(ledger, "DTASOF"));
  // OFX balances are signed like transactions: a card's balance owed is negative.
  const owedSide = type === "credit" || type === "loan";
  const mask = acctId ? acctId.replace(/\D/g, "").slice(-4) || null : null;
  const institution = org ? org.replace(/\bB\.?A\.?\b|\bN\.?A\.?\b/g, "").trim() || org : null;
  return {
    format: isCard ? "ofx_card" : "ofx_bank",
    formatLabel: `OFX / QFX download${institution ? ` · ${institution}` : ""}`,
    institution,
    account: {
      name: `${institution ?? "Imported"} ${type === "credit" ? "card" : type}`,
      institution,
      type,
      mask,
      currency,
      balanceCurrent: Number.isFinite(balance) ? (owedSide ? -balance : balance) : null,
      balanceAvailable: Number.isFinite(availableAmount) ? availableAmount : null,
      balanceAt: asOf ? dateOnlyIso(asOf) : null,
    },
    mapping: null,
    columns: [],
    transactions,
    warnings,
  };
}
