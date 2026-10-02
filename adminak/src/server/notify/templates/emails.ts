import { ALERT_TYPES, CATEGORY_META } from "../../../shared/catalog.js";
import { daysUntil, formatDate, formatTotals, humanizeDay } from "../../../shared/format.js";
import type { AlertDTO, Category, MoneyTotal, Severity, TimelineItem } from "../../../shared/types.js";
import { SEVERITY_RANK } from "../../../shared/types.js";
import {
  badge,
  barRows,
  button,
  C,
  callout,
  card,
  chip,
  divider,
  esc,
  eyebrow,
  facts,
  footer,
  h1,
  h2,
  kpis,
  layout,
  listRows,
  p,
  SEVERITY_STYLE,
  textFacts,
  type ListRow,
} from "./kit.js";

export interface EmailContent {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export interface TemplateEnv {
  appUrl: string;
  timeZone: string;
  name: string;
  now: Date;
}

const SUBJECT_PREFIX = "[Adminak]";

function alertLink(env: TemplateEnv, alert: AlertDTO): string {
  return `${env.appUrl}/alerts?focus=${alert.id}`;
}

function countdown(env: TemplateEnv, iso: string | null): string | null {
  if (!iso) return null;
  const days = daysUntil(iso, env.timeZone, env.now);
  if (days < -1) return `${-days} days ago`;
  if (days === -1) return "yesterday";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function factValue(alert: AlertDTO, labels: string[]): string | null {
  for (const label of labels) {
    const hit = alert.facts.find((f) => f.label.toLowerCase() === label.toLowerCase());
    if (hit?.value) return hit.value;
  }
  return null;
}

type HeroKind = "money" | "security" | "career" | "travel" | "system" | "generic";

function heroKind(alert: AlertDTO): HeroKind {
  if (alert.type.startsWith("security.") || alert.type === "system.login" || alert.type === "finance.fraud") return "security";
  if (alert.type === "system.sync_error") return "system";
  if (alert.type.startsWith("career.")) return "career";
  if (alert.type.startsWith("travel.")) return "travel";
  if (alert.type.startsWith("subscription.") || alert.type.startsWith("bill.") || alert.type.startsWith("finance.")) return "money";
  return "generic";
}

const SECURITY_STEPS: Record<string, string[]> = {
  default: [
    "Open the provider's app or website directly (not links in unexpected emails).",
    "Review recent sign-ins and active devices; sign out anything unfamiliar.",
    "Change the password if anything looks wrong, and keep two-factor authentication on.",
  ],
  "finance.fraud": [
    "Open your bank's app directly and confirm or deny the transaction.",
    "If it wasn't you, lock or freeze the card from the app.",
    "Call the number on the back of your card — never one from the email.",
  ],
  "security.breach": [
    "Change the password for the breached service.",
    "Change it anywhere else you reused the same password.",
    "Enable two-factor authentication and consider a password manager.",
  ],
};

function heroBlock(env: TemplateEnv, alert: AlertDTO): string {
  const kind = heroKind(alert);
  if (kind === "money") {
    const amount = factValue(alert, ["Amount due", "Price", "Amount", "Then"]);
    const when = alert.dueAt ? countdown(env, alert.dueAt) : null;
    const whenLabel =
      alert.type === "subscription.renewal"
        ? "Renews"
        : alert.type === "subscription.trial_ending"
          ? "Trial ends"
          : alert.type.startsWith("bill.")
            ? "Due"
            : alert.type === "subscription.price_increase" || alert.type === "subscription.price_decrease"
              ? "Effective"
              : null;
    if (!amount && !when) return "";
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>
${amount ? `<td class="stack" style="vertical-align:bottom;padding-right:18px;"><div class="muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">Amount</div><div class="hero-num ink" style="font-size:38px;line-height:44px;font-weight:700;letter-spacing:-0.03em;color:${C.ink};">${esc(amount)}</div></td>` : ""}
${when && whenLabel ? `<td class="stack" style="vertical-align:bottom;"><div class="muted" style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${whenLabel}</div><div class="ink" style="font-size:20px;line-height:28px;font-weight:700;color:${SEVERITY_STYLE[alert.severity].text};">${esc(when)}</div><div class="muted" style="font-size:13px;color:${C.muted};">${esc(formatDate(alert.dueAt!, env.timeZone, "long"))}</div></td>` : ""}
</tr></table>`;
  }
  if (kind === "security") {
    const steps = SECURITY_STEPS[alert.type] ?? SECURITY_STEPS.default!;
    return callout(`<ol style="margin:0;padding-left:18px;">${steps.map((s) => `<li style="margin:4px 0;">${esc(s)}</li>`).join("")}</ol>`, "What to do");
  }
  if (kind === "career") {
    const when = alert.dueAt ? `${formatDate(alert.dueAt, env.timeZone, "long")}${alert.dueAt.endsWith("T12:00:00.000Z") ? "" : ` · ${formatDate(alert.dueAt, env.timeZone, "time")}`}` : null;
    return when ? callout(`<strong>${esc(when)}</strong> (${esc(countdown(env, alert.dueAt) ?? "")}). It's on your Adminak timeline.`, "When") : "";
  }
  if (kind === "system") {
    return callout("Scanning for this mailbox is paused until it's reconnected. Your existing data is safe.", "Heads up");
  }
  return "";
}

function sourceLine(env: TemplateEnv, alert: AlertDTO): string {
  if (!alert.message) return "";
  return p(
    `Detected in “${esc(alert.message.subject)}” from ${esc(alert.message.fromName ?? alert.message.fromEmail ?? "unknown sender")} · ${esc(formatDate(alert.message.receivedAt, env.timeZone, "datetime"))}`,
    { muted: true, size: 12, margin: "16px 0 0" },
  );
}

function alertCard(env: TemplateEnv, alert: AlertDTO): string {
  const meta = ALERT_TYPES[alert.type];
  const inner = `${badge(alert.severity)} ${chip(meta?.label ?? CATEGORY_META[alert.category]?.label ?? "Alert")}
<div class="ink" style="font-size:16px;font-weight:700;line-height:1.4;color:${C.ink};margin-top:10px;">${esc(alert.title)}</div>
${alert.body ? p(esc(alert.body), { size: 14 }) : ""}
${facts(alert.facts.slice(0, 4))}
<div style="margin-top:12px;">${button(alert.actionLabel ?? "Open", alert.actionUrl, { secondary: true })}${button("View in Adminak", alertLink(env, alert), { secondary: true })}</div>`;
  return card(inner, { padding: "20px 22px" });
}

export function renderAlertsEmail(env: TemplateEnv, alerts: AlertDTO[]): EmailContent {
  const sorted = [...alerts].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const top = sorted[0]!;
  const reason = "You're receiving this because instant alerts are on for this severity.";
  if (sorted.length === 1) {
    const alert = top;
    const meta = ALERT_TYPES[alert.type];
    const subject = `${SUBJECT_PREFIX} ${alert.severity === "critical" ? "Critical: " : ""}${alert.title}`;
    const body =
      card(
        `${badge(alert.severity)} ${chip(meta?.label ?? "Alert")}
<div style="height:12px;"></div>
${h1(alert.title)}
${alert.body ? p(esc(alert.body)) : ""}
${heroBlock(env, alert)}
${facts(alert.facts)}
<div style="margin-top:18px;">${button(alert.actionLabel ?? "Open", alert.actionUrl)}${button("View in Adminak", alertLink(env, alert), { secondary: !!alert.actionUrl })}</div>
${sourceLine(env, alert)}`,
      ) +
      card(
        `<div class="muted" style="font-size:13px;line-height:1.6;color:${C.muted};">Snooze, dismiss or mute alerts like this from the alert page. You can tune what reaches your inbox under <a href="${esc(env.appUrl)}/notifications" style="color:${C.link};">Notifications</a>.</div>`,
        { padding: "16px 22px" },
      );
    const html = layout({ title: alert.title, preheader: alert.body ?? meta?.description ?? alert.title, body, footer: footer(env.appUrl, reason), appUrl: env.appUrl });
    const text = [
      `${SEVERITY_STYLE[alert.severity].label.toUpperCase()} · ${meta?.label ?? "Alert"}`,
      "",
      alert.title,
      alert.body ?? "",
      "",
      textFacts(alert.facts),
      "",
      alert.actionUrl ? `${alert.actionLabel ?? "Open"}: ${alert.actionUrl}` : "",
      `View in Adminak: ${alertLink(env, alert)}`,
      "",
      `— Adminak · ${env.appUrl}/notifications`,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n");
    return { subject, preheader: alert.body ?? alert.title, html, text };
  }

  const critical = sorted.filter((a) => a.severity === "critical").length;
  const subject = `${SUBJECT_PREFIX} ${sorted.length} new alerts${critical ? ` (${critical} critical)` : ""} · ${top.title}`;
  const header = card(
    `${eyebrow(formatDate(env.now.toISOString(), env.timeZone, "long"))}
${h1(`${sorted.length} things need your attention`)}
${p(`The most important first. ${critical ? `<strong>${critical} critical</strong> — act on these now.` : "Nothing critical, but worth a look."}`)}`,
  );
  const body = header + sorted.slice(0, 12).map((a) => alertCard(env, a)).join("") + (sorted.length > 12 ? card(p(`…and ${sorted.length - 12} more in Adminak.`, { muted: true })) : "");
  const html = layout({ title: `${sorted.length} new alerts`, preheader: sorted.slice(0, 3).map((a) => a.title).join(" · "), body, footer: footer(env.appUrl, reason), appUrl: env.appUrl });
  const text = [
    `${sorted.length} new alerts`,
    "",
    ...sorted.map((a) => `[${SEVERITY_STYLE[a.severity].label}] ${a.title}${a.body ? `\n  ${a.body}` : ""}\n  ${alertLink(env, a)}`),
    "",
    `— Adminak · ${env.appUrl}/notifications`,
  ].join("\n");
  return { subject, preheader: top.title, html, text };
}

// ─── Daily digest ────────────────────────────────────────────────────────────

export interface DigestData {
  alerts: AlertDTO[];
  upcoming: TimelineItem[];
  kpis: {
    openAlerts: number;
    critical: number;
    dueThisWeek: MoneyTotal[];
    dueCount: number;
    subscriptionsMonthly: MoneyTotal[];
    spentThisMonth: MoneyTotal[];
  };
  activity: { category: Category; count: number; examples: string[] }[];
  briefing: string | null;
  emailsScanned: number;
}

function greeting(env: TemplateEnv): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: env.timeZone, hour: "numeric", hourCycle: "h23" }).format(env.now));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return env.name ? `${part}, ${env.name.split(" ")[0]}` : part;
}

