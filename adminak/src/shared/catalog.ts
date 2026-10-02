import type { BillingCycle, Category, Severity, SpendCategory } from "./types.js";

export interface CategoryMeta {
  label: string;
  description: string;
  /** Whether this category represents something worth surfacing as "intelligence". */
  signal: boolean;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  subscriptions: { label: "Subscriptions", description: "Recurring charges, renewals, trials and price changes", signal: true },
  bills: { label: "Bills", description: "Statements, due dates, autopay and payment confirmations", signal: true },
  finance: { label: "Finance", description: "Bank alerts, deposits, transfers, investments and tax documents", signal: true },
  orders: { label: "Orders", description: "Purchases, shipments, deliveries and returns", signal: true },
  security: { label: "Security", description: "Sign-ins, password changes, breaches and suspicious activity", signal: true },
  travel: { label: "Travel", description: "Flights, stays, rentals and itinerary changes", signal: true },
  career: { label: "Career", description: "Applications, interviews, offers and recruiter outreach", signal: true },
  events: { label: "Events", description: "Invitations, tickets and reservations", signal: true },
  health: { label: "Health", description: "Appointments, prescriptions, results and claims", signal: true },
  personal: { label: "People", description: "Emails from real people", signal: true },
  newsletters: { label: "Newsletters", description: "Editorial newsletters and digests", signal: false },
  promotions: { label: "Promotions", description: "Marketing, sales and offers", signal: false },
  social: { label: "Social", description: "Social network notifications", signal: false },
  updates: { label: "Updates", description: "Account notices, product updates and developer alerts", signal: false },
  other: { label: "Other", description: "Everything else", signal: false },
};

export const SEVERITY_META: Record<Severity, { label: string; description: string }> = {
  critical: { label: "Critical", description: "Needs action now — failed payments, fraud, suspicious sign-ins" },
  high: { label: "High", description: "Act within days — price hikes, trials ending, bills due" },
  medium: { label: "Medium", description: "Good to know soon — renewals, statements, new sign-ins" },
  low: { label: "Low", description: "FYI — deliveries, receipts, routine updates" },
  info: { label: "Info", description: "Background activity" },
};

export interface AlertTypeMeta {
  label: string;
  category: Category;
  severity: Severity;
  description: string;
}

