import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./schema.js";

export type DB = Database.Database;

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  let current = row ? Number(row.value) : 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
        String(migration.version),
      );
    })();
    current = migration.version;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getMeta(db: DB, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function deleteMeta(db: DB, key: string): void {
  db.prepare("DELETE FROM meta WHERE key = ?").run(key);
}

/** Escapes a user string into a safe FTS5 query: every token is quoted and prefix-matched. */
export function ftsQuery(input: string): string | null {
  const tokens = input
    .normalize("NFKC")
    .replace(/["'*^():]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 12);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" ");
}
