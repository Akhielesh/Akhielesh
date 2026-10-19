import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB_OBJECT, KEY_OBJECT, RemoteBackup, STORE_MARKER_HEADER } from "../src/server/backup.js";
import { loadConfig } from "../src/server/config.js";
import { createLogger, type Logger } from "../src/server/logger.js";
import { DAILY_COPIES, MAX_OBJECT_BYTES, handleBackupRequest, type BackupBucket } from "../worker/backup-store.js";
import { createHarness } from "./helpers.js";

/** An in-memory stand-in for the R2 bucket behind the Worker. */
class MemoryBucket implements BackupBucket {
  objects = new Map<string, Uint8Array>();
  puts: string[] = [];

  async get(key: string) {
    const value = this.objects.get(key);
    return value ? { body: new Response(value).body as ReadableStream, size: value.byteLength } : null;
  }
  async head(key: string) {
    return this.objects.has(key) ? {} : null;
  }
  async put(key: string, value: ArrayBuffer) {
    this.objects.set(key, new Uint8Array(value.slice(0)));
    this.puts.push(key);
  }
  async list({ prefix }: { prefix: string }) {
    return { objects: [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })), truncated: false };
  }
  async delete(keys: string[]) {
    for (const key of keys) this.objects.delete(key);
  }
}

/** A fetch that goes straight into the Worker's store handler, as the container's request would. */
function storeFetch(bucket: BackupBucket, now: () => Date = () => new Date("2026-10-19T12:00:00Z")): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => handleBackupRequest(new Request(String(input), init), bucket, now())) as typeof fetch;
}

const silent = createLogger("error", "test", true);
let dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adminak-backup-"));
  dirs.push(dir);
  return dir;
}

function backupFor(dir: string, fetchFn: typeof fetch, extra: Partial<ConstructorParameters<typeof RemoteBackup>[0]> = {}) {
  return new RemoteBackup({ url: "http://backup.internal", dataDir: dir, intervalSeconds: 60, backsUpKey: true, log: silent, fetch: fetchFn, attempts: 3, retryDelayMs: () => 0, ...extra });
}

function makeDb(dir: string, notes: string[]): Database.Database {
  const db = new Database(path.join(dir, "adminak.db"));
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO notes(body) VALUES (?)");
  for (const note of notes) insert.run(note);
  return db;
}

function readNotes(dir: string): string[] {
  const db = new Database(path.join(dir, "adminak.db"), { readonly: true });
  try {
    return (db.prepare("SELECT body FROM notes ORDER BY id").all() as { body: string }[]).map((r) => r.body);
  } finally {
    db.close();
  }
}

