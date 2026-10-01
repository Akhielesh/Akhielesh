// Shared domain model + API contracts used by both the server and the web app.

export const CATEGORIES = [
  "subscriptions",
  "bills",
  "finance",
  "orders",
  "security",
  "travel",
  "career",
  "events",
  "health",
  "personal",
  "newsletters",
  "promotions",
  "social",
  "updates",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

export const BILLING_CYCLES = ["weekly", "monthly", "quarterly", "semiannual", "annual", "unknown"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const SUBSCRIPTION_STATUSES = ["active", "trial", "past_due", "paused", "cancelled", "lapsed"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ALERT_STATUSES = ["new", "read", "snoozed", "done"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const BILL_STATUSES = ["due", "scheduled", "paid", "overdue"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const BILL_KINDS = [
  "credit_card",
  "utility",
  "phone",
  "internet",
  "insurance",
  "rent",
  "loan",
  "tax",
  "subscription",
  "other",
] as const;
export type BillKind = (typeof BILL_KINDS)[number];

export const CHARGE_KINDS = [
  "subscription",
  "purchase",
  "bill_payment",
  "refund",
  "deposit",
  "transfer_in",
  "transfer_out",
  "fee",
] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

export const SPEND_CATEGORIES = [
  "subscriptions",
  "shopping",
  "food",
  "travel",
  "transport",
  "bills",
  "health",
  "entertainment",
  "income",
  "transfers",
  "other",
] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export type ProviderKind = "gmail" | "imap" | "demo" | "webhook";
export type AccountStatus = "active" | "paused" | "error";

export const CHANNEL_TYPES = ["email", "push", "ntfy", "slack", "discord", "telegram", "webhook"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type NotificationKind = "instant" | "digest" | "weekly" | "monthly" | "test" | "system";

export interface Fact {
  label: string;
  value: string;
}

export interface MoneyTotal {
  currency: string;
  amount: number;
}

export interface LinkRef {
  kind: string;
  label: string;
  url: string;
}

export interface VendorRef {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  kind: string | null;
  color: string | null;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  profile: {
    name: string;
    timezone: string;
    currency: string;
    locale: string;
  };
  scanning: {
    intervalMinutes: number;
    backfillDays: number;
    maxBackfillMessages: number;
    storeBodies: boolean;
    bodyRetentionDays: number;
    ignoreSenders: string[];
  };
  notifications: {
    instantMinSeverity: Severity | "off";
    quietHours: { enabled: boolean; start: string; end: string };
    digest: { enabled: boolean; time: string };
    weekly: { enabled: boolean; day: number; time: string };
    monthly: { enabled: boolean; time: string };
    reminders: { renewalDays: number; annualRenewalDays: number; trialDays: number; billDays: number };
    largeTransactionThreshold: number;
    loginAlerts: boolean;
    typeOverrides: Record<string, { enabled?: boolean; severity?: Severity }>;
  };
  ai: {
    enabled: boolean;
    mode: "smart" | "all";
    dailyLimit: number;
    briefing: boolean;
  };
  gmail: {
    applyLabels: boolean;
    labelPrefix: string;
  };
}

export type SettingsPatch = {
  [K in keyof Settings]?: Partial<Settings[K]>;
};

// ─── Alerts ──────────────────────────────────────────────────────────────────

export interface MessageRef {
  id: number;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  receivedAt: string;
}

export interface AlertDTO {
  id: number;
  type: string;
  category: Category;
  severity: Severity;
  title: string;
  body: string | null;
  facts: Fact[];
  status: AlertStatus;
  dueAt: string | null;
  snoozedUntil: string | null;
  notifiedAt: string | null;
  createdAt: string;
  actionUrl: string | null;
  actionLabel: string | null;
  entityType: string | null;
  entityId: number | null;
  vendor: VendorRef | null;
  message: MessageRef | null;
}

export interface AlertCounts {
  new: number;
  snoozed: number;
  done: number;
  bySeverity: Record<Severity, number>;
  byCategory: Partial<Record<Category, number>>;
}

// ─── Money ───────────────────────────────────────────────────────────────────

export interface PriceChange {
  from: number;
  to: number;
  currency: string;
  at: string;
}

export interface SubscriptionDTO {
  id: number;
  key: string;
  name: string;
  plan: string | null;
  kind: string | null;
  vendor: VendorRef | null;
  amount: number | null;
  currency: string | null;
  cycle: BillingCycle;
  monthlyCost: number | null;
  nextAmount: number | null;
  status: SubscriptionStatus;
  startedAt: string | null;
  trialEndsAt: string | null;
  nextRenewalAt: string | null;
  lastChargedAt: string | null;
  cancelledAt: string | null;
  paymentMethod: string | null;
  manageUrl: string | null;
  source: "detected" | "manual";
  notes: string | null;
  muted: boolean;
  confidence: number;
  chargeCount: number;
  totalSpent: number;
  priceChange: PriceChange | null;
}

export interface SubscriptionEventDTO {
  id: number;
  type: string;
  amount: number | null;
  oldAmount: number | null;
  currency: string | null;
  cycle: string | null;
  plan: string | null;
  occurredAt: string;
  effectiveAt: string | null;
  messageId: number | null;
}

export interface ChargeDTO {
  id: number;
  description: string;
  amount: number;
  currency: string;
  direction: "in" | "out";
  kind: ChargeKind;
  spendCategory: SpendCategory;
  status: "posted" | "failed" | "pending" | "refunded";
  paymentMethod: string | null;
  occurredAt: string;
  vendor: VendorRef | null;
  subscriptionId: number | null;
  billId: number | null;
  messageId: number | null;
  source: "email" | "manual";
}

export interface SubscriptionDetailDTO extends SubscriptionDTO {
  events: SubscriptionEventDTO[];
  charges: ChargeDTO[];
  messages: MessageListItem[];
  priceHistory: { at: string; amount: number }[];
}

export interface BillDTO {
  id: number;
  name: string;
  kind: BillKind;
  vendor: VendorRef | null;
  amountDue: number | null;
  minimumDue: number | null;
  statementBalance: number | null;
  currency: string | null;
  dueAt: string | null;
  statementAt: string | null;
  status: BillStatus;
  autopay: boolean;
  accountHint: string | null;
  paidAt: string | null;
  paidAmount: number | null;
  payUrl: string | null;
  notes: string | null;
  source: "detected" | "manual";
  messageId: number | null;
}

export interface SavingsInsight {
  id: string;
  kind: "duplicate" | "price_increase" | "annual_switch" | "trial" | "lapsed" | "failed_payment";
  title: string;
  detail: string;
  amount: number | null;
  currency: string | null;
  subscriptionIds: number[];
}

export interface MonthlySpend {
  month: string; // YYYY-MM
  label: string;
  out: number;
  in: number;
  subscriptions: number;
  byCategory: Partial<Record<SpendCategory, number>>;
}

export interface MerchantTotal {
  name: string;
  vendor: VendorRef | null;
  total: number;
  count: number;
}

export interface MoneyDTO {
  baseCurrency: string;
  bills: BillDTO[];
  billsSummary: { dueCount: number; dueTotal: MoneyTotal[]; overdueCount: number; autopayCount: number };
  charges: ChargeDTO[];
  monthly: MonthlySpend[];
  topMerchants: MerchantTotal[];
  spendByCategory: { category: SpendCategory; total: number }[];
  incomeLast30: MoneyTotal[];
  documents: InsightDTO[];
  financeEvents: InsightDTO[];
}

// ─── Insights / domains ──────────────────────────────────────────────────────

export interface InsightDTO {
  id: number;
  category: Category;
  type: string;
  title: string;
  summary: string | null;
  amount: number | null;
  currency: string | null;
  occursAt: string | null;
  status: string | null;
  groupKey: string | null;
  data: Record<string, unknown>;
  links: LinkRef[];
  archived: boolean;
  occurredAt: string;
  vendor: VendorRef | null;
  messageId: number | null;
}

export interface DomainStat {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  hint?: string;
}

export interface InsightGroup {
  key: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  latestAt: string;
  nextAt: string | null;
  items: InsightDTO[];
}

export interface DomainDTO {
  domain: string;
  stats: DomainStat[];
  upcoming: InsightDTO[];
  groups: InsightGroup[];
  recent: InsightDTO[];
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export type TimelineKind =
  | "renewal"
  | "trial_end"
  | "bill_due"
  | "delivery"
  | "flight"
  | "stay"
  | "interview"
  | "event"
  | "appointment"
  | "deadline";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  title: string;
  subtitle: string | null;
  at: string;
  allDay: boolean;
  amount: number | null;
  currency: string | null;
  category: Category;
  severity: Severity | null;
  href: string | null;
  vendor: VendorRef | null;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface MessageListItem {
  id: number;
  accountId: number;
  subject: string;
  snippet: string;
  fromName: string | null;
  fromEmail: string | null;
  receivedAt: string;
  category: Category;
  subtype: string | null;
  confidence: number;
  importance: number;
  summary: string | null;
  vendor: VendorRef | null;
  hasAttachments: boolean;
  userCategory: Category | null;
  aiEnriched: boolean;
}

export interface AnalysisDTO {
  reasons: string[];
  amounts: { amount: number; currency: string; label: string; raw: string }[];
  dates: { kind: string; at: string; text: string }[];
  cycle: BillingCycle | null;
  plan: string | null;
  paymentMethod: string | null;
  data: Record<string, unknown>;
  links: LinkRef[];
  unsubscribeUrl: string | null;
  ai: { summary?: string; action?: string | null } | null;
}

export interface MessageDetailDTO extends MessageListItem {
  bodyText: string | null;
  toEmail: string | null;
  labels: string[];
  attachments: { filename: string; contentType: string; size: number }[];
  account: { id: number; label: string; email: string } | null;
  analysis: AnalysisDTO;
  insights: InsightDTO[];
  alerts: AlertDTO[];
}

export interface SenderSummary {
  fromEmail: string;
  fromName: string | null;
  domain: string;
  count: number;
  lastAt: string;
  category: Category;
  unsubscribeUrl: string | null;
  muted: boolean;
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface OverviewDTO {
  generatedAt: string;
  name: string;
  baseCurrency: string;
  kpis: {
    monthlySubscriptions: MoneyTotal[];
    activeSubscriptions: number;
    trials: number;
    dueNext7: { count: number; total: MoneyTotal[] };
    openAlerts: { total: number; critical: number; high: number };
    spendThisMonth: MoneyTotal[];
    spendLastMonth: MoneyTotal[];
    incomeThisMonth: MoneyTotal[];
    emailsAnalyzed: number;
    emailsToday: number;
  };
  spendTrend: MonthlySpend[];
  spendByCategory: { category: SpendCategory; total: number }[];
  attention: AlertDTO[];
  upcoming: TimelineItem[];
  savings: SavingsInsight[];
  career: { active: number; applied: number; interviewing: number; offers: number; rejected: number };
  deliveries: InsightDTO[];
  security: { recent: InsightDTO[]; openCritical: number };
  sync: SyncHealth;
  briefing: { text: string; generatedAt: string; source: "ai" | "rules" } | null;
  categoryCounts: Partial<Record<Category, number>>;
}

export interface SyncHealth {
  accounts: number;
  activeAccounts: number;
  errorAccounts: number;
  lastSyncAt: string | null;
  syncing: boolean;
  nextSyncAt: string | null;
}

// ─── Accounts / sync ────────────────────────────────────────────────────────

export interface AccountDTO {
  id: number;
  provider: ProviderKind;
  label: string;
  email: string;
  status: AccountStatus;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  messageCount: number;
  backfillDone: boolean;
  syncing: boolean;
  progress: { phase: string; done: number; total: number } | null;
  settings: {
    host?: string;
    port?: number;
    secure?: boolean;
    folders?: string[];
    backfillDays?: number;
    applyLabels?: boolean;
    scopes?: string[];
  };
  createdAt: string;
}

export interface SyncRunDTO {
  id: number;
  accountId: number | null;
  accountLabel: string | null;
  trigger: string;
  status: "running" | "ok" | "error";
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  newMessages: number;
  alertsCreated: number;
  error: string | null;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export const RULE_FIELDS = [
  "from",
  "fromName",
  "fromDomain",
  "subject",
  "body",
  "any",
  "category",
  "vendor",
  "amount",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPERATORS = [
  "contains",
  "not_contains",
  "equals",
  "starts_with",
  "ends_with",
  "matches",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export interface RuleCondition {
  field: RuleField;
  op: RuleOperator;
  value: string;
}

export interface RuleActions {
  alert?: boolean;
  severity?: Severity;
  title?: string;
  category?: Category;
  ignore?: boolean;
}

export interface RuleDTO {
  id: number;
  name: string;
  enabled: boolean;
  match: "all" | "any";
  conditions: RuleCondition[];
  actions: RuleActions;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
}

export interface SenderOverrideDTO {
  id: number;
  pattern: string;
  category: Category | null;
  ignore: boolean;
  createdAt: string;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface ChannelEvents {
  instant: boolean;
  digest: boolean;
  weekly: boolean;
  monthly: boolean;
  system: boolean;
}

export interface ChannelDTO {
  id: number;
  type: ChannelType;
  name: string;
  enabled: boolean;
  minSeverity: Severity;
  events: ChannelEvents;
  target: string;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface NotificationLogDTO {
  id: number;
  channelId: number | null;
  channelType: string;
  channelName: string | null;
  kind: NotificationKind;
  subject: string;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  attempts: number;
  alertCount: number;
  createdAt: string;
  sentAt: string | null;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  subject: string;
}

// ─── System ─────────────────────────────────────────────────────────────────

export interface SystemStatusDTO {
  version: string;
  startedAt: string;
  now: string;
  dataDir: string;
  dbSizeBytes: number;
  counts: Record<string, number>;
  integrations: {
    smtp: boolean;
    gmailApi: boolean;
    ai: boolean;
    aiModel: string;
    push: boolean;
    appUrl: string;
  };
  jobs: { name: string; lastRunAt: string | null; lastStatus: string | null; lastError: string | null; durationMs: number | null }[];
  ai: { callsToday: number; inputTokensToday: number; outputTokensToday: number; limit: number };
}

export interface AuthState {
  setupRequired: boolean;
  authenticated: boolean;
  user: { id: number; email: string; name: string; totpEnabled: boolean } | null;
  demoAvailable: boolean;
}

export interface AskResponse {
  answer: string;
  sources: MessageRef[];
  mode: "ai" | "search";
}
