import { loadConfig } from "../src/server/config.js";
import { createContext, type AppContext, type OutgoingMail } from "../src/server/context.js";
import { createApp } from "../src/server/http/app.js";

export interface TestHarness {
  ctx: AppContext;
  sent: OutgoingMail[];
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  json: <T = unknown>(method: string, path: string, body?: unknown) => Promise<{ status: number; body: T }>;
  setNow: (date: Date) => void;
}

export function createHarness(opts: { now?: Date; env?: Record<string, string> } = {}): TestHarness {
  let now = opts.now ?? new Date("2026-10-01T14:00:00Z");
  const config = loadConfig({ NODE_ENV: "test", DATA_DIR: `/tmp/adminak-test-${process.pid}`, APP_URL: "http://localhost:8787", ...opts.env } as NodeJS.ProcessEnv);
  const ctx = createContext(config, { dbFile: ":memory:", secret: "test-secret-test-secret-test-secret", now: () => now });
  ctx.settings.patch({ profile: { timezone: "America/New_York", currency: "USD" } });
  const sent: OutgoingMail[] = [];
  ctx.runtime.mailOverride = {
    name: "capture",
    async send(mail) {
      sent.push(mail);
      return { id: `capture-${sent.length}` };
    },
  };
  const app = createApp(ctx);
  let cookie = "";
  const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const init: RequestInit = {
      method,
      headers: {
        ...(body !== undefined && typeof body !== "string" ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "x-adminak": "1" } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    };
    const res = await app.request(`http://localhost:8787${path}`, init);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const pair = setCookie.split(";")[0]!;
      cookie = pair.endsWith("=") ? "" : pair;
    }
    return res;
  };
  const json = async <T,>(method: string, path: string, body?: unknown) => {
    const res = await request(method, path, body);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed as T };
  };
  return { ctx, sent, request, json, setNow: (d) => (now = d) };
}

export async function setupOwner(h: TestHarness): Promise<void> {
  const state = await h.json<{ setupRequired: boolean }>("GET", "/api/auth/state");
  if (!state.body.setupRequired) return;
  const code = h.ctx.runtime.setupCode!;
  const res = await h.json("POST", "/api/auth/setup", {
    setupCode: code,
    email: "owner@example.com",
    name: "Akhielesh",
    password: "correct horse battery staple 9",
    notifyEmail: "me@example.com",
    timezone: "America/New_York",
    currency: "USD",
  });
  if (res.status !== 200) throw new Error(`setup failed: ${JSON.stringify(res.body)}`);
}