beforeEach(() => {
  dirs = [];
});
afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe("restore", () => {
  it("starts fresh, without creating a database, when nothing is stored yet", async () => {
    const dir = tempDir();
    const result = await backupFor(dir, storeFetch(new MemoryBucket())).restore();
    expect(result).toBe("fresh");
    expect(fs.existsSync(path.join(dir, "adminak.db"))).toBe(false);
  });

  it("brings the database and key back onto an empty disk", async () => {
    const bucket = new MemoryBucket();
    const before = tempDir();
    const db = makeDb(before, ["alpha", "beta"]);
    fs.writeFileSync(path.join(before, "secret.key"), "KEY-123\n");
    const original = backupFor(before, storeFetch(bucket));
    expect(await original.restore()).toBe("kept-local");
    expect(await original.push(db)).toBe("uploaded");
    db.close();

    const after = tempDir(); // a new container: the disk is empty
    expect(await backupFor(after, storeFetch(bucket)).restore()).toBe("restored");
    expect(readNotes(after)).toEqual(["alpha", "beta"]);
    expect(fs.readFileSync(path.join(after, "secret.key"), "utf8")).toBe("KEY-123\n");
    expect(fs.statSync(path.join(after, "secret.key")).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(after, "adminak.db.restoring"))).toBe(false);
  });

  it("leaves a database that is already on disk alone and never asks the store", async () => {
    const dir = tempDir();
    makeDb(dir, ["local"]).close();
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    }) as unknown as typeof fetch;
    expect(await backupFor(dir, counting).restore()).toBe("kept-local");
    expect(calls).toBe(0);
    expect(readNotes(dir)).toEqual(["local"]);
  });

  it("does not use APP_SECRET-managed keys: no key is restored when APP_SECRET is set", async () => {
    const bucket = new MemoryBucket();
    bucket.objects.set(KEY_OBJECT, new TextEncoder().encode("OLD-KEY"));
    const dir = tempDir();
    await backupFor(dir, storeFetch(bucket), { backsUpKey: false }).restore();
    expect(fs.existsSync(path.join(dir, "secret.key"))).toBe(false);
  });

  it("warns loudly when a database comes back without its key", async () => {
    const bucket = new MemoryBucket();
    const source = tempDir();
    const db = makeDb(source, ["x"]);
    await backupFor(source, storeFetch(bucket), { backsUpKey: false }).restore();
    const seeded = backupFor(source, storeFetch(bucket), { backsUpKey: false });
    await seeded.restore();
    await seeded.push(db);
    db.close();
    expect(bucket.objects.has(KEY_OBJECT)).toBe(false);

    const warnings: string[] = [];
    const spy = { ...silent, warn: (message: string) => void warnings.push(message) } as Logger;
    await backupFor(tempDir(), storeFetch(bucket), { log: spy }).restore();
    expect(warnings.some((w) => w.includes("secret.key"))).toBe(true);
  });

  describe("refuses to start rather than risk an empty database over a good copy", () => {
    it("when the store cannot be reached", async () => {
      const dir = tempDir();
      let attempts = 0;
      const down = (async () => {
        attempts += 1;
        throw new Error("connection refused");
      }) as unknown as typeof fetch;
      await expect(backupFor(dir, down).restore()).rejects.toThrow(/unreachable/i);
      expect(attempts).toBe(3);
      expect(fs.existsSync(path.join(dir, "adminak.db"))).toBe(false);
    });

    it("when the store answers with a server error", async () => {
      const dir = tempDir();
      const broken = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
      await expect(backupFor(dir, broken).restore()).rejects.toThrow(/HTTP 500/);
      expect(fs.existsSync(path.join(dir, "adminak.db"))).toBe(false);
    });

    it("when a 404 does not come from the store (misrouted request)", async () => {
      const dir = tempDir();
      const misrouted = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
      await expect(backupFor(dir, misrouted).restore()).rejects.toThrow(/unreachable/i);
    });

    it("when the stored copy is not valid gzip", async () => {
      const dir = tempDir();
      const garbage = (async () => new Response(Buffer.from("this is not gzip"), { status: 200 })) as unknown as typeof fetch;
      await expect(backupFor(dir, garbage).restore()).rejects.toThrow();
      expect(fs.existsSync(path.join(dir, "adminak.db"))).toBe(false);
    });

    it("when the stored copy is not a sound database, and leaves nothing behind", async () => {
      const dir = tempDir();
      const notSqlite = (async () => new Response(zlib.gzipSync(Buffer.from("definitely not a sqlite file".repeat(200))), { status: 200 })) as unknown as typeof fetch;
      await expect(backupFor(dir, notSqlite).restore()).rejects.toThrow(/damaged/i);
      expect(fs.readdirSync(dir)).toEqual([]);
    });
  });
});

