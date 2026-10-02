import fs from "node:fs";
import { z } from "zod";

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.trim().toLowerCase())));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default("0.0.0.0"),
  APP_URL: optionalString,
  SITE_DASHBOARD_URL: optionalString,
  DATA_DIR: z.string().default("./data"),
  APP_SECRET: optionalString,
  ADMIN_EMAIL: optionalString,
  ADMIN_PASSWORD: optionalString,
  ADMIN_NAME: optionalString,
  TRUST_PROXY: bool.default(false),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  TELLER_APPLICATION_ID: optionalString,
  TELLER_ENVIRONMENT: z.enum(["sandbox", "development", "production"]).default("development"),
  TELLER_CERTIFICATE: optionalString,
  TELLER_PRIVATE_KEY: optionalString,
  TELLER_CERTIFICATE_FILE: optionalString,
  TELLER_PRIVATE_KEY_FILE: optionalString,
  SIMPLEFIN_HOSTS: z.string().default("bridge.simplefin.org,beta-bridge.simplefin.org"),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: bool.default(true),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  NOTIFY_EMAIL: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL: z.string().default("claude-opus-5-5"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DISABLE_SCHEDULER: bool.default(false),
  WEB_DIST: optionalString,
});

export interface AppConfig {
  env: "development" | "production" | "test";
  port: number;
  host: string;
  appUrl: string;
  /** Path prefix the console is served under, from APP_URL's path ("" at the root, "/adminak" on akhielesh.com). */
  basePath: string;
  /** Optional link to a sibling dashboard (the akhielesh.com site analytics), shown in the navigation. */
  siteDashboardUrl?: string;
  secureCookies: boolean;
  dataDir: string;
  appSecret?: string;
  admin?: { email: string; password: string; name: string };
  trustProxy: boolean;
  google?: { clientId: string; clientSecret: string };
  /** Teller (bank connections, e.g. Capital One): app id plus the mTLS client certificate Teller issues. */
  teller?: { applicationId: string; environment: "sandbox" | "development" | "production"; certificate: string | null; privateKey: string | null };
  /** Hosts a SimpleFIN setup token may point at (the token decodes to a URL Adminak calls). */
  simplefinHosts: string[];
  smtp?: { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
  notifyEmail?: string;
  ai?: { apiKey: string; model: string };
  aiModel: string;
  syncIntervalMinutes: number;
  logLevel: "debug" | "info" | "warn" | "error";
  disableScheduler: boolean;
  webDist?: string;
}

/**
 * A PEM from an env var (raw, with literal \n escapes, or base64 of the PEM) or from a file path.
 * Railway variables can't hold real newlines reliably, so all three spellings are accepted.
 */
function pem(value: string | undefined, file: string | undefined): string | null {
  if (file) return fs.readFileSync(file, "utf8");
  if (!value) return null;
  const text = value.includes("-----BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
  return text.replace(/\\n/g, "\n");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  const appUrl = (e.APP_URL ?? `http://localhost:${e.PORT}`).replace(/\/+$/, "");
  const basePath = new URL(appUrl).pathname.replace(/\/+$/, "");
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    appUrl,
    basePath,
    siteDashboardUrl: e.SITE_DASHBOARD_URL,
    secureCookies: appUrl.startsWith("https://"),
    dataDir: e.DATA_DIR,
    appSecret: e.APP_SECRET,
    admin:
      e.ADMIN_EMAIL && e.ADMIN_PASSWORD
        ? { email: e.ADMIN_EMAIL, password: e.ADMIN_PASSWORD, name: e.ADMIN_NAME ?? e.ADMIN_EMAIL.split("@")[0]! }
        : undefined,
    trustProxy: e.TRUST_PROXY,
    google:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }
        : undefined,
    teller: e.TELLER_APPLICATION_ID
      ? {
          applicationId: e.TELLER_APPLICATION_ID,
          environment: e.TELLER_ENVIRONMENT,
          certificate: pem(e.TELLER_CERTIFICATE, e.TELLER_CERTIFICATE_FILE),
          privateKey: pem(e.TELLER_PRIVATE_KEY, e.TELLER_PRIVATE_KEY_FILE),
        }
      : undefined,
    simplefinHosts: e.SIMPLEFIN_HOSTS.split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          user: e.SMTP_USER,
          pass: e.SMTP_PASS,
          from: e.SMTP_FROM ?? (e.SMTP_USER ? `Adminak <${e.SMTP_USER}>` : "Adminak <adminak@localhost>"),
        }
      : undefined,
    notifyEmail: e.NOTIFY_EMAIL,
    ai: e.ANTHROPIC_API_KEY ? { apiKey: e.ANTHROPIC_API_KEY, model: e.AI_MODEL } : undefined,
    aiModel: e.AI_MODEL,
    syncIntervalMinutes: e.SYNC_INTERVAL_MINUTES,
    logLevel: e.LOG_LEVEL,
    disableScheduler: e.DISABLE_SCHEDULER,
    webDist: e.WEB_DIST,
  };
}
