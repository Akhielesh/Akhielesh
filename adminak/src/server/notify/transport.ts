import fs from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import type { AppContext, MailTransport, OutgoingMail } from "../context.js";
import { parseJson } from "../db/index.js";
import { sendViaGmail } from "../ingest/gmail.js";

export const NOTIFICATION_HEADERS = {
  "X-Adminak-Notification": "1",
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "All",
};

let smtp: { key: string; transporter: Transporter } | null = null;

function smtpTransport(ctx: AppContext): MailTransport | null {
  const cfg = ctx.config.smtp;
  if (!cfg) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.user ?? ""}`;
  if (!smtp || smtp.key !== key) {
    smtp = {
      key,
      transporter: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
        connectionTimeout: 20_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  const transporter = smtp.transporter;
  return {
    name: `smtp (${cfg.host})`,
    async send(mail: OutgoingMail) {
      const info = await transporter.sendMail({
        from: cfg.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: { ...NOTIFICATION_HEADERS, ...mail.headers },
      });
      return { id: info.messageId };
    },
  };
}

function gmailTransport(ctx: AppContext): MailTransport | null {
  const accounts = ctx.db.prepare("SELECT id, email, settings FROM accounts WHERE provider = 'gmail' AND status != 'error' ORDER BY id").all() as {
    id: number;
    email: string;
    settings: string;
  }[];
  const sender = accounts.find((a) => (parseJson<{ scopes?: string[] }>(a.settings, {}).scopes ?? []).some((s) => s.endsWith("/gmail.send")));
  if (!sender) return null;
  return {
    name: `gmail (${sender.email})`,
    send: (mail) => sendViaGmail(ctx, sender.id, `Adminak <${sender.email}>`, { ...mail, headers: { ...NOTIFICATION_HEADERS, ...mail.headers } }),
  };
}

/** Last resort so nothing is lost: renders emails into DATA_DIR/outbox for inspection. */
function outboxTransport(ctx: AppContext): MailTransport {
  return {
    name: "outbox",
    async send(mail: OutgoingMail) {
      const dir = path.join(ctx.config.dataDir, "outbox");
      fs.mkdirSync(dir, { recursive: true });
      const slug = mail.subject.replace(/[^\w]+/g, "-").slice(0, 60);
      const file = path.join(dir, `${ctx.now().toISOString().replace(/[:.]/g, "-")}-${slug}.html`);
      fs.writeFileSync(file, mail.html);
      // Keep the outbox small.
      const files = fs.readdirSync(dir).sort();
      for (const old of files.slice(0, Math.max(0, files.length - 50))) fs.rmSync(path.join(dir, old), { force: true });
      return { id: `outbox:${path.basename(file)}` };
    },
  };
}

export function emailTransport(ctx: AppContext): MailTransport {
  return ctx.runtime.mailOverride ?? smtpTransport(ctx) ?? gmailTransport(ctx) ?? outboxTransport(ctx);
}

export function emailConfigured(ctx: AppContext): boolean {
  return !!ctx.runtime.mailOverride || !!ctx.config.smtp || !!gmailTransport(ctx);
}

export async function verifySmtp(ctx: AppContext): Promise<{ ok: boolean; error?: string }> {
  const t = smtpTransport(ctx);
  if (!t || !smtp) return { ok: false, error: "SMTP is not configured" };
  try {
    await smtp.transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