describe("push", () => {
  it("never uploads before restore has finished", async () => {
    const bucket = new MemoryBucket();
    const dir = tempDir();
    const db = makeDb(dir, ["x"]);
    await expect(backupFor(dir, storeFetch(bucket)).push(db)).rejects.toThrow(/not ready/i);
    expect(bucket.puts).toEqual([]);
    db.close();
  });

  it("uploads only when something changed", async () => {
    const bucket = new MemoryBucket();
    const dir = tempDir();
    const db = makeDb(dir, ["one"]);
    const backup = backupFor(dir, storeFetch(bucket), { backsUpKey: false });
    await backup.restore();

    expect(await backup.push(db)).toBe("uploaded");
    const afterFirst = bucket.puts.length;
    expect(await backup.push(db)).toBe("unchanged");
    expect(bucket.puts.length).toBe(afterFirst);

    db.prepare("INSERT INTO notes(body) VALUES ('two')").run();
    expect(await backup.push(db)).toBe("uploaded");

    const restored = tempDir();
    await backupFor(restored, storeFetch(bucket), { backsUpKey: false }).restore();
    expect(readNotes(restored)).toEqual(["one", "two"]);
    db.close();
  });

  it("serialises overlapping uploads", async () => {
    const bucket = new MemoryBucket();
    const dir = tempDir();
    const db = makeDb(dir, ["one"]);
    const backup = backupFor(dir, storeFetch(bucket), { backsUpKey: false });
    await backup.restore();
    const [a, b] = await Promise.all([backup.push(db), backup.push(db)]);
    expect([a, b]).toEqual(["uploaded", "unchanged"]);
    db.close();
  });

  it("uploads the key once, and again only if it changes", async () => {
    const bucket = new MemoryBucket();
    const dir = tempDir();
    const db = makeDb(dir, ["one"]);
    fs.writeFileSync(path.join(dir, "secret.key"), "KEY-A\n");
    const backup = backupFor(dir, storeFetch(bucket));
    await backup.restore();
    await backup.push(db);
    expect(bucket.puts.filter((k) => k === KEY_OBJECT)).toHaveLength(1);

    db.prepare("INSERT INTO notes(body) VALUES ('two')").run();
    await backup.push(db);
    expect(bucket.puts.filter((k) => k === KEY_OBJECT)).toHaveLength(1);

    fs.writeFileSync(path.join(dir, "secret.key"), "KEY-B\n");
    await backup.push(db);
    expect(bucket.puts.filter((k) => k === KEY_OBJECT)).toHaveLength(2);
    expect(Buffer.from(bucket.objects.get(KEY_OBJECT)!).toString()).toBe("KEY-B\n");
    db.close();
  });

  it("does not leave its working snapshot behind, even when the upload fails", async () => {
    const dir = tempDir();
    const db = makeDb(dir, ["one"]);
    const refusing = (async (_url: string | URL | Request, init?: RequestInit) => (init?.method === "PUT" ? new Response(null, { status: 503 }) : new Response(null, { status: 404, headers: { [STORE_MARKER_HEADER]: "1" } }))) as unknown as typeof fetch;
    const backup = backupFor(dir, refusing, { backsUpKey: false });
    await backup.restore();
    await expect(backup.push(db)).rejects.toThrow(/HTTP 503/);
    expect(fs.existsSync(path.join(dir, ".backup-snapshot.db"))).toBe(false);
    db.close();
  });

  it("round-trips a real Adminak database, and the job shows up on the System page", async () => {
    const bucket = new MemoryBucket();
    const h = createHarness();
    const dir = tempDir();
    const backup = backupFor(dir, storeFetch(bucket), { backsUpKey: false });
    await backup.restore();
    h.ctx.db.prepare("INSERT INTO meta(key, value) VALUES ('backup-test', 'hello')").run();

    const handle = backup.start(h.ctx);
    await handle.flush();
    handle.stop();

    const restored = tempDir();
    await backupFor(restored, storeFetch(bucket), { backsUpKey: false }).restore();
    const copy = new Database(path.join(restored, "adminak.db"), { readonly: true });
    expect((copy.prepare("SELECT value FROM meta WHERE key = 'backup-test'").get() as { value: string }).value).toBe("hello");
    expect(copy.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()).toBeTruthy();
    copy.close();
  });
});

