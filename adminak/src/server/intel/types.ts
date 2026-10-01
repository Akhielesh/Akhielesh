import type { BillingCycle, Category, LinkRef } from "../../shared/types.js";

/** Normalized email handed to the intelligence engine by every provider. */
export interface IncomingEmail {
  providerId: string;
  threadId?: string | null;
  messageId?: string | null;
  from: { name: string | null; address: string | null };
  to: string[];
  subject: string;
  date: Date;
  text: string;
  html?: string | null;
  headers: Record<string, string>;
  attachments: { filename: string; contentType: string; size: number }[];
  labels: string[];
}

export interface MoneyMention {
  amount: number;
  currency: string;
  index: number;
  raw: string;
  label: string;
  score: number;
}

export type DateKind =
  | "renewal"
  | "trial_end"
  | "due"
  | "statement"
  | "delivery"
  | "departure"
  | "arrival"
  | "checkin"
  | "checkout"
  | "interview"
  | "event"
  | "appointment"
  | "effective"
  | "expiry"
  | "pickup"
  | "unknown";

export interface DateMention {
  kind: DateKind;
  at: Date;
  allDay: boolean;
  text: string;
  index: number;
}

export interface VendorMatch {
  slug: string;
  name: string;
  domain: string | null;
  kind: string | null;
  category: Category | null;
  manageUrl: string | null;
  color: string | null;
  known: boolean;
  /** Processor or marketplace that sent the email on behalf of the merchant (Stripe, PayPal, App Store…). */
  via?: string;
  product?: { key: string; name: string } | null;
}

export interface Classification {
  category: Category;
  subtype: string;
  confidence: number;
  reasons: string[];
  scores: Partial<Record<Category, number>>;
}

export interface Analysis {
  category: Category;
  subtype: string;
  confidence: number;
  importance: number;
  reasons: string[];
  vendor: VendorMatch | null;
  amounts: MoneyMention[];
  primaryAmount: MoneyMention | null;
  dates: DateMention[];
  cycle: BillingCycle | null;
  plan: string | null;
  paymentMethod: string | null;
  priceChange: { from: number; to: number; currency: string; effectiveAt: Date | null } | null;
  links: LinkRef[];
  unsubscribeUrl: string | null;
  data: Record<string, unknown>;
  summary: string;
  /** Text after cleaning (used for search storage); OTP codes are redacted. */
  cleanText: string;
  snippet: string;
}

export interface AnalyzeOptions {
  /** User's default currency used for ambiguous "$" amounts. */
  currency: string;
  timeZone: string;
  ownerName?: string;
  ownerEmails?: string[];
}