function timelineRows(env: TemplateEnv, items: TimelineItem[]): ListRow[] {
  return items.map((item) => ({
    left: humanizeDay(item.at, env.timeZone, env.now).replace(/^in /, ""),
    title: item.title,
    subtitle: [item.subtitle, item.allDay ? null : formatDate(item.at, env.timeZone, "time")].filter(Boolean).join(" · ") || undefined,
    right: item.amount !== null ? formatTotals([{ amount: item.amount, currency: item.currency ?? "USD" }]) : "",
    href: item.href ? `${env.appUrl}${item.href}` : null,
  }));
}

export function renderDigestEmail(env: TemplateEnv, data: DigestData): EmailContent {
  const important = data.alerts.filter((a) => SEVERITY_RANK[a.severity] >= SEVERITY_RANK.medium).slice(0, 8);
  const headline =
    data.kpis.critical > 0
      ? `${data.kpis.critical} critical item${data.kpis.critical > 1 ? "s" : ""} need you today`
      : important.length > 0
        ? `${important.length} thing${important.length > 1 ? "s" : ""} worth your attention`
        : "All quiet — nothing urgent today";
  const dateLabel = formatDate(env.now.toISOString(), env.timeZone, "long");
  const subject = `${SUBJECT_PREFIX} Daily brief · ${formatDate(env.now.toISOString(), env.timeZone, "weekday")}: ${headline.toLowerCase()}`;

  let body = card(
    `${eyebrow(dateLabel)}
${h1(greeting(env))}
${p(esc(headline) + ".")}
<div style="height:16px;"></div>
${kpis([
  { label: "Open alerts", value: String(data.kpis.openAlerts), hint: data.kpis.critical ? `${data.kpis.critical} critical` : "none critical" },
  { label: "Due in 7 days", value: formatTotals(data.kpis.dueThisWeek, { whole: true }), hint: `${data.kpis.dueCount} item${data.kpis.dueCount === 1 ? "" : "s"}` },
  { label: "Subscriptions", value: formatTotals(data.kpis.subscriptionsMonthly, { whole: true }), hint: "per month" },
])}
${data.briefing ? callout(esc(data.briefing).replace(/\n/g, "<br>"), "Your briefing") : ""}`,
  );

  if (important.length) {
    body += card(
      `${h2("Needs attention", `<a href="${esc(env.appUrl)}/alerts" style="color:${C.link};text-decoration:none;">All alerts →</a>`)}
${listRows(
  important.map((a) => ({
    left: SEVERITY_STYLE[a.severity].label,
    title: a.title,
    subtitle: a.body ?? undefined,
    href: a.actionUrl ?? alertLink(env, a),
    badge: null,
  })),
)}`,
    );
  }
  if (data.upcoming.length) {
    body += card(`${h2("Coming up this week", `<a href="${esc(env.appUrl)}/timeline" style="color:${C.link};text-decoration:none;">Timeline →</a>`)}${listRows(timelineRows(env, data.upcoming.slice(0, 10)))}`);
  }
  if (data.activity.length) {
    body += card(
      `${h2("Since yesterday", `${data.emailsScanned} emails scanned`)}
${listRows(
  data.activity.slice(0, 8).map((a) => ({
    left: String(a.count),
    title: CATEGORY_META[a.category].label,
    subtitle: a.examples.slice(0, 2).join(" · "),
  })),
)}`,
    );
  }
  body += card(`<div style="text-align:center;">${button("Open your dashboard", env.appUrl)}</div>`, { padding: "18px 22px" });

  const html = layout({ title: `Daily brief — ${dateLabel}`, preheader: data.briefing ?? headline, body, footer: footer(env.appUrl, "You're receiving your daily brief. Change the time or turn it off in Notifications."), appUrl: env.appUrl });
  const text = [
    `${greeting(env)} — ${dateLabel}`,
    headline,
    "",
    `Open alerts: ${data.kpis.openAlerts} (${data.kpis.critical} critical)`,
    `Due in 7 days: ${formatTotals(data.kpis.dueThisWeek)} across ${data.kpis.dueCount} items`,
    `Subscriptions: ${formatTotals(data.kpis.subscriptionsMonthly)}/mo`,
    data.briefing ? `\nBriefing:\n${data.briefing}` : "",
    important.length ? `\nNeeds attention:\n${important.map((a) => `- [${SEVERITY_STYLE[a.severity].label}] ${a.title}`).join("\n")}` : "",
    data.upcoming.length ? `\nComing up:\n${data.upcoming.slice(0, 10).map((u) => `- ${humanizeDay(u.at, env.timeZone, env.now)}: ${u.title}`).join("\n")}` : "",
    "",
    env.appUrl,
  ].join("\n");
  return { subject, preheader: headline, html, text };
}