describe("backup store (the Worker side)", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("answers every request with the marker header, including 404s", async () => {
    const bucket = new MemoryBucket();
    for (const [method, url] of [
      ["GET", "http://backup.internal/adminak.db.gz"],
      ["GET", "http://backup.internal/nope"],
      ["DELETE", "http://backup.internal/adminak.db.gz"],
    ] as const) {
      const res = await handleBackupRequest(new Request(url, { method }), bucket);
      expect(res.headers.get(STORE_MARKER_HEADER)).toBe("1");
    }
  });

  it("serves only its two objects and only GET and PUT", async () => {
    const bucket = new MemoryBucket();
    expect((await handleBackupRequest(new Request("http://backup.internal/daily/x"), bucket)).status).toBe(404);
    expect((await handleBackupRequest(new Request("http://backup.internal/../secret"), bucket)).status).toBe(404);
    expect((await handleBackupRequest(new Request(`http://backup.internal/${DB_OBJECT}`, { method: "DELETE" }), bucket)).status).toBe(405);
    expect((await handleBackupRequest(new Request(`http://backup.internal/${DB_OBJECT}`), bucket)).status).toBe(404);
  });

  it("rejects empty and oversized uploads without storing anything", async () => {
    const bucket = new MemoryBucket();
    const empty = await handleBackupRequest(new Request(`http://backup.internal/${DB_OBJECT}`, { method: "PUT", body: new Uint8Array(0) }), bucket);
    expect(empty.status).toBe(400);
    const huge = await handleBackupRequest(new Request(`http://backup.internal/${DB_OBJECT}`, { method: "PUT", body: bytes("x"), headers: { "content-length": String(MAX_OBJECT_BYTES + 1) } }), bucket);
    expect(huge.status).toBe(413);
    expect(bucket.puts).toEqual([]);
  });

  it("keeps one dated copy per day and the last 14 days", async () => {
    const bucket = new MemoryBucket();
    const put = (day: number, text: string) =>
      handleBackupRequest(new Request(`http://backup.internal/${DB_OBJECT}`, { method: "PUT", body: bytes(text) }), bucket, new Date(Date.UTC(2026, 9, day, 12)));

    await put(1, "first");
    await put(1, "second"); // same day: the dated copy is not rewritten
    expect(Buffer.from(bucket.objects.get("daily/2026-10-01.db.gz")!).toString()).toBe("first");
    expect(Buffer.from(bucket.objects.get(DB_OBJECT)!).toString()).toBe("second");

    for (let day = 2; day <= 20; day++) await put(day, `day-${day}`);
    const daily = [...bucket.objects.keys()].filter((k) => k.startsWith("daily/")).sort();
    expect(daily).toHaveLength(DAILY_COPIES);
    expect(daily[0]).toBe("daily/2026-10-07.db.gz");
    expect(daily.at(-1)).toBe("daily/2026-10-20.db.gz");
  });
});

describe("configuration", () => {
  const base = { NODE_ENV: "test", APP_URL: "http://localhost:8787" } as NodeJS.ProcessEnv;

  it("is off unless BACKUP_URL is set", () => {
    expect(loadConfig(base).backup).toBeUndefined();
  });

  it("trims a trailing slash and defaults to a one-minute interval", () => {
    expect(loadConfig({ ...base, BACKUP_URL: "http://backup.internal/" }).backup).toEqual({ url: "http://backup.internal", intervalSeconds: 60 });
  });

  it("rejects an interval that would hammer the store or never run", () => {
    expect(() => loadConfig({ ...base, BACKUP_URL: "http://b", BACKUP_INTERVAL_SECONDS: "1" })).toThrow();
    expect(() => loadConfig({ ...base, BACKUP_URL: "http://b", BACKUP_INTERVAL_SECONDS: "99999" })).toThrow();
    expect(loadConfig({ ...base, BACKUP_URL: "http://b", BACKUP_INTERVAL_SECONDS: "120" }).backup?.intervalSeconds).toBe(120);
  });
});
