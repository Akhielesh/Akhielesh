import type { AlertDTO, TemplateInfo, TimelineItem } from "../../../shared/types.js";
import {
  renderAlertsEmail,
  renderDigestEmail,
  renderLoginEmail,
  renderReportEmail,
  renderTestEmail,
  renderWelcomeEmail,
  type EmailContent,
  type TemplateEnv,
} from "./emails.js";

const DAY = 86400000;

function sampleAlert(env: TemplateEnv, id: number, partial: Partial<AlertDTO> & Pick<AlertDTO, "type" | "severity" | "title" | "category">): AlertDTO {
  return {
    id,
    body: null,
    facts: [],
    status: "new",
    dueAt: null,
    snoozedUntil: null,
    notifiedAt: null,
    createdAt: env.now.toISOString(),
    actionUrl: null,
    actionLabel: null,
    entityType: null,
    entityId: null,
    vendor: null,
    message: null,
    ...partial,
  };
}

function iso(env: TemplateEnv, days: number, noon = true): string {
  const d = new Date(env.now.getTime() + days * DAY);
  if (noon) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)).toISOString();
  return d.toISOString();
}

export function sampleAlerts(env: TemplateEnv): Record<string, AlertDTO> {
  return {
    renewal: sampleAlert(env, 101, {
      type: "subscription.renewal",
      severity: "medium",
      category: "subscriptions",
      title: "Netflix renews in 3 days — $17.99/mo",
      body: "Cancel before then if you don't need it.",
      dueAt: iso(env, 3),
      facts: [
        { label: "Service", value: "Netflix" },
        { label: "Price", value: "$17.99/mo" },
        { label: "Payment method", value: "Visa •• 4242" },
      ],
      actionUrl: "https://www.netflix.com/account",
      actionLabel: "Manage",
      message: { id: 1, subject: "Your Netflix receipt", fromName: "Netflix", fromEmail: "info@account.netflix.com", receivedAt: iso(env, -27, false) },
    }),
    trial: sampleAlert(env, 102, {
      type: "subscription.trial_ending",
      severity: "high",
      category: "subscriptions",
      title: "Adobe trial ends tomorrow — then $69.99/mo",
      body: "Cancel before it ends if you don't want to be charged.",
      dueAt: iso(env, 1),
      facts: [
        { label: "Service", value: "Adobe Creative Cloud Pro" },
        { label: "Then", value: "$69.99/mo" },
      ],
      actionUrl: "https://account.adobe.com/plans",
      actionLabel: "Cancel or manage",
    }),
    bill: sampleAlert(env, 103, {
      type: "bill.due",
      severity: "high",
      category: "bills",
      title: "Con Edison — $86.40 due in 2 days",
      body: "Pay on time to avoid late fees.",
      dueAt: iso(env, 2),
      facts: [
        { label: "Biller", value: "Con Edison ••0042" },
        { label: "Amount due", value: "$86.40" },
        { label: "Autopay", value: "Off" },
      ],
      actionUrl: "https://www.coned.com/",
      actionLabel: "Pay",
    }),
    price: sampleAlert(env, 104, {
      type: "subscription.price_increase",
      severity: "high",
      category: "subscriptions",
      title: "Spotify price increase: $11.99 → $12.99/mo",
      body: `Takes effect on your next billing date.`,
      dueAt: iso(env, 9),
      facts: [
        { label: "Service", value: "Spotify Premium" },
        { label: "Price", value: "$12.99/mo" },
        { label: "Effective", value: "next billing date" },
      ],
    }),
    failed: sampleAlert(env, 105, {
      type: "subscription.payment_failed",
      severity: "critical",
      category: "subscriptions",
      title: "ChatGPT payment failed — $20.00",
      body: "Update your payment method or the service may be paused.",
      facts: [
        { label: "Service", value: "ChatGPT Plus" },
        { label: "Payment method", value: "Visa •• 4242" },
      ],
      actionUrl: "https://chatgpt.com/#settings/Subscription",
      actionLabel: "Update payment",
    }),
    security: sampleAlert(env, 106, {
      type: "security.suspicious",
      severity: "critical",
      category: "security",
      title: "Instagram — suspicious login blocked (Android, Lagos, Nigeria)",
      body: "If this wasn't you, change your password and review active sessions immediately.",
      facts: [
        { label: "Account", value: "Instagram" },
        { label: "Device", value: "Android · Chrome" },
        { label: "Location", value: "Lagos, Nigeria" },
      ],
      actionUrl: "https://www.instagram.com/accounts/password/change/",
      actionLabel: "Secure your account",
    }),
    fraud: sampleAlert(env, 107, {
      type: "finance.fraud",
      severity: "critical",
      category: "finance",
      title: "Capital One fraud alert — $1,299.00 at Electronics Hub",
      body: "Your bank flagged a transaction. Confirm or deny it from the bank's app.",
      facts: [
        { label: "Amount", value: "$1,299.00" },
        { label: "Merchant", value: "Electronics Hub" },
        { label: "Card", value: "Venture •• 1188" },
      ],
    }),
    interview: sampleAlert(env, 108, {
      type: "career.interview",
      severity: "high",
      category: "career",
      title: "Notion — technical interview · Product Engineer",
      body: "Reply with your availability or pick a slot.",
      dueAt: iso(env, 2, false),
      facts: [
        { label: "Company", value: "Notion" },
        { label: "Role", value: "Product Engineer" },
        { label: "Contact", value: "Priya Shah" },
      ],
      actionUrl: "https://meet.google.com/abc-defg-hij",
      actionLabel: "Join meeting",
    }),
    delivery: sampleAlert(env, 109, {
      type: "order.out_for_delivery",
      severity: "low",
      category: "orders",
      title: "UPS — out for delivery · #113-4422918-5530011",
      facts: [
        { label: "Carrier", value: "UPS" },
        { label: "Tracking", value: "1Z999AA10123456784" },
      ],
      actionUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
      actionLabel: "Track",
    }),
  };
}

