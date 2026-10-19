import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import type { AppContext } from "./context.js";
import type { DB } from "./db/index.js";
import { runJob } from "./jobs/scheduler.js";
import type { Logger } from "./logger.js";

/**
 * Off-disk copy of the data directory, for hosts whose disk is wiped on every restart
 * (Cloudflare Containers). Enabled by BACKUP_URL; without it nothing here runs.
 *
 * The remote side is a tiny HTTP store (worker/backup-store.ts, backed by R2):
 *   GET/PUT {BACKUP_URL}/adminak.db.gz   the database, gzipped
 *   GET/PUT {BACKUP_URL}/secret.key      the generated APP_SECRET (skipped when APP_SECRET is set)
 *
 * The rule that keeps the data safe: nothing is ever uploaded until restore() has finished. If the
 * remote cannot be reached, or answers with anything but a clear "nothing stored yet", startup fails
 * instead of creating an empty database that would later overwrite the good copy.
 */

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const DB_OBJECT = "adminak.db.gz";
export const KEY_OBJECT = "secret.key";
/** Every response from the store carries this, so a misrouted request that happens to 404 is not read as "empty". */
export const STORE_MARKER_HEADER = "x-adminak-backup";

export type RestoreOutcome = "kept-local" | "restored" | "fresh";
export type PushOutcome = "uploaded" | "unchanged";

export interface RemoteBackupOptions {
  url: string;
  dataDir: string;
  intervalSeconds: number;
  /** True when the key lives in dataDir (no APP_SECRET in the environment), so it must travel with the database. */
  backsUpKey: boolean;
  log: Logger;
  fetch?: typeof fetch;
  /** Attempts per request before giving up (default 6). */
  attempts?: number;
  /** Wait before retry number `attempt` (1-based), in ms. Tests set this to 0. */
  retryDelayMs?: (attempt: number) => number;
}

export interface BackupHandle {
  stop(): void;
  /** One last upload, for shutdown. Waits for an upload already running. */
  flush(): Promise<void>;
}

export class RemoteBackup {
  private ready = false;
  private lastChanges = -1;
  private lastKeyHash = "";
  private queue: Promise<unknown> = Promise.resolve();
  private readonly fetchFn: typeof fetch;
  private readonly attempts: number;
  private readonly delay: (attempt: number) => number;

  constructor(private readonly opts: RemoteBackupOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.attempts = opts.attempts ?? 6;
    this.delay = opts.retryDelayMs ?? ((attempt) => Math.min(1000 * 2 ** (attempt - 1), 15_000));
  }

  private get dbFile(): string {
    return path.join(this.opts.dataDir, "adminak.db");
  }

  private get keyFile(): string {
    return path.join(this.opts.dataDir, "secret.key");
  }

  /** Brings the data directory back from the remote copy when the disk is empty. Call before opening the database. */
  async restore(): Promise<RestoreOutcome> {
    if (fs.existsSync(this.dbFile)) {
      this.ready = true;
      return "kept-local";
    }
    fs.mkdirSync(this.opts.dataDir, { recursive: true });

    let outcome: RestoreOutcome = "fresh";
    const packed = await this.get(DB_OBJECT);
    if (packed) {
      const bytes = await gunzip(packed);
      const staging = `${this.dbFile}.restoring`;
      fs.writeFileSync(staging, bytes, { mode: 0o600 });
      try {
        assertSound(staging, "integrity_check");
      } catch (error) {
        fs.rmSync(staging, { force: true });
        throw new Error(`The stored database copy is damaged, so it was not used: ${(error as Error).message}`);
      }
      fs.renameSync(staging, this.dbFile);
      outcome = "restored";
    }

    if (this.opts.backsUpKey && !fs.existsSync(this.keyFile)) {
      const key = await this.get(KEY_OBJECT);
      if (key) fs.writeFileSync(this.keyFile, key, { mode: 0o600 });
      else if (outcome === "restored") {
        this.opts.log.warn("Restored the database but found no stored secret.key — saved mailbox and bank credentials cannot be decrypted. Reconnect them, or set APP_SECRET to the old value.");
      }
    }

    this.ready = true;
    return outcome;
  }

  /** Uploads a consistent copy of the live database (and the key) when something changed since the last upload. */
  push(db: DB): Promise<PushOutcome> {
    const run = this.queue.then(
      () => this.pushNow(db),
      () => this.pushNow(db),
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async pushNow(db: DB): Promise<PushOutcome> {
    if (!this.ready) throw new Error("Backup is not ready: restore() has not completed.");
    const changes = (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
    const keyHash = this.opts.backsUpKey ? hashFile(this.keyFile) : "";
    if (changes === this.lastChanges && keyHash === this.lastKeyHash) return "unchanged";

    const snapshot = path.join(this.opts.dataDir, ".backup-snapshot.db");
    fs.rmSync(snapshot, { force: true });
    try {
      await db.backup(snapshot);
      assertSound(snapshot, "quick_check");
      const packed = await gzip(fs.readFileSync(snapshot), { level: 6 });
      await this.put(DB_OBJECT, packed, "application/gzip");
      if (keyHash && keyHash !== this.lastKeyHash) await this.put(KEY_OBJECT, fs.readFileSync(this.keyFile), "text/plain");
    } finally {
      fs.rmSync(snapshot, { force: true });
    }
    // `changes` was read before the snapshot, so writes that landed during it trigger the next upload.
    this.lastChanges = changes;
    this.lastKeyHash = keyHash;
    return "uploaded";
  }

  /** Schedules uploads; the outcome of each shows up on the System page like any other job. */
  start(ctx: AppContext): BackupHandle {
    const tick = () => void runJob(ctx, "backup", () => this.push(ctx.db));
    const first = setTimeout(tick, 5_000);
    const interval = setInterval(tick, this.opts.intervalSeconds * 1000);
    first.unref?.();
    interval.unref?.();
    return {
      stop: () => {
        clearTimeout(first);
        clearInterval(interval);
      },
      flush: async () => {
        await this.push(ctx.db);
      },
    };
  }

  private async get(name: string): Promise<Buffer | null> {
    return this.retrying(`GET ${name}`, async () => {
      const res = await this.fetchFn(`${this.opts.url}/${name}`);
      if (res.status === 404 && res.headers.get(STORE_MARKER_HEADER) === "1") {
        await res.arrayBuffer().catch(() => undefined);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });
  }

  private async put(name: string, body: Buffer, type: string): Promise<void> {
    await this.retrying(`PUT ${name}`, async () => {
      const res = await this.fetchFn(`${this.opts.url}/${name}`, { method: "PUT", body, headers: { "content-type": type } });
      await res.arrayBuffer().catch(() => undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
  }

  private async retrying<T>(what: string, fn: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        last = error;
        this.opts.log.warn(`Backup request failed: ${what}`, { attempt, error: (error as Error).message });
        if (attempt < this.attempts) await sleep(this.delay(attempt));
      }
    }
    throw new Error(`Backup store unreachable (${what}): ${(last as Error).message}`);
  }
}

function assertSound(file: string, pragma: "integrity_check" | "quick_check"): void {
  const probe = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = probe.pragma(pragma, { simple: true });
    if (result !== "ok") throw new Error(`${pragma} reported ${String(result)}`);
  } finally {
    probe.close();
  }
}

function hashFile(file: string): string {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
