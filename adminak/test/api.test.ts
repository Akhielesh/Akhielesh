import { describe, expect, it } from "vitest";
import type {
  AccountDTO,
  AlertDTO,
  AuthState,
  ChannelDTO,
  DomainDTO,
  MessageDetailDTO,
  MessageListItem,
  MoneyDTO,
  OverviewDTO,
  RuleDTO,
  SubscriptionDTO,
  SubscriptionDetailDTO,
  TimelineItem,
} from "../src/shared/types.js";
import { dispatchInstant, sendDigest } from "../src/server/notify/dispatcher.js";
import { refreshBriefingIfStale } from "../src/server/jobs/scheduler.js";
import { deleteMeta, getMeta } from "../src/server/db/index.js";
import { totpCode } from "../src/server/security/totp.js";
import { ensureSetupCode } from "../src/server/services/auth.js";
import { createHarness, setupOwner } from "./helpers.js";

describe("auth", () => {
  it("requires the setup code and a strong password, then signs in", async () => {
    const h = createHarness();
    const state = await h.json<AuthState>("GET", "/api/auth/state");
    expect(state.body.setupRequired).toBe(true);
    const bad = await h.json("POST", "/api/auth/setup", { setupCode: "WRONG", email: "a@b.co", name: "A", password: "x" });
    expect(bad.status).toBe(403);
    const weak = await h.json("POST", "/api/auth/setup", { setupCode: h.ctx.runtime.setupCode, email: "a@b.co", name: "A", password: "short" });
    expect(weak.status).toBe(422);
    // The code survives a restart (fresh runtime, same database) until the owner exists.
    const code = h.ctx.runtime.setupCode;
    h.ctx.runtime.setupCode = null;
    expect(ensureSetupCode(h.ctx)).toBe(code);
    await setupOwner(h);
    expect(getMeta(h.ctx.db, "setup_code")).toBeNull();
    expect(ensureSetupCode(h.ctx)).toBeNull();
    const after = await h.json<AuthState>("GET", "/api/auth/state");
    expect(after.body.authenticated).toBe(true);
    expect(after.body.user?.email).toBe("owner@example.com");
    // Welcome email went to the notification address.
    await new Promise((r) => setTimeout(r, 20));
    expect(h.sent.some((m) => m.to.includes("me@example.com") && /Welcome/.test(m.subject))).toBe(true);
    await h.json("POST", "/api/auth/logout");
    expect((await h.json("GET", "/api/overview")).status).toBe(401);
    const login = await h.json("POST", "/api/auth/login", { email: "owner@example.com", password: "correct horse battery staple 9" });
    expect(login.status).toBe(200);
    expect((await h.json("GET", "/api/overview")).status).toBe(200);
  });

  it("blocks state-changing requests without the CSRF header or from another origin", async () => {
    const h = createHarness();
    await setupOwner(h);
    const noHeader = await h.request("POST", "/api/alerts/read-all", {}, { "x-adminak": "" });
    expect(noHeader.status).toBe(403);
    const foreign = await h.request("POST", "/api/alerts/read-all", {}, { origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
  });

  it("supports TOTP two-factor sign-in with replay protection", async () => {
    const h = createHarness();
    await setupOwner(h);
    const setup = await h.json<{ secret: string; qrSvg: string }>("POST", "/api/me/totp/setup");
    expect(setup.body.qrSvg).toContain("<svg");
    const enable = await h.json<{ recoveryCodes: string[] }>("POST", "/api/me/totp/enable", { code: totpCode(setup.body.secret, Date.now()) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(8);
    await h.json("POST", "/api/auth/logout");
    const missing = await h.json<{ totpRequired: boolean }>("POST", "/api/auth/login", { email: "owner@example.com", password: "correct horse battery staple 9" });
    expect(missing.status).toBe(401);
    expect(missing.body.totpRequired).toBe(true);
    const recovery = await h.json("POST", "/api/auth/login", { email: "owner@example.com", password: "correct horse battery staple 9", code: enable.body.recoveryCodes[0] });
    expect(recovery.status).toBe(200);
    await h.json("POST", "/api/auth/logout");
    const reused = await h.json("POST", "/api/auth/login", { email: "owner@example.com", password: "correct horse battery staple 9", code: enable.body.recoveryCodes[0] });
    expect(reused.status).toBe(401);
  });
});

describe("demo workspace end-to-end", async () => {
  const h = createHarness();
  await setupOwner(h);
  const demo = await h.json<{ ok: boolean; inserted: number; alerts: number }>("POST", "/api/demo");

  it("ingests the demo inbox", () => {
    expect(demo.status).toBe(200);
    expect(demo.body.ok).toBe(true);
    expect(demo.body.inserted).toBeGreaterThan(90);
  });

  it("builds an overview", async () => {
    const { body } = await h.json<OverviewDTO>("GET", "/api/overview");
    expect(body.kpis.activeSubscriptions).toBeGreaterThanOrEqual(9);
    expect(body.kpis.monthlySubscriptions[0]?.currency).toBe("USD");
    expect(body.kpis.monthlySubscriptions[0]!.amount).toBeGreaterThan(100);
    expect(body.attention.length).toBeGreaterThan(0);
    expect(body.attention[0]!.severity).toBe("critical");
    expect(body.upcoming.length).toBeGreaterThan(3);
    expect(body.spendTrend).toHaveLength(12);
    expect(body.savings.some((s) => s.kind === "price_increase")).toBe(true);
    expect(body.career.offers).toBe(1);
  });

  it("tracks subscriptions with price history and editing", async () => {
    const list = await h.json<{ items: SubscriptionDTO[] }>("GET", "/api/subscriptions");
    const netflix = list.body.items.find((s) => s.name === "Netflix")!;
    expect(netflix.amount).toBe(17.99);
    expect(netflix.cycle).toBe("monthly");
    expect(netflix.priceChange?.from).toBe(15.49);
    const detail = await h.json<SubscriptionDetailDTO>("GET", `/api/subscriptions/${netflix.id}`);
    expect(detail.body.priceHistory.length).toBe(4);
    expect(detail.body.messages.length).toBeGreaterThan(0);
    const patched = await h.json<SubscriptionDTO>("PATCH", `/api/subscriptions/${netflix.id}`, { notes: "Shared with family", muted: true });
    expect(patched.body.notes).toBe("Shared with family");
    expect(patched.body.muted).toBe(true);
    const created = await h.json<SubscriptionDTO>("POST", "/api/subscriptions", { name: "Gym membership", amount: 49, cycle: "monthly", nextRenewalAt: "2026-10-20" });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe("manual");
    expect(created.body.nextRenewalAt?.slice(0, 10)).toBe("2026-10-20");
  });

  it("lists alerts and supports snooze / done / bulk", async () => {
    const list = await h.json<AlertDTO[]>("GET", "/api/alerts");
    expect(list.body.length).toBeGreaterThan(10);
    const first = list.body[0]!;
    const snoozed = await h.json<AlertDTO>("PATCH", `/api/alerts/${first.id}`, { status: "snoozed", snoozeUntil: "2026-10-05T12:00:00Z" });
    expect(snoozed.body.status).toBe("snoozed");
    const bulk = await h.json<{ changed: number }>("POST", "/api/alerts/bulk", { ids: list.body.slice(1, 3).map((a) => a.id), action: "done" });
    expect(bulk.body.changed).toBe(2);
    const counts = await h.json<{ snoozed: number; done: number }>("GET", "/api/alerts/counts");
    expect(counts.body.snoozed).toBe(1);
    expect(counts.body.done).toBeGreaterThanOrEqual(2);
  });

  it("serves money analytics, bills and manual entries", async () => {
    const money = await h.json<MoneyDTO>("GET", "/api/money");
    expect(money.body.bills.length).toBeGreaterThan(3);
    expect(money.body.monthly).toHaveLength(12);
    expect(money.body.charges.length).toBeGreaterThan(20);
    const netflixCardCharges = money.body.charges.filter((c) => /netflix/i.test(c.description) && c.amount === 17.99);
    expect(netflixCardCharges.length).toBe(1);
    const bill = money.body.bills.find((b) => b.status === "due")!;
    const paid = await h.json<{ status: string }>("PATCH", `/api/bills/${bill.id}`, { status: "paid" });
    expect(paid.body.status).toBe("paid");
    const manual = await h.json("POST", "/api/bills", { name: "Rent", kind: "rent", amountDue: 3450, dueAt: "2026-11-01" });
    expect(manual.status).toBe(201);
  });

  it("counts rent paid via a bill payment but not card statement payments as spending", async () => {
    const money = await h.json<MoneyDTO>("GET", "/api/money");
    // The Bilt rent payment has no linked bill; it must still count (a NULL bill_id once dropped it).
    const bills = money.body.spendByCategory.find((c) => c.category === "bills");
    expect(bills?.total ?? 0).toBeGreaterThanOrEqual(3450);
    // Paying the Amex statement re-pays purchases already counted, so it isn't spending.
    expect(money.body.topMerchants.map((m) => m.name)).not.toContain("American Express");
    const september = money.body.monthly.find((m) => m.month === "2026-09")!;
    expect(september.out).toBeGreaterThan(3450);
    expect(september.out).toBeLessThan(3450 + 2500);
  });

  it("mutes and unmutes a noisy sender from the declutter list", async () => {
    const senders = await h.json<{ fromEmail: string; muted: boolean }[]>("GET", "/api/senders");
    const target = senders.body[0]!;
    expect(target.muted).toBe(false);
    const muted = await h.json<{ pattern: string }>("POST", "/api/senders/mute", { email: target.fromEmail });
    expect(muted.body.pattern).toBe(target.fromEmail);
    const after = await h.json<{ fromEmail: string; muted: boolean }[]>("GET", "/api/senders");
    expect(after.body.find((s) => s.fromEmail === target.fromEmail)?.muted).toBe(true);
    const overrides = await h.json<{ pattern: string; ignore: boolean }[]>("GET", "/api/sender-overrides");
    expect(overrides.body.some((o) => o.pattern === target.fromEmail && o.ignore)).toBe(true);
    await h.json("POST", "/api/senders/mute", { email: target.fromEmail, muted: false });
    const restored = await h.json<{ fromEmail: string; muted: boolean }[]>("GET", "/api/senders");
    expect(restored.body.find((s) => s.fromEmail === target.fromEmail)?.muted).toBe(false);
  });

  it("generates the dashboard briefing automatically and only when stale", async () => {
    deleteMeta(h.ctx.db, "briefing");
    expect(await refreshBriefingIfStale(h.ctx)).toBe(true);
    const overview = await h.json<OverviewDTO>("GET", "/api/overview");
    expect(overview.body.briefing?.source).toBe("rules");
    expect(overview.body.briefing?.text.length).toBeGreaterThan(20);
    expect(await refreshBriefingIfStale(h.ctx)).toBe(false);
  });

  it("builds the timeline and domain pages", async () => {
    const timeline = await h.json<TimelineItem[]>("GET", "/api/timeline?days=30");
    expect(timeline.body.some((t) => t.kind === "bill_due")).toBe(true);
    expect(timeline.body.some((t) => t.kind === "flight")).toBe(true);
    for (const domain of ["career", "orders", "travel", "security", "life"]) {
      const res = await h.json<DomainDTO>("GET", `/api/domains/${domain}`);
      expect(res.status, domain).toBe(200);
      expect(res.body.stats.length).toBeGreaterThan(0);
    }
    const career = await h.json<DomainDTO>("GET", "/api/domains/career");
    expect(career.body.groups.map((g) => g.title)).toEqual(expect.arrayContaining(["Notion", "Stripe", "Perplexity"]));
  });

  it("searches messages and explains classifications", async () => {
    const search = await h.json<MessageListItem[]>("GET", "/api/messages?q=netflix");
    expect(search.body.length).toBeGreaterThan(2);
    const detail = await h.json<MessageDetailDTO>("GET", `/api/messages/${search.body[0]!.id}`);
    expect(detail.body.analysis.reasons.length).toBeGreaterThan(0);
    const promo = await h.json<MessageListItem[]>("GET", "/api/messages?category=promotions");
    const reclass = await h.json("POST", `/api/messages/${promo.body[0]!.id}/reclassify`, { category: "newsletters", remember: "sender" });
    expect(reclass.status).toBe(200);
    const overrides = await h.json<unknown[]>("GET", "/api/sender-overrides");
    expect(overrides.body.length).toBe(1);
  });

  it("creates and tests custom rules", async () => {
    const test = await h.json<{ total: number }>("POST", "/api/rules/test", { match: "all", conditions: [{ field: "amount", op: "gte", value: "400" }] });
    expect(test.body.total).toBeGreaterThan(0);
    const rule = await h.json<RuleDTO>("POST", "/api/rules", {
      name: "Big money",
      match: "all",
      conditions: [{ field: "amount", op: "gte", value: "1000" }],
      actions: { alert: true, severity: "high" },
    });
    expect(rule.status).toBe(201);
  });

  it("delivers instant alerts, digests and reports through channels", async () => {
    h.sent.length = 0;
    const result = await dispatchInstant(h.ctx);
    // 14:00Z is 10:00 in New York — outside quiet hours.
    expect(result.sent).toBe(1);
    const instant = h.sent.find((m) => /new alerts/.test(m.subject))!;
    expect(instant.to).toEqual(["me@example.com"]);
    expect(instant.html).toContain("Adminak");
    expect(instant.text).toContain("Critical");
    // Nothing is sent twice.
    expect((await dispatchInstant(h.ctx)).sent).toBe(0);
    const digest = await sendDigest(h.ctx, "digest");
    expect(digest.sent).toBe(1);
    expect(h.sent.at(-1)!.subject).toMatch(/Daily brief/);
    const weekly = await sendDigest(h.ctx, "weekly");
    expect(weekly.sent).toBe(1);
    expect(h.sent.at(-1)!.html).toContain("Where the money went");
    const channels = await h.json<{ channels: ChannelDTO[] }>("GET", "/api/channels");
    const test = await h.json<{ ok: boolean }>("POST", `/api/channels/${channels.body.channels[0]!.id}/test`);
    expect(test.body.ok).toBe(true);
    const log = await h.json<unknown[]>("GET", "/api/notifications/log");
    expect(log.body.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every email template preview", async () => {
    const templates = await h.json<{ id: string }[]>("GET", "/api/templates");
    expect(templates.body.length).toBeGreaterThanOrEqual(10);
    for (const t of templates.body) {
      const res = await h.request("GET", `/api/templates/${t.id}/preview`);
      const html = await res.text();
      expect(res.status, t.id).toBe(200);
      expect(html, t.id).toContain("<!doctype html>");
      expect(html, t.id).not.toMatch(/undefined|NaN|\[object Object\]/);
    }
  });

  it("publishes a token-protected calendar feed and automation hooks", async () => {
    const auto = await h.json<{ calendarUrl: string; hookToken: string }>("GET", "/api/automation");
    const path = new URL(auto.body.calendarUrl).pathname;
    const ics = await h.request("GET", path);
    const text = await ics.text();
    expect(ics.status).toBe(200);
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("BEGIN:VEVENT");
    expect((await h.request("GET", "/calendar/not-the-token.ics")).status).toBe(404);
    const unauth = await h.request("POST", "/api/hooks/ingest", { from: "x@y.co", subject: "hi" });
    expect(unauth.status).toBe(401);
    const ingest = await h.request(
      "POST",
      "/api/hooks/ingest",
      { from: "Hulu <hulu@hulumail.com>", subject: "Your Hulu receipt", text: "Thanks for your payment. Hulu (No Ads) monthly plan. Total charged $18.99. Next billing date: October 30, 2026." },
      { authorization: `Bearer ${auto.body.hookToken}` },
    );
    const ingested = (await ingest.json()) as { stored: boolean; message: { category: string } };
    expect(ingest.status).toBe(201);
    expect(ingested.message.category).toBe("subscriptions");
    const summary = await h.request("GET", "/api/hooks/summary", undefined, { authorization: `Bearer ${auto.body.hookToken}` });
    expect(summary.status).toBe(200);
  });

  it("exports CSV safely and reports system status", async () => {
    const csv = await h.request("GET", "/api/export/subscriptions.csv");
    const text = await csv.text();
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(text.split("\n")[0]).toContain("name,plan");
    const system = await h.json<{ counts: Record<string, number> }>("GET", "/api/system");
    expect(system.body.counts.messages).toBeGreaterThan(90);
    const accounts = await h.json<{ accounts: AccountDTO[] }>("GET", "/api/accounts");
    expect(accounts.body.accounts.some((a) => a.provider === "demo")).toBe(true);
  });

  it("answers questions without AI using deterministic search", async () => {
    const res = await h.json<{ answer: string; mode: string }>("POST", "/api/ask", { question: "What subscriptions am I paying for?" });
    expect(res.body.mode).toBe("search");
    expect(res.body.answer).toMatch(/Netflix/);
  });

  it("sends AI crawlers and scripts to the agent check-in instead of the app", async () => {
    const page = await h.request("GET", "/", undefined, { "user-agent": "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" });
    expect(page.status).toBe(200);
    expect(page.headers.get("x-robots-tag")).toContain("noai");
    const html = await page.text();
    expect(html).toContain("Automated agent check-in");
    expect(html).toContain("OpenAI GPTBot");
    expect(html).toContain("adk-canary-");
    expect(html).not.toContain('id="root"');

    const api = await h.request("GET", "/api/overview", undefined, { "user-agent": "ClaudeBot/1.0" });
    expect(api.status).toBe(403);
    const login = await h.request("POST", "/api/auth/login", { email: "a@b.c", password: "x" }, { "user-agent": "python-requests/2.32" });
    expect(login.status).toBe(403);

    // The owner's own scripts and calendar apps are not agents.
    expect((await h.request("GET", "/healthz", undefined, { "user-agent": "curl/8.5.0" })).status).toBe(200);
    const auto = await h.json<{ hookToken: string }>("GET", "/api/automation");
    const hook = await h.request("GET", "/api/hooks/summary", undefined, { "user-agent": "curl/8.5.0", authorization: `Bearer ${auto.body.hookToken}` });
    expect(hook.status).toBe(200);

    const questions = await h.request("GET", "/api/agents/checkin", undefined, { "user-agent": "ClaudeBot/1.0" });
    const q = (await questions.json()) as { questions: { id: string }[] };
    expect(q.questions).toHaveLength(50);
    const checkin = await h.request(
      "POST",
      "/api/agents/checkin",
      { visitId: "visit-12345678", answers: { q1: "ClaudeBot", q9: "<b>indexing</b>", q77: "ignored" } },
      { "user-agent": "ClaudeBot/1.0", "x-adminak": "" },
    );
    expect(checkin.status).toBe(200);
    expect(((await checkin.json()) as { answered: number }).answered).toBe(2);

    // A person who opens the check-in page directly sees it but is not logged.
    const human = await h.request("GET", "/agents/?via=link");
    expect(await human.text()).toContain("Automated agent check-in");

    const activity = await h.json<{ byAgent: { agentName: string; visits: number }[]; checkins: { agentName: string; answers: Record<string, string> }[] }>("GET", "/api/agent-visits");
    expect(activity.body.byAgent.some((a) => a.agentName === "OpenAI GPTBot")).toBe(true);
    expect(activity.body.byAgent.reduce((n, a) => n + a.visits, 0)).toBe(1);
    expect(activity.body.checkins[0]!.agentName).toBe("Anthropic ClaudeBot");
    expect(activity.body.checkins[0]!.answers.q9).toBe("<b>indexing</b>");
    expect(activity.body.checkins[0]!.answers.q77).toBeUndefined();
  });

  it("rejects non-http links and keeps calendar fields on one line", async () => {
    const bad = await h.json("POST", "/api/subscriptions", { name: "Sneaky", amount: 5, manageUrl: "javascript:alert(1)" });
    expect(bad.status).toBe(422);
    const created = await h.json<{ id: number }>("POST", "/api/subscriptions", { name: "Evil\rX-INJECTED:1", amount: 5, cycle: "monthly", nextRenewalAt: "2026-10-20" });
    expect(created.status).toBe(201);
    const auto = await h.json<{ calendarUrl: string }>("GET", "/api/automation");
    const ics = await (await h.request("GET", new URL(auto.body.calendarUrl).pathname)).text();
    expect(ics).toContain("Evil\\nX-INJECTED");
    expect(ics.split(/\r?\n/).some((line) => line.startsWith("X-INJECTED"))).toBe(false);
  });

  it("clears the demo workspace", async () => {
    const res = await h.json("DELETE", "/api/demo");
    expect(res.status).toBe(200);
    const subs = await h.json<{ items: SubscriptionDTO[] }>("GET", "/api/subscriptions");
    const names = subs.body.items.map((s) => s.name);
    // Demo-derived subscriptions are gone; manual ones and the webhook-ingested Hulu stay.
    expect(names).not.toContain("Netflix");
    expect(names).toContain("Gym membership");
    expect(names).toContain("Hulu");
  });
});
