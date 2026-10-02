import nodemailer from "nodemailer";
import type { AppContext, OutgoingMail } from "../context.js";
import { parseJson } from "../db/index.js";
import type { IncomingEmail } from "../intel/types.js";
import { CAPTURED_HEADERS, decodeWords, parseAddress, parseAddressList } from "./mime.js";
import { ProviderAuthError, type FetchOptions, type FetchResult, type GmailSecret, type GmailSettings, type MailProvider } from "./types.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPES = {
  readonly: "https://www.googleapis.com/auth/gmail.readonly",
  modify: "https://www.googleapis.com/auth/gmail.modify",
  send: "https://www.googleapis.com/auth/gmail.send",
};

export function googleRedirectUri(ctx: AppContext): string {
  return `${ctx.config.appUrl}/api/accounts/google/callback`;
}

export function buildGoogleAuthUrl(ctx: AppContext, state: string, opts: { labels: boolean; send: boolean; loginHint?: string }): string {
  if (!ctx.config.google) throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  const scopes = ["openid", "email", opts.labels ? GMAIL_SCOPES.modify : GMAIL_SCOPES.readonly];
  if (opts.send) scopes.push(GMAIL_SCOPES.send);
  const params = new URLSearchParams({
    client_id: ctx.config.google.clientId,
    redirect_uri: googleRedirectUri(ctx),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    const message = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (json.error === "invalid_grant" || res.status === 400 || res.status === 401) throw new ProviderAuthError(`Google rejected the token: ${message}`);
    throw new Error(`Google token request failed: ${message}`);
  }
  return json;
}

export async function exchangeGoogleCode(
  ctx: AppContext,
  code: string,
): Promise<{ secret: GmailSecret; scopes: string[]; email: string }> {
  if (!ctx.config.google) throw new Error("Google OAuth is not configured.");
  const tokens = await tokenRequest({
    code,
    client_id: ctx.config.google.clientId,
    client_secret: ctx.config.google.clientSecret,
    redirect_uri: googleRedirectUri(ctx),
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Remove Adminak from your Google account permissions and connect again.");
  const profileRes = await fetch(`${API}/profile`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!profileRes.ok) throw new Error(`Could not read Gmail profile (HTTP ${profileRes.status}). Make sure the Gmail API is enabled for your Google Cloud project.`);
  const profile = (await profileRes.json()) as { emailAddress: string };
  return {
    secret: { refreshToken: tokens.refresh_token, accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 },
    scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
    email: profile.emailAddress.toLowerCase(),
  };
}

export class GmailClient {
  private secret: GmailSecret;

  constructor(
    private readonly ctx: AppContext,
    private readonly accountId: number,
  ) {
    const row = ctx.db.prepare("SELECT secret_enc FROM accounts WHERE id = ?").get(accountId) as { secret_enc: string | null } | undefined;
    this.secret = ctx.vault.decryptJson<GmailSecret>(row?.secret_enc, { refreshToken: "" });
    if (!this.secret.refreshToken) throw new ProviderAuthError("This Gmail account has no stored credentials. Reconnect it.");
  }

  private async token(force = false): Promise<string> {
    if (!force && this.secret.accessToken && (this.secret.expiresAt ?? 0) > Date.now() + 30_000) return this.secret.accessToken;
    if (!this.ctx.config.google) throw new ProviderAuthError("Google OAuth is not configured on this server.");
    const tokens = await tokenRequest({
      client_id: this.ctx.config.google.clientId,
      client_secret: this.ctx.config.google.clientSecret,
      refresh_token: this.secret.refreshToken,
      grant_type: "refresh_token",
    });
    this.secret = { ...this.secret, accessToken: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 60) * 1000 };
    this.ctx.db.prepare("UPDATE accounts SET secret_enc = ? WHERE id = ?").run(this.ctx.vault.encryptJson(this.secret), this.accountId);
    return tokens.access_token;
  }

  async request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.token();
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && attempt === 0) {
      await this.token(true);
      return this.request<T>(path, init, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500 || res.status === 403) && attempt < 4) {
      const text = res.status === 403 ? await res.text() : "";
      if (res.status !== 403 || /rateLimitExceeded|userRateLimitExceeded|backendError/i.test(text)) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300));
        return this.request<T>(path, init, attempt + 1);
      }
      throw new Error(`Gmail API error 403: ${text.slice(0, 200)}`);
    }
    if (res.status === 404) {
      const err = new Error("Gmail resource not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) throw new ProviderAuthError("Gmail access was revoked. Reconnect your account.");
      throw new Error(`Gmail API error ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

function charsetOf(part: GmailPart): string {
  const ct = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  return /charset="?([\w.-]+)"?/i.exec(ct)?.[1] ?? "utf-8";
}

function decodeBody(part: GmailPart): string {
  if (!part.body?.data) return "";
  const bytes = Buffer.from(part.body.data, "base64url");
  try {
    return new TextDecoder(charsetOf(part).toLowerCase()).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

export function convertGmailMessage(msg: GmailMessage): IncomingEmail {
  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    const name = h.name.toLowerCase();
    if (CAPTURED_HEADERS.includes(name) && !(name in headers)) headers[name] = name === "subject" || name === "from" ? decodeWords(h.value) : h.value;
  }
  let text = "";
  let html = "";
  const attachments: IncomingEmail["attachments"] = [];
  const walk = (part: GmailPart) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    if (part.filename) {
      attachments.push({ filename: decodeWords(part.filename), contentType: mime, size: part.body?.size ?? 0 });
    } else if (mime === "text/plain" && !text) {
      text = decodeBody(part);
    } else if (mime === "text/html" && !html) {
      html = decodeBody(part);
    } else if (mime === "text/calendar") {
      attachments.push({ filename: "invite.ics", contentType: mime, size: part.body?.size ?? 0 });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  if (msg.payload) walk(msg.payload);
  const from = parseAddress(headers["from"]);
  return {
    providerId: msg.id,
    threadId: msg.threadId,
    messageId: headers["message-id"]?.trim() ?? null,
    from,
    to: parseAddressList(headers["to"]),
    subject: headers["subject"] ?? "",
    date: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(headers["date"] ?? Date.now()),
    text: text || (html ? "" : (msg.snippet ?? "")),
    html: html || null,
    headers,
    attachments,
    labels: msg.labelIds ?? [],
  };
}

const SKIP_LABELS = new Set(["SENT", "DRAFT", "SPAM", "TRASH", "CHAT"]);

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class GmailProvider implements MailProvider {
  private readonly client: GmailClient;

  constructor(
    private readonly ctx: AppContext,
    private readonly accountId: number,
  ) {
    this.client = new GmailClient(ctx, accountId);
  }

  private async fetchMessages(ids: string[], opts: FetchOptions, phase: string): Promise<number> {
    let done = 0;
    const total = ids.length;
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const messages = await mapLimit(chunk, 8, async (id) => {
        try {
          return await this.client.request<GmailMessage>(`/messages/${id}?format=full`);
        } catch (error) {
          if ((error as { status?: number }).status === 404) return null;
          throw error;
        }
      });
      const emails = messages
        .filter((m): m is GmailMessage => !!m && !(m.labelIds ?? []).some((l) => SKIP_LABELS.has(l)))
        .map(convertGmailMessage)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      await opts.onBatch(emails);
      done += chunk.length;
      opts.onProgress(phase, done, total);
    }
    return total;
  }

  private async listIds(query: string, opts: FetchOptions): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: query, maxResults: "500" });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await this.client.request<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params.toString()}`);
      for (const m of page.messages ?? []) if (!opts.isKnown(m.id)) ids.push(m.id);
      pageToken = page.nextPageToken;
      opts.onProgress("listing", ids.length, opts.maxMessages);
    } while (pageToken && ids.length < opts.maxMessages);
    // Oldest first so subscription histories build in order.
    return ids.slice(0, opts.maxMessages).reverse();
  }

  async fetch(opts: FetchOptions): Promise<FetchResult> {
    const profile = await this.client.request<{ historyId: string; emailAddress: string }>("/profile");
    const state = { ...opts.state } as { historyId?: string; backfillDone?: boolean; lastFullSyncAt?: string };
    if (!state.historyId || !state.backfillDone) {
      const after = Math.floor(opts.since.getTime() / 1000);
      const ids = await this.listIds(`after:${after} -in:sent -in:drafts -in:chats`, opts);
      const fetched = await this.fetchMessages(ids, opts, "backfill");
      return { state: { historyId: profile.historyId, backfillDone: true, lastFullSyncAt: new Date().toISOString() }, fetched, backfillDone: true };
    }
    const ids = new Set<string>();
    let latestHistory = state.historyId;
    let pageToken: string | undefined;
    try {
      do {
        const params = new URLSearchParams({ startHistoryId: state.historyId, historyTypes: "messageAdded", maxResults: "500" });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await this.client.request<{
          history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[];
          historyId?: string;
          nextPageToken?: string;
        }>(`/history?${params.toString()}`);
        for (const h of page.history ?? []) {
          for (const added of h.messagesAdded ?? []) {
            const labels = added.message.labelIds ?? [];
            if (labels.some((l) => SKIP_LABELS.has(l))) continue;
            if (!opts.isKnown(added.message.id)) ids.add(added.message.id);
          }
        }
        if (page.historyId) latestHistory = page.historyId;
        pageToken = page.nextPageToken;
      } while (pageToken && ids.size < opts.maxMessages);
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
      // History expired (mailbox idle for a long time): fall back to a time-window listing.
      const after = Math.floor((Date.now() - 3 * 86400000) / 1000);
      const listed = await this.listIds(`after:${after} -in:sent -in:drafts -in:chats`, opts);
      const fetched = await this.fetchMessages(listed, opts, "resync");
      return { state: { ...state, historyId: profile.historyId }, fetched, backfillDone: true };
    }
    const fetched = await this.fetchMessages([...ids], opts, "new mail");
    return { state: { ...state, historyId: latestHistory ?? profile.historyId }, fetched, backfillDone: true };
  }

  async applyLabels(items: { providerId: string; labels: string[] }[]): Promise<void> {
    if (items.length === 0) return;
    const row = this.ctx.db.prepare("SELECT settings FROM accounts WHERE id = ?").get(this.accountId) as { settings: string };
    const settings = parseJson<GmailSettings>(row.settings, {});
    const labelIds = { ...(settings.labelIds ?? {}) };
    const needed = new Set(items.flatMap((i) => i.labels));
    const missing = [...needed].filter((name) => !labelIds[name]);
    if (missing.length) {
      const existing = await this.client.request<{ labels?: { id: string; name: string }[] }>("/labels");
      for (const label of existing.labels ?? []) if (needed.has(label.name)) labelIds[label.name] = label.id;
      for (const name of missing.filter((n) => !labelIds[n])) {
        const created = await this.client.request<{ id: string }>("/labels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
        });
        labelIds[name] = created.id;
      }
      this.ctx.db.prepare("UPDATE accounts SET settings = ? WHERE id = ?").run(JSON.stringify({ ...settings, labelIds }), this.accountId);
    }
    const byLabel = new Map<string, string[]>();
    for (const item of items) for (const name of item.labels) byLabel.set(name, [...(byLabel.get(name) ?? []), item.providerId]);
    for (const [name, ids] of byLabel) {
      for (let i = 0; i < ids.length; i += 900) {
        await this.client.request("/messages/batchModify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + 900), addLabelIds: [labelIds[name]] }),
        }).catch((error: Error) => this.ctx.log.warn("Gmail label update failed", { error: error.message }));
      }
    }
  }
}

/** Sends a notification through a connected Gmail account (requires the gmail.send scope). */
export async function sendViaGmail(ctx: AppContext, accountId: number, from: string, mail: OutgoingMail): Promise<{ id?: string }> {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const info = (await composer.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers })) as unknown as {
    message: Buffer;
  };
  const client = new GmailClient(ctx, accountId);
  const sent = await client.request<{ id: string }>("/messages/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: info.message.toString("base64url") }),
  });
  return { id: sent.id };
}
