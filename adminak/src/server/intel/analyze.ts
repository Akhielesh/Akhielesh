import type { BillingCycle, Category } from "../../shared/types.js";
import { cycleShort, formatDate, formatMoney } from "../../shared/format.js";
import { classify } from "./classify.js";
import { detectCycle, detectPriceChange, extractAccountHint, extractPaymentMethod, extractPlan } from "./extract/billing.js";
import { extractDates, firstDate } from "./extract/dates.js";
import { extractCareer, extractOrder, extractSecurity, extractTravel } from "./extract/entities.js";
import { extractAmounts, pickPrimary } from "./extract/money.js";
import { bodyText, extractLinks, redactOtp, snippetOf, unsubscribeUrl } from "./text.js";
import type { Analysis, AnalyzeOptions, DateMention, IncomingEmail, MoneyMention, VendorMatch } from "./types.js";
import { cleanSenderName, resolveVendor, vendorByName } from "./vendor-resolve.js";

const IMPORTANCE: Record<string, number> = {
  "subscriptions:payment_failed": 92,
  "subscriptions:price_change": 78,
  "subscriptions:trial_ending": 82,
  "subscriptions:trial_started": 55,
  "subscriptions:renewal_notice": 65,
  "subscriptions:cancelled": 45,
  "subscriptions:started": 60,
  "subscriptions:receipt": 42,
  "subscriptions:plan_changed": 50,
  "bills:overdue": 95,
  "bills:due_reminder": 80,
  "bills:statement": 62,
  "bills:payment_confirmation": 40,
  "bills:autopay_scheduled": 45,
  "finance:fraud_alert": 98,
  "finance:low_balance": 85,
  "finance:transaction": 50,
  "finance:deposit": 50,
  "finance:transfer_in": 45,
  "finance:transfer_out": 40,
  "finance:investment": 40,
  "finance:tax_document": 70,
  "finance:credit_score": 50,
  "finance:refund": 45,
  "security:suspicious_activity": 96,
  "security:breach_notice": 94,
  "security:account_locked": 85,
  "security:password_changed": 75,
  "security:mfa_change": 75,
  "security:email_changed": 75,
  "security:new_signin": 62,
  "security:password_reset": 55,
  "security:verification_code": 20,
  "orders:delayed": 60,
  "orders:out_for_delivery": 55,
  "orders:delivered": 40,
  "orders:shipped": 38,
  "orders:order_placed": 35,
  "orders:return": 40,
  "travel:flight_change": 90,
  "travel:checkin": 72,
  "travel:flight": 70,
  "travel:hotel": 60,
  "travel:car_rental": 55,
  "travel:ride": 25,
  "travel:train": 60,
  "career:offer": 97,
  "career:interview_request": 90,
  "career:assessment": 80,
  "career:rejection": 55,
  "career:application_update": 65,
  "career:application_received": 45,
  "career:recruiter_outreach": 60,
  "career:job_alert": 15,
  "career:networking": 25,
  "events:ticket": 55,
  "events:invitation": 55,
  "events:reservation": 55,
  "events:reminder": 45,
  "health:appointment": 72,
  "health:results": 70,
  "health:prescription": 55,
  "health:claim": 45,
  "personal:message": 65,
  "updates:dev_alert": 55,
  "updates:account_notice": 25,
  "updates:policy": 10,
  "updates:product_update": 10,
  "newsletters:newsletter": 10,
  "promotions:promotion": 4,
  "social:notification": 12,
};

const CATEGORY_BASE: Record<Category, number> = {
  subscriptions: 35,
  bills: 45,
  finance: 40,
  orders: 25,
  security: 45,
  travel: 45,
  career: 40,
  events: 35,
  health: 45,
  personal: 60,
  newsletters: 10,
  promotions: 4,
  social: 10,
  updates: 15,
  other: 15,
};

function money(m: MoneyMention | null | undefined): string {
  return m ? formatMoney(m.amount, m.currency) : "";
}

function dateText(d: DateMention | null | undefined, timeZone: string): string {
  if (!d) return "";
  return d.allDay ? formatDate(d.at.toISOString(), timeZone, "monthDay") : formatDate(d.at.toISOString(), timeZone, "datetime");
}

function displayName(vendor: VendorMatch | null, fromName: string | null): string {
  if (vendor?.product) return vendor.product.name;
  if (vendor) return vendor.name;
  return cleanSenderName(fromName) ?? fromName ?? "Unknown sender";
}

