import { CONSUMER_MAIL_DOMAINS, VENDORS, type VendorDef } from "./vendors.js";
import type { VendorMatch } from "./types.js";

const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.in",
  "net.in",
  "org.in",
  "gov.in",
  "co.jp",
  "ne.jp",
  "com.br",
  "com.mx",
  "co.nz",
  "com.sg",
  "com.hk",
  "co.za",
  "com.tr",
  "co.kr",
  "com.cn",
  "com.tw",
]);

export function domainOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  return address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/[>\s]+$/, "");
}

export function registrableDomain(domain: string): string {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

export function isConsumerDomain(domain: string | null): boolean {
  return !!domain && CONSUMER_MAIL_DOMAINS.has(domain.toLowerCase());
}

const byDomain = new Map<string, VendorDef>();
const byAlias = new Map<string, VendorDef>();
const bySlug = new Map<string, VendorDef>();

for (const vendor of VENDORS) {
  bySlug.set(vendor.slug, vendor);
  for (const domain of vendor.domains) if (!byDomain.has(domain)) byDomain.set(domain, vendor);
  byAlias.set(normalizeName(vendor.name), vendor);
  for (const alias of vendor.aliases ?? []) byAlias.set(normalizeName(alias), vendor);
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.(com|net|org|io|ai|app|co|tv|me|in|us)\b/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|ab|sa|bv|plc|co)\b\.?/g, "")
    .replace(/[^a-z0-9+&]+/g, " ")
    .trim();
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\+/g, " plus")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "unknown"
  );
}

export function vendorBySlug(slug: string): VendorDef | undefined {
  return bySlug.get(slug);
}

export function vendorByDomain(domain: string): VendorDef | undefined {
  let current = domain.toLowerCase();
  while (current.includes(".")) {
    const hit = byDomain.get(current);
    if (hit) return hit;
    current = current.slice(current.indexOf(".") + 1);
  }
  return undefined;
}

/** Looks up a merchant/brand name ("SPOTIFY AB", "Netflix.com", "Amazon Web Services") in the directory. */
export function vendorByName(name: string): VendorDef | undefined {
  const normalized = normalizeName(name);
  if (!normalized) return undefined;
  const direct = byAlias.get(normalized);
  if (direct) return direct;
  // Try the leading words ("spotify usa", "netflix com 866…" → "spotify", "netflix").
  const words = normalized.split(" ");
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const hit = byAlias.get(words.slice(0, n).join(" "));
    if (hit) return hit;
  }
  return undefined;
}

const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

export function colorFor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

const GENERIC_SENDER_WORDS =
  /\b(no-?reply|do[- ]?not[- ]?reply|notifications?|notify|alerts?|team|support|billing|receipts?|invoices?|accounts?|customer (care|service|support)|service|info|hello|news(letter)?|updates?|mailer|messages?|payments?|orders?|shipping|the)\b/gi;

export function cleanSenderName(name: string | null): string | null {
  if (!name) return null;
  let cleaned = name
    .replace(/["“”']/g, "")
    .replace(/\s+via\s+.+$/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*[|–—-]\s*.*$/, "")
    .replace(GENERIC_SENDER_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
  cleaned = cleaned.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+!.)]+$/gu, "");
  return cleaned.length >= 2 ? cleaned : null;
}