export const ALERT_TYPES: Record<string, AlertTypeMeta> = {
  "subscription.new": { label: "New subscription", category: "subscriptions", severity: "medium", description: "A new recurring charge or membership was detected" },
  "subscription.renewal": { label: "Upcoming renewal", category: "subscriptions", severity: "medium", description: "A subscription renews soon" },
  "subscription.price_increase": { label: "Price increase", category: "subscriptions", severity: "high", description: "A subscription is getting more expensive" },
  "subscription.price_decrease": { label: "Price decrease", category: "subscriptions", severity: "low", description: "A subscription got cheaper" },
  "subscription.trial_ending": { label: "Trial ending", category: "subscriptions", severity: "high", description: "A free trial is about to convert to paid" },
  "subscription.trial_started": { label: "Trial started", category: "subscriptions", severity: "low", description: "A free trial began" },
  "subscription.payment_failed": { label: "Payment failed", category: "subscriptions", severity: "critical", description: "A subscription payment was declined" },
  "subscription.cancelled": { label: "Cancelled", category: "subscriptions", severity: "low", description: "A subscription was cancelled" },
  "bill.due": { label: "Bill due", category: "bills", severity: "high", description: "A bill or statement payment is due soon" },
  "bill.overdue": { label: "Bill overdue", category: "bills", severity: "critical", description: "A bill is past due" },
  "bill.statement": { label: "New statement", category: "bills", severity: "low", description: "A new statement or bill is available" },
  "finance.large_transaction": { label: "Large transaction", category: "finance", severity: "high", description: "A charge above your threshold" },
  "finance.fraud": { label: "Fraud alert", category: "finance", severity: "critical", description: "Your bank flagged unusual activity" },
  "finance.low_balance": { label: "Low balance", category: "finance", severity: "high", description: "An account balance is low" },
  "finance.deposit": { label: "Deposit", category: "finance", severity: "low", description: "Money arrived (payroll, deposits)" },
  "finance.transfer": { label: "Money received", category: "finance", severity: "low", description: "Someone sent you money" },
  "finance.refund": { label: "Refund", category: "finance", severity: "low", description: "A refund was issued" },
  "finance.tax_document": { label: "Tax document", category: "finance", severity: "medium", description: "A tax form is available" },
  "finance.credit": { label: "Credit report change", category: "finance", severity: "medium", description: "Your credit report or score changed" },
  "finance.fee": { label: "Bank fee", category: "finance", severity: "high", description: "Your bank charged an overdraft, late, foreign-transaction or interest fee" },
  "finance.duplicate_charge": { label: "Possible double charge", category: "finance", severity: "high", description: "The same merchant charged the same amount twice within two days" },
  "finance.high_utilization": { label: "High card utilization", category: "finance", severity: "medium", description: "A card balance passed your share-of-limit threshold" },
  "security.suspicious": { label: "Suspicious activity", category: "security", severity: "critical", description: "A provider flagged suspicious account activity" },
  "security.breach": { label: "Data breach", category: "security", severity: "critical", description: "Your data appeared in a breach" },
  "security.new_signin": { label: "New sign-in", category: "security", severity: "medium", description: "A new device or location signed in" },
  "security.password_changed": { label: "Password changed", category: "security", severity: "high", description: "A password was changed" },
  "security.password_reset": { label: "Password reset", category: "security", severity: "medium", description: "A password reset was requested" },
  "security.account_locked": { label: "Account locked", category: "security", severity: "high", description: "An account was locked or restricted" },
  "security.mfa_change": { label: "2FA change", category: "security", severity: "high", description: "Two-factor settings changed" },
  "order.out_for_delivery": { label: "Out for delivery", category: "orders", severity: "low", description: "A package arrives today" },
  "order.delivered": { label: "Delivered", category: "orders", severity: "low", description: "A package was delivered" },
  "order.delayed": { label: "Delivery issue", category: "orders", severity: "medium", description: "A shipment is delayed or failed" },
  "travel.upcoming": { label: "Upcoming trip", category: "travel", severity: "medium", description: "A flight or stay is coming up" },
  "travel.change": { label: "Itinerary change", category: "travel", severity: "high", description: "A flight was delayed, cancelled or changed" },
  "travel.checkin": { label: "Check-in open", category: "travel", severity: "medium", description: "Online check-in is available" },
  "career.offer": { label: "Offer", category: "career", severity: "high", description: "A job offer arrived" },
  "career.interview": { label: "Interview", category: "career", severity: "high", description: "An interview invitation or schedule" },
  "career.assessment": { label: "Assessment", category: "career", severity: "medium", description: "A coding challenge or assessment" },
  "career.update": { label: "Application update", category: "career", severity: "medium", description: "Movement on an application" },
  "career.rejection": { label: "Application closed", category: "career", severity: "low", description: "An application was declined" },
  "career.recruiter": { label: "Recruiter outreach", category: "career", severity: "low", description: "A recruiter reached out" },
  "events.upcoming": { label: "Upcoming event", category: "events", severity: "low", description: "An event, ticket or reservation is coming up" },
  "health.appointment": { label: "Appointment", category: "health", severity: "medium", description: "A medical appointment is scheduled" },
  "health.update": { label: "Health update", category: "health", severity: "low", description: "Prescriptions, results and claims" },
  "dev.failure": { label: "Build / deploy failure", category: "updates", severity: "medium", description: "A deploy, build or CI run failed" },
  "rule.match": { label: "Custom rule", category: "other", severity: "medium", description: "One of your rules matched" },
  "system.sync_error": { label: "Mailbox needs attention", category: "updates", severity: "high", description: "A connected mailbox failed to sync" },
  "system.bank_error": { label: "Bank connection needs attention", category: "finance", severity: "high", description: "A connected bank stopped refreshing" },
  "system.login": { label: "Console sign-in", category: "security", severity: "medium", description: "Someone signed in to Adminak" },
};

export const SPEND_CATEGORY_META: Record<SpendCategory, { label: string }> = {
  subscriptions: { label: "Subscriptions" },
  shopping: { label: "Shopping" },
  food: { label: "Food & delivery" },
  travel: { label: "Travel" },
  transport: { label: "Rides & transport" },
  bills: { label: "Bills & utilities" },
  health: { label: "Health" },
  entertainment: { label: "Entertainment" },
  income: { label: "Income" },
  transfers: { label: "Transfers" },
  other: { label: "Other" },
};

export const CYCLE_META: Record<BillingCycle, { label: string; short: string; perMonth: number }> = {
  weekly: { label: "Weekly", short: "/wk", perMonth: 52 / 12 },
  monthly: { label: "Monthly", short: "/mo", perMonth: 1 },
  quarterly: { label: "Quarterly", short: "/qtr", perMonth: 1 / 3 },
  semiannual: { label: "Every 6 months", short: "/6mo", perMonth: 1 / 6 },
  annual: { label: "Yearly", short: "/yr", perMonth: 1 / 12 },
  unknown: { label: "Unknown cycle", short: "", perMonth: 1 },
};

export const CYCLE_DAYS: Record<Exclude<BillingCycle, "unknown">, number> = {
  weekly: 7,
  monthly: 30.44,
  quarterly: 91.31,
  semiannual: 182.62,
  annual: 365.25,
};
