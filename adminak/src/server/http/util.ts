import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { z } from "zod";
import type { SessionUser } from "../services/auth.js";

export type AppEnv = { Variables: { user: SessionUser; sessionId: string } };

export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function readJson<T extends z.ZodType>(c: Context, schema: T, maxChars = 1_000_000): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > maxChars * 4) throw new HttpError(413, "Request body too large");
    const text = await c.req.text();
    if (text.length > maxChars) throw new HttpError(413, "Request body too large");
    raw = text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(422, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request", parsed.error.issues.slice(0, 5));
  }
  return parsed.data;
}

export function intParam(c: Context, name: string): number {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value <= 0) throw new HttpError(400, `Invalid ${name}`);
  return value;
}

export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
    const real = c.req.header("x-real-ip") ?? c.req.header("cf-connecting-ip");
    if (real) return real.trim().slice(0, 64);
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/** Fixed-window in-memory rate limiter (single-node personal app). */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string): { ok: boolean; retryAfter: number } {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      if (this.hits.size > 5000) this.prune(now);
      return { ok: true, retryAfter: 0 };
    }
    entry.count++;
    return entry.count > this.limit ? { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) } : { ok: true, retryAfter: 0 };
  }

  /** Seconds until `key` may try again, or 0 when it is under the limit. Does not count as a hit. */
  blocked(key: string): number {
    const entry = this.hits.get(key);
    const now = Date.now();
    if (!entry || entry.reset <= now || entry.count < this.limit) return 0;
    return Math.ceil((entry.reset - now) / 1000);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(now: number) {
    for (const [key, entry] of this.hits) if (entry.reset <= now) this.hits.delete(key);
  }
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: z.string().max(40).optional(),
});

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(","))].join("\n");
}