function labelToName(domain: string): string {
  const label = registrableDomain(domain).split(".")[0] ?? domain;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function fromDef(def: VendorDef, extra: Partial<VendorMatch> = {}): VendorMatch {
  return {
    slug: def.slug,
    name: def.name,
    domain: def.domains[0] ?? null,
    kind: def.kind,
    category: def.category,
    manageUrl: def.manageUrl ?? null,
    color: def.color ?? colorFor(def.slug),
    known: true,
    product: null,
    ...extra,
  };
}

function unknownVendor(name: string, domain: string | null): VendorMatch {
  const slug = slugify(name);
  return {
    slug,
    name,
    domain: domain ? registrableDomain(domain) : null,
    kind: null,
    category: null,
    manageUrl: null,
    color: colorFor(slug),
    known: false,
    product: null,
  };
}

const MERCHANT_PATTERNS: RegExp[] = [
  /\b(?:receipt|invoice|payment|order|purchase|subscription)\s+(?:from|for|to|with)\s+(?!your\b|the\b|you\b)([A-Z0-9][\w&.,'+ -]{1,50}?)(?=\s*(?:#|\||–|—|-\s|\(|:|\bfor\b|\bon\b|\bis\b|\bhas\b|$))/i,
  /\b(?:you(?:'ve| have)?\s+(?:sent|paid|made) (?:a )?(?:payment|\$[\d.,]+)?\s*(?:of [^\s]+ )?to)\s+([A-Z0-9][\w&.,'+ -]{1,50}?)(?=\s*(?:#|\||\(|$|\.))/i,
  /\byour ([A-Z][\w&.+'-]*(?: [A-Z][\w&.+'-]*){0,3}) (?:subscription|membership|receipt|invoice|order)\b/,
  /\bthanks? for (?:subscribing to|your purchase (?:from|at)|purchasing|choosing)\s+([A-Z][\w&.+'-]*(?: [A-Z][\w&.+'-]*){0,3})/i,
];

function merchantFromProcessorEmail(fromName: string | null, processorName: string, subject: string, text: string): string | null {
  const sender = cleanSenderName(fromName);
  if (sender && normalizeName(sender) !== normalizeName(processorName) && !/^(paypal|stripe|paddle)/i.test(sender)) return sender;
  for (const pattern of MERCHANT_PATTERNS) {
    const match = pattern.exec(subject) ?? pattern.exec(text.slice(0, 1500));
    const candidate = match?.[1]?.trim().replace(/[.,]+$/, "");
    if (candidate && candidate.length >= 2 && normalizeName(candidate) !== normalizeName(processorName)) return candidate;
  }
  return null;
}

export interface ResolveInput {
  fromName: string | null;
  fromAddress: string | null;
  subject: string;
  text: string;
}

/** Identifies which company (and product) an email is about. Returns null for personal senders. */
export function resolveVendor(input: ResolveInput): VendorMatch | null {
  const domain = domainOf(input.fromAddress);
  const haystack = `${input.subject}\n${input.text.slice(0, 4000)}`;
  const known = domain ? vendorByDomain(domain) : undefined;

  if (known) {
    if (known.products?.length) {
      const product = known.products.find((p) => p.pattern.test(haystack));
      if (product) {
        return fromDef(known, {
          product: { key: product.key, name: product.name },
          manageUrl: product.manageUrl ?? known.manageUrl ?? null,
          kind: product.kind ?? known.kind,
        });
      }
    }
    if (known.processor && !known.products?.length) {
      const merchant = merchantFromProcessorEmail(input.fromName, known.name, input.subject, input.text);
      if (merchant) {
        const merchantDef = vendorByName(merchant);
        if (merchantDef) return fromDef(merchantDef, { via: known.name });
        return { ...unknownVendor(merchant, null), via: known.name };
      }
    }
    return fromDef(known);
  }

  if (!domain) return null;
  if (isConsumerDomain(domain)) return null;

  // Unknown company: prefer a brand-like sender name, else derive from the domain.
  const sender = cleanSenderName(input.fromName);
  const named = sender ? vendorByName(sender) : undefined;
  if (named) return fromDef(named);
  const localPart = (input.fromAddress ?? "").split("@")[0]?.toLowerCase() ?? "";
  const senderLooksPersonal =
    !!sender && /^[A-Z][a-z]+(?: [A-Z][a-z.'-]+){1,2}$/.test(sender) && localPart.includes(sender.split(" ")[0]!.toLowerCase());
  const name = sender && !senderLooksPersonal && sender.length <= 40 ? sender : labelToName(domain);
  return unknownVendor(name, domain);
}
