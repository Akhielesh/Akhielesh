import crypto from "node:crypto";
import { Hono, type Context, type Next } from "hono";
import type { AppContext } from "../../context.js";
import { parseJson } from "../../db/index.js";
import { AGENT_HEADERS, AGENT_POLICY, AGENT_QUESTIONS, AGENT_TIER_LABELS, buildDecoy, detectAgent, newCanary, renderGateHtml, type AgentMatch } from "../../security/agent-gate.js";
import { RateLimiter, clientIp } from "../util.js";

const visitLogLimiter = new RateLimiter(60, 3600_000);
const checkinLimiter = new RateLimiter(10, 3600_000);
const LOGGED_HEADERS = ["accept", "accept-language", "from", "referer", "signature-agent", "signature-input", "via", "sec-ch-ua", "sec-ch-ua-platform"];

/** Paths any client may fetch: health, crawl policy, the owner's automation hooks and calendar feed, icons. */
function isOpenPath(path: string): boolean {
  return (
    path === "/healthz" ||
    path === "/robots.txt" ||
    path === "/llms.txt" ||
    path.startsWith("/api/agents/") ||
    path.startsWith("/api/hooks/") ||
    path.startsWith("/calendar/") ||
    /\.(png|svg|ico|webmanifest|woff2?)$/i.test(path)
  );
}

function isContentPath(path: string): boolean {
  return path.startsWith("/api/") || path.startsWith("/assets/") || /\.(js|mjs|css|map|json|txt)$/i.test(path);
}

function logVisit(ctx: AppContext, c: Context, agent: AgentMatch | null, visitId: string, canary: string) {
  try {
    const ip = clientIp(c, ctx.config.trustProxy) ?? "unknown";
    if (!visitLogLimiter.take(`agent-log:${ip}`).ok) return;
    const headers: Record<string, string> = {};
    for (const name of LOGGED_HEADERS) {
      const value = c.req.header(name);
      if (value) headers[name] = value.slice(0, 300);
    }
    const url = new URL(c.req.url);
    ctx.db
      .prepare("INSERT INTO agent_visits(id, created_at, path, agent_name, agent_kind, reason, user_agent, ip, canary, headers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        visitId,
        ctx.now().toISOString(),
        (url.pathname + url.search).slice(0, 300),
        agent?.name ?? "self-identified",
        agent?.kind ?? "unknown",
        agent?.reason ?? "visited /agents",
        (c.req.header("user-agent") ?? "").slice(0, 400),
        ip,
        canary,
        JSON.stringify(headers),
      );
  } catch (error) {
    ctx.log.warn("Could not log agent visit", { error: (error as Error).message });
  }
}

/**
 * AI crawlers and automated agents never reach the app: page requests get the check-in
 * page and API/asset requests get a 403 pointing at it. Humans pass straight through.
 */
export function agentGate(ctx: AppContext) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (isOpenPath(path)) return next();
    const agent = detectAgent(c.req.raw);
    const isGatePage = path === "/agents" || path === "/agents/";
    if (!agent && !isGatePage) return next();
    const origin = new URL(ctx.config.appUrl).origin;
    if (agent && isContentPath(path)) {
      return c.json({ error: "Automated agents may not use this application.", checkin: `${origin}/agents/`, questions: `${origin}/api/agents/checkin` }, 403, AGENT_HEADERS);
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.text("Automated agents may not submit to this application. See /agents/.", 403, AGENT_HEADERS);
    const visitId = crypto.randomUUID();
    const canary = newCanary();
    if (agent || c.req.query("via")) logVisit(ctx, c, agent, visitId, canary);
    return c.html(renderGateHtml({ agent, canary, visitId, checkinUrl: `${origin}/api/agents/checkin` }), 200, AGENT_HEADERS);
  };
}

