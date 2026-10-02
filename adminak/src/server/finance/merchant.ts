import type { ChargeKind, FinAccountType, SpendCategory } from "../../shared/types.js";
import { normalizeName, vendorByName } from "../intel/vendor-resolve.js";
import type { VendorDef, VendorKind } from "../intel/vendors.js";

// Bank feeds and statements describe purchases as terse processor strings
// ("SQ *BLUE BOTTLE COFFE 0412 SAN FRANCISCOCA"). This module turns them into a merchant
// name, a stable merchant key, and a first guess at what the money movement was.

/** Processor / wallet prefixes that sit in front of the real merchant. */
const PREFIXES: RegExp[] = [
  /^(?:pos|dbt|debit|check ?card|checkcard|card|visa|mc|ach|web|online|recurring|pre-?auth(?:orized)?|purchase|pmnt|payment)\s+(?:purchase|debit|crd|card|pmt|payment|withdrawal|authorized on \d\d\/\d\d)?\s*/i,
  /^(?:sq|squ|sqr)\s*\*\s*/i,
  /^tst\s*\*\s*/i,
  /^(?:py|pp|paypal|pypl)\s*\*\s*/i,
  /^sp\s*[+*]\s*/i,
  /^(?:in|ic|bt|cke|dd|dnh|fs|lmc|pos|ws|zsk)\s*\*\s*/i,
  /^google\s*\*\s*(?!(?:youtube|storage|one|play)\b)/i,
  /^(?:purchase|recurring payment|recurring)\s+/i,
];

/** Well-known descriptor shapes mapped straight to a merchant. */
const KNOWN: [RegExp, string][] = [
  [/\bamzn\s*mktp|\bamazon\.com\*|\bamazon\s*mktpl|\bamzn\.com\/bill|^amazon\s+(?:marketplace|retail)/i, "Amazon"],
  [/\bamazon\s*prime\b|\bprime\s*video\b/i, "Amazon Prime"],
  [/\baws\b|amazon web services/i, "Amazon Web Services"],
  [/apple\.com\/bill|\bitunes\.com\b/i, "Apple"],
  [/\buber\s*\*?\s*eats\b/i, "Uber Eats"],
  [/\buber\b/i, "Uber"],
  [/\blyft\b/i, "Lyft"],
  [/\bdoordash\b|^dd\s*\*/i, "DoorDash"],
  [/\bgrubhub\b/i, "Grubhub"],
  [/\binstacart\b/i, "Instacart"],
  [/\bnetflix\b/i, "Netflix"],
  [/\bspotify\b/i, "Spotify"],
  [/\bhulu\b/i, "Hulu"],
  [/\bdisney\s*(?:plus|\+)\b|\bdisneyplus\b/i, "Disney+"],
  [/\byoutube\s*premium\b|\bgoogle\s*\*\s*youtube\b/i, "YouTube Premium"],
  [/\bgoogle\s*\*\s*(?:storage|one)\b|\bgoogle\s*one\b/i, "Google One"],
  [/\bopenai\b|\bchatgpt\b/i, "OpenAI"],
  [/\banthropic\b|\bclaude\.ai\b/i, "Anthropic"],
  [/\bgithub\b/i, "GitHub"],
  [/\bvercel\b/i, "Vercel"],
  [/\bnotion\b/i, "Notion"],
  [/\bstarbucks\b/i, "Starbucks"],
  [/\bcostco\b/i, "Costco"],
  [/\bwal-?mart\b|\bwm supercenter\b/i, "Walmart"],
  [/\btarget\b(?!\s+(?:date|amount))/i, "Target"],
  [/\bwhole\s*foods\b|\bwholefds\b|\bwfm\b/i, "Whole Foods"],
  [/\btrader\s*joe/i, "Trader Joe's"],
  [/\bsafeway\b/i, "Safeway"],
  [/\bkroger\b/i, "Kroger"],
  [/\bcvs\b/i, "CVS"],
  [/\bwalgreens\b/i, "Walgreens"],
  [/\bchipotle\b/i, "Chipotle"],
  [/\bmcdonald/i, "McDonald's"],
  [/\bvenmo\b/i, "Venmo"],
  [/\bzelle\b/i, "Zelle"],
  [/\bcash\s*app\b|\bsquare\s*cash\b/i, "Cash App"],
  [/\bairbnb\b/i, "Airbnb"],
  [/\bplanet\s*fitness\b|\bpf\s*club\b/i, "Planet Fitness"],
  [/\bequinox\b/i, "Equinox"],
  [/\bcomcast\b|\bxfinity\b/i, "Xfinity"],
  [/\bverizon\b/i, "Verizon"],
  [/\bt-?mobile\b/i, "T-Mobile"],
  [/\bat&t\b|\batt\s*\*?\s*bill/i, "AT&T"],
  [/\bpg&e\b|\bpgande\b/i, "PG&E"],
  [/\bcon\s*ed(?:ison)?\b/i, "Con Edison"],
  [/\bgeico\b/i, "GEICO"],
  [/\bbest\s*buy\b/i, "Best Buy"],
  [/\bhome\s*depot\b/i, "The Home Depot"],
  [/\bshell\s*(?:oil|service)?\b/i, "Shell"],
  [/\bchevron\b/i, "Chevron"],
];