function extractMerchant(text: string, primary: MoneyMention | null): string | null {
  const zone = primary ? text.slice(Math.max(0, primary.index - 120), primary.index + 160) : text.slice(0, 600);
  const match =
    /\b(?:at|to|with|merchant:?|from)\s+([A-Z0-9][A-Z0-9*&'.#\- ]{2,40}?)(?=\s+(?:on|for|was|has|using|with|in|at)\b|[.,?!;\n]|\s{2,}|$)/.exec(zone) ??
    /\bmerchant(?: name)?\s*[:\-]\s*([^\n]{2,40})/i.exec(zone);
  if (!match) return null;
  const value = match[1]!.replace(/\s+/g, " ").replace(/[*#]+\w*$/, "").trim();
  if (/^(your|the|a|an|card|account|you|us|this|our)\b/i.test(value) || value.length < 2) return null;
  return value;
}

function extractCounterparty(text: string): string | null {
  const sent = /\b([A-Z][\w.'’-]+(?:\s[A-Z][\w.'’-]+){0,3})\s+(?:sent you|paid you|has sent you)\b/.exec(text);
  if (sent) return sent[1]!;
  const from = /\b(?:payment|money|transfer|deposit) from\s+([A-Z][\w&.'’-]+(?:\s[A-Z][\w&.'’-]+){0,3})/.exec(text);
  return from?.[1] ?? null;
}

/** Infers a billing cycle from the gap (in days) between a charge and the next renewal. */
export function cycleFromGap(days: number): BillingCycle | null {
  if (days >= 5 && days <= 9) return "weekly";
  if (days >= 25 && days <= 35) return "monthly";
  if (days >= 84 && days <= 96) return "quarterly";
  if (days >= 175 && days <= 190) return "semiannual";
  if (days >= 350 && days <= 380) return "annual";
  return null;
}

function prettyMerchant(value: string): string {
  if (value.length > 3 && value === value.toUpperCase() && /[A-Z]/.test(value)) {
    return value.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return value;
}

function cyclePhrase(cycle: BillingCycle | null): string {
  return cycle && cycle !== "unknown" ? cycleShort(cycle) : "";
}

export function analyzeEmail(email: IncomingEmail, opts: AnalyzeOptions): Analysis {
  const rawText = bodyText(email.text, email.html);
  const subject = (email.subject ?? "").replace(/\s+/g, " ").trim();
  const vendor = resolveVendor({ fromName: email.from.name, fromAddress: email.from.address, subject, text: rawText });
  const amounts = extractAmounts(rawText, opts.currency, subject);
  const classification = classify({
    subject,
    text: rawText,
    fromName: email.from.name,
    fromAddress: email.from.address,
    headers: email.headers,
    attachments: email.attachments,
    vendor,
    amountCount: amounts.length,
  });
  const { category, subtype } = classification;
  const fullText = `${subject}\n${rawText}`;
  const dates = extractDates(fullText, { reference: email.date, timeZone: opts.timeZone });
  const links = extractLinks(email.html, rawText);
  const unsubscribe = unsubscribeUrl(email.headers["list-unsubscribe"]);

  const data: Record<string, unknown> = {};
  let primary: MoneyMention | null = null;
  let cycle: BillingCycle | null = null;
  let plan: string | null = null;
  let paymentMethod: string | null = null;
  let priceChange: Analysis["priceChange"] = null;
  const tz = opts.timeZone;
  const name = displayName(vendor, email.from.name);
  let summary = subject || "(no subject)";

  switch (category) {
    case "subscriptions": {
      primary =
        subtype === "payment_failed"
          ? pickPrimary(amounts, ["due", "payment", "charged", "total", "price"])
          : pickPrimary(amounts, ["total", "charged", "payment", "price", "new_price", "due"]);
      priceChange = subtype === "price_change" || subtype === "renewal_notice" ? detectPriceChange(fullText, amounts, dates) : null;
      if (priceChange && subtype === "price_change") {
        primary = amounts.find((a) => a.amount === priceChange!.to) ?? primary;
      }
      cycle = detectCycle(fullText, primary ? primary.index : undefined);
      plan = extractPlan(fullText);
      paymentMethod = extractPaymentMethod(fullText);
      const renewal = firstDate(dates, ["renewal", "due", "effective"], { after: email.date });
      const trialEnd = firstDate(dates, ["trial_end"]) ?? (subtype === "trial_ending" || subtype === "trial_started" ? firstDate(dates, ["renewal", "effective", "unknown"], { after: email.date }) : null);
      if (!cycle && renewal && (subtype === "receipt" || subtype === "renewal_notice" || subtype === "started")) {
        cycle = cycleFromGap((renewal.at.getTime() - email.date.getTime()) / 86400000);
      }
      const amountText = primary ? `${money(primary)}${cyclePhrase(cycle)}` : "";
      data.name = name;
      data.renewalAt = renewal?.at.toISOString() ?? null;
      data.trialEndsAt = trialEnd?.at.toISOString() ?? null;
      switch (subtype) {
        case "receipt":
          summary = `${name}${amountText ? ` — ${amountText} charged` : " — payment received"}`;
          break;
        case "renewal_notice":
          summary = `${name} renews${renewal ? ` ${dateText(renewal, tz)}` : " soon"}${amountText ? ` — ${amountText}` : ""}`;
          break;
        case "trial_ending":
          summary = `${name} trial ends${trialEnd ? ` ${dateText(trialEnd, tz)}` : " soon"}${amountText ? ` — then ${amountText}` : ""}`;
          break;
        case "trial_started":
          summary = `${name} trial started${trialEnd ? ` — ends ${dateText(trialEnd, tz)}` : ""}`;
          break;
        case "price_change":
          summary = priceChange
            ? `${name} price ${formatMoney(priceChange.from, priceChange.currency)} → ${formatMoney(priceChange.to, priceChange.currency)}${cyclePhrase(cycle)}`
            : `${name} is changing its price${amountText ? ` to ${amountText}` : ""}`;
          break;
        case "payment_failed":
          summary = `${name} payment failed${amountText ? ` — ${amountText}` : ""}`;
          break;
        case "cancelled":
          summary = `${name} subscription cancelled`;
          break;
        case "started":
          summary = `New subscription: ${name}${amountText ? ` — ${amountText}` : ""}`;
          break;
        case "plan_changed":
          summary = `${name} plan changed${plan ? ` to ${plan}` : ""}${amountText ? ` — ${amountText}` : ""}`;
          break;
        default:
          summary = `${name}: ${subject}`;
      }
      break;
    }
    case "bills": {
      const due = pickPrimary(amounts, ["due", "balance", "total"]);
      const minimum = amounts.find((a) => a.label === "minimum") ?? null;
      const balance = amounts.find((a) => a.label === "balance") ?? null;
      primary = subtype === "payment_confirmation" ? pickPrimary(amounts, ["payment", "charged", "total"]) : due;
      paymentMethod = extractPaymentMethod(fullText);
      const dueDate = firstDate(dates, ["due", "effective", "renewal"], { after: new Date(email.date.getTime() - 3 * 86400000) });
      const autopay = /\b(auto-?pay|automatic payment|automatically (deducted|debited|paid|drafted))\b/i.test(fullText) && !/\b(enroll in|set up|sign up for|turn on) auto-?pay\b/i.test(fullText);
      data.amountDue = due?.amount ?? null;
      data.minimumDue = minimum?.amount ?? null;
      data.statementBalance = balance?.amount ?? null;
      data.dueAt = dueDate?.at.toISOString() ?? null;
      data.accountHint = extractAccountHint(fullText);
      data.autopay = autopay;
      data.name = name;
      const dueText = dueDate ? ` due ${dateText(dueDate, tz)}` : "";
      switch (subtype) {
        case "statement":
          summary = `${name} statement${primary ? ` — ${money(primary)}` : ""}${dueText}`;
          break;
        case "due_reminder":
          summary = `${name} payment${primary ? ` of ${money(primary)}` : ""}${dueText || " due soon"}`;
          break;
        case "overdue":
          summary = `${name} payment is overdue${primary ? ` — ${money(primary)}` : ""}`;
          break;
        case "payment_confirmation":
          summary = `${name} payment received${primary ? ` — ${money(primary)}` : ""}`;
          break;
        case "autopay_scheduled":
          summary = `${name} autopay scheduled${primary ? ` — ${money(primary)}` : ""}${dueText ? ` for${dueText.replace(" due", "")}` : ""}`;
          break;
        default:
          summary = `${name}: ${subject}`;
      }
      break;
    }
    case "finance": {
      primary = pickPrimary(amounts, ["payment", "charged", "total", "amount"]);
      paymentMethod = extractPaymentMethod(fullText);
      const merchant = subtype === "transaction" || subtype === "fraud_alert" ? extractMerchant(fullText, primary) : null;
      const counterparty = subtype === "transfer_in" || subtype === "transfer_out" || subtype === "deposit" ? extractCounterparty(fullText) : null;
      const merchantVendor = merchant ? vendorByName(merchant) : undefined;
      data.merchant = merchantVendor?.name ?? (merchant ? prettyMerchant(merchant) : null);
      data.merchantSlug = merchantVendor?.slug ?? null;
      data.counterparty = counterparty;
      data.institution = vendor?.name ?? null;
      const amt = money(primary);
      switch (subtype) {
        case "transaction":
          summary = `${amt || "Charge"}${data.merchant ? ` at ${data.merchant}` : ""}${paymentMethod ? ` · ${paymentMethod}` : ""}`;
          break;
        case "fraud_alert":
          summary = `${name} fraud alert${amt ? ` — ${amt}` : ""}${data.merchant ? ` at ${data.merchant}` : ""}`;
          break;
        case "deposit":
          summary = `Deposit${amt ? ` of ${amt}` : ""}${counterparty ? ` from ${counterparty}` : vendor ? ` · ${name}` : ""}`;
          break;
        case "transfer_in":
          summary = `Received ${amt || "money"}${counterparty ? ` from ${counterparty}` : ""}${vendor ? ` via ${name}` : ""}`;
          break;
        case "transfer_out":
          summary = `Sent ${amt || "money"}${counterparty ? ` to ${counterparty}` : ""}${vendor ? ` via ${name}` : ""}`;
          break;
        case "low_balance":
          summary = `${name}: low balance${amt ? ` (${amt})` : ""}`;
          break;
        case "investment":
          summary = `${name} — investment activity${amt ? ` · ${amt}` : ""}`;
          break;
        case "tax_document":
          summary = `${name} — tax document ready`;
          break;
        case "credit_score":
          summary = `${name} — credit report changed`;
          break;
        case "refund":
          summary = `Refund${amt ? ` of ${amt}` : ""} from ${name}`;
          break;
        default:
          summary = `${name}: ${subject}`;
      }
      break;
    }
    case "orders": {
      const order = extractOrder(rawText, subject);
      primary = subtype === "order_placed" ? pickPrimary(amounts, ["total", "charged", "payment"]) : null;
      const delivery = firstDate(dates, ["delivery"], { after: new Date(email.date.getTime() - 86400000) });
      Object.assign(data, order, { deliveryAt: delivery?.at.toISOString() ?? null, merchant: name });
      const label: Record<string, string> = {
        order_placed: "order placed",
        shipped: "shipped",
        out_for_delivery: "out for delivery",
        delivered: "delivered",
        delayed: "delivery delayed",
        return: "return update",
      };
      summary = `${name} — ${label[subtype] ?? subject}${order.orderNumber ? ` · #${order.orderNumber}` : ""}${subtype === "shipped" && delivery ? ` · arrives ${dateText(delivery, tz)}` : ""}${primary ? ` · ${money(primary)}` : ""}`;
      break;
    }
    case "security": {
      const sec = extractSecurity(rawText);
      Object.assign(data, sec, { service: name });
      const where = [sec.device, sec.browser].filter(Boolean).join(" · ");
      const label: Record<string, string> = {
        suspicious_activity: "suspicious activity",
        breach_notice: "data breach notice",
        new_signin: "new sign-in",
        password_changed: "password changed",
        password_reset: "password reset requested",
        verification_code: "verification code",
        mfa_change: "two-factor settings changed",
        account_locked: "account locked",
        email_changed: "contact details changed",
      };
      summary = `${name} — ${label[subtype] ?? "security notice"}${where ? ` (${where}${sec.location ? `, ${sec.location}` : ""})` : sec.location ? ` (${sec.location})` : ""}`;
      break;
    }
    case "travel": {
      const travel = extractTravel(rawText, subject);
      primary = pickPrimary(amounts, ["total", "charged", "payment"]);
      const depart = firstDate(dates, ["departure"]) ?? null;
      const checkin = firstDate(dates, ["checkin", "pickup"]);
      const checkout = firstDate(dates, ["checkout"]);
      Object.assign(data, travel, {
        departAt: depart?.at.toISOString() ?? null,
        departAllDay: depart?.allDay ?? null,
        checkIn: checkin?.at.toISOString() ?? null,
        checkOut: checkout?.at.toISOString() ?? null,
        provider: name,
      });
      const when = subtype === "hotel" || subtype === "car_rental" ? checkin : depart ?? checkin ?? firstDate(dates, ["unknown", "event"], { after: email.date });
      if (when && !data.departAt && subtype !== "hotel" && subtype !== "car_rental") data.departAt = when.at.toISOString();
      const what =
        subtype === "hotel"
          ? `stay${travel.hotel ? ` at ${travel.hotel}` : ""}`
          : subtype === "car_rental"
            ? "car rental"
            : subtype === "ride"
              ? "ride"
              : subtype === "flight_change"
                ? "flight change"
                : subtype === "checkin"
                  ? "check-in open"
                  : `${travel.flights[0] ? `flight ${travel.flights[0]}` : "trip"}`;
      summary = `${name} — ${what}${travel.route ? ` ${travel.route.from} → ${travel.route.to}` : ""}${when ? ` · ${dateText(when, tz)}` : ""}${subtype === "ride" && primary ? ` · ${money(primary)}` : ""}`;
      break;
    }
    case "career": {
      const isPlatform = !!vendor && ["jobs", "ats", "assessment", "social"].includes(vendor.kind ?? "");
      const career = extractCareer(rawText, subject, email.from.name, vendor?.name ?? null, isPlatform);
      const at = firstDate(dates, ["interview", "event", "appointment", "unknown"], { after: email.date });
      const stage: Record<string, string> = {
        application_received: "applied",
        application_update: "in_review",
        interview_request: "interviewing",
        assessment: "assessment",
        offer: "offer",
        rejection: "rejected",
        recruiter_outreach: "outreach",
        job_alert: "alert",
        networking: "network",
      };
      Object.assign(data, career, {
        stage: stage[subtype] ?? "other",
        at: subtype === "interview_request" || subtype === "assessment" ? (at?.at.toISOString() ?? null) : null,
        recruiter: subtype === "recruiter_outreach" || subtype === "interview_request" ? cleanSenderName(email.from.name) : null,
      });
      const company = career.company ?? (isPlatform ? null : name);
      const label: Record<string, string> = {
        application_received: "application received",
        application_update: "application update",
        interview_request: "interview",
        assessment: "assessment",
        offer: "offer 🎉",
        rejection: "application closed",
        recruiter_outreach: "recruiter reached out",
        job_alert: "job recommendations",
        networking: "network activity",
      };
      summary = `${company ?? name} — ${label[subtype] ?? subject}${career.role ? ` · ${career.role}` : ""}${data.at ? ` · ${dateText(at, tz)}` : ""}`;
      break;
    }
    case "events": {
      const at = firstDate(dates, ["event", "unknown", "checkin"], { after: new Date(email.date.getTime() - 86400000) });
      data.at = at?.at.toISOString() ?? null;
      data.allDay = at?.allDay ?? null;
      data.title = subject.replace(/^(invitation|updated invitation|accepted|declined|reminder):\s*/i, "").replace(/\s*@.*$/, "");
      summary = `${data.title}${at ? ` · ${dateText(at, tz)}` : ""}`;
      break;
    }
    case "health": {
      const at = firstDate(dates, ["appointment", "event", "unknown"], { after: email.date });
      data.at = at?.at.toISOString() ?? null;
      data.provider = name;
      const label: Record<string, string> = { appointment: "appointment", prescription: "prescription update", results: "results available", claim: "claim update" };
      summary = `${name} — ${label[subtype] ?? "health update"}${at && subtype === "appointment" ? ` · ${dateText(at, tz)}` : ""}`;
      break;
    }
    case "personal": {
      summary = `${cleanSenderName(email.from.name) ?? email.from.address ?? "Someone"}: ${subject || "(no subject)"}`;
      break;
    }
    case "updates": {
      summary = vendor ? `${name}: ${subject}` : subject;
      break;
    }
    default:
      summary = vendor && category !== "other" ? `${name}: ${subject}` : subject || "(no subject)";
  }

  // Importance 0-100.
  let importance = IMPORTANCE[`${category}:${subtype}`] ?? CATEGORY_BASE[category];
  if (primary && ["subscriptions", "bills", "finance"].includes(category)) importance += Math.min(10, Math.log10(Math.max(1, primary.amount)) * 3);
  const soonest = dates.find((d) => d.at.getTime() > email.date.getTime() && d.at.getTime() - email.date.getTime() < 3 * 86400000 && d.kind !== "unknown");
  if (soonest && classification.confidence > 0.3) importance += 6;
  importance = Math.max(0, Math.min(100, Math.round(importance * (0.75 + classification.confidence * 0.25))));

  const otp = category === "security" && subtype === "verification_code" ? redactOtp(rawText) : { text: rawText, redacted: false };
  if (otp.redacted) data.otpRedacted = true;

  return {
    category,
    subtype,
    confidence: classification.confidence,
    importance,
    reasons: classification.reasons,
    vendor,
    amounts,
    primaryAmount: primary,
    dates,
    cycle,
    plan,
    paymentMethod,
    priceChange,
    links,
    unsubscribeUrl: unsubscribe,
    data: { ...data, scores: classification.scores },
    summary: summary.replace(/\s+/g, " ").trim().slice(0, 240),
    cleanText: otp.text,
    snippet: snippetOf(otp.text),
  };
}