function sampleTimeline(env: TemplateEnv): TimelineItem[] {
  const item = (days: number, kind: TimelineItem["kind"], title: string, amount: number | null, subtitle: string | null = null): TimelineItem => ({
    id: `${kind}-${days}`,
    kind,
    title,
    subtitle,
    at: iso(env, days),
    allDay: true,
    amount,
    currency: amount !== null ? "USD" : null,
    category: kind === "bill_due" ? "bills" : kind === "renewal" || kind === "trial_end" ? "subscriptions" : kind === "flight" ? "travel" : "career",
    severity: null,
    href: null,
    vendor: null,
  });
  return [
    item(1, "trial_end", "Adobe trial ends", 69.99, "Then $69.99/mo"),
    item(2, "bill_due", "Con Edison ••0042 due", 86.4),
    item(2, "interview", "Notion — technical interview", null, "2:00 PM"),
    item(3, "renewal", "Netflix renews", 17.99, "Monthly"),
    item(5, "renewal", "GitHub Copilot renews", 100, "Yearly"),
    item(6, "flight", "United UA 1549 EWR → SFO", null, "7:05 AM"),
  ];
}

export const TEMPLATES: (TemplateInfo & { render: (env: TemplateEnv) => EmailContent })[] = [
  {
    id: "alert-renewal",
    name: "Renewal reminder",
    description: "Sent a few days before a subscription renews (annual plans get a longer heads-up).",
    subject: "[Adminak] Netflix renews in 3 days — $17.99/mo",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).renewal!]),
  },
  {
    id: "alert-trial",
    name: "Trial ending",
    description: "Warns before a free trial converts to a paid plan, with a cancel link.",
    subject: "[Adminak] Adobe trial ends tomorrow",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).trial!]),
  },
  {
    id: "alert-bill",
    name: "Bill due",
    description: "Statement amount and due date for credit cards, utilities, phone, insurance and more.",
    subject: "[Adminak] Con Edison — $86.40 due in 2 days",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).bill!]),
  },
  {
    id: "alert-price",
    name: "Price increase",
    description: "Detected from price-change notices or a higher-than-usual charge.",
    subject: "[Adminak] Spotify price increase",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).price!]),
  },
  {
    id: "alert-failed",
    name: "Payment failed",
    description: "Critical: a subscription payment was declined.",
    subject: "[Adminak] Critical: ChatGPT payment failed",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).failed!]),
  },
  {
    id: "alert-security",
    name: "Security alert",
    description: "Suspicious sign-ins, breaches and account changes — with a what-to-do checklist.",
    subject: "[Adminak] Critical: suspicious login blocked",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).security!]),
  },
  {
    id: "alert-career",
    name: "Interview / offer",
    description: "Career milestones: interviews, assessments and offers.",
    subject: "[Adminak] Notion — technical interview",
    render: (env) => renderAlertsEmail(env, [sampleAlerts(env).interview!]),
  },
  {
    id: "alert-batch",
    name: "Multiple alerts",
    description: "When several alerts arrive together they're bundled into one email, most severe first.",
    subject: "[Adminak] 4 new alerts (2 critical)",
    render: (env) => {
      const a = sampleAlerts(env);
      return renderAlertsEmail(env, [a.fraud!, a.failed!, a.trial!, a.delivery!]);
    },
  },
  {
    id: "digest",
    name: "Daily brief",
    description: "Every morning: what needs attention, what's coming up this week, and what happened since yesterday.",
    subject: "[Adminak] Daily brief",
    render: (env) => {
      const a = sampleAlerts(env);
      return renderDigestEmail(env, {
        alerts: [a.fraud!, a.failed!, a.trial!, a.bill!, a.interview!],
        upcoming: sampleTimeline(env),
        kpis: {
          openAlerts: 9,
          critical: 2,
          dueThisWeek: [{ currency: "USD", amount: 274.38 }],
          dueCount: 4,
          subscriptionsMonthly: [{ currency: "USD", amount: 164.91 }],
          spentThisMonth: [{ currency: "USD", amount: 2310.55 }],
        },
        activity: [
          { category: "orders", count: 4, examples: ["UPS — out for delivery", "Amazon — shipped"] },
          { category: "finance", count: 3, examples: ["Deposit of $4,312.88 · Gusto", "Received $45.00 from Rahul Mehta"] },
          { category: "career", count: 2, examples: ["Ramp — recruiter reached out"] },
        ],
        briefing:
          "Two things need you today: ChatGPT's payment failed and Capital One flagged a $1,299 charge. Adobe's trial converts tomorrow at $69.99/mo, and Con Edison is due Friday. Subscriptions are running $164.91/mo — Netflix went up $2.50 this month.",
        emailsScanned: 37,
      });
    },
  },
  {
    id: "weekly",
    name: "Weekly report",
    description: "Monday morning recap: spending by category, subscription changes, the next two weeks and life admin.",
    subject: "[Adminak] Weekly report",
    render: (env) =>
      renderReportEmail(env, {
        period: "weekly",
        label: "Last 7 days",
        spent: [{ currency: "USD", amount: 1186.4 }],
        spentPrevious: [{ currency: "USD", amount: 1322.1 }],
        income: [{ currency: "USD", amount: 4312.88 }],
        byCategory: [
          { label: "Shopping", amount: 502.47, currency: "USD" },
          { label: "Bills & utilities", amount: 328.58, currency: "USD" },
          { label: "Subscriptions", amount: 165.97, currency: "USD" },
          { label: "Food & delivery", amount: 102.6, currency: "USD" },
          { label: "Rides & transport", amount: 86.78, currency: "USD" },
        ],
        subscriptionsMonthly: [{ currency: "USD", amount: 164.91 }],
        subscriptionCount: 10,
        changes: [
          { kind: "price", text: "Netflix: $15.49 → $17.99" },
          { kind: "trial", text: "Adobe trial started" },
          { kind: "failed", text: "ChatGPT payment failed" },
        ],
        upcoming: sampleTimeline(env),
        career: { active: 4, interviews: 2, offers: 1, applied: 2 },
        security: { events: 5, critical: 1 },
        topMerchants: [
          { name: "Best Buy", amount: 412.5, currency: "USD" },
          { name: "Amazon", amount: 89.97, currency: "USD" },
          { name: "Whole Foods Market", amount: 64.2, currency: "USD" },
        ],
        alerts: { total: 21, critical: 4 },
        briefing: null,
      }),
  },
  {
    id: "monthly",
    name: "Monthly review",
    description: "First of the month: the full picture of last month with comparisons.",
    subject: "[Adminak] September in review",
    render: (env) =>
      renderReportEmail(env, {
        period: "monthly",
        label: "Last month",
        spent: [{ currency: "USD", amount: 5480.12 }],
        spentPrevious: [{ currency: "USD", amount: 5012.3 }],
        income: [{ currency: "USD", amount: 8625.76 }],
        byCategory: [
          { label: "Bills & utilities", amount: 3678.58, currency: "USD" },
          { label: "Shopping", amount: 812.4, currency: "USD" },
          { label: "Subscriptions", amount: 186.94, currency: "USD" },
          { label: "Travel", amount: 701.6, currency: "USD" },
        ],
        subscriptionsMonthly: [{ currency: "USD", amount: 164.91 }],
        subscriptionCount: 10,
        changes: [
          { kind: "new", text: "Vercel Pro started — $20.00" },
          { kind: "cancelled", text: "Disney+ cancelled" },
        ],
        upcoming: sampleTimeline(env),
        career: { active: 4, interviews: 2, offers: 1, applied: 2 },
        security: { events: 9, critical: 2 },
        topMerchants: [{ name: "Bilt Rewards", amount: 3450, currency: "USD" }],
        alerts: { total: 64, critical: 7 },
        briefing: null,
      }),
  },
  {
    id: "test",
    name: "Test notification",
    description: "What the 'Send test' button delivers.",
    subject: "[Adminak] Notifications are working ✅",
    render: (env) => renderTestEmail(env, "you@example.com"),
  },
  {
    id: "welcome",
    name: "Welcome",
    description: "Sent once after setup with the four steps to get going.",
    subject: "[Adminak] Welcome — your console is ready",
    render: (env) => renderWelcomeEmail(env),
  },
  {
    id: "login",
    name: "Console sign-in",
    description: "Security notice whenever someone signs in to Adminak (optional).",
    subject: "[Adminak] New sign-in to your console",
    render: (env) => renderLoginEmail(env, { ip: "203.0.113.24", userAgent: "Safari on iPhone", at: env.now.toISOString() }),
  },
];
