import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { AppContext } from "../context.js";
import type { IncomingEmail } from "../intel/types.js";
import { CAPTURED_HEADERS, decodeWords } from "./mime.js";
import { ProviderAuthError, type FetchOptions, type FetchResult, type ImapSettings, type MailProvider } from "./types.js";

export const IMAP_PRESETS: Record<string, { label: string; host: string; port: number; secure: boolean; folders: string[]; help: string }> = {
  gmail: {
    label: "Gmail (app password)",
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    folders: ["INBOX"],
    help: "Turn on 2-Step Verification, then create an App Password at myaccount.google.com/apppasswords.",
  },
  icloud: {
    label: "iCloud Mail",
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    folders: ["INBOX"],
    help: "Create an app-specific password at account.apple.com → Sign-In and Security.",
  },
  outlook: {
    label: "Outlook / Microsoft 365",
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    folders: ["INBOX"],
    help: "Requires IMAP enabled and an app password (work accounts may need admin approval).",
  },
  yahoo: {
    label: "Yahoo Mail",
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    folders: ["INBOX"],
    help: "Generate an app password in Yahoo Account Security.",
  },
  fastmail: { label: "Fastmail", host: "imap.fastmail.com", port: 993, secure: true, folders: ["INBOX"], help: "Create an app password under Settings → Privacy & Security." },
  zoho: { label: "Zoho Mail", host: "imap.zoho.com", port: 993, secure: true, folders: ["INBOX"], help: "Enable IMAP access and use an app-specific password." },
  proton: {
    label: "Proton Mail (Bridge)",
    host: "127.0.0.1",
    port: 1143,
    secure: false,
    folders: ["INBOX"],
    help: "Run Proton Mail Bridge on the same machine and use the bridge password.",
  },
  custom: { label: "Other IMAP server", host: "", port: 993, secure: true, folders: ["INBOX"], help: "Use your provider's IMAP host, port and an app password." },
};

function makeClient(settings: ImapSettings, user: string, password: string): ImapFlow {
  return new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user, pass: password },
    logger: false,
    socketTimeout: 90_000,
    disableAutoIdle: true,
  });
}

function asAuthError(error: unknown): Error {
  const err = error as { authenticationFailed?: boolean; responseText?: string; message?: string };
  if (err?.authenticationFailed) return new ProviderAuthError(`IMAP login failed: ${err.responseText ?? "check the username and app password"}`);
  return error instanceof Error ? error : new Error(String(error));
}

