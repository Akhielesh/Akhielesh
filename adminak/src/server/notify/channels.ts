import crypto from "node:crypto";
import { z } from "zod";
import { maskEmail } from "../../shared/format.js";
import { CHANNEL_TYPES, SEVERITIES, type ChannelDTO, type ChannelEvents, type ChannelType, type Severity } from "../../shared/types.js";
import type { AppContext } from "../context.js";
import { parseJson } from "../db/index.js";
import { sendPush, type PushSubscriptionJSON } from "./push.js";
import type { EmailContent } from "./templates/emails.js";
import { emailTransport } from "./transport.js";

export const ChannelConfigSchemas = {
  email: z.object({ to: z.email() }),
  push: z.object({
    subscription: z.object({ endpoint: z.url(), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }),
    device: z.string().max(120).default("This device"),
  }),
  ntfy: z.object({ url: z.url(), token: z.string().max(200).optional() }),
  slack: z.object({ url: z.url().refine((u) => u.startsWith("https://hooks.slack.com/"), "Use a Slack incoming-webhook URL") }),
  discord: z.object({ url: z.url().refine((u) => /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(u), "Use a Discord webhook URL") }),
  telegram: z.object({ botToken: z.string().regex(/^\d+:[\w-]{20,}$/, "Bot token looks like 123456:ABC…"), chatId: z.string().min(1).max(40) }),
  webhook: z.object({ url: z.url().refine((u) => /^https?:\/\//.test(u), "http(s) URL required"), secret: z.string().max(200).optional() }),
} as const;

export type ChannelConfig = {
  email: { to: string };
  push: { subscription: PushSubscriptionJSON; device: string };
  ntfy: { url: string; token?: string };
  slack: { url: string };
  discord: { url: string };
  telegram: { botToken: string; chatId: string };
  webhook: { url: string; secret?: string };
};

export const DEFAULT_EVENTS: Record<ChannelType, ChannelEvents> = {
  email: { instant: true, digest: true, weekly: true, monthly: true, system: true },
  push: { instant: true, digest: false, weekly: false, monthly: false, system: true },
  ntfy: { instant: true, digest: false, weekly: false, monthly: false, system: true },
  slack: { instant: true, digest: true, weekly: false, monthly: false, system: true },
  discord: { instant: true, digest: true, weekly: false, monthly: false, system: true },
  telegram: { instant: true, digest: true, weekly: false, monthly: false, system: true },
  webhook: { instant: true, digest: true, weekly: true, monthly: true, system: true },
};

export interface ChannelRow {
  id: number;
  type: ChannelType;
  name: string;
  enabled: number;
  min_severity: Severity;
  events: string;
  config_enc: string;
  target_hint: string | null;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

export function channelFromRow(row: ChannelRow): ChannelDTO {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: !!row.enabled,
    minSeverity: row.min_severity,
    events: { ...DEFAULT_EVENTS[row.type], ...parseJson<Partial<ChannelEvents>>(row.events, {}) },
    target: row.target_hint ?? "",
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export function targetHint(type: ChannelType, config: ChannelConfig[ChannelType]): string {
  switch (type) {
    case "email":
      return maskEmail((config as ChannelConfig["email"]).to);
    case "push":
      return (config as ChannelConfig["push"]).device;
    case "telegram":
      return `chat ${(config as ChannelConfig["telegram"]).chatId}`;
    default: {
      const url = new URL((config as { url: string }).url);
      return `${url.host}${url.pathname.length > 1 ? url.pathname.slice(0, 18) + (url.pathname.length > 18 ? "…" : "") : ""}`;
    }
  }
}

export function createChannel(
  ctx: AppContext,
  input: { type: ChannelType; name?: string; config: unknown; minSeverity?: Severity; events?: Partial<ChannelEvents> },
): ChannelDTO {
  if (!CHANNEL_TYPES.includes(input.type)) throw new Error("Unknown channel type");
  const config = ChannelConfigSchemas[input.type].parse(input.config) as ChannelConfig[ChannelType];
  const now = ctx.now().toISOString();
  const name = input.name?.trim() || defaultName(input.type);
  const res = ctx.db
    .prepare("INSERT INTO channels(type, name, enabled, min_severity, events, config_enc, target_hint, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)")
    .run(input.type, name, input.minSeverity ?? (input.type === "email" ? "high" : "high"), JSON.stringify({ ...DEFAULT_EVENTS[input.type], ...input.events }), ctx.vault.encryptJson(config), targetHint(input.type, config), now);
  return channelFromRow(ctx.db.prepare("SELECT * FROM channels WHERE id = ?").get(Number(res.lastInsertRowid)) as ChannelRow);
}

function defaultName(type: ChannelType): string {
  return { email: "Email", push: "Push notifications", ntfy: "ntfy", slack: "Slack", discord: "Discord", telegram: "Telegram", webhook: "Webhook" }[type];
}

export function listChannels(ctx: AppContext): ChannelDTO[] {
  return (ctx.db.prepare("SELECT * FROM channels ORDER BY id").all() as ChannelRow[]).map(channelFromRow);
}

export interface ChannelMessage {
  kind: "alerts" | "digest" | "report" | "test" | "system";
  email: EmailContent;
  short: { title: string; body: string; url: string; severity: Severity };
  json: Record<string, unknown>;
}

const NTFY_PRIORITY: Record<Severity, string> = { critical: "5", high: "4", medium: "3", low: "2", info: "1" };
const DISCORD_COLOR: Record<Severity, number> = { critical: 0xd03b3b, high: 0xe0713f, medium: 0xd99a06, low: 0x2a78d6, info: 0x8b8983 };

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Adminak/1.0", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeTelegram(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Delivers one message through one channel. Throws on failure. */
export async function deliver(ctx: AppContext, row: ChannelRow, message: ChannelMessage): Promise<string | undefined> {
  const config = ctx.vault.decryptJson<Record<string, unknown>>(row.config_enc, {});
  const { short } = message;
  switch (row.type) {
    case "email": {
      const to = (config as ChannelConfig["email"]).to;
      const transport = emailTransport(ctx);
      const result = await transport.send({ to: [to], subject: message.email.subject, html: message.email.html, text: message.email.text });
      return transport.name === "outbox" ? "No SMTP configured — saved to the local outbox" : result.id;
    }
    case "push": {
      try {
        await sendPush(ctx, (config as ChannelConfig["push"]).subscription, { title: short.title, body: short.body, url: short.url, severity: short.severity, tag: message.kind });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser unsubscribed — disable the channel instead of retrying forever.
          ctx.db.prepare("UPDATE channels SET enabled = 0, last_error = 'Subscription expired — re-enable push on this device' WHERE id = ?").run(row.id);
        }
        throw error;
      }
      return undefined;
    }
    case "ntfy": {
      const c = config as ChannelConfig["ntfy"];
      const res = await fetch(c.url, {
        method: "POST",
        headers: {
          Title: /^[\x20-\x7e]*$/.test(short.title) ? short.title : `=?UTF-8?B?${Buffer.from(short.title).toString("base64")}?=`,
          Priority: NTFY_PRIORITY[short.severity],
          Tags: short.severity === "critical" ? "rotating_light" : short.severity === "high" ? "warning" : "bell",
          Click: short.url,
          ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
        },
        body: short.body || short.title,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
      return undefined;
    }
    case "slack": {
      // Email-derived text must not become Slack markup (<!channel> pings, <url|text> links).
      const title = slackEscape(short.title);
      const body = slackEscape(short.body);
      await postJson((config as ChannelConfig["slack"]).url, {
        text: `${title}\n${body}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${body}`.slice(0, 2900) } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open Adminak" }, url: short.url }] },
        ],
      });
      return undefined;
    }
    case "discord": {
      await postJson((config as ChannelConfig["discord"]).url, {
        username: "Adminak",
        allowed_mentions: { parse: [] },
        embeds: [{ title: short.title.slice(0, 250), description: short.body.slice(0, 3500), url: short.url, color: DISCORD_COLOR[short.severity] }],
      });
      return undefined;
    }
    case "telegram": {
      const c = config as ChannelConfig["telegram"];
      await postJson(`https://api.telegram.org/bot${c.botToken}/sendMessage`, {
        chat_id: c.chatId,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        text: `<b>${escapeTelegram(short.title)}</b>\n${escapeTelegram(short.body)}\n\n<a href="${escapeTelegram(short.url)}">Open Adminak</a>`.slice(0, 4000),
      });
      return undefined;
    }
    case "webhook": {
      const c = config as ChannelConfig["webhook"];
      const body = JSON.stringify({ event: message.kind, sentAt: ctx.now().toISOString(), ...message.json });
      const headers: Record<string, string> = { "X-Adminak-Event": message.kind };
      if (c.secret) headers["X-Adminak-Signature"] = `sha256=${crypto.createHmac("sha256", c.secret).update(body).digest("hex")}`;
      await postJson(c.url, body, headers);
      return undefined;
    }
  }
}

export const SEVERITY_LIST = SEVERITIES;