const STATE = "(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)";

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b)
    .replace(/\b(Usa|Llc|Atm|Ach|Bp|Cvs|Ups|Usps|Dmv|Irs)\b/g, (w) => w.toUpperCase())
    .replace(/'S\b/g, "'s");
}

const CITY_PREFIX = /^(?:SAN|SANTA|LOS|LAS|NEW|ST|SAINT|FORT|FT|PALO|MOUNTAIN|MT|SOUTH|NORTH|WEST|EAST|EL|LA|REDWOOD|DALY|SALT|KANSAS|OKLAHOMA|JERSEY|BATON|CORPUS|COLORADO|GRAND|LONG|PORT|CEDAR|DES|SIOUX|ANN|BEVERLY|CULVER|MENLO|FOSTER|UNION|CHULA|HUNTINGTON|NEWPORT|PALM|WALNUT|SOUTHERN|DOWNERS|GLEN|OVERLAND|ELK|FALLS|BOWLING)$/;

/** Ordinary words that happen to end in a state code ("PIZZERIA", "COMPANY", "BODEGA"). */
const NOT_PLACE = /(?:COMPANY|ERIA|ARIA|ORIA|TECA|EGA|ACHI|ALIA|ARMACY)$/;

/**
 * Card descriptors end in a location: "TRADER JOE S SAN FRANCISCOCA" (city glued to the state)
 * or "BLUE BOTTLE COFFEE OAKLAND CA". Only applied to all-caps descriptors.
 */
function stripLocation(text: string): string {
  if (/[a-z]/.test(text)) return text;
  const words = text.split(" ");
  const glued = new RegExp(`^[A-Z]{3,}${STATE}$`);
  const state = new RegExp(`^${STATE}$`);
  const last = words.at(-1) ?? "";
  if (words.length >= 2 && state.test(last)) {
    words.pop();
    if (words.length >= 3) {
      words.pop();
      if (words.length >= 2 && CITY_PREFIX.test(words.at(-1)!)) words.pop();
    }
  } else if (words.length >= 2 && glued.test(last) && last.length >= 6 && !NOT_PLACE.test(last)) {
    words.pop();
    if (words.length >= 2 && CITY_PREFIX.test(words.at(-1)!)) words.pop();
  }
  return words.join(" ").trim();
}

