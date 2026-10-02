import { EventEmitter } from "node:events";
import path from "node:path";
import type { AppConfig } from "./config.js";
import { openDatabase, type DB } from "./db/index.js";
import { createLogger, type Logger } from "./logger.js";
import { resolveAppSecret, Vault } from "./security/vault.js";
import { defaultSettings, SettingsService } from "./services/settings.js";

export interface OutgoingMail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface MailTransport {
  readonly name: string;
  send(mail: OutgoingMail): Promise<{ id?: string }>;
}

export interface SyncProgress {
  phase: string;
  done: number;
  total: number;
}

export interface AppContext {
  config: AppConfig;
  db: DB;
  vault: Vault;
  log: Logger;
  settings: SettingsService;
  startedAt: Date;
  version: string;
  now: () => Date;
  bus: EventEmitter;
  runtime: {
    syncing: Set<number>;
    /** Bank connections being refreshed. */
    bankSyncing: Set<number>;
    progress: Map<number, SyncProgress>;
    setupCode: string | null;
    /** Overrides the mail transport (tests, previews). */
    mailOverride: MailTransport | null;
  };
}

export const VERSION = "1.0.0";

export interface ContextOptions {
  dbFile?: string;
  logger?: Logger;
  now?: () => Date;
  secret?: string;
}

export function createContext(config: AppConfig, opts: ContextOptions = {}): AppContext {
  const log = opts.logger ?? createLogger(config.logLevel, "adminak", config.env === "test");
  const { secret, generated } = opts.secret ? { secret: opts.secret, generated: false } : resolveAppSecret(config.dataDir, config.appSecret);
  if (generated) log.warn("Generated a new APP_SECRET in the data directory. Back it up — it encrypts your mailbox credentials.");
  const db = openDatabase(opts.dbFile ?? path.join(config.dataDir, "adminak.db"));
  const settings = new SettingsService(db, defaultSettings({ syncIntervalMinutes: config.syncIntervalMinutes, aiAvailable: !!config.ai }));
  const bus = new EventEmitter();
  bus.setMaxListeners(50);
  return {
    config,
    db,
    vault: new Vault(secret),
    log,
    settings,
    startedAt: new Date(),
    version: VERSION,
    now: opts.now ?? (() => new Date()),
    bus,
    runtime: { syncing: new Set(), bankSyncing: new Set(), progress: new Map(), setupCode: null, mailOverride: null },
  };
}

export function audit(ctx: AppContext, action: string, detail?: string, ip?: string | null): void {
  ctx.db.prepare("INSERT INTO audit_log(at, action, detail, ip) VALUES (?, ?, ?, ?)").run(ctx.now().toISOString(), action, detail ?? null, ip ?? null);
}