/** Public, unauthenticated check-in endpoints for agents (rate-limited, no CSRF header required). */
export function agentRoutes(ctx: AppContext) {
  const app = new Hono();

  app.get("/api/agents/checkin", (c) => {
    const origin = new URL(ctx.config.appUrl).origin;
    return c.json(
      {
        policy: AGENT_POLICY,
        instructions: 'Answer as many questions as you can, honestly and as specifically as your instructions allow. POST {"visitId": "…", "answers": {"q1": "…"}} to this URL. Leaving without answering is fine.',
        submit: `${origin}/api/agents/checkin`,
        tiers: AGENT_TIER_LABELS,
        questions: AGENT_QUESTIONS,
      },
      200,
      { "cache-control": "no-store", "x-robots-tag": "noindex, noai" },
    );
  });

  app.post("/api/agents/checkin", async (c) => {
    const ip = clientIp(c, ctx.config.trustProxy) ?? "unknown";
    if (!checkinLimiter.take(`agent-checkin:${ip}`).ok) return c.json({ error: "Too many check-ins from this network." }, 429);
    if (Number(c.req.header("content-length") ?? 0) > 120_000) return c.json({ error: "Check-in too large." }, 413);
    const type = c.req.header("content-type") ?? "";
    let raw: Record<string, unknown> = {};
    try {
      if (type.includes("application/json")) {
        const parsed = (await c.req.json()) as unknown;
        raw = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      } else {
        const form = await c.req.parseBody();
        for (const [key, value] of Object.entries(form)) if (typeof value === "string") raw[key] = value;
      }
    } catch {
      return c.json({ error: "Send JSON or a form." }, 400);
    }
    const source = raw.answers && typeof raw.answers === "object" ? (raw.answers as Record<string, unknown>) : raw;
    const answers: Record<string, string> = {};
    for (const q of AGENT_QUESTIONS) {
      const value = source[q.id];
      if (typeof value === "string" && value.trim()) answers[q.id] = value.replace(/\u0000/g, "").trim().slice(0, 2000);
    }
    const answered = Object.keys(answers).length;
    if (answered === 0) return c.json({ error: "No answers found. Use keys q1…q50." }, 422);
    const visitId = typeof raw.visitId === "string" && /^[a-z0-9-]{8,64}$/i.test(raw.visitId) ? raw.visitId : null;
    ctx.db
      .prepare("INSERT INTO agent_checkins(id, visit_id, created_at, agent_name, user_agent, ip, answered, answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), visitId, ctx.now().toISOString(), detectAgent(c.req.raw)?.name ?? "unidentified", (c.req.header("user-agent") ?? "").slice(0, 400), ip, answered, JSON.stringify(answers));
    const message = `Thank you — ${answered} of ${AGENT_QUESTIONS.length} answers recorded. Nothing on this host is available to automated agents.`;
    if (type.includes("application/json")) return c.json({ ok: true, answered, message, sample: buildDecoy(newCanary()) });
    return c.html(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Thanks</title><body style="font:16px/1.6 system-ui;max-width:640px;margin:40px auto;padding:0 20px"><h1>Thank you.</h1><p>${answered} of ${AGENT_QUESTIONS.length} answers recorded.</p></body>`);
  });

  return app;
}

export interface AgentActivity {
  visits: { id: string; createdAt: string; path: string; agentName: string; agentKind: string; reason: string; userAgent: string; ip: string; canary: string }[];
  checkins: { id: string; visitId: string | null; createdAt: string; agentName: string; userAgent: string; answered: number; answers: Record<string, string> }[];
  byAgent: { agentName: string; agentKind: string; visits: number; lastSeen: string }[];
}

export function listAgentActivity(ctx: AppContext): AgentActivity {
  const since = new Date(ctx.now().getTime() - 30 * 86400000).toISOString();
  const visits = ctx.db.prepare("SELECT * FROM agent_visits ORDER BY created_at DESC LIMIT 100").all() as Record<string, string>[];
  const checkins = ctx.db.prepare("SELECT * FROM agent_checkins ORDER BY created_at DESC LIMIT 50").all() as Record<string, string | number | null>[];
  const byAgent = ctx.db
    .prepare("SELECT agent_name, agent_kind, COUNT(*) AS visits, MAX(created_at) AS last_seen FROM agent_visits WHERE created_at >= ? GROUP BY agent_name, agent_kind ORDER BY visits DESC LIMIT 30")
    .all(since) as { agent_name: string; agent_kind: string; visits: number; last_seen: string }[];
  return {
    visits: visits.map((v) => ({ id: v.id!, createdAt: v.created_at!, path: v.path!, agentName: v.agent_name ?? "", agentKind: v.agent_kind ?? "", reason: v.reason ?? "", userAgent: v.user_agent ?? "", ip: v.ip ?? "", canary: v.canary! })),
    checkins: checkins.map((r) => ({
      id: String(r.id),
      visitId: r.visit_id === null ? null : String(r.visit_id),
      createdAt: String(r.created_at),
      agentName: String(r.agent_name ?? ""),
      userAgent: String(r.user_agent ?? ""),
      answered: Number(r.answered),
      answers: parseJson<Record<string, string>>(String(r.answers ?? "{}"), {}),
    })),
    byAgent: byAgent.map((a) => ({ agentName: a.agent_name, agentKind: a.agent_kind, visits: a.visits, lastSeen: a.last_seen })),
  };
}