export async function testImapConnection(settings: ImapSettings, user: string, password: string): Promise<{ ok: true; folders: string[] } | { ok: false; error: string }> {
  const client = makeClient(settings, user, password);
  try {
    await client.connect();
    const list = await client.list();
    return { ok: true, folders: list.map((f) => f.path).slice(0, 200) };
  } catch (error) {
    return { ok: false, error: asAuthError(error).message };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

function addressOf(value: AddressObject | AddressObject[] | undefined): { name: string | null; address: string | null } {
  const first = Array.isArray(value) ? value[0] : value;
  const entry = first?.value?.[0];
  return { name: entry?.name ? decodeWords(entry.name) : null, address: entry?.address?.toLowerCase() ?? null };
}

function addressList(value: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((a) => a.value.map((v) => v.address?.toLowerCase() ?? "")).filter(Boolean);
}

export async function parseRawEmail(source: Buffer | string, providerId: string, fallbackDate?: Date, labels: string[] = []): Promise<IncomingEmail> {
  const parsed = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
  const headers: Record<string, string> = {};
  for (const line of parsed.headerLines ?? []) {
    const key = line.key.toLowerCase();
    if (!CAPTURED_HEADERS.includes(key) || key in headers) continue;
    headers[key] = line.line.slice(line.line.indexOf(":") + 1).replace(/\r?\n[ \t]+/g, " ").trim();
  }
  return {
    providerId,
    threadId: null,
    messageId: parsed.messageId ?? null,
    from: addressOf(parsed.from),
    to: addressList(parsed.to),
    subject: parsed.subject ?? "",
    date: parsed.date ?? fallbackDate ?? new Date(),
    text: parsed.text ?? "",
    html: typeof parsed.html === "string" ? parsed.html : null,
    headers,
    attachments: (parsed.attachments ?? []).slice(0, 20).map((a) => ({ filename: a.filename ?? "attachment", contentType: a.contentType, size: a.size })),
    labels,
  };
}

export class ImapProvider implements MailProvider {
  constructor(
    private readonly ctx: AppContext,
    private readonly settings: ImapSettings,
    private readonly user: string,
    private readonly password: string,
  ) {}

  async fetch(opts: FetchOptions): Promise<FetchResult> {
    const client = makeClient(this.settings, this.user, this.password);
    try {
      await client.connect();
    } catch (error) {
      throw asAuthError(error);
    }
    const state = { ...(opts.state as { folders?: Record<string, { uidValidity: string; lastUid: number }> }) };
    const folders = { ...(state.folders ?? {}) };
    let fetched = 0;
    try {
      for (const folder of this.settings.folders?.length ? this.settings.folders : ["INBOX"]) {
        const lock = await client.getMailboxLock(folder);
        try {
          const mailbox = client.mailbox;
          if (!mailbox) continue;
          const validity = String(mailbox.uidValidity);
          const previous = folders[folder];
          let uids: number[] = [];
          if (!previous || previous.uidValidity !== validity) {
            uids = (await client.search({ since: opts.since }, { uid: true })) || [];
          } else if (mailbox.uidNext > previous.lastUid + 1) {
            uids = ((await client.search({ uid: `${previous.lastUid + 1}:*` }, { uid: true })) || []).filter((u) => u > previous.lastUid);
          }
          uids = uids.sort((a, b) => a - b);
          const pending = uids.filter((uid) => !opts.isKnown(`${folder}:${validity}:${uid}`)).slice(-opts.maxMessages);
          let lastUid = previous?.uidValidity === validity ? previous.lastUid : 0;
          let done = 0;
          for (let i = 0; i < pending.length; i += 25) {
            const chunk = pending.slice(i, i + 25);
            const emails: IncomingEmail[] = [];
            for await (const msg of client.fetch(chunk.join(","), { uid: true, source: { maxLength: 2_000_000 }, internalDate: true, labels: true }, { uid: true })) {
              if (!msg.source) continue;
              const internal = msg.internalDate ? new Date(msg.internalDate) : undefined;
              try {
                emails.push(await parseRawEmail(msg.source, `${folder}:${validity}:${msg.uid}`, internal, msg.labels ? [...msg.labels] : []));
              } catch (error) {
                this.ctx.log.warn("Could not parse message", { folder, uid: msg.uid, error: (error as Error).message });
              }
            }
            emails.sort((a, b) => a.date.getTime() - b.date.getTime());
            await opts.onBatch(emails);
            lastUid = Math.max(lastUid, ...chunk);
            done += chunk.length;
            fetched += chunk.length;
            folders[folder] = { uidValidity: validity, lastUid };
            opts.onProgress(previous ? "new mail" : "backfill", done, pending.length);
          }
          if (uids.length) lastUid = Math.max(lastUid, uids[uids.length - 1]!);
          folders[folder] = { uidValidity: validity, lastUid };
        } finally {
          lock.release();
        }
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return { state: { ...state, folders }, fetched, backfillDone: true };
  }

  async applyLabels(items: { providerId: string; labels: string[] }[]): Promise<void> {
    if (!/imap\.gmail\.com$/i.test(this.settings.host) || items.length === 0) return;
    const client = makeClient(this.settings, this.user, this.password);
    await client.connect();
    try {
      const byFolder = new Map<string, { uid: number; labels: string[] }[]>();
      for (const item of items) {
        const [folder, , uid] = item.providerId.split(":");
        if (!folder || !uid) continue;
        byFolder.set(folder, [...(byFolder.get(folder) ?? []), { uid: Number(uid), labels: item.labels }]);
      }
      for (const [folder, list] of byFolder) {
        const lock = await client.getMailboxLock(folder);
        try {
          for (const entry of list) await client.messageFlagsAdd(String(entry.uid), entry.labels, { uid: true, useLabels: true });
        } finally {
          lock.release();
        }
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}