/** Turns a raw bank descriptor into a readable merchant name. */
export function cleanMerchant(raw: string): string {
  const original = raw.replace(/\s+/g, " ").trim();
  if (!original) return "Unknown";
  for (const [pattern, name] of KNOWN) if (pattern.test(original)) return name;
  let text = original;
  for (let i = 0; i < 3; i++) {
    const before = text;
    for (const prefix of PREFIXES) text = text.replace(prefix, "");
    if (text === before) break;
  }
  text = text
    // Phone numbers, URLs left over from descriptors, store numbers and long reference digits.
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    // ACH trailers: "PPD ID: 1234567890", "WEB ID: …", "CO ID …", "INDN: …".
    .replace(/\s(?:ppd|ccd|web|tel|co|ach)\s+id:?.*$/i, "")
    .replace(/\s(?:indn|des|id):.*$/i, "")
    .replace(/\s#\s?\d+.*$/, "")
    .replace(/\s\*?\d{4,}.*$/, "")
    .replace(/\s(?:store|str|sto|unit|loc)\s*\d+.*$/i, "")
    // "TRADER JOE S" → "TRADER JOES" (the apostrophe was dropped by the bank).
    .replace(/\b([A-Za-z]{2,}) S\b/g, "$1'S");
  text = stripLocation(text.replace(/[*#]+/g, " ").replace(/\s{2,}/g, " ").trim());
  if (text.length < 2) text = original;
  const known = vendorByName(text);
  if (known) return known.name;
  return /[a-z]/.test(text) ? text : titleCase(text);
}

/** A stable grouping key for a merchant ("trader joe's" → "trader joe s"). */
export function merchantKey(merchant: string): string {
  return (normalizeName(merchant) || merchant.toLowerCase()).slice(0, 48);
}

export function merchantVendor(merchant: string): VendorDef | undefined {
  return vendorByName(merchant);
}

// ─── Categories ──────────────────────────────────────────────────────────────

const SUBSCRIPTION_KINDS = new Set<VendorKind>(["streaming", "music", "gaming", "news", "education", "fitness", "software", "ai", "cloud", "storage", "productivity", "dev", "domain", "vpn"]);
const BILL_KINDS = new Set<VendorKind>(["utility", "telecom", "internet", "insurance", "rent", "loan"]);

export function spendForVendorKind(kind: VendorKind | string | null | undefined): SpendCategory | null {
  if (!kind) return null;
  if (SUBSCRIPTION_KINDS.has(kind as VendorKind)) return "subscriptions";
  if (BILL_KINDS.has(kind as VendorKind)) return "bills";
  switch (kind) {
    case "shopping":
    case "marketplace":
      return "shopping";
    case "food":
    case "grocery":
    case "restaurant":
      return "food";
    case "airline":
    case "hotel":
    case "travel":
    case "car_rental":
      return "travel";
    case "transport":
      return "transport";
    case "health":
      return "health";
    case "events":
      return "entertainment";
    default:
      return null;
  }
}

export function isSubscriptionVendorKind(kind: string | null | undefined): boolean {
  return !!kind && SUBSCRIPTION_KINDS.has(kind as VendorKind);
}

export function isBillVendorKind(kind: string | null | undefined): boolean {
  return !!kind && BILL_KINDS.has(kind as VendorKind);
}

/** Bank-supplied categories (Teller, Capital One, Chase, Apple Card, Discover, Amex…) → ours. */
const BANK_CATEGORY: [RegExp, SpendCategory][] = [
  [/^(?:payment|payment\/credit|payments? and credits?|credit card payment|transfer|transfers)$/i, "transfers"],
  [/income|payroll|salary|paycheck|interest (?:earned|paid)|dividend/i, "income"],
  [/dining|restaurant|food|grocer|bar\b|coffee|fast food|alcohol/i, "food"],
  [/airfare|airline|lodging|hotel|travel|car rental|accommodation|vacation/i, "travel"],
  [/gas|fuel|automotive|auto\b|parking|transport|transit|taxi|rideshare|tolls?\b/i, "transport"],
  [/phone|cable|internet|utilit|insurance|rent|mortgage|bills?\b|home services/i, "bills"],
  [/health|medical|pharmacy|doctor|dental|fitness|gym|wellness|personal care/i, "health"],
  [/entertainment|movies?|music|games?|sport|recreation|hobbies/i, "entertainment"],
  [/subscriptions?|software|streaming|digital/i, "subscriptions"],
  [/merchandise|shopping|clothing|electronics|department|general merchandise|home improvement|home\b|office|gifts?|education|books?/i, "shopping"],
  [/fee|interest charge|finance charge|tax/i, "bills"],
];

export function spendFromBankCategory(category: string | null | undefined): SpendCategory | null {
  if (!category) return null;
  const value = category.trim();
  if (!value || /^(?:other|general|uncategorized|miscellaneous|services?|other services)$/i.test(value)) return null;
  for (const [pattern, spend] of BANK_CATEGORY) if (pattern.test(value)) return spend;
  return null;
}

const KEYWORD_CATEGORY: [RegExp, SpendCategory][] = [
  [/\b(?:restaurant|cafe|caf[eé]|coffee|espresso|bakery|pizza|pizzeria|grill|burger|taco|sushi|ramen|thai|kitchen|deli|diner|bistro|bar\b|pub\b|brewing|tea\b|boba|market|grocery|groceries|foods?\b|supermarket|bagel|donut|chick-?fil|wendy|subway|panera|dunkin|sweetgreen)\b/i, "food"],
  [/\b(?:parking|transit|metro|mta|bart|caltrain|clipper|toll|fastrak|ez-?pass|fuel|gas(?:oline)?\b|exxon|mobil|76\b|arco|valero|sunoco|citgo|marathon|speedway|wawa|lime\b|bird\b|citi ?bike|amtrak)\b/i, "transport"],
  [/\b(?:airlines?|airways|air lines|delta|united|southwest|jetblue|alaska air|american air|frontier|spirit|hotel|inn\b|resort|marriott|hilton|hyatt|ihg|expedia|booking\.com|hotels\.com|vrbo|hertz|avis|enterprise rent)\b/i, "travel"],
  [/\b(?:pharmacy|rx\b|dental|dentist|medical|clinic|hospital|health|doctor|optometr|vision|labcorp|quest diag|kaiser|one medical)\b/i, "health"],
  [/\b(?:cinema|theat(?:er|re)|amc\b|regal|ticketmaster|stubhub|eventbrite|steam(?:games)?|playstation|xbox|nintendo|museum|concert|bowling)\b/i, "entertainment"],
  [/\b(?:electric|water|utility|utilities|energy|power|gas & electric|internet|wireless|insurance|apartments?|property mgmt|rent\b|hoa\b|mortgage)\b/i, "bills"],
  [/\b(?:store|shop|outlet|mall|apparel|clothing|nike|adidas|uniqlo|zara|h&m|sephora|ulta|ikea|wayfair|etsy|ebay|lowe'?s|macy'?s|nordstrom|tj ?maxx|marshalls|apple store)\b/i, "shopping"],
];

export function spendFromKeywords(text: string): SpendCategory | null {
  for (const [pattern, spend] of KEYWORD_CATEGORY) if (pattern.test(text)) return spend;
  return null;
}

// ─── Money movement kind ─────────────────────────────────────────────────────

const CARD_ISSUER = /\b(?:capital ?one|cap ?one|chase|amex|american express|citi(?:bank|card)?|discover|barclay|synchrony|wells fargo card|bank of america|bk of amer|boa\b|apple ?card|gs bank|goldman sachs|us bank|usaa|bilt|credit one|card ?services?|cardmember)\b/i;
const PAYMENT_WORDS = /\b(?:payment|pymt|pmt|paymt|autopay|auto pay|auto-pay|epay|e-payment|online pay|mobile pay|crcardpmt|thank you|bill ?pay)\b/i;
const CARD_PAYMENT_DIRECT = /\b(?:crcardpmt|credit card (?:payment|pymt|pmt)|card ?pmt|cc ?pmt|cc payment)\b/i;
const OWN_TRANSFER = /\b(?:transfer|xfer|trnsfr|tfr)\b|\bwithdrawal (?:to|from)\b|\bdeposit from\b|\b360 (?:performance )?savings\b|\b360 checking\b|\bsavings\b.*\b(?:to|from)\b|\bto (?:checking|savings)\b|\bfrom (?:checking|savings)\b/i;
const P2P = /\b(?:zelle|venmo|cash ?app|square cash|paypal (?:transfer|inst xfer)|apple cash)\b/i;
const INCOME = /\b(?:payroll|direct ?dep(?:osit)?|dir dep|salary|paycheck|pay ?roll|ach credit|employer|treas 310|tax ref|irs treas|ssa treas|unemployment|interest (?:paid|earned|payment)|int(?:erest)? pd|dividend)\b/i;
const REFUND = /\b(?:refund|return(?:ed)?|reversal|chargeback|credit adj|merchant credit|cashback|cash back|reward(?:s)? (?:credit|redemption)|statement credit)\b/i;
const FEE = /\b(?:overdraft|nsf|insufficient funds|late (?:payment )?fee|annual (?:membership )?fee|foreign (?:transaction|txn|trans) fee|intl? (?:txn|transaction) fee|service (?:charge|fee)|monthly (?:maintenance |service )?fee|maintenance fee|returned (?:item|payment) fee|atm fee|cash advance fee|interest charge|finance charge|purchase interest|minimum interest)\b/i;

export interface ClassifyInput {
  description: string;
  merchant: string;
  /** Signed: negative = money left the account. */
  amount: number;
  accountType: FinAccountType;
  bankCategory?: string | null;
  bankType?: string | null;
  vendorKind?: string | null;
}

export interface Classification {
  kind: ChargeKind;
  direction: "in" | "out";
  spend: SpendCategory;
  /** Where the category came from: the bank's own category, the vendor directory, or keywords. */
  source: "bank" | "auto";
}

/** First-pass classification of one bank transaction. Merchant rules and AI refine it later. */
export function classifyTransaction(input: ClassifyInput): Classification {
  const out = input.amount < 0;
  const direction: "in" | "out" = out ? "out" : "in";
  const text = `${input.description} ${input.merchant}`;
  const isCredit = input.accountType === "credit" || input.accountType === "loan";
  const bankType = (input.bankType ?? "").toLowerCase();

  // Paying a card: the inflow on the card and the outflow from checking are both card payments,
  // never spending or income.
  if (isCredit && !out && (PAYMENT_WORDS.test(text) || bankType === "payment") && !REFUND.test(text)) {
    return { kind: "card_payment", direction, spend: "transfers", source: "auto" };
  }
  if (!isCredit && out && (CARD_PAYMENT_DIRECT.test(text) || (CARD_ISSUER.test(text) && PAYMENT_WORDS.test(text)))) {
    return { kind: "card_payment", direction, spend: "transfers", source: "auto" };
  }
  if (FEE.test(text) || bankType === "fee") {
    return { kind: "fee", direction, spend: out ? "bills" : "income", source: "auto" };
  }
  if (P2P.test(text)) {
    return { kind: out ? "transfer_out" : "transfer_in", direction, spend: "transfers", source: "auto" };
  }
  if (OWN_TRANSFER.test(text) && !INCOME.test(text)) {
    return { kind: out ? "transfer_out" : "transfer_in", direction, spend: "transfers", source: "auto" };
  }
  if (!out) {
    if (REFUND.test(text) || isCredit) return { kind: "refund", direction, spend: guessSpend(input) ?? "other", source: "auto" };
    if (INCOME.test(text) || bankType === "deposit" || bankType === "interest" || bankType === "dividend") return { kind: "deposit", direction, spend: "income", source: "auto" };
    return { kind: "deposit", direction, spend: "income", source: "auto" };
  }
  const fromBank = spendFromBankCategory(input.bankCategory);
  const spend = guessSpend(input) ?? "other";
  if (isSubscriptionVendorKind(input.vendorKind)) return { kind: "subscription", direction, spend: "subscriptions", source: "auto" };
  if (isBillVendorKind(input.vendorKind) || bankType === "bill_payment") return { kind: "bill_payment", direction, spend: "bills", source: "auto" };
  return { kind: "purchase", direction, spend, source: fromBank && spend === fromBank && !spendForVendorKind(input.vendorKind) ? "bank" : "auto" };
}

function guessSpend(input: ClassifyInput): SpendCategory | null {
  // Specific words in the descriptor ("RENT", "PHARMACY") beat a bank's broad bucket ("Home", "Merchandise").
  return spendForVendorKind(input.vendorKind) ?? spendFromKeywords(`${input.merchant} ${input.description}`) ?? spendFromBankCategory(input.bankCategory);
}

/** Whether a description looks like paying off a card (used to pick a statement's sign convention). */
export function looksLikeCardPayment(description: string): boolean {
  return PAYMENT_WORDS.test(description) && !REFUND.test(description);
}