// ─── Weekly / monthly report ─────────────────────────────────────────────────

export interface ReportData {
  period: "weekly" | "monthly";
  label: string;
  spent: MoneyTotal[];
  spentPrevious: MoneyTotal[];
  income: MoneyTotal[];
  byCategory: { label: string; amount: number; currency: string }[];
  subscriptionsMonthly: MoneyTotal[];
  subscriptionCount: number;
  changes: { kind: "new" | "price" | "cancelled" | "trial" | "failed"; text: string }[];
  upcoming: TimelineItem[];
  career: { active: number; interviews: number; offers: number; applied: number };
  security: { events: number; critical: number };
  topMerchants: { name: string; amount: number; currency: string }[];
  alerts: { total: number; critical: number };
  briefing: string | null;
}

function pctChange(current: MoneyTotal[], previous: MoneyTotal[]): string | null {
  const cur = current[0];
  const prev = previous.find((p) => p.currency === cur?.currency);
  if (!cur || !prev || prev.amount === 0) return null;
  const pct = Math.round(((cur.amount - prev.amount) / prev.amount) * 100);
  return `${pct > 0 ? "+" : ""}${pct}% vs previous`;
}

export function renderReportEmail(env: TemplateEnv, data: ReportData): EmailContent {
  const title = data.period === "weekly" ? `Your week in review` : `${data.label} in review`;
  const subject = `${SUBJECT_PREFIX} ${data.period === "weekly" ? `Weekly report · ${data.label}` : `${data.label} in review`}: ${formatTotals(data.spent, { whole: true })} spent`;
  const max = Math.max(1, ...data.byCategory.map((c) => c.amount));
  let body = card(
    `${eyebrow(data.period === "weekly" ? `Weekly report · ${data.label}` : "Monthly report")}
${h1(title)}
${p(`Here's how ${data.period === "weekly" ? "this week" : "the month"} went across your money, subscriptions, career and security.`)}
<div style="height:16px;"></div>
${kpis([
  { label: "Spent", value: formatTotals(data.spent, { whole: true }), hint: pctChange(data.spent, data.spentPrevious) ?? undefined },
  { label: "Income", value: formatTotals(data.income, { whole: true }) },
  { label: "Subscriptions", value: formatTotals(data.subscriptionsMonthly, { whole: true }), hint: `${data.subscriptionCount} active · per month` },
])}
${data.briefing ? callout(esc(data.briefing).replace(/\n/g, "<br>"), "Summary") : ""}`,
  );
  if (data.byCategory.length) {
    body += card(`${h2("Where the money went")}${barRows(data.byCategory.slice(0, 7).map((c) => ({ label: c.label, value: formatTotals([{ amount: c.amount, currency: c.currency }]), ratio: c.amount / max })))}`);
  }
  if (data.changes.length) {
    const icon: Record<string, string> = { new: "New", price: "Price", cancelled: "Ended", trial: "Trial", failed: "Failed" };
    body += card(`${h2("Subscription changes")}${listRows(data.changes.slice(0, 10).map((c) => ({ left: icon[c.kind] ?? "", title: c.text })))}`);
  }
  if (data.upcoming.length) {
    body += card(`${h2(data.period === "weekly" ? "Next 14 days" : "Next 30 days")}${listRows(timelineRows(env, data.upcoming.slice(0, 12)))}`);
  }
  body += card(
    `${h2("Life admin")}
${kpis([
  { label: "Career", value: `${data.career.active} active`, hint: `${data.career.interviews} interviews · ${data.career.offers} offers` },
  { label: "Security", value: `${data.security.events} events`, hint: data.security.critical ? `${data.security.critical} critical` : "nothing critical" },
  { label: "Alerts", value: String(data.alerts.total), hint: `${data.alerts.critical} critical` },
])}
${data.topMerchants.length ? `${divider()}${h2("Top merchants")}${listRows(data.topMerchants.slice(0, 5).map((m, i) => ({ left: `#${i + 1}`, title: m.name, right: formatTotals([{ amount: m.amount, currency: m.currency }]) })))}` : ""}`,
  );
  body += card(`<div style="text-align:center;">${button("See full analytics", `${env.appUrl}/money`)}</div>`, { padding: "18px 22px" });
  const html = layout({ title, preheader: `${formatTotals(data.spent)} spent · ${data.changes.length} subscription changes · ${data.upcoming.length} things coming up`, body, footer: footer(env.appUrl, `You're receiving the ${data.period} report.`), appUrl: env.appUrl });
  const text = [
    `${title} — ${data.label}`,
    "",
    `Spent: ${formatTotals(data.spent)}${pctChange(data.spent, data.spentPrevious) ? ` (${pctChange(data.spent, data.spentPrevious)})` : ""}`,
    `Income: ${formatTotals(data.income)}`,
    `Subscriptions: ${formatTotals(data.subscriptionsMonthly)}/mo across ${data.subscriptionCount}`,
    "",
    data.byCategory.length ? `By category:\n${data.byCategory.map((c) => `- ${c.label}: ${formatTotals([{ amount: c.amount, currency: c.currency }])}`).join("\n")}` : "",
    data.changes.length ? `\nSubscription changes:\n${data.changes.map((c) => `- ${c.text}`).join("\n")}` : "",
    data.upcoming.length ? `\nComing up:\n${data.upcoming.map((u) => `- ${formatDate(u.at, env.timeZone, "monthDay")}: ${u.title}`).join("\n")}` : "",
    "",
    env.appUrl,
  ].join("\n");
  return { subject, preheader: `${formatTotals(data.spent)} spent`, html, text };
}

// ─── Utility emails ──────────────────────────────────────────────────────────

export function renderTestEmail(env: TemplateEnv, channelName: string): EmailContent {
  const body = card(
    `${eyebrow("Test notification")}
${h1("Notifications are working ✅")}
${p(`This is a test from Adminak to <strong>${esc(channelName)}</strong>. Real alerts look like this:`)}
<div style="height:14px;"></div>
${badge("high")}
<div class="ink" style="font-size:16px;font-weight:700;margin-top:8px;color:${C.ink};">Spotify price increase: $11.99 → $12.99/mo</div>
${facts([
  { label: "Service", value: "Spotify Premium" },
  { label: "Effective", value: formatDate(new Date(env.now.getTime() + 9 * 86400000).toISOString(), env.timeZone, "medium") },
])}
<div style="margin-top:18px;">${button("Open Adminak", env.appUrl)}</div>`,
  );
  return {
    subject: `${SUBJECT_PREFIX} Notifications are working ✅`,
    preheader: "Your alert channel is connected.",
    html: layout({ title: "Test notification", preheader: "Your alert channel is connected.", body, footer: footer(env.appUrl, "You requested this test."), appUrl: env.appUrl }),
    text: `Notifications are working.\n\nThis is a test from Adminak to ${channelName}.\n\n${env.appUrl}`,
  };
}

export function renderWelcomeEmail(env: TemplateEnv): EmailContent {
  const steps: ListRow[] = [
    { left: "1", title: "Connect your inboxes and bank", subtitle: "Gmail or any IMAP inbox, plus Capital One (or a statement file) for balances and transactions.", href: `${env.appUrl}/accounts` },
    { left: "2", title: "Review your subscriptions", subtitle: "Adminak builds the list from receipts and renewal notices.", href: `${env.appUrl}/subscriptions` },
    { left: "3", title: "Tune notifications", subtitle: "Pick what's instant, what waits for the daily brief, and quiet hours.", href: `${env.appUrl}/notifications` },
    { left: "4", title: "Subscribe to your calendar feed", subtitle: "Renewals, bills, trips and interviews in your calendar.", href: `${env.appUrl}/timeline` },
  ];
  const body = card(
    `${eyebrow("Welcome")}
${h1(`Welcome to Adminak${env.name ? `, ${env.name.split(" ")[0]}` : ""}`)}
${p("Your personal intelligence console is ready. It watches your inbox for the things that matter — money leaving, deadlines approaching, accounts at risk, and opportunities — and tells you before they become problems.")}
<div style="height:10px;"></div>
${listRows(steps)}
<div style="margin-top:18px;">${button("Open Adminak", env.appUrl)}</div>`,
  );
  return {
    subject: `${SUBJECT_PREFIX} Welcome — your console is ready`,
    preheader: "Connect a mailbox to start scanning.",
    html: layout({ title: "Welcome to Adminak", preheader: "Connect a mailbox to start scanning.", body, footer: footer(env.appUrl, "You set up Adminak with this address."), appUrl: env.appUrl }),
    text: `Welcome to Adminak.\n\n1. Connect a mailbox\n2. Review your subscriptions\n3. Tune notifications\n4. Subscribe to your calendar feed\n\n${env.appUrl}`,
  };
}

export function renderLoginEmail(env: TemplateEnv, info: { ip: string | null; userAgent: string | null; at: string }): EmailContent {
  const body = card(
    `${badge("medium")}
<div style="height:12px;"></div>
${h1("New sign-in to Adminak")}
${p("Someone just signed in to your Adminak console. If this was you, there's nothing to do.")}
${facts([
  { label: "When", value: formatDate(info.at, env.timeZone, "datetime") },
  { label: "IP address", value: info.ip ?? "unknown" },
  { label: "Device", value: (info.userAgent ?? "unknown").slice(0, 120) },
])}
${callout("If this wasn't you: sign in, change your password under Settings → Security, revoke other sessions, and turn on two-factor authentication.", "Not you?")}
<div style="margin-top:18px;">${button("Review sessions", `${env.appUrl}/settings`)}</div>`,
  );
  return {
    subject: `${SUBJECT_PREFIX} New sign-in to your console`,
    preheader: `Signed in from ${info.ip ?? "an unknown IP"}`,
    html: layout({ title: "New sign-in", preheader: `Signed in from ${info.ip ?? "an unknown IP"}`, body, footer: footer(env.appUrl, "Console sign-in alerts are on."), appUrl: env.appUrl }),
    text: `New sign-in to Adminak\nWhen: ${info.at}\nIP: ${info.ip}\nDevice: ${info.userAgent}\n\nIf this wasn't you, change your password: ${env.appUrl}/settings`,
  };
}

/** Compact text for push/chat channels. */
export function shortAlertText(alerts: AlertDTO[]): { title: string; body: string; severity: Severity } {
  const sorted = [...alerts].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const top = sorted[0]!;
  if (sorted.length === 1) return { title: top.title, body: top.body ?? ALERT_TYPES[top.type]?.label ?? "", severity: top.severity };
  return {
    title: `${sorted.length} new alerts`,
    body: sorted
      .slice(0, 4)
      .map((a) => `• ${a.title}`)
      .join("\n"),
    severity: top.severity,
  };
}
